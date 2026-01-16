import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  // State
  const apiKey = ref<string | null>(localStorage.getItem('adminApiKey'))
  const user = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isDevelopmentMode = ref(false)
  const hasCheckedDevMode = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!apiKey.value || isDevelopmentMode.value)
  const isAdmin = computed(() => user.value?.isAdmin ?? false)

  // Actions
  async function checkDevelopmentMode(): Promise<boolean> {
    // Only hit the endpoint once per session; guards that skip auth due to cached API keys
    // should still run this to populate admin context in LOCAL_MODE/Electron builds.
    if (hasCheckedDevMode.value) return isDevelopmentMode.value

    try {
      const response = await fetch('/admin/api/mode')
      if (response.ok) {
        const data = await response.json()
        const allowDev =
          data?.isDevelopmentMode ||
          data?.localMode ||
          (data?.mode === 'development' && data?.requiresAuth === false)
        if (allowDev) {
          isDevelopmentMode.value = true
          user.value = { id: 'dev', name: 'Development User', isAdmin: true }
          hasCheckedDevMode.value = true
          return true
        }
      }
    } catch {
      // Connection error, production mode
    }
    hasCheckedDevMode.value = true
    return false
  }

  async function login(key: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/admin/api/keys', {
        headers: { 'X-API-Key': key }
      })

      if (response.ok) {
        apiKey.value = key
        localStorage.setItem('adminApiKey', key)
        user.value = { id: 'api-key', name: 'Admin', isAdmin: true }
        return true
      } else {
        error.value = 'Invalid API key'
        return false
      }
    } catch (e) {
      error.value = 'Connection error'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function logout() {
    apiKey.value = null
    user.value = null
    localStorage.removeItem('adminApiKey')
  }

  function getHeaders(includeContentType = false): Record<string, string> {
    const headers: Record<string, string> = {}
    if (apiKey.value) {
      headers['X-API-Key'] = apiKey.value
    }
    if (includeContentType) {
      headers['Content-Type'] = 'application/json'
    }
    return headers
  }

  // SSO-ready methods (placeholder for future implementation)
  async function loginWithSSO(_provider: 'google' | 'github' | 'microsoft'): Promise<boolean> {
    // TODO: Implement SSO with provider
    error.value = 'SSO not yet implemented'
    return false
  }

  async function handleSSOCallback(_code: string): Promise<boolean> {
    // TODO: Handle SSO callback
    return false
  }

  return {
    // State
    apiKey,
    user,
    isLoading,
    error,
    isDevelopmentMode,
    hasCheckedDevMode,
    // Getters
    isAuthenticated,
    isAdmin,
    // Actions
    checkDevelopmentMode,
    login,
    logout,
    getHeaders,
    loginWithSSO,
    handleSSOCallback,
  }
})
