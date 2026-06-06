# openai和langchain

在进行 AI 或者是 AI Agent 开发时，我们经常会面临一个技术选型问题：**是直接使用 OpenAI 官方/兼容协议 SDK（配合手写逻辑），还是选择使用 LangChain 这一类大模型编排框架？**

---

## 1. 概念上的区别

### OpenAI SDK
- **定位**：大模型接口的专用请求客户端。
- **通俗理解**：它就像一个专门用来发送符合 OpenAI 协议规范请求的 `axios`。
- **特性**：
  - **单一职责**：只负责将你组装好的参数（模型、提示词、工具定义、消息历史等）发送给大模型接口，并接收/流式解析返回的响应。
  - **无其他内置功能**：AI 必备的其他功能（如：历史对话管理、工具调用循环、向量检索、提示词模板等）**全部都需要你自己手写代码实现**。
  - **优势**：极其轻量、高灵活性，没有任何框架层面的黑盒限制，代码可控度 100%。

### LangChain (`@langchain`)
- **定位**：AI 编排框架，是开发大模型应用（Agent、RAG 等）的工具箱与全家桶。
- **通俗理解**：它是一个集成化框架，将 AI 开发中各种零碎的、重复性的需求封装成了现成的 API 和模块。
- **特性**：
  - **开箱即用**：不需要自己手写去组装复杂的逻辑循环，直接调用框架内的各种库和组件即可搞定。
  - **组件化/生态化**：不仅包含模型调用，还涵盖了提示词管理、记忆组件、工具执行、链式调用（LCEL）、数据连接（加载/切分/向量化）等全套生态。

---

## 2. LangChain 的版本演进与注意事项

### 📦 历史版本（1.0 前）的“全家桶”模式
在早期版本中，LangChain 的功能全部打包在一个大包里。
开发者只需要安装一个包即可使用所有功能：
```bash
npm install langchain
```
- **缺点**：包体积巨大，依赖冗余严重。哪怕你只用其中的一个功能，也会把大量不相关的第三方依赖一起打包进来，导致冷启动慢、构建产物体积过大。

### 🧩 现代版本（1.0 后 / 0.1 之后）的“模块化拆分”模式
为了解决上述问题，LangChain 进行了彻底的拆分。现在各种功能和不同厂商的集成被解耦到了各自的子库中，开发者需要**根据具体需要单独安装**对应的包：

| 作用 | 安装命令 | 描述 |
| :--- | :--- | :--- |
| **基础核心功能** | `npm install @langchain/core` | 包含 LCEL（链式表达式语言）、基础抽象类、消息定义等核心底层。 |
| **请求 OpenAI 协议接口** | `npm install @langchain/openai` | 针对 OpenAI 及其兼容协议（如通义千问、DeepSeek 等）的专用包。 |
| **请求 Anthropic 协议接口** | `npm install @langchain/anthropic` | 针对 Claude 系列模型的专用包。 |
| **接入 MCP 服务** | `npm install @langchain/mcp-adapters` | 用于将 MCP（Model Context Protocol）工具无缝转换为 LangChain 工具的适配器。 |
| **其它通用组件及高级集成** | `npm install langchain` | 现在的 `langchain` 包退化为了一个可选的上层集成包（如各类 Loader、Chains、Agents 等）。 |

---

## 3. 核心功能维度对比

| 业务操作 | OpenAI SDK (配合手写) | LangChain 框架 |
| :--- | :--- | :--- |
| **请求大模型** | **OpenAI 协议专用**<br>只能调用符合 OpenAI 规范的接口，如果要换其他协议（如 Anthropic 原生接口），需要重写调用逻辑。 | **多模型快速兼容**<br>通过统一的接口抽象，支持主流大模型。切换模型协议时，**通常只需要换一个子库和类**，极少需要改动上层业务逻辑。 |
| **对话记录管理<br>(Chat History)** | **完全由开发者自行维护**<br>需要手动在内存、Redis 或数据库中存储上下文，并在每次发送请求时，手动把历史 `messages` 数组拼接并带给接口。 | **自动化/开箱即用**<br>提供了多种 `ChatMessageHistory` 组件，支持自动管理、自动携带在请求上（当然，你非要也可以自己写）。 |
| **Function Tool 调用<br>(Tool Calling Loop)** | **完全手写执行循环**<br>OpenAI 仅负责告诉你“大模型想调用哪个工具和入参”，至于**执行具体的本地/远程工具代码，以及将执行结果塞回 messages 传给大模型的这个循环（Loop），必须自己写逻辑实现**。 | **全自动托管**<br>可以将定义好的 Tool 接口与具体的执行代码绑定在一起，整体交给 LangChain。它会**自动完成“识别工具调用 -> 本地执行 -> 回传结果给大模型”的闭环循环**。 |
| **MCP (Model Context Protocol) 接入** | **需手动通过第三方库连接**<br>开发者需要使用其他库接入，执行 MCP 的工具也需要开发者借助其他库调用并手动拼接上下文。 | **快速适配与托管**<br>可以**直接托管给 LangChain**，你注册一下就可以，框架内部会自动处理底层通信。 |
| **向量检索与 RAG** | **拼凑式开发**<br>需要开发者手动去调用其他库做文件读取、手写切分算法、调用 Embedding 接口、操作向量数据库，最后再手写检索逻辑。 | **一条龙服务**<br>提供了对应的子库/组件去完成读取、切割、向量化、检索等一条龙服务。 |

---

## 4. 深度分析：我们在什么时候该怎么选？

基于真实开发体验与痛点，总结出以下三条最核心的选择逻辑和反馈：

### 💡 思考一：高定制化场景下，LangChain 反而会成为绊脚石
- 如果你做的业务**几乎完全基于 OpenAI 协议**进行深度的细节打磨和流程控制，那么**手写 OpenAI SDK + 自己的业务逻辑**是最佳方案。
- **原因**：LangChain 为了做到“万能适配”，其内部进行了层层封装。这导致一旦你遇到非常细节的定制需求（例如：特定流式数据的中间态处理、动态修改中间层提示词、拦截特定的工具调用决策等），在 LangChain 框架里可能需要去研究它晦涩的内部源码或者重写其核心 Class。用 LangChain 开发，很多时候会有一种**“缚手缚脚，必须强行迎合它的框架逻辑”**的痛苦感。

### 💡 思考二：作为 AI 开发学习者，应该先“手写”再“用框架”
- **强烈推荐**：在学习 AI 开发的各种概念阶段，**使用 OpenAI + 手写所有功能**比直接调 LangChain 更合适。
- **原因**：
  * **理解本质**：只有亲自动手实现一次 `messages` 的拼接与裁剪、写过工具调用的 `while (hasToolCall)` 状态机循环、实现过向量检索的余弦相似度对比，你才会真正明白 AI Agent、RAG、上下文管理的底层工作原理（能学得更扎实）。
  * **避免接口调用工的尴尬**：如果直接用 LangChain 这种封装好的去做，我们体会不到底层原理，对于这些 AI 核心操作和概念，也只是记住了怎么调用 LangChain 的 API。

### 💡 思考三：吐槽 —— Node.js/TS 生态下的 LangChain 痛点
- **社区重心倾斜**：LangChain 官方的主要精力几乎都在 **Python 版本** 上，其 Python 社区活跃度、文档更新速度以及新特性（如最新 Agent 架构）的推出都远远领先。
- **JS/TS 生态痛点**：相比之下，Node.js 版本的 LangChain 在生态和维护上体验真的差强人意：
  - 文档相对简陋，很多高级用法的 Demo 在 JS 侧缺失或失效。
  - **版本迭代过快且不够稳定**，经常会有一些莫名其妙的 bug 和版本/依赖冲突问题。
  - TS 的类型定义有时极其冗长和抽象，对新手并不友好。

---

## 5. 代码对比：手动 Tool Calling VS LangChain 自动托管

为了更直观地感受两者的差异，我们来看一个简单的“调用本地计算工具”的代码实现对比：

### 🛠️ 方案 A：使用 OpenAI 官方 SDK (手写执行循环)
开发者需要自己处理：判断是否需要调用工具 -> 寻找对应工具并执行 -> 把结果拼回 messages -> 再次请求模型的闭环。

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

// 1. 定义本地工具函数
const add = ({ a, b }) => String(a + b);
const toolsMap = { add };

// 2. 定义大模型能看到的工具声明
const tools = [{
  type: "function",
  function: {
    name: "add",
    description: "计算两个数的和",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    }
  }
}];

async function runAgent(userPrompt) {
  const messages = [
    { role: "system", content: "你是一个算术助手。" },
    { role: "user", content: userPrompt }
  ];

  // 第一次请求模型
  let response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
  });

  let message = response.choices[0].message;
  messages.push(message); // 将模型的回复（包含 tool_calls）存入历史

  // 3. 判断并手动执行工具
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      
      // 执行本地函数
      const result = toolsMap[toolName](toolArgs);

      // 将执行结果拼回 messages
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // 第二次请求模型，让其根据工具执行结果给出最终回答
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });
    
    console.log("最终结果:", response.choices[0].message.content);
  } else {
    console.log("普通回复:", message.content);
  }
}

runAgent("计算 123 加 456 等于多少？");
```

### 🪄 方案 B：使用 LangChain (`@langchain/openai` + `@langchain/core`)
LangChain 内部完全接管了工具执行和多轮调用的闭环。

```javascript
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 1. 使用 zod 定义工具，LangChain 会自动生成大模型所需的 JSON Schema
const addTool = tool(
  async ({ a, b }) => {
    return String(a + b);
  },
  {
    name: "add",
    description: "计算两个数的和",
    schema: z.object({
      a: z.number().describe("第一个加数"),
      b: z.number().describe("第二个加数"),
    }),
  }
);

async function runLangChainAgent(userPrompt) {
  // 2. 初始化模型并绑定工具
  const model = new ChatOpenAI({ model: "gpt-4o-mini" });
  const modelWithTools = model.bindTools([addTool]);

  // 3. 直接调用绑定了工具的模型（如果要全自动循环，可以使用 LangGraph 等高级封装）
  const res = await modelWithTools.invoke([
    ["system", "你是一个算术助手。"],
    ["user", userPrompt]
  ]);

  console.log("大模型决策：", res.tool_calls);
  // 注：配合 LangGraph 等工具链，开发者甚至不需要写任何 "if (tool_calls)" 的判断代码，
  // 整个 “决策 -> 运行工具 -> 总结回复” 的工作流会被一条 Chain 自动流转。
}

runLangChainAgent("计算 123 加 456 等于多少？");
```

---

## 📌 总结建议
1. **如果你在写商业级别的、具有极高定制化和性能要求的 AI 项目**：建议首选 **“OpenAI SDK (或适配的通用底层客户端，如 Vercel AI SDK) + 手写控制流”**。让业务逻辑最直接地贴近大模型 API，利于性能调优和高度定制。
2. **如果你在做快速原型开发、跨多种异构模型适配（比如今天用 Claude，明天用 Qwen）、或者快速搭建一个标准 RAG 系统**：那么使用 **LangChain** 可以极大地提升你的开发速度。
3. **如果是作为大模型开发者的入门与进阶**：一定要先**手写**，彻底弄清大模型底层协议与多轮调用机制，然后再根据项目需要选择是否引入 **LangChain** 这种重型框架。





# langchain兼容能力

目前市面上最主流的三大协议：
1. **OpenAI 协议**（代表：GPT系列、通义千问、DeepSeek等）
2. **Anthropic 协议**（代表：Claude系列）
3. **Google Gemini 协议**（代表：Gemini系列）

---

## 1. 探究兼容的本质

所谓的“大模型兼容能力”，其实我们在之前也提到了：
- **核心逻辑**：不管是哪个库去发起对大模型接口的请求，底层仍然使用的是标准 HTTP 协议，其发起的网络请求依然是 `fetch`（或 `axios` 等）。
- **兼容做法**：通过一层适配器（Adapter），在请求发起前将“统一格式的消息数据”转换为“不同协议所需的特定结构”发送出去，并在收到响应后，再将“遵循特定协议的返回体”逆向解析成“统一的数据模型”。

---

## 2. 传统方案：若使用 OpenAI 客户端去硬解“非 OpenAI 协议”

如果不用编排框架，仅用 `openai` 官方库（或原生底层 `fetch`）来请求一个非 OpenAI 协议的模型（例如从 Qwen 切换到 Gemini 原生接口），开发者必须经历以下三个繁琐的开发步骤：

### 🔄 步骤 1：手动修改 messages 数据结构
- **解释**：不同模型协议对消息字段的要求不一。例如，OpenAI 支持普通的 `role: "system"` 作为消息，而 Gemini 协议中用户消息使用 `parts` 数组，且系统上下文（system instruction）无法直接作为 `role: "system"` 塞入普通消息数组中，必须拆出来。
- **核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/openaidemo.js:33-43`
  ```javascript
  //突然有一天要改成请求gemini协议的
  //那么我们就得改代码，首先修改我们构建好的适合openai的message，改成适合gemini
  const messageListGemini = [
      {
          role: "user",
          parts: [
              { text: "你好" }
          ]
      }
      //system也不能待在这里了
  ]
  ```

### 📡 步骤 2：改用 request 发起通用请求并重新组装 Body
- **解释**：无法使用高级封装的 `openai.chat.completions.create` 方法，需要调用底层的 `.request` 或手动组织 HTTP POST 请求，指定对应的协议 Path 并拼接不兼容的 Body（如 `system_instruction`）。
- **核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/openaidemo.js:45-55`
  ```javascript
  //改用request，body结构也得大概
  const response = await openai.request({
      method: "post",
      path: "gemini协议的地址",
      body: {
          model: "xxx",
          content: messageListGemini,
          system_instruction: {
              parts: [{ text: "系统上下文" }]
          }
      },
  })
  ```

### 📥 步骤 3：根据新协议，手动改写出参解析方式
- **解释**：请求返回的 JSON 格式也不一样，OpenAI 是从 `choices[0].message.content` 获取内容，而 Gemini 是从 `candidates[0].content` 中取内容。开发者需要手动修改并维护所有消费出参的代码。
- **核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/openaidemo.js:56-57`
  ```javascript
  //消费出参的方案也得改
  console.log(response.candidates[0].content)
  ```

---

## 3. LangChain 方案：全自动的多协议完美兼容

LangChain 针对多模型协议的兼容设计了一套优雅的“声明式”方案。对开发者而言，你**不需要关心任何底层的协议差异**，其处理流程如下：

### 🛠️ 步骤 1：按 LangChain 统一格式定义输入消息
- **解释**：开发者一律使用 LangChain 提供的 `SystemMessage`、`HumanMessage`、`AIMessage` 等标准类来构建统一的消息格式，多模态（文本与图片混合）也有标准的消息类型结构，不需要考虑各个模型的字段和结构区别。
- **核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/langchaindemo.js:38-47`
  ```javascript
  const messageList1 = [
      new SystemMessage("你是一个聊天机器人"),
      new HumanMessage("你好"),
      new HumanMessage({
          content: [
              { type: "text", text: "按时大大撒所" },
              { type: "image_url", image_url: "data:image/png;base64,/9j/4AAQS" }
          ]
      })
  ]
  ```

### 🔌 步骤 2：切换对应的专用子库客户端
- **解释**：当你想调用不同协议的模型时，你只需要直接实例化对应的类（如从 `ChatOpenAI` 换成 `ChatAnthropic`），然后调用统一的 `invoke` 接口发送请求即可。
- **核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/langchaindemo.js:48-61`
  ```javascript
  // 切换不同的模型客户端，但上层消费方式保持高度一致
  // const chat = new ChatOpenAI({
  //     modelName: "doubao-seed-2.0-code",
  //     apiKey: "edf67641-ba86-4d69-a848-06818c5b883a",
  //     configuration: {
  //         baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
  //     }
  // })
  const chat = new ChatAnthropic({
      model: "doubao-seed-2.0-code",
      anthropicApiKey: "your-api-key",
      anthropicApiUrl: "https://your-api-endpoint"
  })
  //调用invoke把请求发出去
  const res = await chat.invoke(messageList1)
  ```

### 🔄 步骤 3：该专用子库在底层自动进行协议“双向转化”
- **解释**：LangChain 内部会拦截请求，并由具体的适配器（如 `@langchain/anthropic`）自动将统一格式的消息转化成目标接口所需的协议格式。
- **验证机制**：通过在全局拦截 `fetch` 方法将底层真正发出的 Body（`req.json`）输出到文件中进行对比。

  - 作用可以看到核心代码是如何

- **拦截原理核心代码**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-2 langchain的兼容能力/code/langchaindemo.js:6-28`

  ```javascript
  // 拦截 fetch 请求
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
      // 写入抓包文件的请求体
      if (options.body) {
          fs.writeFileSync("req.json", options.body, "utf-8")
      }
      // 发送原始请求
      const response = await originalFetch(url, options)
      // 克隆并写入响应体
      const clonedResponse = response.clone()
      const responseBody = await clonedResponse.text()
      fs.writeFileSync("res.json", responseBody, "utf-8")
      return response
  }
  ```
- **实际转换生成的协议数据（`req.json` 抓包内容，自动转换成 Anthropic 专属结构）**：

  - 上面拦截函数获取的req.json

  ```json
  {
      "model": "doubao-seed-2.0-code",
      "stream": false,
      "max_tokens": 4096,
      "thinking": { "type": "disabled" },
      "messages": [
          { "role": "user", "content": "你好" },
          {
              "role": "user",
              "content": [
                  { "type": "text", "text": "按时大大撒所" },
                  {
                      "type": "image",
                      "source": {
                          "type": "base64",
                          "media_type": "image/png",
                          "data": "/9j/4AAQS"
                      }
                  }
              ]
          }
      ],
      "system": "你是一个聊天机器人" // LangChain 自动将 SystemMessage 提取并转换为了最外层 Anthropic 专有的 system 字段！
  }
  ```

### 📥 步骤 4：AI 接口返回后，底层自动转化为 LangChain 统一返回体
- **统一转化后的 AIMessage 构造器格式展示**：

  ```json
  A.json
  {
      "lc": 1,
      "type": "constructor",
      "id": [
          "langchain_core",
          "messages",
          "AIMessage"
      ],
      "kwargs": {
          "content": "你好！很高兴为你服务。有什么我可以帮你的吗？", // 对应 JS 运行时的 res.content
          "additional_kwargs": { ... }
      }
  }
  ```

  ### 💡 **常见误区：为什么在使用时不是 `res.kwargs.content`而是res.content？**

  因为运行时返回的 `res` 是一个**已经实例化好的 JavaScript 类对象（Class Instance）**，而**不是**普通的 JSON 对象。
  在类实例化时（相当于 `new AIMessage({ content: "..." })`），其构造函数内部会执行类似 `this.content = args.content` 的赋值操作，将参数**直接平铺挂载到实例的根属性上**。
  类实例上并不存在一个名为 `kwargs` 的属性（调用 `res.kwargs` 将会返回 `undefined`）。因此，在代码中只能写 `res.content`！

  ### 那为什么在 A.json 里面会有一个 `"kwargs": { "content": "..." }` 如上所示呢？

  - 这是因为 A.json 是一个经过序列化后的静态 JSON 文件。
  - 为了能够随时将这个 JSON 数据**“反序列化”**重新还原回原汁原味的、具备方法和特定属性的 `AIMessage` 类实例，LangChain 设计了一套标准的序列化协议（`Serializable`）：
    - 它用 `"type": "constructor"` 标明这是一个类构造函数数据。
    - 用 `"id": ["langchain_core", "messages", "AIMessage"]` 标记类文件的原始引用路径。
    - 用 `"kwargs"` (Keyword Arguments，即**初始化参数字典**) 来打包存储所有实例化这个类所必需的初始参数（如 `content`）。
  - 当下一次 LangChain 读取 A.json 时，反序列化加载器（Loader）就能通过这个 JSON 自动执行new AIMessage(json.kwargs)，再次在内存中平铺生成一个可以用 res.content 正常调用的类实例对象了。

  **详细解释**：无论大模型接口返回什么格式，LangChain 底层都会由适配器对响应包体进行解析，并统一构造包装成统一的数据对象 `AIMessage` 类实例。

  - **在 JS/TS 代码运行时**：模型返回的 `res` 属于 `AIMessage` 类实例。该类实例包含一个直观的 `.content` 属性。因此开发者可以直接通过 `res.content`（如 `langchaindemo.js` 中的 `console.log(res.content)`）获取回复的文本内容。

    ```js
    // 它的底层构造逻辑类似于：
    class AIMessage extends BaseMessage {
        constructor(fields) {
            super(fields);
            this.content = fields.content; // 直接挂载到实例的根路径上！
            this.additional_kwargs = fields.additional_kwargs || {};
        }
    }
    ```

---

## 📌 总结：什么时候最能享受 LangChain 的兼容红利？
1. **跨模态及多模型快速比对**：在评估或者调试不同厂商模型的效果时，使用 LangChain 可以在不改动任何业务逻辑的前提下，仅换一行类名即刻完成调用适配。
2. **异构模型混合开发**：比如在一套复杂的 Agent 架构中，规划大脑用 Claude 3.5，执行工具用 GPT-4o-mini，在 LangChain 中管理这些异构模型的输入输出，体验极佳。





# 大写开头一般是类，不能直接用，而是通过new来获取实例来用





# 构建LLM链条

在深入使用 LangChain 开发 Agent 或者 RAG 系统时，**“构建 LLM 链条”**是其最为核心的基础。通过声明式、链式地组织“消息模板 -> 大模型 -> 输出解析器”，可以极大地简化开发流程。

---

## 1. 传统手写消息数组的痛点

在之前的开发中，我们通常采用手动声明数组（如 `[{ role: "user", content: "..." }]`）然后塞入消息的做法。然而在实际工程中，这种做法存在三个严重的致命痛点：

1. **消息只是普通的数据数组，无法串联成链条（LLM Chain）**：
   - 普通的 JS 数组只是一堆静态数据，无法与其他组件（如大模型、工具、输出解析器等）进行声明式的级联与流转，必须在业务层手写大量胶水代码。
2. **大部分 Prompt 是“固定模板 + 动态变量”的组合**：
   - 比如系统上下文（System Prompt），往往有一大段固定的指令，只有其中几个词（例如：用户喜好、当前日期、语言等）需要根据请求动态替换。如果手动做字符串拼接（如 `${sys}`），代码会变得臃肿且难以维护。
3. **历史记录（Context History）处理异常繁琐**：
   - 如果手动拼接数组，每次请求都需要手动剔除多余的系统 Prompt，并把历史聊天消息（User 与 AI 的多轮对话）按照正确的时序插回数组中。一旦涉及多模态（图片）或复杂的工具调用历史，数组处理难度将呈指数级上升。

---

## 2. 步骤 1：定义消息模板（ChatPromptTemplate）

为了解决上述痛点，LangChain 提供了 `ChatPromptTemplate` 这一核心类，支持将系统 Prompt、用户输入、多模态图片、历史记录占位符等完美封装。

### 🔄 1）构建简单的单个消息模板
- **解释**：用于最简单的单轮问答场景，通过模板字符串快速构建输入。
- **代码**：
  ```javascript
  import { ChatPromptTemplate } from "@langchain/core/prompts";
  
  // 构建单消息模板，大括号 {question} 即为动态参数占位符
  const simplePrompt = ChatPromptTemplate.fromTemplate("我的问题是：{question}");
  ```

### 🔄 2）构建复杂的系统+用户+历史占位符+多模态模板
- **解释**：通过 `fromMessages` 可以组合各种角色和占位符：
  - `["system", "{sys}"]`：可替换的系统上下文。
  - `new MessagesPlaceholder("historyPlaceholder")`：**历史记录占位符**。它是一个专门用于注入“历史对话消息数组”的槽位，后续只需传入一个数组，即可在此处自动展开。
  - `["human", [...]]`：包含文本与 Base64 图片多模态输入的复杂消息体。
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/message.js:7-13`
  ```javascript
  const prompt = ChatPromptTemplate.fromMessages([
      ["system", "你是一个聊天机器人"],
      ["system", "以下是用户的资料{sys}"],
      // 也可以用 new MessagesPlaceholder("historyPlaceholder") 作为聊天上下文的占位符
      new MessagesPlaceholder("s"),
      ["human", "你好，{a}"]
  ]);
  ```

---

## 3. 步骤 2：通过 invoke 执行参数替换

定义好模板后，我们不需要手动去处理字符串或数组拼接。直接通过调用 `prompt.invoke(...)` 传入对应的变量对象，LangChain 会在底层自动将占位符替换并转换为标准的消息实例数组。

- **解释**：调用 `invoke` 时，传入的 key 必须与模板中的大括号占位符（如 `sys`、`a`、`s`）一一对应。其中 `s` 或 `historyPlaceholder` 可以直接传入 `HumanMessage` / `AIMessage` 类实例数组，LangChain 会在该位置自动按顺序插入。
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/message.js:16-20`
  ```javascript
  const res = await prompt.invoke({
      sys: "用户是个男的",
      s: [new HumanMessage("我是之前的聊天记录")], // 自动展开进 MessagesPlaceholder 中
      a: "ai"
  });
  console.log(res); // 此时输出的已经是组装完毕的标准消息数组对象
  ```

---

## 4. 步骤 3：请求发送给大模型（Piping to LLM）

得到组装好的消息后，我们需要将其发给大模型。
在 LangChain 中，通过 **LCEL (LangChain Expression Language)** 极其优雅的管道运算符 **`.pipe()`**，我们可以直接把构建好的 Prompt 导向大模型实例：

```
[构建好的消息 (PromptTemplate)] === .pipe() ===> [大模型 (ChatOpenAI / ChatAnthropic)]
```

- **解释**：通过 `prompt.pipe(model)`，我们将消息模板和大模型融合成了一个高层的 **“Chain（链条）”**。后续我们只需要对这个 `chain` 调用 `invoke`，参数就会自动流经 `prompt` 替换占位符，然后自动发往 `model` 获取大模型响应。
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/modelrequest.js:13-20`
  ```javascript
  const model = new ChatOpenAI({
      modelName: "doubao-seed-2.0-code",
      apiKey: "your-api-key",
      configuration: {
          baseURL: "https://your-base-url/v3"
      }
  });
  
  // 使用 .pipe() 链接消息模板和大模型
  const chain = prompt.pipe(model);
  ```

---

## 5. 步骤 4：直接管道解析结果（Output Parsers）

大模型接口默认返回的是一个极其复杂的 `AIMessage` 实例对象，里面包含了大量的元数据（如 `usage_metadata`、`response_metadata` 等）。然而绝大多数情况下，前端只需要拿到**纯文本回答**。

如果我们不想每次都手动打印或者翻找返回结构，可以使用 LangChain 提供的 `StringOutputParser`（字符串输出解析器，直接string化你想打印的东西），直接用 `.pipe()` 将其挂载到链条的尾部：

- **要是你没有加StringOutputParser则最终的res是AIMessage，否则就是普通的字符串**，你保存历史记录让langchain之后能够解析必须是AIMessage，**所以**要是加了StringOutputParser则**保存到历史记录数组里面**还要提前new AIMessage(res)才行

```
[消息模板] == .pipe() ==> [大模型] == .pipe() ==> [解析器 (StringOutputParser)]
```

- **解释**：`StringOutputParser` 会拦截大模型返回的 `AIMessage` 对象，自动将其中的 `.content` 纯文本提取出来，使得链条的最终输出直接就是一个**纯字符串**！
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/modelrequest.js:20-26`
  ```javascript
  import { StringOutputParser } from "@langchain/core/output_parsers"
  
  // 1. 组装整条链：消息模板 -> 大模型 -> 字符串输出解析器
  const chain = prompt.pipe(model).pipe(new StringOutputParser())
  
  // 2. 传入变量一键运行，直接拿到大模型给出的纯字符串回复！
  const res = await chain.invoke({
      sys: "用户是个男的",
      a: "ai"
  });
  console.log(res); // 直接输出纯文本，例如: "你好！有什么我可以帮你的？"
  ```
- **多样化解析器**：除了最常用的 `StringOutputParser`，LangChain 内部还内置了多种解析器，有的可以自动把响应内容解析为 **JSON 对象**，有的可以解析为 **XML** 等结构化数据。

---

## 🛠️ 6. 深度探究：`.pipe()` 的底层工作原理与 Runnable 协议

LangChain 的 `.pipe()` 之所以能够如此丝滑地连接各种组件，是因为它们都遵循了 **Runnable（可运行）协议**。

---

### ⚙️ 6.1 Runnable 类的本质与参数规范

LLM 链条的每一个环节都必须是一个 **Runnable 对象**。这类对象的核心特点是：**它必须实现一个符合规范的 `invoke` 方法**。

- **`invoke` 函数签名与参数规范**：
  ```javascript
  {
      invoke: (input, config) => { // 注意参数规范，第二个参数为可选配置项 config
          console.log(input, 'inputinput123');
          return input; // 必须返回数据！以便将结果顺畅地流转传递给管道中的下一步
      }
  }
  ```
- **核心逻辑**：当你调用链条对象的 `chain.invoke()` 时，`.pipe()` 的底层说白了就是**依次调用各个环节对象的 `invoke` 方法**：把上一个环节的执行结果作为输入传过去，然后把当前环节的计算结果吐给下一个环节。

---

### 📥 6.2 pipe 环节之间的值传递规律

在链式调用中，相邻环节的值传递遵循以下极其简单直白的规律：
- **上一个 pipe 环节点 `invoke` 方法的返回结果（Return Value），会自动作为下一个 pipe 环节点 `invoke` 方法的接受值（Input Argument）。**
- 如果中间任何一个环节忘记 `return` 或者返回了 `undefined`，链条的下游将会中断或者收到 `undefined`。

---

### �️ 6.3 自定义 pipe 环节的两种方式

通过了解 Runnable 协议，我们完全可以**自定义某些 pipe 环节**，在链条中嵌入我们自己特殊的业务逻辑（如：安全审查、打印日志、写文件等）。

#### 💡 方式一：直接使用实现 `invoke` 的普通 JS 对象（即插即用）
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/runabletest.js:14-29`
  ```javascript
  // 模拟两个最简单的包含 invoke 方法的自定义普通对象，串联到链条中
  const chain = prompt.pipe({
      invoke: (input) => {
          console.log(input, 'pipe2'); // 此时 input 是上游输出的标准消息体
          return input; // 必须返回数据，以便流转
      }
  }).pipe({
      invoke: (input) => {
          console.log(input, 'pipe3'); // 接收上一个 pipe 传来的数据
          return input;
      }
  });
  ```

#### 💡 方式二：使用 `@langchain/core/runnables` 中的 `RunnableLambda` 或自定义类
- **解释**：我们可以显式继承 `Runnable` 类并重写 `invoke`，或者使用 LangChain 提供的 `RunnableLambda` 将任意同步/异步函数包装成合法的 Runnable 对象。
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/custompipe.js:15-24`
  ```javascript
  import { RunnableLambda } from "@langchain/core/runnables";
  
  // 使用 RunnableLambda 包装一个写入本地日志的自定义业务环节点
  const chain = prompt.pipe(new RunnableLambda({
      func: (input) => { // 这个是func而不是invoke，因为在new RunnableLambda类里面有invoke(){this.func},所以你传入func就行
          fs.writeFileSync("./a.json", JSON.stringify(input)); // 写入日志
          return input; // 保持数据向下流转
      }
  }));
  ```



#### 💻 核心实战：利用 `RunnableMap` 并行请求 API 作为链条起点
在本项目中，我们演示了如何不手动处理 API 的 Promise 组装，而是利用 **`RunnableMap` 并行获取价格和库存**，并直接作为链条的起点流入 Prompt 的过程：

- **解释**：
  1. 定义 `getPrice` 和 `getStore` 两个异步 `RunnableLambda`，模拟请求两个外部接口（分别延时 1 秒）。
  2. 使用 `RunnableMap.from` 将两个 Runnable 任务组合起来。该组件会**并行运行**所有任务，并将结果打包成一个 Key-Value 对应的对象（如 `{ price: 200, store: 1000 }`）。
  3. 用 `request.pipe(prompt)` 链接。此时链条的起点是 `RunnableMap`，其输出的接口对象会自动解构，成为 `prompt` 模板所需的 `{price}` 和 `{store}` 变量！
- **核心代码引用**：`@C:/Users/MJL/Desktop/ai学习/ppt和源码/5-3 构建LLM链条/code/starByApi.js:9-35`
  ```javascript
  import { RunnableLambda, RunnableMap } from "@langchain/core/runnables";
  const prompt = ChatPromptTemplate.fromMessages([
      ["human", "你好，这个衣服的价格为{price}，库存是{store}"]
  ]);
  
  // 1. 模拟异步获取商品价格 API
  const getPrice = new RunnableLambda({
      func: async () => {
          const price = await new Promise((resolve) => {
              setTimeout(() => resolve(200), 1000)
          });
          return price;
      }
  });
  
  // 2. 模拟异步获取商品库存 API
  const getStore = new RunnableLambda({
      func: async () => {
          const store = await new Promise((resolve) => {
              setTimeout(() => resolve(1000), 1000)
          });
          return store;
      }
  });
  
  // 3. 将异步组件合并为并行运行的 RunnableMap 字典对象
  const request = RunnableMap.from({
      price: getPrice,
      store: getStore
  });
  
  // 4. 将接口流作为链条的起点，直接 pipe 消息模板
  const chain = request.pipe(prompt);
  
  // 一键运行！大模型的消息变量会自动在起点被接口数据动态填满
  const res = await chain.invoke();
  console.log(res); // 输出填充好 price: 200, store: 1000 的完整标准消息格式
  ```



### 🚀 6.4 进阶：以其他非消息环节开始的 LLM 链（API / RAG 优先流）

有的时候，我们**并不是以简单的构建要发送的消息模板开始**一条 LLM 链，而可能需要先做别的事情。

```js
const prompt = ChatPromptTemplate.fromMessages([
    ["human", "你好，这个衣服的价格为{price}，库存是{store}"]
]);
```

#### 💡 典型应用场景

- **接口优先流**：我们需要先并行请求三个接口获取数据（例如查询商品的最新价格、库存、物流信息），等拿全数据后，再塞进 Prompt 消息模板中，最后才发送给大模型。
- **RAG 本地知识库流**：先以用户的问题进行向量检索，检索出相关的 Context，再将 Context 和问题一起输送给 PromptTemplate。
- **Tool / Function 调用流**：先执行本地/第三方的 function tool 拿到返回值，再塞入大模型上下文。
