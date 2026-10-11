<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Markdown from '@/components/Markdown.vue'

import { getChatList, getChatDetail, createChat, sendChatMessage } from '@/api/chat.js'
import { uploadImage } from '@/api/upload.js'

const route = useRoute()
const router = useRouter()

const histories = ref([])
const messages = ref([])

async function loadChatDetail(cid) {
  if (!cid) return
  const detailRes = await getChatDetail(cid)
  messages.value = detailRes.data?.messages || []
}

onMounted(async () => {
  getChatList().then((res) => {
    histories.value = res.data || []
  })

  const cid = route.query.cid
  if (cid) {
    await loadChatDetail(cid)
  } else {
    const createRes = await createChat()

    if (createRes.data && createRes.data.cid) {

      router.replace({ query: { ...route.query, cid: createRes.data.cid } })
      messages.value = []
    }
  }
})

watch(() => route.query.cid, async (newCid) => {
  if (newCid) {
    await loadChatDetail(newCid)
  }
})

async function selectHistory(item) {
  if (route.query.cid === String(item.cid)) return
  inputText.value = ''
  await router.push({ query: { ...route.query, cid: item.cid } })
}

async function startNewChat() {
  inputText.value = ''
  const createRes = await createChat()

  if (createRes.data && createRes.data.cid) {

    await router.push({ query: { ...route.query, cid: createRes.data.cid } })
    messages.value = []
  }
}


const inputText = ref('')
const isThinking = ref(false)
const previewUrl = ref('')
const fileInputRef = ref(null)
const isUploading = ref(false)
const showOnlineInput = ref(false)
const onlineUrl = ref('')

function triggerUpload() {
  fileInputRef.value?.click()
}



async function handleFileChange(e) {
  //提取文件并上传
  const file = e.target.files?.[0]
  if (!file) return
  isUploading.value = true

  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await uploadImage(formData)
    previewUrl.value = res.data?.url || res.data || ''
  } catch {
    alert('图片上传失败')
  } finally {
    isUploading.value = false
    e.target.value = ''
  }
}

function removePreview() {
  previewUrl.value = ''
}

function handleUserSend(text) {
  sendMessage(text)
}


//为了避免干扰，sendMessage作为独立方法，点击事件单独使用clickSend
function clickSend() {
  sendMessage(inputText.value)
}

async function sendMessage(sendText) {

  let text = sendText
  if (!text) return

  const imageUrl = previewUrl.value

  const userMessage = {
    role: 'user',
    content: imageUrl
      ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]
      : text,
  }

  messages.value.push(userMessage)
  inputText.value = ''
  previewUrl.value = ''
  isThinking.value = true

  try {
    await sendChatMessage(
      { message: userMessage.content, cid: route.query.cid },
      (chunk) => {
        if (chunk && typeof chunk === 'object') {
          const existing = messages.value.find((m) => m.id === chunk.id)
          if (existing) {
            existing.content += chunk.content || ''
          } else {
            isThinking.value = false
            messages.value.push({
              id: chunk.id,
              role: chunk.type || 'assistant',
              content: chunk.content || '',
            })
          }
        }
      }
    )
  } catch (e) {

  }
}
</script>

<template>
  <div class="chat-page">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h3>历史记录</h3>
        <button class="new-chat" @click="startNewChat">+ 新对话</button>
      </div>

      <ul class="history-list">
        <li v-for="item in histories" :key="item.cid"
          :class="['history-item', { active: String(route.query.cid) === String(item.cid) }]"
          @click="selectHistory(item)">
          {{ item.title }}
        </li>
      </ul>
    </aside>

    <main class="chat-main">
      <div class="chat-messages">
        <template v-for="msg in messages.filter(m => m.content)" :key="msg.id">

          <div v-if="msg.role === 'user' || msg.role === 'assistant'" :class="['message', msg.role]">
            <div class="avatar">{{ msg.role === 'assistant' ? 'AI' : '我' }}</div>
            <div class="bubble">
              <Markdown :content="msg.content" @userSend="handleUserSend"></Markdown>
            </div>
          </div>
        </template>
        <div v-if="isThinking" class="message thinking">
          <div class="avatar">AI</div>
          <div class="bubble">
            <span class="thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            思考中
          </div>
        </div>
      </div>

      <div v-if="previewUrl" class="upload-preview">
        <img :src="previewUrl" alt="preview" />
        <span class="remove-preview" @click="removePreview">×</span>
      </div>

      <div v-if="showOnlineInput" class="online-input-bar">
        <input v-model="onlineUrl" type="text" placeholder="请输入图片在线地址..." />
        <button class="confirm-btn" @click="confirmOnlineUrl">确认</button>
        <button class="cancel-btn" @click="toggleOnlineInput">取消</button>
      </div>

      <div class="chat-input-bar">
        <input v-model="inputText" type="text" placeholder="请输入你的问题..." />
        <button class="upload-btn" :disabled="isUploading" @click="triggerUpload">
          {{ isUploading ? '上传中' : '上传形象照' }}
        </button>
        <button @click="clickSend()">发送</button>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
    </main>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 260px;
  background: #1e1e2e;
  color: #fff;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #333;
}

.sidebar-header h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.new-chat {
  width: 100%;
  padding: 8px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  overflow-y: auto;
}

.history-item {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item:hover {
  background: #2d2d44;
  color: #fff;
}

.history-item.active {
  background: #2d2d44;
  color: #fff;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.chat-messages {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.message.user .avatar {
  background: #67c23a;
}

.bubble {
  max-width: 60%;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  background: #fff;
  color: #333;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.message.user .bubble {
  background: #409eff;
  color: #fff;
}

.chat-input-bar {
  display: flex;
  gap: 10px;
  padding: 12px 24px 20px;
  background: #fff;
  border-top: 1px solid #e5e5e5;
}

.chat-input-bar input {
  flex: 1;
  height: 40px;
  padding: 0 14px;
  border: 1px solid #dcdcdc;
  border-radius: 20px;
  font-size: 14px;
}

.chat-input-bar input:focus {
  outline: none;
  border-color: #409eff;
}

.chat-input-bar button {
  height: 40px;
  padding: 0 24px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
}

.chat-input-bar button:hover {
  background: #66b1ff;
}

.chat-input-bar .upload-btn {
  background: #67c23a;
}

.chat-input-bar .upload-btn:hover {
  background: #85ce61;
}

.chat-input-bar .upload-btn:disabled {
  background: #a6c99a;
  cursor: not-allowed;
}

.chat-input-bar .online-btn {
  background: #e6a23c;
}

.chat-input-bar .online-btn:hover {
  background: #ebb563;
}

.online-input-bar {
  display: flex;
  gap: 10px;
  padding: 12px 24px 0;
  background: #fff;
  border-top: 1px solid #e5e5e5;
}

.online-input-bar input {
  flex: 1;
  height: 36px;
  padding: 0 14px;
  border: 1px solid #dcdcdc;
  border-radius: 18px;
  font-size: 14px;
}

.online-input-bar input:focus {
  outline: none;
  border-color: #e6a23c;
}

.online-input-bar button {
  height: 36px;
  padding: 0 18px;
  color: #fff;
  border: none;
  border-radius: 18px;
  font-size: 14px;
  cursor: pointer;
}

.online-input-bar .confirm-btn {
  background: #67c23a;
}

.online-input-bar .confirm-btn:hover {
  background: #85ce61;
}

.online-input-bar .cancel-btn {
  background: #909399;
}

.online-input-bar .cancel-btn:hover {
  background: #a6a9ad;
}

.upload-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px 0;
  background: #fff;
  border-top: 1px solid #e5e5e5;
}

.upload-preview img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
}

.remove-preview {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
}

.thinking .bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #999;
}

.thinking-dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.thinking-dots span {
  width: 6px;
  height: 6px;
  background: #999;
  border-radius: 50%;
  animation: thinking-bounce 1.4s infinite ease-in-out both;
}

.thinking-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.thinking-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes thinking-bounce {

  0%,
  80%,
  100% {
    transform: scale(0);
  }

  40% {
    transform: scale(1);
  }
}
</style>
