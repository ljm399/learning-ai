# LangChain 对话管理 (Conversation Management)

### 核心背景
大模型（LLM）本身是**无状态（Stateless）**的，它不会记住之前与其交互的任何内容。为了实现多轮对话，必须在每次发送请求时，将所有的**历史对话记录（History）**作为上下文一起发送给大模型。
在 LangChain 中，有三种不同层级的对话管理方式，从底层的“纯手动组装”到全自动的“托管式管理”。

---

## 阶段一：最大自由度 —— 纯手动组装 (Manual Memory Array)

### 1. 步骤说明
1. **获取历史记录**：根据请求中的 `userId` 和 `sessionId`，从本地存储（文件/数据库）中提取对应的历史对话数组。
2. **构建模板与占位符**：在 `ChatPromptTemplate` 中定义一个历史记录的占位符 `MessagesPlaceholder("history")`。
3. **调用链条发送请求**：在调用 `chain.invoke()` 时，手动将获取的历史记录数组作为 `history` 参数传入，大模型会用该数组替换掉占位符。
4. **手动追加与持久化**：
   - 收到 AI 的回答后，手动将本次用户的提问包装成 `HumanMessage` 放入数组。
   - 手动将本次 AI 的回答包装成 `AIMessage` 放入数组。
   - 手动调用存储函数，将更新后的数组写回本地存储（文件/数据库）。

### 2. 深入解释
这种做法具有**最高的自由度**。开发人员完全控制消息的流动，数组的读取、添加与保存全部亲力亲为。
- **优点**：极具灵活性，可以自由过滤、修改历史消息。
- **缺点**：开发人员需要自己维护历史记录数组，并进行手动的追加（`arr.push`）与持久化写盘操作，容易写出冗余和繁琐的代码。

### 3. 核心代码
在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/demo.js` 项目中：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/demo.js:11-47
    //准备一个数组来储存对话记录
    let arr = [];
    app.get("/llm", async (req, res) => {
        //获取用户体的问题
        const { q, userId, seesionId } = req.query;
        //根据用户id和对话id，从文件/数据库里找出对应记录
        arr = getUserHistory(userId, seesionId)
        //构建消息模板
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", "你是一个有用的助手"],
            new MessagesPlaceholder("history"),
            ["human", "{question}"],
        ]);
        //构建大模型请求对象
        const model = new ChatOpenAI({
            modelName: "doubao-seed-2.0-code",
            apiKey: "edf67641-ba86-4d69-a848-06818c5b883a",
            configuration: {
                baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
            }
        })
        //构建链条
        const chain = prompt.pipe(model).pipe(new StringOutputParser());
    
    
        //执行链条，替换question为用户问题，history为历史记录数组
        const result = await chain.invoke({
            question: q,
            history: arr,
        });
        console.log(result);
        //请求完成后，写入用户提的问题，以及ai的回答
        arr.push(new HumanMessage(q), new AIMessage(result))
        writeUserHistory(userId, seesionId, arr);
        //返回给前端
        res.send(result);
    });
```

底层的读取和持久化工具代码定义在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/utils/index.js` 中：
```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/utils/index.js:4-24
export function getUserHistory(userId, seesionId) {
    const userPath = `./chat/${userId}.json`;
    const isExist = fs.existsSync(userPath)

    if (isExist) {
        const userHistory = JSON.parse(fs.readFileSync(userPath).toString());
        const seesionHistory = userHistory[seesionId] || [];
        return seesionHistory;
    } else {
        fs.writeFileSync(userPath, JSON.stringify({
            [seesionId]: []
        }))
        return []
    }
}
export function writeUserHistory(userId, seesionId, history) {
    console.log(userId, seesionId, 'write')
    const userPath = `./chat/${userId}.json`;
    const userHistory = JSON.parse(fs.readFileSync(userPath).toString());
    userHistory[seesionId] = history;
    fs.writeFileSync(userPath, JSON.stringify(userHistory))
}
```

---

## 阶段二：托管历史记录添加 —— 使用 ChatMessageHistory

### 1. 步骤说明
1. **实例化专属历史管理对象**：使用 `@langchain/community` 中的 `ChatMessageHistory` 代替纯 JS 数组来储存对话记录。
2. **准备基础链条**：构建基础的 Runnable 链条。
3. **用 RunnableWithMessageHistory 包装链条**：
   - 传入基础的 `runnable` 链条。
   - 提供 `getMessageHistory()` 方法，告知 LangChain 应该向哪一个历史记录管理对象（`history`）读写记录。
   - 配置 `inputMessagesKey`（指定哪个键是当前用户的提问）和 `historyMessagesKey`（指定哪个键是存放历史记录的占位符）。
4. **调用 invoke**：直接调用包装后的 `RunnableWithMessageHistory` 对象的 `invoke` 方法，LangChain 在其内部会自动提取历史、填充模板，并**在请求返回后，自动将本次的提问与回答追加到 `ChatMessageHistory` 对象中**。
5. **手动边界读取与存储**：
   - 在开始问答前，需从文件或数据库加载历史并转换：`history = new ChatMessageHistory(_historyArr)`。
   - 在问答结束时，仍需手动调用 `writeUserHistory` 把 `history.messages` 写回本地。

### 2. 深入解释
使用 `RunnableWithMessageHistory` 后，我们**不再需要手动进行 `arr.push(new HumanMessage(q), new AIMessage(result))` 操作**。
这个“记录添加”的过程被完整托管给了 LangChain。
- **局限性**：由于 LangChain 不知道我们的数据具体持久化存放在哪里（是文件、Redis、MongoDB 还是 MySQL），它只能在内存中通过 `ChatMessageHistory` 进行追加。因此在接口层，我们依然要手动在请求进入时初始化 `ChatMessageHistory`，在请求结束时将 `history.messages` 手动保存下来。

### 3. 核心代码
在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/demo2.js` 项目中：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-4 langchain管理对话/code/demo2.js:10-35
//准备一个数组来储存对话记录
let history = new ChatMessageHistory();
app.get("/llm", async (req, res) => {
    //获取用户体的问题
    const { q, userId, seesionId } = req.query;
    const _historyArr = getUserHistory(userId, seesionId);
    //不能直接给_historyArr，要转化成ChatMessageHistory才能作为history
    history = new ChatMessageHistory(_historyArr);
    const chain = getUserChatChain();
    const runablechat = new RunnableWithMessageHistory({
        runnable: chain,
        getMessageHistory() {
            return history
        },
        inputMessagesKey: "question",
        historyMessagesKey: "history"
    })
    const result = await runablechat.invoke({
        role: "聊天机器人",
        question: q
    }, {
        configurable: { sessionId: "default" }
    })
    //在本次问答结束后打印一下history的记录
    //history.getMessages() 或者使用 log（result）
    writeUserHistory(userId, seesionId, history.messages)
    res.send(result);
});
```

---

## 阶段三：更进一步 —— 全自动读写历史（自定义 MyHistory）

### 1. 思考与背景
虽然阶段二托管了历史记录的**追加（追加 HumanMessage 和 AIMessage）**，但在请求的开始和结束，我们依然需要手动编写文件读取（`getUserHistory`）和写入（`writeUserHistory`）的逻辑。
* **痛点问题**：大模型能不能帮我自动从文件/数据库里读写啊？我连自己操作文件获取和写入都不想做了！
* **局限性**：不行！因为 LangChain 不可能知道你的记录到底存在哪，以什么格式存在。
* **解决办法**：我们可以自己写一个专属的历史记录管理对象 —— 继承自 `BaseChatMessageHistory`，并在里面加上我们独特的读写逻辑。这样就完成了和底层的完美桥接！

---

### 2. ChatMessageHistory 的本质与要求
在 LangChain 中，用于管理对话历史记录的对象本质上都继承自 `@langchain/core/chat_history` 包中的 `BaseChatMessageHistory`。
如果要写一个自定义的、能与 `RunnableWithMessageHistory` 无缝配合的管理器，必须继承该类，并保证实现以下两个核心方法和一个核心属性：
1. **属性 `messages`**：一个存储对话记录（各种 `BaseMessage` 实例）的数组。
2. **方法 `getMessages()`**：供 LangChain 在构建 Prompt 阶段调用，获取当前所有的历史消息。
3. **方法 `addMessages(messages)`**：供 LangChain 在大模型交互结束阶段调用，用于追加并自动持久化新产生的对话消息（包括用户输入和 AI 回答）。

---

### 3. RunnableWithMessageHistory 自动管理背后的流程
当我们调用 `RunnableWithMessageHistory.invoke` 时，LangChain 在内部自动执行以下链式流程：
1. **获取历史对象**：调用配置中的 `getMessageHistory()` 函数获取自定义历史对象（如 `MyHistory` 实例）。
2. **读取历史**：自动执行自定义对象的 `history.getMessages()` 获取已格式化的历史记录。
3. **结合历史发起请求**：将历史记录填入 Prompt 中的占位符，联合当前的用户提问（`question`）打包发送给 LLM 大模型。
4. **自动追加与存盘**：大模型响应成功后，LangChain 在内部自动调用 `history.addMessages([UserMessage, AIMessage])`。在自定义类中，我们重写该方法，顺便执行文件/数据库的持久化写入。

此外，在实际开发中，社区也产出了许多预置的存储包，例如基于 `@langchain/community` 的 `RedisChatMessageHistory`（存入 Redis）和 `PostgresChatMessageHistory`（操作 SQL 存盘），有兴趣的同学可以深入探索。

---

### 3.1 🔍 getMessageHistory() 的核心作用与意义
在 `new RunnableWithMessageHistory` 的配置项中，`getMessageHistory` 扮演着至关重要的桥梁角色：

1. **动态历史源回调 (Callback for Dynamic History)**：
   它是一个回调函数，其核心作用是**告诉 LangChain 应该去哪里获取当前会话的历史记录对象**。它解耦了“链条执行（Chain Execution）”和“历史记录存储（History Storage）”。

2. **支持多租户与多会话（Multi-Session & Multi-Tenant）**：
   在真实的线上生产环境中，会有成千上万个用户同时在线，每个用户还有不同的 `sessionId`（会话 ID）。我们不可能只使用一个全局固定的历史对象。
   `getMessageHistory(sessionId)` 函数在被调用时，其实会自动接收调用时传入的 `sessionId` 作为参数。这允许我们根据不同的会话 ID，**动态动态生成/读取**对应的历史对象。
   例如在标准的多会话开发中：
   ```javascript
   const runablechat = new RunnableWithMessageHistory({
       runnable: chain,
       // getMessageHistory 会自动接收来自 invoke 的 configurable.sessionId 
       getMessageHistory(sessionId) {
           // 根据会话 ID，动态返回一个只属于当前会话的 ChatMessageHistory 实例
           return new MyHistory(userId, sessionId); 
       },
       inputMessagesKey: "question",
       historyMessagesKey: "history"
   });
   ```

3. **贯穿生命周期的“枢纽”**：
   - **在“前置”读取阶段**：LangChain 会调用该函数获取历史对象，并执行 `getMessages()`，把历史对话拉出来塞入消息模板的占位符中。
   - **在“后置”写入阶段**：LangChain 在大模型给出响应后，会再次通过该对象调用 `addMessages()` 方法，将最新一轮的提问和回答安全地追加进去并触发自动存盘。

---

### 4. 读写注意事项：序列化与反序列化问题
在之前的简单交互中，我们经常使用粗暴的 `JSON.stringify(arr)` 将 Message 数组直接存入本地 JSON 格式。这样做往往会因为复杂的对象内部结构、元数据等产生大模型报错。
* **LangChain 推荐的规范化转换方法**：
  * **序列化**（写入时）：使用 `@langchain/core/messages` 中的 `mapChatMessagesToStoredMessages` 转换成标准的、适合持久化储存的规范 JSON 结构。
  * **反序列化**（读取时）：使用 `@langchain/core/messages` 中的 `mapStoredMessageToChatMessage` 将储存在盘中的 JSON 结构转回大模型能识别的标准 `Message` 对象实例。

---

### 5. 步骤 + 解释 + 代码 实战落地

#### 第一步：设计自定义 `MyHistory` 类并实现序列化读写
* **步骤说明**：
  1. 继承 `BaseChatMessageHistory` 并准备空数组 `messages`。
  2. 在构造函数 `constructor(userId, sessionId)` 中，根据传入的标识调用本地函数加载原始 JSON 历史数组，并循环调用 `mapStoredMessageToChatMessage` 反序列化为标准 Message 对象，初始化 `this.messages`（实现**自动读取**）。
  3. 重写 `getMessages()` 方法，直接返回加载好的 `messages`。
  4. 重写 `addMessages(meg)` 方法，在追加消息后，调用 `mapChatMessagesToStoredMessages` 将其序列化，并直接通过 `writeUserHistory` 写盘（实现**自动写入保存**）。
* **解释说明**：通过封装，底盘文件操作（读、转、写）全部内聚在类内部。外界调用者不需要编写任何读写代码，从而达到了全托管的优雅体验。
* **核心代码**（在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-5 真全自动读写记录/code/MyHistory.js` 中）：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-5 真全自动读写记录/code/MyHistory.js:1-26
import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { getUserHistory, writeUserHistory } from "./utils/index.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { mapChatMessagesToStoredMessages, mapStoredMessageToChatMessage } from "@langchain/core/messages";
function formatHistory(list) {
    return list.map((item) => {
        return mapStoredMessageToChatMessage(item)
    })
}
export class MyHistory extends BaseChatMessageHistory {
    constructor(userId, sessionId) {
        const origin_history = getUserHistory(userId, sessionId)
        super();
        this.messages = formatHistory(origin_history);
        this.userId = userId;
        this.sessionId = sessionId
    }
    messages = [];
    addMessages(meg) {
        this.messages.push(...meg);
        writeUserHistory(this.userId, this.sessionId, mapChatMessagesToStoredMessages(this.messages))
    }
    getMessages() {
        return this.messages;
    }
}
```

#### 第二步：在服务端接口中使用 `MyHistory`
* **步骤说明**：
  1. 引入我们的 `MyHistory` 历史类。
  2. 接口收到请求时，通过 `new MyHistory(userId, sessionId)` 初始化当前会话的历史类实例。
  3. 构建 `RunnableWithMessageHistory` 时，在 `getMessageHistory` 中直接返回刚才实例化的对象。
  4. 调用 `invoke` 方法，开始由 LangChain 自动托管后续的所有提取、渲染以及请求结束后的自动写盘流程。
* **解释说明**：在 Express 路由里，原先繁琐的读写盘和消息追加逻辑缩减为两三行。`RunnableWithMessageHistory` 会自动去调用我们在第一步中重写好的 `getMessages` 读盘，以及在交互结束时执行 `addMessages` 自动写盘，极大地简化了路由层。
* **核心代码**（在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-5 真全自动读写记录/code/demo3.js` 中）：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-5 真全自动读写记录/code/demo3.js:11-33
//准备一个数组来储存对话记录
import { MyHistory } from "./MyHistory.js";
let history = new MyHistory();
app.get("/llm", async (req, res) => {
    //获取用户体的问题
    const { q, userId, seesionId } = req.query;
    history = new MyHistory(userId, seesionId);
    const chain = getUserChatChain();
    const runablechat = new RunnableWithMessageHistory({
        runnable: chain,
        getMessageHistory() {
            return history
        },
        inputMessagesKey: "question",
        historyMessagesKey: "history"
    })
    const result = await runablechat.invoke({
        role: "聊天机器人",
        question: q
    }, {
        configurable: { sessionId: "default" }
    })

    res.send(result);
});
```



# 当你学习新知识，拿旧知识类比学得快，但当你学到慢时，说明你旧知识未烧开

- 比如：工具调用，你自己都不知道原来是怎么设计的，又怎么类比呢





# langchain使用function tool

今天我们会分三层递进来讲处理：
1. **只使用 langchain 基础的请求大模型，其他都自己管理**
2. **使用 llm 链，但是自己管理对话记录**
3. **基于上节课的全自动管理对话记录加上方法** 

---

## 核心概念：什么是 Function Tool (Function Calling)？
在大模型落地应用中，LLM 自身是无法实时联网、运行复杂计算逻辑或直接调用外部系统的。
为了打破这种限制，我们可以定义本地的 JavaScript 函数（工具），并将工具的**格式描述（Schema）**提供给大模型。
当大模型判断用户的提问需要用到这些工具时，它不会直接生成文本回答，而是返回一个包含工具名称和执行参数的“工具调用请求（Tool Call）”。我们在本地执行工具拿到结果后，再将工具执行结果（Tool Message）传回给大模型，最终由大模型整合这些信息给出人类可读的最终回答。整个闭环称为 **Function Calling**。

---

## 阶段一：极简基础 —— 仅用 Model 请求并自主管理历史 

### 1. 步骤说明
1. **使用 `tool()` 函数定义工具**：引入 `@langchain/core/tools` 中的 `tool` 辅助函数。定义异步工具逻辑体，并在配置中声明唯一的工具名称（`name`）、使用描述（`description`），以及通过 `zod`（`z` 对象）定义好的入参验证 Schema。
2. **准备历史对话数组**：在本地定义一个普通的 JS 数组（如 `const arr = []`）用于储存对话上下文。
3. **绑定工具到大模型**：使用大模型实例的 `.bindTools([customCalc])` 方法。它会返回一个新的、具备工具感知能力的模型对象（如 `modelWithTools`）。
4. **发起调用与响应判定**：将用户的提问作为 `HumanMessage` 塞入数组，调用 `modelWithTools.invoke(arr)` 发起请求。
5. **解析 Tool Calling**：大模型若决定调用工具，其返回的响应对象中 `res.tool_calls` 数组将会有值。
6. **本地执行工具并返回结果**：遍历 `tool_calls`，从工具映射表（`toolMap`）中通过名称找到具体的 tool 对象，调用其 `.invoke(args)` 运行并获取执行结果。
7. **递归喂入 Tool 消息**：本地将工具结果封装成一个特殊的 `ToolMessage` 并推入历史数组，随后**再次递归调用运行函数**，将更新后的历史长链二次喂给大模型。

### 2. 深入解释
在这一阶段，我们**不使用任何 Prompt 模板或 Chain 链条**，直接面向绑定了 Tool 的 Model 进行裸调用。
- **为什么要进行递归调用自身？**
  大模型决定调用工具时，其响应表现为一个 `AIMessage`（包含工具调用指令 `tool_calls`），我们需要把这个 `AIMessage` 追加到对话历史中。
  我们在本地执行 JavaScript 函数拿到结果后，再将结果封装成 `ToolMessage` 追加进历史。
  此时，对话历史为：`[HumanMessage, AIMessage(工具调用指令), ToolMessage(工具执行结果)]`。
  我们必须把整个数组**再次发送给大模型**，大模型识别到历史中已经有完整的“工具请求-工具计算结果”的闭环，就会对结果进行总结归纳，最终输出人类语言。因此，利用递归可以将这个多轮交互闭环彻底连通。

- **`schema: z.object({...})` 的核心作用与意思**：
  在利用 `tool()` 函数定义工具时，`schema` 参数（配合 `zod` 库的类型声明）扮演着至关重要的多重角色：
  1. **定义工具入参规范 (API Interface)**：
     它定义了该本地工具所期望接收的参数对象结构。这里的 `z.object` 明确规定了输入参数必须是一个对象，且对象中必须包含 `a` 和 `b` 两个 **`number`（数字）** 类型的属性。
  2. **生成 JSON Schema 给大模型阅读 (Instructing the LLM)**：
     大模型本质上是一个语言模型，我们通过 `model.bindTools([customCalc])` 把工具绑定给大模型时，LangChain 会在底层**自动**把这里的 Zod Schema 转换为标准规范的 **JSON Schema 格式**并提交给大模型。大模型正是通过阅读这段 JSON Schema，才知道这个工具有什么参数、各参数是什么数据类型。
  3. **参数描述的决定性影响：`.describe()` 的妙用 (Parameter Extraction)**：
     `z.number().describe("用于计算的第一个数字")`
     大模型在提取参数时极其依赖文字说明。这里的 `.describe("...")` 会被渲染进发送给大模型的 JSON Schema 参数描述字段中。大模型通过阅读描述，才懂得将用户问题（如“a为3，b为4”）中的数值 `3` 提取给变量 `a`，数值 `4` 提取给变量 `b`。如果缺失描述，大模型在提取复杂参数时极易出现张冠李戴的错误。
  4. **本地强类型校验拦截 (Type Validation & Safety)**：
     当大模型返回工具调用请求 `{ name: "custom_calc", args: { a: 3, b: 4 } }` 时，LangChain 在真正执行我们的异步计算逻辑前，会先拿这个 Zod Schema 校验大模型传回的 `args`。如果大模型传错类型（例如传了字符串或漏传必填项），Zod 会直接在本地拦截并抛出错误，起到了极强的强类型保护作用。

- **`tool_call_id: tool.id` 的核心作用与意思**：
  在构建并回传 `ToolMessage`（工具执行结果消息）时，必须指定 `tool_call_id: tool.id`。它的作用和必要性如下：
  1. **多工具并发调用的结果绑定 (Binding Multple Concurrent Tool Results)**：
     大模型在单轮对话中，可以**同时发起多个**工具调用请求（比如在 `res.tool_calls` 中生成了 2 个调用：`[{ id: "call_abc", name: "toolA" }, { id: "call_xyz", name: "toolB" }]`）。
     当我们在本地并发执行这两个工具拿到两个不同的结果（例如结果 A 和结果 B）时，大模型怎么知道哪个结果对应哪一次调用呢？
     大模型不可能只按顺序猜，它需要一个唯一的对应凭证。我们通过给 `ToolMessage` 赋上特定的 `tool_call_id`（分别为 `"call_abc"` 和 `"call_xyz"`），就可以**精确、安全地将计算结果绑定至对应的调用请求上**。
  2. **遵守大模型严格的消息对齐规范 (Strict Conversation Graph Protocol)**：
     根据主流大模型（如 OpenAI、字节豆包等）底层接口的强校验要求，历史对话队列中一旦出现了包含 `tool_calls` 的 `AIMessage`，随后的消息流中**必须存在与其数量、ID 一一匹配对齐的 `ToolMessage`**。
     如果我们在 `ToolMessage` 中不传或传错了 `tool_call_id`，大模型服务在接收到请求时会由于“消息格式校验失败（Missing tool_call_id for tool call）”而**直接报错拦截**，拒绝提供服务。

### 3. 核心代码
在项目 `c:\Users\MJL\Desktop\ai学习\ppt和源码\5-6 langchain中使用function tool\code` 中：

#### 工具定义代码（`tools.js`）：
```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/tools.js:1-20
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 1. 定义一下工具
export const customCalc = tool(
    async (arg) => {
        return "计算结果为：" + (arg.a + arg.b);
    },
    {
        name: "custom_calc",
        description: "当用户让你使用天地同寿算法，计算的时候，执行此工具",
        schema: z.object({
            a: z.number().describe("用于计算的第一个数字"),
            b: z.number().describe("用于计算的第二个数字")
        }),
    }
);
export const toolMap = {
    [customCalc.name]: customCalc
}
```

* **💡 拓展：如果有多个工具定义，`toolMap` 应该怎么写？**
  如果我们在项目中声明了多个工具（如 `customCalc`、`customWeather`、`customStock` 等），将它们统一维护在 `toolMap` 中有两种主流写：
  
  **第一种：手动键值对映射（直观直接）**
  直接使用 ES6 的计算属性名语法（`[tool.name]`），在对象中依次逗号分隔追加即可：
  ```javascript
  export const customCalc = tool(...);
  export const customWeather = tool(...);
  export const customStock = tool(...);
  
  export const toolMap = {
      [customCalc.name]: customCalc,
      [customWeather.name]: customWeather,
      [customStock.name]: customStock
  };
  ```

  **第二种：高级自动缩减转换（推荐，更具扩展性）**
  当工具非常多时，手动写键值对容易遗漏。我们可以先将工具统一放入一个数组，然后利用 `Array.prototype.reduce` 自动遍历、动态生成对应的映射 Map。这样以后**只需往数组里加新工具，Map 就会自动更新**：
  ```javascript
  export const customCalc = tool(...);
  export const customWeather = tool(...);
  export const customStock = tool(...);
  
  // 1. 将所有工具放入一个数组中（后续传入 model.bindTools 也可以直接用此数组）
  export const tools = [customCalc, customWeather, customStock];
  
  // 2. 自动将其缩减转换为 key-value 映射对象
  export const toolMap = tools.reduce((map, tool) => {
      map[tool.name] = tool;
      return map;
  }, {});
  ```



### 层级 1 调用与管理代码（`demo1.js`）：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/demo1.js:1-32
import { ChatOpenAI } from "@langchain/openai";
import { customCalc, toolMap } from "./tools.js";
import { HumanMessage, mapChatMessagesToStoredMessages, ToolMessage } from "@langchain/core/messages";
import fs from "fs"
const arr = []

async function run(mes) {
    const model = new ChatOpenAI({
        modelName: "doubao-seed-2.0-code",
        apiKey: "edf67641-ba86-4d69-a848-06818c5b883a",
        configuration: {
            baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
        }
    })
    arr.push(mes);
    const modelWithTools = model.bindTools([customCalc])
    const res = await modelWithTools.invoke(arr)
    arr.push(res)
    fs.writeFileSync("./result.json", JSON.stringify(mapChatMessagesToStoredMessages(arr)))
    if (res.tool_calls && res.tool_calls.length > 0) {
        for await (const tool of res.tool_calls) {
            const toolName = tool.name;
            const result = await toolMap[toolName].invoke(tool.args)
            run(new ToolMessage({
                content: result,
                tool_call_id: tool.id
            }))
        }
    }
}
run(new HumanMessage("使用天地同寿算法,a为3，b为4"))
```

---

## 阶段二：链条配对 —— 使用 ChatPromptTemplate 但未自动管理对话

### 1. 步骤说明
1. **使用 `ChatPromptTemplate` 构建具有历史占位符的模板**：
   在带有 Function Calling 的多轮对话中，我们需要一个 System 提示词和一个接收消息历史的 `MessagesPlaceholder("history")`。
   *注意*：模板中**不再加最后的 `["human", "{question}"]` 占位**，否则会在递归喂入 `ToolMessage` 时导致模板消息结构对齐报错。
2. **通过 `pipe` 组合链条**：将 `promptWithTool` 管道化到绑定了工具的 `modelWithTools` 对象上。
   *注意*：**绝对不要在链条末尾使用 `StringOutputParser`**，因为工具调用的返回对象必须是完整的 `AIMessage`，以便我们在程序中解析 `tool_calls`。如果强行解析成字符串，就会把结构体丢失，导致无法判断和调用本地方法。
3. **入队并调用链条**：将对应的消息推入历史数组 `arr`，并执行 `chain.invoke({ role: "助手", history: arr })` 拿到大模型响应。
4. **自动追加响应**：收到大模型返回的 `AIMessage` 后推入历史。
5. **触发本地工具运行并递归**：
   如果包含 `tool_calls`，本地异步运行工具，将计算结果封装成带有 `tool_call_id` 的 `ToolMessage` 再次推入 `arr`，并递归调用 `run()` 传入当前数据，将 type 标记为 `'tool'`。

### 2. 深入解释
在引入链条后，我们将 Prompt 模板和模型完美融合，但在工具调用的递归流程中，我们需要特别注意细节：
- **为什么模板不能在末尾声明 `["human", "{question}"]`？**
  在普通问答中，我们常用 `[MessagesPlaceholder("history"), ["human", "{question}"]]`。但在工具调用的递归流程中，整个消息链是这样的：
  `[HumanMessage, AIMessage(工具调用请求), ToolMessage(工具执行结果)]`。
  根据大模型的底层的对齐要求，**在 `AIMessage(带有tool_calls)` 之后必须紧接着收到对应的 `ToolMessage(工具执行结果)`**。
  如果我们在 Prompt 模板末尾硬编码了一个 `human` 消息部分，LangChain 在渲染时，就会强行在 `ToolMessage` 之后或者在不适宜的位置插入一个新的人类问题占位。这打破了大模型底层对于消息对齐的严格规范，会导致大模型直接抛出错误。
  因此，在这一层，我们选择用 `promptWithTool` 统一包装 `history` 并传递整个消息链条，去掉了硬编码的 `human` 占位，所有最新的提问和工具结果完全动态地推入 `arr` 中，交给占位符统一渲染。

### 3. 核心代码
在项目 `c:\Users\MJL\Desktop\ai学习\ppt和源码\5-6 langchain中使用function tool\code` 中的 `demo2.js` 中：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/demo2.js:1-55
import { ChatOpenAI } from "@langchain/openai";
import { customCalc, toolMap } from "./tools.js";
import { HumanMessage, mapChatMessagesToStoredMessages, ToolMessage } from "@langchain/core/messages";
import fs from "fs"
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MessagesPlaceholder } from "@langchain/core/prompts";
const arr = []
// const prompt = ChatPromptTemplate.fromMessages([
//     ["system", "你是一个有用的{role}"],
//     new MessagesPlaceholder("history"),
//     ["human", "{question}"],
// ]);
const promptWithTool = ChatPromptTemplate.fromMessages([
    ["system", "你是一个有用的{role}"],
    new MessagesPlaceholder("history"),
]);
const model = new ChatOpenAI({
    modelName: "doubao-seed-2.0-code",
    apiKey: "edf67641-ba86-4d69-a848-06818c5b883a",
    configuration: {
        baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
    }
})
const modelWithTools = model.bindTools([customCalc])
async function run(mes, type = 'human') {
    const query = type === 'human' ? new HumanMessage(mes) : new ToolMessage(mes)
    const chain = promptWithTool.pipe(modelWithTools)
    arr.push(query);
    const invokeParams = {
        role: "助手",
        history: arr,
    }
    const res = await chain.invoke(invokeParams)
    arr.push(res)
    fs.writeFileSync("./result.json", JSON.stringify(mapChatMessagesToStoredMessages(arr)))
    if (res.tool_calls && res.tool_calls.length > 0) {
        for await (const tool of res.tool_calls) {
            const toolName = tool.name;
            const result = await toolMap[toolName].invoke(tool.args)
            run({
                content: result,
                tool_call_id: tool.id
            }, "tool")
        }
    }

}
run("使用天地同寿算法,a为3，b为4")
```

---

## 阶段三：终极形态 —— 自动对话管理下的 Function Calling (Layer 3)

### 1. 问题与痛点分析
虽然我们有了 `MyHistory` 这样的全自动读写管理器，但一旦引入了 Function Calling，会面临一个十分棘手的尴尬局面：
* **致命问题**：我们的自动管理（如 `RunnableWithMessageHistory`），是在**大模型响应返回后**自动触发 `addMessages` 将新消息塞入历史记录。而大模型生成的是 `AIMessage`（包含工具调用指令 `tool_calls`）。
* **痛点所在**：**工具调用的结果（`ToolMessage`）是由我们在本地代码中执行、并手动回传给大模型的，它并不会主动触发 `addMessages`！** 
  也就是说，如果不做特殊处理，大模型返回的 `AIMessage(调用指令)` 会被自动存盘，但本地计算出来的 `ToolMessage(工具执行结果)` 却无法被自动追加进数据库/文件中。这直接导致历史长链断裂，后续大模型无法获取到工具的计算结果！

---

### 2. 核心解决方案：双模板与参数动态切换
为了解决这个问题，我们需要巧妙利用 `RunnableWithMessageHistory` 中 **`inputMessagesKey`** 的工作原理：

1. **利用 `inputMessagesKey` 自动追加特性**：
   LangChain 会在发送消息给大模型前，把我们通过 `inputMessagesKey` 指定的那个入参自动塞入历史记录。
2. **动态替换输入 Key**：
   - **普通人类问答（`human`）**：`inputMessagesKey` 设为 `"question"`，模板以 `["human", "{question}"]` 结尾。
   - **工具结果回传（`tool`）**：`inputMessagesKey` 设为 `"toolResult"`，模板以 `new MessagesPlaceholder("toolResult")` 结尾。
3. **两套 Prompt 模板无缝配合**：
   动态根据调用类型（`human` / `tool`）来生成不同的 `chain`，分别渲染普通提问与工具返回体。

---

### 3. 步骤 + 解释 + 代码 实战落地

#### 第一步：在 `chain.js` 中动态构建“双套模板”链条
* **步骤说明**：
  1. 接收 `type` 参数（默认为 `'human'`）。
  2. 若为 `'human'`：构建标准 Prompt 模板（System + history 占位符 + human 问题占位符）。
  3. 若为 `'tool'`：构建工具专属 Prompt 模板（System + history 占位符 + **`MessagesPlaceholder("toolResult")` 占位符**）。
  4. 最终绑定工具模型 `model.bindTools([customCalc])` 并通过 `.pipe()` 导出 chain。
* **解释说明**：利用 `MessagesPlaceholder("toolResult")` 代替传统的 `human` 部分，使得回传的 `ToolMessage` 可以在历史记录中正确对齐到 `AIMessage` 的下方，防止消息结构错乱。
* **核心代码**（在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/utils/chain.js` 中）：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/utils/chain.js:5-30
export function getUserChatChain(type = 'human') {
    //构建消息模板
    const prompt = type === 'human' ?
        ChatPromptTemplate.fromMessages([
            ["system", "你是一个有用的{role}"],
            new MessagesPlaceholder("history"),
            ["human", "{question}"],
        ]) :
        ChatPromptTemplate.fromMessages([
            ["system", "你是一个有用的{role}"],
            new MessagesPlaceholder("history"),
            new MessagesPlaceholder("toolResult")
        ])

    //构建大模型请求对象
    const model = new ChatOpenAI({
        modelName: "doubao-seed-2.0-code",
        apiKey: "edf67641-ba86-4d69-a848-06818c5b883a",
        configuration: {
            baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3"
        }
    })
    const modelWithTool = model.bindTools([customCalc])
    //构建链条
    const chain = prompt.pipe(modelWithTool);
    return chain;
}
```

#### 第二步：在 `demo3.js` 中动态切换 `inputMessagesKey` 并执行自动存盘
* **步骤说明**：
  1. 封装通用请求函数 `chatTo(q, userId, sessionId, type = 'human')`。
  2. 实例化 `MyHistory` 自动读写对象。
  
     ```js
     export class MyHistory extends BaseChatMessageHistory {
     ```
  3. 根据 `type` 动态设置 `inputMessagesKey`：`'human'` 时绑定 `"question"`，`'tool'` 时绑定 `"toolResult"`。
  4. 组装不同的入参 `invokeParams`：普通提问传入 `invokeParams.question`；工具结果传入 `invokeParams.toolResult = [ToolMessage实例]`。
  5. 在 Express 路由中：
     - 首先发起第一次普通调用 `chatTo`。
     - 若返回 `tool_calls`，本地执行工具。
     - 递归发起第二次调用，将 `type` 标为 `"tool"` 并传入工具结果。
* **解释说明**：通过这种动态路由，在工具计算结果返回给大模型前，`RunnableWithMessageHistory` 会将 `toolResult` 中的 `ToolMessage` 自动视作“新增输入”，并强制通过 `addMessages` 追加持久化写入盘中，彻底实现了 Function Calling 完整链条的全自动读写。

- **`runablechat.invoke(invokeParams, { configurable: { sessionId: "default" } })` 的核心作用与解释**：
  在调用 `runablechat.invoke` 时，第二个参数是 LangChain 中极其重要的 **配置对象（Config Object）**，其中的 `configurable.sessionId` 扮演着“会话钥匙”的角色：
  1. **跨组件传递会话 ID 的桥梁**：
     `RunnableWithMessageHistory` 需要在多用户并发时区分不同的对话会话。我们在这里显式传入 `{ configurable: { sessionId: "default" } }`，就是为了把本次交互的会话 ID 设定为 `"default"`（在实际生产中应该动态传入用户的 `sessionId`，如查询参数中的 `seesionId`）。
  2. **激活 getMessageHistory 的入参**：
     在实例化 `RunnableWithMessageHistory` 时，我们声明了：
     ```javascript
     getMessageHistory(sessionId) {  // 👈 这个形参就是由 configurable.sessionId 注入的！
         return history;
     }
     ```
     当链条开始运行时，LangChain 内部机制会优先拦截这个配置，提取其中的 `sessionId` 值，并自动将其作为参数**传递给我们的 `getMessageHistory()` 回调函数**。
  3. **不传的后果**：
     如果在调用 `.invoke()` 时缺少了 `{ configurable: { sessionId: "xxx" } }` 参数，`RunnableWithMessageHistory` 将不知道当前调用属于哪一个会话，`getMessageHistory(sessionId)` 接收到的 `sessionId` 就会是 `undefined`。这会导致无法正确加载或持久化对应的历史记录。因此，这个参数是启用 LangChain 自动历史管理的**必填钥匙**。

* **核心代码**（在 `@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/demo3.js` 中）：

```javascript
@/Users/MJL/Desktop/ai学习/ppt和源码/5-6 langchain中使用function tool/code/demo3.js:9-51
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
async function chatTo(q, userId, seesionId, type = 'human') {
    let history = new MyHistory(userId, seesionId);
    const query = type === 'human' ? new HumanMessage(q) : new ToolMessage(q)
    const chain = getUserChatChain(type);
    const runablechat = new RunnableWithMessageHistory({
        runnable: chain,
        getMessageHistory() {
            return history
        },
        inputMessagesKey: type === 'human' ? "question" : "toolResult",
        historyMessagesKey: "history"
    })
    const invokeParams = {
        role: "聊天机器人",
    }
    if (type === 'human') {
        invokeParams.question = query.content;
    } else {
        invokeParams.toolResult = [query];
    }
    const result = await runablechat.invoke(invokeParams, {
        configurable: { sessionId: "default" }
    })
    return result;
}
//准备一个数组来储存对话记录

app.get("/llm", async (req, res) => {
    //获取用户体的问题
    const { q, userId, seesionId } = req.query;
    let result = await chatTo(q, userId, seesionId);
    if (result.tool_calls && result.tool_calls.length > 0) {
        for await (const tool of result.tool_calls) {
            const toolName = tool.name;
            const toolResult = await toolMap[toolName].invoke(tool.args)
            result = await chatTo({
                content: toolResult,
                tool_call_id: tool.id
            }, userId, seesionId, "tool")
        }
    }
    res.send(result.content);
});
```

---

### 4. 终极吐槽与架构反思
看到这里，相信很多开发者的第一反应是：
> **「太麻烦了！！！这还不如我直接用 OpenAI SDK 原生手写数组追加和写盘，或者直接用阶段一那种纯 Model 绑定工具并自己 push 的模式舒服呢！」**

这也就是为什么许多资深 AI 应用开发者，在实际面对复杂、高频的 Function Calling 场景时，**宁愿选择最大自由度地自己手动组装（甚至直接使用原始 SDK / 简单的内存追加），也不愿意去强行套用 LangChain 复杂的链条和自动管理组件。**
学习 LangChain 的这些组件不仅让我们深刻理解了大模型和消息对齐在底层的约束，更让我们在面对不同场景时，能理智地在“封装之美”和“手写自由”之间做出最合适的架构抉择。

