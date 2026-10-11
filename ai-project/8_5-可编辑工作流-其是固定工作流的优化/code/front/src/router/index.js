import { createRouter, createWebHistory } from 'vue-router'
import Chat from '../page/chat.vue'
import FlowEditor from '../page/FlowEditor.vue'

const routes = [
  {
    path: '/',
    name: 'Chat',
    component: Chat
  },
  {
    path: '/flow-editor',
    name: 'FlowEditor',
    component: FlowEditor
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
