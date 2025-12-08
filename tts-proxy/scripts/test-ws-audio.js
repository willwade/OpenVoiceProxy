const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const ProxyServer = require('../src/proxy-server');

async function run() {
    const port = 3010; // avoid conflicts with a running instance
    const outFile = path.join(__dirname, '..', 'ws-test.wav');

    // Force the proxy to bind to our chosen port (config otherwise defaults to 3000)
    process.env.PORT = String(port);
    process.env.HTTP_PORT = String(port);

    const proxy = new ProxyServer(port);
    // Force port after config override logic
    proxy.port = port;
    if (proxy.configManager?.config?.network) {
        proxy.configManager.config.network.port = port;
    }

    await proxy.start();
    console.log(`✅ Proxy server started on port ${proxy.port}`);

    let meta = null;
    const audioParts = [];

    await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${proxy.port}/api/ws?api_key=dev`);
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for audio')), 20000);

        ws.on('open', () => {
            console.log('🌐 WS connected, sending speak command...');
            ws.send(JSON.stringify({
                type: 'speak',
                text: 'Hello from the WebSocket audio test.',
                engine: 'azure',            // use Azure voice for higher quality
                voice: 'en-US-JennyNeural',
                format: 'wav',              // keep WAV so the output is playable directly
                sample_rate: 24000,
                stream: true,
                chunk_size: 32000
            }));
        });

        ws.on('message', (data) => {
            // Try to parse JSON first (meta may arrive as text or buffer)
            const asBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const asText = asBuffer.toString('utf8');
            let parsed = null;
            try {
                parsed = JSON.parse(asText);
            } catch {
                // not JSON, treat as audio
            }

            if (parsed && parsed.type === 'meta') {
                meta = parsed;
                console.log('ℹ️  Meta received:', meta);
                return;
            }

            if (parsed && parsed.type === 'end') {
                console.log('ℹ️  End received:', parsed);
                clearTimeout(timeout);
                ws.close();
                resolve();
                return;
            } else if (parsed && parsed.type) {
                console.log('ℹ️  Non-audio JSON message:', parsed);
                return;
            } else {
                audioParts.push(asBuffer);
                console.log(`🎧 Received audio buffer: ${asBuffer.length} bytes (total parts: ${audioParts.length})`);
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        ws.on('close', () => {
            if (!audioParts.length) {
                clearTimeout(timeout);
                reject(new Error('WebSocket closed before audio was received'));
            }
        });
    });

    const audio = Buffer.concat(audioParts);
    fs.writeFileSync(outFile, audio);
    console.log(`✅ Saved audio to ${outFile}`);
    if (meta?.sample_rate) {
        console.log(`   Sample rate: ${meta.sample_rate} Hz, format: ${meta.format || 'unknown'}`);
    }

    await proxy.stop();
    console.log('🛑 Proxy stopped. Play the WAV file with your preferred audio player.');
}

run().catch(async (err) => {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
});
