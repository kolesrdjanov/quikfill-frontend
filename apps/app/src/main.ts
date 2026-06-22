import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import 'vue-sonner/style.css'
import App from './App.vue'
import router from './router'
import { api, onAuthError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { createExtensionHandoffBridge } from '@/lib/extension-handoff'
import { useTheme } from '@/composables/useTheme'
import './assets/index.css'

useTheme().init()

const app = createApp(App)
app.use(createPinia())
app.use(router)

// When a token refresh fails, drop the local session and bounce to sign-in.
onAuthError(() => {
  useAuthStore().forceSignOut()
  void router.push({ name: 'sign-in' })
})

// Zero-click extension session handoff: when the QuikFill extension announces
// itself on this page, hand it a one-time code so it can adopt its own session
// without a second sign-in. Only a code ever crosses — never tokens. Fires on the
// hello (if already signed in) and again right after sign-in (if it arrived first).
const authStore = useAuthStore()
const extensionHandoff = createExtensionHandoffBridge({
  origin: window.location.origin,
  isSignedIn: () => authStore.isAuthenticated,
  mintCode: async () => (await api.auth.createHandoff()).code,
  target: window,
})
extensionHandoff.start()
watch(
  () => authStore.isAuthenticated,
  (signedIn) => {
    if (signedIn) extensionHandoff.notifySignedIn()
  },
)

app.mount('#app')
