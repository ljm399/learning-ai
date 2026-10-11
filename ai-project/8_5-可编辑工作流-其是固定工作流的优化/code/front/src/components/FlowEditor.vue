<template>
  <div class="flow-editor">
    <div class="header">
      <h1>工作流编辑器</h1>
      <div class="header-buttons">
        <span class="help-text">💡 从连接点拖动连接节点，双击连线可删除</span>
        <button class="save-btn" @click="saveFlow" :disabled="saving">
          {{ saving ? '保存中...' : '保存工作流' }}
        </button>
      </div>
    </div>

    <div class="editor-container">
      <!-- 左侧节点面板 -->
      <div class="node-panel">
        <h3>添加节点（点击添加）</h3>
        <div class="node-types">
          <div class="node-type-item" @click="addNode('request')">
            <span class="icon">🌐</span>
            <span>请求节点</span>
          </div>
          <div class="node-type-item" @click="addNode('ai')">
            <span class="icon">🤖</span>
            <span>AI智能体节点</span>
          </div>
          <div class="node-type-item" @click="addNode('document')">
            <span class="icon">📄</span>
            <span>文档节点</span>
          </div>
          <div class="node-type-item" @click="addNode('code')">
            <span class="icon">💻</span>
            <span>自定义代码节点</span>
          </div>
          <div class="node-type-item" @click="addNode('condition')">
            <span class="icon">🔀</span>
            <span>判断节点</span>
          </div>
          <div class="node-type-item" @click="addNode('return')">
            <span class="icon">📤</span>
            <span>固定返回节点</span>
          </div>
        </div>

        <h3 class="variables-title">全局变量</h3>
        <div class="variables-list">
          <div class="variable-item">
            <span class="var-name">token</span>
            <span class="var-desc">认证令牌</span>
          </div>
          <div class="variable-item">
            <span class="var-name">userPrompt</span>
            <span class="var-desc">用户输入</span>
          </div>
        </div>

        <h3 class="nodes-result-title">节点结果</h3>
        <div class="nodes-result-list">
          <div v-for="node in nodes.filter(n => !['start', 'end'].includes(n.data.type))" :key="node.id"
            class="node-result-item">
            <span class="node-result-name">{{ node.data.label }} ({{ node.id }})</span>
          </div>
          <div v-if="nodes.filter(n => !['start', 'end'].includes(n.data.type)).length === 0" class="empty-result">
            暂无节点结果
          </div>
        </div>
      </div>

      <!-- 中间画布 -->
      <div class="canvas-wrapper">
        <VueFlow v-model:nodes="nodes" v-model:edges="edges" :default-zoom="1" :min-zoom="0.2" :max-zoom="4"
          :snap-to-grid="true" :snap-grid="[15, 15]" class="flow-canvas" @connect="onConnect"
          @edge-double-click="onEdgeDoubleClick">
          <template #node-custom="{ data, id }">
            <div :class="['custom-node', data.type, { selected: selectedNodeId === id }]" @click="selectNode(id)">
              <!-- 输入连接点 -->
              <Handle v-if="data.type !== 'start'" type="target" :position="Position.Left" class="handle-style" />

              <div class="node-header">
                <span class="node-icon">{{ getNodeIcon(data.type) }}</span>
                <span class="node-label">{{ data.label }}</span>
              </div>
              <div class="node-body">
                {{ getNodeDescription(data) }}
              </div>
              <div v-if="data.type !== 'start' && data.type !== 'end'" class="node-delete" @click.stop="deleteNode(id)">
                ✕
              </div>

              <!-- 输出连接点 -->
              <!-- 判断节点有多个输出连接点 -->
              <template v-if="data.type === 'condition'">
                <template v-for="(branch, index) in (data.config.branches || [])" :key="'b-' + index">
                  <Handle type="source" :position="Position.Right" class="handle-style condition-handle"
                    :style="{ top: getBranchTopPosition(index, (data.config.branches || []).length) }"
                    :id="'branch-' + index" />
                  <span class="branch-label" :class="index === 0 ? 'first-label' : ''"
                    :style="{ top: getBranchTopPosition(index, (data.config.branches || []).length) }">
                    {{ branch.label }}
                  </span>
                </template>
              </template>
              <!-- 其他节点只有一个输出连接点 -->
              <Handle v-else-if="data.type !== 'end'" type="source" :position="Position.Right" class="handle-style" />
            </div>
          </template>

          <!-- 自定义连线标签 -->
          <template #edge-label="{ edge }">
            <div v-if="edge.sourceHandle?.startsWith('branch-')" class="edge-label-box">
              {{ getBranchLabel(edge.source, edge.sourceHandle) }}
            </div>
          </template>
        </VueFlow>
      </div>

      <!-- 右侧配置面板 -->
      <div class="config-panel" v-if="selectedNodeId && selectedNodeData">
        <div class="panel-header">
          <h3>节点配置</h3>
          <button class="close-btn" @click="selectedNodeId = null">✕</button>
        </div>

        <div class="panel-content">
          <div class="form-group">
            <label>节点名称</label>
            <input type="text" v-model="selectedNodeData.label" placeholder="输入节点名称" />
          </div>

          <!-- 节点运行提示词（所有节点都有） -->
          <div class="form-group" v-if="selectedNodeData.type !== 'start' && selectedNodeData.type !== 'end'">
            <label>节点运行提示词</label>
            <div class="param-builder">
              <textarea ref="nodePromptRef" v-model="selectedNodeData.config.nodePrompt" placeholder="节点运行前显示的提示信息..."
                rows="3"></textarea>
              <div class="param-helpers">
                <span class="helper-label">快速插入:</span>
                <button v-for="v in globalVariables" :key="'g-' + v.name"
                  @click="insertVariable(v.name, 'global', 'nodePrompt')" class="helper-btn">
                  {{ v.name }}
                </button>
                <button
                  v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                  :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'nodePrompt')" class="helper-btn">
                  {{ n.data.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- 请求节点配置 -->
          <template v-if="selectedNodeData.type === 'request'">
            <div class="form-group">
              <label>接口地址</label>
              <input type="text" v-model="selectedNodeData.config.url" placeholder="https://example.com/api" />
            </div>
            <div class="form-group">
              <label>请求方法</label>
              <select v-model="selectedNodeData.config.method">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div class="form-group">
              <label>Token</label>
              <select v-model="selectedNodeData.config.tokenSource">
                <option value="">无</option>
                <option value="global.token">全局变量: token</option>
              </select>
            </div>
            <div class="form-group">
              <label>请求参数 (JSON)</label>
              <div class="param-builder">
                <textarea ref="paramsRef" v-model="selectedNodeData.config.params" placeholder='{"key": "value"}'
                  rows="4"></textarea>
                <div class="param-helpers">
                  <span class="helper-label">快速插入:</span>
                  <button v-for="v in globalVariables" :key="'g-' + v.name"
                    @click="insertVariable(v.name, 'global', 'params')" class="helper-btn">
                    {{ v.name }}
                  </button>
                  <button
                    v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                    :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'params')" class="helper-btn">
                    {{ n.data.label }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- AI智能体节点配置 -->
          <template v-if="selectedNodeData.type === 'ai'">
            <div class="form-group">
              <label>System 上下文</label>
              <textarea v-model="selectedNodeData.config.system" placeholder="你是一个有用的助手..." rows="3"></textarea>
            </div>
            <div class="form-group">
              <label>Prompt</label>
              <div class="param-builder">
                <textarea ref="promptRef" v-model="selectedNodeData.config.prompt" placeholder="输入提示词..."
                  rows="4"></textarea>
                <div class="param-helpers">
                  <span class="helper-label">快速插入:</span>
                  <button v-for="v in globalVariables" :key="'g-' + v.name"
                    @click="insertVariable(v.name, 'global', 'prompt')" class="helper-btn">
                    {{ v.name }}
                  </button>
                  <button
                    v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                    :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'prompt')" class="helper-btn">
                    {{ n.data.label }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 文档节点配置 -->
          <template v-if="selectedNodeData.type === 'document'">
            <div class="form-group">
              <label>文档内容</label>
              <div class="param-builder">
                <textarea ref="contentRef" v-model="selectedNodeData.config.content" placeholder="粘贴文档内容..."
                  rows="10"></textarea>
                <div class="param-helpers">
                  <span class="helper-label">快速插入:</span>
                  <button v-for="v in globalVariables" :key="'g-' + v.name"
                    @click="insertVariable(v.name, 'global', 'content')" class="helper-btn">
                    {{ v.name }}
                  </button>
                  <button
                    v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                    :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'content')" class="helper-btn">
                    {{ n.data.label }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 自定义代码节点配置 -->
          <template v-if="selectedNodeData.type === 'code'">
            <div class="form-group">
              <label>Node.js 代码</label>
              <div class="param-builder">
                <textarea ref="codeRef" v-model="selectedNodeData.config.code" placeholder="// 输入代码，返回值将传递下去
// 可用参数: globals, nodeResults
// 示例:
return { result: globals.userPrompt };" rows="12" class="code-editor"></textarea>
                <div class="param-helpers">
                  <span class="helper-label">快速插入:</span>
                  <button v-for="v in globalVariables" :key="'g-' + v.name"
                    @click="insertVariable(v.name, 'global', 'code')" class="helper-btn">
                    {{ v.name }}
                  </button>
                  <button
                    v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                    :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'code')" class="helper-btn">
                    {{ n.data.label }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 判断节点配置 -->
          <template v-if="selectedNodeData.type === 'condition'">
            <div class="condition-branches">
              <div class="branches-header">
                <h4>条件分支</h4>
                <button class="add-branch-btn" @click="addConditionBranch">+ 添加分支</button>
              </div>

              <div v-for="(branch, index) in selectedNodeData.config.branches" :key="'branch-' + index"
                class="branch-item" :class="{ 'else-branch': branch.isElse }">
                <div class="branch-header">
                  <span class="branch-index">
                    {{ index === 0 ? 'IF' : branch.isElse ? 'ELSE' : 'ELSE IF ' + index }}
                  </span>
                  <button v-if="!branch.isElse || selectedNodeData.config.branches.length > 1" class="delete-branch-btn"
                    @click="removeConditionBranch(index)">
                    删除
                  </button>
                </div>

                <template v-if="!branch.isElse">
                  <div class="form-group">
                    <label>分支名称</label>
                    <input type="text" v-model="branch.label" placeholder="条件成立" />
                  </div>
                  <div class="form-group">
                    <label>条件表达式</label>
                    <div class="param-builder">
                      <textarea :ref="el => setBranchRef(el, index)" v-model="branch.condition" placeholder="// 返回 true 或 false
// 示例:
nodeResults['node-1']?.result > 100" rows="4" class="code-editor"></textarea>
                      <div class="param-helpers">
                        <span class="helper-label">快速插入:</span>
                        <button v-for="v in globalVariables" :key="'g-' + v.name + '-' + index"
                          @click="insertVariableToBranch(v.name, 'global', index)" class="helper-btn">
                          {{ v.name }}
                        </button>
                        <button
                          v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                          :key="'n-' + n.id + '-' + index" @click="insertVariableToBranch(n.id, 'node', index)"
                          class="helper-btn">
                          {{ n.data.label }}
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="form-group">
                    <label>分支名称</label>
                    <input type="text" v-model="branch.label" placeholder="其他情况" />
                  </div>
                  <div class="else-hint">
                    <p>当以上条件都不满足时，走此分支</p>
                  </div>
                </template>
              </div>
            </div>

            <div class="condition-hint">
              <p><strong>💡 使用说明：</strong></p>
              <p>• 按顺序判断条件，第一个满足的分支会执行</p>
              <p>• ELSE 分支放在最后，所有条件都不满足时执行</p>
              <p>• 每个分支右侧都有独立的连接点</p>
            </div>
          </template>

          <!-- 固定返回节点配置 -->
          <template v-if="selectedNodeData.type === 'return'">
            <div class="form-group">
              <label>返回内容</label>
              <div class="param-builder">
                <textarea ref="returnContentRef" v-model="selectedNodeData.config.content" placeholder="在此输入要返回的固定内容，可以是纯文本或 JSON 格式" rows="12" class="code-editor"></textarea>
                <div class="param-helpers">
                  <span class="helper-label">快速插入:</span>
                  <button v-for="v in globalVariables" :key="'g-' + v.name"
                    @click="insertVariable(v.name, 'global', 'returnContent')" class="helper-btn">
                    {{ v.name }}
                  </button>
                  <button
                    v-for="n in nodes.filter(nn => nn.id !== selectedNodeId && !['start', 'end'].includes(nn.data.type))"
                    :key="'n-' + n.id" @click="insertVariable(n.id, 'node', 'returnContent')" class="helper-btn">
                    {{ n.data.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="return-hint">
              <p><strong>💡 使用说明：</strong></p>
              <p>• 执行到此节点时，会直接将配置的内容返回给前端</p>
              <p>• 支持纯文本、JSON 等任意格式</p>
              <p>• 可以使用变量引用全局变量或前面节点的结果</p>
              <p>• 通常用于在工作流中间或结束时返回固定结果</p>
            </div>
          </template>
        </div>
      </div>

      <div class="config-panel empty-panel" v-else>
        <div class="empty-content">
          <p>选择一个节点来配置</p>
          <p class="small-hint">从节点两侧的圆点拖动来连接节点</p>
          <p class="small-hint">双击连接线可以删除它</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

// 全局变量
const globalVariables = [
  { name: 'token', desc: '认证令牌' },
  { name: 'userPrompt', desc: '用户输入' }
]

// 状态
const nodes = ref([
  {
    id: 'start',
    type: 'custom',
    position: { x: 250, y: 50 },
    data: { type: 'start', label: '开始', config: {} }
  },
  {
    id: 'end',
    type: 'custom',
    position: { x: 250, y: 400 },
    data: { type: 'end', label: '结束', config: {} }
  }
])

const edges = ref([
  { id: 'e1', source: 'start', target: 'end' }
])

const selectedNodeId = ref(null)
const saving = ref(false)
let nodeIdCounter = 0
let edgeIdCounter = 1

// 输入框引用
const nodePromptRef = ref(null)
const paramsRef = ref(null)
const promptRef = ref(null)
const contentRef = ref(null)
const codeRef = ref(null)
const returnContentRef = ref(null)
const branchRefs = ref([])

// 计算属性
const selectedNodeData = computed(() => {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  return node ? node.data : null
})

// 方法
const getNodeIcon = (type) => {
  const icons = {
    start: '▶',
    end: '■',
    request: '🌐',
    ai: '🤖',
    document: '📄',
    code: '💻',
    condition: '🔀',
    return: '📤'
  }
  return icons[type] || '📦'
}

const getNodeDescription = (data) => {
  switch (data.type) {
    case 'start':
      return '工作流入口'
    case 'end':
      return '工作流结束'
    case 'request':
      return data.config.url ? data.config.url.substring(0, 20) + '...' : '未配置接口'
    case 'ai':
      return data.config.prompt ? (data.config.prompt.substring(0, 20) + '...') : '未配置Prompt'
    case 'document':
      return data.config.content ? (data.config.content.substring(0, 20) + '...') : '无内容'
    case 'code':
      return data.config.code ? (data.config.code.substring(0, 20) + '...') : '无代码'
    case 'condition':
      return `${data.config.branches?.length || 0} 个分支`
    case 'return':
      return data.config.content ? (data.config.content.substring(0, 20) + '...') : '无返回内容'
    default:
      return ''
  }
}

// 计算分支连接点的垂直位置
const getBranchTopPosition = (index, total) => {
  if (total === 1) return '50%'
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

// 设置分支的 ref
const setBranchRef = (el, index) => {
  if (el) {
    branchRefs.value[index] = el
  }
}

// 获取分支标签用于显示在连线上
const getBranchLabel = (nodeId, sourceHandle) => {
  if (!sourceHandle?.startsWith('branch-')) return ''

  const node = nodes.value.find(n => n.id === nodeId)
  if (!node?.data?.config?.branches) return ''

  const branchIndex = parseInt(sourceHandle.replace('branch-', ''), 10)
  const branch = node.data.config.branches[branchIndex]

  return branch?.label || ''
}

const { addNodes, removeNodes, addEdges, removeEdges } = useVueFlow()

// 连接节点
const onConnect = (params) => {
  const newEdgeId = `e-${++edgeIdCounter}`
  addEdges([{
    id: newEdgeId,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle
  }])
}

// 双击连线删除
const onEdgeDoubleClick = (event) => {
  const edgeId = event.id || event?.edge?.id

  if (!edgeId) return

  if (confirm('确定要删除这条连接线吗？')) {
    removeEdges([edgeId])
  }
}

// 点击添加节点
const addNode = (type) => {
  const typeNames = {
    request: '请求节点',
    ai: 'AI智能体节点',
    document: '文档节点',
    code: '自定义代码节点',
    condition: '判断节点',
    return: '固定返回节点'
  }

  const newNodeId = `node-${++nodeIdCounter}`

  // 计算一个合适的位置
  const x = 150 + Math.random() * 200
  const y = 150 + nodes.value.length * 50

  const newNode = {
    id: newNodeId,
    type: 'custom',
    position: { x, y },
    data: {
      type,
      label: `${typeNames[type]} ${nodeIdCounter}`,
      config: getDefaultConfig(type)
    }
  }

  addNodes([newNode])

  // 确保节点添加后再选中
  setTimeout(() => {
    selectedNodeId.value = newNodeId
  }, 0)
}

const getDefaultConfig = (type) => {
  switch (type) {
    case 'request':
      return {
        nodePrompt: '',
        url: '',
        method: 'POST',
        tokenSource: '',
        params: '{}'
      }
    case 'ai':
      return {
        nodePrompt: '',
        model: 'gpt-4',
        system: '你是一个有用的助手',
        prompt: ''
      }
    case 'document':
      return {
        nodePrompt: '',
        content: ''
      }
    case 'code':
      return {
        nodePrompt: '',
        code: '// 输入代码，返回值将传递下去\n// 可用参数: globals, nodeResults\n// 示例:\nreturn { result: "Hello World" };'
      }
    case 'condition':
      return {
        nodePrompt: '',
        branches: [
          { label: '条件成立', condition: '// 返回 true 或 false\n// 示例:\nnodeResults[\'node-1\']?.result > 100', isElse: false },
          { label: '其他情况', condition: '', isElse: true }
        ]
      }
    case 'return':
      return {
        nodePrompt: '',
        content: ''
      }
    default:
      return {}
  }
}

// 判断节点：添加条件分支
const addConditionBranch = () => {
  if (!selectedNodeData.value?.config?.branches) return

  const branches = selectedNodeData.value.config.branches
  const elseBranch = branches.find(b => b.isElse)

  const newBranch = {
    label: `条件 ${branches.length}`,
    condition: '// 返回 true 或 false',
    isElse: false
  }

  if (elseBranch) {
    // 在 else 分支前插入
    const elseIndex = branches.indexOf(elseBranch)
    branches.splice(elseIndex, 0, newBranch)
  } else {
    branches.push(newBranch)
  }
}

// 判断节点：删除条件分支
const removeConditionBranch = (index) => {
  if (!selectedNodeData.value?.config?.branches) return

  const branches = selectedNodeData.value.config.branches

  if (branches.length <= 1) {
    alert('至少需要保留一个分支')
    return
  }

  if (!confirm('确定要删除这个分支吗？')) return

  // 删除相关的连接
  const branchHandleId = `branch-${index}`
  const edgesToRemove = edges.value.filter(e =>
    e.source === selectedNodeId.value && e.sourceHandle === branchHandleId
  )
  if (edgesToRemove.length > 0) {
    removeEdges(edgesToRemove.map(e => e.id))
  }

  // 删除分支
  branches.splice(index, 1)

  // 重新调整后面的分支的 handle id 引用
  // 实际上比较复杂，这里简单处理：不自动调整，用户重新连接
}

const selectNode = (id) => {
  selectedNodeId.value = id
}

const deleteNode = (id) => {
  if (confirm('确定要删除这个节点吗？')) {
    removeNodes([id])
    if (selectedNodeId.value === id) {
      selectedNodeId.value = null
    }
  }
}

// 在光标位置插入变量
const insertVariable = (name, source, field) => {
  if (!selectedNodeData.value) return

  const varStr = source === 'global' ? `\${globals.${name}}` : `\${nodeResults.${name}}`

  // 获取对应的 textarea 引用
  let textareaRef = null
  let configField = field
  switch (field) {
    case 'nodePrompt':
      textareaRef = nodePromptRef
      break
    case 'params':
      textareaRef = paramsRef
      break
    case 'prompt':
      textareaRef = promptRef
      break
    case 'content':
      textareaRef = contentRef
      break
    case 'code':
      textareaRef = codeRef
      break
    case 'returnContent':
      textareaRef = returnContentRef
      configField = 'content'
      break
  }

  nextTick(() => {
    const textarea = textareaRef?.value

    if (textarea) {
      const textareaEl = textarea.$el || textarea

      if (textareaEl && textareaEl.selectionStart !== undefined) {
        // 有光标位置，在光标处插入
        const start = textareaEl.selectionStart
        const end = textareaEl.selectionEnd
        const originalText = selectedNodeData.value.config[configField] || ''

        const before = originalText.substring(0, start)
        const after = originalText.substring(end)
        selectedNodeData.value.config[configField] = before + varStr + after

        // 重新设置光标位置
        nextTick(() => {
          textareaEl.focus()
          textareaEl.setSelectionRange(start + varStr.length, start + varStr.length)
        })
      } else {
        // 没有光标位置，直接追加到末尾
        if (!selectedNodeData.value.config[configField]) {
          selectedNodeData.value.config[configField] = ''
        }
        selectedNodeData.value.config[configField] += varStr
      }
    } else {
      // 没有引用，直接追加
      if (!selectedNodeData.value.config[configField]) {
        selectedNodeData.value.config[configField] = ''
      }
      selectedNodeData.value.config[configField] += varStr
    }
  })
}

// 在判断节点的分支中插入变量
const insertVariableToBranch = (name, source, branchIndex) => {
  if (!selectedNodeData.value?.config?.branches?.[branchIndex]) return

  const varStr = source === 'global' ? `\${globals.${name}}` : `\${nodeResults.${name}}`
  const branch = selectedNodeData.value.config.branches[branchIndex]

  nextTick(() => {
    const textarea = branchRefs.value?.[branchIndex]

    if (textarea) {
      const textareaEl = textarea.$el || textarea

      if (textareaEl && textareaEl.selectionStart !== undefined) {
        const start = textareaEl.selectionStart
        const end = textareaEl.selectionEnd
        const originalText = branch.condition || ''

        const before = originalText.substring(0, start)
        const after = originalText.substring(end)
        branch.condition = before + varStr + after

        nextTick(() => {
          textareaEl.focus()
          textareaEl.setSelectionRange(start + varStr.length, start + varStr.length)
        })
      } else {
        branch.condition = (branch.condition || '') + varStr
      }
    } else {
      branch.condition = (branch.condition || '') + varStr
    }
  })
}

const saveFlow = async () => {
  saving.value = true

  try {
    const flowData = {
      nodes: nodes.value.map(n => ({
        id: n.id,
        type: n.data.type,
        label: n.data.label,
        config: n.data.config,
        position: n.position
      })),
      edges: edges.value.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle
      }))
    }

    const response = await fetch('http://localhost:3000/flow/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(flowData)
    })

    if (!response.ok) throw new Error('保存失败')

    const result = await response.json()
    alert('工作流保存成功！保存路径: ' + result.path)
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败: ' + error.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.flow-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e8e8e8;
}

.header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
}

.header-buttons {
  display: flex;
  align-items: center;
  gap: 16px;
}

.help-text {
  font-size: 13px;
  color: #666;
}

.save-btn {
  padding: 10px 24px;
  background: #1677ff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.save-btn:hover:not(:disabled) {
  background: #4096ff;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.node-panel {
  width: 280px;
  background: white;
  border-right: 1px solid #e8e8e8;
  padding: 20px;
  overflow-y: auto;
}

.node-panel h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.variables-title,
.nodes-result-title {
  margin-top: 24px !important;
}

.node-types {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-type-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-type-item:hover {
  border-color: #1677ff;
  background: linear-gradient(135deg, #e6f4ff 0%, #bae7ff 100%);
  transform: translateY(-2px);
}

.node-type-item .icon {
  font-size: 24px;
}

.node-type-item span:last-child {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.variables-list,
.nodes-result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-item,
.node-result-item {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
}

.var-name,
.node-result-name {
  font-family: monospace;
  font-size: 13px;
  color: #1677ff;
  font-weight: 500;
}

.var-desc {
  font-size: 12px;
  color: #999;
  margin-left: 8px;
}

.empty-result {
  color: #999;
  font-size: 13px;
  padding: 10px 0;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
}

.flow-canvas {
  height: 100%;
  width: 100%;
}

.custom-node {
  min-width: 180px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 2px solid #e8e8e8;
  position: relative;
  transition: all 0.2s ease;
  cursor: pointer;
}

.custom-node:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.custom-node.selected {
  border-color: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.1);
}

.custom-node.start {
  border-color: #52c41a;
  background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
}

.custom-node.end {
  border-color: #ff4d4f;
  background: linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%);
}

.custom-node.request {
  border-color: #1677ff;
}

.custom-node.ai {
  border-color: #722ed1;
}

.custom-node.document {
  border-color: #fa8c16;
}

.custom-node.code {
  border-color: #13c2c2;
}

.custom-node.condition {
  border-color: #faad14;
  background: linear-gradient(135deg, #fffbe6 0%, #ffe58f 100%);
}

.custom-node.return {
  border-color: #13c2c2;
  background: linear-gradient(135deg, #e6fffb 0%, #87e8de 100%);
}

.node-header {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 600;
  font-size: 14px;
}

.custom-node.start .node-header,
.custom-node.end .node-header {
  border-bottom: none;
}

.node-icon {
  font-size: 18px;
}

.node-body {
  padding: 10px 14px;
  font-size: 12px;
  color: #666;
  min-height: 20px;
}

.node-delete {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 22px;
  height: 22px;
  background: #ff4d4f;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(255, 77, 79, 0.4);
}

.config-panel {
  width: 360px;
  background: white;
  border-left: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
}

.empty-panel {
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  color: #999;
  font-size: 14px;
}

.small-hint {
  font-size: 12px;
  margin-top: 8px;
  color: #666;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #666;
  padding: 4px;
}

.close-btn:hover {
  color: #333;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #1677ff;
}

.form-group textarea.code-editor {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.param-builder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-helpers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.helper-label {
  font-size: 12px;
  color: #666;
}

.helper-btn {
  padding: 4px 10px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;
}

.helper-btn:hover {
  background: #e6f4ff;
  border-color: #1677ff;
  color: #1677ff;
}

/* 连接点样式 */
:deep(.handle-style) {
  width: 12px;
  height: 12px;
  background: #1677ff;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

:deep(.handle-style:hover) {
  background: #4096ff;
  transform: scale(1.2);
}

/* 连线样式 - 使用深度选择器覆盖 VueFlow 内置样式 */
:deep(.vue-flow__edge-path) {
  stroke: #1677ff;
  stroke-width: 2;
  fill: none;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #ff4d4f;
  stroke-width: 3;
}

:deep(.vue-flow__edge:hover .vue-flow__edge-path) {
  stroke: #4096ff;
  stroke-width: 3;
  cursor: pointer;
}

/* 判断节点不同分支的连线颜色 */
:deep(.vue-flow__edge[data-source-handle="branch-0"] .vue-flow__edge-path) {
  stroke: #52c41a;
}

:deep(.vue-flow__edge[data-source-handle="branch-1"] .vue-flow__edge-path) {
  stroke: #1677ff;
}

:deep(.vue-flow__edge[data-source-handle="branch-2"] .vue-flow__edge-path) {
  stroke: #722ed1;
}

:deep(.vue-flow__edge[data-source-handle="branch-3"] .vue-flow__edge-path) {
  stroke: #fa8c16;
}

:deep(.vue-flow__edge[data-source-handle="branch-4"] .vue-flow__edge-path) {
  stroke: #eb2f96;
}

/* 连线标签样式 */
.edge-label-box {
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
  font-size: 11px;
  color: #666;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
}

/* 判断节点分支标签 */
.branch-label {
  position: absolute;
  right: -40px;
  font-size: 11px;
  color: #666;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
  transform: translateY(-50%);
  white-space: nowrap;
  pointer-events: none;
}

.branch-label.first-label {
  margin-top: 0;
}

/* 判断节点配置面板样式 */
.condition-branches {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
}

.branches-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.branches-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.add-branch-btn {
  padding: 6px 12px;
  background: #1677ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.add-branch-btn:hover {
  background: #4096ff;
}

.branch-item {
  padding: 16px;
  border-bottom: 1px solid #e8e8e8;
}

.branch-item:last-child {
  border-bottom: none;
}

.branch-item.else-branch {
  background: #fafafa;
}

.branch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.branch-index {
  font-weight: 600;
  font-size: 13px;
  color: #1677ff;
}

.delete-branch-btn {
  padding: 4px 10px;
  background: #fff1f0;
  color: #ff4d4f;
  border: 1px solid #ffa39e;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.delete-branch-btn:hover {
  background: #ffccc7;
}

.else-hint {
  padding: 10px 12px;
  background: #e6f7ff;
  border-radius: 6px;
  font-size: 13px;
  color: #1890ff;
}

.condition-hint {
  margin-top: 16px;
  padding: 12px 16px;
  background: #fff7e6;
  border-radius: 8px;
  border: 1px solid #ffe58f;
}

.condition-hint p {
  margin: 4px 0;
  font-size: 13px;
  color: #666;
}

.condition-hint code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #1677ff;
}

.return-hint {
  margin-top: 16px;
  padding: 12px 16px;
  background: #e6fffb;
  border-radius: 8px;
  border: 1px solid #87e8de;
}

.return-hint p {
  margin: 4px 0;
  font-size: 13px;
  color: #666;
}

.return-hint code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #13c2c2;
}
</style>
