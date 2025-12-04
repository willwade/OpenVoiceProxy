<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

function handleLogout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-8">
            <h1 class="text-xl font-bold text-gray-900">OpenVoiceProxy</h1>
            <nav class="hidden md:flex gap-6">
              <router-link 
                to="/" 
                class="text-gray-600 hover:text-gray-900 transition-colors"
                active-class="text-blue-600 font-medium"
              >
                Dashboard
              </router-link>
              <router-link 
                to="/keys" 
                class="text-gray-600 hover:text-gray-900 transition-colors"
                active-class="text-blue-600 font-medium"
              >
                API Keys
              </router-link>
              <router-link 
                to="/engines" 
                class="text-gray-600 hover:text-gray-900 transition-colors"
                active-class="text-blue-600 font-medium"
              >
                Engines
              </router-link>
            </nav>
          </div>
          <div class="flex items-center gap-4">
            <span v-if="authStore.isDevelopmentMode" class="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
              Dev Mode
            </span>
            <span class="text-sm text-gray-600">{{ authStore.user?.name }}</span>
            <button
              @click="handleLogout"
              class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>
  </div>
</template>

