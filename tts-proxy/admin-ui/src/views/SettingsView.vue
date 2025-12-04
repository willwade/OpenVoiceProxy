<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { useSettingsStore } from '@/stores/settings'
import { useEnginesStore } from '@/stores/engines'
import { ENGINE_DEFINITIONS } from '@/types'

const settingsStore = useSettingsStore()
const enginesStore = useEnginesStore()

const expandedEngine = ref<string | null>(null)
const editingCredentials = ref<Record<string, Record<string, string>>>({})
const testResults = ref<Record<string, { valid: boolean; message: string }>>({})
const testingEngine = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([
    settingsStore.fetchCredentials(),
    enginesStore.fetchEnginesStatus()
  ])
})

function toggleExpand(engineId: string) {
  if (expandedEngine.value === engineId) {
    expandedEngine.value = null
  } else {
    expandedEngine.value = engineId
    // Initialize editing credentials from stored values
    const fields = ENGINE_DEFINITIONS[engineId]?.keyFields || []
    if (!editingCredentials.value[engineId]) {
      editingCredentials.value[engineId] = {}
    }
    fields.forEach(field => {
      editingCredentials.value[engineId]![field] = settingsStore.credentials[engineId]?.[field] || ''
    })
  }
}

function getCredentialValue(engineId: string, field: string): string {
  return editingCredentials.value[engineId]?.[field] || ''
}

function setCredentialValue(engineId: string, field: string, value: string) {
  if (!editingCredentials.value[engineId]) {
    editingCredentials.value[engineId] = {}
  }
  editingCredentials.value[engineId][field] = value
}

async function saveEngineCredentials(engineId: string) {
  const creds = editingCredentials.value[engineId] || {}
  const success = await settingsStore.saveCredentials(engineId, creds)
  if (success) {
    expandedEngine.value = null
    // Refresh engine status
    await enginesStore.fetchEnginesStatus()
  }
}

async function testEngineCredentials(engineId: string) {
  testingEngine.value = engineId
  const result = await settingsStore.testCredentials(engineId)
  testResults.value[engineId] = result
  testingEngine.value = null
}

function getEngineStatus(engineId: string) {
  return enginesStore.engines[engineId]
}

function isConfigured(engineId: string): boolean {
  return settingsStore.hasCredentials(engineId)
}
</script>

<template>
  <AppLayout>
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Settings</h2>
        <p class="text-gray-600 mt-1">Configure system-wide TTS engine credentials</p>
      </div>

      <!-- Info Banner -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p class="text-blue-800">
          <strong>💡 Credentials Priority:</strong> System credentials can be set here or via environment variables.
          Values saved here will override environment variables and persist in the database.
        </p>
      </div>

      <!-- Engine Credentials List -->
      <div class="space-y-4">
        <div v-for="(def, engineId) in ENGINE_DEFINITIONS" :key="engineId">
          <!-- Only show engines that require credentials -->
          <div v-if="def.requiresKey" class="bg-white rounded-lg shadow overflow-hidden">
            <!-- Engine Header -->
            <div 
              class="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              @click="toggleExpand(engineId as string)"
            >
              <div class="flex items-center gap-4">
                <div>
                  <div class="font-medium text-gray-900">{{ def.name }}</div>
                  <div class="text-sm text-gray-500">{{ def.description }}</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <!-- Status indicator -->
                <span
                  v-if="getEngineStatus(engineId as string)"
                  :class="getEngineStatus(engineId as string)?.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                  class="text-xs px-2 py-1 rounded"
                >
                  {{ getEngineStatus(engineId as string)?.valid ? '✓ Valid' : '✗ Invalid' }}
                </span>
                <span
                  :class="isConfigured(engineId as string) ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'"
                  class="text-xs px-2 py-1 rounded"
                >
                  {{ isConfigured(engineId as string) ? 'Configured' : 'Not Configured' }}
                </span>
                <span class="text-gray-400">
                  {{ expandedEngine === engineId ? '▲' : '▼' }}
                </span>
              </div>
            </div>

            <!-- Expanded Credential Form -->
            <div v-if="expandedEngine === engineId" class="border-t border-gray-200 p-4 bg-gray-50">
              <div class="space-y-4">
                <div v-for="field in def.keyFields" :key="field">
                  <label class="block text-sm font-medium text-gray-700 mb-1">{{ field }}</label>
                  <input
                    type="password"
                    :value="getCredentialValue(engineId as string, field)"
                    @input="setCredentialValue(engineId as string, field, ($event.target as HTMLInputElement).value)"
                    :placeholder="field.includes('KEY') ? '••••••••••••••••' : 'Enter value'"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <!-- Test Result -->
                <div v-if="testResults[engineId as string]" class="p-3 rounded-lg" :class="testResults[engineId as string]?.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'">
                  {{ testResults[engineId as string]?.message }}
                </div>

                <!-- Actions -->
                <div class="flex gap-3 pt-2">
                  <button
                    @click="testEngineCredentials(engineId as string)"
                    :disabled="testingEngine === engineId"
                    class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  >
                    {{ testingEngine === engineId ? 'Testing...' : 'Test Credentials' }}
                  </button>
                  <button
                    @click="saveEngineCredentials(engineId as string)"
                    :disabled="settingsStore.isSaving"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {{ settingsStore.isSaving ? 'Saving...' : 'Save Credentials' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Free Engines Info -->
      <div class="bg-gray-50 rounded-lg p-4">
        <h3 class="font-medium text-gray-900 mb-2">Free Engines (No Credentials Required)</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(def, engineId) in ENGINE_DEFINITIONS"
            :key="engineId"
            v-show="!def.requiresKey"
            class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
          >
            {{ def.name }}
          </span>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

