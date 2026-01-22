<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { useVoicesStore } from '@/stores/voices'
import type { Voice, VoiceSettings } from '@/types'

const voicesStore = useVoicesStore()

// Test panel state
const testText = ref('Hello, this is a test of the text-to-speech system.')
const voiceSettings = ref<VoiceSettings>({
  speed: 1.0,
  pitch: 0
})

// Audio state
const audioUrl = ref<string | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const audioDuration = ref(0)
const audioCurrentTime = ref(0)

// Character count
const maxChars = 1000
const charCount = ref(testText.value.length)

watch(testText, (newText) => {
  charCount.value = newText.length
})

onMounted(() => {
  voicesStore.fetchVoices()
})

function selectVoice(voice: Voice) {
  voicesStore.selectVoice(voice)
  // Clear previous audio when selecting new voice
  clearAudio()
}

function clearAudio() {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
  }
  isPlaying.value = false
  audioDuration.value = 0
  audioCurrentTime.value = 0
}

async function playSpeech() {
  if (!voicesStore.selectedVoice || !testText.value.trim()) return

  clearAudio()

  try {
    const blob = await voicesStore.synthesize(
      voicesStore.selectedVoice.voice_id,
      testText.value,
      voiceSettings.value
    )

    audioUrl.value = URL.createObjectURL(blob)

    // Set up audio element for duration tracking
    const audio = new Audio(audioUrl.value)
    audio.addEventListener('loadedmetadata', () => {
      audioDuration.value = audio.duration
    })
    audio.addEventListener('timeupdate', () => {
      audioCurrentTime.value = audio.currentTime
    })
    audio.addEventListener('ended', () => {
      isPlaying.value = false
      audioCurrentTime.value = 0
    })
    audioElement.value = audio

    // Auto-play immediately
    audio.play()
      .then(() => {
        isPlaying.value = true
      })
      .catch((err) => {
        console.error('Error playing audio:', err)
      })
  } catch (e) {
    // Error is handled in store
  }
}

function playAudio() {
  if (!audioElement.value) return

  audioElement.value.play()
    .then(() => {
      isPlaying.value = true
    })
    .catch((err) => {
      console.error('Error playing audio:', err)
      alert(`Failed to play audio: ${err.message}. Try clicking anywhere on the page first.`)
    })
}

function pauseAudio() {
  if (!audioElement.value) return
  audioElement.value.pause()
  isPlaying.value = false
}

function downloadAudio() {
  if (!audioUrl.value || !voicesStore.selectedVoice) return

  const a = document.createElement('a')
  a.href = audioUrl.value
  a.download = `${voicesStore.selectedVoice.name.replace(/\s+/g, '-')}-test.mp3`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getGenderBadgeClass(gender: string | undefined): string {
  switch (gender?.toLowerCase()) {
    case 'male':
      return 'bg-blue-100 text-blue-800'
    case 'female':
      return 'bg-pink-100 text-pink-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
</script>

<template>
  <AppLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">Test Voices</h2>
        <button
          @click="voicesStore.fetchVoices()"
          :disabled="voicesStore.isLoading"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {{ voicesStore.isLoading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <p v-if="voicesStore.lastFetched" class="text-sm text-gray-500">
        Last updated: {{ new Date(voicesStore.lastFetched).toLocaleString() }}
      </p>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex flex-wrap gap-4 items-center">
          <!-- Engine Filter -->
          <div class="flex-1 min-w-[150px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Engine</label>
            <select
              v-model="voicesStore.engineFilter"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Engines</option>
              <option v-for="engine in voicesStore.availableEngines" :key="engine" :value="engine">
                {{ engine }}
              </option>
            </select>
          </div>

          <!-- Language Filter -->
          <div class="flex-1 min-w-[150px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              v-model="voicesStore.languageFilter"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Languages</option>
              <option v-for="lang in voicesStore.availableLanguages" :key="lang" :value="lang">
                {{ lang }}
              </option>
            </select>
          </div>

          <!-- Gender Filter -->
          <div class="flex-1 min-w-[150px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select
              v-model="voicesStore.genderFilter"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <!-- Search -->
          <div class="flex-[2] min-w-[200px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              v-model="voicesStore.searchQuery"
              type="text"
              placeholder="Search voices..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <!-- Clear Filters -->
          <div class="self-end">
            <button
              @click="voicesStore.clearFilters()"
              class="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="voicesStore.isLoading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-2 text-gray-600">Loading voices...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="voicesStore.error" class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {{ voicesStore.error }}
      </div>

      <!-- No Voices -->
      <div v-else-if="voicesStore.voices.length === 0" class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <h3 class="font-medium text-yellow-800">No voices available</h3>
        <p class="mt-2 text-yellow-700">
          Configure TTS engines in the Engines page to enable voice synthesis.
        </p>
      </div>

      <!-- Main Content -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Voice List -->
        <div class="lg:col-span-2 space-y-4">
          <div class="text-sm text-gray-500 mb-2">
            Showing {{ voicesStore.filteredVoices.length }} of {{ voicesStore.voices.length }} voices
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto p-1">
            <div
              v-for="voice in voicesStore.filteredVoices"
              :key="voice.voice_id"
              @click="selectVoice(voice)"
              :class="[
                'bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-md',
                voicesStore.selectedVoice?.voice_id === voice.voice_id
                  ? 'ring-2 ring-blue-500 bg-blue-50'
                  : 'hover:bg-gray-50'
              ]"
            >
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-semibold text-gray-900 truncate" :title="voice.name">
                  {{ voice.name }}
                </h3>
                <span
                  class="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ml-2"
                  :class="getGenderBadgeClass(voice.labels.gender)"
                >
                  {{ voice.labels.gender || 'Unknown' }}
                </span>
              </div>
              <div class="space-y-1 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-gray-500">Engine:</span>
                  <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                    {{ voice.labels.engine }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-500">Language:</span>
                  <span class="text-gray-700">{{ voice.labels.language || 'Unknown' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Test Panel -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-lg shadow p-6 sticky top-4">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Test Panel</h3>

            <div v-if="!voicesStore.selectedVoice" class="text-center py-8 text-gray-500">
              Select a voice from the list to test it
            </div>

            <div v-else class="space-y-4">
              <!-- Selected Voice Info -->
              <div class="bg-blue-50 rounded-lg p-3">
                <div class="font-medium text-blue-900">{{ voicesStore.selectedVoice.name }}</div>
                <div class="text-sm text-blue-700">
                  {{ voicesStore.selectedVoice.labels.engine }} - {{ voicesStore.selectedVoice.labels.language }}
                </div>
              </div>

              <!-- Text Input -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Text to synthesize
                </label>
                <textarea
                  v-model="testText"
                  rows="4"
                  :maxlength="maxChars"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Enter text to synthesize..."
                ></textarea>
                <div class="text-xs text-gray-500 text-right mt-1">
                  {{ charCount }} / {{ maxChars }}
                </div>
              </div>

              <!-- Voice Settings -->
              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Speed: {{ voiceSettings.speed?.toFixed(1) }}
                  </label>
                  <input
                    v-model.number="voiceSettings.speed"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Pitch: {{ voiceSettings.pitch }}
                  </label>
                  <input
                    v-model.number="voiceSettings.pitch"
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              <!-- Play Button -->
              <button
                @click="playSpeech"
                :disabled="voicesStore.isSynthesizing || !testText.trim()"
                class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg v-if="!voicesStore.isSynthesizing" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                {{ voicesStore.isSynthesizing ? 'Loading...' : 'Play' }}
              </button>

              <!-- Audio Player -->
              <div v-if="audioUrl" class="space-y-3">
                <div class="bg-gray-100 rounded-lg p-3">
                  <div class="flex items-center gap-3">
                    <button
                      v-if="!isPlaying"
                      @click="playAudio"
                      class="w-8 h-8 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white rounded-full transition-colors"
                    >
                      <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </button>
                    <button
                      v-else
                      @click="pauseAudio"
                      class="w-8 h-8 flex items-center justify-center bg-yellow-600 hover:bg-yellow-700 text-white rounded-full transition-colors"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                      </svg>
                    </button>
                    <div class="flex-1">
                      <div class="h-1.5 bg-gray-300 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-green-600 transition-all"
                          :style="{ width: audioDuration ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%' }"
                        ></div>
                      </div>
                    </div>
                    <span class="text-xs text-gray-500 font-mono">
                      {{ formatTime(audioCurrentTime) }}
                    </span>
                    <button
                      @click="downloadAudio"
                      class="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-full transition-colors"
                      title="Download"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Synthesis Error -->
              <div v-if="voicesStore.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {{ voicesStore.error }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
