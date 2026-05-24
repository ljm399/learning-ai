# LLM

LLM：Large Language Model（大语言模型）。

知道怎么调用就行，而不是自己去生成（大多数业务是“接入/应用模型”，不是“训练模型”）。

- 推荐大模型厂商（常见）

  - 阿里云百炼（DashScope / 通义千问 Qwen）

  - OpenAI（GPT 系列）

  - Anthropic（Claude）

  - Google（Gemini）

  - 字节火山引擎（豆包）

  - 百度智能云（文心）

    

- 调用大模型（这里拿阿里云那个，因为有免费token，之后你想要国外的可以去找怎么拿到api）

  - http
    - http 是无状态的，所以入参要把“本次生成所需的信息”带齐（例如 `model`、`messages`、鉴权信息、生成参数等）
  - SDK
    - SDK 本质也是 HTTP，只是把鉴权、重试、流式等细节封装了

### 直接http

- 传递数据（入参，axios举例）

  ```js
  const axios = require("axios")
  
  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  const apiKey = process.env.DASHSCOPE_API_KEY
  
  axios
    .post(
      url,
      {
        model: "qwen3-max",
        messages: [
          { role: "system", content: "你是一个有帮助的助手。" },
          { role: "user", content: "你是谁？" },
        ],
        // 常见可选参数（不同厂商支持的范围可能不同）
        // temperature: 0.7,
        // max_tokens: 512,
        // stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`, // 一般Authorization都是带Bearer的
          "Content-Type": "application/json",
        },
        timeout: 60_000,
      }
    )
    .then((res) => {
      // axios 的响应对象是 { data, status, headers, ... }
      // 其中 res.data 才是接口返回的“业务响应体”
      console.log(res.data)
    })
    .catch((err) => {
      console.error(err.response?.data || err.message)
    })
  ```

  

- 响应数据（出参）

  ```js
  // 假设 responseBody === res.data
  const responseBody = res.data
  const firstChoice = responseBody.choices?.[0]
  
  // 模型主要输出
  const content = firstChoice?.message?.content
  console.log(content)
  
  // token 统计 / 计费信息
  console.log("usage:", responseBody.usage)
  ```

  一个典型的响应体（`responseBody`）结构大概是这样：

  ```json
  {
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1770465999,
    "model": "qwen3-max",
    "choices": [
      {
        "index": 0,
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": "你好！我是通义千问（Qwen）..."
        }
      }
    ],
    "usage": {
      "prompt_tokens": 11,
      "completion_tokens": 70,
      "total_tokens": 81
    }
  }
  ```

  - chocies数组解释
    - `choices` 是候选结果数组（通常取 `choices[0]`）
    - `choices[i].message.content` 是生成文本
    - 非流式（一次性返回）一般通过 `choices[i].message` 获取
    - 流式（stream=true，分片返回）一般通过 `choices[i].delta` 获取并把每次的增量 `content` 拼接起来
    - `choices[i].finish_reason` 表示停止原因（常见 `stop` 正常结束；`length` 达到长度上限）
  - 其他重要属性
    - `usage`
      - token 统计/计费信息：`prompt_tokens`、`completion_tokens`、`total_tokens`
    - `index`
      - 当前 choice 在 `choices` 数组中的序号（从 0 开始）

### 一些疑问

- message 里必须带上 system 以及之前的问答记录吗？
  - 可以不带。
  - 但接口是无状态的：模型不会记得你上一次问了什么。
  - 所以如果你希望“多轮对话/上下文更准确”，就需要把前面的对话（至少是关键几轮）一起放进 `messages`。

- role 一定要准确带上吗？
  - 严格来说，role 不对也可能“凑合能用”，比如把 system 当 user 发过去，多半也会有输出。
  - 但 role 正确有两个好处：
    - 更有利于模型理解每条消息的意图，从而提高回答稳定性/准确性
    - 方便人类阅读与调试（你一眼能看出哪条是规则、哪条是用户输入、哪条是模型回复）

- 其他厂商的入参和出参也是这种格式吗？
  - 不一定完全一样。
  - 但很多主流厂商会提供“类 OpenAI 的兼容格式”（尤其是 `messages/choices/usage` 这种结构）。
  - 实战里可以先把这种结构当作通用标准：
    - 能兼容就复用同一套代码/SDK
    - 不兼容就按对方文档做字段适配



### SDKD和http使用的baseURl不同，但发送的url给大模型都一样

- SDK发送时会给baseURL凭借和http相同
- 验证：
  - 通过拦截器 
  - 笔记里面有

### 后端请求

- SDK解释

  - SDK 是什么
    - SDK（Software Development Kit）就是厂商/社区把“调用接口的通用流程”封装成库。
    - 你在代码里调用 `openai.chat.completions.create()`，SDK 会在内部用 HTTP 帮你请求接口。
    - 结论：SDK != 模型本身，它只是“更方便地发 HTTP 请求”。
  - 为什么要用 SDK
    - 少写样板代码（拼 URL、拼 headers、序列化 JSON、解析响应等）
    - 更容易支持：超时、重试、流式返回（stream）、统一的错误对象
    - 接口升级时通常改动更小
  - SDK 返回的数据怎么用
    - `llmres.choices[0].message.content`：模型主要输出文本
    - `llmres.usage`：本次消耗 token（用于成本统计/限流/优化）
    - 你可以选择：
      - 只 `res.json(llmres.choices[0].message)` 返回最关键的内容（简单）
      - 或直接 `res.json(llmres)` 把 `usage` 等信息一起给前端（更完整）
  - （可选）流式能力
    - 当 `stream: true` 时，服务端会拿到分片增量（通常在 `choices[i].delta.content`），需要边接收边拼接。
  
- 后端建议使用python或java，这里因为前端所以用node

- 操作流程
  - 启动服务文件（node 运行 server）
  - 配置大模型接口地址和 apiKey，创建 `openai` 对象
  - 开启 express 服务（例如监听 3000 端口）
  - 前端请求到服务端接口（例如 `GET /llm?keyword=xxx`）
  - 服务端通过 `openai.chat.completions.create()` 请求大模型接口
  - 把本次用户问题和 AI 回复存到 `messageList`，下次请求继续带上（上下文）
  - 服务端把 AI 回复返回给前端，前端展示
  
- 安装openai（就是个SDK)
  - 在 node 项目里安装依赖

    ```bash
    npm i openai express cors
    ```

  - 建议把 `apiKey` 放到环境变量里（不要写死在代码里）

    ```bash
    set DASHSCOPE_API_KEY=sk-xxx
    ```

    - 环境变量怎么放（常见 3 种）
      - 方式一：临时设置（一次性）
        - 只对当前终端窗口生效，关闭窗口就没了
        - Windows（cmd）示例：

          ```bash
          set DASHSCOPE_API_KEY=sk-xxx
          node index.js
          ```

      - 方式二：`.env` 文件（开发最常用）
        - 在项目根目录创建 `.env`：

          ```bash
          DASHSCOPE_API_KEY=sk-xxx
          ```

        - 安装并加载 `dotenv`（要在读取 `process.env` 之前加载）：

          ```bash
          npm i dotenv
          ```

          ```js
          require("dotenv").config()
          apiKey: process.env.DASHSCOPE_API_KEY
          ```
        
        - 注意：`.env` 通常要加入 `.gitignore`，避免把 key 提交到仓库
      - 系统级环境变量（长期生效）
        - 在系统环境变量里新增 `DASHSCOPE_API_KEY`
        - 修改后需要重开终端/IDE 才能生效
  
- 代码
  - 最小可用示例（对应 `ppt和源码/1-2 搭建服务部分/code/server/index.js` 的核心逻辑）

    ```js
    const express = require("express")
    const cors = require("cors")
    const OpenAI = require("openai")

    const app = express()
    app.use(cors())

    const messageList = [
      {
        role: "system",
        content: "你是一个优秀的前端开发工程师，你的公司用的vue3+elementplus",
      },
    ]

    const openai = new OpenAI({
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: process.env.DASHSCOPE_API_KEY,
    })

    // http://localhost:3000/llm?keyword=你好
    app.get("/llm", async (req, res) => {
      const keyword = req.query.keyword

      const queryObj = { role: "user", content: keyword }
      messageList.push(queryObj)

      const llmres = await openai.chat.completions.create({
        model: "qwen-plus",
        messages: messageList,
      })

      // 把 AI 回复也存起来，形成上下文
      messageList.push(llmres.choices[0].message)

      // 返回给前端（也可以直接返回 llmres，看你前端想拿哪些字段）
      res.json(llmres.choices[0].message)
    })

    app.listen(3000)
    ```

  - 代码解释
    
    - baseURL去官网有对应语言的路径
    - apikey则是密钥
    - cors
      - 浏览器有同源策略：前端页面的域名/端口 与 后端接口不一致时，浏览器会拦截。
      - `cors()` 中间件用于给响应加上允许跨域的头（例如 `Access-Control-Allow-Origin`），让前端能正常调用。
      - 别人写好了，你调用就行
    - 请求体的role所有值介绍
      - `system`
        - 设定助手的规则/人设/输出风格（优先级通常最高）
      - `user`
        - 用户输入的问题/指令
      - `assistant`
        - 模型历史输出（把之前的回答放回去才能形成上下文对话）
      - （可选）`tool`
        - 一些实现会用它表示工具调用结果/外部函数返回（是否支持看厂商与 SDK）
    



### 提示词

- 提示词一般都是md格式编写，大模型返回的数据也是md格式

- 基本要素（写清楚 4 件事）
  - 目标任务
    - 你要 AI 做什么（问什么问题/完成什么任务）
    
  - 上下文
    - 之前的对话记录，或者当前业务场景/技术栈等背景信息
    
      ```js
      const sytemContext = fs.readFileSync("./context.md")
      //转文本，否则是buffer
      const systemString = sytemContext.toString();
      const messageList = [
          {
              role: "system",
              content: systemString
          }
      ]
      ```
    
  - 输入描述
    - 你提供给 AI 的资料是什么（数据、代码、需求、限制条件等）
    
  - 输出描述
    - 你希望 AI 怎么输出：格式（markdown/json/表格/代码）、字段、长度、风格、约束

- 高级要素（复杂问题更有效）
  - 角色（Role）
    - 让 AI 扮演特定身份/岗位，能让输出更贴合你的目标
  - 举例（Example）
    - 给 1-2 个输入输出示例，能显著减少模型理解偏差
  - 分隔符（Delimiter）
    - 用 `###`、`---`、代码块等把提示词分段，避免信息混在一起
  - 思考步骤（Step）
    - 让模型按步骤做：先做什么、再做什么、最后产出什么

- 逐步进化的提示词思路
  - 先让模型把“基本功能”写出来
  - 再要求健壮性（边界情况、错误处理）
  - 最后要求易用性（可读性、可维护性、接口设计）

- 案例一：

  ```md
  #角色
  你是一个优秀的前端工程师，你的代码都是高质量代码，会追求代码性能
  #技术背景
  你所用的技术栈是vue3+elementui，使用html+less+ts开发。你写项目都是ts代码
  #输入描述
  你会接收到一些前端问题，以及一些前端的技术文档
  #输出描述
  你要针对问题和要求，给出具体的前端代码，不需要过多的技术描述，直接给代码。
  #思考步骤
  1,思考需求的技术方案
  2,选择最合适的技术方案
  3,给出基本的实现代码
  4,按可维护性，可拓展性给出优质代码
  ```

- 案例二：逐步进化案例（同一个需求，提示词从“能用”到“好用”）

  - 第一版：只要“基本功能”

    ```md
    ### 目标任务
    用 JavaScript 写一个函数 `sum(arr)`，返回数组中所有数字的和。

    ### 输入描述
    - 输入：`arr` 是一个数组，例如 `[1,2,3]`

    ### 输出描述
    - 输出：返回数字，例如 `6`
    - 直接给代码
    ```

  - 第二版：补“健壮性”（边界情况 + 错误处理）

    ```md
    ### 目标任务
    用 JavaScript 写一个函数 `sum(arr)`，返回数组中所有数字的和。

    ### 上下文
    - 这是线上业务代码，需要对异常输入做处理。

    ### 输入描述
    - `arr` 可能为：`undefined/null`、非数组、包含字符串/NaN、空数组。

    ### 输出描述
    - 如果 `arr` 不是数组：抛出 `TypeError`
    - 非数字元素：忽略（或转换失败则忽略），不要让结果变成 NaN
    - 给出代码 + 简单用例（示例）
    ```

  - 第三版：补“易用性/可维护性”（接口设计 + 注释/类型 + 可扩展）

    ```md
    ### 角色
    你是一个注重工程质量的前端工程师。
    
    ### 上下文
    - 项目使用 TypeScript。
    - 希望函数可复用，并且行为可配置。
    
    ### 目标任务
    实现 `sum(arr, options)`：
    - 默认只累加 number
    - 可通过 options 控制是否允许字符串数字（例如 "3"）并转换
    
    ### 输出描述
    - 输出 TypeScript 代码
    - 给出清晰的类型定义（interface/type）
    - 给出 3 个使用示例
    
    ### 思考步骤
    1. 设计函数签名与 options
    2. 明确边界情况与默认行为
    3. 实现代码并补充示例
    ```

  

- 在 AI 应用里“内置提示词”
  - 用户不可能每次都写一大段完整提示词
  - 所以做 AI 应用时，开发者通常会预先写好一份 system 提示词（经常用 markdown 管理）
    - 每次请求都作为 `messages[0]` 的 `system` 发给模型
  - 用户只需要输入“目标任务/问题”，你在后端拼好上下文 + system 规则，让回答更稳定



#### 上下文

- 打磨上下文，不亚于自己训练个大模型，甚至会更好
- 关于大模型回答要求，80%靠上下文约束完成

- 上下文（context）是什么
  - 你在 `system`/`messages` 里给模型的“规则 + 背景 + 约束 + 目标”，它决定了模型怎么思考、怎么回答。
  - 记住：大模型是“语言对话”的模型，你喂给它的越清晰，它越容易做对。

- 怎么把上下文打磨好（迭代思路）
  - 结合你的 AI 应用场景，先写一个“最低可用”的上下文版本
  - 定期复盘：
    - 哪些回答不满意？
    - 不满意的原因是：缺背景、缺约束、输出格式不固定、还是用户输入不完整？
  - 把复盘结论写回上下文：加一条规则/一个示例/一个输出模板
  - 持续迭代：长期打磨上下文的收益通常不低于训练/微调模型（甚至更好）

- 分享一些推荐的约束（把它们写进 system 上下文）
  - 逻辑步骤约束
    - 适合专业性强的 AI 应用
    - 让 AI 按固定步骤回答，例如：先澄清问题 -> 给方案 -> 给代码 -> 给注意事项
  - 输入要求
    - 对用户输入提出要求
    - 例如：
      - 用户必须说明技术栈/版本号，否则先追问，不直接给最终答案
  - 违禁问题（禁止范围）
    - 在上下文中声明“哪些问题不回答/不输出”
    - 例如：不生成涉黄涉暴内容；不输出敏感信息；不提供违法用途的细节等
  - 风格
    - 规定回答风格：专业/口语/幽默/简洁/分点等
  - 输出要求
    - 规定输出格式与长度：
      - 必须 markdown 分点
      - 必须先结论后解释
      - 必须给可运行代码 + 使用示例
  - 反幻觉约束
    - 任何 AI 应用都建议加一句：
      - 不确定就说“不知道/需要更多信息”，不要编造或用模糊信息回答

  - 案例：可直接复制的 system 上下文（把下面整段作为 `messages[0]` 的 `system`）

    ```md
    # 你的角色
    你是一个严谨的资深工程师助手。
    
    # 回答逻辑步骤（必须遵守）
    1. 先确认需求：如果用户描述不清楚，先列出你缺少的关键信息并追问。
    2. 给出结论：用 1-3 句话说明最终建议。
    3. 给出方案：列出实现思路与关键点。
    4. 给出代码：提供可直接运行的示例代码。
    5. 给出注意事项：列出常见坑/边界条件/性能与安全注意点。
    
    # 输入要求（信息不足先追问）
    - 如果问题涉及前端/后端开发，请用户补充：语言与版本、框架版本、运行环境（node/python/java）、以及期望输出格式。
    - 如果用户没有提供这些信息，请先提问，不要直接给最终实现。
    
    # 违禁范围
    - 不输出涉黄涉暴内容。
    - 不提供违法用途的操作细节。
    - 不泄露或猜测用户的密钥、隐私数据、账号信息。
    - 不是前端知识不回答
    - react知识不回答
    
    # 风格
    - 使用中文。
    - 专业、简洁、分点。
    - 代码优先，解释适量。
    
    # 输出要求
    - 必须使用 Markdown。
    - 输出结构固定为：
      - `# 结论`
      - `# 方案`
      - `# 代码`
      - `# 注意事项`
    - 如果涉及代码：
      - 必须给出可运行代码
      - 必须给出最小使用示例
    
    # 反幻觉约束
    - 不确定就明确说“不知道/需要更多信息”。
    - 不要编造 API、包名、命令或配置。
    ```





#### md格式

- 常用语法补充

  - [信息] (链接) 
    - 作用：url 或者 点击跳转到当前文档具体位置

  - ! [] (图片地址)

  - \n 当解析md时才有效果，你这里typora是没有的
    - 比如下面的vue中使用md

  

- 前端渲染 markdown（推荐）
  - vue 前端
    - `@crazydos/vue-markdown`：基础展示 markdown
    - `remark-gfm`：GFM 扩展，让 markdown 组件支持链接、table 等
  - react 前端
    - `react-markdown`：基础展示 markdown
    - `remark-gfm`：GFM 扩展，让 markdown 组件支持链接、table 等

- 代码高亮
  
  - `rehype-highlight`
    - 代码高亮插件，可以嵌入到 markdown 组件中
  - `highlight.js`
    - 提供高亮主题样式（通常要额外引入 css 主题）
  
- 自定义样式（实践）
  - markdown 渲染在 AI 应用开发中很常见
  
  - 默认渲染效果通常一般，需要根据产品要求调样式
  
  - 常见做法：
    - 基于 markdown 渲染插件，封装一个自己的 `MarkdownRenderer` 组件
    - 统一处理：标题/列表/引用/代码块/table/链接/图片的样式
  
  - 案例
  
    ```js
    src/main.js // 导入全局
    import { createApp } from 'vue'
    import App from './App.vue'
    import "highlight.js/styles/github.css"
    import "./markdown.css"  // 一定要导入全局，这样才能被应用
    createApp(App).mount('#app')
    ```
  
    ```css
    ./markdown.css
    .mardown-a {
        background-color: pink;
    }
    ```
  
    ```vue
    src/xx.vue
    const mdstr = "## 标题\n 内容"
    const mdstrLi = "- 任务1\n+ 任务2"
    const mdstrLi2 = "1. 任务1\n2. 任务2"
    const mdstrTask = "- [X] 任务1\n- [ ] 任务2"
    const mdstrFont1 = "*字体*"
    const linkStr = "[百度](https://baidu.com 'AAA')";
    const linkPic = "![风景](https://img2.baidu.com/it/u=2376489989,3127732063&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=657 '风景照')";
    const mdTable = "| 城市 | 温度 | 天气 |\n| :--- | :---: | ---: |\n| 北京 | 25°C | 晴 |\n| 上海 | 28°C | 多云 |\n| 广州 | 32°C | 小雨 |";
    const codeStr = '以下是具体代码\n ```javascript\nconst a=1;\nconsole.log(a)\n```' 
    </script>
    <template>
      <div>
        <VueMarkdown :custom-attrs="{
          a: { class: 'mardown-a' }
        }" :remark-plugins="[remarkGfm]" :rehype-plugins="[hidhlightPlugins]" :markdown="mdstrTask">
          <template #input="{ ...props }">
            <span v-if="props.type === 'checkbox' && props.checked">
              ✅
            </span>
            <span v-if="props.type === 'checkbox' && !props.checked">
              [ ]
            </span>
          </template>
          <template #li="{ children, ...props }">
            <div class="my-li">
              <Component :is="children"></Component>
            </div>
          </template>
        </VueMarkdown>
      </div>
    </template>
    ```
  
  - 关键参数解释（以 `@crazydos/vue-markdown` 为例）
  
    - `:markdown="mdstrTask"`
      - 传入要渲染的 markdown 字符串
      - 例如 `mdstrTask = "## 标题\n 内容"`
    - `:remark-plugins="[remarkGfm]"`
      - 作用：因为有一些语法只用:markdown="mdstrTask"可能不支持，这个插件可以补充 
      - remark 是“把 markdown 解析为语法树”的插件体系
      - `remark-gfm` 用来支持 GFM 扩展：
        - 任务列表（- [ ]） 可以复制到typora看效果
        - 表格（table）
        - 删除线、自动链接等
  
    - `:rehype-plugins="[hidhlightPlugins]"`
      - rehype 是“把 HTML 语法树再处理/增强”的插件体系
      - `rehype-highlight` 用来给代码块加高亮 class
      - 你在 `main.js` 里引入了主题样式：`highlight.js/styles/github.css`，所以能看到高亮效果
    - `:custom-attrs="{ a: { class: 'mardown-a' } }"`
      - 给某些渲染出来的标签注入属性（这里是给所有 `<a>` 链接加 class）
      - 然后在 `markdown.css` 里统一写样式，例如：
  
        ```css
        .mardown-a {
          background-color: pink;
        }
        ```
  
  - slot 覆盖渲染（自定义某些节点怎么显示）
    - `<template #input="{ ...props }">`
      - 覆盖 input 节点（这里主要用于任务列表的 checkbox）
      - `props.checked` 表示是否勾选，你可以自定义成 ✅ / [ ] 等
    - `<template #li="{ children, ...props }">`
      - 覆盖 li 节点（列表项）
      - `children` 表示 li 里面默认要渲染的内容
      - 用法：`<Component :is="children" />`
        - 这相当于“把默认 children 再渲染出来”，但外面可以包一层 `div.my-li`
        - 这样你就能统一控制每个列表项的布局/间距/标记样式
  
- 注意下面md语法你可以复制到typora，一样可以看到效果

  ```js
  const mdstr = "## 标题\n 内容"
  const mdstrLi = "- 任务1\n+ 任务2"
  const mdstrLi2 = "1. 任务1\n2. 任务2"
  const mdstrTask = "- [X] 任务1\n- [ ] 任务2"
  const mdstrFont1 = "*字体*"
  const linkStr = "[百度](https://baidu.com 'AAA')";
  const linkPic = "![风景](https://img2.baidu.com/it/u=2376489989,3127732063&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=657 '风景照')";
  const mdTable = "| 城市 | 温度 | 天气 |\n| :--- | :---: | ---: |\n| 北京 | 25°C | 晴 |\n| 上海 | 28°C | 多云 |\n| 广州 | 32°C | 小雨 |";
  const codeStr = '以下是具体代码\n ```javascript\nconst a=1;\nconsole.log(a)\n```' 
  </script
  ```



### 你那个英语ai就是要靠你的提示词



### 减少token消耗

- token 消耗（多数厂商 `usage.total_tokens`）
  - `total_tokens = prompt_tokens + completion_tokens`
  - `prompt_tokens`
    - 你发给模型的所有输入 token：
      - `system` 提示词
      - 本轮 `user` 输入
      - 为了多轮对话而追加的历史 `assistant/user` 消息（上下文）
      - （如果有）工具调用相关内容（tool/function call 的参数、工具返回结果等）
  - `completion_tokens`
    - 模型本轮生成的输出 token（也就是返回的内容长度）

- token 消耗最大的“真凶”通常不是用户这一句问法，而是 **上下文 messages 越积越多**
  - 因为 HTTP/SDK 调用是无状态的：
    - 你每次都要把“本次生成所需的全部信息”带上
    - 所以你把历史对话都塞进 `messages`，每一轮都会重复计入 `prompt_tokens`

- 常见节省 token 的做法（优先级从简单到复杂）
  - **限制输出长度**
    - 在输出要求里明确：只给代码/只给结论/分点简答
    - 设置 `max_tokens`（或厂商等价参数）控制最长输出
  
  - **只携带必要上下文**
    - 不要把“整个知识库/整份文档/整段代码”无脑塞给模型
    - 只拼接与本次问题强相关的片段（这也是后面 RAG 的核心思想：先检索，再喂给模型）
  
  - **限制对话记录最大长度（超过就截断）**
  
    - 设一个 `messages` 最大条数/最大字符数/最大 token 数
    - 超过后按先进先出（FIFO）丢弃最早的对话，只保留最近 N 轮
  
  - **截断前先做“总结压缩”**
  
    - 把即将被丢弃的历史对话，先让模型总结成一段更短的“对话摘要”
    - 用“摘要 + 最近 N 轮”替代“完整历史”，降低 `prompt_tokens` 同时尽量保留关键信息
  
  - **向量召回/检索补上下文**
    - 对超长上下文，用“检索命中片段 + 少量历史”替代“全量历史”
    - 这里先记住思路即可（后面学 RAG/向量检索会细讲；不是所有场景都推荐上来就用）
  
  - 案例
  
    ```js
    # 输出描述
    只给代码/只给结论/分点简答
    
    // 上下文：**截断前先做“总结压缩”** 和**限制对话记录最大长度（超过就截断）**
    if (messageList.length > 10) {
        //算出来要截取多少条
        //多截取一些，方便ai接口多给我们总结一下，所以设为6，每次大于10只保留6条。
        const removeNum = messageList.length - 6;
        const removeList = messageList.splice(1, removeNum)
        const summaryRes = await summaryMessage(openai, removeList);
        messageList.splice(1, 0, summaryRes)
    }
    
    先做“总结压缩”**：也是发送给ai
    async function summaryMessage(openai, summaryList) {
        const llmres = await openai.chat.completions.create({
            model: "qwen-plus",
            messages: [
                {
                    role: "system",
                    content: "帮我总结下面的对话记录，做一个摘要"
                },
                ...summaryList
            ]
        })
    
        return llmres.choices[0].message;
    }
    ```
  
    
  
  



# 实现基础ai对话项目搭建

### 1）用户输入，并提问

- 解释
  - 前端输入框用 `v-model` 绑定 `inputvalue`
  - 点击“发送”触发 `sendToLLM`
  - 提交前先把用户消息 push 到 `convertList`，这样可以立刻渲染出用户气泡
- 代码（`ppt和源码/1-7 基础前端界面/code/aiclient/src/App.vue`）

  ```vue
  const inputvalue = ref("")
  const convertList = ref([])
  
  function sendToLLM() {
    const _convertList = [...convertList.value]
    _convertList.push({
      role: "user",
      content: inputvalue.value
    })
    convertList.value = _convertList
    requestLLM(inputvalue.value)
  }
  
  <input type="text" v-model="inputvalue" />
  <button @click="sendToLLM">发送</button>
  ```


### 2）请求到 query 接口（GET + query 参数）

- 解释
  - 前端把用户输入拼成 URL：`/llm?keyword=xxx`
  - `keyword` 对应后端 `req.query.keyword`
- 代码（`ppt和源码/1-7 基础前端界面/code/aiclient/src/api/index.js`）

  ```js
  import axios from "axios";
  export function requestLLM(keyword) {
      return axios.get("http://localhost:3000/llm?keyword=" + keyword)
  }
  ```


### 3）后端 push 本次提问到 messageList

- 解释
  - `messageList` 存储上下文（`system` + 历史 user/assistant）
  - 每次请求进来先组装 `queryObj`，再 push 到 `messageList`
- 代码（`ppt和源码/1-7 基础前端界面/code/server/index.js`）

  ```js
  const messageList = [
      {
          role: "system",
          content: systemString
      }
  ]
  
  app.get("/llm", async (req, res) => {
      const keyword = req.query.keyword;
      const queryObj = {
          role: "user",
          content: keyword
      };
      messageList.push(queryObj);
      
  })
  ```


### 4）给到大模型接口

- 解释
  - 使用 OpenAI 兼容 SDK：`openai.chat.completions.create`
  - 关键就是把 `messageList` 作为 `messages` 发给模型（多轮上下文）
- 代码（`ppt和源码/1-7 基础前端界面/code/server/index.js`）

  ```js
  const llmres = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: messageList
  })
  ```


### 5）存储 ai 的回答到 messageList

- 解释
  - 模型回答在 `llmres.choices[0].message`
  - 把它 push 进 `messageList`，下一轮对话才能“记住”本轮回答
- 代码（`ppt和源码/1-7 基础前端界面/code/server/index.js`）

  ```js
  messageList.push(llmres.choices[0].message);
  ```


### 6）接口返回回答

- 解释
  - 后端把本轮 `assistant` 消息返回给前端
- 代码（`ppt和源码/1-7 基础前端界面/code/server/index.js`）

  ```js
  res.json({
      success: true,
      data: llmres.choices[0].message
  });
  ```


### 7）前端把接口返回值 push 到 convertList

- 解释
  - 后端返回的 `data` 本身就是 `{ role: 'assistant', content: '...' }`
  - 前端把它 push 到 `convertList`，触发页面更新
- 代码（`ppt和源码/1-7 基础前端界面/code/aiclient/src/App.vue`）

  ```js
  requestLLM(inputvalue.value).then((res) => {
    const _convertList = [...convertList.value]
    _convertList.push(res.data.data)
    convertList.value = _convertList
  })
  ```


### 8）convertList 渲染成对话区界面

- 解释
  - `v-for` 遍历 `convertList`
  - 根据 `role` 区分 user/assistant 气泡样式
- 代码（`ppt和源码/1-7 基础前端界面/code/aiclient/src/App.vue`）

  ```vue
  <div v-for="chatItem in convertList" class="chat-item">
    <div v-if="chatItem.role === 'user'" class="user-content">
      <MarkDown :content="chatItem.content"></MarkDown>
    </div>
    <div v-if="chatItem.role === 'assistant'" class="assistant-content">
      <MarkDown :content="chatItem.content"></MarkDown>
    </div>
  </div>
  ```


### 9）文本内容用 markdown 展示组件展示

- 解释
  - 统一用 markdown 渲染：
    - 输出里有代码块/表格/列表时更友好
  - 组件内部：
    - `@crazydos/vue-markdown` 负责渲染
    - `remark-gfm` 支持 GFM（表格、任务列表等）
    - `rehype-highlight` 支持代码高亮
- 代码（`ppt和源码/1-7 基础前端界面/code/aiclient/src/components/MarkDown.vue`）

  ```vue
  <script setup>
  import { VueMarkdown } from "@crazydos/vue-markdown"
  import remarkGfm from "remark-gfm"
  import hidhlightPlugins from "rehype-highlight"
  const { content } = defineProps(["content"])
  </script>
  
  <template>
      <VueMarkdown :remark-plugins="[remarkGfm]" :rehype-plugins="[hidhlightPlugins]" :markdown="content" />
  </template>
  ```


### 10）（额外）对话太长：总结压缩后再继续对话（token 优化）

- 解释
  - 超过一定长度就截断早期对话，并让模型做摘要后插回 `messageList`
- 代码（`ppt和源码/1-7 基础前端界面/code/server/index.js` + `server/utils.js`）

  ```js
  if (messageList.length > 10) {
      const removeNum = messageList.length - 6;
      const removeList = messageList.splice(1, removeNum)
      const summaryRes = await summaryMessage(openai, removeList);
      messageList.splice(1, 0, summaryRes)
  }
  ```

  ```js
  async function summaryMessage(openai, summaryList) {
      const llmres = await openai.chat.completions.create({
          model: "qwen-plus",
          messages: [
              { role: "system", content: "帮我总结下面的对话记录，做一个摘要" },
              ...summaryList
          ]
      })
      return llmres.choices[0].message;
  }
  ```



### 项目完善





## 会话管理

### 1）要解决的问题（两张图互补）

- 解释
  - 对话记录一刷新就丢
    - 之前 `convertList/messageList` 都只在内存里，刷新页面就没了
  - 前后端各维护一份，可能数据不一致
    - 最终应该以 **后端持久化的会话记录** 为准，前端只负责展示
  - 真正的 AI 应用需要：
    - 多用户（用 `userId` 区分）
    - 历史会话列表（可点击进入）
    - 新建会话、切换会话、继续对话


### 2）会话持久化：把会话写到文件/数据库（这里用 json 文件模拟数据库）

- 解释
  - 这个项目用 `conversation.json` 作为“数据库”
  - 后端提供读写函数：`readConversation()` / `writeConversation()`
- 代码（`ppt和源码/1-8 会话管理/code/server/utils.js`）

  ```js
  function readConversation() {
      const jsonStr = fs.readFileSync("./conversation.json") // 使用同步读取，而不是异步，拿到的是buff，所以要parsse
      const jsonObj = JSON.parse(jsonBuf.toString("utf-8")) // 也可以直接写为JSON.parse("utf-8"))，因为Buffer 在某些场景下会被隐式转成字符串（等价于走了类似 toString() 的流程）
      return jsonObj;
  }
  function writeConversation(obj) {
      const jsonstr = JSON.stringify(obj);
      fs.writeFileSync("./conversation.json", jsonstr)
  }
  ```


### 3）接口：conversation/create（创建新会话）

- 解释
  - 用户id入参：`userId`
  - 生成会话 id：`convertId = userId + Date.now()`
  - 初始化会话结构：`{ title: "", list: [] }`
- 代码（`ppt和源码/1-8 会话管理/code/server/index.js`）

  ```js
  app.get("/conversation/create", async (req, res) => {
      const userId = req.query.userId;
      const conversationObj = readConversation();
      if (!conversationObj[userId]) {
          conversationObj[userId] = {}
      }
      const userConversatioObj = conversationObj[userId];
      const convertId = userId + Date.now();
      userConversatioObj[convertId] = {
          title: "",
          list: []
      }
      writeConversation(conversationObj);
      res.json({
          success: true,
          data: convertId,
          message: "创建成功"
      })
  })
  ```


### 4）接口conversation/get（根据会话 id 获取历史记录）

- 解释
  - 入参：`userId（用户id）` + `convertId（会话id）`
  - 返回：该会话对象（包含 `title` 和 `list`）
- 代码（`ppt和源码/1-8 会话管理/code/server/index.js`）

  ```js
  app.get("/conversation/get", async (req, res) => {
      const userId = req.query.userId;
      const convertId = req.query.convertId;
      const conversationObj = readConversation();
      const userAllConversation = conversationObj[userId];
      const targetCOnversation = userAllConversation[convertId];
      res.json({
          success: true,
          data: targetCOnversation,
          message: "查询成功"
      })
  })
  ```


### 5）llm 接口改造：通过 userId + convertId 找到对应会话上下文，再把问答写回“数据库”

- 解释
  - 老版本：后端用一个全局数组存上下文，刷新/重启就丢，且无法区分用户/会话
  - 新版本：
    - 前端请求必须携带 `userId` + `convertId`
    - 后端从 `conversation.json` 中取出该会话 `list` 作为上下文
    - 本轮问答追加回 `list` 后，再 `writeConversation()` 持久化

- 代码（`ppt和源码/1-8 会话管理/code/server/index.js`）

  ```js
  app.get("/llm", async (req, res) => {
      const { keyword, userId, convertId } = req.query;
      const conversationObj = readConversation();
      const singleConvertList = conversationObj[userId][convertId].list; // 注意这里不是拷贝，下面有解释
  
      const queryObj = {
          role: "user",
          content: keyword
      };
  
      if (singleConvertList.length > 10) {
          const removeNum = singleConvertList.length - 6;
          const removeList = singleConvertList.splice(1, removeNum)
          const summaryRes = await summaryMessage(openai, removeList);
          singleConvertList.splice(1, 0, summaryRes)
      }
  
      singleConvertList.push(queryObj);
  
      const llmres = await openai.chat.completions.create({
          model: "qwen-plus",
          messages: [
              { role: "system", content: systemString },
              ...singleConvertList
          ]
      })
  
      singleConvertList.push(llmres.choices[0].message);
      writeConversation(conversationObj)
  
      res.json({
          success: true,
          data: llmres.choices[0].message
      });
  })
  ```
  
  补充：为什么 `singleConvertList.push(...)` 会影响 `conversationObj`
  
  - 解释
    - `const singleConvertList = conversationObj[userId][convertId].list` 这里 **不是拷贝**
    - `singleConvertList` 拿到的是同一个数组引用（指向同一块内存）
    - 所以你对 `singleConvertList` 做 `push/splice`，等价于直接改 `conversationObj[userId][convertId].list`
  - 什么时候会变成“独立拷贝”
    - 只要你创建了新数组（常见：`[...arr]` / `slice()` / `Array.from()`），它就和原数组互不影响（浅拷贝）
    - 前端（Vue/React）里经常这么做，是为了让引用变化、触发视图更新


### 6）前端请求 llm 时：带上 userId + convertId（会话 id）

- 解释
  - `userId`：示例里写死 `'001'`（真实项目来自登录态）
  - `convertId`：当前会话 id（从路由 query 里拿）
- 代码（`ppt和源码/1-8 会话管理/code/aiclient/src/api/index.js` + `src/views/Home.vue`）

  ```js
  export function requestLLM(keyword, userId, convertId) {
      return axios.get(`http://localhost:3000/llm?keyword=${keyword}&userId=${userId}&convertId=${convertId}`)
  }
  ```

  ```js
  requestLLM(inputvalue.value, '001', route.query.convertId).then((res) => {
      const _convertList = [...convertList.value];
      _convertList.push(res.data.data)
      convertList.value = _convertList;
  })
  ```


### 7）新建会话 & 进入会话：用路由参数保存当前会话 id

- 解释
  - 页面加载：
    - 有 `convertId`：调用 `conversation/get` 拉取历史
    - 没有 `convertId`：先 `conversation/create`，再跳转 `/?convertId=xxx`
  - 点击“新建”：同样 create 后跳转
- 代码（`ppt和源码/1-8 会话管理/code/aiclient/src/views/Home.vue`）

  ```js
  function getDetailById(convertId) {
      getConversation('001', convertId).then((res) => {
          convertList.value = res.data.data.list;
      })
  }
  
  function createNew() {
      createConversation('001').then((res) => {
          router.push("/?convertId=" + res.data.data)
      })
  }
  
  onMounted(() => {
      const { convertId } = route.query
      if (convertId) {
          getDetailById(convertId)
      } else {
          createConversation('001').then((res) => { // 调用接口接口：conversation/create（创建新会话），这里是前端来调用后端接口
              router.push("/?convertId=" + res.data.data)
          })
      }
  })
  
  <button @click="createNew">创建新对话</button>
  ```


### 8）历史会话列表：conversation/list + 左侧栏点击切换

- 解释
  - 后端返回该用户的所有会话：`[{ convertId, title }]`
  - 前端左侧栏渲染列表，点击后切换路由 `/?convertId=xxx`
  - 切换路由后（`watch(route)`），重新调用 `conversation/get` 拉取对应历史消息

- 补充：`Object.keys(userAllConversation)` 这段在干什么？
  - 解释
    - `userAllConversation` 是“字典结构”（对象）：
      - key 是会话 id：`convertId`
      - value 是会话对象：`{ title, list }`
  - 类似属性还有 
    - Object.values(userAllConversation)
    - ``Object.entries(userAllConversation)`（同时拿 key + value）
  
- 代码（`ppt和源码/1-8 会话管理/code/server/index.js` + `aiclient/src/App.vue` + `views/Home.vue`）

  ```js
  app.get("/conversation/list", async (req, res) => {
      const userId = req.query.userId;//不是会话id
      const conversationObj = readConversation();
      const userAllConversation = conversationObj[userId];
      const convertIdList = Object.keys(userAllConversation);
      const returnList = []
  
      for (let i = 0; i < convertIdList.length; i++) {
          const _id = convertIdList[i];
          const idsConvert = userAllConversation[_id];
          if (idsConvert.title) {
              returnList.push({
                  title: idsConvert.title,
                  convertId: _id
              })
          } else {
              if (idsConvert.list.length === 0) {
                  returnList.push({ title: "", convertId: _id })
              } else {
                  const aititle = await summaryTitle(openai, idsConvert.list);
                  idsConvert.title = aititle
                  writeConversation(conversationObj);
                  returnList.push({ convertId: _id, title: aititle })
              }
          }
      }
  
      res.json({
          success: true,
          data: returnList,
          message: "查询成功"
      })
  })
  ```

  ```vue
  // aiclient/src/App.vue
  onMounted(() => {
    listConversation('001').then((res) => {
      historyList.value = res.data.data
    })
  })
  
  function gotoHistory(convertId) {
    router.push("/?convertId=" + convertId) // 路由都是这样写的，你直接之前看错了
  }
  ```

  ```js
  // views/Home.vue
  
  function getDetailById(convertId) {
      getConversation('001', convertId).then((res) => {
          convertList.value = res.data.data.list;
      })
  }
  
  watch(route, () => {
      getDetailById(route.query.convertId)
  })
  ```

  - 解释：`watch(route, ...)` 的作用
    - 监听路由对象 `route` 的变化（本质是监听地址栏变化，尤其是 `?convertId=xxx`）
    - 当你点击左侧历史会话（`gotoHistory` 会 `router.push("/?convertId=" + convertId)`）或新建会话跳转后：
      - `route.query.convertId` 会变
      - `watch` 会触发回调
      - 自动调用 `getDetailById(convertId)` 去请求 `conversation/get`
      - 把返回的历史消息 `list` 赋值给 `convertList`，从而刷新对话区
    - 目的：**路由变 -> 当前会话变 -> 自动拉取并渲染对应会话记录**（保证切换会话时 UI/数据同步）


### 9）会话标题：conversation/list 中“无标题则让 AI 总结标题”

- 解释
  - 如果某个会话 `title` 为空：
    - 但会话已有内容（`list.length > 0`），就调用 `summaryTitle()` 生成一个小于 16 字的标题
    - 生成后写回 `conversation.json`
- 代码（`ppt和源码/1-8 会话管理/code/server/utils.js`）

  ```js
  async function summaryTitle(openai, list) {
      const llmres = await openai.chat.completions.create({
          model: "qwen-plus",
          messages: [
              {
                  role: "system",
                  content: "帮我总结下面的对话记录，生成一个小于16个字的标题"
              },
              ...list
          ]
      })
  
      return llmres.choices[0].message.content;
  }
  ```


### 10）（可选）conversation/delete

- 解释
  - 图里提到可以不做
  - 当前 `1-8 会话管理` 项目代码里 **没有实现** `/conversation/delete` 接口
  - 如果你要补（真实项目常见需求）
    - 删除粒度通常是：删除某个用户下的某个会话（`userId + convertId`）
    - 典型接口形态：`/conversation/delete?userId=xxx&convertId=yyy`
    - 删除后要 `writeConversation(conversationObj)` 落盘
    - 注意点
      - 只能删除当前登录用户自己的会话（后端鉴权 + 校验归属）
      - 需要考虑“当前正在看的会话被删除了”时前端如何处理（例如自动跳到新建会话）
      - 生产环境一般不直接物理删除，会做“软删除”（标记 deleted）以便审计与恢复

- 代码（示例：最小 delete 接口）

  ```js
  // server/index.js
  const { readConversation, writeConversation } = require("./utils")
  
  app.get("/conversation/delete", (req, res) => {
    const { userId, convertId } = req.query
    const conversationObj = readConversation()
  
    if (!conversationObj[userId] || !conversationObj[userId][convertId]) {
      return res.json({ success: false, message: "会话不存在" })
    }
  
    delete conversationObj[userId][convertId]
    writeConversation(conversationObj)
  
    return res.json({ success: true, message: "删除成功" })
  })
  ```



### 为什么推荐使用SDK(通过后端实现，而不是http)

- 解释
  - 因为后端可以用 token 进行用户验证（鉴权/鉴别用户身份）
  - 以及：把“调用大模型”放在后端，通常比前端直连 HTTP 更安全、更可控
  
- 代码（示例：前端携带 token 调后端；后端鉴权后再用 SDK 调模型）

  ```js
  // aiclient 侧（axios）：token 只发给“你自己的后端”，不会暴露大模型的 apiKey
  import axios from "axios"
  
  export function requestLLMWithAuth(keyword, convertId, userToken) {
    return axios.get(
      `http://localhost:3000/llm?keyword=${encodeURIComponent(keyword)}&convertId=${convertId}`,
      {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    )
  }
  ```

  ```js
  // server 侧：校验用户 token -> 得到 userId -> 查会话 -> 调用 openai SDK
  function getUserIdFromAuthHeader(authHeader) {
    // 这里只演示形态：真实项目请用 JWT/Session 等标准方式校验
    // 例如：jwt.verify(token, secret).userId
    if (!authHeader?.startsWith("Bearer ")) return null
    const token = authHeader.slice("Bearer ".length)
    return token ? "001" : null
  }
  
  app.get("/llm", async (req, res) => {
    const userId = getUserIdFromAuthHeader(req.headers.authorization)
    if (!userId) {
      return res.status(401).json({ success: false, message: "未登录/鉴权失败" })
    }
  	。。。。。
  })
  ```



# 知识补充

### axios

- axios会对响应数据多加一层封装
  - 所以拿到数据要res.data.data
- 要是fetch,就直接red.data就可以拿到响应数据

