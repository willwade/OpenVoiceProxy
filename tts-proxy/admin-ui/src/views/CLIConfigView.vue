<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import AppLayout from "@/components/AppLayout.vue";
import { useAuthStore } from "@/stores/auth";
import { useEnginesStore } from "@/stores/engines";
import { useKeysStore } from "@/stores/keys";
import { ENGINE_DEFINITIONS } from "@/types";
import axios from "axios";

const authStore = useAuthStore();
const enginesStore = useEnginesStore();
const keysStore = useKeysStore();

// Form state
const selectedEngine = ref<string>("azure");
const selectedVoice = ref<string>("");
const sampleRate = ref<number>(24000);
const format = ref<string>("wav");
const serverUrl = ref<string>("ws://localhost:3000/api/ws");
const selectedApiKey = ref<string>("dev");
const translationEnabled = ref<boolean>(false);
const translationProvider = ref<string>("google");
const translationApiKey = ref<string>("");
const sourceLanguage = ref<string>("auto");
const targetLanguage = ref<string>("en");
const transliterationEnabled = ref<boolean>(false);
const transliterationFromScript = ref<string>("Latn");
const transliterationToScript = ref<string>("Arab");
const useClipboard = ref<boolean>(true);
const overwriteClipboardOnCompletion = ref<boolean>(false);
const playAudio = ref<boolean>(true);
const saveToFile = ref<boolean>(false);
const outputPath = ref<string>("");
const logFile = ref<string>("C:\\AAC\\logs\\calltts.log");
const testText = ref<string>("Hello, this is a test.");

// Loading and error states
const isLoadingVoices = ref<boolean>(false);
const isLoadingLanguages = ref<boolean>(false);
const isLoadingScripts = ref<boolean>(false);
const isTesting = ref<boolean>(false);
const testResult = ref<{
    success: boolean;
    message: string;
    audioUrl?: string;
} | null>(null);
const isSavingLocal = ref<boolean>(false);
const saveStatus = ref<string | null>(null);
const voices = ref<
    Array<{
        id: string;
        name: string;
        languages: string[];
        language?: string;
        locale?: string;
        gender?: string;
        type?: string;
    }>
>([]);
const availableEngines = ref<string[]>([]);

// Translation data (fetched from API)
const translationLanguages = ref<Array<{ code: string; name: string }>>([]);
const transliterationScripts = ref<Array<{ code: string; name: string }>>([]);
const languagesError = ref<string | null>(null);
const scriptsError = ref<string | null>(null);

// Computed properties
const configJson = computed(() => {
    const config: any = {
        server: {
            url: serverUrl.value,
            apiKey: selectedApiKey.value,
        },
        tts: {
            engine: selectedEngine.value,
            voice: selectedVoice.value,
            format: format.value,
            sampleRate: sampleRate.value,
        },
        translation: {
            enabled: translationEnabled.value,
            ...(translationEnabled.value
                ? {
                      provider: translationProvider.value,
                      apiKey: translationApiKey.value,
                      sourceLanguage: sourceLanguage.value,
                      targetLanguage: targetLanguage.value,
                      ...(transliterationEnabled.value &&
                      translationProvider.value === "azure"
                          ? {
                                transliteration: {
                                    enabled: true,
                                    fromScript: transliterationFromScript.value,
                                    toScript: transliterationToScript.value,
                                },
                            }
                          : {}),
                  }
                : {}),
        },
        input: {
            useClipboard: useClipboard.value,
            overwriteClipboardOnCompletion:
                overwriteClipboardOnCompletion.value,
        },
        output: {
            playAudio: playAudio.value,
            saveToFile: saveToFile.value,
            logFile: logFile.value,
            ...(saveToFile.value && outputPath.value
                ? { outputPath: outputPath.value }
                : {}),
        },
    };
    return JSON.stringify(config, null, 2);
});

const exampleCommand = computed(() => {
    if (useClipboard.value) {
        return `CallTTS.exe --config config.json`;
    }
    return `CallTTS.exe --config config.json --text "Hello world"`;
});

const selectedVoiceDetails = computed(() => {
    return voices.value.find((v) => v.id === selectedVoice.value);
});

// Methods
async function loadEngines() {
    try {
        await enginesStore.fetchEnginesStatus();
        // Show all engines, not just valid ones (user might want to configure for later use)
        availableEngines.value = Object.keys(enginesStore.enginesStatus);

        // If no engines from store, use fallback list
        if (availableEngines.value.length === 0) {
            availableEngines.value = [
                "espeak",
                "azure",
                "google",
                "openai",
                "elevenlabs",
                "polly",
            ];
        }

        // Set default to first available engine if selected one is not available
        if (
            !availableEngines.value.includes(selectedEngine.value) &&
            availableEngines.value.length > 0
        ) {
            selectedEngine.value = availableEngines.value[0] || "";
        }
    } catch (error) {
        console.error("Error loading engines:", error);
        // Fallback to common engines
        availableEngines.value = [
            "espeak",
            "azure",
            "google",
            "openai",
            "elevenlabs",
            "polly",
        ];
        if (!selectedEngine.value) {
            selectedEngine.value = "espeak";
        }
    }
}

async function loadTranslationLanguages() {
    if (!translationProvider.value) return;

    isLoadingLanguages.value = true;
    languagesError.value = null;

    try {
        const endpoint =
            translationProvider.value === "google"
                ? "/api/translation/languages/google"
                : "/api/translation/languages/azure";

        const response = await axios.get(endpoint);
        translationLanguages.value = response.data.languages || [];
    } catch (error: any) {
        console.error("Error loading translation languages:", error);
        languagesError.value =
            error.response?.data?.error || "Failed to load languages";
        translationLanguages.value = [];
    } finally {
        isLoadingLanguages.value = false;
    }
}

async function loadTransliterationScripts() {
    if (translationProvider.value !== "azure") return;

    isLoadingScripts.value = true;
    scriptsError.value = null;

    try {
        const response = await axios.get("/api/translation/scripts/azure");
        transliterationScripts.value = response.data.scripts || [];
    } catch (error: any) {
        console.error("Error loading transliteration scripts:", error);
        scriptsError.value =
            error.response?.data?.error || "Failed to load scripts";
        transliterationScripts.value = [];
    } finally {
        isLoadingScripts.value = false;
    }
}

async function loadVoices() {
    if (!selectedEngine.value) return;

    isLoadingVoices.value = true;

    try {
        const response = await fetch(
            `/api/voices?engine=${selectedEngine.value}`,
            {
                headers: authStore.getHeaders(),
            },
        );

        if (response.ok) {
            const data = await response.json();
            voices.value = data.voices || [];

            // Auto-select first voice if none selected or selected voice not available
            if (
                !selectedVoice.value ||
                !voices.value.find((v) => v.id === selectedVoice.value)
            ) {
                if (voices.value.length > 0 && voices.value[0]) {
                    selectedVoice.value = voices.value[0].id;
                }
            }
        }
    } catch (error) {
        console.error("Error loading voices:", error);
        voices.value = [];
    } finally {
        isLoadingVoices.value = false;
    }
}

async function testConfiguration() {
    if (!selectedVoice.value) return;

    isTesting.value = true;
    testResult.value = null;

    try {
        // Create a WebSocket connection to test
        const wsUrl = `${serverUrl.value}?api_key=${selectedApiKey.value}`;
        console.log("Opening WebSocket connection to:", wsUrl);

        // Create WebSocket with proper error handling
        const socket = new WebSocket(wsUrl);

        // Force binary frames to come through as ArrayBuffer for consistency across browsers
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

            const mimeType = format.value === "mp3" ? "audio/mpeg" : "audio/wav";
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);

            console.log(
                `Audio generation complete. Total chunks: ${audioChunks.length}, Total bytes: ${receivedBytes}`,
            );
            testResult.value = {
                success: true,
                message: `Audio generated successfully (${receivedBytes} bytes)`,
                audioUrl,
            };

            // Auto-play after user-triggered preview click; catches most browsers
            setTimeout(() => playTestAudio(), 0);
        };

        socket.onopen = () => {
            console.log("WebSocket opened successfully");
            // Send a test message
            socket.send(
                JSON.stringify({
                    type: "speak",
                    text: testText.value,
                    engine: selectedEngine.value,
                    voice: selectedVoice.value,
                    format: format.value,
                    sampleRate: sampleRate.value,
                }),
            );
        };

        socket.onmessage = (event) => {
            // Check if it's binary data (not JSON)
            if (typeof event.data !== "string") {
                console.log(
                    "Received binary data, size:",
                    event.data.size ||
                        event.data.byteLength ||
                        event.data.length ||
                        0,
                );

                // Add binary chunk directly to array
                if (event.data instanceof ArrayBuffer) {
                    audioChunks.push(event.data);
                    receivedBytes += event.data.byteLength;
                } else if (event.data instanceof Blob) {
                    audioChunks.push(event.data);
                    receivedBytes += event.data.size;
                } else {
                    const blobChunk = new Blob([event.data]);
                    audioChunks.push(blobChunk);
                    receivedBytes += blobChunk.size;
                }
                return;
            }

            // At this point, we know it's text (JSON) data
            try {
                const message = JSON.parse(event.data);
                console.log("Received JSON message:", message);

                if (message.type === "error") {
                    testResult.value = {
                        success: false,
                        message: message.error || "Unknown error",
                    };
                    socket.close();
                } else if (message.type === "meta") {
                    // Metadata only - wait for binary frames
                    console.log(
                        "Received metadata, waiting for audio frames",
                    );
                } else if (message.type === "end") {
                    console.log(
                        "Received end message, processing collected audio data",
                    );
                    finalizeAudio();
                    socket.close();
                }
            } catch (e) {
                console.error("Error parsing JSON message:", e);
            }
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            testResult.value = {
                success: false,
                message: "Connection error: " + error,
            };
            isTesting.value = false;
        };

        socket.onclose = (event) => {
            console.log("WebSocket connection closed, code:", event.code, "reason:", event.reason);
            isTesting.value = false;
        };

        // Timeout after 10 seconds
        setTimeout(() => {
            if (isTesting.value) {
                console.log("Test timed out, WebSocket state:", socket.readyState);
                if (socket.readyState === WebSocket.CONNECTING) {
                    console.log("WebSocket is still connecting");
                } else if (socket.readyState === WebSocket.OPEN) {
                    console.log("WebSocket is open but no messages received");
                } else if (socket.readyState === WebSocket.CLOSING) {
                    console.log("WebSocket is closing");
                } else if (socket.readyState === WebSocket.CLOSED) {
                    console.log("WebSocket is closed");
                }

                testResult.value = {
                    success: false,
                    message: "Test timed out - no messages received",
                };
                socket.close();
                isTesting.value = false;
            }
        }, 10000);
    } catch (error) {
        testResult.value = {
            success: false,
            message: "Error: " + error,
        };
        isTesting.value = false;
    }
}

function copyToClipboard() {
    navigator.clipboard
        .writeText(configJson.value)
        .then(() => alert("Configuration copied to clipboard!"))
        .catch((err) => console.error("Failed to copy:", err));
}

function copyCommandToClipboard() {
    navigator.clipboard
        .writeText(exampleCommand.value)
        .then(() => alert("Command copied to clipboard!"))
        .catch((err) => console.error("Failed to copy:", err));
}

function downloadConfig() {
    const blob = new Blob([configJson.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function saveToDefaultPath() {
    saveStatus.value = null;
    isSavingLocal.value = true;
    try {
        const parsed = JSON.parse(configJson.value);
        const response = await axios.post(
            "/admin/api/cli-config/save",
            { config: parsed },
            { headers: authStore.getHeaders(true) },
        );
        saveStatus.value = `Saved to ${response.data?.path || "default user data path"}`;
        alert("Saved to default user data directory for CallTTS");
    } catch (error: any) {
        const message =
            error?.response?.data?.error ||
            error?.message ||
            "Failed to save CLI config";
        console.error("Error saving CLI config:", message);
        saveStatus.value = `Error: ${message}`;
    } finally {
        isSavingLocal.value = false;
    }
}

function playTestAudio() {
    if (testResult.value?.audioUrl) {
        const audio = new Audio(testResult.value.audioUrl);

        // Set up event handlers
        audio.addEventListener("error", (e) => {
            const audioEl = (e?.target as HTMLAudioElement | null);
            const error = audioEl?.error;
            console.error("Audio element error:", error);
            testResult.value = {
                ...testResult.value,
                success: false,
                message: `Audio playback error: ${error ? error.message : "Unknown error"}. This might be due to browser autoplay policies or unsupported audio format.`,
            };
        });

        audio.addEventListener("ended", () => {
            console.log("Audio playback completed successfully");
        });

        // Create a user interaction context for better browser compatibility
        const playAudioWithUserInteraction = () => {
            // Reset audio element
            audio.currentTime = 0;

            // Try to play audio
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log("Audio playback started successfully");
                    })
                    .catch((err) => {
                        console.error("Error playing audio:", err);
                        testResult.value = {
                            ...testResult.value,
                            success: false,
                            message: `Failed to play audio: ${err.message}. Please interact with the page and try again.`,
                        };
                    });
            }
        };

        // Try to play immediately
        playAudioWithUserInteraction();
    }
}
// Watchers
watch(translationProvider, () => {
    loadTranslationLanguages();
    if (translationProvider.value === "azure") {
        loadTransliterationScripts();
    }
});

watch(translationEnabled, (enabled) => {
    if (enabled) {
        loadTranslationLanguages();
        if (translationProvider.value === "azure") {
            loadTransliterationScripts();
        }
    }
});

// Lifecycle
onMounted(async () => {
    await Promise.all([loadEngines(), keysStore.fetchKeys()]);

    // Set default API key if available
    if (
        keysStore.keys.length > 0 &&
        !keysStore.keys.find((k) => k.keySuffix === selectedApiKey.value)
    ) {
        const adminKey = keysStore.keys.find((k) => k.isAdmin);
        if (adminKey) {
            selectedApiKey.value = adminKey.keySuffix || "dev";
        }
    }

    // Load voices for the selected engine
    await loadVoices();

    // Load translation languages if translation is enabled
    if (translationEnabled.value) {
        await loadTranslationLanguages();
        if (translationProvider.value === "azure") {
            await loadTransliterationScripts();
        }
    }
});
</script>

<template>
    <AppLayout>
        <div class="space-y-6">
            <div class="flex justify-between items-center">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900">
                        CLI Configuration Generator
                    </h2>
                    <div class="text-sm text-gray-600 mt-1">
                        Create configuration files for CallTTS.exe
                    </div>
                </div>
                <div
                    v-if="!availableEngines.length"
                    class="text-sm text-orange-600 bg-orange-50 px-4 py-2 rounded-md"
                >
                    <strong>No TTS engines configured!</strong>
                    <a
                        href="/admin/keys"
                        class="underline hover:text-orange-800 ml-1"
                    >
                        Go to API Keys to configure engines
                    </a>
                </div>
            </div>

            <!-- TTS Engine Settings -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        🎤 TTS Engine Settings
                    </h3>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label
                            for="engine"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            TTS Engine
                        </label>
                        <select
                            id="engine"
                            v-model="selectedEngine"
                            @change="loadVoices"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option
                                v-for="engine in availableEngines"
                                :key="engine"
                                :value="engine"
                            >
                                {{ ENGINE_DEFINITIONS[engine]?.name || engine }}
                            </option>
                        </select>
                        <p class="text-xs text-gray-500 mt-1">
                            Need more engines?
                            <a
                                href="/admin/keys"
                                class="text-blue-600 hover:underline"
                            >
                                Configure API keys with additional TTS engines
                            </a>
                        </p>
                    </div>

                    <div>
                        <label
                            for="voice"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Voice
                        </label>
                        <div class="flex items-center space-x-2">
                            <select
                                id="voice"
                                v-model="selectedVoice"
                                :disabled="isLoadingVoices"
                                class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option
                                    v-for="voice in voices"
                                    :key="voice.id"
                                    :value="voice.id"
                                >
                                    {{
                                        voice.name
                                    }}
                                    {{
                                        voice.languages && voice.languages.length
                                            ? ` (${voice.languages.join(', ')})`
                                            : voice.language
                                                ? ` (${voice.language})`
                                                : voice.locale
                                                    ? ` (${voice.locale})`
                                                    : ""
                                    }}
                                </option>
                            </select>
                            <button
                                @click="testConfiguration"
                                :disabled="isTesting || !selectedVoice"
                                class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400"
                            >
                                {{ isTesting ? "Testing..." : "🔊 Preview" }}
                            </button>
                        </div>
                        <div
                            v-if="selectedVoiceDetails"
                            class="text-xs text-gray-500 mt-1"
                        >
                            <span
                                v-if="
                                    selectedVoiceDetails.languages &&
                                    selectedVoiceDetails.languages.length > 0
                                "
                            >
                                {{ selectedVoiceDetails.languages.join(", ") }}
                            </span>
                            {{
                                selectedVoiceDetails.gender
                                    ? `• ${selectedVoiceDetails.gender}`
                                    : ""
                            }}
                            {{
                                selectedVoiceDetails.type
                                    ? `• ${selectedVoiceDetails.type}`
                                    : ""
                            }}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                for="sampleRate"
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Sample Rate
                            </label>
                            <select
                                id="sampleRate"
                                v-model="sampleRate"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="16000">16000 Hz</option>
                                <option value="24000">24000 Hz</option>
                                <option value="48000">48000 Hz</option>
                            </select>
                        </div>

                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Format
                            </label>
                            <div class="flex space-x-4">
                                <label class="flex items-center">
                                    <input
                                        type="radio"
                                        v-model="format"
                                        value="wav"
                                        class="mr-2"
                                    />
                                    WAV
                                </label>
                                <label class="flex items-center">
                                    <input
                                        type="radio"
                                        v-model="format"
                                        value="mp3"
                                        class="mr-2"
                                    />
                                    MP3
                                </label>
                                <label class="flex items-center">
                                    <input
                                        type="radio"
                                        v-model="format"
                                        value="pcm16"
                                        class="mr-2"
                                    />
                                    PCM16
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Server Connection -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        🌐 Server Connection
                    </h3>
                </div>
                <div class="p-6 space-y-4">
                    <div
                        v-if="authStore.isDevelopmentMode"
                        class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md"
                    >
                        <p class="text-sm text-blue-800">
                            <strong>Desktop App Mode:</strong> You're running the
                            desktop app. The default settings below are
                            pre-configured for local use. The "dev" key works
                            automatically with your local proxy server.
                        </p>
                    </div>

                    <div>
                        <label
                            for="serverUrl"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Server URL
                            <span
                                v-if="authStore.isDevelopmentMode"
                                class="text-xs text-gray-500 ml-2"
                            >
                                (WebSocket URL for CallTTS.exe)
                            </span>
                        </label>
                        <input
                            id="serverUrl"
                            v-model="serverUrl"
                            type="text"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p class="text-xs text-gray-500 mt-1">
                            The WebSocket endpoint that CallTTS.exe connects to
                        </p>
                    </div>

                    <div>
                        <label
                            for="apiKey"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            API Key
                        </label>
                        <select
                            id="apiKey"
                            v-model="selectedApiKey"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="dev">dev (Local Desktop App)</option>
                            <option
                                v-for="key in keysStore.keys"
                                :key="key.id"
                                :value="key.keySuffix"
                            >
                                {{ key.name }} ({{ key.keySuffix }})
                            </option>
                        </select>
                        <p class="text-xs text-gray-500 mt-1">
                            <span v-if="authStore.isDevelopmentMode">
                                Use "dev" for local desktop app, or select a
                                specific key for remote server access
                            </span>
                            <span v-else>
                                Select the API key to use for authentication
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            <!-- Translation Settings -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        🌍 Translation (Optional)
                    </h3>
                </div>
                <div class="p-6 space-y-4">
                    <div class="flex items-center">
                        <input
                            id="translationEnabled"
                            v-model="translationEnabled"
                            type="checkbox"
                            class="mr-2"
                        />
                        <label
                            for="translationEnabled"
                            class="text-sm font-medium text-gray-700"
                        >
                            Enable Translation
                        </label>
                    </div>

                    <div v-if="translationEnabled" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label
                                    for="translationProvider"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Provider
                                </label>
                                <select
                                    id="translationProvider"
                                    v-model="translationProvider"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="google">
                                        Google Translate
                                    </option>
                                    <option value="azure">
                                        Azure Translator
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label
                                    for="translationApiKey"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    API Key
                                </label>
                                <input
                                    id="translationApiKey"
                                    v-model="translationApiKey"
                                    type="password"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter translation API key"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label
                                    for="sourceLanguage"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Source Language
                                </label>
                                <select
                                    id="sourceLanguage"
                                    v-model="sourceLanguage"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    :disabled="isLoadingLanguages"
                                >
                                    <option value="auto">Auto-detect</option>
                                    <option
                                        v-for="lang in translationLanguages"
                                        :key="lang.code"
                                        :value="lang.code"
                                    >
                                        {{ lang.code }} - {{ lang.name }}
                                    </option>
                                </select>
                                <p
                                    v-if="languagesError"
                                    class="text-xs text-red-500 mt-1"
                                >
                                    {{ languagesError }}
                                </p>
                                <p
                                    v-else-if="isLoadingLanguages"
                                    class="text-xs text-gray-500 mt-1"
                                >
                                    Loading languages...
                                </p>
                            </div>

                            <div>
                                <label
                                    for="targetLanguage"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Target Language
                                </label>
                                <select
                                    id="targetLanguage"
                                    v-model="targetLanguage"
                                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    :disabled="isLoadingLanguages"
                                >
                                    <option
                                        v-for="lang in translationLanguages"
                                        :key="lang.code"
                                        :value="lang.code"
                                    >
                                        {{ lang.code }} - {{ lang.name }}
                                    </option>
                                </select>
                                <p
                                    v-if="languagesError"
                                    class="text-xs text-red-500 mt-1"
                                >
                                    {{ languagesError }}
                                </p>
                                <p
                                    v-else-if="isLoadingLanguages"
                                    class="text-xs text-gray-500 mt-1"
                                >
                                    Loading languages...
                                </p>
                            </div>
                        </div>

                        <!-- Transliteration (Azure only) -->
                        <div
                            v-if="translationProvider === 'azure'"
                            class="border-t pt-4"
                        >
                            <div class="flex items-center mb-4">
                                <input
                                    id="transliterationEnabled"
                                    v-model="transliterationEnabled"
                                    type="checkbox"
                                    class="mr-2"
                                />
                                <label
                                    for="transliterationEnabled"
                                    class="text-sm font-medium text-gray-700"
                                >
                                    Enable Transliteration (e.g., Latin to
                                    Arabic for Urdu)
                                </label>
                            </div>

                            <div
                                v-if="transliterationEnabled"
                                class="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                <div>
                                    <label
                                        for="transliterationFromScript"
                                        class="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        From Script
                                    </label>
                                    <select
                                        id="transliterationFromScript"
                                        v-model="transliterationFromScript"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        :disabled="isLoadingScripts"
                                    >
                                        <option
                                            v-for="script in transliterationScripts"
                                            :key="script.code"
                                            :value="script.code"
                                        >
                                            {{ script.name }} ({{
                                                script.code
                                            }})
                                        </option>
                                    </select>
                                    <p
                                        v-if="scriptsError"
                                        class="text-xs text-red-500 mt-1"
                                    >
                                        {{ scriptsError }}
                                    </p>
                                    <p
                                        v-else-if="isLoadingScripts"
                                        class="text-xs text-gray-500 mt-1"
                                    >
                                        Loading scripts...
                                    </p>
                                </div>

                                <div>
                                    <label
                                        for="transliterationToScript"
                                        class="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        To Script
                                    </label>
                                    <select
                                        id="transliterationToScript"
                                        v-model="transliterationToScript"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        :disabled="isLoadingScripts"
                                    >
                                        <option
                                            v-for="script in transliterationScripts"
                                            :key="script.code"
                                            :value="script.code"
                                        >
                                            {{ script.name }} ({{
                                                script.code
                                            }})
                                        </option>
                                    </select>
                                    <p
                                        v-if="scriptsError"
                                        class="text-xs text-red-500 mt-1"
                                    >
                                        {{ scriptsError }}
                                    </p>
                                    <p
                                        v-else-if="isLoadingScripts"
                                        class="text-xs text-gray-500 mt-1"
                                    >
                                        Loading scripts...
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Input Settings -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        📋 Input Settings
                    </h3>
                </div>
                <div class="p-6 space-y-4">
                    <div class="flex items-center">
                        <input
                            id="useClipboard"
                            v-model="useClipboard"
                            type="checkbox"
                            class="mr-2"
                        />
                        <label
                            for="useClipboard"
                            class="text-sm font-medium text-gray-700"
                        >
                            Use clipboard/pasteboard if no --text parameter
                            given
                        </label>
                    </div>
                    <p class="text-xs text-gray-500 ml-6">
                        When enabled, CallTTS will read from the clipboard if
                        --text is not provided
                    </p>

                    <div class="flex items-center">
                        <input
                            id="overwriteClipboard"
                            v-model="overwriteClipboardOnCompletion"
                            type="checkbox"
                            class="mr-2"
                        />
                        <label
                            for="overwriteClipboard"
                            class="text-sm font-medium text-gray-700"
                        >
                            Overwrite clipboard/pasteboard on translation
                            completion
                        </label>
                    </div>
                    <p class="text-xs text-gray-500 ml-6">
                        When enabled, the translated text will replace the
                        clipboard content
                    </p>
                </div>
            </div>

            <!-- Output Settings -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        💾 Output Settings
                    </h3>
                </div>
                <div class="p-6 space-y-4">
                    <div class="flex items-center">
                        <input
                            id="playAudio"
                            v-model="playAudio"
                            type="checkbox"
                            class="mr-2"
                        />
                        <label
                            for="playAudio"
                            class="text-sm font-medium text-gray-700"
                        >
                            Play audio after generation
                        </label>
                    </div>

                    <div class="flex items-center">
                        <input
                            id="saveToFile"
                            v-model="saveToFile"
                            type="checkbox"
                            class="mr-2"
                        />
                        <label
                            for="saveToFile"
                            class="text-sm font-medium text-gray-700"
                        >
                            Save audio to file
                        </label>
                    </div>

                    <div v-if="saveToFile">
                        <label
                            for="outputPath"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Output Path
                        </label>
                        <input
                            id="outputPath"
                            v-model="outputPath"
                            type="text"
                            placeholder="C:\AAC\audio\output.wav"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label
                            for="logFile"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Log File
                        </label>
                        <input
                            id="logFile"
                            v-model="logFile"
                            type="text"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>

            <!-- Generated Configuration -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        📄 Generated Configuration
                    </h3>
                </div>
                <div class="p-6">
                    <pre
                        class="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm"
                        >{{ configJson }}</pre
                    >
                    <div class="flex mt-4 space-x-2 flex-wrap gap-2">
                        <button
                            @click="copyToClipboard"
                            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                        >
                            📋 Copy to Clipboard
                        </button>
                        <button
                            @click="downloadConfig"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        >
                            💾 Download config.json
                        </button>
                        <button
                            @click="saveToDefaultPath"
                            :disabled="isSavingLocal"
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50"
                        >
                            {{ isSavingLocal ? "Saving..." : "Save to CLI default path" }}
                        </button>
                    </div>
                    <p v-if="saveStatus" class="mt-2 text-sm text-gray-700">
                        {{ saveStatus }}
                    </p>
                </div>
            </div>

            <!-- Usage Example -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3
                        class="text-lg font-semibold text-gray-900 flex items-center"
                    >
                        🚀 Usage Example
                    </h3>
                </div>
                <div class="p-6">
                    <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto">{{
                        exampleCommand
                    }}</pre>
                    <div class="mt-4">
                        <button
                            @click="copyCommandToClipboard"
                            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                        >
                            📋 Copy Command
                        </button>
                    </div>
                </div>
            </div>

        </div>
    </AppLayout>
</template>
