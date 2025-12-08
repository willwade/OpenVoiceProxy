# OpenVoiceProxy

A secure, cloud-ready proxy server that intercepts ElevenLabs API calls and redirects them to various TTS engines. Designed for production deployment on DigitalOcean App Platform with comprehensive security, monitoring, and key management features.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd tts-proxy
   npm install
   ```

2. **Start the proxy:**
   ```bash
   npm start
   ```

3. **Test the proxy:**
   ```bash
   npm test
   ```

## What it does

- **Intercepts ElevenLabs API calls** from Grid3
- **Provides compatible API endpoints:**
  - `GET /v1/voices` - Returns available local voices
  - `POST /v1/text-to-speech/{voiceId}/stream/with-timestamps` - Generates speech
  - `GET /v1/user` - Returns user/subscription info
- **System tray integration** for easy management
- **Configuration UI** for voice mapping and settings

## Current Status

✅ **Basic proxy server** - Working
✅ **ElevenLabs API endpoints** - Full implementation
✅ **System tray integration** - Working
✅ **Configuration UI** - Basic version
✅ **js-tts-wrapper integration** - Working (eSpeak, Azure, ElevenLabs)
✅ **Host file modification** - Utility ready
✅ **Real audio generation** - Working
✅ **Voice discovery & mapping** - Automated
✅ **Grid3 simulation** - Complete testing suite
✅ **Configuration management** - JSON-based config

## Testing

### 1. Start the Proxy Server
```bash
# Double-click or run:
start-proxy.bat
```

### 2. Test the Endpoints
```bash
# In another terminal, double-click or run:
test-proxy.bat
```

### 3. Configure Voices
```bash
# Auto-discover and configure voices:
configure-voices.bat
```

### 4. Simulate Grid3 Workflow
```bash
# Test complete Grid3 integration:
simulate-grid3.bat
```

### 5. Manual Testing
- Health: http://localhost:3000/health
- Voices: http://localhost:3000/v1/voices
- User: http://localhost:3000/v1/user

### ESP32 / Embedded Endpoint
Purpose-built endpoint for low-power devices.

- Speak: `POST /api/speak`
- List voices: `GET /api/voices`
- List engines: `GET /api/engines`

Headers: `X-API-Key: <your-admin-or-user-key>`

Example:
```bash
curl -X POST http://localhost:3000/api/speak \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello ESP32",
    "engine": "azure",
    "voice": "en-US-JennyNeural",
    "format": "pcm16",
    "sample_rate": 16000
  }' \
  --output esp32-audio.pcm
```
Defaults can be set with `ESP32_DEFAULT_ENGINE`, `ESP32_DEFAULT_VOICE`, `ESP32_DEFAULT_SAMPLE_RATE`, and `ESP32_MAX_TEXT_LENGTH` in your `.env`.

### WebSocket (ws/wss) Endpoint
Use WebSockets when you want a single, long-lived connection (including `wss` when TLS is terminated upstream).

- Connect to `ws(s)://<host>/api/ws` with `?api_key=...` or headers `X-API-Key`/`xi-api-key`/`Authorization: Bearer <key>`.
- Commands:
  - `{"type":"speak","text":"Hello","voice":"en-US-JennyNeural","engine":"azure","format":"pcm16","sample_rate":16000}` → streams binary audio.
  - `{"type":"voices"}` → returns JSON list of available voices.
  - `{"type":"engines"}` → returns JSON of available engines and the default engine.
- Server sends a small JSON metadata frame first (e.g., `{"type":"meta","sample_rate":24000,"format":"pcm16","engine":"azure","voice":"en-US-JennyNeural","bytes":12345}`) so clients can play PCM at the correct rate, followed by the binary audio frame.
- Quick test with `wscat`:
  ```bash
  npx wscat -c "ws://localhost:3000/api/ws?api_key=dev"
  # then send:
  # {"type":"engines"}
  # {"type":"speak","text":"Hello from WebSocket","engine":"azure","voice":"en-US-JennyNeural","format":"pcm16","sample_rate":16000}
  ```
- Local `wss` check (self-signed):
  ```bash
  node generate-cert.js
  npx local-ssl-proxy --source 3443 --target 3000 --key server.key --cert server.crt
  npx wscat -c "wss://localhost:3443/api/ws?api_key=dev" --no-check
  ```

## Admin API

Manage API keys and monitor TTS engines. All admin endpoints require an admin API key via `X-API-Key` header.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/api/keys` | List all API keys |
| `POST` | `/admin/api/keys` | Create a new API key |
| `PUT` | `/admin/api/keys/:keyId` | Update an API key |
| `DELETE` | `/admin/api/keys/:keyId` | Delete an API key |
| `GET` | `/admin/api/keys/:keyId/engines` | Get engine config for a key |
| `PUT` | `/admin/api/keys/:keyId/engines` | Update engine config for a key |
| `GET` | `/admin/api/usage` | Get usage statistics |
| `GET` | `/admin/api/engines/status` | Check TTS engine credentials |

### Check Engine Credentials

```bash
curl -s https://your-server/admin/api/engines/status \
  -H "X-API-Key: YOUR_ADMIN_KEY" | jq .
```

Response:
```json
{
  "engines": {
    "espeak": { "valid": true, "message": "Credentials valid" },
    "azure": { "valid": true, "voiceCount": 550 },
    "elevenlabs": { "valid": false, "message": "Credentials invalid" }
  },
  "timestamp": "2025-12-04T19:43:15.873Z"
}
```

### Create API Key

```bash
curl -X POST https://your-server/admin/api/keys \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App Key", "isAdmin": false}'
```

### Configure Engine Access Per Key

```bash
curl -X PUT https://your-server/admin/api/keys/KEY_ID/engines \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"engineConfig": {"azure": {"enabled": true}, "elevenlabs": {"enabled": false}}}'
```

### Admin UI

Access the admin dashboard at `/admin/admin.html` to:
- View and manage API keys
- Monitor usage statistics
- Configure engine access per key
- Check TTS engine credentials

## Host File Redirection

### Setup (Requires Administrator)
```bash
# Right-click Command Prompt -> "Run as Administrator"
# Then double-click or run:
setup-hosts.bat
```

### Manual Commands
```bash
# Check status
node manage-hosts.js status

# Add redirect (as admin)
node manage-hosts.js add

# Remove redirect (as admin)
node manage-hosts.js remove

# Restore from backup (as admin)
node manage-hosts.js restore
```

## Testing with Grid3

1. **Start the proxy**: `start-proxy.bat`
2. **Add host redirect**: Run `setup-hosts.bat` as Administrator
3. **Launch Grid3**: ElevenLabs API calls will now go to your proxy
4. **Test TTS**: Try using ElevenLabs voices in Grid3
5. **Check logs**: Monitor the proxy console for requests

## Advanced Features

### Voice Configuration
- **Auto-discovery**: Automatically finds available TTS voices
- **Smart mapping**: Creates intelligent ElevenLabs → Local voice mappings
- **Multi-engine support**: eSpeak, Azure, ElevenLabs, Google, AWS Polly, OpenAI
- **Configuration management**: JSON-based settings with backup/restore

### Testing & Simulation
- **Grid3 simulation**: Complete workflow testing that mimics Grid3's API usage
- **Performance testing**: Latency and throughput measurement
- **Audio generation**: Real audio files for testing
- **Error handling**: Comprehensive error scenario testing

### Environment Configuration
Create a `.env` file (copy from `.env.example`) to add API keys:
```bash
# Optional: Add your API keys for more TTS engines
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=westeurope
ELEVENLABS_API_KEY=your_key_here
```

## Next Steps

1. ✅ Basic proxy server working
2. ✅ Real TTS integration (eSpeak, Azure, ElevenLabs)
3. ✅ Host file modification utility
4. ✅ Voice discovery and configuration
5. ✅ Grid3 simulation testing
6. 🔄 Test with actual Grid3
7. ⏳ Add SherpaOnnx for offline TTS
8. ⏳ Enhanced configuration UI
9. ⏳ Performance optimization

## Architecture

```
Grid3 Application
       ↓
   (HTTP Requests to api.elevenlabs.io)
       ↓
   Host File Redirect
       ↓
   TTS Proxy Server (localhost:3000)
       ↓
   js-tts-wrapper
       ↓
   Local TTS Engines
```

## Configuration

The proxy can be configured through:
- System tray menu
- Configuration UI (accessible from tray)
- Configuration file (planned)

## Development

- **Framework:** Electron + Express.js
- **TTS Integration:** js-tts-wrapper
- **Logging:** Winston
- **UI:** HTML/CSS/JavaScript
