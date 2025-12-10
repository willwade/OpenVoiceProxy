<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useKeysStore } from '@/stores/keys'
import { useAuthStore } from '@/stores/auth'
import { ENGINE_DEFINITIONS, type EngineConfig } from '@/types'

const props = defineProps<{
  keyId: string
  keyName: string
  isAdminKey?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const keysStore = useKeysStore()
const authStore = useAuthStore()
const engineConfig = ref<Record<string, EngineConfig>>({})
const isLoading = ref(true)
const isSaving = ref(false)
const expandedEngine = ref<string | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const importStatus = ref<string | null>(null)

// Admin users can set custom credentials
const canSetCredentials = computed(() => authStore.isAdmin)

onMounted(async () => {
  const config = await keysStore.getEngineConfig(props.keyId)
  if (config) {
    engineConfig.value = config
  }
  isLoading.value = false
})

function getConfig(engineId: string): EngineConfig {
  if (!engineConfig.value[engineId]) {
    engineConfig.value[engineId] = { enabled: true }
  }
  return engineConfig.value[engineId]
}

function isEngineEnabled(engineId: string): boolean {
  return getConfig(engineId).enabled ?? true
}

function toggleEngine(engineId: string) {
  const config = getConfig(engineId)
  config.enabled = !config.enabled
}

function usesCustomCredentials(engineId: string): boolean {
  return getConfig(engineId).useCustomCredentials ?? false
}

function toggleCredentialMode(engineId: string) {
  const config = getConfig(engineId)
  config.useCustomCredentials = !config.useCustomCredentials
  if (config.useCustomCredentials && !config.credentials) {
    config.credentials = {}
  }
}

function getCredential(engineId: string, field: string): string {
  return getConfig(engineId).credentials?.[field] ?? ''
}

function setCredential(engineId: string, field: string, value: string) {
  const config = getConfig(engineId)
  if (!config.credentials) config.credentials = {}
  config.credentials[field] = value
}

function toggleExpand(engineId: string) {
  expandedEngine.value = expandedEngine.value === engineId ? null : engineId
}

async function handleSave() {
  isSaving.value = true
  const success = await keysStore.updateEngineConfig(props.keyId, engineConfig.value)
  isSaving.value = false
  if (success) {
    emit('close')
  }
}

async function handleExport() {
  const blob = await keysStore.exportEngineConfig(props.keyId)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `engine-config-${props.keyName || props.keyId}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleImport(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files || !files[0]) return
  importStatus.value = null
  const ok = await keysStore.importEngineConfig(props.keyId, files[0])
  importStatus.value = ok ? 'Import successful' : 'Import failed'
  if (importInput.value) importInput.value.value = ''
  if (ok) {
    const config = await keysStore.getEngineConfig(props.keyId)
    if (config) engineConfig.value = config
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">
            Configure Engines: {{ keyName }}
          </h3>
          <p class="text-sm text-gray-500 mt-1">
            {{ canSetCredentials ? 'Enable engines and optionally set custom credentials' : 'Enable or disable available engines' }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="canSetCredentials"
            @click="handleExport"
            class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Export
          </button>
          <label
            v-if="canSetCredentials"
            class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
          >
            Import
            <input
              ref="importInput"
              type="file"
              accept="application/json"
              class="hidden"
              @change="handleImport"
            />
          </label>
          <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl">
            ✕
          </button>
        </div>
      </div>

      <div class="p-6 overflow-y-auto max-h-[60vh]">
        <div v-if="isLoading" class="text-center py-8 text-gray-500">
          Loading configuration...
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(def, engineId) in ENGINE_DEFINITIONS"
            :key="engineId"
            class="border rounded-lg overflow-hidden"
            :class="isEngineEnabled(engineId as string) ? 'border-gray-200' : 'border-gray-100 bg-gray-50'"
          >
            <!-- Engine Header -->
            <div class="flex items-center justify-between p-4">
              <div class="flex items-center gap-3 flex-1">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="isEngineEnabled(engineId as string)"
                    @change="toggleEngine(engineId as string)"
                    class="sr-only peer"
                  />
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <div>
                  <div class="font-medium text-gray-900">{{ def.name }}</div>
                  <div class="text-sm text-gray-500">{{ def.description }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span
                  :class="def.type === 'free' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                  class="text-xs px-2 py-0.5 rounded"
                >
                  {{ def.type }}
                </span>
                <!-- Expand button for engines that require credentials -->
                <button
                  v-if="def.requiresKey && canSetCredentials && isEngineEnabled(engineId as string)"
                  @click="toggleExpand(engineId as string)"
                  class="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  {{ expandedEngine === engineId ? '▲' : '▼' }}
                </button>
              </div>
            </div>

            <!-- Credential Settings (Expanded) -->
            <div
              v-if="def.requiresKey && canSetCredentials && isEngineEnabled(engineId as string) && expandedEngine === engineId"
              class="px-4 pb-4 border-t border-gray-100 bg-gray-50"
            >
              <div class="pt-4 space-y-4">
                <!-- Credential Mode Toggle -->
                <div class="flex items-center gap-3">
                  <span class="text-sm text-gray-600">Credentials:</span>
                  <div class="flex bg-gray-200 rounded-lg p-1">
                    <button
                      @click="usesCustomCredentials(engineId as string) && toggleCredentialMode(engineId as string)"
                      :class="!usesCustomCredentials(engineId as string) ? 'bg-white shadow text-gray-900' : 'text-gray-500'"
                      class="px-3 py-1 text-sm rounded-md transition-all"
                    >
                      Use System Default
                    </button>
                    <button
                      @click="!usesCustomCredentials(engineId as string) && toggleCredentialMode(engineId as string)"
                      :class="usesCustomCredentials(engineId as string) ? 'bg-white shadow text-gray-900' : 'text-gray-500'"
                      class="px-3 py-1 text-sm rounded-md transition-all"
                    >
                      Custom Credentials
                    </button>
                  </div>
                </div>

                <!-- Custom Credential Fields -->
                <div v-if="usesCustomCredentials(engineId as string)" class="space-y-3">
                  <div v-for="field in def.keyFields" :key="field">
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ field }}</label>
                    <input
                      type="password"
                      :value="getCredential(engineId as string, field)"
                      @input="setCredential(engineId as string, field, ($event.target as HTMLInputElement).value)"
                      :placeholder="field.includes('KEY') ? '••••••••••••••••' : 'Enter value'"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p class="text-xs text-gray-500">
                    💡 Custom credentials will be used instead of system defaults for this API key.
                  </p>
                </div>

                <div v-else class="text-sm text-gray-500 italic">
                  Using system-wide credentials configured by administrator.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          @click="emit('close')"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          @click="handleSave"
          :disabled="isSaving"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
      <div v-if="importStatus" class="px-6 pb-4 text-sm text-blue-700">
        {{ importStatus }}
      </div>
    </div>
  </div>
</template>
