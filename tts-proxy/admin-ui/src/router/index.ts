import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

// Check if CLI Config should be enabled (default: true in dev, false in production)
const enableCliConfig = import.meta.env.VITE_ENABLE_CLI_CONFIG !== 'false'

const routes = [
  {
    path: "/",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/keys",
    name: "keys",
    component: () => import("@/views/KeysView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/engines",
    name: "engines",
    component: () => import("@/views/EnginesView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
  },
]

// Conditionally add CLI Config route
if (enableCliConfig) {
  routes.splice(4, 0, {
    path: "/cli-config",
    name: "cli-config",
    component: () => import("@/views/CLIConfigView.vue"),
    meta: { requiresAuth: true },
  })
}

const router = createRouter({
  history: createWebHistory("/admin/"),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Always check dev mode once per session so Electron/LOCAL_MODE sets admin context
  if (!authStore.hasCheckedDevMode) {
    await authStore.checkDevelopmentMode();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: "login" });
  } else if (to.name === "login" && authStore.isAuthenticated) {
    next({ name: "dashboard" });
  } else {
    next();
  }
});

export default router;
