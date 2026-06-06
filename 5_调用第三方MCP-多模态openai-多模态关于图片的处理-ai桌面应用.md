# 调用第三方MCP


## 0. 总体思路（先在“市场”找到 MCP，再选一种连接方式）

图片里的流程可以理解为：

- **[第 1 步]** 去 MCP 市场/文档页找到你要的 MCP Server（它提供哪些工具、怎么鉴权、提供什么连接地址）
- **[第 2 步]** 根据它提供的接入方式选择 Transport：
  - **[远程 SSE]** 用 `SSEClientTransport` 连接（典型：供应商托管的 SSE 端点）
    - 这个市场比较多，但逐渐在淘汰，进化使用streamable
  - **[远程 HTTP(streamable)]** 用 `StreamableHTTPClientTransport` 连接（典型：一个普通的 HTTP endpoint）
  - **[本地进程]** 用 `StdioClientTransport` 连接（典型：运行一个本地命令启动 MCP Server，通过 stdin/stdout 通信）

### mcp“市场”的来源与展望

图片里强调了两点：

#### mcp 市场主要有哪些来源

1. **[大厂/平台官方 MCP 市场]**
   - 例如：阿里云的 MCP 市场、火山引擎的 MCP 市场等（平台会给出接入 URL、鉴权方式、工具说明）
2. **[开放社区型 MCP 市场]**
   - 脱离单一厂商的自由社区/聚合站（往往收录更多第三方 MCP）
3. **[厂商自研 MCP（以包/工具形式发布）]**
   - 例如一些 Chrome DevTools MCP 这类，可能直接以 `npm` 包/可执行程序形式发布（更偏向 `stdio` 模式）

#### 展望（为什么会出现“调用市场 mcp”）

- **[未来形态]** 一个“超级大的 AI Agent”会通过扩展各种 MCP/skills 来获得能力（就像当年 App 生态）
- **[开发者视角]** 开发 MCP 的意义会越来越像开发 Web/App：
  - 你可以开发自己的 MCP，发布到市场
  - 可能出现开源/付费/订阅等商业模式

---

## 1) 方式一：SSEClientTransport（远程 SSE 连接）

### 步骤

1. **[找到 SSE 端点]** 在 MCP 服务介绍页拿到 SSE URL（一般长得像 `https://.../sse`）
2. **[确认鉴权]** 看文档说明是否需要 `Authorization: Bearer <API_KEY>` 等 Header
3. **[创建 MCP Client]** 使用 `@modelcontextprotocol/sdk` 的 `Client`
4. **[用 SSEClientTransport 连接]** `new SSEClientTransport(new URL(mcpurl), { requestInit: { headers } })`
5. **[listTools / callTool]** 先 `listTools()` 看这个 MCP 提供的工具名，再用 `callTool()` 调用

### 解释

- `SSEClientTransport` 的输入通常是一个 **SSE 事件流端点**。
- `requestInit` 会透传到底层 fetch/eventsource，所以你把鉴权 header 放在这里。

### 对应项目核心代码（demo/test.js）

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
const API_KEY = 'sk-efbe14c385924da8a9fa7df804d73e0e'
const mcpurl = 'https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/sse'
const client = new Client({
    name: "sdw",
    version: "1.0.0"
});
const transport = new SSEClientTransport(new URL(mcpurl), {
    requestInit: {
        headers: {
            'Authorization': `Bearer ${API_KEY}`
        }
    }
})

await client.connect(transport);
const res = await client.listTools();// 先看list是什么，才能知道下面的callTool调用什么（name）
const res = await client.callTool({
    name: "bailian_web_search",
    arguments: {
        query: "北京天气如何"
    }
})
console.log(res);
```

---

## 2) 方式二：StreamableHTTPClientTransport（远程 HTTP / streamable 连接）

### 步骤

1. **[找到 HTTP 端点]** 在市场/文档页拿到 HTTP URL（常见结尾是 `/mcp` 或者一个固定路径）
2. **[创建 MCP Client]** `new Client({ name, version })`
3. **[创建 StreamableHTTP transport]** `new StreamableHTTPClientTransport(mcpurl)`
4. **[connect + listTools]** 成功后先 `listTools()` 确认工具列表

### 解释

- `StreamableHTTPClientTransport` 适合对接“普通 HTTP 服务器式”的 MCP。
- 你项目里也演示了 **在服务端统一接入时**，给它传 `requestInit.headers`（用于鉴权）。

### 对应项目核心代码（demo/test2.js）

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
const API_KEY = 'sk-efbe14c385924da8a9fa7df804d73e0e'
const mcpurl = 'https://mcpmarket.cn/mcp/67f270fe36e5587add805ea5'
const client = new Client({
    name: "sdw",
    version: "1.0.0"
});
const transport = new StreamableHTTPClientTransport(mcpurl)

await client.connect(transport);
const res = await client.listTools();

console.log(res);
```

---

## 3) 方式三：StdioClientTransport（本地/命令行进程连接）

### 步骤

1. **[确认这是“本地运行型” MCP]** 文档里会写“运行命令启动 server”，例如 `npx xxx`、`python -m xxx`
2. **[准备 command + args]** 把启动命令拆成 `command` 和 `args`
3. **[创建 MCP Client]** `new Client({ name, version })`
4. **[创建 Stdio transport 并 connect]** `new StdioClientTransport({ command, args })`
5. **[listTools / callTool]** 同样先 `listTools()` 看工具列表

### 解释

- `StdioClientTransport` 的本质：你的 Node 进程 **spawn** 一个子进程（MCP server），然后通过 stdin/stdout 按 MCP 协议收发消息。
- 所以 `command/args` 不是“SDK 自己定义的参数”，而是 **那个 MCP server CLI 自己的启动参数**。

### 对应项目核心代码（demo/test3.js）

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
const API_KEY = 'sk-efbe14c385924da8a9fa7df804d73e0e'
const mcpurl = 'https://mcpmarket.cn/mcp/67f270fe36e5587add805ea5'
const client = new Client({
    name: "sdw",
    version: "1.0.0"
});
const transport = new StdioClientTransport({
    command: "npx",
    args: [
        "chrome-devtools-mcp@latest",

        "--channel=canary",

        "--headless=true",

        "--isolated=true"

    ]
})

await client.connect(transport);
const res = await client.listTools();

console.log(res);
```

---

## 4) 服务端：把第三方 MCP 接入你的应用（mcpList -> 批量连接 -> 变成 OpenAI tools）

你项目的核心设计是：

1. **[写配置]** 在 `mcpList` 里声明多个 MCP Server（type/url/header/commandArg）
2. **[启动时连接]** 遍历 `mcpList`，对每个 server 选择对应 transport 并 `client.connect()`
3. **[获取工具列表]** `client.listTools()` 得到 MCP tools
4. **[转成 OpenAI tools]** 把 MCP tool 的 `inputSchema` 映射为 OpenAI function tool 的 `parameters`
5. **[建立映射]** `toolName -> serverName`，后续大模型说要调哪个 tool 时，能定位到哪个 client

### 4.1 MCP Server 列表配置（server/config.js）

```js
const API_KEY = 'sk-efbe14c385924da8a9fa7df804d73e0e'
export const mcpList = [
    {
        name: "mymcp",
        type: "streamablehttp",
        url: " http://localhost:3001/mcp"
    },
    {
        url: "http://localhost:3002/mcp",
        type: "streamablehttp",
        name: "mymcp2"
    },
    {
        name: "web_search",
        type: "sse",
        url: "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/sse",
        header: {
            'Authorization': `Bearer ${API_KEY}`
        }
    },
    {
        name: "chrome-devtools",
        type: "stdio",
        commandArg: {
            command: "npx",
            args: ["chrome-devtools-mcp@latest"]

        }
    }
]
```

### 4.2 批量连接并生成 tool 映射（server/utils/utils.js）

关键点看 `linkMcpAndListTool()`：

- **[根据 type 选 transport]** `streamablehttp` / `sse` / `stdio`
- **[connect]** `await client.connect(transport)`
- **[listTools]** `await client.listTools()`
- **[transformToOpenAi]** 把 MCP tool 转 OpenAI tool
- **[toolMap]** 记录 toolName 属于哪个 server

```js
export async function linkMcpAndListTool() {
    let clientMap = {}
    let toolMap = {}
    let toolList = []
    for (let i = 0; i < mcpList.length; i++) {
        const mcpServer = mcpList[i];
        const { type, header = {}, commandArg = {} } = mcpServer
        const client = new Client({
            name: "mcp" + i,
            version: "1.0.0"
        });
        let transport = null;
        if (type === 'streamablehttp') {
            transport = new StreamableHTTPClientTransport(mcpServer.url, {
                requestInit: {
                    headers: header
                }
            });
        } else if (type === 'sse') {
            transport = new SSEClientTransport(new URL(mcpServer.url), {
                requestInit: {
                    headers: header
                }
            })
        } else if (type === 'stdio') {
            transport = new StdioClientTransport(commandArg)
        }

        await client.connect(transport)
        //1，用服务名字储存client
        clientMap[mcpServer.name] = {
            client, transport
        }
        const openaiTypeList = transformToOpenAi(await client.listTools())
        openaiTypeList.forEach((tool) => {
            //记录每一个工具它对应的服务名字，到时候大模型说要调用哪个工具，用工具明就能找到对应的服务client
            toolMap[tool.function.name] = mcpServer.name
            //加入到toolList方便return
            toolList.push(tool);
        })

    }
    return {
        clientMap,
        toolMap,
        toolList
    }
}
```



## 我手里只有 url / apikey / command+args，怎么知道“放到调用方法的括号里哪个位置、要不要包对象”？

### 方法：先去官网中的url（studio一般不用），apikey（先看官网要不要），command+args(要是streamHttp和sse不用)，发给ai，让ai帮你完成

### 或者通过下面的方式

核心原则：**看 transport 类的构造函数签名（constructor signature）**。

- **[如果构造函数长这样]** `constructor(url, options?)`
  - 第 1 个参数就是 `url`（可能要求 `string` 或 `URL` 对象）
  - 第 2 个参数（可选）才是“配置对象” `options`（例如 `{ requestInit: { headers } }`）
  - 典型：`SSEClientTransport`、`StreamableHTTPClientTransport`
- **[如果构造函数长这样]** `constructor(options)`
  - 只收 1 个对象，把 `command/args` 等都放到这个对象里
  - 典型：`StdioClientTransport`

你项目里 `linkMcpAndListTool()` 正好把三种情况都写得很清楚（可作为“抄作业模板”）：

```js
if (type === 'streamablehttp') {
  transport = new StreamableHTTPClientTransport(mcpServer.url, {
    requestInit: {
      headers: header
    }
  });
} else if (type === 'sse') {
  transport = new SSEClientTransport(new URL(mcpServer.url), {
    requestInit: {
      headers: header
    }
  })
} else if (type === 'stdio') {
  transport = new StdioClientTransport(commandArg)
}
```

对应到“你手里已有的参数”，可以直接套：

- **[SSE]**
  - `url` 放第 1 个参数（并转成 `new URL(url)`）
  - `apikey` 通常放到第 2 个参数的 `requestInit.headers.Authorization`
- **[StreamableHTTP]**
  - `url` 放第 1 个参数
  - 需要鉴权时才传第 2 个参数 `requestInit.headers`
- **[Stdio]**
  - `command/args` 都放到第 1 个参数（对象）里：`new StdioClientTransport({ command, args })`

如何确认签名（不靠猜）：

1. **[Ctrl+点击类名]** `SSEClientTransport / StreamableHTTPClientTransport / StdioClientTransport` 跳转到 SDK 定义
2. **[看类型提示]** hover 通常会显示 `constructor(...)` 的参数列表
3. **[看 .d.ts]** 在 `node_modules/@modelcontextprotocol/sdk/...` 里找到对应定义文件查看

##  一个“通用排错/确认”套路（推荐你每次接新 MCP 都这样做）

1. **[先确认连接方式]** 这个 MCP 是 SSE / HTTP / 本地命令？
2. **[先连通再说]** 只写到 `await client.connect(transport)` + `await client.listTools()`
3. **[根据 listTools 结果写 callTool]**
   - 工具名以 `listTools()` 返回为准
   - 入参以 `inputSchema` 为准
4. **[要接到大模型 tools]**
   - 像你项目一样 `transformToOpenAi(await client.listTools())`



## 4.3 主服务启动时是怎么把 MCP “挂进来”的（调用链路）

这一段对应你问的“主服务启动流程里怎么调用、返回值怎么塞进大模型 tools”。你项目的链路是：

1. **[服务启动阶段]** `server/index.js` 启动时执行一次 `linkMcpAndListTool()`
2. **[拿到 mcpResult]** 返回 `{ clientMap, toolMap, toolList }`，存到进程内存里（变量 `mcpResult`）
3. **[处理 /llm 请求]** 每次用户请求都会把 `mcpResult` 传进 `requestAI()`
4. **[注入到大模型 tools]** `requestAI()` 内在调用 `openai.chat.completions.create()` 时把 `mcpResult.toolList` 合并进 `tools: [...]`
5. **[tool_calls 路由调用]** 当大模型返回 `tool_calls`：
   - 先用 `mcpResult.toolMap[toolName]` 找到该 tool 属于哪个 MCP Server
   - 再从 `mcpResult.clientMap[serverName].client` 取到对应 `client`
   - 最终调用 `client.callTool({ name, arguments })`

### 4.4（补充）4.1+4.2 和 4.3 是什么关系？能不能“只用 4.1+4.2”？

可以。

- **[4.1 + 4.2 的角色]** 它们本质是一个“**MCP 聚合/连接器**”：
  - 读取 `mcpList` 配置
  - 批量 `connect`
  - `listTools` 并汇总
  - 建立 `toolName -> serverName` 的映射（`toolMap`）
  - 返回一个可复用对象 `mcpResult = { clientMap, toolMap, toolList }`

所以 **4.1+4.2 完全可以独立存在并被使用**，不依赖 4.3。

你甚至可以在任何脚本里只做：

- **[只想看看某个 MCP 提供哪些工具]**
  - `await linkMcpAndListTool()`
  - 直接打印 `mcpResult.toolList` 或 `await client.listTools()`
- **[不通过大模型，直接调用工具]**
  - 用 `mcpResult.toolMap[toolName]` 找到 `serverName`
  - 再用 `mcpResult.clientMap[serverName].client.callTool(...)` 直接调用

- **[4.3 的角色]** 4.3 只是“**消费 mcpResult 的一种方式**”：
  - 把 `mcpResult.toolList` 注入到 `openai.chat.completions.create({ tools })`
  - 当模型产生 `tool_calls` 时，根据 `toolMap/clientMap` 路由到正确的 MCP client 执行

一句话：

- **[4.1+4.2]** 负责“连上 MCP 并把工具准备好（可复用）”
- **[4.3]** 负责“把这批工具接入你的主服务，让大模型能自动调用”

#### 4.3.1 服务启动时建立 MCP 连接（server/index.js）

```js
import { readConversation, writeConversation, summaryTitle, requestAI, linkMcpAndListTool } from "./utils/utils.js"

// ... express 初始化省略

const mcpResult = await linkMcpAndListTool()

app.post("/llm", async (req, res) => {
  // ... SSE 响应头省略
  const { keyword, userId, convertId } = req.body;
  const queryObj = { role: "user", content: keyword };
  await requestAI({
    openai,
    userId,
    convertId,
    res,
    queryObj,
    mcpResult
  })
});
```

#### 4.3.2 把 MCP tools 塞给大模型（server/utils/utils.js -> requestAI）

这里的关键是 `tools` 合并：

```js
const llmres = await openai.chat.completions.create({
  // ... model/messages 省略
  tools: [
    ...mcpResult.toolList || [],
    ...toolList,
  ],
  stream: true
})
```

#### 4.3.3 大模型触发 tool_calls 后，怎么调用到对应 MCP（server/utils/utils.js -> requestAI）

当 `mcpResult.toolMap[name]` 命中时，就认为这是“第三方 MCP 工具”，并路由到对应 server 的 client：

```js
if (mcpResult.toolMap[name]) {
  //第三方的mcp工具调用
  const serverName = mcpResult.toolMap[name];
  const client = mcpResult.clientMap[serverName].client;
  result = await client.callTool({
    name,
    arguments: toolarguments
  });
}
```







# 多模态


## 0. 目前模型的“模态”情况（概念梳理）

### 文本模型

- **[输入]** 文本（很多“文本模型”也能理解图片输入，但不一定能直接输出图片/音频/视频）
- **[输出]** 文本

### 单一媒体输出模型（图片/视频/音频模型）

- **[输入]** 通常是“文本 + 对应媒体”（例如文生图=文本输入；图生图=文本+图片；语音模型可能是音频输入）
- **[输出]** 对应媒体（图片模型输出图片，视频模型输出视频，音频模型输出音频）

### 多模态模型（Multimodal）

- **[特点]** 输入端可同时支持多种类型（文本/图片/音频/视频等中的部分组合）
- **[输出]** 可能仍是文本，也可能是媒体；不同厂商实现差异很大

---

## 1. OpenAI 规范（以及“兼容 OpenAI”是什么意思）

图片里讲的核心是：我们很多时候用的是 `openai` 这个 SDK，但并不一定真的在调 OpenAI 官方服务。

### 1.1 OpenAI 风格的 URL/能力划分（常见规律）

很多“兼容 OpenAI”的厂商会按类似的路径划分能力：

- **[文本对话]** `POST {baseURL}/chat/completions`
- **[图片生成]** `POST {baseURL}/images/generations`
- **[向量/Embedding]** `POST {baseURL}/embeddings`

下面补三段“OpenAI 风格”的典型 SDK 调用示例（注意：不同厂商的 `model` 名称不同）：

#### 1.1.1 文本对话（chat.completions）示例

```js
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://example.com/v1",
  apiKey: process.env.API_KEY,
});

const res = await openai.chat.completions.create({
  model: "your-chat-model",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "用一句话解释什么是多模态" }
  ],
});

console.log(res.choices[0].message.content);
```

#### 1.1.2 图片生成（images/generations）示例

有的 SDK 版本提供 `openai.images.generate(...)`，有的厂商只保证 HTTP 路径兼容。为了不依赖 SDK 版本差异，可以用 `openai.request` 直接走路径：

```js
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://example.com/v1",
  apiKey: process.env.API_KEY,
});

const imgRes = await openai.request({
  method: "post",
  path: "/images/generations",
  body: {
    model: "your-image-model",
    prompt: "一只猫在宇宙里喝咖啡",
    size: "1024x1024"
  }
});

console.log(imgRes);
```

#### 1.1.3 向量（embeddings）示例

```js
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://example.com/v1",
  apiKey: process.env.API_KEY,
});

const emb = await openai.embeddings.create({
  model: "your-embedding-model",
  input: "北京天气怎么样",
});

console.log(emb.data[0].embedding.length);
```

你可以把它理解为：

- **[兼容 OpenAI]** 主要指这些“路径 + 请求体字段”的惯例
- **[SDK 的 baseURL]** 决定了 `{baseURL}` 的部分；SDK 方法/`path` 决定了后面的 `/chat/completions`、`/embeddings` 等

### 1.2 但你不能假设“所有厂商都完全按 OpenAI 规范”

图片里特别强调：

- **[文本/向量]** 大多厂商比较容易做到兼容
- **[多媒体/多模态]** 往往不完全兼容（甚至路径、请求体完全不同）

所以接入一个新模型前：

- **[先看官方示例]** 它到底是不是“OpenAI 风格的 endpoint”？
- **[如果不是]** 可以：
  - 直接用 `fetch` 自己拼请求
  - 或像本项目一样用 `openai.request(...)` 走“自定义 path”

---

## 2. 用 `openai.request` 调用通义千问多模态（按 步骤 + 解释 + 代码）

这一节完全对应你项目：`ppt和源码/3-1 多模态/code/index.js`。

### 步骤

1. **[准备 SDK]** `import OpenAI from "openai"`
2. **[配置 baseURL + apiKey]** 注意这里的 `baseURL` 是服务商的基础地址，不一定是 `.../compatible-mode/v1`
3. **[使用 openai.request 自定义 path]** 多模态接口可能不是 `/chat/completions`，所以用 `openai.request({ method, path, body })`
4. **[按服务商要求组织 body]** 本例里是 `model + input.messages`
5. **[可选：打印请求/响应]** 通过 monkey patch `globalThis.fetch` 把实际发出的 URL/headers/body 打出来，便于对照文档排错

### 解释

- **[为什么不用 chat.completions]** 因为这里调用的是通义的多模态生成接口，路径是：
  - `path: "/services/aigc/multimodal-generation/generation"`
- **[baseURL + path 如何拼接]** 实际请求 URL = `baseURL` + `path`
- **[messages 结构]** 通义这里的 `messages[].content` 是数组，数组元素里放 `{ text: "..." }`（后续如果是图文多模态，通常会出现 `{ image: ... }` 或 `{ image_url: ... }` 这种结构，具体以厂商文档为准）
- **[fetch 打印的意义]** 你能直接看到 SDK 最终到底向哪个 URL 发了什么 body，快速定位“是不是路径/字段写错了”

### 对应项目核心代码（3-1 多模态/code/index.js）

```js
import OpenAI from "openai";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => { // 为了查看OpenAi本质是什么，比如真正传给大模型是什么url那些
    const [url, opts] = args;
    if (opts.method === 'POST') {
        console.log('>>> REQUEST URL :', url);
        console.log('>>> REQUEST URL :', opts.method);
        console.log('>>> REQUEST HEADERS:', opts.headers);
        console.log('>>> REQUEST BODY  :', opts.body);
    }
    const res = await originalFetch(...args);
    const clone = res.clone();
    if (opts.method === 'POST') {
        console.log('<<< RESPONSE STATUS :', clone.status, clone.statusText);
        console.log('<<< RESPONSE BODY   :', await clone.text());
    }
    return res;
};

const openai = new OpenAI({
    baseURL: "https://dashscope.aliyuncs.com/api/v1",
    apiKey: "sk-efbe14c385924da8a9fa7df804d73e0e"
})
await openai.request({
    method: "post",
    path: "/services/aigc/multimodal-generation/generation",
    body: {
        "model": "qwen-image-2.0",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "text": "给画我一刀盾狗在吃披萨"
                        }
                    ]
                }
            ]
        }
    }
})
```

---

## 3. OpenAI SDK 调用 vs 前面 MCP 的 SSE/StreamableHTTP/Stdio：有什么区别？

你前面问过 “openai 和刚刚 sse 那些有什么区别”，本质区别在“它们解决的问题不同”：

### 3.1 OpenAI（或兼容 OpenAI）调用

- **[对象]** 你在调用“模型服务 API”（文本/多模态/图片/embedding 等）
- **[输入输出]** 输入是 prompt/messages/media 等；输出是模型结果（文本、图片链接/二进制等）
- **[协议/传输]** 一般是 HTTP 请求（可选流式），SDK 帮你封装鉴权/重试/序列化
- **[关键点]** 是否遵循 OpenAI 规范要看厂商；多模态经常需要 `openai.request` 这种自定义路径

### 3.2 MCP（SSE / StreamableHTTP / Stdio transport）调用

- **[对象]** 你在连接“工具服务器（MCP Server）”，它对外提供一组 `tools`
- **[输入输出]** 你先 `listTools()` 拿工具清单与入参 schema；再 `callTool({ name, arguments })` 调用工具
- **[协议/传输]**
  - `SSEClientTransport`：远程 SSE 端点
  - `StreamableHTTPClientTransport`：远程 HTTP 端点
  - `StdioClientTransport`：本地进程 stdin/stdout
- **[关键点]** MCP 解决的是“让大模型能调用外部能力（工具）”，而不是“直接请求模型输出”

一句话总结：

- **[OpenAI SDK]** 面向“模型能力”
- **[MCP SDK]** 面向“工具能力（给模型扩展技能）”





# 多模态之图片的处理（包括图生图，图生文，文生图）

图片里的核心流程（结合“对话界面-图片识别”那张图）是：

1. **[前端]** 用户点击上传图片按钮
2. **[前端 -> 后端]** 上传图片到 `/upload`
3. **[后端]** 接口把图片转成 base64（或上传到 OSS 返回 URL）
4. **[前端]** 收到 base64/URL，和文字一起发到 `/picllm`
5. **[后端]** 调用多模态接口，把图文一起发给模型
6. **[后端 -> 前端]** 把模型返回的图片 URL 转成 Markdown 图片格式 `![图片](url)`
7. **[前端]** Markdown 组件渲染图片（或额外用 `<img>` 直接展示）

---

## 1) 上传图片：前端选择文件 -> 后端转 base64（步骤 + 解释 + 代码）

### 步骤

1. **[前端]** `<input type="file">` 选文件
2. **[前端]** 用 `FormData` 上传到后端 `/upload`
3. **[后端]** 用 `multer` 接收文件（内存存储），将 `buffer` 转成 base64 dataURL 并返回

### 解释

- `data:${mimeType};base64,` 这一段前缀的作用是：
  - 声明后面内容的 **MIME 类型**（例如 `image/png`、`image/jpeg`），浏览器才知道用“图片”方式解码
  - 声明后面内容的 **编码方式是 base64**
  - 使得整个字符串可以直接用于：`<img :src="base64String" />` 或 `![图片](${base64String})`
- 为什么本项目选择“后端转 base64”？前端能不能转？
  - **[可以，前端也能转]** 前端用 `FileReader.readAsDataURL(file)` 就能得到同样的 dataURL。
  
    ```js
    // input[type=file] 选择图片后，前端直接转 base64(dataURL)
    function fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);     // reader.result 就是 dataURL
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    
    // 用法：
    const file = event.target.files[0]
    const dataUrl = await fileToDataURL(file)
    console.log(dataUrl) // 形如：data:image/png;base64,xxxx
    ```
  - **[但后端转更通用]**
  
    - **[统一入口]** 不管是 Web、App、小程序，都可以走同一个 `/upload` 接口，避免各端重复实现
    - **[可控性]** 后端更容易做：
      - 文件大小限制/类型校验（防止非图片、超大文件）
      - 压缩/裁剪/格式转换（降低 token/带宽成本）
      - 鉴权/限流/审计（谁上传了什么）
    - **[可扩展]** 后端以后可以把“转 base64”替换成“上传 OSS/COS/S3 返回 URL”，前端逻辑不变
  - **[什么时候适合前端转]**
    - 纯前端 demo 或不想多一次上传请求时可以前端转
    - 但要注意：base64 会让体积膨胀、占用内存，并且把图片内容直接带进请求体，网络开销更大
- 如果你不想 base64（太大），可以把文件上传到 OSS/COS/S3，后端返回一个可访问的图片 URL（本项目演示的是 base64）。

### 对应项目核心代码

#### 1.1 前端上传（aiclient/src/api/index.js）

```js
export function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  return axios.post('http://localhost:3000/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}
```

#### 1.2 前端选择文件并保存 base64（aiclient/src/views/Home.vue）

```js
function uploadFile(event) {
  const file = event.target.files[0]
  uploadImage(file).then((res) => {
    picBase64.value = res.data.imageBase64
  })
}
```

```vue
<input type="file" @change="uploadFile" />
```

#### 1.3 后端接收并转 base64（server/index.js）

```js
import multer from "multer"

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('image'), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const base64Image = file.buffer.toString('base64');
    const mimeType = file.mimetype;
    const base64String = `data:${mimeType};base64,${base64Image}`;

    res.json({
      message: '文件上传成功',
      imageBase64: base64String,
      originalName: file.originalname,
      fileSize: file.size
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' }); // 500以上是服务器出问题了
  }
});
```

---

## 2) 发送图文到模型：前端组装图文 -> 后端 requestPicAI

### 步骤

1. **[前端]** 如果用户上传了图片，就把输入组装成一个数组：
   - `{ type: "image_url", image_url: base64 }`
   - `{ type: "text", text: 用户输入 }`
2. **[前端]** 调用 `/picllm` 接口
3. **[后端]** `requestPicAI()` 把图文转换为通义多模态接口（openai）所需的 message 结构
4. **[后端]** 调用 `openai.request({ path: '/services/aigc/multimodal-generation/generation' })`

### 解释

- 前端用的 `{ type: "image_url"/"text" }` 是你自己定义的“UI 层协议”，方便组件渲染。
- 后端再把它转换为模型接口需要的格式（本项目里是：`{ image: ... }` 与 `{ text: ... }`）。

### 对应项目核心代码

#### 2.1 前端组装图文并请求 `/picllm`（aiclient/src/views/Home.vue）

```js
function sendToLLM(word) {
  const _convertList = [...convertList.value];
  let _word = word;
  if (picBase64.value) {
    _word = [
      { type: "image_url", image_url: picBase64.value },
      { type: "text", text: word }
    ]
  }

  _convertList.push({ role: "user", content: _word })
  convertList.value = _convertList;

  if (modelType.value === 'text') {
    requestLLM(_word, '001', route.query.convertId, (event) => { /* ... */ })
  } else {
    requestPicLLM(_word, "001", route.query.convertId).then((res) => {
      const _convertList = [...convertList.value];
      _convertList.push(res.data)
      convertList.value = _convertList;
    })
  }
}
```

#### 2.2 前端调用 `/picllm`（aiclient/src/api/index.js）

```js
export function requestPicLLM(content, userId, convertId) {
  return axios.post("http://localhost:3000/picllm", {
    content,
    userId,
    convertId
  })
}
```

#### 2.3 后端 `/picllm` 路由（server/index.js）

```js
app.post("/picllm", async (req, res) => {
  const { content, userId, convertId } = req.body;
  const queryObj = { role: "user", content: content };
  await requestPicAI({
    openai: openaiPic,
    userId,
    convertId,
    res,
    queryObj,
    mcpResult
  })
});
```

#### 2.4 后端 requestPicAI：把图文转成模型 message 并调用多模态接口（server/utils/utils.js）

```js
export async function requestPicAI(opt) {
  const { openai, queryObj, userId, convertId, res } = opt;
  const conversationObj = readConversation();
  const singleConvertList = conversationObj[userId][convertId].list;
  singleConvertList.push(queryObj);

  const { content } = queryObj;
  let messageObj = {};

  if (typeof content == 'string') {
    messageObj = {
      role: "user",
      content: [
        { text: content }
      ]
    }
  } else {
    messageObj = {
      role: "user",
      content: [
        { image: findImage(content) },
        { text: findText(content) },
      ]
    }
  }

  const result = await openai.request({
    method: "post",
    path: '/services/aigc/multimodal-generation/generation',
    body: {
      model: "qwen-image-2.0",
      input: {
        messages: [ messageObj ]
      }
    }
  });

  const resultMessage = result.output.choices[0].message
  const finalMessage = {
    ...resultMessage,
    content: `![图片](${resultMessage.content[0].image})`
  }
  singleConvertList.push(finalMessage);
  writeConversation(conversationObj);
  res.json(finalMessage)
}
```

---

## 3) server 直接用 Markdown 图片格式返回，前端给 `img` 设置样式

### 步骤

1. **[后端]** 把模型返回的图片 URL 转成 Markdown 图片：`![图片](url)`
2. **[前端]** Markdown 渲染组件给所有 `img` 加 class（例如 `markdown-img`），通过 CSS 控制尺寸

### 解释

- 这种方式的好处：后端返回的是“纯文本（Markdown）”，前端统一用 Markdown 渲染即可。
- 注意本项目里前端还额外做了一个兜底：如果用户消息 content 是数组（图文），就额外 `<img :src="...">` 展示图片。

### 对应项目核心代码

#### 3.1 后端返回 Markdown 图片（server/utils/utils.js）

```js
content: `![图片](${resultMessage.content[0].image})` //转为markdown图片的格式，返回给前端
```

#### 3.2 前端给 Markdown 的 img 打 class（aiclient/src/components/MarkDown.vue）

```vue
<VueMarkdown :custom-attrs="{
  a: { class: 'mardown-a' },
  img: { class: 'markdown-img' }
}" ... />

.main.css
.markdown-img {
	width:100%
}
```

#### 3.3 前端：当 content 是数组时额外用 `<img>` 显示原图（aiclient/src/components/MarkDown.vue）

```vue
<img class="image" v-if="content instanceof Array" :src="findImage(content)" />
```

---





## 4) “遵循 OpenAI 规范”与“不遵循规范”的图片接口怎么处理？

### 遵循 OpenAI 规范（文生图 / 图生图）

- 一般可以直接走 OpenAI 风格：`/images/generations`（有些 SDK 版本也会封装成 `openai.images.generate(...)`）。

#### OpenAI 风格图片生成常见参数长什么样？

图片里给的是一个类似 `ImageGenerateParamsBase` 的参数接口（不同 SDK/版本可能字段名略有差异），核心是：**OpenAI 规范定义了一批通用入参，各家厂商“如果宣称兼容”，通常会至少支持其中一部分；同时厂商也可能做扩展**。

常见字段可以这样理解：

- **[prompt]** `string`
  - 文生图提示词
- **[model]** `string`
  - 图片模型名称（各家不一样）
- **[n]** `number`
  - 一次生成几张图
- **[size]** `string`
  - 图片尺寸，例如 `1024x1024`（有些厂商用 `"2k"`/`"1k"` 这类枚举）
- **[quality]** `standard | hd | ...`
  - 质量档位（不同厂商支持不同）
- **[style]** `vivid | natural | ...`
  - 风格档位（不同厂商支持不同）
- **[response_format]** `url | b64_json`
  - 返回图片链接还是 base64（如果是 `b64_json`，你还需要在前端/后端解码并保存/展示）
- **[background]** `transparent | opaque | auto | ...`
  - 背景处理（例如透明背景）
- **[stream]** `boolean`
  - 是否流式返回（很多厂商不一定支持）
- **[user]** `string`
  - 可用于追踪请求来源（可选）

结论：

- **[说“遵循 OpenAI”]** 通常意味着你能用 `/images/generations` + 这些常见参数
- **[但别默认全支持]** 参数支持范围要以厂商文档/示例为准

#### 遵循 OpenAI 规范的调用示例（openai.images.generate）

图片里给了一个典型写法：

```js
const completion = await openai.images.generate({
  model: "doubao-seedream-4-0-250828",
  prompt: "描述你的要求",
  size: "2K",
  // 图生图时可传 image：base64(dataURL) 或 图片线上地址（是否支持、字段名/格式以厂商为准）
  image: [
    // "data:image/png;base64,..."
    // "https://example.com/xxx.png"
  ],
  response_format: "url",
})
```

补充说明：

- **[response_format]**
  - `url`：返回可访问的图片链接
  - `b64_json`：返回 base64（需要你自己保存/展示）
- **[image]**
  - 常用于“图生图/参考图”能力
  - 具体能否传、传几个、支持 base64 还是只支持 URL，需要以厂商文档为准（很多厂商会在 OpenAI 规范上做扩展/裁剪）



### 不遵循 OpenAI 规范案例一

```js
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://example.com/v1",
  apiKey: process.env.API_KEY,
});

// 兼容 OpenAI 的图片生成通常走 /images/generations
const imgRes = await openai.request({
  method: "post",
  path: "/images/generations",
  body: {
    model: "your-image-model",
    prompt: "描述你的要求",
    // 如果是图生图，一些厂商会支持 image 字段（base64 或 url），以厂商文档为准
    // image: ["data:image/png;base64,..."],
    response_format: "url"
  }
});

console.log(imgRes);
```

### 不遵循 OpenAI 规范案例二

- 像本项目调用通义的多模态生成一样：
  - 路径不是 `/images/generations`
  - 就用 `openai.request({ method, path, body })` 按厂商文档拼出来

下面这段就是本项目里的“非 OpenAI 规范图片接口”真实案例（来自 `server/utils/utils.js` 的 `requestPicAI()`）：

```js
const result = await openai.request({
  method: "post",
  path: '/services/aigc/multimodal-generation/generation',
  body: {
    model: "qwen-image-2.0",
    input: {
      messages: [
        messageObj
      ]
    }
  }
});
```





# AI桌面应用

## 和web端ai区别

## 1) 什么是 AI 桌面应用？

它和纯 Web 端 AI 最大差异不在 UI，而在 **权限与能力边界**：

- **[Web 端 AI]**
  - 更适合：在线办事、信息查询、纯聊天、轻量工具
  - 通常不会/不应该直接操作你的本地文件系统、代码仓库、终端、浏览器
- **[桌面端 AI]**
  - 更适合：办公自动化、代码助手、需要“读写本地文件/运行命令/操作软件”的场景
  - 能做：读取本地代码、修改文件、运行脚本、辅助提交 git、操作浏览器/系统能力（取决于产品权限设计）



---

## 2) 常见 AI 桌面应用类型与例子

| 名称 | 安装方式 | 支持自定义大模型接口 | 类型/定位 |
| --- | --- | --- | --- |
| Claude Code | npm / curl 脚本 | 支持 | 编程向 |
| Codex | 同 Claude Code | 支持 | 编程向 |
| Cherry Studio | 下载安装包 | 支持 | 多功能助手 |
| DeepSeek/豆包/千问桌面版 | 下载安装包 | 不支持（也没必要换） | 多功能助手 |
| OpenClaw | npm / 系统指令 | 支持（也必须） | 更偏“控制你的电脑/自动化” |



---

## 3) Claude Code 安装（图片示例整理）

## 去官网安装就行

### Windows

```bash
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

```bash
irm https://claude.ai/install.ps1 | iex
```

### macOS

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

```bash
brew install --cask claude - code
```

### npm（图片里也强调：更推荐 npm，成功率更高）

```bash
npm install -g @anthropic-ai/claude-code
```

---



## 注意不要用去买token然后配置到ai桌面应用，因为是否消耗token

这句话的意思是：**桌面 AI 不是“你点一下它才调用一次模型”**。很多桌面 AI（尤其是编程/自动化类）为了体验，会在后台做一些自动动作，这些动作都可能触发模型调用，从而消耗 token / 产生费用。

常见“你以为没用，实际上在烧 token”的场景：

- **[自动索引/扫描项目]** 首次打开仓库、切换分支、文件变更时自动总结/向量化
- **[Agent 循环]** 自动规划 -> 执行 -> 复盘 -> 再执行（一次操作可能多轮调用）
- **[工具调用/命令执行]** 自动读文件、跑命令后继续追问模型
- **[后台任务]** 常驻托盘/后台监听（有的产品会周期性请求）

所以如果你是“买 token/按量计费”的账号，把 key 直接塞到桌面应用里，很容易出现：

- **[费用不可控]** 一次操作远超预期调用次数
- **[追责困难]** 不好定位到底哪一步/哪个功能在大量调用

更稳妥的做法（建议写进自己的使用规范）：

- **[优先买官方账号套餐（Lite/Pro）]**
  - 更推荐直接在官网买 **Lite/Pro** 这类订阅账号来用桌面应用
    - 火山引擎（豆包）的lite才40/month，pro200/m
  - **原因**：桌面端的调用行为更“产品化”（可能后台索引/多轮 Agent/工具链循环），订阅套餐通常更适合这种使用方式，也更容易控成本
- **[什么时候才需要自定义接口（自己填 baseURL/apiKey）]**
  - 公司/团队有统一的模型网关（统一鉴权、限额、审计）
  - 必须接私有部署/内网模型
  - 必须指定供应商或做 A/B 测试

- **[单独 Key]** 给桌面应用单独申请一个 key，不要和生产/其他项目共用
- **[限额/预算]** 在供应商后台设置每日额度/限流/预算告警
- **[最小权限]** 只授权必要目录/必要工具，避免它读取整个磁盘导致上下文暴涨
- **[先开日志再使用]** 能看请求日志/调用次数的先打开，先观察再放开用
- **[关闭自动索引/自动运行]** 如果产品支持“自动索引/自动执行”，先关掉或改成手动



## 4) Claude Code 配置“三板斧”

去用户目录下找到 `.claude`，然后配置/新建：

1. **[找到目录]** `~/.claude`（Windows 下也会有对应的用户目录）
2. **[claude.json]** 没有就新建，配置 `hasCompletedOnboarding`（用于跳过初始引导/登录相关流程）
3. **[settings.json]** 没有就新建，用来配置你自己的大模型接口与 `apikey`

下面给一个**最小可参考**的 `settings.json` 示例（不同版本字段名可能不同，以 Claude Code 官方文档/当前版本为准；你可以先写上，然后跑起来看报错再对照修正）：

```json
{
  "apiKey": "YOUR_API_KEY",
  "baseURL": "https://your-anthropic-compatible-endpoint",
  "model": "claude-3-5-sonnet"
}
```

如果你接的是第三方/自建的“兼容层”，通常要同时确认：

- **[baseURL]** 兼容的是 Anthropic 协议还是 OpenAI 协议
- **[model]** 模型名是否是该兼容层支持的名称

---

## 5) Claude Code 换接口时：Anthropic 协议 vs OpenAI 规范

- Claude Code 这类桌面应用，往往不是“OpenAI 规范优先”，而是它自己依赖的生态协议。
  - Anthropic是claude code他自己唯一一家的协议接口

- **Claude Code 是 Anthropic 协议体系**，所以你给它换接口时：
  - 目标必须是 **Anthropic 官方接口**
  - 或者 **兼容 Anthropic 协议** 的代理/兼容层
  - 不能想当然把你之前的 OpenAI 兼容地址（`/chat/completions`）直接填进去

下面用“提问/回答”的方式，把图片里那张 **Anthropic vs OpenAI** 的对比再讲透，并补齐一些常见坑。

### Q1：同样是“问一句话”，Anthropic 和 OpenAI 的请求体有什么差异？

#### Anthropic（纯文本提问示例）

图片里给的风格大致是：

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "system": "你是一个专家",
  "messages": [
    {
      "role": "user",
      "content": "写一个快排函数"
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.7
}
```

#### OpenAI（纯文本提问示例）

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "你是一个专家"
    },
    {
      "role": "user",
      "content": "写一个快排函数"
    }
  ],
  "temperature": 0.7
}
```

**关键差异**：

- **[system 的位置]** Anthropic 常见为顶层 `system` 字段；OpenAI 常见放在 `messages` 里
- **[协议/路径]** OpenAI 常见 `POST /chat/completions`；Anthropic 走它自己的 messages API（路径/字段不同）

### Q2：同样是“带图提问（图文多模态）”，两者 content 结构有什么差异？

#### Anthropic

图片是 `type: image`，并且 image 内容放在 `source` 里（base64 需要写 `media_type`）：

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图里有什么？"
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgo..."
          }
        }
      ]
    }
  ]
}
```

#### OpenAI（带图片提问示例）

图片里右边的结构重点是：图片是 `type: image_url`，并且经常直接塞 dataURL：

```json
{
  "model": "gpt-4-vision-preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图里有什么？"
        },
        {
          "type": "image_url",
          "image_url": "data:image/png;base64,i..."
        }
      ]
    }
  ]
}
```

**关键差异**：

- **[图片字段]** Anthropic 是 `type: image + source{...}`；OpenAI 常见 `type: image_url + image_url: dataURL/URL`
- **[base64 形态]** Anthropic 常见“纯 base64 + media_type”；OpenAI 常见直接 dataURL（`data:image/png;base64,...`）

### Q3：回答（Response）格式有什么差异？工具调用又有什么差异？

#### Anthropic 返回（图片示例：包含 tool_use）

图片里给的典型返回是：`content` 是一个数组，里面可能有 `type: text`，也可能有 `type: tool_use`：

```json
{
  "id": "msg_01X...",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "我来帮你查询北京的天气。"
    },
    {
      "type": "tool_use",
      "id": "toolu_...",
      "name": "get_weather",
      "input": {
        "city": "北京",
        "unit": "celsius"
      }
    }
  ]
}
```

#### OpenAI 返回（常见：tool_calls）

OpenAI 风格里更常见的是：assistant message 里有 `tool_calls` 字段（结构与 Anthropic 不同）。

下面补一个 **最小示例**（你前面在 MCP 那一节的 `requestAI()` 实际就是在处理这种 `tool_calls` 分片/拼接）：

```json
{
  "id": "chatcmpl_xxx",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "我来帮你查一下天气。",
        "tool_calls": [
          {
            "id": "call_xxx",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"city\":\"北京\",\"unit\":\"celsius\"}"
            }
          }
        ]
      }
    }
  ]
}
```

**关键差异**：

- **[工具调用字段名与结构不同]** Anthropic 常见 `tool_use`；OpenAI 常见 `tool_calls`
- **[所以桌面应用“换接口”最大坑]**
  - 不是只有 `baseURL/apiKey/model` 不同
  - 更重要的是：**协议字段、消息结构、工具调用结构都可能不同**
  - 因此必须选“兼容正确协议”的接口







