# MCP提供Function tools


## 1. 在 MCP Server 端注册 Function Tool

### 代码

```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import z from "zod"

app.post('/mcp', async (req, res) => {
    const server = new McpServer({
        name: "mymcp",
        version: "1.0.0"
    })

    server.registerTool("help_dp", {
        type: "function",
        description: "当用户需要订票的时候调用此工具",
        inputSchema: {
            city: z.string().describe("用户要去的城市").optional()
        },
    }, async (arg) => {
        return {
            content: [
                {
                    type: "text",
                    text: `去往${arg.city}的票，订购成功`
                }
            ],
            a: 123,
            b: 23
        }
    })

    const transport = new StreamableHTTPServerTransport()
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
});
```

### 解释

MCP 服务端通过 `McpServer` 对象注册工具（`registerTool`）。

- 工具的 **入参** 用 `inputSchema` 描述（本项目用 `zod` 来声明类型）。
- 工具的 **返回值** 推荐遵循 MCP 的 `content` 结构：`{ content: [{ type: 'text', text: '...' }] }`。

#### 补充：`import z from "zod"`、`.describe()`、`.optional()` 是什么？

- **`import z from "zod"`**
  - 作用：引入 `zod` 这个“运行时 schema/类型描述”库，用来在 JS 里用代码描述参数结构。
  - 在本项目里，它主要用于 MCP tool 的 `inputSchema`（告诉调用方/模型：参数叫什么、是什么类型、含义是什么）。

- **`z.string()`**
  - 表示这个字段是字符串类型。

- **`.describe("...")`**
  - 作用：给字段加一段“人类可读的描述”。这段描述会影响模型对参数语义的理解（模型更容易填对参数）。

- **`.optional()`**
  - 作用：表示这个字段是“可选参数”。
  - 不加 `.optional()` 时，通常表示该字段必填；加了之后，调用 `callTool` 时可以不传 `city`。

#### 补充：`a:123, b:23` 这种额外字段是什么？

在 `mcpServer.js` 的返回值里，除了 `content` 外还返回了 `a/b`：

- 这些是 **MCP tool 的“额外返回字段”**（业务自定义）。
- 但是在“给大模型继续对话”的链路里，你一般只会把 `content` 回灌给模型（本项目也是这样做的）。
- 因此：
  - 如果你的目标是让模型读懂并继续推理，**优先把关键信息写进 `content[].text`**。
  - 额外字段（如 `a/b`）更适合给程序消费（例如你自己的后端逻辑/前端逻辑），而不是期待模型一定会用到。

#### 补充：为什么不推荐依赖 `outputSchema`？

你在代码里能看到 `outputSchema` 被注释掉了：

- MCP SDK 层面可以“声明返回结构”，但在实际项目里：
  - **大模型的函数调用体系（OpenAI-compatible tools）并不使用 `outputSchema` 来约束返回**。
  - 你最终回灌给模型的往往是 `role: 'tool'` 的 `content` 文本（或其 JSON 字符串），模型也不会自动去“校验 schema”。
- 所以 `outputSchema` 很容易变成“写了但没用”的成本；更稳妥的是：
  - 返回的 `content[].text` 用自然语言描述清楚结果
  - 必要时额外带少量结构化字段给程序使用

#### 另一个 MCP 服务（第二个端口）来自 `server/mcpServer2.js`，注册了 `open_safe` 工具。


## 2. 在业务服务里配置多个 MCP 服务地址

### 解释

你的业务服务（本项目 `server/index.js`）会在启动时连接多个 MCP Server，并将它们的 tools 汇总后提供给大模型。

这里把 MCP 服务信息集中放到 `config.js` 里，便于扩展多个服务。

### 代码

来自 `server/config.js`：

```js
export const mcpList = [
    {
        name: "mymcp",
        url: " http://localhost:3001/mcp"
    },
    {
        url: "http://localhost:3002/mcp",
        name: "mymcp2"
    }
]
```


## 3. 连接 MCP + listTools：拿到工具列表

### 解释

MCP Client 通过 `Client` + `StreamableHTTPClientTransport` 连接 MCP Server，然后调用：

- `client.listTools()` 获取服务端暴露的工具列表
- `client.callTool(...)` 执行指定工具

另外需要注意：

- MCP 的 `callTool` 里 `arguments` 是对象（不是字符串）。
- 很多模型 SDK（比如 OpenAI 兼容接口）在 tool_call 里会给你 `function.arguments`（字符串），所以你通常需要 `JSON.parse` 后再传给 `callTool`。

#### 补充：`StreamableHTTPClientTransport('http://localhost:3001/mcp')` 为啥只写了一个地址？

`server/mcpClient.js` 是一个“演示用 client”，它只连了 `3001` 这个 MCP 服务：

```js
const transport = new StreamableHTTPClientTransport('http://localhost:3001/mcp');
```

而业务服务真正做“多 MCP 服务聚合”的地方在 `server/utils/utils.js -> linkMcpAndListTool()`：它会读取 `server/config.js` 里的 `mcpList`，循环连接每一个 `url`，并把 tools 汇总。

所以这两者不冲突：

- **demo 文件**：手动连单个 MCP 服务，方便你理解 `listTools/callTool`。
- **业务主流程**：通过 `mcpList` 同时连多个 MCP 服务并合并工具列表。

#### 补充：`listTools` 和 `callTool` 调的是“本地 MCP”还是“远程 MCP”？

这两者都是在调用 **你连接到的那个 MCP 服务端**（HTTP 请求发到 `http://localhost:3001/mcp` 这种地址）：

- `listTools()`：向 MCP 服务端查询“它有哪些工具”。
- `callTool(...)`：让 MCP 服务端执行某个工具（比如 `help_dp`），并拿回执行结果。

它们不是“listTools 调 MCP、callTool 调本地”的关系；两者都是 **client -> server** 的远程调用。

### 代码

来自 `server/mcpClient.js`（演示代码）：

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const client = new Client({
    name: "sdw",
    version: "1.0.0"
});
const transport = new StreamableHTTPClientTransport('http://localhost:3001/mcp');
await client.connect(transport);

const result = await client.listTools();

const result2 = await client.callTool({
    name: "help_dp",
    arguments: { city: "长沙" }
});
```


## 4. 为什么 listTools 不能直接塞给大模型：需要转成 OpenAI tools 格式

### 解释

大多数大模型“函数调用/工具调用”的入参格式遵循 OpenAI 的 `tools` 结构（OpenAI-compatible）。

而 MCP `listTools()` 返回的结构是 MCP 自己的结构：

- MCP: `result.tools[i]` 上是 `name / description / inputSchema`
- OpenAI tools: `[{ type: 'function', function: { name, description, parameters } }]`

所以需要做一层转换，把 `inputSchema` 映射到 `parameters`。

### 代码

来自 `server/utils/utils.js`：

```js
export function transformToOpenAi(result) {
    const tools = result.tools
    const openTools = tools.map((tool) => {
        const functionObj = {}
        functionObj.name = tool.name;
        functionObj.description = tool.description
        functionObj.parameters = tool.inputSchema
        return {
            type: "function",
            function: functionObj
        }
    })
    return openTools;
}
```


## 5. 把多个 MCP 服务的 tools 汇总，并建立“tool -> server”映射

### 解释

你通常不止一个 MCP 服务：不同服务提供不同工具。

因此业务侧需要在启动时：

- 依次连接每个 MCP 服务
- `listTools` 后转换为 OpenAI tools
- 汇总到一个 `toolList`，提供给大模型
- 同时记录 `toolMap`：`toolName -> serverName`，这样当模型说要调用某个 tool 时，你能找到应该用哪个 MCP client 去 `callTool`

### 代码

来自 `server/utils/utils.js` 的 `linkMcpAndListTool()`：

```js
export async function linkMcpAndListTool() {
    let clientMap = {}
    let toolMap = {}
    let toolList = []
    for (let i = 0; i < mcpList.length; i++) {
        const mcpServer = mcpList[i];
        const client = new Client({
            name: "mcp" + i, // name和version都是自定义的，之后每个mcp不同就行
            version: "1.0.0"
        });
        const transport = new StreamableHTTPClientTransport(mcpServer.url);
        await client.connect(transport)

        clientMap[mcpServer.name] = {
            client, transport
        }

        const openaiTypeList = transformToOpenAi(await client.listTools())
        openaiTypeList.forEach((tool) => {
            toolMap[tool.function.name] = mcpServer.name
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

来自 `server/index.js`：启动时先执行一次 `linkMcpAndListTool()`：

```js
const mcpResult = await linkMcpAndListTool()
```



## mcp实战（windsurf里面配置本地mcp）

### 配置function tool

#### 若不是本地工具，而是远程如sse或http则不用配置function tool，直接执行下一步配置mcp就行，各个agent如windsurf会提示你如何配置mcp

- 下面是本地工具：读取ppt

```js
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseOffice } from 'officeparser';
import { z } from 'zod';

// 创建 Node.js 版的 PPTX-Parser MCP 服务
const server = new McpServer({
    name: "PPTX-Parser",
    version: "1.0.0"
});

// 注册 read_pptx 工具，使用标准 inputSchema
server.registerTool("read_pptx", {
    type: "function",
    description: "读取并解析本地 PPTX 文件的文字内容",
    inputSchema: {
        file_path: z.string().describe("本地 PPTX 文件的绝对路径")
    }
}, async (arg) => {
    try {
        console.error("MCP read_pptx received args:", JSON.stringify(arg));
        
        const file_path = arg.file_path;
        
        if (!file_path) {
            throw new Error(`未提供有效的文件路径参数 file_path，接收到的参数为: ${JSON.stringify(arg)}`);
        }

        // 使用 officeparser 的 parseOffice 在本地解析 PPTX 二进制文件
        const res = await parseOffice(file_path);
        const text = typeof res.toText === 'function' ? res.toText() : JSON.stringify(res);
        return {
            content: [
                {
                    type: "text",
                    text: text
                }
            ]
        };
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `解析 PPT 失败: ${error.message}`
                }
            ]
        };
    }
});

// 启动基于标准输入输出 (stdio) 的传输
const transport = new StdioServerTransport();
await server.connect(transport);

```

- 还要配置package.json以及安装node
  - 所以先执行npm init

### 将function tool配置到windsurf里面的mcp

```json
{
  "mcpServers": {
    "pptx-parser": {
      "command": "node",
      "args": [
        "c:/Users/MJL/Desktop/ai学习/mcp-servers/parsePPT/ppt_reader.js"
      ],
      "disabled": false
    }
  }
}
```



### **Python 只需要一个单文件就能跑通**，而 Node.js 需要配置 package.json那些

| 语言        | 依赖安装在哪里？                | 需要本地配置文件吗？         | 优点                                                         | 缺点                                                         |
| :---------- | :------------------------------ | :--------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **Python**  | **全局** / 虚拟环境共享路径     | **不需要**，直接写单文件运行 | 极其轻量，写小工具、小脚本体验极佳，即写即用。               | 如果电脑里有多个项目用不同版本的同一个库，容易版本冲突（所以需要用虚拟环境隔离）。 |
| **Node.js** | **本地**项目目录的 node_modules | **需要** package.json        | 项目隔离性极好，每个项目有自己独立的版本，拷贝项目时连同 package.json 一起带走即可。 | 新建一个小脚本也必须先初始化环境（`npm init`、`npm install`），显得有些“重”。 |



## 6. 把 MCP tools 与“本地工具”一起提供给大模型

### 解释

业务里除了第三方 MCP 工具之外，往往还有：

- 你自己实现的本地 function tool
- “前端卡片工具”（返回卡片数据，让前端展示 UI，而不是让模型继续输出）

本项目里本地 tools 在 `server/utils/tools.js`。

大模型请求时，把 MCP tools 与本地 tools 合并到 `tools` 字段里。

### 代码

本地工具定义来自 `server/utils/tools.js`：

```js
export const frontList = ['wm_card'];
export const toolList = [
    {
        type: "function",
        function: {
            name: "wm_card",
            description: "当用户需要点外卖的时候，调用此工具可以让前端展示一个外卖选择ui结构",
            parameters: {
                kind: {
                    type: "string",
                    description: "外卖的种类"
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "buy_wm",
            description: "当用户决定了要点某个外卖的时候，调用此工具进行下单",
            parameters: {
                id: {
                    type: "string",
                    description: "要购买的外卖的Id"
                }
            }
        }
    }
]
```

合并 tools 的调用来自 `server/utils/utils.js`：

```js
const llmres = await openai.chat.completions.create({
    model: "qwen-plus",
    messages: [
        { role: "system", content: systemString },
        { role: "system", content: ragContext },
        { role: "system", content: userMemo },
        ...singleConvertList
    ],
    tools: [
        ...mcpResult.toolList || [],
        ...toolList,
    ],
    stream: true
})
```


## 7. 流式返回时：如何拼接 tool_calls（非常关键）

### 解释

开启 `stream: true` 后，大模型的 `tool_calls` 往往会“分片”流式下发（特别是 `function.arguments` 会被拆成很多段）。

因此不能看到一个 chunk 就立即执行工具，需要：

- 先把 `content` 拼起来（普通文本 chunk）
- 看到 `delta.tool_calls` 时，把 `name`/`arguments` 按 `index` 拼接到同一个 tool call 上

### 代码

来自 `server/utils/utils.js`：

```js
for await (let chunk of llmres) {
    const delta = chunk.choices[0].delta
    resObj.id = chunk.id
    resObj.content += delta.content || ''

    if (delta.tool_calls && delta.tool_calls.length > 0) {
        if (resObj.tool_calls) {
            delta.tool_calls.forEach((chunkTool) => {
                const toolIndex = chunkTool.index;
                const targetTool = resObj.tool_calls[toolIndex]
                if (chunkTool.function?.name) {
                    targetTool.function.name += chunkTool.function?.name
                }
                if (chunkTool.function?.arguments) {
                    targetTool.function.arguments += chunkTool.function?.arguments
                }
            })
        } else {
            resObj.tool_calls = delta.tool_calls;
        }
    } else {
        res.write(`data:${JSON.stringify(resObj)} \n\n`)
    }
}
```


## 8. 执行工具：区分三类情况（前端卡片 / 第三方 MCP / 本地工具）

### 解释

当最终 `resObj.tool_calls` 拼完后，进入执行阶段。

- **前端卡片工具**：不把结果再发给模型，而是直接把“渲染卡片所需的数据”通过 SSE 发给前端。
- **第三方 MCP 工具**：用 `toolMap` 找到对应 MCP 服务的 client，然后 `client.callTool({ name, arguments })`。
- **本地工具**：直接调用 `toolHandleMap[name](toolarguments)`。

#### 补充：SSE 为什么说是“单向”的？那前端怎么把数据发回后端？

SSE（Server-Sent Events）是**服务端 -> 客户端**的单向推送通道：

- 浏览器用 `EventSource`（或 `fetch-event-source`）建立一条长连接
- 服务端可以持续 `res.write(...)` 推送事件
- 但这条连接本身**不支持客户端在同一条 SSE 连接上反向发送数据**

因此工程上常见的组合是：

- **客户端 -> 服务端（上行）**：走普通 HTTP（`fetch` / `POST`），把用户输入、tool 参数等发给后端
- **服务端 -> 客户端（下行流式）**：用 SSE 持续推送模型输出、tool 执行结果、卡片数据等

你可以把它理解成“两条通道分工”：

- **上行请求通道**：短连接、可控、一次一请求
- **下行推送通道**：长连接、持续流式

注意：模型返回的 `function.arguments` 是字符串，所以先 `JSON.parse`。

### 代码

来自 `server/utils/utils.js`（tool 执行主逻辑）：

```js
const tool_calls = resObj.tool_calls
const toolQueryObj = {
    role: "tool",
    content: "",
    id: ""
}

for (let toolIndex = 0; toolIndex < tool_calls.length; toolIndex++) {
    const singleTool = tool_calls[toolIndex];
    const name = singleTool.function.name;
    const toolarguments = JSON.parse(singleTool.function.arguments);
    toolQueryObj.id = singleTool.id

    if (frontList.indexOf(name) !== -1) {
        const result = await toolHandleMap[name](toolarguments)
        toolQueryObj.content = "此消息无意义,纯粹让前端展示ui卡片";
        toolQueryObj.cardName = name
        toolQueryObj.arguments = {
            ...toolarguments,
            data: result
        }
        res.write(`data:${JSON.stringify(toolQueryObj)}\n\n`)
        res.end()
    } else {
        let result = {};
        if (mcpResult.toolMap[name]) {
            const serverName = mcpResult.toolMap[name];
            const client = mcpResult.clientMap[serverName].client;
            result = await client.callTool({
                name,
                arguments: toolarguments
            });
        } else {
            result = await toolHandleMap[name](arguments)
        }
        toolQueryObj.content = JSON.stringify(result.content);
        await requestAI({
            userId,
            convertId,
            openai,
            res,
            queryObj: toolQueryObj,
            mcpResult
        })
    }
}
```

说明：上面“本地工具”分支里调用的是 `toolHandleMap[name](arguments)`，这里的 `arguments` 并不是上面解析出来的 `toolarguments`。这在实现上看起来像一个小笔误；从意图上，本地工具应该使用 `toolarguments`。


## 9. MCP 工具返回值处理：建议 text 保持自然语言

### 解释

图片中的要点：

- MCP 工具返回的 `content` 本身是标准结构，大模型能理解。
- 但 `content[].text` 里如果塞的是 **JSON 字符串**（例如 `"{a:123}"`），模型不一定总能稳定理解/提取。

因此在开发 MCP function tool 时：

- **优先让 `text` 返回自然语言**（可读可解释）。
- 需要结构化数据时，可以额外返回字段（比如 `a/b`），或者让 `text` 同时包含“自然语言 + 简短结构化片段”。

### 代码

来自 `server/utils/tools.js` 的示例（`check_store` 返回了 JSON 字符串）：

```js
check_store() {
    return {
        content: [
            {
                type: "text",
                text: "库存如下：\n" + JSON.stringify({
                    xxx: 12,
                    yyy: !4
                })
            }
        ]
    }
},
```


## 10. 前端如何接收“卡片工具”并渲染 UI

### 解释

当后端把 `tool` 消息以 SSE 推送给前端后，前端根据消息内容：

- `role === 'tool'`
- `cardName === 'wm_card'`

渲染对应 Vue 组件，并把用户点击后的行为再次转成自然语言发送给大模型（形成闭环）。

### 代码

SSE 接收与消息拼装：来自 `aiclient/src/views/Home.vue`：

```js
requestLLM(word, '001', route.query.convertId, (event) => {
    const assistantObj = JSON.parse(event.data)
    const _convertList = [...convertList.value];
    const convertIndex = _convertList.findIndex(item => {
        if (item.id === assistantObj.id && assistantObj.id && item.id) {
            return true;
        }
    });
    if (convertIndex !== -1) {
        _convertList[convertIndex] = assistantObj
    } else {
        isThinking.value = false;
        _convertList.push(assistantObj)
    }
    convertList.value = _convertList;
})
```

渲染卡片：来自 `aiclient/src/views/Home.vue`：

```vue
<div v-if="chatItem.role === 'tool' && chatItem.cardName !== ''" class="assistant-content">
  <WmCard @cardConfirm="sendToLLM" v-if="chatItem.cardName === 'wm_card'"
    :kind="chatItem.arguments.kind" :cardData="chatItem.arguments.data"></WmCard>
</div>
```

卡片点击把“用户选择”再转成一句自然语言发回模型：来自 `aiclient/src/components/wmCard.vue`：

```js
function dianta(id) {
    emit("cardConfirm", `我要点id为${id}的煲仔饭`)
}
```


## 11. 整体链路（对照图复盘）

### 步骤

1. **准备 config**：配置多个 MCP 服务（`server/config.js`）。
2. **启动时连接 MCP**：逐个 `connect` + `listTools` + 转 OpenAI 格式（`linkMcpAndListTool`）。
3. **tools 融合**：`MCP tools + 本地 toolList` 一起传给大模型（`requestAI`）。
4. **模型返回 tool_calls**：流式拼接工具名与入参字符串（`for await chunk ...`）。
5. **路由执行**：
   - 前端卡片 tool：直接下发卡片数据给前端
   - MCP tool：根据 `toolMap` 找到对应 `client.callTool`
   - 本地 tool：调用 `toolHandleMap`
6. **把工具结果再喂回模型**：构造 `role:'tool'` 的消息再次调用 `requestAI`，让模型生成最终回复。


## 12. 一些可能的疑问（FAQ）

### 12.1 前端卡片工具也要塞到 MCP 吗？

#### 答案

通常**不需要**。

原因是：前端卡片工具往往和你的“具体前端项目”强绑定（要渲染哪个 Vue 组件、组件需要什么数据结构），它本质是你项目的专属能力，不具备通用共享价值。

在本项目里，`wm_card` 明确走的是“前端卡片”分支：

- 后端把它放在本地 `toolList` 里（不是 MCP `listTools` 来的）
- 后端识别到它后直接给前端下发卡片数据，并 **不再** 把结果喂回模型生成文本

#### 对应核心代码

来自 `server/utils/tools.js`：用 `frontList` 标记“前端卡片工具”。

```js
export const frontList = ['wm_card'];
```

来自 `server/utils/utils.js`：执行 tool 时命中 `frontList`，直接下发 `cardName/arguments.data`。

```js
if (frontList.indexOf(name) !== -1) {
    const result = await toolHandleMap[name](toolarguments)
    toolQueryObj.content = "此消息无意义,纯粹让前端展示ui卡片";
    toolQueryObj.cardName = name
    toolQueryObj.arguments = {
        ...toolarguments,
        data: result
    }
    res.write(`data:${JSON.stringify(toolQueryObj)}\n\n`)
    res.end()
}
```

来自 `aiclient/src/views/Home.vue`：前端根据 `role:tool + cardName` 渲染 `WmCard`。

```vue
<WmCard @cardConfirm="sendToLLM" v-if="chatItem.cardName === 'wm_card'"
  :kind="chatItem.arguments.kind" :cardData="chatItem.arguments.data"></WmCard>
```


### 12.2 如果我用别人的 function tool，它返回的 text 是 JSON 字符串怎么办？

#### 答案

这是非常常见的情况。

推荐做法是：**在你自己的业务服务里再包一层“本地适配工具”**（本地 tool），让模型先调用你的本地 tool，由本地 tool 去调用第三方 MCP tool，然后你把第三方返回的 JSON/string：

- 解析成结构化对象
- 再拼成一段模型更稳健可理解的自然语言

也就是图片里说的那条链路：

`定义本地工具 -> 大模型调用本地工具 -> 本地工具调用第三方 MCP 工具 -> 拿到结果 -> 拼接为自然语言`

#### 对应核心代码

来自 `server/utils/utils.js`：第三方 MCP 工具返回结果后，最终会被塞进 `role:'tool'` 消息再次请求模型。

```js
result = await client.callTool({
    name,
    arguments: toolarguments
});

toolQueryObj.content = JSON.stringify(result.content);
await requestAI({
    queryObj: toolQueryObj,
    ...
})
```

来自 `server/utils/tools.js`：本地工具返回 `content: [{ type:'text', text:'...' }]`，你可以在这里把 JSON 解析后转“自然语言”。

```js
buy_wm(arg) {
    const id = arg.id
    return {
        content: [
            { type: "text", text: `${id}商品已经下单成功，花费23.3` }
        ]
    }
}
```


### 12.3 我开发了一个 MCP 服务，怎么验证调用者是否合法（鉴权）？

#### 答案

MCP 服务在本项目里本质就是一个普通的 `express` 接口（例如 `POST /mcp`）。

因此你完全可以用 Express 的常见方式做鉴权，例如：

- 校验 `req.headers.authorization` / 自定义 `req.headers.auth`
- 校验请求体里的签名字段
- IP 白名单

本项目虽然没把鉴权逻辑写死在 MCP server 中，但你可以在 `app.post('/mcp', ...)` 的入口处或 Express middleware 中加入校验。

#### 对应核心代码

来自 `server/mcpServer.js`：`app.post('/mcp', ...)` 就是你最适合加鉴权的位置（可以在创建 `McpServer` 前先校验 headers）。

```js
app.post('/mcp', async (req, res) => {
    // 这里可以读取 req.headers 做鉴权
    const server = new McpServer({ name: "mymcp", version: "1.0.0" })
    ...
})
```

来自 `aiclient/src/api/index.js`：前端请求业务服务时已经带了自定义 header `auth`（你也可以把它设计成标准 `Authorization`）。

```js
fetchEventSource("http://localhost:3000/llm", {
  headers: {
    "Content-Type": "application/json",
    auth: "asdasdasdas"
  },
  ...
})
```





# MCP提供资源和模板

- mcp:模板上下文协议
  - 上下文有哪些
    - system提示词
    - 对话记录
    - tools列表

## 提供资源


## 1. Resources 是什么（MCP 提供“可读的外部上下文”）

### 解释

Resources（资源）用来让 MCP Server 暴露一些“可被读取的上下文内容”，典型包括：

- 文本文档（制度、产品文档、说明书）
- 图片（截图、流程图）
- 其他二进制内容（以 `base64(blob)` 方式传输）

与 Function Tools 的区别：

- **Tool**：让服务端“执行一个动作”并返回结果。
- **Resource**：让服务端“提供一份内容”供客户端读取（更像一个小型知识库/上下文仓库）。

### 补充：提供资源能干哪些事？（对照课件场景）

1. 你在一家大型公司做 AI 客户端/Agent 开发，公司内部有很多团队/很多项目。
2. 很多项目都会依赖一批“公共资源”，例如：公司制度文档、技术规范、接口说明、品牌 logo、流程图、示例图片等。
3. 一开始如果把这些资源都 copy 到每个项目/每个 agent 本地，会出现：
   - 多处拷贝，维护成本高
   - 文档更新后很难同步，容易拿到过期信息
4. 更合理的方式：搭建一个“公司级 MCP 服务”，把公共文档/图片统一放在 MCP 上，由 MCP 用 `registerResource` 对外提供。
5. 各个团队只需要连接同一个 MCP，就能统一读取最新资源。

本项目里的示例资源就对应这种“公共资源中心”的思路：

- 文本文档：`text://gszd.txt`（公司制度文档）
- 图片资源：`image://pic1.png`（示例图片/可类比 logo、流程图）


## 2. 服务端注册 Resource：`registerResource(name, uri, meta, handler)`

### 解释

在 MCP server 中通过 `server.registerResource` 注册资源：

- `name`：资源名（用于展示/列表）
- `uri`：资源定位符（例如 `image://...`、`text://...`）
- `meta`：标题/描述/mimeType
- `handler(uri)`：收到读取请求后，返回 `contents` 列表

`contents` 里通常二选一：

- `text`：纯文本资源
- `blob`：二进制资源（base64 字符串），常用于图片

### 代码

来自 `ppt和源码/2-9 MCP提供资源和模板/code/mcpdemo/mcpServer.js`（图片资源 `pic1`）：

```js
app.post('/mcp', async (req, res) => {
    const server = new McpServer({
        name: "mymcp",
        version: "1.0.0"
    })
    server.registerResource("pic1", "image://pic1.png", {
        title: "示例图片",
        description: "示例图片",
        mineType: "image/png"
    }, async (uri) => {
        console.log(uri.href);
        const href = uri.href // 注意是uri
        const url = href.replace("image://", "./img/")
        const buf = fs.readFileSync(url)
        return {
            contents: [
                {
                    uri: "image://pic1.png",
                    blob: buf.toString('base64') // 要是文本则blob:buf.toString()没有base64，上面的mineType是text
                }
            ]
        }
    })
```


## 3. 客户端列举与读取资源：`listResources` / `readResource`

### 解释

Client 侧一般先 `listResources()` 看有哪些资源，再用 `readResource({ uri })` 读取其中一个。

读取结果拿到后，你可以：

- 直接塞进系统提示词（system）
- 或者作为一条 `role: 'system'/'user'` 消息加入对话记录
- 图片（blob）则通常交给前端展示，或先走 OCR/图片理解再转文本

### 代码

来自 `mcpdemo/mcpClient.js`（资源部分是注释的示例）：

```js
 const resouceList = await client.listResources();
 console.log(resouceList) // 这里要是有text://gszd.txt'，下面就可以读出来；图片类型'image://pic1.png
 const result = await client.readResource({
     uri: 'image://pic1.png'
 });
console.log(result)
```

> `image://pic1.png` 是文件系统里的路径，不是。 它只是一个字符串 ID，**解析规则完全由你 handler 里面的代码说了算**。

##### 这个 id（uri）怎么来的？

✅ **人工定义，注册的时候硬编码写进去** 流程：

1. 你想好：我要对外暴露一张图片资源，给它起一个唯一标识 `image://pic1.png`
2. 在 `registerResource` 的第二个参数填入这个 uri
3. 同时你自己写转换逻辑：`image://xxx` → 映射到服务器本地文件 `./img/xxx`
4. 客户端调用 `listResources` 的时候，MCP 会把你注册好的这个 uri 返回给客户端
5. 客户端后续调用 `readResource({uri:"image://pic1.png"})`，把同样这个字符串传回服务端
6. 服务端 handler 拿到这个 uri，再通过你写的 replace 逻辑翻译成真实文件路径读磁盘

重点区分两件东西，别混在一起

1. **MCP Resource URI（对外标识）**：`image://pic1.png`，给客户端用，MCP 协议识别它，字符串，自己定义。
2. **服务端本地文件路径（对内真实路径）**：`./img/pic1.png`，node fs 读取磁盘用，只有你的服务端代码知道。

## 4. 实战建议：Resources 怎么“变成上下文”？

### 解释

MCP 只是把资源“提供出来”，怎么喂给大模型，通常由你的业务服务决定。常见策略：

1. **按需读取**：模型/用户触发某个意图后，再读对应 resource，避免把大文档硬塞进上下文。
2. **摘要后再注入**：读到的内容先摘要，再作为 system/context 注入。
3. **区分文本与二进制**：
   - 文本：可直接拼进 system 或对话记录
   - 图片 blob：通常交给前端展示，或交给具备视觉能力的模型处理后再转文本

4. **资源与 RAG 的关系**：
   - MCP Resources 更像“权威数据源/文档源”。
   - RAG 是“检索策略与生成策略”。
   - 你既可以在客户端自己做切片/向量化/检索，也可以把这套流程下沉到 MCP 服务侧统一维护（见下文“模板做 RAG”）。





## 提供模板


## 5. Prompts（模板）是什么：MCP 提供“可复用的消息模板”

### 解释

Prompts（模板）用来让 MCP Server 提供一段“可复用的消息片段”，本质上就是：

- 服务端返回一个 `messages` 数组

  - 所以返回的 `messages` 数组是大模型规范的那样

    ```js
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: ""
                }
            }
        ],
    ```

- 客户端把这段 `messages` 当作“system 提示词 / few-shot / 规范化上下文”插入到对话中

你可以把它理解为：**把 prompt 工程下沉到 MCP 服务端，客户端按名称调用即可**。

### 补充：提供模板的作用 = 提供统一的上下文

对话类 agent 通常需要一段“稳定的上下文结构/写作模板”，例如：

- 角色设定
- 输入要求
- 输出格式要求

如果每个团队、每个人都自己写 system prompt，很容易出现质量参差不齐、风格不统一。

把“对话模板/上下文模板”做成 MCP Prompt（模板）之后：

- 服务端维护一份权威模板（可版本化）
- 客户端在开始对话/每轮对话前按需 `getPrompt()` 拉取
- 保证所有应用拿到的是“统一口径”的上下文


## 6. 服务端注册 Prompt：`registerPrompt(name, meta, handler)`

### 解释

注册 prompt 时：

- `argsSchema` 用 `zod` 描述客户端调用该模板时需要传哪些参数
- `handler(arg)` 里生成模板内容，并返回 `{ messages: [...] }`

### 代码

来自 `mcpdemo/mcpServer.js`：

```js
server.registerPrompt("通用上下文", {
    title: "a",
    description: "b",
    argsSchema: {
        role: z.string(),
        input: z.string(),
        output: z.string()
    }
}, (arg) => {
    console.log(arg);
    const { role, input, output } = arg;
    const buf = fs.readFileSync("./demo.md")
    const bufString = buf.toString();
    const _bufString = bufString.replace("${role}", role).replace("${input}", input).replace("${output}", output)
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: _bufString
                }
            }
        ]
    }
})
```

#### 补充：这里 `z`（zod）是怎么用的？

`argsSchema` 本质是在声明“客户端调用 `getPrompt` 时需要传入的参数对象长什么样”。

- **`z.string()`**：声明字段类型为字符串。
- **对象结构**：
  - `argsSchema: { role: z.string(), input: z.string(), output: z.string() }`
  - 表示 `arguments` 里必须包含 `role/input/output` 三个字段，且都应为字符串。
- 你也可以结合前面 function tool 的写法使用：
  - `z.string().optional()`：字段可选
  - `z.string().describe("...")`：给字段加描述，帮助模型/调用方理解语义

在这个示例里：

- `role`：通常用来控制“角色/身份设定”
- `input`：用户输入要求或用户问题
- `output`：输出格式/输出要求

本项目的写法是从 `./demo.md` 读一个模板文件，然后用 `replace` 做变量替换。

```
demo.md
#角色
你是一个${role}
#输入要求
对提问者的输出又如下要求：${input}
#输出要求
对你的输出又如下要求：${output}
#禁止回答
黄赌毒
```



`mcpdemo/util.js` 也提供了 prompt 注册的模板：

```js
server.registerPrompt("模板名称", {
    title: "模板标题",
    description: "模板描述",
    argsSchema: {/*客户端入参schema*/ }
},
    async (arg) => {
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: ""
                    }
                }
            ],
        };
    }
);
```


## 7. 客户端列举与调用模板：`listPrompts` / `getPrompt`

### 解释

Client 侧一般：

- `listPrompts()`：查看 MCP server 提供了哪些模板
- `getPrompt({ name, arguments })`：调用某个模板并传参，拿到模板生成的 `messages`

拿到 `messages` 后，最常见用法就是把这些 message 插入到你给大模型的 `messages` 列表中（作为 system/few-shot/规范化指令）。

### 代码

来自 `mcpdemo/mcpClient.js`：

```js
const promptList = await client.listPrompts();
const promptResult = await client.getPrompt({
    name: '通用上下文',
    arguments: {
        number: "5",
        name: "张三"
    }
});

console.log(JSON.stringify(promptResult));
```

来自 `mcpdemo/util.js`：

```js
const d = await client.listPrompts()//列举所有模板
console.log(d,'d')
const e = await client.getPrompt({
    name: "要调用的模板名称",  // 从打印的d中看到
    arguments: {/*额外携带的参数*/ }
})
```


## 8. 实战建议：模板怎么融入你说的“上下文三件套”

### 解释

你前面总结的“上下文三件套”：

- system 提示词
- 对话记录
- tools 列表

Prompts（模板）最常见的落点就是前两项：

1. **作为 system 提示词的一部分**：把 `getPrompt()` 返回的 `messages` 放在最前面。
2. **作为 few-shot 对话记录**：把模板消息插到历史消息里（通常靠前）。

而 tools 列表仍然走 tools（function tool）的机制，不由 prompt 解决。



------

## 9.对比传统 RAG vs MCP 模板 + 资源 RAG

普通 RAG：**客户端自己管向量库、自己写检索代码、自己写 Prompt 模板、自己拼消息、自己调 LLM**。

 MCP + 模板 + 资源 RAG：**检索逻辑、文档资源、Prompt 模板全部下沉到 MCP Server**，客户端变薄，只负责发起调用、最后送消息给大模型。

> MCP 本来就有两个原生能力：
>
> 1. `Resource`：资源，就是文档、知识库文件、参考资料（只读）
> 2. `Prompt`：提示模板，就是预先写好的对话模板、回答规范、格式要求

### 传统 RAG（客户端胖）

```
用户提问
↓
【客户端】自己做向量检索 → 拿到片段
↓
【客户端】自己写 Prompt 模板：“基于下面资料回答，不能瞎编……”
↓
【客户端】自己拼接 system + 用户问题 + 检索片段，组装 messages
↓
【客户端】调用 LLM
```

缺点：

- 每一个前端 / Agent 应用都要复刻一套检索代码、一套知识库、一套 Prompt
- 改回答规范、改知识库、改检索策略 → 所有客户端全部要改、重新部署

### MCP 模板 + 资源 RAG（客户端瘦）

```
用户提问
↓
【客户端】调用 MCP 的 Prompt（getPrompt），拿到这个RAG任务的标准模板
↓
【客户端】把用户问题传给MCP，MCP内部调用 search_docs tool，检索自己托管的 Resource（文档资源）
↓
【MCP】把【检索片段 + 套好模板的 messages】一次性返回给客户端
↓
【客户端】直接拿着这套 messages 丢给 LLM
```

✅ 所有 RAG 规则、知识库、模板、检索逻辑都在 MCP Server 统一维护 ✅ 多个应用（IDE 插件、网页 Agent、CLI）共用同一套知识库和回答规范 ✅ 更新文档、改回答要求、调整检索 topk，只改 MCP，客户端不用动

> 重点纠正一个容易混淆的点： MCP 原生 Resource 只是**暴露文档地址 / 文档内容**，MCP 标准本身**不带内置向量检索**。 所以这个方案里一般会自定义一个 MCP Tool，名字叫 `retrieve` / `search_docs`，检索能力是这个 Tool 实现的，Resource 是检索的数据源。





# 本地MCP服务

## 1. 为什么需要 stdio 本地 MCP？

### 解释

前面做的 MCP 多数是“HTTP 网络服务”（需要起一个端口，通过网络请求来调用）。

但有些 MCP 工具的目标不是联网查询，而是**操作用户电脑本地能力**，例如：

- 帮用户打开本地软件（Postman、浏览器、IDE）
- 读取本地文件、访问本地缓存
- 获取本地某些应用的输出（例如浏览器控制台信息）

这类场景更适合用 **stdio MCP**：

- MCP server 作为一个**本地进程**运行（不是 HTTP 服务）
- client 通过启动该进程，并通过**标准输入/输出（stdin/stdout）管道**与之通信

对应课件流程：

1. 搭建一个 stdio 的 MCP 服务
2. MCP 服务运行起来后会作为一个本地线程/本地进程运行
3. stdio 客户端说明启动指令（command/args），运行该指令启动 MCP 服务并连接
4. 后续就通过进程通信调用工具/资源等


## 2. 服务端：`StdioServerTransport` 把 MCP server 变成“本地进程服务”

### 解释

stdio MCP server 的核心点：

- 使用 `StdioServerTransport`
- `await server.connect(transport)` 之后，SDK 会把 MCP 协议消息走 stdin/stdout

### 代码

来自 `ppt和源码/2-7 MCP协议/code/mcpdemo/stdioMcpServer.js`：

```js
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
    name: "mylocal",
    version: "1.0.0"
})

const transport = new StdioServerTransport()
await server.connect(transport);
```

#### 补充：这两行 import 需要先装什么依赖？

需要。

这两个 import 都来自 `@modelcontextprotocol/sdk` 包，所以在你的项目里至少要安装：

- `@modelcontextprotocol/sdk`

本 demo 的依赖声明在 `ppt和源码/2-7 MCP协议/code/mcpdemo/package.json`：

```js
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.27.1",
  "cors": "^2.8.6",
  "express": "^5.2.1"
}
```

其中 `cors/express` 是这个 demo 目录里其他文件用到的；stdio MCP 最核心的是 `@modelcontextprotocol/sdk`。

#### 补充：`#!/usr/bin/env node` 是什么作用？

这是 **shebang**。

- 作用：当该脚本被当作“可执行文件”运行时，告诉操作系统用 `node` 来解释执行它。
- 结合前面 `package.json -> bin`：当你运行 `mylocalmcp` 时，实际执行的是 `./stdioMcpServer.js`，这时 shebang 会让系统自动用 Node 运行该文件。

补充：在 Windows 上 shebang 的作用可能不如类 Unix 系统明显，但在跨平台 npm 包里它仍是常见写法。


## 3. 服务端示例：本地工具 `open_postman`（打开用户 Postman）

### 解释

这个例子展示了 stdio MCP 的典型用途：**调用系统能力**。

- 通过 `child_process.exec` 执行系统命令
- 打开本地 exe

注意：

- 路径是写死的示例，真实项目需要适配不同机器/系统。
- 这类工具通常需要更严格的权限控制（避免任意命令执行风险）。

### 代码

来自 `stdioMcpServer.js`：

```js
import { exec } from 'child_process';// window系统自带的

server.registerTool("open_postman", {
    description: "打开用户的本地postman"
}, () => {
    const path = 'C:/Users/Administrator/AppData/Local/Postman/Postman.exe'
    exec(`start "" "${path}"`, (error) => {
        if (error) {
            console.error('启动失败，请确认路径是否正确');
        } else {
            console.log('Postman启动成功！');
        }
    });
    return {
        content: [
            { type: "text", text: "打开成功" }
        ]
    };
})
```


## 4. 客户端：`StdioClientTransport` 如何启动并连接本地 MCP

### 解释

stdio client 的核心是：你要告诉它“怎么启动 server 这个本地进程”。

在本项目里，`command: "mylocalmcp"` 并不是随便写的，它来自 `package.json` 的 `bin` 配置。

- 当你把这个 npm 包安装/链接后，就会有一个可执行命令 `mylocalmcp`
- 执行它就相当于运行 `./stdioMcpServer.js`

### 代码

客户端连接：来自 `stdioMcpClient.js`：

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: "mycl", version: "1.0.0" })

const transport = new StdioClientTransport({
    command: "mylocalmcp",
    // args: ['stdioMcpServer.js']
})

await client.connect(transport)
```

命令从哪来：来自 `package.json`：

```js
"bin": {
  "mylocalmcp": "./stdioMcpServer.js"
}
```

#### 补充：`package.json` 里的 `bin` 到底有什么用？

`bin` 用来声明：**当这个 npm 包被安装后，应该在命令行暴露哪些“可执行命令”**，以及这些命令实际对应哪个脚本文件。

在本项目里：

- `"mylocalmcp"` 是你希望暴露出来的命令名
- `"./stdioMcpServer.js"` 是命令实际执行的脚本

当你在全局安装该包（或用 `npm link`）后，系统会多出一个可执行命令 `mylocalmcp`，效果近似于：

```bash
mylocalmcp  # => 等价于执行 node ./stdioMcpServer.js（并且会走文件头的 #!/usr/bin/env node）
```

这就和客户端的下面代码“对上”了：

```js
const transport = new StdioClientTransport({
  command: "mylocalmcp"
})
```

执行命令是mylocalmcp

也就是说：

- `StdioClientTransport` 会启动一个子进程
- 这个子进程执行的命令就是 `command` 指定的字符串
- 这里 `command: "mylocalmcp"` 正好对应 `bin` 暴露出来的可执行入口

#### 那 `args: ['stdioMcpServer.js']` 是什么用法？

如果你不想依赖 `bin`（不做安装/link），也可以直接让 client 去执行解释器 + 脚本路径，例如：

```js
const transport = new StdioClientTransport({
  command: "node",
  args: ["./stdioMcpServer.js"]
}) // 即在终端运行 node ./studioMcpServer.js
```

- 执行命令是node ./studioMcpServer.js

这两种方式本质都是“启动 server 进程”，只是在工程化上：

- `bin` 方式：更像一个真正的“可安装的本地 MCP 程序”
- `node + 脚本` 方式：更直接，适合本地调试


## 5. 连接后如何使用：`listTools` + `callTool`

### 解释

一旦 stdio client 连接成功，后续调用方式和 HTTP MCP 一样：

- `listTools()` 列出 server 提供的 tools
- `callTool()` 执行某个 tool

区别只在“传输层”：

- HTTP MCP：走网络
- stdio MCP：走本地进程管道

### 代码

来自 `stdioMcpClient.js`：

```js
const res = await client.listTools();
const res2 = await client.callTool({
    name: "open_postman"
})
console.log(res2);
```



## 客户端通过StdioClientTransport如何和mcp Server建立联系

一句话总纲： **Stdio 模式下，客户端不是通过端口发 HTTP 请求；而是客户端自己去 fork（启动）一个子进程跑 MCP Server，然后把父子进程的 stdin / stdout 管道当做通信通道，MCP 协议消息就在这个管道里互发。**

我们分步骤串起来，再对应你两段代码：

### 极简笔记版（直接抄）

> Stdio MCP 建立连接流程：
>
> 1. 客户端 `StdioClientTransport` 根据 command 启动一个**子进程**运行 MCP Server 脚本；
> 2. 自动绑定父子进程之间 stdin/stdout 管道作为通信通道；
> 3. 服务端 `StdioServerTransport` 接管自身进程的 stdin/stdout，监听并回复 MCP 请求；
> 4. 通道建好之后，`listTools` / `callTool` 的 API 和 HTTP MCP 完全一致，只有底层传输方式不同；
> 5. HTTP：独立服务 + 端口网络通信；Stdio：Client 拉起 Server 子进程 + 管道进程间通信。

### 下面是详细说明

### 1. 客户端这边做的事（StdioClientTransport）

```
const transport = new StdioClientTransport({
    command: "mylocalmcp"
})
await client.connect(transport)
```

`StdioClientTransport` 内部做这几件事：

1. 拿到 

   ```
   command: "mylocalmcp"
   ```

   ，调用操作系统接口，

   新建一个子进程

   ，执行命令 

   ```
   mylocalmcp
   ```

   - 因为 `package.json` 的 `bin` 配置：`mylocalmcp` → `./stdioMcpServer.js`
   - 加上脚本头部 `#!/usr/bin/env node`，等价于：`node ./stdioMcpServer.js`

2. 把子进程的 

   stdin（标准输入）、stdout（标准输出）绑成管道

   - 客户端进程写数据 → 塞进子进程的 stdin（发给 MCP Server）

   - 子进程 stdout 输出 → 流回客户端进程（发给 Client）

     > ⚠️ 重点：stderr 是单独的，一般用来打日志，**不走 MCP 协议通道**，不能随便 console.log 协议消息，会炸！

3. 把这个管道包装成 MCP 的 transport，交给 `client.connect`

> 备选写法（不用 bin，调试常用）：

```
const transport = new StdioClientTransport({
    command: "node",
    args: ["./stdioMcpServer.js"]
})
```

效果一模一样：启动子进程执行 node + 脚本。

### 2. 服务端这边做的事（StdioServerTransport）

```
const server = new McpServer({ name: "mylocal", version: "1.0.0" })
const transport = new StdioServerTransport()
await server.connect(transport);
```

当 `mylocalmcp` 命令启动 `stdioMcpServer.js` 这个子进程之后：

1. `StdioServerTransport` 接管这个子进程原生的 `process.stdin` / `process.stdout`

2. 它持续监听 stdin 流：读到二进制/文本 MCP JSON-RPC 请求，交给 McpServer 处理

3. McpServer 路由：比如收到 

   ```
   listTools
   ```

    / 

   ```
   callTool
   ```

    请求，就去执行对应注册好的 tool

   - 也就是你注册的 `open_postman`

   ```
   server.registerTool("open_postman", ...)
   ```

4. 处理完之后，把 MCP 协议的响应消息，通过 stdout 写回管道 → 流回父进程（客户端）

👉 到这里：通道就打通了！父子进程通过 stdin/stdout 管道双向通信。

### 3. 调用 open_postman 的完整链路（一步一步）

```
【父进程：Client】
await client.callTool({ name: "open_postman" })
    ↓
Client 通过 StdioClientTransport，把 MCP 的 JSON-RPC 请求写入管道 → 子进程 stdin
    ↓
【子进程：MCP Server】
StdioServerTransport 从 stdin 读到这条消息，交给 McpServer
McpServer 匹配到注册的 tool：open_postman
执行回调函数：
    exec('start "" "xxx/Postman.exe"') // 调用系统api打开软件
回调 return { content: [{text:"打开成功"}] }
McpServer 组装 MCP 响应报文
    ↓
响应报文通过 stdout 管道输出 → 流回父进程
    ↓
【父进程：Client】
transport 读到 stdout 的返回结果，交给你 JS 代码拿到 res2
```

### 4. 和 HTTP MCP 的对比，帮你区分

- HTTP Transport：Server 单独启动，监听端口；Client 通过 `POST /mcp` 网络请求发消息，走 TCP。

- Stdio Transport：

  Client 主动拉起 Server 作为自己的子进程

  ，通信是进程间管道，不走网卡、不用端口。

  - Server 生命周期跟着 Client：客户端关掉，一般子进程也会被回收
  - 适合本地电脑能力：读本地文件、启动本地程序、访问本地资源（就是课件说的场景）

### 5. 一个非常容易踩坑点（stdio MCP 经典坑）

在 StdioServerTransport 模式里： `console.log()` 默认输出到 stdout！ 而 stdout 是 MCP 的协议通道！ 如果你随便 `console.log("日志")`，输出的文本会和 MCP JSON-RPC 消息混在一起 → 协议解析报错。

 想要打调试日志，要用 `console.error`（走 stderr，不占用协议通道）。

 你示例代码里写的 `console.log('Postman启动成功！')` 放在真实 stdio MCP 里其实是有隐患的，只是 demo 简化写了。



# LLM大模型是不能联网的
