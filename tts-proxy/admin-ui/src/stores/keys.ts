import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import type { ApiKey, CreateKeyRequest, CreateKeyResponse, EngineConfig } from '@/types'

export const useKeysStore = defineStore('keys', () => {
  const authStore = useAuthStore()
  
  // State
  const keys = ref<ApiKey[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastCreatedKey = ref<string | null>(null)

  // Actions
  async function fetchKeys(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/admin/api/keys', {
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        keys.value = data.keys
      } else {
        error.value = 'Failed to fetch keys'
      }
    } catch (e) {
      error.value = 'Connection error'
    } finally {
      isLoading.value = false
    }
  }

  async function createKey(request: CreateKeyRequest): Promise<CreateKeyResponse | null> {
    isLoading.value = true
    error.value = null
    lastCreatedKey.value = null

    try {
      const response = await fetch('/admin/api/keys', {
        method: 'POST',
        headers: authStore.getHeaders(true),
        body: JSON.stringify(request)
      })

      if (response.ok) {
        const data = await response.json()
        // API returns { message, key: { id, key, name, ... } }
        const keyData: CreateKeyResponse = data.key
        lastCreatedKey.value = keyData.key
        await fetchKeys()
        return keyData
      } else {
        const errData = await response.json()
        error.value = errData.error || 'Failed to create key'
        return null
      }
    } catch (e) {
      error.value = 'Connection error'
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function toggleKeyStatus(keyId: string, active: boolean): Promise<boolean> {
    try {
      const response = await fetch(`/admin/api/keys/${keyId}`, {
        method: 'PUT',
        headers: authStore.getHeaders(true),
        body: JSON.stringify({ active })
      })

      if (response.ok) {
        await fetchKeys()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function deleteKey(keyId: string): Promise<boolean> {
    try {
      const response = await fetch(`/admin/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        await fetchKeys()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function getEngineConfig(keyId: string): Promise<Record<string, EngineConfig> | null> {
    try {
      const response = await fetch(`/admin/api/keys/${keyId}/engines`, {
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        return data.engineConfig || {}
      }
      return null
    } catch {
      return null
    }
  }

  async function updateEngineConfig(keyId: string, engineConfig: Record<string, EngineConfig>): Promise<boolean> {
    try {
      const response = await fetch(`/admin/api/keys/${keyId}/engines`, {
        method: 'PUT',
        headers: authStore.getHeaders(true),
        body: JSON.stringify({ engineConfig })
      })

      return response.ok
    } catch {
      return false
    }
  }

  return {
    keys,
    isLoading,
    error,
    lastCreatedKey,
    fetchKeys,
    createKey,
    toggleKeyStatus,
    deleteKey,
    getEngineConfig,
    updateEngineConfig,
  }
})

