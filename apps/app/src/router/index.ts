import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// NOTE: This deployment is intentionally trimmed (app.quikfill.io) — sign-in
// plus a small Settings area (Billing, Account, Configuration). The full
// dashboard routes below (Home, Data, Generators, …) are commented out (not
// deleted) so they can be restored later by un-commenting and re-adding their
// nav entries in `layouts/AppLayout.vue`.
const routes: RouteRecordRaw[] = [
  {
    // Root redirects to the billing screen (the primary authenticated surface).
    path: '/',
    redirect: '/settings/billing',
  },
  // --- Dashboard routes (disabled for the billing-only deployment) ----------
  // {
  //   path: '/',
  //   name: 'home',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Home' },
  //   component: () => import('@/views/Home.vue'),
  // },
  // {
  //   path: '/data',
  //   name: 'data',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Data' },
  //   component: () => import('@/views/Data.vue'),
  // },
  // {
  //   path: '/generators',
  //   name: 'generators',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Generators' },
  //   component: () => import('@/views/Generators.vue'),
  // },
  // {
  //   path: '/apps',
  //   name: 'apps',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Apps' },
  //   component: () => import('@/views/Apps.vue'),
  // },
  // {
  //   path: '/form-profiles',
  //   name: 'form-profiles',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Form Profiles' },
  //   component: () => import('@/views/FormProfiles.vue'),
  // },
  // {
  //   path: '/form-profiles/:id',
  //   name: 'form-profile-detail',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Mapping Review' },
  //   component: () => import('@/views/FormProfileDetail.vue'),
  // },
  // {
  //   path: '/fill-history',
  //   name: 'fill-history',
  //   meta: { layout: 'app', requiresAuth: true, title: 'Fill History' },
  //   component: () => import('@/views/FillHistory.vue'),
  // },
  // --------------------------------------------------------------------------
  // Settings area — Billing keeps the route name `billing` so existing
  // `{ name: 'billing' }` navigations and the guard fallbacks still resolve.
  {
    path: '/settings',
    redirect: '/settings/account',
  },
  {
    path: '/settings/billing',
    name: 'billing',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/Billing.vue'),
  },
  {
    path: '/settings/account',
    name: 'settings-account',
    meta: { layout: 'app', requiresAuth: true, title: 'Account' },
    component: () => import('@/views/Account.vue'),
  },
  {
    path: '/settings/setup',
    name: 'settings-setup',
    meta: { layout: 'app', requiresAuth: true, title: 'Setup' },
    component: () => import('@/views/Setup.vue'),
  },
  // Back-compat: old bookmarks / links to /settings/config.
  {
    path: '/settings/config',
    redirect: '/settings/setup',
  },
  // Back-compat: old bookmarks / links to /billing.
  {
    path: '/billing',
    redirect: '/settings/billing',
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
    // Admin-only. The admin area hangs off /admin/*. Guarded by requiresAdmin in
    // the navigation guard.
    path: '/admin/analytics',
    name: 'admin-analytics',
    meta: { layout: 'app', requiresAuth: true, requiresAdmin: true, title: 'Analytics' },
    component: () => import('@/views/AdminAnalytics.vue'),
  },
  {
    path: '/admin/beta-users',
    name: 'admin-beta-users',
    meta: { layout: 'app', requiresAuth: true, requiresAdmin: true, title: 'Beta Users' },
    component: () => import('@/views/AdminBetaUsers.vue'),
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
  // Admin-only routes fall back to billing for signed-in non-admins.
  if (to.meta.requiresAdmin && !auth.user?.isAdmin) {
    return { path: '/settings/billing' }
  }
  if (to.name === 'sign-in' && auth.isAuthenticated) {
    return { path: '/settings/billing' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · QuikFill` : 'QuikFill'
})

export default router
