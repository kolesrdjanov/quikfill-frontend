import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/sign-in',
    name: 'sign-in',
    meta: { layout: 'auth' },
    component: () => import('@/views/SignIn.vue'),
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    meta: { layout: 'app' },
    component: () => import('@/views/Dashboard.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    meta: { layout: 'auth' },
    component: () => import('@/views/NotFound.vue'),
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
