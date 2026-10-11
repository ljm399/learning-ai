import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../view/LoginView.vue'
import ChatView from '../view/ChatView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/chat', name: 'chat', component: ChatView },
  ],
})

router.beforeEach((to, _from) => {
  const token = localStorage.getItem('token')
  if (!token && to.path !== '/login') {
    return "/login"
  }
  return true;
})

export default router
