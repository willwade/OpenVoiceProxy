import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import { ENGINE_DEFINITIONS } from '@/types'

export interface SystemCredentials {
  [engineId: string]: {
    [field: string]: string
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const authStore = useAuthStore()
  
  // State
  const credentials = ref<SystemCredentials>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isSaving = ref(false)

  // Actions
  async function fetchCredentials(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/admin/api/settings/credentials', {
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        credentials.value = data.credentials || {}
      } else {
        error.value = 'Failed to fetch credentials'
      }
    } catch (e) {
      error.value = 'Connection error'
    } finally {
      isLoading.value = false
    }
  }

  async function saveCredentials(engineId: string, creds: Record<string, string>): Promise<boolean> {
    isSaving.value = true
    error.value = null

    try {
      const response = await fetch(`/admin/api/settings/credentials/${engineId}`, {
        method: 'PUT',
        headers: authStore.getHeaders(true),
        body: JSON.stringify({ credentials: creds })
      })

      if (response.ok) {
        credentials.value[engineId] = creds
        return true
      } else {
        const data = await response.json()
        error.value = data.error || 'Failed to save credentials'
        return false
      }
    } catch (e) {
      error.value = 'Connection error'
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function testCredentials(engineId: string): Promise<{ valid: boolean; message: string }> {
    try {
      const response = await fetch(`/admin/api/settings/credentials/${engineId}/test`, {
        method: 'POST',
        headers: authStore.getHeaders()
      })

      const data = await response.json()
      return { valid: data.valid, message: data.message }
    } catch {
      return { valid: false, message: 'Connection error' }
    }
  }

  function getCredentialFields(engineId: string): string[] {
    return ENGINE_DEFINITIONS[engineId]?.keyFields || []
  }

  function hasCredentials(engineId: string): boolean {
    const creds = credentials.value[engineId]
    if (!creds) return false
    const fields = getCredentialFields(engineId)
    return fields.every(f => creds[f] && creds[f].length > 0)
  }

  return {
    credentials,
    isLoading,
    error,
    isSaving,
    fetchCredentials,
    saveCredentials,
    testCredentials,
    getCredentialFields,
    hasCredentials,
  }
})

