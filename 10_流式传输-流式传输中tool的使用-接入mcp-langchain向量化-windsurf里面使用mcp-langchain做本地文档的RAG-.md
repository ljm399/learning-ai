# 流式传输

在大型语言模型（LLM）开发中，流式传输（Streaming）是提升用户体验（减少首字时间 TTFT）的关键技术。而在涉及工具调用（Tool/Function Calling）时，流式传输的实现会有更复杂的 chunk 累加拼接与二次交互逻辑。

以下基于 LangChain 和自定义历史会话管理的实现，详细梳理 **基础流式传输实现** 与 **流式 Tool 调用** 的核心步骤、原理解释和代码实现。

---

## 一、 怎么做流式传输

我们之前一直是一次性拿结果（使用 `invoke` 接口），对于 AI 这种生成式应用来说，用户需要等待很长时间才能看到第一句回答。在 LangChain 中，将其改为流式输出非常简单：

### 步骤 1：不调用 `invoke` 改为调用 `stream`
*   **解释**：
    在 LangChain 中，开启流式调用的第一步是将执行链条上的 `.invoke` 方法替换为 `.stream`。在流式链路中，不仅最外层调用变成了流式，整个管道（pipe 链路上）的所有组件（例如 Model、Parser 等）内部也会自动以流式机制（stream）进行数据流转。
    
*   **代码实现**：
    ```javascript
    const result = await runablechat.stream(invokeParams, {
        configurable: { sessionId: "default" }
    })
    ```

### 步骤 2：拿到结果后，需要自己用 `for await...of` 循环 chunk 去解析并实时推送
*   **解释**：
    调用 `.stream` 方法后，返回的结果是一个**异步可迭代对象（AsyncIterable）**。我们必须使用 `for await (let chunk of result)` 去循环遍历它，并在每一次循环中解出包含当前生成文本碎片的 chunk。
    在构建 Web 服务（如 Express）时，通常配合 **SSE（Server-Sent Events，服务器发送事件）** 响应头。在循环内部，一边将解析出的文本拼接到总回答 `answer` 中，一边使用 `res.write` 实时将当前的累加消息格式化并写入连接，达到让前端“打字机”实时渲染的效果。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-7 流式传输\code\demo3.js`（第 37 - 44 行）
*   **代码实现**：
    ```javascript
    let answer = new AIMessage("");
    for await (let chunk of result) {
        if (chunk.content) {
            // 1. 将当前的文本碎片不断累加拼接到完整答案对象中
            answer.content += chunk.content;
            
            // 2. 将当前的拼接进度通过 SSE 实时向客户端推送 (此处 mapChatMessagesToStoredMessages 用于转成存储格式格式化发送)
            res.write(`data: ${JSON.stringify(mapChatMessagesToStoredMessages([answer]))}\n\n`);
        }
        // ... (后面章节的 Tool 调用逻辑也会在同一个循环里处理)
    }
    ```

### 步骤 3：历史记录的自动化管理 (无需手动处理流式拼接写入)
*   **解释**：
    虽然在步骤 2 中为了实时输出，我们自己在业务代码中做了 `answer.content += chunk.content` 的手动拼接，但在会话历史持久化的管理上，**不需要我们手动去做拼接并存盘**。
    当我们使用 `RunnableWithMessageHistory` 包裹链条并配合继承自 `BaseChatMessageHistory` 的历史类（如自定义的 `MyHistory`）时，LangChain 底层做了自动化拦截：它会**一直等待整个流式传输过程彻底结束**（即 `for await...of` 循环运行完毕，流式迭代器耗尽），才会将最终聚合完成的完整 `AIMessage` 写入历史库，执行 `addMessages` 方法。因此，开发者不需要为流式分片持久化编写任何额外复杂拼接处理。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-7 流式传输\code\MyHistory.js`（第 20 - 23 行）
*   **代码实现**：
    ```javascript
    export class MyHistory extends BaseChatMessageHistory {
        constructor(userId, sessionId) {
            const origin_history = getUserHistory(userId, sessionId)
            super();
            this.messages = formatHistory(origin_history);
            this.userId = userId;
            this.sessionId = sessionId
        }
        messages = [];
        // 整个流传输彻底结束后，LangChain 会自动汇聚完整的一条 AIMessage 并调用此方法
        addMessages(meg) {
            this.messages.push(...meg);
            // 将完整历史数据写入 JSON 文件/数据库进行持久化
            writeUserHistory(this.userId, this.sessionId, mapChatMessagesToStoredMessages(this.messages))
        }
    ```

---

## 二、 流式传输中的 Tool 调用

大模型结合 Tool 调用时，如果使用流式模式，模型的输出也同样会被打碎成 `chunk`。其中工具名称 `name`、唯一标识 `id` 以及调用参数 `args`（JSON 格式字符串）都会以极其细碎的 `tool_call_chunks` 陆续传回。对其的处理步骤如下：

### 步骤 1：遍历 chunk，拼接方法调用信息
*   **解释**：
    在 `for await` 遍历流的过程中，不仅需要处理文本流 `chunk.content`，还要不断检测是否存在工具调用碎片 `chunk.tool_call_chunks[0]`。
    1. 当第一次读取到工具调用碎片时，将其赋值给我们的工具调用累计对象 `toolCallObj` 作为初值（包含初始 ID、参数与方法名称）。
    2. 对于后续传回的每一个 `tool_call_chunks` 碎片，我们需要不断将新的 `id` 分片、`args` 分片（例如 `{"a": 1` 拼接 `, "b": 2}`）以及 `name` 分片追加拼接进去。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-7 流式传输\code\demo3.js`（第 45 - 55 行）
*   **代码实现**：
    ```javascript
    let toolCallObj = null;
    for await (let chunk of result) {
        // ... (省略 text 流推送代码)
        
        // 判断是否存在工具调用分片
        if (chunk.tool_call_chunks[0]) {
            if (!toolCallObj) {
                // 首次接收：直接作为起始对象
                toolCallObj = chunk.tool_call_chunks[0];
            } else {
                // 后续接收：字符增量拼接累加
                const _chunks = chunk.tool_call_chunks[0];
                toolCallObj.id += _chunks.id ? _chunks.id : "";
                toolCallObj.args += _chunks.args ? _chunks.args : "";
                toolCallObj.name += _chunks.name ? _chunks.name : "";
            }
        }
    }
    ```

### 步骤 2：等流式传输完毕，再执行 tool 并进入二次交互
*   **解释**：
    **绝对不能在循环遍历流未结束时去执行 Tool**。因为在流未走完前，工具参数 `args` 是一个不完整的 JSON 字符串，无法通过 `JSON.parse` 解析。
    当 `for await` 整个流传输接收循环运行结束后，我们判断：如果识别到了一个完整的包含 `id` 的 `toolCallObj`，说明大模型确实决定调用该工具：
    1. 根据拼接好的工具名称 `toolCallObj.name` 从工具映射表 `toolMap` 中取出对应的工具函数。
    2. 将拼接好的、完整的参数字符串通过 `JSON.parse(toolCallObj.args)` 反序列化为 JS 对象。
    3. 通过 `.invoke` 触发工具的执行获取计算结果 `toolResult`。
    4. 构造一个包含 `tool_call_id` 和内容 `toolResult` 的 `ToolMessage`，作为参数向我们的会话控制核心 `chatTo` 发起二次递归请求。大模型由此可以根据工具返回的内容生成符合预期的最终自然语言回复，并同样以流式返回给前端。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-7 流式传输\code\demo3.js`（第 57 - 67 行）
*   **代码实现**：
    ```javascript
    // 1. 流式输出完全完毕后，再检查并执行 tool 逻辑
    if (toolCallObj && toolCallObj.id) {
        const toolName = toolCallObj.name;
        
        // 2. 反序列化累加拼接完整的 JSON 参数，并调用该本地工具
        const toolResult = await toolMap[toolName].invoke(JSON.parse(toolCallObj.args));
        
        // 3. 将工具返回的数据作为 ToolMessage 发回模型，开启第二轮交互回答
        await chatTo({
            content: toolResult,
            tool_call_id: toolCallObj.id
        }, userId, seesionId, res, "tool");
    }
    ```



## 满分费曼：

> 流式传输就是把 **invoke 换成 stream**，返回一个异步可迭代对象。
>
> 用 **for await...of** 遍历 chunk，一边拼 **content** 做前端打字机效果。
>
> 工具调用也是流式碎片，所以要在外面定义 **toolCallObj = null**。
>
> 第一次拿到 chunk 就赋值，后面就不断拼 **id、name、args**。
>
> **必须等整个流遍历结束**，才能把拼好的 args 解析并调用工具。
>
> 工具执行完，封装 **ToolMessage（带 tool_call_id）** 再发给模型。
>
> 历史记录 LangChain 会等流结束后**自动写入**，不用我们手动拼。



# 接入mcp

在使用 MCP（Model Context Protocol，模型上下文协议）时，如果存在多个 MCP 服务（有的本地服务使用 `stdio` 传输，有的远程服务使用 `http`/`sse` 协议），如果手动编写遍历连接、管理 Transport 并且聚合 Tools，会产生大量的冗余代码。

在 LangChain 中，通过 `@langchain/mcp-adapters` 提供的 `MultiServerMCPClient`，可以极大地简化这一过程，支持**一键配置、自动握手、一键获取并绑定 Tools**。

以下是完整的接入步骤、原理解释和项目核心代码实现：

---

## 1. 怎么做 MCP 接入

### 步骤 1：定义 `mcpConfig.js` 配置文件
*   **解释**：
    首先，我们需要将所有的 MCP 服务统一集中配置在一个 JS 文件中。根据 MCP 规范，服务可以采用不同的传输通道（`transport`）：
    
    1.  **`stdio` 通道**：通常用于本地 Node.js 脚本或 CLI 工具（例如通过 `npx`、`node`、`python` 运行的本地工具）。
    2.  **`http`/`sse` 通道**：通常用于远程的在线 MCP 接口，可配合 `headers` 带上 API Key 做鉴权。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-8 接入mcp\code\mcpConfig.js`
*   **代码实现**：
    ```javascript
    export const mcpConfig = {
        "chrome-devtools": {
            "transport": "stdio",
            "command": "npx",
            "args": [
                "chrome-devtools-mcp@latest"
            ]
        },
        "time": {
            "transport": "http",  // 或 "http"
            "url": "https://mcpmarket.cn/mcp/67f270fe36e5587add805ea5",
        },
        "WebSearch": {
            "transport": "sse",
            "url": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/sse",
            "headers": {
                "Authorization": "Bearer sk-7b2cc86e4a3e40c79f3679448412cead"
            }
        }
    }
    ```

---

### 步骤 2：实例化 `MultiServerMCPClient` 统一加载与管理 Server
*   **解释**：
    传统的写法需要开发者自己遍历配置，根据 transport 实例化不同的 Client，并手动记录 client 状态。
    使用 `MultiServerMCPClient`，我们**直接整个对象丢给它**。它会自动在内部循环并按类型使用不同 transport 加载各服务，实现并行的初始化与协议握手。
    
    同时，该 Client 提供了极其实用的工具命名冲突与钩子配置属性：
    - `prefixToolNameWithServerName: true`：是否在工具名前面带上服务名，避免不同 MCP 服务的工具重名产生冲突。
    - `additionalToolNamePrefix: "mcp"`：统一的方法名全局前缀（例如将 `search` 命名为 `mcp_WebSearch_search`）。
    - 此外，它还提供了生命周期 Hook（如 `beforeToolCall` / `afterToolCall`），可以在工具执行前后进行拦截或监控。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-8 接入mcp\code\demo3.js`（第 12 - 16 行）
*   **代码实现**：
    ```javascript
    import { MultiServerMCPClient } from "@langchain/mcp-adapters";
    import { mcpConfig } from "./mcpConfig.js";
    
    const client = new MultiServerMCPClient({
        // beforeToolCall: (toolInfo) => { /* 执行前调用 hook */ },
        // afterToolCall: (toolResultInfo) => { /* 执行后调用 hook */ },
        prefixToolNameWithServerName: true,  // 是否加 mcp 服务名在前缀
        additionalToolNamePrefix: "mcp",      // 统一一个方法名家的前缀
        mcpServers: mcpConfig                // 传入前面定义好的配置
    })
    ```

---

### 步骤 3：调用 `getTools` 一键获取合并后的工具列表
*   **解释**：
    在 client 实例化后，直接调用 `.getTools()` 即可。`MultiServerMCPClient` 会自动向所有已成功连接的 MCP 服务器发送工具查询请求，并将返回的全部工具自动包装为 LangChain 兼容的 Tool 格式对象，**自动合并所有服务的 tool 在一个数组返回**。
    
    同时，我们将获取到的工具注册到全局工具反射表 `toolMap` 中。以便后续流式传输结束时，能立刻通过大模型返回的工具名称映射并反射调用对应实例。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-8 接入mcp\code\demo3.js`（第 17 - 21 行）
*   **代码实现**：
    ```javascript
    // 所有的 mcp 服务的 tool 都会在一个数组返回
    const tools = await client.getTools();
    
    // 遍历工具，维护进 toolMap 中以供反射调用
    tools.forEach((tool) => {
        toolMap[tool.name] = tool;
    })
    ```

---

### 步骤 4：直接 `bindTools` 绑定工具给大模型
*   **解释**：
    通过 `getTools()` 拿到的工具已经完成了 LangChain 规格兼容，不需要我们手动做任何繁琐的数据转换格式工作。直接在大模型实例上调用 `.bindTools(...)`，将这一批工具绑定给大模型即可。
    
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-8 接入mcp\code\demo3.js` 与 `utils\chain.js`
*   **代码实现**：
    ```javascript
    // 1. 在 demo3.js 中通过 client.getTools() 获取工具数组 tools，并作为参数传入
    const tools = await client.getTools();
    const chain = getUserChatChain(tools, type);
    
    // 2. 在 utils/chain.js 中接收 extraTool (即 tools 数组)，使用展开运算符与本地工具合并后一并 bindTools 绑定
    export function getUserChatChain(extraTool, type = 'human') {
        const modelWithTool = model.bindTools([...extraTool, customCalc])
        // ...
        return chain;
    }
    ```

---

### 步骤 5：大模型触发 Tool 后的统一反射执行
*   **解释**：
    当大模型流式传输结束后，如果检测到大模型输出需要调用某个工具（可能来自本地，也可能来自某个 MCP 服务的代理工具），我们通过大模型返回的 `toolCallObj.name` 从 `toolMap` 表中获取目标工具对象：
    1.  大模型并不直接区分是本地工具还是 MCP 远程/管道工具，对外部调用者来说，它们暴露的接口是完全一致的。
    2.  我们直接调用 `.invoke(...)`，如果是 MCP 代理工具，底层的 stdio 或 http 通讯由 adapter 的 Client 自动接管代理，将请求发往相应的 MCP Server 容器。
    3.  获取执行结果后，传入 `chatTo` 并开启第二轮递归会话，直到大模型给出最终的流式回答。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-8 接入mcp\code\demo3.js`（第 69 - 80 行）
*   **代码实现**：
    ```javascript
    // 判断 toolCallObj 是否存在且有效
    if (toolCallObj && toolCallObj.id) {
        const toolName = toolCallObj.name;
        
        // 1. 根据名称在 toolMap 中动态反射出目标工具
        const targetTool = toolMap[toolName];
        
        // 2. 直接调用 invoke 执行。底层 StdIO 通讯管道或 Http/SSE 适配由 Client 自动处理
        const toolResult = await targetTool.invoke(JSON.parse(toolCallObj.args))
        
        // 3. 将工具返回的执行结果包装，递归发起二次流式会话交互
        await chatTo({
            content: toolResult,
            tool_call_id: toolCallObj.id
        }, userId, seesionId, res, "tool")
    }
    ```



## 费曼

MCP 就是把所有服务先写在 **mcpConfig.js** 里。

用 **MultiServerMCPClient** 加载配置，它能自动管理所有连接。

可以配置**工具前缀**，避免名字冲突。

通过 **client.getTools()** 一次性拿到所有 MCP 工具。

把工具放进 **toolMap**，再 **bindTools** 给大模型。

后面调用时，不管是本地还是 MCP，都统一从 **toolMap** 拿并执行



# langchain向量化

在 AI 或者是 LLM（大型语言模型）应用开发中，**向量化（Embedding）**与**向量检索（Vector Search）**是实现 RAG（检索增强生成）和构建智能体长期记忆的最核心、最基本技术。

整个向量化操作主要包含三个基本步骤：
1.  **文本向量化**：将非结构化的文本转化为高维浮点数数组（向量）。可以通过调用大厂提供的向量化模型（Embedding Model）来生成。
2.  **向量储存**：将生成的向量以及关联的原始文本、元数据（metadata）持久化写入数据库。可以自己写 JSON 存，也可以借助现成的向量数据库。
3.  **向量检索**：当用户输入查询词时，先将其向量化，然后计算查询向量与数据库中已有向量的相似度（通常使用余弦相似度算法），召回最相似的文本。一般向量数据库都自带高效检索功能。

在 LangChain 框架中，整个操作可以分为以下四个层级进行学习与实现：

---

## 一、 基础篇：原生的文本向量化 (Text Embedding)

### 步骤 1：初始化嵌入大模型
**代码实现**：

```javascript
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddingModel = new OpenAIEmbeddings({
    modelName: "doubao-embedding-vision-251215",
    apiKey: "828546c2-8580-4a30-ab64-8ddddd5986ca",
    configuration: {
        baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
    }
})
```

### 步骤 2：对单条/批量文本进行向量化
*   **解释**：
    1.  `.embedQuery(text)`：用于向量化单条文本（例如用户的提问、或者某个检索关键词）。
    2.  `.embedDocuments(array)`：用于批量向量化多个文档、段落或知识库切片。
    
*   **代码实现**：
    ```javascript
    const single = "张三很有钱";
    const textArr = ["张三很有钱", "李四很帅", "王五很聪明"];
    
    // 1. 向量化单条文本
    const embedding = await embeddingModel.embedQuery(single);
    
    // 2. 批量向量化多条文本
    const batchEmbeddings = await embeddingModel.embedDocuments(textArr);
    ```

---

## 二、 进阶篇：LangChain 内存向量数据库 (`MemoryVectorStore`)

`MemoryVectorStore` 运行在内存中，不进行本地文件持久化。它非常适合在服务器启动时，一次性加载少量的静态本地文本，并提供极其快速的检索。

### 步骤 1：利用 `fromTexts` 自动向量化并存入内存
*   **解释**：
    在实际使用中，我们不需要手动调大模型把文本变成向量，然后再一个个往库里塞。
    直接调用 `MemoryVectorStore.fromTexts(...)`，传入原始文本数组、元数据数组（Metadata，一一对应）和 Embeddings 大模型对象。该方法会在底层自动并行调用大模型生成文本对应的向量，并将文本、元数据和向量映射好后一并保存在内存中。
    
*   **代码实现**：
    ```javascript
    import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
    
    // fromTexts 会自动在底层帮你调用大模型转向量并保存
    const vectorStore = await MemoryVectorStore.fromTexts(
        textArr, // 原始文本数组
        [        // metadata 元数据，格式和顺序需与文本数组一一对应
            { id: 1 },
            { id: 2 },
            { id: 3 }
        ],
        embeddingModel // 用于向量化的大模型实例
    );
    ```

### 步骤 2：一键执行 `similaritySearch` 相似度搜索
*   **解释**：
    检索时直接调用 `vectorStore.similaritySearch('查询词', count)` 即可。
    我们无需手动把检索词转成向量。这个方法会自动在底层对检索词做向量化，自动计算余弦相似度并返回相关度最高的前 `count` 条数据。
    返回的结果已被包装成标准的 `Document` 数组，拿取内容时直接读取 `.pageContent` 属性即可。
    
*   **代码实现**：
    ```javascript
    // 1. 获取所有的内存储存，可写入 JSON 用于查看结构
    const allMemory = vectorStore.memoryVectors;
    
    // 2. 相似度搜索：一步到位获取前 2 个最相似结果
    const results = await vectorStore.similaritySearch('谁最有钱', 2);
    
    // 3. 获取第一个结果的原始文本
    console.log(results[0].pageContent); // 输出匹配到的原文本
    ```

---

## 三、 持久化篇：原生 LanceDB 向量数据库的使用

内存向量库在服务重启后数据即丢失，对于大批量动态数据或生产环境，必须使用持久化向量库。
**LanceDB** 是一款专为 AI 应用准备的、超轻量级、超高性能的原生持久化单机向量数据库。它的设计理念非常类似于**传统的 SQL 数据库**：
-   **本地文件夹作为数据库的存储地址**：通过 `lancedb.connect('./dir')` 指定本地存储，如果文件夹不存在会自动创建。
-   **建表需要初始数据（Schema 字段锁定）**：创建表时，必须提供第一条数据作为初始样例。这条数据的字段类型和向量维度（如 `vector: result` 的维度）将作为表的 Schema 强制规定该表后续插入数据的规范。

### 步骤 1：连接数据库与表操作
*   **解释**：
    使用 `@lancedb/lancedb` 连接本地目录。可以执行 `tableNames()` 查看所有存在的表，或直接调用 `openTable(tableName)` 打开特定的表进行读写。
    
*   **代码实现**：
    ```javascript
    import * as lancedb from "@lancedb/lancedb";
    
    // 1. 连接本地向量数据库（如果存储路径不存在会自动创建）
    const db = await lancedb.connect("./lancedb-data");
    
    // 2. 获取所有的表名
    const tableList = await db.tableNames();
    
    // 3. 打开某张表
    const table = await db.openTable("table1");
    ```

### 步骤 2：文本自动批量向量化并写入建表
*   **解释**：
    在原生写入中，需要我们手动遍历原始文本数组，调用大模型的 `embedQuery(text)` 获取向量数组，然后重新拼装成一个符合表 Schema 的对象数组（包含 `vector`、`text`、主键等），然后调用 `createTable` 创建或重写物理表进行持久化。
    
*   **代码实现**：
    ```javascript
    const texts = ["张三最有钱。", "李四长得帅", "王五智商高"];
    const storeArr = [];
    
    // 1. 循环调用大模型，生成向量，拼装储存对象
    for (let i = 0; i < texts.length; i++) {
        const result = await embeddingModel.embedQuery(texts[i]);
        storeArr.push({
            i: i,
            text: texts[i], // 源文本，因为检索拿到向量是不可逆的
            vector: result // 必须是 Float32Array 或高维浮点数组
        });
    }
    
    // 2. 创建或覆盖（overwrite）物理表并写入数据。表结构/维度将被 storeArr 的格式锁定
    const table2 = await db.createTable("table2", storeArr, {
        mode: "overwrite"
    });
    ```

### 步骤 3：原生的向量检索与条件查询
*   **解释**：
    1.  **纯文本/条件检索**：无需向量化，类似于 SQL。直接链式调用 `table.query().where("字段 = 值").limit(count).toArray()` 即可。
    2.  **向量近似搜索（Vector Search）**：先把用户的提问通过 Embedding 模型转成向量，然后直接丢入 `table.search(vector).limit(count).toArray()` 执行距离计算与搜索召回。
*   **核心代码位置**：`c:\Users\MJL\Desktop\ai学习\ppt和源码\5-9 langchain向量化操作\code\langceSearch.js`（第 18 - 34 行）
*   **代码实现**：
    
    ```javascript
    // 1. 原生条件查询 (SQL Like)
    const queryResult = await table.query().where("i = 1").limit(10).toArray();
    
    // 2. 向量化检索
    const vector = await embeddingModel.embedQuery("张三"); // 转化查询词为向量
    const vectorResult = await table.search(vector).limit(2).toArray(); // 一键搜索
    ```

---

## 四、 终极篇：LangChain 社区包装类集成 LanceDB 持久化

通过上面原生 LanceDB 的学习，我们发现手动处理连接、遍历转向量、组装表对象依然有些繁琐。
在 LangChain 中，通过官方的社区包 `@langchain/community`，我们可以像在内存向量库中一样，享受**一键转向量、一键物理建表、一键持久化存储和一键高级相似搜索**的全部封装。

### 步骤 1：格式化原始数据为 Documents 格式
*   **解释**：
    使用 LangChain 社区包装类 `LanceDB` 写入时，需要将原始数据格式化为标准的 Document 成员结构。即每个数据必须具有 `pageContent`（保存原始文本）和 `metadata`（保存其他附加信息）属性。
    
*   **代码实现**：
    ```javascript
    const texts = ["张三最有钱。", "李四长得帅", "王五智商高"];
    
    // 映射转换为标准的 Documents 格式
    const documents = texts.map((text, index) => ({
        pageContent: text,
        metadata: { id: index }
    }));
    ```

### 步骤 2：利用 `LanceDB.fromDocuments` 一键写入与自动建表
*   **解释**：
    直接调用 `LanceDB.fromDocuments(documents, embeddingModel, config)`。
    底层的包装类会自动：连接 LanceDB -> 使用大模型将 Documents 转成高维向量 -> 在物理磁盘下自动建立该表 -> 将向量与文本和 metadata 进行匹配并写入。
    
*   **代码实现**：
    ```javascript
    import { LanceDB } from "@langchain/community/vectorstores/lancedb";
    
    // 极简一行代码：自动连接本地目录、自动转向量、自动重写建表并持久化
    const vectorStore = await LanceDB.fromDocuments(
        documents,
        embeddingModel,
        {
            uri: "./lancedb-data", // 物理本地存储路径
            tableName: "table3",   // 表名
            mode: "overwrite"      // 重写/新建模式
        }
    );
    ```

### 步骤 3：加载已存在的物理表并进行一键相似度检索
*   **解释**：
    在查询服务中，我们先使用 `@lancedb/lancedb` 的原生 `connect` 连上数据库并 `openTable` 打开已经存在的物理表。
    接着，使用 `new LanceDB(embeddingModel, { table })` 将大模型和该表实例传给 LangChain 的包装类。
    之后，就可以直接调用一键检索方法 `.similaritySearch('关键词', limit)`。大模型在底层自动帮检索词做向量转换与表匹配，并自动返回规范格式的 Document 数组。
    
*   **代码实现**：
    ```javascript
    import * as lancedb from "@lancedb/lancedb";
    import { LanceDB } from "@langchain/community/vectorstores/lancedb";
    
    // 1. 连接数据库并打开已建立的物理表
    const db = await lancedb.connect("./lancedb-data");
    const existingTable = await db.openTable('table3');
    
    // 2. 两要素构建 LangChain 与该表通信的包装代理
    const existingStore = new LanceDB(embeddingModel, {
        table: existingTable
    });
    
    // 3. 一键搜索：自动转向量检索并返回高级格式化的 Document 数组
    const results = await existingStore.similaritySearch("张三", 2);
    console.log(results);
    ```

---

## 五、 费曼小结：

向量化就是把文本变成向量，分三步：转向量、存向量、搜向量。

- 先用 OpenAIEmbeddings 初始化模型，

  - 单条用 embedQuery，批量用 embedDocuments。

  - 存在内存用 MemoryVectorStore，

  - fromTexts 自动存，similaritySearch 自动搜。

- 但内存会丢，所以用 LanceDB 持久化。
  - LanceDB 像数据库，要自己遍历、自己向量化、自己存。

- 太麻烦，所以用 LangChain 社区封装版，

  - 把文本转成 Document 格式，

  - fromDocuments 一键存，similaritySearch 一键搜。



# 怎么在agent如windsurf里面配置mcp如解析ppt的mcp

- 让ai帮你配置（我怎么问的）

  - 我让你帮我配置能够解析ppt的**全局、随时随地的 PPT 直接读取能力**即配置一个能解析 PPT 的自定义 MCP 服务的mcp，你有几种方案
  - 如何你复制是和的那种方案，让ai执行
    - 一般就本地mcp，或者服务器的mcp
    - 推荐使用python
      - 一定要去官网安装py，否则可能得到知识空壳

  刚刚ai在windsurf里面的操作

  - agent有mcp_config.json

    ```js
    {
      "mcpServers": {
        "pptx-parser": {
          "args": [
            "c:/Users/MJL/Desktop/ai学习/mcp-servers/ppt_reader.py"
          ],
          "command": "python",
          "disabled": false
        }
      }
    }
    ```

  - 因为是ppt解析，需要安装某个库（这个库帮你解析），所以要找个位置（随便找个，方便你管理本地mcp运行的文件比如c:/Users/MJL/Desktop/ai学习/mcp-servers）放置文件，如何python运行

- windsurf里面有mcp市场，你可以去安装
  - 解析ppt的mcp没有，所以需要你上面配置

在我的这套 MCP 配置中，**唯一的 Function Tool（函数工具）** 就是我们在 Python 代码里用 `@mcp.tool()` 装饰器定义的函数：

### 🎯 真正的 Function Tool：[read_pptx](cci:1://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:7:0-48:55)

就是这一段代码：
```python
@mcp.tool()
def read_pptx(file_path: str) -> str:
    """
    读取并解析指定路径的 PPTX 文件，提取每张幻灯片的文本内容。
    ...
    """
```

---

### 它们之间的关系与角色分工：

| 角色                         | 对应实体                                                     | 作用解释                                                     |
| :--------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **MCP Server (服务端)**      | [ppt_reader.py](cci:7://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:0:0-0:0) 脚本进程 | 像一个“后台微服务”，负责挂载和运行所有的工具，等待 Windsurf 发送指令。 |
| **Function Tool (函数工具)** | **[read_pptx](cci:1://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:7:0-48:55)** | **这是暴露给 AI 使用的最终武器**。AI 只认这个工具名、它的参数（`file_path`）和功能描述。 |
| **MCP Client (客户端)**      | Windsurf 编辑器本身                                          | 负责读取 [mcp_config.json](cci:7://file:///c:/Users/MJL/.codeium/windsurf/mcp_config.json:0:0-0:0)，启动并连接 [ppt_reader.py](cci:7://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:0:0-0:0)，把 [read_pptx](cci:1://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:7:0-48:55) 工具提供给 AI 聊天面板。 |

### 运作流程：
1. **你**对我说：“解析这个 PPT”。
2. **我（AI）**发现自己手里有一个名为 **[read_pptx](cci:1://file:///c:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/mcp-servers/ppt_reader.py:7:0-48:55)** 的 **Function Tool**。
3. **我**发起调用：`read_pptx(file_path="C:/path/to/ppt.pptx")`。
4. **Windsurf** 把这个调用指令传给后台运行的 Python 进程。
5. **Python 进程**执行函数，把解析好的文本返回给我。
6. **我**阅读文本，把总结呈现给你。



# langchain做本地文档RAG

在本地文档 RAG（Retrieval-Augmented Generation，检索增强生成）系统的构建中，核心任务是**将本地各种格式的非结构化文档（PPT、PDF、Word等）提取、切割并转化为向量数据库可以检索的语义分片**。

---

## 一、 整体逻辑流程 

构建本地知识库 RAG 的数据处理流程主要分为三步：
1.  **加载文档（Read）**：针对不同的文件类型，使用不同的加载器将其读取并解析为结构化的 `Document` 数据对象（包含原文 `pageContent` 与元数据 `metadata`）。
2.  **文本分割（Split）**：把大段或整页文本切割成语义连贯、大小合适的小文本块（Chunks），防止超出大模型的上下文窗口，并提升向量表示的精准度。
3.  **向量一条龙（Embed & Store & Retrieve）**：将分片文本转化为向量、存入持久化向量数据库（如 LanceDB），并在用户提问时一键检索关联文本。

---

## 二、 步骤 1：文档解析与加载 (Document Loaders)

### 1. 手写原生解析 vs 社区统一 Loader 包装类
*   **手写原生解析的痛点**：
    如果我们不使用 LangChain，而是纯手写原生读取，我们必须针对不同后缀文件手动引入和维护多个底层解析库。
    - `.md` / `.txt` / `.json`：直接用 Node.js 的 `fs.readFileSync` 读取。
    - `.docx` (Word)：需要引入 `mammoth` 库。
    - `.xlsx` (Excel)：需要引入 `xlsx` 库。
    - `.pptx` (PPT)：需要引入额外的 XML 解析或特殊 PPT 解析库。
    - `.pdf` (PDF)：需要引入 `pdf-parse` 等。
*   **社区统一 Loader 包装类的优势**：
    `@langchain/community` 包中提供了各种文档类型的 Loader 类。它们本质上也是底层解析库的“包装类”，但为开发者屏蔽了底层的差异，**提供了完全一致的 `.load()` 异步接口**，并自动将结果组装成 LangChain 的统一 `Document` 数组。
    - `DocxLoader`：Word 解析（背后依赖 `mammoth`）
    - `PPTXLoader`：PPT 解析（背后依赖 JS 库 `officeparser`）
    - `PDFLoader`：PDF 解析（背后依赖传统的 `pdf-parse`）
    - 这里使用了loader，但依旧要安装mammoth，xlsx和paf-parse库，否则没作用，一般安装loader会自动安装，要是没有你就看报错提示安装或把报错给ai，让ai帮你安装

### 2. 核心代码与实现
* **代码实现**：
  ```javascript
  import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
  import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
  import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
  import fs from "fs";
  
  // 1. 加载 PPTX 文件 (背后是 officeparser)
  const pptloader = new PPTXLoader("./file/pptfile.pptx");
  const pptcontent = await pptloader.load();
  fs.writeFileSync("./pptresult.json", JSON.stringify(pptcontent));
  
  // 2. 加载 PDF 文件 (背后是 pdf-parse)
  const pdfloader = new PDFLoader("./file/pdffile.pdf");
  const pdfcontent = await pdfloader.load();
  fs.writeFileSync("./pdfresult.json", JSON.stringify(pdfcontent));
  
  // 3. 加载 Word 文件 (背后是 mammoth)
  const wordloader = new DocxLoader("./file/wordfile.docx");
  const wordcontent = await wordloader.load();
  fs.writeFileSync("./wordresult.json", JSON.stringify(wordcontent));
  ```

---

## 三、 步骤 2：智能文本分割 

### 1. 为什么需要分割与如何选择 Splitter
大篇幅文档直接进行向量化，不仅在向量相似度计算中容易导致语义稀疏（特征不明显），也会在后续塞给大模型时超出上下文窗口。因此必须进行文本分片。
我们依然使用熟悉的 **`RecursiveCharacterTextSplitter`**（递归字符文本分割器），它能够按给定的字符优先级在保持段落、句子结构完整的情况下，将文档优雅地切成设定大小的分片。

*   **⚡ 核心设计细节**：
    在原生手写分割时，我们需要自己提取每个文档对象的文本，然后分别切割，非常容易丢失元数据关联。
    在 LangChain 中，我们**直接调用 `textSplitter.splitDocuments(documents)`**。只需直接传入前面 Loader 解析得到的 `Document` 数组（例如 `pptcontent`），分割器会在内部自动切分文本，**并极其智能地将当前分片在原文件中的 source、行数或页数等 `metadata` 自动保持对应**！

### 2. 核心代码与实现
* **代码实现**：
  ```javascript
  import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
  import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"
  import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
  import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
  import fs from "fs";
  
  // 1. 初始化文本分割器
  const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 100,      // 每个文本分片的最大字符数
      chunkOverlap: 20,    // 分片之间重叠的字符数。设置为 chunk 大小的 10%~20%，有助于保持句子衔接处的上下文语义
      separators: ["\n\n", "\n", " ", ""], // 自定义递归切分分隔符优先级
  });
  
  // 2. 加载并对 PPTX 文件进行自动分片 (自动承接 Document 与 metadata 的一一对应)
  const pptloader = new PPTXLoader("./file/pptfile.pptx");
  const pptcontent = await pptloader.load();
  const pptsplitResult = await textSplitter.splitDocuments(pptcontent);
  fs.writeFileSync("./pptresultSplit.json", JSON.stringify(pptsplitResult));
  
  // 3. 加载并对 PDF 进行分片
  const pdfloader = new PDFLoader("./file/pdffile.pdf");
  const pdfcontent = await pdfloader.load();
  const pdfsplitResult = await textSplitter.splitDocuments(pdfcontent);
  fs.writeFileSync("./pdfresultSplit.json", JSON.stringify(pdfsplitResult));
  
  // 4. 加载并对 Word 进行分片
  const wordloader = new DocxLoader("./file/wordfile.docx");
  const wordcontent = await wordloader.load();
  const wordsplitResult = await textSplitter.splitDocuments(wordcontent);
  fs.writeFileSync("./wordresultSplit.json", JSON.stringify(wordsplitResult));
  
  // 5. 合并三个文档的所有分片，组成知识库大数组
  const compactArr = [...pptsplitResult, ...pdfsplitResult, ...wordsplitResult];
  ```

---

## 四、 工程最佳实践与避坑指南

### ❌ 避坑：不建议一个物理文档对应向量库里的一张表！
在真实的 RAG 系统研发中，许多初学者会习惯给每个上传的文件（如 `pptfile.pptx`、`pdffile.pdf`）都在向量数据库中单独创建一张表（例如 `table_ppt`、`table_pdf`）。
*   **为什么这是个严重的设计失误**：
    因为我们在运行向量近似搜索（Similarity Search）时，必须在代码中先指定我们要连接并打开哪张物理表。如果你为每个文件都建了一张表，那么当用户提出一个问题时，程序在检索前**根本无从得知他的问题到底需要哪张表里的内容**，从而导致漏查或者需要进行昂贵的全表轮询检索。

###  推荐做法：将所有文档的分片进行合并，统一写入一张大表
*   **为什么这是黄金设计**：
    我们将所有的本地文档的分片合并进一个大数组（如上面的 `compactArr`），然后使用 `LanceDB.fromDocuments` **一次性全部写入同一张物理表（如 `table_knowledge_base`）中**。
    1.  当用户提问时，直接对这张大表发起检索。它不仅能进行全局检索，还能天然支持**跨文档联合检索**（例如检索出前半部分在 Word 里，后半部分在 PPT 里）。
    2.  因为我们在 `splitDocuments` 时，包装类会自动在返回的 Chunks 的 `metadata.source` 里注入当前分片的数据源文件路径。所以，当我们在大表中检索到最匹配的前几条数据时，我们**依然能通过读取检索结果中的 `metadata` 极其精确地知道这个分片文本究竟来自哪个原始文档**。这既保证了查询的聚合高效，又完整保留了来源的可追溯性！

*   **完整实现代码示例**：
    ```javascript
    。。。。
    const pptContent = await new PPTXLoader("./file/pptfile.pptx").load();
    const pptChunks = await textSplitter.splitDocuments(pptContent);
    
    const pdfContent = await new PDFLoader("./file/pdffile.pdf").load();
    const pdfChunks = await textSplitter.splitDocuments(pdfContent);
    
    const wordContent = await new DocxLoader("./file/wordfile.docx").load();
    const wordChunks = await textSplitter.splitDocuments(wordContent);
    
    // 3. 🌟 黄金设计：将所有分片合并为一个大数组
    const compactArr = [...pptChunks, ...pdfChunks, ...wordChunks];
    
    // 4. 初始化统一的 Embedding 模型
    const embeddingModel = new OpenAIEmbeddings({
        modelName: "doubao-embedding-vision-251215",
        apiKey: "YOUR_API_KEY",
        configuration: {
            baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
        }
    });
    
    // 5. 一键全部写入同一张物理表 table_knowledge_base 中
    const vectorStore = await LanceDB.fromDocuments(
        compactArr,         // 合并后的全部文档分片大数组
        embeddingModel,     // 向量转换模型
        {
            uri: "./lancedb-data",              // 向量数据库存储路径
            tableName: 'table_knowledge_base',  // 统一的知识库大表
            mode: 'overwrite',                  // 覆盖写入模式
        }
    );
    
    console.log("所有文档分片已成功合并并统一写入 LanceDB 的 table_knowledge_base 表！");
    ```



## 费曼

### 本地文档 RAG 的 **完整四步**（你必须背下来）

### 1. 加载文档（Loader）

**只做：把文件 → 纯文本 + Document 格式**

→ **不向量化**

→ **不切割**

### 2. 文本切割（Splitter）

**只做：把长文本切成小片段**

→ **不向量化**

→ 结果还是 **Document 格式**

### 3. **向量化 + 入库（这一步才做向量！）**

```
LanceDB.fromDocuments(分片数组, 嵌入模型)
```

**这一步才真正把文本变成向量！**

底层自动：

- 调用 embedDocuments
- 生成向量
- 存入数据库
