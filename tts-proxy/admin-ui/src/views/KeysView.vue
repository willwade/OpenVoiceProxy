<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import EngineConfigModal from '@/components/EngineConfigModal.vue'
import { useKeysStore } from '@/stores/keys'

const keysStore = useKeysStore()

const newKeyName = ref('')
const newKeyIsAdmin = ref(false)
const showCreateForm = ref(false)
const configModalKeyId = ref<string | null>(null)
const configModalKeyName = ref('')

async function handleCreateKey() {
  if (!newKeyName.value.trim()) return
  
  await keysStore.createKey({
    name: newKeyName.value.trim(),
    isAdmin: newKeyIsAdmin.value
  })
  
  newKeyName.value = ''
  newKeyIsAdmin.value = false
  showCreateForm.value = false
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}

function openEngineConfig(keyId: string, keyName: string) {
  configModalKeyId.value = keyId
  configModalKeyName.value = keyName
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

onMounted(() => keysStore.fetchKeys())
</script>

<template>
  <AppLayout>
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">API Keys</h2>
        <button
          @click="showCreateForm = !showCreateForm"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {{ showCreateForm ? 'Cancel' : 'Create Key' }}
        </button>
      </div>

      <!-- Create Key Form -->
      <div v-if="showCreateForm" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Create New API Key</h3>
        <form @submit.prevent="handleCreateKey" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
            <input
              v-model="newKeyName"
              type="text"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Production App"
            />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="newKeyIsAdmin" type="checkbox" id="isAdmin" class="rounded" />
            <label for="isAdmin" class="text-sm text-gray-700">Admin privileges</label>
          </div>
          <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
            Create
          </button>
        </form>
      </div>

      <!-- New Key Created Banner -->
      <div v-if="keysStore.lastCreatedKey" class="bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-green-800 font-medium mb-2">✅ API Key Created Successfully!</p>
        <div class="flex items-center gap-2 bg-white p-3 rounded border font-mono text-sm">
          <span class="flex-1 break-all">{{ keysStore.lastCreatedKey }}</span>
          <button
            @click="copyToClipboard(keysStore.lastCreatedKey!)"
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
          >
            Copy
          </button>
        </div>
        <p class="text-sm text-green-700 mt-2">⚠️ Save this key now - it won't be shown again!</p>
      </div>

      <!-- Keys Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="key in keysStore.keys" :key="key.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 font-medium text-gray-900">{{ key.name }}</td>
              <td class="px-6 py-4">
                <span v-if="key.keySuffix" class="font-mono text-sm text-gray-500">
                  tts_••••...{{ key.keySuffix }}
                </span>
                <span v-else class="text-gray-400 text-sm">N/A</span>
              </td>
              <td class="px-6 py-4">
                <span v-if="key.isAdmin" class="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Admin</span>
                <span v-else class="text-gray-500 text-sm">Regular</span>
              </td>
              <td class="px-6 py-4">
                <span :class="key.active ? 'text-green-600' : 'text-red-600'" class="font-medium">
                  {{ key.active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ formatDate(key.createdAt) }}</td>
              <td class="px-6 py-4">
                <div class="flex gap-2">
                  <button
                    @click="openEngineConfig(key.id, key.name)"
                    class="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                  >⚙️</button>
                  <button
                    @click="keysStore.toggleKeyStatus(key.id, !key.active)"
                    class="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                  >{{ key.active ? 'Disable' : 'Enable' }}</button>
                  <button
                    @click="keysStore.deleteKey(key.id)"
                    class="px-2 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                  >Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Engine Config Modal -->
    <EngineConfigModal
      v-if="configModalKeyId"
      :key-id="configModalKeyId"
      :key-name="configModalKeyName"
      @close="configModalKeyId = null"
    />
  </AppLayout>
</template>

