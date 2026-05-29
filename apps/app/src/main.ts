import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vue-sonner/style.css'
import App from './App.vue'
import router from './router'
import { onAuthError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
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

app.mount('#app')
