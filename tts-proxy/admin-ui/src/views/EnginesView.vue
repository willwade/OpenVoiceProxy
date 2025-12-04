<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { useEnginesStore } from '@/stores/engines'
import { ENGINE_DEFINITIONS } from '@/types'

const enginesStore = useEnginesStore()

onMounted(() => enginesStore.fetchEnginesStatus())
</script>

<template>
  <AppLayout>
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">TTS Engines</h2>
        <button
          @click="enginesStore.fetchEnginesStatus()"
          :disabled="enginesStore.isLoading"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {{ enginesStore.isLoading ? 'Checking...' : 'Refresh Status' }}
        </button>
      </div>

      <p v-if="enginesStore.lastChecked" class="text-sm text-gray-500">
        Last checked: {{ new Date(enginesStore.lastChecked).toLocaleString() }}
      </p>

      <!-- Engines Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="(def, engineId) in ENGINE_DEFINITIONS"
          :key="engineId"
          class="bg-white rounded-lg shadow overflow-hidden"
        >
          <div class="p-6">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">{{ def.name }}</h3>
                <p class="text-sm text-gray-500 mt-1">{{ def.description }}</p>
              </div>
              <span
                :class="def.type === 'free' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                class="text-xs px-2 py-1 rounded font-medium"
              >
                {{ def.type }}
              </span>
            </div>

            <!-- Status -->
            <div class="mt-4 p-3 rounded-lg" :class="enginesStore.enginesStatus[engineId]?.valid ? 'bg-green-50' : 'bg-gray-50'">
              <div class="flex items-center gap-2">
                <span
                  class="w-3 h-3 rounded-full"
                  :class="enginesStore.enginesStatus[engineId]?.valid ? 'bg-green-500' : 'bg-gray-400'"
                ></span>
                <span class="font-medium" :class="enginesStore.enginesStatus[engineId]?.valid ? 'text-green-800' : 'text-gray-600'">
                  {{ enginesStore.enginesStatus[engineId]?.valid ? 'Online' : 'Not Configured' }}
                </span>
              </div>
              
              <div v-if="enginesStore.enginesStatus[engineId]" class="mt-2 text-sm text-gray-600">
                <div v-if="enginesStore.enginesStatus[engineId].details?.voiceCount">
                  {{ enginesStore.enginesStatus[engineId].details?.voiceCount }} voices available
                </div>
                <div v-if="enginesStore.enginesStatus[engineId].error" class="text-red-600">
                  {{ enginesStore.enginesStatus[engineId].error }}
                </div>
              </div>
            </div>

            <!-- Credentials Required -->
            <div v-if="def.requiresKey" class="mt-4">
              <p class="text-xs text-gray-500 mb-1">Required credentials:</p>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="field in def.keyFields"
                  :key="field"
                  class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono"
                >
                  {{ field }}
                </span>
              </div>
            </div>
            <div v-else class="mt-4 text-xs text-gray-500">
              No credentials required
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

