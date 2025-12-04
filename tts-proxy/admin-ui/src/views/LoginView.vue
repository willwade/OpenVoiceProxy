<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const apiKey = ref('')

async function handleLogin() {
  const success = await authStore.login(apiKey.value)
  if (success) {
    router.push({ name: 'dashboard' })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="max-w-md w-full">
      <div class="bg-white rounded-lg shadow-lg p-8">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-gray-900">OpenVoiceProxy</h1>
          <p class="text-gray-600 mt-2">Admin Dashboard</p>
        </div>

        <!-- Dev Mode Banner -->
        <div v-if="authStore.isDevelopmentMode" class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p class="text-green-800 text-sm">
            <strong>🔧 Development Mode</strong><br>
            Authentication is bypassed in local development.
          </p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div>
            <label for="apiKey" class="block text-sm font-medium text-gray-700 mb-2">
              Admin API Key
            </label>
            <input
              id="apiKey"
              v-model="apiKey"
              type="password"
              required
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your admin API key"
            />
          </div>

          <div v-if="authStore.error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p class="text-red-800 text-sm">{{ authStore.error }}</p>
          </div>

          <button
            type="submit"
            :disabled="authStore.isLoading"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {{ authStore.isLoading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <!-- SSO Placeholder -->
        <div class="mt-8 pt-6 border-t border-gray-200">
          <p class="text-center text-sm text-gray-500 mb-4">Or continue with</p>
          <div class="flex gap-3">
            <button
              @click="authStore.loginWithSSO('google')"
              class="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              disabled
            >
              Google
            </button>
            <button
              @click="authStore.loginWithSSO('github')"
              class="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              disabled
            >
              GitHub
            </button>
            <button
              @click="authStore.loginWithSSO('microsoft')"
              class="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              disabled
            >
              Microsoft
            </button>
          </div>
          <p class="text-center text-xs text-gray-400 mt-3">SSO coming soon</p>
        </div>
      </div>
    </div>
  </div>
</template>

