import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    meta: { layout: 'app', requiresAuth: true, title: 'Home' },
    component: () => import('@/views/Home.vue'),
  },
  {
    path: '/data',
    name: 'data',
    meta: { layout: 'app', requiresAuth: true, title: 'Data' },
    component: () => import('@/views/Data.vue'),
  },
  {
    path: '/generators',
    name: 'generators',
    meta: { layout: 'app', requiresAuth: true, title: 'Generators' },
    component: () => import('@/views/Generators.vue'),
  },
  {
    path: '/apps',
    name: 'apps',
    meta: { layout: 'app', requiresAuth: true, title: 'Apps' },
    component: () => import('@/views/Apps.vue'),
  },
  {
    path: '/form-profiles',
    name: 'form-profiles',
    meta: { layout: 'app', requiresAuth: true, title: 'Form Profiles' },
    component: () => import('@/views/FormProfiles.vue'),
  },
  {
    path: '/form-profiles/:id',
    name: 'form-profile-detail',
    meta: { layout: 'app', requiresAuth: true, title: 'Mapping Review' },
    component: () => import('@/views/FormProfileDetail.vue'),
  },
  {
    path: '/fill-history',
    name: 'fill-history',
    meta: { layout: 'app', requiresAuth: true, title: 'Fill History' },
    component: () => import('@/views/FillHistory.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    meta: { layout: 'app', requiresAuth: true, title: 'Settings' },
    component: () => import('@/views/Settings.vue'),
  },
  {
    path: '/billing',
    name: 'billing',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/Billing.vue'),
  },
  {
    path: '/billing/success',
    name: 'billing-success',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/BillingSuccess.vue'),
  },
  {
    path: '/billing/cancel',
    name: 'billing-cancel',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/BillingCancel.vue'),
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    meta: { layout: 'auth', title: 'Sign in' },
    component: () => import('@/views/SignIn.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    meta: { layout: 'auth', title: 'Not found' },
    component: () => import('@/views/NotFound.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'sign-in', query: to.fullPath === '/' ? undefined : { redirect: to.fullPath } }
  }
  if (to.name === 'sign-in' && auth.isAuthenticated) {
    return { path: '/' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · QuikFill` : 'QuikFill'
})

export default router
