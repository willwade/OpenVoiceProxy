<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import AppLayout from "@/components/AppLayout.vue";
import { useKeysStore } from "@/stores/keys";
import { useEnginesStore } from "@/stores/engines";
import { useAuthStore } from "@/stores/auth";

const keysStore = useKeysStore();
const enginesStore = useEnginesStore();
const authStore = useAuthStore();

const searchLang = ref("");
const allVoices = ref<
    Array<{
        id: string;
        name: string;
        language?: string;
        locale?: string;
        languages?: string[];
        engine: string;
        gender?: string;
        type?: string;
    }>
>([]);
const isLoadingVoices = ref(false);
const voicesError = ref<string | null>(null);

const stats = computed(() => ({
    totalKeys: keysStore.keys.length,
    activeKeys: keysStore.keys.filter((k) => k.active).length,
    adminKeys: keysStore.keys.filter((k) => k.isAdmin).length,
    validEngines: Object.values(enginesStore.enginesStatus).filter(
        (e) => e.valid,
    ).length,
    totalEngines: Object.keys(enginesStore.enginesStatus).length,
}));

const filteredVoices = computed(() => {
        const term = searchLang.value.trim().toLowerCase();
        if (!term) return allVoices.value;

        return allVoices.value.filter((v) => {
            const langs = [
                ...(v.languages || []),
                ...(v.language ? [v.language] : []),
                ...(v.locale ? [v.locale] : []),
            ]
                .filter(Boolean)
                .map((l) => l.toLowerCase());

            const name = v.name?.toLowerCase() || "";
            return (
            langs.some((l) => l.includes(term)) ||
            name.includes(term) ||
            v.engine.toLowerCase().includes(term)
        );
    });
});

async function loadVoicesAcrossEngines() {
    isLoadingVoices.value = true;
    voicesError.value = null;
    const voices: typeof allVoices.value = [];

    const engines = Object.keys(enginesStore.enginesStatus || {});

    for (const engine of engines) {
        try {
            const res = await fetch(`/api/voices?engine=${engine}`, {
                headers: authStore.getHeaders(),
            });
            if (!res.ok) {
                throw new Error(`Engine ${engine} responded ${res.status}`);
            }
            const data = await res.json();
            (data.voices || []).forEach((v: any) =>
                voices.push({
                    ...v,
                    engine,
                }),
            );
        } catch (error: any) {
            console.error("Error loading voices for engine", engine, error);
            voicesError.value =
                error?.message ||
                `Failed to load voices for engine ${engine}`;
        }
    }

    allVoices.value = voices;
    isLoadingVoices.value = false;
}

onMounted(async () => {
    await Promise.all([
        keysStore.fetchKeys(),
        enginesStore.fetchEnginesStatus(),
    ]);

    await loadVoicesAcrossEngines();
});
</script>

<template>
    <AppLayout>
        <div class="space-y-6">
            <h2 class="text-2xl font-bold text-gray-900">Dashboard</h2>

            <!-- Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="text-3xl font-bold text-blue-600">
                        {{ stats.totalKeys }}
                    </div>
                    <div class="text-gray-600 mt-1">Total API Keys</div>
                </div>
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="text-3xl font-bold text-green-600">
                        {{ stats.activeKeys }}
                    </div>
                    <div class="text-gray-600 mt-1">Active Keys</div>
                </div>
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="text-3xl font-bold text-purple-600">
                        {{ stats.adminKeys }}
                    </div>
                    <div class="text-gray-600 mt-1">Admin Keys</div>
                </div>
                <div class="bg-white rounded-lg shadow p-6">
                    <div
                        class="text-3xl font-bold"
                        :class="
                            stats.validEngines === stats.totalEngines
                                ? 'text-green-600'
                                : 'text-yellow-600'
                        "
                    >
                        {{ stats.validEngines }}/{{ stats.totalEngines }}
                    </div>
                    <div class="text-gray-600 mt-1">Engines Online</div>
                </div>
            </div>

            <!-- Engine Status -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">
                        Engine Status
                    </h3>
                </div>
                <div class="p-6">
                    <div
                        v-if="enginesStore.isLoading"
                        class="text-center py-8 text-gray-500"
                    >
                        Loading engine status...
                    </div>
                    <div
                        v-else
                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                        <div
                            v-for="(
                                status, engine
                            ) in enginesStore.enginesStatus"
                            :key="engine"
                            class="border rounded-lg p-4"
                            :class="
                                status.valid
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                            "
                        >
                            <div class="flex items-center justify-between">
                                <span
                                    class="font-medium text-gray-900 capitalize"
                                    >{{ engine }}</span
                                >
                                <span
                                    class="px-2 py-1 rounded text-xs font-medium"
                                    :class="
                                        status.valid
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                    "
                                >
                                    {{ status.valid ? "Online" : "Offline" }}
                                </span>
                            </div>
                            <div class="mt-2 text-sm text-gray-600">
                                {{ status.details?.voiceCount ?? 0 }} voices
                                available
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Voice Finder -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-900">
                        Voice Finder by Language
                    </h3>
                    <button
                        @click="loadVoicesAcrossEngines"
                        class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Refresh Voices
                    </button>
                </div>
                <div class="p-6 space-y-4">
                    <div class="flex flex-col md:flex-row md:items-center md:space-x-3 space-y-3 md:space-y-0">
                        <input
                            v-model="searchLang"
                            type="text"
                            placeholder="Search by language code or name (e.g., en, arabic, fr-CA)"
                            class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div class="text-sm text-gray-600">
                            {{ filteredVoices.length }} voices
                        </div>
                    </div>
                    <p class="text-xs text-gray-500">
                        Matches language code/name, voice name, or engine id. Results are fetched across all engines currently online.
                    </p>

                    <div v-if="isLoadingVoices" class="text-gray-600">Loading voices...</div>
                    <div v-else-if="voicesError" class="text-red-600 text-sm">{{ voicesError }}</div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div
                            v-for="voice in filteredVoices.slice(0, 60)"
                            :key="voice.engine + voice.id"
                            class="border rounded-lg p-4 bg-gray-50"
                        >
                            <div class="flex items-center justify-between">
                                <div class="font-semibold text-gray-900">
                                    {{ voice.name }}
                                </div>
                                <span class="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 uppercase">
                                    {{ voice.engine }}
                                </span>
                            </div>
                            <div class="text-sm text-gray-700 mt-1">
                                {{
                                    voice.languages && voice.languages.length
                                        ? voice.languages.join(", ")
                                        : voice.language || voice.locale || "Unknown language"
                                }}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                {{ voice.gender ? voice.gender + " • " : "" }}{{ voice.type || "" }}
                            </div>
                        </div>
                    </div>
                    <div v-if="filteredVoices.length > 60" class="text-xs text-gray-500">
                        Showing first 60 results. Refine your search to narrow down.
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">
                    Quick Actions
                </h3>
                <div class="flex flex-wrap gap-3">
                    <router-link
                        to="/keys"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Manage API Keys
                    </router-link>
                    <router-link
                        to="/engines"
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                        View Engines
                    </router-link>
                    <router-link
                        to="/cli-config"
                        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                        CLI Config
                    </router-link>
                    <button
                        @click="enginesStore.fetchEnginesStatus()"
                        class="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                        Refresh Status
                    </button>
                    <router-link
                        to="/cli-config"
                        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                        Test CLI
                    </router-link>
                </div>
            </div>
        </div>
    </AppLayout>
</template>
