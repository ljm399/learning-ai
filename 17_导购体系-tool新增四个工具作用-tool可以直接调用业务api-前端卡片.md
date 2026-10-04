# 7-6 导购体系：把 AI 对话接入商品业务闭环

> 本节承接前面的“toC 对话接口搭建”和“记忆体系”。目标不是让模型泛泛聊天，而是让用户通过自然语言完成：需求表达 -> 导购决策 -> 商品检索 -> 商品展示 -> 后续试穿/购买。

## 一、导购体系解决什么问题

传统电商需要用户自己完成分类、筛选、比较和下单。AI 导购把这些操作改造成一段对话，但真正的核心仍然是公司的业务能力：商品库、选购规则、用户画像和订单接口。

本项目的基本链路：

```text
用户描述需求
  -> 读取用户记忆（身高、体重、风格、场景等）
  -> 调用服装选购指南
  -> 确定商品大类/检索关键词
  -> 调用商品搜索接口
  -> 模型阅读商品标题、描述、价格并筛选最多 5 条
  -> 调用前端卡片工具
  -> 前端展示商品，继续试穿或购买
```

课件把导购过程拆成了几个动作：听取需求、观察形象、获取用户特征、查看公司商品选购指南、找到合适商品、确认库存。这里要区分“决策”和“执行”：模型负责理解和排序，真实商品数据与订单动作必须由后端业务接口完成。

## 二、整体流程和系统上下文

系统提示词位于 `server/doc/system.md`，它定义了角色、边界和工具调用顺序。核心规则如下：

1. 先判断是否有身高、体重、年龄、形象描述等资料；没有时可以建议用户提供，但不能强制阻塞推荐。
2. 有购买意图时先调用 `get_shopping_guide` 获取公司选购规则。
3. 根据规则、用户记忆和本轮需求确定服装种类；种类要使用公司支持的关键词，不要把“显瘦、通勤、便宜”等修饰语混入检索类型。
4. 调用 `search_products` 获取公司商品，不能凭模型知识虚构商品。
5. 读取商品标题、描述和价格后再筛选最匹配的 5 条，不能把接口返回的全部商品直接展示。
6. 调用 `showList` 生成前端卡片数据。
7. 用户不满意时可以重新选择商品种类；售后问题应进入退货/换货业务流程。

系统提示还规定了服装领域边界、礼貌语气和风险问题拒答规则。它是“流程约束”，不是业务数据本身；实时库存、价格、订单状态仍需从接口取得。

## 三、四个工具的职责

工具在 `server/tools/index.js` 集中导出，并在 `server/utils/llm.js` 中通过 `model.bindTools(tools)` 绑定给模型，再由 LangGraph 的 `ToolNode` 执行。

### 1. `get_shopping_guide`：读取规则

`guide.js` 读取 `server/doc/AI服装选购规则表.md` 并原样返回。规则文档描述了五类商品及其适用场景、卖点和代表商品：羽绒服、T 恤、工装风格服饰、连衣裙/裙装、夹克/外套。

它解决的是“应该推荐什么类别”，不是“当前有哪些商品”。规则属于相对稳定的知识，可用 Markdown 文件维护；商品列表属于实时业务数据，应走商品接口。

### 2. `search_products`：查公司商品（需要公司后端提供商品的api地址）

`product.js` 只负责调用后端：

```js
const response = await fetch(`http://localhost:5000/search?type=${type}`)
return JSON.stringify(await response.json())
```

后端 `backServer/index.js` 从 `goods.json` 读取商品，并对 `title + description` 做归一化字符串包含匹配：去空格、转小写，再判断是否包含关键词。示例接口：

```http
GET /search?type=羽绒服
```

返回结构包括 `query`、`count` 和 `data`。这种做法的价值在于先用关键词缩小候选集，避免把整个商品库塞进上下文，降低 token、延迟和模型筛选压力。真实项目中可以把这一层替换成数据库检索、搜索引擎、库存服务，并继续保留统一的工具接口。

### 3. `showList`：生成前端协议

`showList.js` 不负责渲染，只把商品列表包装为协议对象：

```js
{
  type: "card",
  name: "listCard",
  data: productList
}
```

系统提示要求模型把工具返回的 JSON 原样放入 ```json 代码块中透传给用户。这实际上是一个简单的“模型输出协议”：`type` 表示组件类型，`name` 表示具体组件，`data` 是组件所需数据。

### 4. `memory`：维护用户长期画像

导购时会复用上一节的记忆体系。用户说出身高、体重、年龄、穿衣偏好、购买行为、工作/常居地或上传照片时，模型调用 `memory` 工具。工具以 `userId.md` 保存画像：基础事实可替换，偏好合并更新，购买记录追加。

`memory.js` 调用更新模型时采用 fire-and-forget：触发 `updateMemory` 后立即返回，不等待记忆模型完成，避免记忆写入拖慢主对话。后续 `/chat/send` 会读取记忆文件，并作为独立 `SystemMessage` 注入当前上下文。

## 四、后端对话执行链

`server/app.js` 的 `/chat/send` 是入口：

1. 校验登录 token，取出 `userId` 和 `cid`。
2. 如果消息内容是数组，识别其中的 `image_url`。
3. 把本地图片 URL 通过 `parseImageToBase64` 转成 `data:image/...;base64,...`，再构造 LangChain `HumanMessage`。
4. 读取 `system.md` 和用户记忆，作为 `extraMessage` 传给图，而不是写入历史记录。
5. 调用 `graph.streamEvents`，以 SSE 把模型输出逐块返回前端。

LangGraph 图位于 `server/utils/llm.js`：

```text
__start__ -> agent
agent --有 tool_calls--> tools -> agent
agent --没有 tool_calls--> saveResult -> __end__
```

`agent` 调用绑定工具的模型；`tools` 由 `ToolNode` 执行实际函数；`saveResult` 把 LangChain 消息转回 OpenAI 格式，追加到 `jsondata/<userId>.json`。`MessagesAnnotation` 会累积 user、assistant、tool 消息，使模型可以继续完成“模型 -> 工具 -> 模型”的循环。

注意：工具调用阶段的模型事件也会被 LangChain 发出，因此 `/chat/send` 只转发 `langgraph_node === 'agent'` 且 `on_chat_model_stream` 的内容，避免把工具内部事件直接展示给用户。

## 五、图片与用户形象信息

前端不是把本地文件直接发给模型，而是分两步：

```text
选择图片 -> POST /upload（multipart/form-data）
         -> 得到 /userImage/xxx.png URL
         -> 预览
         -> 发送时组成 OpenAI 多模态 content 数组
```

消息形状如下：

```js
{
  role: 'user',
  content: [
    { type: 'text', text: '帮我推荐适合上班的衣服' },
    { type: 'image_url', image_url: { url: imageUrl } }
  ]
}
```

后端只接受 `userImage` 路径下的图片，读取文件后转 base64。这样模型能真正看到图片，并依据系统提示提炼体型、外貌等长期有价值信息。上传接口使用 `multer`，限制图片类型和 5 MB 大小；前端用 `FormData`，不要手动写死 `Content-Type`，让浏览器自动生成 multipart boundary。

## 六、前端卡片协议如何渲染

这两个文件配合起来完成一件事：

> `Markdown.vue` 负责识别 AI 返回的文本、图片和卡片 JSON；`CardTep.vue` 负责根据卡片名称选择真正的 Vue 卡片组件。

整体关系是：

```
AI 返回 Markdown + JSON
        ↓
Markdown.vue 解析
        ↓
发现 type === "card"
        ↓
CardTep.vue 根据 name 选择组件
        ↓
ListCard.vue 渲染商品列表
```

### 一、CardTep.vue

文件：[CardTep.vue](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/app/src/components/CardTep.vue)

### 1. 接收父组件传入的数据

```
const props = defineProps({
  data: {
    type: Object,
    required: true
  }
})
```

这个组件要求父组件传入一个对象，例如：

```
{
  type: "card",
  name: "listCard",
  data: [
    {
      id: 1,
      title: "羽绒服",
      description: "保暖防风",
      price: 1299
    }
  ]
}
```

这里的 `data` 有三层含义：

```
data.type  -> 卡片类型
data.name  -> 使用哪个卡片组件
data.data  -> 传给具体卡片组件的业务数据
```

### 2. 建立卡片名称和组件的映射

```
const cardMap = {
  listCard: defineAsyncComponent(() => import('../card/ListCard.vue'))
}
```

这相当于：

```
"listCard" -> ListCard.vue
```

`defineAsyncComponent` 表示异步加载组件。只有真正需要 `listCard` 时，才加载 `ListCard.vue`，可以减少初始加载代码。

以后可以继续扩展：

```
const cardMap = {
  listCard: defineAsyncComponent(() => import('../card/ListCard.vue')),
  detailCard: defineAsyncComponent(() => import('../card/DetailCard.vue')),
  orderCard: defineAsyncComponent(() => import('../card/OrderCard.vue'))
}
```

模型只需要返回不同的 `name`：

```
{
  "type": "card",
  "name": "orderCard",
  "data": {}
}
```

前端就可以渲染不同类型的组件。

### 3. 根据 `name` 找到组件

```
const CardComponent = cardMap[props.data.name]
```

如果：

```
props.data.name === "listCard"
```

那么：

```
CardComponent === ListCard.vue
```

如果模型返回了一个没有注册的名称，例如：

```
{
  "type": "card",
  "name": "unknownCard"
}
```

那么 `CardComponent` 就是 `undefined`。

### 4. 动态渲染组件

```
<component
  :is="CardComponent"
  v-if="CardComponent"
  :data="data.data"
/>
```

这里的 `<component>` 是 Vue 的动态组件语法。

```
:is="CardComponent"
```

表示真正渲染哪个组件由变量决定。

当 `CardComponent` 是 `ListCard.vue` 时，实际效果类似于：

```
<ListCard :data="data.data" />
```

传递的数据是：

```
data.data
```

也就是商品数组。

### 5. 组件找不到时显示错误

```
<div v-else class="card-tep card-error">
  未找到卡片: {{ data.name }}
</div>
```

如果前端没有注册模型返回的卡片名称，就显示：

```
未找到卡片: xxx
```

这样比页面直接空白更容易调试。

### 6. CardTep.vue 中的样式

```
.card-tep { ... }
.card-error { ... }
```

`card-error` 确实用于错误提示。

但下面这些样式：

```
.card-image
.card-body
.card-title
.card-desc
.card-price
.card-tag
```

当前主要商品展示结构实际写在 `ListCard.vue` 中，所以这些样式在 `CardTep.vue` 里并没有直接使用，可能是早期通用卡片样式留下来的。

------

### 二、Markdown.vue

文件：[Markdown.vue](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/app/src/components/Markdown.vue)

它是聊天消息的通用渲染组件，负责处理三种内容：

1. 普通文本和 Markdown
2. 图片消息
3. 商品卡片 JSON

父组件使用方式大致是：

```
<Markdown :content="msg.content" />
```

### 三、处理普通文本和多模态内容

### 1. 接收 `content`

```
const props = defineProps(["content"])
```

`content` 可能是字符串：

```
"你好，请选择你喜欢的服装风格"
```

也可能是图片消息数组：

```
[
  { type: "text", text: "这是我的照片" },
  {
    type: "image_url",
    image_url: {
      url: "http://localhost:3000/userImage/a.png"
    }
  }
]
```

### 2. 判断是否为数组

```
const isArray = computed(() => Array.isArray(props.content))
```

判断结果：

```
content 是字符串 -> 普通 Markdown
content 是数组   -> 可能是文本 + 图片
```

### 3. 提取文本内容

```
const textContent = computed(() => {
    if (!isArray.value) return props.content

    return props.content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n")
})
```

如果输入是：

```
[
  { type: "text", text: "这是我的照片" },
  { type: "image_url", image_url: { url: "..." } }
]
```

最后得到：

```
这是我的照片
```

图片部分不会混进 Markdown 文本。

### 4. 提取图片地址

```
const images = computed(() => {
    if (!isArray.value) return []

    return props.content
        .filter(item => item.type === "image_url" && item.image_url?.url)
        .map(item => item.image_url.url)
})
```

模板中：

```
<img
  v-for="(url, idx) in images"
  :key="idx"
  :src="url"
/>
```

因此多模态消息会被拆成：

```
文本 -> 交给 Markdown 渲染
图片 -> 使用 img 标签显示
```

------

### 四、`extractInlineCards`：识别没有代码块包裹的卡片 JSON

模型理想情况下返回：

````
```json
{
  "type": "card",
  "name": "listCard",
  "data": []
}
```
````

但有时模型可能直接返回：

```
推荐以下商品：
{"type":"card","name":"listCard","data":[]}
```

所以代码使用：

```
const cardStartRegex = /\{\s*"type"\s*:\s*"card"/g
```

查找：

```
{"type":"card"
```

出现的位置。

之后从这个位置开始逐步扩大字符串：

```ts
for (let i = cardIndex + 1; i <= text.length; i++) {
    const candidate = text.slice(cardIndex, i)
    const obj = JSON.parse(candidate)
}
```

直到某一段字符串能够被 `JSON.parse` 正确解析。

解析成功后，保存成：

```
{
  type: "card",
  data: parsed
}
```

如果前面还有普通文字，也会保存成：

```
{
  type: "text",
  content: "前面的说明文字"
}
```

最终结果可能是：

```
[
  {
    type: "text",
    content: "为你推荐以下商品："
  },
  {
    type: "card",
    data: {
      type: "card",
      name: "listCard",
      data: []
    }
  }
]
```

------

### 五、`contentSegments`：拆分 Markdown 和卡片

这是 `Markdown.vue` 的核心：

```
const contentSegments = computed(() => {
```

### 1. 查找 JSON 代码块

```
const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
```

它匹配：

````
```json
...
```
````

其中：

```
match[1]
```

就是代码块内部的 JSON 字符串。

### 2. 解析 JSON

```
const parsed = JSON.parse(jsonStr)
```

如果解析结果是卡片：

```
if (parsed.type === "card") {
    segments.push({
      type: "card",
      data: parsed
    })
}
```

如果 JSON 不是卡片，或者解析失败，就作为普通文本显示：

```
segments.push({
  type: "text",
  content: match[0]
})
```

这样可以避免错误 JSON 直接导致整个聊天消息不显示。

### 3. 处理 JSON 前后的普通文字

例如模型返回：

````
这是我为你筛选的商品：

```json
{
  "type": "card",
  "name": "listCard",
  "data": []
}
```

你可以点击商品查看详情。
````

代码会拆成：

```
[
  {
    type: "text",
    content: "这是我为你筛选的商品："
  },
  {
    type: "card",
    data: { ... }
  },
  {
    type: "text",
    content: "你可以点击商品查看详情。"
  }
]
```

------

### 六、模板如何渲染这些片段

```
<template v-for="(segment, idx) in contentSegments" :key="idx">
```

每个片段单独处理。

### 卡片片段

```
<CardTep
  v-if="segment.type === 'card'"
  :data="segment.data"
/>
```

执行流程：

```
segment.type === "card"
        ↓
调用 CardTep.vue
        ↓
CardTep 读取 segment.data.name
        ↓
找到 ListCard.vue
        ↓
显示商品列表
```

### 普通文本片段

```
<VueMarkdown
  v-else
  :markdown="segment.content"
/>
```

普通文本交给 `@crazydos/vue-markdown` 渲染，支持：

- 标题
- 列表
- 粗体
- 链接
- 表格
- 代码块
- GitHub 风格 Markdown

------

### 七、Markdown 插件

```
import remarkGfm from "remark-gfm"
import hidhlightPlugins from "rehype-highlight"
```

使用：

```
:remark-plugins="[remarkGfm]"
:rehype-plugins="[hidhlightPlugins]"
```

其中：

- `remarkGfm` 支持 GitHub Flavored Markdown，例如表格、任务列表、删除线。
- `rehype-highlight` 用于代码高亮。

### 自定义链接样式

```
:custom-attrs="{
  a: { class: 'mardown-a' }
}"
```

所有 Markdown 链接都会增加 `mardown-a` 类名。

### 自定义复选框

```
<template #input="{ ...props }">
  <span v-if="props.type === 'checkbox' && props.checked">
    ✅
  </span>
  <span v-if="props.type === 'checkbox' && !props.checked">
    [ ]
  </span>
</template>
```

它把 Markdown 任务列表：

```
- [x] 已完成
- [ ] 未完成
```

渲染成：

```
✅ 已完成
[ ] 未完成
```

------

### 八、两个文件配合的完整示例

模型返回：

````
我为你筛选了以下商品：

```json
{
  "type": "card",
  "name": "listCard",
  "data": [
    {
      "id": 1,
      "title": "波司登羽绒服",
      "description": "防风保暖",
      "price": 1299,
      "image": "https://example.com/a.jpg"
    }
  ]
}
```
````

处理过程：

```
Markdown.vue
  -> 提取普通文字“我为你筛选了以下商品”
  -> 识别 ```json 代码块
  -> JSON.parse
  -> 发现 type === "card"
  -> 渲染 <CardTep :data="parsed" />

CardTep.vue
  -> 读取 parsed.name === "listCard"
  -> 找到 ListCard.vue
  -> 传入 parsed.data
  -> ListCard.vue 显示商品图片、标题、价格和按钮
```

所以可以把两者理解为：

```
Markdown.vue = 卡片协议解析器 + 普通消息渲染器
CardTep.vue   = 卡片路由器/分发器
ListCard.vue  = 具体商品卡片实现
```

另外，当前 `ListCard.vue` 中的“试穿”和“购买”按钮只是显示出来了，还没有绑定点击事件；真正接入业务时，还需要在具体卡片组件中发送商品 ID 和用户操作。



这里并不是“后端接口强制只能返回这种格式”，而是多个地方共同约定了这个格式。

首先，真正生成卡片格式的是 `showList` 工具：

[showList.js](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/server/tools/showList.js)

```
const result = {
    type: "card",
    name: "listCard",
    data: productList
}

return JSON.stringify(result);
```

它明确构造了：

```
{
  "type": "card",
  "name": "listCard",
  "data": []
}
```

其中 `productList` 由工具参数传入：

```
schema: z.object({
    productList: z.array(z.record(z.any()))
})
```

这表示模型调用 `showList` 时，需要传入一个商品对象数组。

其次，系统提示词要求模型使用这个工具：

[system.md](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/server/doc/system.md)

里面规定：

```
通过showList工具展示商品给前端
```

并且要求：

```
工具会返回一个json，请把json内容原封不动透传回答，要符合md格式。
```

所以流程是：

```
模型调用 showList
        ↓
showList 生成 { type, name, data }
        ↓
工具结果返回给模型
        ↓
模型把 JSON 放进 ```json 代码块
        ↓
前端 Markdown.vue 解析
```

前端的限制在这里：

[Markdown.vue](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/app/src/components/Markdown.vue)

```
if (parsed.type === "card") {
    segments.push({
        type: "card",
        data: parsed
    })
}
```

只有当：

```
parsed.type === "card"
```

时，前端才会把它当作卡片。

然后传给：

[CardTep.vue](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/app/src/components/CardTep.vue)

```
const cardMap = {
  listCard: defineAsyncComponent(() => import('../card/ListCard.vue'))
}
```

这里又限制了：

```
name: "listCard" -> 加载 ListCard.vue
```

所以 `name` 如果写成：

```
"name": "otherCard"
```

由于 `cardMap` 中没有这个名称，就会显示：

```
未找到卡片: otherCard
```

而商品数据的实际来源是：

[product.js](C:/Users/Caom/Desktop/JavaScript/ppt和源码/7-6 导购体系/code/server/tools/product.js)

它调用：

```
GET http://localhost:5000/search?type=羽绒服
```

这个商品搜索接口返回的原始格式其实是：

```
{
  "query": {
    "type": "羽绒服"
  },
  "count": 5,
  "data": [
    {
      "id": 1,
      "title": "波司登羽绒服",
      "description": "保暖防风",
      "price": 1299,
      "image": "..."
    }
  ]
}
```

也就是说：

```
商品搜索接口返回的格式
```

和：

```
前端卡片协议格式
```

不是同一种格式。

真正的转换过程是：

```
/search 返回商品查询结果
        ↓
模型从 data 中筛选商品
        ↓
模型调用 showList(productList)
        ↓
showList 包装成 type/name/data
        ↓
Markdown.vue 识别卡片
```

另外，你示例里的代码块标记写成了 `yaml`，而内容实际上更接近 JSON，不过键名没有加双引号。严格 JSON 应该写成：

```
{
  "type": "card",
  "name": "listCard",
  "data": [
    {
      "id": 1,
      "title": "羽绒服",
      "description": "保暖防风",
      "price": 1299
    }
  ]
}
```

总结来说：

- `product.js`：获取商品数据，没有强制卡片格式。
- `showList.js`：定义并生成卡片协议。
- `system.md`：要求模型调用 `showList` 并透传结果。
- `Markdown.vue`：只识别 `type === "card"`。
- `CardTep.vue`：只把 `name === "listCard"` 映射到 `ListCard.vue`。

所以这是一套“工具协议 + 前端解析协议”，不是单纯后端接口的返回限制。



### 数据格式在哪里被约束好了

```js
{
  type: "card",
  name: "listCard",
  data: [
    {
      id: 1,
      title: "羽绒服",
      description: "保暖防风",
      price: 1299
    }
  ]
}
```

- 在showList.ts

  ```ts
  import { tool } from "@langchain/core/tools";
  import { z } from "zod";
  
  export default tool(
      async ({ productList }) => {
          const result = {
              type: "card",
              name: "listCard",
              data: productList
          }
          return JSON.stringify(result);
      },
      {
          name: "showList",
          description: "前端展示工具，当需要向用户展示商品列表时调用此工具，此工具会返回json，携带此json回答用户",
          schema: z.object({
              productList: z.array(z.record(z.any())).describe("要展示的商品列表")
          }),
      }
  );
  
  ```

  

## 这节课的核心认识

1. 导购 AI 不是“把商品 JSON 直接交给模型”，而是规则、记忆、业务检索、模型筛选和前端协议的组合。
2. 静态选购知识适合文档或 RAG；商品、库存、价格和订单必须以业务接口为准。
3. 先检索再筛选是控制上下文成本、提高推荐准确率的关键。
4. 卡片 JSON 是模型与前端之间的轻量协议，模型表达意图，前端负责真正的 UI 和交互。
5. 一个完整的 toC AI 应用要从“能回答问题”继续走到“能完成业务动作”，并覆盖推荐、试穿、购买和售后闭环。
