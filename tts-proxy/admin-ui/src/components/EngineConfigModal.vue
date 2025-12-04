<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useKeysStore } from '@/stores/keys'
import { ENGINE_DEFINITIONS, type EngineConfig } from '@/types'

const props = defineProps<{
  keyId: string
  keyName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const keysStore = useKeysStore()
const engineConfig = ref<Record<string, EngineConfig>>({})
const isLoading = ref(true)
const isSaving = ref(false)

onMounted(async () => {
  const config = await keysStore.getEngineConfig(props.keyId)
  if (config) {
    engineConfig.value = config
  }
  isLoading.value = false
})

function isEngineEnabled(engineId: string): boolean {
  return engineConfig.value[engineId]?.enabled ?? true
}

function toggleEngine(engineId: string) {
  if (!engineConfig.value[engineId]) {
    engineConfig.value[engineId] = { enabled: true }
  }
  engineConfig.value[engineId].enabled = !engineConfig.value[engineId].enabled
}

async function handleSave() {
  isSaving.value = true
  const success = await keysStore.updateEngineConfig(props.keyId, engineConfig.value)
  isSaving.value = false
  if (success) {
    emit('close')
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 class="text-lg font-semibold text-gray-900">
          Configure Engines: {{ keyName }}
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div class="p-6 overflow-y-auto max-h-[60vh]">
        <div v-if="isLoading" class="text-center py-8 text-gray-500">
          Loading configuration...
        </div>
        <div v-else class="space-y-4">
          <p class="text-sm text-gray-600 mb-4">
            Enable or disable TTS engines for this API key.
          </p>
          
          <div
            v-for="(def, engineId) in ENGINE_DEFINITIONS"
            :key="engineId"
            class="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
          >
            <div>
              <div class="font-medium text-gray-900">{{ def.name }}</div>
              <div class="text-sm text-gray-500">{{ def.description }}</div>
              <div class="mt-1">
                <span
                  :class="def.type === 'free' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                  class="text-xs px-2 py-0.5 rounded"
                >
                  {{ def.type }}
                </span>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                :checked="isEngineEnabled(engineId)"
                @change="toggleEngine(engineId)"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
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
    </div>
  </div>
</template>

