import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import type { EnginesStatusResponse, EngineStatus } from '@/types'

export const useEnginesStore = defineStore('engines', () => {
  const authStore = useAuthStore()
  
  // State
  const enginesStatus = ref<Record<string, EngineStatus>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastChecked = ref<string | null>(null)

  // Actions
  async function fetchEnginesStatus(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/admin/api/engines/status', {
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        const data: EnginesStatusResponse = await response.json()
        enginesStatus.value = data.engines
        lastChecked.value = data.timestamp
      } else {
        error.value = 'Failed to fetch engine status'
      }
    } catch (e) {
      error.value = 'Connection error'
    } finally {
      isLoading.value = false
    }
  }

  // Alias for backward compatibility
  const engines = enginesStatus

  return {
    enginesStatus,
    engines,
    isLoading,
    error,
    lastChecked,
    fetchEnginesStatus,
  }
})

