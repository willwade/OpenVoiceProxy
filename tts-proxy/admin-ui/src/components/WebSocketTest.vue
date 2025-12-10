<template>
    <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
            🧪 WebSocket Test
        </h3>
        <div class="space-y-4">
            <div>
                <button
                    @click="testWebSocket"
                    :disabled="isTesting"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                >
                    {{ isTesting ? "Testing..." : "Test WebSocket Connection" }}
                </button>
            </div>

            <div v-if="testResult" class="mt-4">
                <div
                    class="p-4 rounded-md"
                    :class="
                        testResult.success
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                    "
                >
                    {{ testResult.success ? "✅ Success!" : "❌ Error" }}
                    {{ testResult.message }}
                </div>

                <div
                    v-if="testResult.success && testResult.audioUrl"
                    class="mt-2 space-x-2"
                >
                    <a
                        :href="testResult.audioUrl"
                        download="test-audio.wav"
                        class="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors mr-2"
                    >
                        📁 Direct Download
                    </a>
                    <button
                        @click="playAudio"
                        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors mr-2"
                    >
                        🔊 Play Audio
                    </button>
                    <button
                        @click="downloadAudio"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                        💾 Download Audio
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps({
    serverUrl: { type: String, default: "ws://localhost:3000/api/ws" },
    apiKey: { type: String, default: "dev" },
    engine: { type: String, default: "azure" },
    voice: { type: String, default: "en-US-JennyNeural" },
    format: { type: String, default: "wav" },
    sampleRate: { type: Number, default: 24000 },
    testText: { type: String, default: "Hello, this is a test." },
});

type TestResult = {
    success: boolean;
    message: string;
    audioUrl?: string;
};

const isTesting = ref(false);
const testResult = ref<TestResult | null>(null);

function testWebSocket() {
    isTesting.value = true;
    testResult.value = null;

    try {
        // Create WebSocket connection
        const wsUrl = `${props.serverUrl}?api_key=${props.apiKey}`;
        console.log("Testing WebSocket connection to:", wsUrl);
        const socket = new WebSocket(wsUrl);

        // Normalize binary frames for Safari/Edge
        socket.binaryType = "arraybuffer";

        let audioChunks: BlobPart[] = [];
        let receivedBytes = 0;

        const finalizeAudio = () => {
            if (audioChunks.length === 0) {
                testResult.value = {
                    success: false,
                    message: "No audio data received",
                };
                return;
            }

            const audioBlob = new Blob(audioChunks, {
                type: props.format === "mp3" ? "audio/mpeg" : "audio/wav",
            });

            const audioUrl = URL.createObjectURL(audioBlob);

            testResult.value = {
                success: true,
                message: `Audio generated successfully (${receivedBytes} bytes)`,
                audioUrl: audioUrl,
            };
        };

        socket.onopen = () => {
            console.log("WebSocket connection opened");

            // Send speak request
            socket.send(
                JSON.stringify({
                    type: "speak",
                    text: props.testText,
                    engine: props.engine,
                    voice: props.voice,
                    format: props.format,
                    sampleRate: props.sampleRate,
                }),
            );
        };

        socket.onmessage = (event) => {
            // Binary data comes as Blob or ArrayBuffer depending on browser
            if (event.data instanceof ArrayBuffer) {
                const size = event.data.byteLength;
                console.log("Received binary data:", size, "bytes");
                audioChunks.push(event.data);
                receivedBytes += size;
            } else if (event.data instanceof Blob) {
                console.log("Received binary data:", event.data.size, "bytes");
                audioChunks.push(event.data);
                receivedBytes += event.data.size;
            } else {
                // JSON message
                try {
                    const message = JSON.parse(event.data);
                    console.log("Received JSON message:", message);

                    if (message.type === "meta") {
                        console.log("Received metadata, waiting for audio");
                    } else if (message.type === "end") {
                        console.log("Stream ended, creating audio blob");
                        finalizeAudio();
                        socket.close();
                    } else if (message.type === "error") {
                        testResult.value = {
                            success: false,
                            message: message.error || "Unknown error",
                        };
                        socket.close();
                    }
                } catch (e) {
                    console.error("Error parsing JSON message:", e);
                }
            }
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            testResult.value = {
                success: false,
                message: `Connection error: ${error}`,
            };
            isTesting.value = false;
        };

        socket.onclose = (event) => {
            console.log("WebSocket closed:", event.code, event.reason);
            isTesting.value = false;
        };

        // Timeout after 10 seconds
        setTimeout(() => {
            if (isTesting.value) {
                testResult.value = {
                    success: false,
                    message: "Test timed out",
                };
                socket.close();
                isTesting.value = false;
            }
        }, 10000);
    } catch (error: unknown) {
        console.error("Test error:", error);
        const message =
            error instanceof Error ? error.message : String(error);
        testResult.value = {
            success: false,
            message: `Error: ${message}`,
        };
        isTesting.value = false;
    }
}

function playAudio() {
    if (!testResult.value?.audioUrl) return;

    // Create a user interaction event for better browser compatibility
    const playAudioWithInteraction = () => {
        const audio = new Audio(testResult.value!.audioUrl);

        // Set up event handlers
        audio.addEventListener("error", (e) => {
            const audioEl = (e?.target as HTMLAudioElement | null);
            const error = audioEl?.error;
            console.error("Audio element error:", error);
            alert(
                `Audio playback error: ${
                    error ? error.message : "Unknown error"
                }`,
            );
        });

        audio.addEventListener("ended", () => {
            console.log("Audio playback completed successfully");
        });

        // Try to play the audio
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log("Audio playback started successfully");
                })
                .catch((err) => {
                    console.error("Error playing audio:", err);
                    alert(
                        `Failed to play audio: ${err.message}. Try clicking anywhere on the page first and then clicking play again.`,
                    );
                });
        }
    };

    // Try to play immediately
    playAudioWithInteraction();
}

function downloadAudio() {
    if (!testResult.value?.audioUrl) return;

    const a = document.createElement("a");
    a.href = testResult.value.audioUrl;
    a.download = `test-audio.${props.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
</script>
