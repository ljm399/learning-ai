<template>
  <div class="chat-container">
    <div class="chat-header">
      <h1>AI 对话助手</h1>
    </div>

    <div class="messages" ref="messagesRef">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="avatar">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="content">
          <div v-if="msg.text" class="text-content">{{ msg.text }}</div>
          <A2uiRenderer v-if="msg.a2ui" :content="msg.a2ui" @submit="handleA2uiSubmit" />
        </div>
      </div>
      <div v-if="isLoading" class="message assistant">
        <div class="avatar">AI</div>
        <div class="content typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>

    <div class="input-area">
      <textarea v-model="inputMessage" @keydown.enter.prevent="sendMessage" placeholder="输入消息..." rows="1"
        ref="textareaRef"></textarea>
      <button @click="sendMessage" class="send-btn">
        发送
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import A2uiRenderer from './components/A2uiRenderer.vue'

const messages = ref([])
const inputMessage = ref('')
const isLoading = ref(false)
const messagesRef = ref(null)
const textareaRef = ref(null)
const handleA2uiSubmit = (action) => {
  inputMessage.value = JSON.stringify(action);
  sendMessage();
};
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

const autoResize = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 150) + 'px'
    }
  })
}

const sendMessage = async () => {
  const userMessage = inputMessage.value.trim()
  messages.value.push({ role: 'user', text: userMessage })
  inputMessage.value = ''
  autoResize()
  scrollToBottom()
  isLoading.value = true
  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userMessage })
    })

    if (!response.ok) throw new Error('请求失败')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    // 初始化 assistant 消息，支持 text 和 a2ui
    messages.value.push({ role: 'assistant', text: '', a2ui: '' })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            console.log(parsed);
            
            if (parsed.type) {
              const lastMsg = messages.value[messages.value.length - 1]
              if (parsed.type === "a2ui:createSurface") {
                lastMsg.a2ui = {
                  surfaceId: parsed.surfaceId,
                  components: [],
                  dataModel: {},
                };
              } else if (parsed.type === "a2ui:component") {
                //就是不断地把收到的数组，加入到components里
                lastMsg.a2ui = {
                  ...lastMsg.a2ui,
                  components: [...lastMsg.a2ui.components, parsed.component],
                };
              } else if (parsed.type === 'a2ui:updateDataModel') {
                const dm = lastMsg.a2ui.dataModel || {};
                //{/list:{a:123,b:123}}
                dm[parsed.path] = parsed.value
                lastMsg.a2ui = {
                  ...lastMsg.a2ui,
                  dataModel: dm
                }
              } else {
                if (parsed.content) {
                  lastMsg.text += parsed.content
                }

              }
              scrollToBottom()
            }
          } catch (e) { }
        }
      }
    }
  } catch (error) {
    console.error('Error:', error)
    alert('发送失败: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

</script>

<style scoped>
.chat-container {
  max-width: 900px;
  margin: 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e5e5;
}

.chat-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.message.user .avatar {
  background: #1677ff;
}

.message.assistant .avatar {
  background: #52c41a;
}

.content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 8px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message.user .content {
  background: #1677ff;
  color: white;
}

.message.assistant .content {
  background: white;
  color: #333;
}

.typing {
  display: flex;
  gap: 4px;
  padding: 16px;
}

.typing span {
  width: 8px;
  height: 8px;
  background: #999;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.typing span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {

  0%,
  80%,
  100% {
    transform: scale(0);
  }

  40% {
    transform: scale(1);
  }
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  background: white;
  border-top: 1px solid #e5e5e5;
}

textarea {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
}

textarea:focus {
  border-color: #4096ff;
}

.send-btn {
  padding: 10px 24px;
  background: #1677ff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.send-btn:hover:not(:disabled) {
  background: #4096ff;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
