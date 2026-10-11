<template>
  <div class="chat-container">
    <div class="chat-header">
      <h1>AI 对话助手</h1>
    </div>

    <div class="messages" ref="messagesRef">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="avatar">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="content">{{ msg.content }}</div>
      </div>

      <!-- 工作流状态显示 -->
      <div v-if="currentStages.length > 0" class="message assistant workflow-status">
        <div class="avatar">AI</div>
        <div class="content">
          <!-- 当前正在执行的节点大字体显示 -->
          <div v-if="currentStage" class="current-stage">
            <span class="spinner"></span>
            <span class="text">正在{{ currentStage.stageName }}...</span>
          </div>
          <!-- 已完成的节点列表 -->
          <div class="completed-stages">
            <div v-for="stage in completedStages" :key="stage.stage" class="stage-item done">
              <span class="icon-done">✓</span>
              <span>{{ stage.stageName }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isLoading && currentStages.length === 0" class="message assistant">
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
      <button @click="sendMessage" class="send-btn" :disabled="isLoading">
        发送
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue'

const messages = ref([])
const inputMessage = ref('')
const isLoading = ref(false)
const messagesRef = ref(null)
const textareaRef = ref(null)
const currentStages = ref([])

// 当前正在执行的阶段
const currentStage = computed(() => {
  return currentStages.value.find(s => s.status === 'start')
})

// 已完成的阶段
const completedStages = computed(() => {
  return currentStages.value.filter(s => s.status === 'done')
})

// 定义所有阶段
const ALL_STAGES = [
  { stage: 'query_guides', stageName: '查询穿搭攻略' },
  { stage: 'analyze_categories', stageName: '分析推荐品类' },
  { stage: 'query_products', stageName: '查询商品' },
  { stage: 'ai_response', stageName: 'AI 生成回复' }
]

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
  if (!userMessage || isLoading.value) return

  messages.value.push({ role: 'user', content: userMessage })
  inputMessage.value = ''
  autoResize()
  scrollToBottom()
  isLoading.value = true

  // 初始化阶段状态
  currentStages.value = ALL_STAGES.map(s => ({ ...s, status: 'pending' }))
  messages.value.push({ role: 'assistant', content: '' })

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

    let assistantMessage = ''

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

            if (parsed.type === 'stage') {
              // 处理阶段更新
              const stageIndex = currentStages.value.findIndex(s => s.stage === parsed.stage)
              if (stageIndex !== -1) {
                currentStages.value[stageIndex].status = parsed.status
                // 如果是start状态，前面的都标记为done
                if (parsed.status === 'start') {
                  for (let i = 0; i < stageIndex; i++) {
                    currentStages.value[i].status = 'done'
                  }
                }
              }
              scrollToBottom()
            } else if (parsed.type === 'content') {
              // 处理内容更新
              assistantMessage += parsed.content
              messages.value[messages.value.length - 1].content = assistantMessage
              scrollToBottom()
            } else if (parsed.content) {
              // 兼容旧格式
              assistantMessage += parsed.content
              messages.value[messages.value.length - 1].content = assistantMessage
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
    currentStages.value = []
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

/* 工作流状态样式 */
.current-stage {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #e6f4ff 0%, #bae7ff 100%);
  border-radius: 8px;
  margin-bottom: 12px;
}

.current-stage .spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #1677ff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.current-stage .text {
  font-size: 16px;
  font-weight: 600;
  color: #1677ff;
}

.completed-stages {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #52c41a;
}

.stage-item .icon-done {
  font-weight: bold;
  font-size: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
