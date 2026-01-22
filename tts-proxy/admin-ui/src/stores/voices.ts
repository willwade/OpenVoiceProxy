import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import type { Voice, VoicesResponse, VoiceSettings } from '@/types'

export const useVoicesStore = defineStore('voices', () => {
  const authStore = useAuthStore()

  // State
  const voices = ref<Voice[]>([])
  const selectedVoice = ref<Voice | null>(null)
  const isLoading = ref(false)
  const isSynthesizing = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<string | null>(null)

  // Filter state
  const engineFilter = ref<string>('')
  const languageFilter = ref<string>('')
  const genderFilter = ref<string>('')
  const searchQuery = ref('')

  // Computed
  const availableEngines = computed(() => {
    const engines = new Set(voices.value.map(v => v.labels.engine))
    return Array.from(engines).sort()
  })

  const availableLanguages = computed(() => {
    const languages = new Set(voices.value.map(v => v.labels.language).filter(Boolean))
    return Array.from(languages).sort()
  })

  const filteredVoices = computed(() => {
    return voices.value.filter(voice => {
      // Engine filter
      if (engineFilter.value && voice.labels.engine !== engineFilter.value) {
        return false
      }

      // Language filter
      if (languageFilter.value && voice.labels.language !== languageFilter.value) {
        return false
      }

      // Gender filter
      if (genderFilter.value && voice.labels.gender !== genderFilter.value) {
        return false
      }

      // Search query
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        return (
          voice.name.toLowerCase().includes(query) ||
          voice.description.toLowerCase().includes(query) ||
          voice.labels.engine.toLowerCase().includes(query) ||
          (voice.labels.language?.toLowerCase().includes(query) ?? false)
        )
      }

      return true
    })
  })

  // Actions
  async function fetchVoices(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/v1/voices', {
        headers: authStore.getHeaders()
      })

      if (response.ok) {
        const data: VoicesResponse = await response.json()
        voices.value = data.voices
        lastFetched.value = new Date().toISOString()
      } else {
        error.value = 'Failed to fetch voices'
      }
    } catch (e) {
      error.value = 'Connection error while fetching voices'
    } finally {
      isLoading.value = false
    }
  }

  async function synthesize(
    voiceId: string,
    text: string,
    settings?: VoiceSettings
  ): Promise<Blob> {
    isSynthesizing.value = true
    error.value = null

    try {
      const response = await fetch(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          ...authStore.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice_settings: settings,
          output_format: 'mp3_44100_128'
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error?.message || `Synthesis failed: ${response.status}`)
      }

      return await response.blob()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Synthesis failed'
      error.value = message
      throw e
    } finally {
      isSynthesizing.value = false
    }
  }

  function selectVoice(voice: Voice | null): void {
    selectedVoice.value = voice
  }

  function clearFilters(): void {
    engineFilter.value = ''
    languageFilter.value = ''
    genderFilter.value = ''
    searchQuery.value = ''
  }

  return {
    // State
    voices,
    selectedVoice,
    isLoading,
    isSynthesizing,
    error,
    lastFetched,
    // Filters
    engineFilter,
    languageFilter,
    genderFilter,
    searchQuery,
    // Computed
    availableEngines,
    availableLanguages,
    filteredVoices,
    // Actions
    fetchVoices,
    synthesize,
    selectVoice,
    clearFilters,
  }
})
