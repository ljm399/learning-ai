# langGraph的使用

## 1. 为什么需要 LangGraph（核心痛点与图的思想）
传统的 **LangChain 链（Pipe/Chain）** 在构建复杂的自主智能体时存在以下核心痛点：
* **只能直线到底，无法转弯**：传统链是一条笔直的路，如果发出请求后需要根据模型返回的不同结果（如 A 或 B）来走不同的业务分支，链式的组织方式难以应对。
* **无法自动循环**：在执行类似 Tool Use 的多轮迭代任务时，传统的 LLM 链如果要再次运行，开发人员必须在外部自己写递归逻辑来触发下一轮执行。

**LangGraph 的核心解决方案：**
LangGraph 允许我们**开岔路**并**回到上一步**。它抛弃了传统的“单向链式结构”，采用**“图（Graph）”**的模型来组织步骤：

1. **步骤节点化**：把要做的每一件事（请求大模型、执行工具等）抽象为图中的 **Node（节点）**。
2. **连接边定制化**：利用 **Edge（边）** 来声明步骤之间的流转顺序。
3. **引入条件判断节点**：最核心的能力是 **Conditional Edges（条件边）**。我们可以编写自定义的路由函数，根据上一步的返回状态，动态决定下一个执行的节点是谁，从而支持无限次状态循环和分支选择。

---

## 2. 核心概念与 State 运行机制
在 LangGraph 中，有两个最核心的概念指导着其数据流动：
* **StateGraph（状态图）**：管理图的结构定义、节点关联和整体流转。
* **State（状态定义）**：图内部的数据传递载体。在 LangGraph 中，所有的 Node 在执行时都会接收到当前的 State 并在执行完后返回一个新的对象。
  * **reducer 的作用**：当我们在 `Annotation.Root` 或自定义 Annotation 中定义属性时，必须为其指定 `reducer` 策略。`reducer` 决定了当不同的 Node 返回同一个属性的值时，该属性**如何跟原有的属性值进行融合**后再传给下一个 Node（例如：是直接覆盖，还是追加进数组，还是进行数值加减）。

---

## 3. LangGraph 基础使用步骤（结合 demo1.js 极简工作流）

在 `@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/demo1.js` 中，展示了构建一个 LangGraph 图的六个最基本步骤：

### 步骤一：使用 Annotation 自定义数据处理策略与 State
* **解释**：定义图中流转的数据结构。在这里用 `Annotation.Root` 声明。每一个节点返回的对象（所以到第二个.addNode才开始，不是第一个），其中的属性必须在 State 中预先定义，否则即便节点返回了该属性也无法被后续节点拿到。可以通过定义 `reducer` 控制数据融合逻辑。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/demo1.js:4-15
//1，自定义数据处理策略
const MyState = Annotation.Root({
    //定义好有哪些属性，没定义的，及时返回也拿不到
    messages: Annotation({
        //每一个节点的，message属性，都会经过reducer方法的处理才给到下一个节点
        reducer: (x, y) => {
            console.log(x, y, "ante") // x是前一个，y是后一个
            return [...x, ...y]
        },
        default: () => undefined
    })
})
```

### 步骤二：实例化 StateGraph 空白图
* **解释**：传入刚刚定义的 `MyState` 作为状态骨架，创建一个没有任何节点和边的空白图。
* **核心代码**：
```javascript
//2.创建一个图，只不过这个时候是空白的
const graph = new StateGraph(MyState)
```

### 步骤三：添加 Node（节点）
* **解释**：使用 `.addNode` 往图里加入业务步骤。每一个节点都是一个接收当前 `state` 和 `config` 对象的异步/同步函数，并返回需要更新到 `state` 中的部分数据。
* **核心代码**：
```javascript
graph
    //addNode——添加节点，把你的步骤都作为节点加进去
    .addNode("node1", (state, config) => {
        //节点的具体代码逻辑
        console.log('node1', state.messages, config.configurable.a);
        return {
            messages: 0.8,

        }
    })
    .addNode("node2", (state, config) => {
        console.log('node2', state.messages, config.configurable.a);
        return {
            messages: "我是node2的结果"
        }
    })
    .addNode("node3", (state, config) => {
        console.log('node3', state.messages, config.configurable.a);
        return {
            messages: "我是node3的结果"
        }
    })
```

### 步骤四：添加 Edge（边）与 Conditional Edge（条件判断边）
* **解释**：
  * **普通边（addEdge）**：声明确定的步骤顺序。LangGraph 内置了两个固定的节点常量：`__start__`（入口点）和 `__end__`（出口点）。
    * `_end_`可以不用写
  * **条件边（addConditionalEdges）**：在某个节点结束后挂载一个判断函数（Router），函数返回下一个要执行的目标节点名称。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/demo1.js:45-56
    //addEdge-连接两个节点，其实等于某一步之后下一步是哪
    //内置，__start__开始点，__end__结束点，这是图里自带的，不需要添加，一定存在
    .addEdge("__start__", "node1")
    // .addEdge("node1", "node2")
    .addEdge("node2", "node3")
    .addConditionalEdges("node1", (state, config) => {
        if (state.messages > 0.5) {
            return "node2"
        } else {
            return "__end__"
        }
    })
```

### 步骤五：编译图（Compile）
* **解释**：编译流程，将设计好的图（Graph）转化为可被执行的可运行对象（Runnable）。
* **核心代码**：
```javascript
//编译-把图编译了
const app = graph.compile()
```

### 步骤六：运行执行（Invoke）与配置参数
* **解释**：通过 `app.invoke` 传入初始 `State` 和运行时的 `Config`。
  * **recursionLimit**：最多执行次数（递归上限限制）。对于包含循环路由的 Agent，这个限制极其关键，能有效防止程序进入无限死循环消耗 Token。
  * **configurable**：可用于跨节点、跨组件传递自定义配置或上下文（如用户 `userId`、`apiKey` 等全局参数）。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/demo1.js:61-77
//执行编译后的结果
const result = await app.invoke(
    {
        messages: "开始"
    },
    {
        //配置文件-有两个最关键的

        //最多执行次数
        recursionLimit: 20,
        configurable: {
            //自定义配置-这里面可以随便写东西，
            //比如说用户的id,apiKey
            a: 12312
        }
    })
console.log('result', result);
```



### 费曼

LangGraph 解决传统链不能分支、不能循环的问题。

1. 先用 **Annotation** 定义 state 结构，reducer 控制数据合并。
2. 创建 **StateGraph**。
3. 用 **addNode** 添加步骤节点。
4. 用 **addEdge** 连接固定流程，**addConditionalEdges** 做条件判断。
5. **compile** 编译。
6. **invoke** 运行，传入 state 和 config。

---

## 4. 实战进阶：大模型 + 自定义工具的 ReAct 循环架构

在真实的 Agent 场景中，最经典的应用就是 **ReAct（Reasoning + Acting，推理+执行）** 架构。
大模型如果发现用户的意图需要使用工具，就输出一个工具调用请求；程序捕获此请求，执行对应工具，将工具返回的结果再次追加到消息中喂给大模型；直到大模型推理出最终答案。

以下是实现完整的“大模型 + 工具调用循环架构”的五大步骤：

### 步骤一：使用 tool 与 zod 定义自定义工具
* **解释**：在 `@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/tools.js` 中，通过 LangChain 的 `tool` 方法和 Zod 库定义具体可调用的工具、描述和入参限制，以便让模型能够识别并生成结构化参数。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-11 langGraph的使用/code/tools.js:4-17
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
```

### 步骤二：准备模型绑定工具，并基于内置 MessagesAnnotation 初始化图
* **解释**：
  * **模型工具绑定**：大模型需要通过 `bindTools` 方法感知到这些工具的存在。
  * **MessagesAnnotation**：LangGraph 内置的状态结构。它默认定义了图中的 `messages` 数组，且自带一套合并逻辑：它会将**每个节点**返回的单个/多个 message 对象（`HumanMessage`、`AIMessage`、`ToolMessage`）自动追加 push 到原有的消息数组中，这在大模型多轮交互、工具调用场景中是非常标准的消息历史流。
* **核心代码**：
```javascript
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
const tools = [customCalc];
// 2,将工具绑定到模型，让模型知道它可以调用这些工具
const modelWithTools = model.bindTools(tools);
// 3. 构建图
// MessagesAnnotation 是 LangGraph 内置的结构
// 他定义state里有messages，并且messages会把消息固定的push在一个数组里这样message就可以作为整个消息记录
// 用大白话解释就是，把每个节点的就结果放在一个数组里
// MessagesAnnotation会把你的return包装为humanMessage或者AIMEssage或者ToolMEssages
const workflow = new StateGraph(MessagesAnnotation)
```

### 步骤三：编写 Agent 节点逻辑与 Tool 节点
* **解释**：
  * **toolNode（执行节点）**：LangGraph 内置了 `ToolNode` 工具，只需传入定义的工具数组 `tools`，它就会自动作为一个执行节点，拦截并解析上一步模型生成的 `tool_calls` 结构并自动去触发、运行对应工具，且将结果包装成 `ToolMessage` 自动更新到状态中。
* **核心代码**：
```javascript
// 4. 编写节点逻辑 节点的代码有点多了，不直接写，先封装为方法
// agent节点-调用大模型
//__Start_-》agents
async function callModel(state) {
    // 获取对话历史中的最新消息-里面包含用户的提问
    const messages = state.messages;
    // 调用模型
    const response = await modelWithTools.invoke(messages);
    // 返回模型生成的回复（可能包含调用工具的指令）
    return { messages: [response] };
}

// tool节点-执行工具
// 执行工具不用写，langGraph里自带了ToolNode，让我们更方便定义工具执行节点
const toolNode = new ToolNode(tools);
```

### 步骤四：编写条件判断分支路由
* **解释**：在 `agent` 节点执行完后，程序通过 `shouldContinue` 条件分支函数进行路由：
  1. 提取当前 `state.messages` 数组中最后一个消息（即大模型刚刚返回的 AI 消息）。
  2. 检查其中是否存在 `.tool_calls`。
  3. 如果存在工具调用，则返回节点名称 `"tools"`（走向工具执行）；否则说明大模型已完成答复，返回 `"__end__"`（直接结束）。
* **核心代码**：
```javascript
// 5. 定义判断节点
// 大模型返回了工具就到工具节点，否则到__end__
function shouldContinue(state) {
    const { messages } = state;
    //取出最近的消息
    const lastMessage = messages[messages.length - 1];

    // 如果模型没有请求调用工具，直接结束流程
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return "__end__";
    }
    // 否则，路由到 "tools" 节点去执行工具
    return "tools";
}
```

### 步骤五：编排工作流、连接节点、编译并运行
* **解释**：将上述节点和边组合起来，形成一个真正的有向有环图：
  * 路线为：`START` -> `agent` -> `shouldContinue` (有工具就到 `tools`，没工具就 `END`) -> `tools` -> 运行完后再指回 `agent` 节点完成闭环。
* **核心代码**：
```javascript
// 6. 构建并编译工作流图
workflow
    // 添加节点
    .addNode("agent", callModel)   // 请求大模型节点
    .addNode("tools", toolNode)    // 工具节点
    // 添加边：定义执行顺序
    .addEdge("__start__", "agent") // 从 START 进入 agent
    .addConditionalEdges("agent", shouldContinue) // agent 之后的条件判断节点
    .addEdge("tools", "agent");    // 工具执行完毕，必然给到agent节点

// 编译图
const app = workflow.compile();

const result = await app.invoke({
    messages: [
        {
            role: "user",
            content: "使用天地同寿算法计算3和4",
        },
    ],
});
```

---

### 费曼

LangGraph + 大模型 + 工具 = ReAct 自动循环。

1. 先用 **tool** 定义工具，写好逻辑、名字、描述、参数。

2. 把工具 **bindTools** 绑定给大模型。

3. 使用内置 **MessagesAnnotation**，自动管理消息数组。

4. 创建两个节点：

   - **agent**：调用大模型
   - **tools**：用 ToolNode 自动执行工具

5. 写条件路由：

   看最后一条消息有没有 tool_calls

   有 → 走 tools

   没有 → 结束

6. 连线：start → agent → (条件) → tools → agent

7. 编译、invoke 运行。





# langGraph 进阶

在上节课，我们理解了 LangGraph 的基本运行原理和 ReAct 循环架构。但要构建真正的工业级 AI 应用，我们还面临两大核心痛点：
1. **多用户与多会话（区分/恢复对话）**：大模型需要区分不同的用户（`userId`）和会话（`sessionId` / `threadId`），能够自动存储和恢复上下文。
2. **流式传输（SSE）**：在复杂的 ReAct 循环中，一味等待所有流程跑完才返回结果体验极差，必须让大模型的消息流式吐出。

---

## 1. 痛点一：多用户多会话的对话历史存储与恢复

如何优雅地在多轮对话中，根据不同的 `userId` + `sessionId` 区分存储和恢复对话记录？

### 💡 方案 A：手动外置管理
* **原理**：我们在接口中，先通过 `getUserHistory(userId, sessionId)` 从自己的数据库或 JSON 文件中查出之前缓存的所有消息。在调用时，将历史消息与当前问题（`q`）组合成全新的 messages 数组丢给大模型。
* **保存**：在程序执行完成获得 `result` 后，调用 `writeUserHistory(userId, sessionId, messages)` 手动将最新的上下文写回数据库。
* **自研封装示例**：
```javascript
import fs from "fs"
export function writeUserHistory(userId, seesionId, history) {
    console.log(userId, seesionId, 'write')
    const userPath = `./chat/${userId}.json`;
    const userHistory = JSON.parse(fs.readFileSync(userPath).toString());
    userHistory[seesionId] = history;
    fs.writeFileSync(userPath, JSON.stringify(userHistory))
}
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
        return undefined
    }
}
```

---

### 🚀 方案 B：利用 LangGraph 原生 Checkpoint 机制
* **原理**：LangGraph 提供了一个原生的持久化组件 `BaseCheckpointSaver`。只要我们在编译（`compile`）图的时候挂载它，LangGraph 在运行过程中就会**全自动管理状态的保存和恢复**，不需要我们每次手动转换和拼接。
* **步骤**：
  1. 继承 `BaseCheckpointSaver` 编写自定义的持久化类。
  2. 实现核心的 `put` 保存检查点和 `getTuple` 查询恢复检查点这两个核心方法。
  3. 在图编译时配置 `checkpointer`。
  4. 每次 `invoke` 或 `stream` 运行图时，在第二个参数中传入包含 `userId` 和 `sessionId` 的 `configurable` 上下文。

#### 核心步骤与实现：

#### 步骤一：创建自定义 Checkpoint 持久化类并实现 put 方法
* **解释**：`put` 方法是在图的每一个步骤（Node）运行完成时被**自动触发调用的**如同hook一样。在这里，我们解析 `config.configurable` 里的 `userId` / `sessionId`，并把传入的最新 `writes`（里面包含最新对话状态）以及 `metadata` 写入到硬盘或数据库。
  * 解释`writes`包括整个历史记录（里面包含最新对话状态）
    * 理由：因为const workflow = new StateGraph(MessagesAnnotation)----自己去看这个的作用 [点击跳转](# 步骤二：准备模型绑定工具，并基于内置 MessagesAnnotation 初始化图)
* **核心代码**：
```javascript
export class FileSystemSaver extends BaseCheckpointSaver {
    constructor() {
        super();
    }

    writeUserHistory(userId, seesionId, history) {
        console.log(userId, seesionId, 'write')
        const userPath = `./chat/${userId}.json`;
        const userHistory = JSON.parse(fs.readFileSync(userPath).toString());
        userHistory[seesionId] = history;
        fs.writeFileSync(userPath, JSON.stringify(userHistory))
    }

    getUserHistory(userId, seesionId) {
        const userPath = `./chat/${userId}.json`;
        const isExist = fs.existsSync(userPath)

        if (isExist) {
            const userHistory = JSON.parse(fs.readFileSync(userPath).toString());
            const seesionHistory = userHistory[seesionId] || {};
            return seesionHistory;
        } else {
            fs.writeFileSync(userPath, JSON.stringify({
                [seesionId]: {}
            }))
            return undefined
        }
    }

    // 1. 保存检查点（必需实现）
    async put(config, writes, metadata) { // writes时当前执行的结果
        console.log("put", config)
        const userId = config.configurable.userId;
        const sessionId = config.configurable.sessionId;
        this.writeUserHistory(userId, sessionId, { // 这个对象一定要有checkpoint和metadata这个两个属性
            checkpoint: writes,
            metadata: metadata 
        })
        return {
            configurable: {
                userId: userId,
                sessionId: sessionId,

            }
        };
    }
```

#### 步骤二：实现 getTuple 读取恢复方法
* **解释**：当外部调用图时，LangGraph 会**最先**触发 `getTuple`。我们依据参数中的用户身份获取之前的 `checkpoint` 对象和 `metadata`，以指定的 tuple 格式返回，LangGraph 就会自动帮我们灌入之前的对话历史；如果是空，返回 `undefined` 则代表**开启全新对话**。

  *  getTuple只执行一次，在addNode的`_start_`前执行一次且把下面的东西返回给第一个addNode，put这时也会执行，当addNode时不会执行，而put会，

    ```js
                return {
                    config: {
                        configurable: {
                            userId: userId,
                            sessionId: sessionId  // "1f13b09e-48a7-6661-8003-9f79c0e03a20"
                        }
                    },
                    checkpoint: checkpoint,  // 你的完整 checkpoint 对象-就是我们的对话记录
                    metadata: history.metadata,      // { source: "loop", step: 3, ... 
                };
    ```

    

* **核心代码**：
```javascript
export class FileSystemSaver extends BaseCheckpointSaver {
    。。。。。
    // 2. 获取检查点（必需实现）- 返回 tuple 格式
    async getTuple(config) {
        //根据用户id查询到之前的记录，继续回复对话，如果不存在就是新对话
        const userId = config.configurable.userId;
        const sessionId = config.configurable.sessionId;

        const history = this.getUserHistory(userId, sessionId)
        const checkpoint = history?.checkpoint // 只要你用来checkpoint方案，那里面就会有这个
        if (checkpoint) {
            //已经存在的对话
            return {
                config: {
                    configurable: {
                        userId: userId,
                        sessionId: sessionId  // "1f13b09e-48a7-6661-8003-9f79c0e03a20"
                    }
                },
                checkpoint: checkpoint,  // 你的完整 checkpoint 对象-就是我们的对话记录
                metadata: history.metadata,      // { source: "loop", step: 3, ... 
            };
        } else {
            //新对话。return undefined
            return undefined;
        }
    }
```

#### 步骤三：编译图时挂载 checkpointer 并传入运行时配置
* **解释**：编译时把我们的自定义持久化实例 `checkpointer` 挂载进去，随后调用时必须配置对应的上下文。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-12 langGraph进阶/code/utils/getGraph.js:52-55
    const checkpointer = new FileSystemSaver();
    return workflow.compile({
        checkpointer: checkpointer
    });
```

### 相对方案A，方案B的不足就是存储的数据没有方案A好看，以及不支持写入格式自定义

```js
方案B结构
{
    "s02": { //s02就是自己写的session_id
        "checkpoint": {
            "v": 4,
            "id": "1f13b239-a4b0-6d21-8006-b67ebd59f087",
            "ts": "2026-04-18T12:39:12.370Z",
            "channel_values": {
                "messages": [
                    {
                        "lc": 1,
                        "type": "constructor",
                        "id": [
                            "langchain_core",
                            "messages",
                            "HumanMessage"
                        ],
                        "kwargs": {
                            "content": "你好",
					。。。。。。
        },
        "metadata": {
            "source": "loop",
            "step": 6,
            "parents": {}
        }
    }
}
```

- 对应的是put里面的

  ```js
  this.writeUserHistory(userId, sessionId, { // 这个对象一定要有checkpoint和metadata这个两个属性
              checkpoint: writes,
              metadata: metadata 
          })
  ```

  

---

### 🙋‍♂️ 费曼总结（对话存储）

要让大模型记住你，有两种方法：
1. **备忘录法（外置方案 A）**：每次你跟大模型聊完，你都用小本本把所有聊天记录（Messages 数组）记下来存在文件里。下次聊天前，我先把本子的记录和新问题合在一起给它。缺点是这个小本本必须由你自己写逻辑去翻阅、去重新整合，比较麻烦。
2. **专属管家法（Checkpoint Saver 方案 B）**：写一个“专属管家”（实现 `BaseCheckpointSaver` 里的 `put` 和 `get`）。
   - **管家帮你记**：大模型每答完一句话（每一个 node 执行完毕），管家会自动触发 `put` 方法，在管家自己管理的档案夹里记账，这个账单被称为 `writes`。而且，`MessagesAnnotation` 会自动将前后的对话历史整合追加到 `writes` 状态中。
   - **管家帮你查**：每次你一找大模型聊天，管家会在你说话之前最先触发 `getTuple` 方法，立马把你的老底档案翻出来塞到大模型的记忆里。你作为开发者，只需要指定“谁和谁聊天”（在 `config.configurable` 里传入 `userId` + `sessionId`）即可，全程不劳你费心！

---

## 2. 痛点二：SSE 流式传输（Stream）高阶实战

### 🛠️ 三层改造步骤

#### 步骤一：底层改造大模型调用节点为流式（stream 与 chunk 合并）
* **解释**：在编写 `agent` 节点逻辑时，不要再使用模型的 `model.invoke()`，而是改用底层的 `modelWithTools.stream(messages)` 拿到流。通过 `for await` 遍历流的 `chunk`。由于 LangGraph 后续节点需要感知大模型的**完整**消息（比如包含完整的 `tool_calls` 参数进行判断），我们在内部利用 `concat` 自动进行 chunks 实时合并拼装，最后返回包含了完整响应的 state 状态对象。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-12 langGraph进阶/code/utils/getGraph.js:19-32
    async function callModel(state) {
        const messages = state.messages;
        const stream = await modelWithTools.stream(messages);
        let fullResponse = null
        for await (const chunk of stream) {
            if (!fullResponse) {
                fullResponse = chunk;
            } else {
                // 合并 chunks
                fullResponse = fullResponse.concat(chunk);
            }
        }
        return { messages: [fullResponse] };
    }
```

#### 步骤二：条件路由节点（shouldContinue）基于合并后的完整 tool_calls 进行决策
* **解释**：由于底层 `callModel` 已经使用 `concat` 完成了对碎 token 流的蓄水和合并，此时传入条件边的 State 就已经包含了含有**完整且有效 `tool_calls` 参数**的 AI 消息。
  * **作用**：如果没做步骤一的合并，在大模型流式输出工具调用指令时，`lastMessage` 拿到的仅仅是最后一个极碎的碎片，是不可能含有 `.tool_calls` 参数的，这会导致条件判断失效而直接走向 `__end__`（甚至发生崩溃）。通过在步骤一将 `tool_calls` 拼装完整，步骤二的 `shouldContinue` 就可以顺利提取它，做出是走向工具执行（`tools`）还是退出的路由决策。
* **核心代码**：
```javascript
@c:/Users/MJL/Desktop/ai学习/ppt和源码/5-12 langGraph进阶/code/utils/getGraph.js:36-43
    function shouldContinue(state) {
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
            return "__end__";
        }
        return "tools";
    }
```

#### 步骤三：顶层接口层调用 app.stream，设置 streamMode 为 messages
* **核心代码**：

```json
./utils/getGraph.js
export function getGraph() {
    const model = new ChatOpenAI({
	。。。。。。
    const tools = [customCalc];
    const modelWithTools = model.bindTools(tools);
    const workflow = new StateGraph(MessagesAnnotation);
    workflow
        .addNode("agent", callModel)
		。。。。
    return workflow.compile({
        checkpointer: checkpointer
    });
}
```



```javascript
import { getGraph } from "./utils/getGraph.js";
const app = getGraph();
expressApp.get("/llm", async (req, res) => {
    try {
        const { q, userId, sessionId } = req.query;
		// 设置 SSE 响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream;charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        //根据id先查找记录
        // const history = getUserHistory(userId, sessionId)
        const stream = await app.stream(
            {
                messages: [
                    // ...mapStoredMessagesToChatMessages(history),
                    {
                        role: "user",
                        content: q,
                    },
                ],
            },
            {
                configurable: {
                    userId,
                    sessionId
                },
                streamMode: 'messages'
            }
        );
        const arr = []
        // 遍历流式输出
        for await (const chunk of stream) {
            arr.push(chunk);
            // arr.push(lastMessage);
            if (chunk[0].content) {
                res.write(`data: ${chunk[0].content}\n\n`);
            }
        }
        fs.writeFileSync("./a.json", JSON.stringify(arr))
        // 发送结束信号
        res.write(`data: [DONE]\n\n`);
        res.end();
```

**解释**：

* 我们开启 Express 服务的 SSE 响应头。
* 在图执行时，调用编译好后的 `app.stream(...)`，指定模式为 `'messages'`。
* **💡 深度解析：什么是“流输出的颗粒度聚焦在消息内容”？**
  在 LangGraph 中调用 `app.stream()` 时，可以设置不同的 `streamMode`（流式输出模式），它们代表了完全不同的输出“颗粒度”：
  1. **`streamMode: "values"` (状态值级颗粒度)**：
     * *特点*：每次图中有任何节点执行完毕更新了状态，它都会把**当前完整的、包含所有历史聊天记录的 State 对象**全部流式吐出来。
     * *痛点*：在前端做流式打字机时，我们只需要“最新蹦出来的一个字”，如果是 `values`，前端每次都会收到一个包含几十条历史消息的巨大数组，前端需要自己写极其复杂的算法去对比前后两次大数组，过滤并计算出最新吐出的字符是哪个，冗余巨大、非常痛苦。
  2. **`streamMode: "updates"` (节点更新级颗粒度)**：
     * *特点*：每次有节点执行完毕，它只流式吐出**当前节点所返回的局部更新数据**，比如格式为 `{ agent: { messages: [AIMessage] } }`。
     * *痛点*：它需要等单个节点（如 agent）全部执行完毕后才会一次性吐出更新，且数据格式包裹了节点名称，依然不够细，无法做到丝滑的“单字实时蹦出”打字机效果。
  3. **`streamMode: "messages"` (消息内容级最细颗粒度)**：
     * *特点*：这是专为聊天和流式打字机设计的**微观消息级流式**。一旦底层的 `callModel` 内部大模型有任何一个 Token（单字）产生，顶层就会**立刻、实时地**抛出一个极细的消息片段（Message Chunk），格式类似 `[ AIMessageChunk { content: "你" } ]`。
     * *优势*：它自动隐去了工具执行等无关节点的中间状态，把大模型流式输出直接桥接到了最外层，前端不需要做任何复杂的差量对比，直接提取并监听 `chunk[0].content` 即可获得即时的打字机字符，极大地简化了 SSE 接口的开发逻辑。
* 遍历整个图在运行中抛出的 `stream` 迭代器，如果是大模型吐出的内容（`chunk[0].content`），实时用 `res.write` 吐给前端，并以 `[DONE]` 作为结束信号。







# AI实战项目

这类项目对面试最有价值的能力点主要有 5 个：

- 知道 CLI 程序不是只有 `console.log`，而是有输入、输出、状态、生命周期。
- 知道配置读取要分层，不能把 `apiKey` 写死在代码里。
- 知道为什么要把 `utils`、`request`、`app` 分开，而不是全部堆在一个文件。
- 知道为什么对话历史要持久化，否则进程一关上下文就没了。
- 知道终端输出也值得封装，因为后面会牵涉颜色、Markdown、报错提示和优雅退化。

## AI协作规则文件怎么设计

规则文件的作用，不是替你写业务代码，而是提前约束 AI 的行为边界，比如模块规范、技术栈、输出风格和安装依赖的方式。

- 全局规则适合放“长期不变”的原则，比如代码风格、默认语言、常用工具。
- 项目规则适合放“当前仓库独有”的事实，比如技术栈、目录结构、模块职责。
- 规则文件写的是原则和约束，不应该写成超长施工单。
- 好提示词的本质是“约束清楚 + 输出目标明确”，不是越长越好。

常见形式有两类：

- `~/.codex/AGENTS.md`：用户级全局规则，适用于所有项目。
- 仓库根目录的 `AGENTS.md`：项目级规则，只对当前仓库生效。

如果用其他 AI IDE，比如 Windsurf，也可以有类似规则文件。重点不是工具名，而是理解一件事：规则文件是给 AI 提前灌入上下文，减少每次重复解释项目背景。

## 第一节课的 6 个模块

### 1. 路径工具模块（`src/utils/pathUtils.js`）

**一句话作用：**
统一封装“用户家目录”和“当前工作目录”的获取方式，避免路径逻辑散落在业务代码里。

**我学到的点：**

- `os.homedir()` 取的是当前系统用户的家目录。
- `process.cwd()` 取的是当前 Node 进程启动时所在的工作目录。
- 家目录和当前启动目录不是一回事，很多新手会混掉。

**为什么这样设计：**

- 路径相关逻辑虽然简单，但属于基础能力，抽成工具函数后更容易复用。

- 业务代码只关心“我要家目录”还是“我要当前项目目录”，不用每次都去记原生 API。

  - 同时使用时有使用说明(悬浮getUserHomeDir就会有)

    ```js
    /**
     * 获取当前系统用户主目录的绝对路径。
     *
     * @returns {string} 当前系统用户主目录绝对路径。
     */
    export function getUserHomeDir() {
    ```

- 不能写死 Windows 路径，否则代码一换机器就废。

### 2. 终端日志与 Markdown 渲染模块（`src/utils/logger.js`）

**一句话作用：**
把终端输出统一封装成一个日志层，既能打印彩色普通文本，也能渲染 Markdown。

**我学到的点：**
- CLI 输出不是越花越好，重点是统一入口，方便控制样式和错误提示。
- 普通文本输出和 Markdown 渲染输出应该分层，不要混成一个函数。
- `chalk` 负责颜色，`marked` + `marked-terminal` 负责把 Markdown 变成终端友好的文本。

**为什么这样设计：**
- 如果以后想改主题色、改输出风格，只改日志层就行。
- AI 返回的内容经常带标题、列表、代码块，直接 `console.log` 可读性会很差。
- 优雅退化很重要，颜色不支持、渲染失败时也不能把程序搞崩。

### 3. 欢迎页模块（`src/utils/init.js`）

**一句话作用：**
负责 CLI 启动时的欢迎展示和操作提示，让用户一进入程序就知道怎么用。

**我学到的点：**

- **欢迎页属于体验层，不属于业务逻辑。**
- 展示逻辑单独抽模块后，**主程序入口会更干净**。

**为什么这样设计：**

- `app.js` 应该负责流程控制，而不是同时负责排版和展示文案。
- 欢迎页以后可能会扩展版本号、环境信息、快捷命令，这些都适合单独维护。

**面试怎么说：**
我会把欢迎页单独抽成初始化展示模块，因为它本质上是产品体验层，不是业务流程本身。这样主控制器只负责串联流程，展示相关的内容由专门模块维护，职责会更清晰。

### 4. 历史记录持久化模块（`src/utils/fsHandle.js`）

**一句话作用：**
在用户退出时，把本次对话历史保存到本地文件，保证可追溯、可恢复。

**我学到的点：**
- 聊天程序如果不持久化，对话上下文只存在内存里，进程一关就没了。

- 用 `projectName` 分目录保存历史，可以把不同项目的会话隔离开。

- `JSON.stringify(data, null, 2)` 的重点不是语法本身，而是让历史文件可读、可检查。

  - 第二个参数有稀释作用

  - 第三个是分隔符

    查看链接https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify （mdn里面有）

- 用时间戳当文件名，因为只有当用户取消对话才会写入，而不是问一句就写入

  ```js
  const fileName = `${Date.now()}.json`;
  const filePath = path.join(projectHistoryDir, fileName);
  const serializedData = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, serializedData, "utf-8");
  ```

  

**容易踩的坑：**

- 只写文件，不先递归创建目录，会直接报错。

  ```js
  fs.mkdirSync(projectHistoryDir, { recursive: true });
  创建目录（fs.mkdir）
  不加 recursive: true：只能创建最后一级文件夹，上级不存在就报错
  加 recursive: true：内部自动递归向上创建所有缺失父目录，这才是自带递归的 API
  ```

- 不做错误兜底会让“保存历史失败”反过来把主程序带崩。



### 5. 配置读取与模型请求模块（`src/request/index.js`）

**一句话作用：**
统一负责读取配置、创建 OpenAI 客户端、发起模型请求，并把错误转成用户可读的提示。

**我学到的点：**
- 配置读取要做级联：项目级优先，全局级兜底。

  - **配置级联 = 多层配置由高优先级覆盖低优先级，项目配置优先生效，全局配置当默认兜底，缺失的字段自动用全局补上。**

    #### 层级优先级（从高到低）

    1. **项目级配置（最高）**：当前这个项目文件夹里的配置（如 `.projectrc`、`package.json` 配置、本地 config）
    2. **全局级配置（兜底 / 最低）**：电脑用户目录下的全局配置（`~/.xxxrc`，所有项目共用）

- 请求层应该独立于主程序，否则 `app.js` 会同时承担配置、网络、错误处理三种职责。
- 模型请求失败时，不能把底层异常原样扔给用户。

**为什么这样设计：**

- 项目级配置优先是为了让不同项目可以使用不同模型或不同接口。
- 全局配置兜底是为了减少重复配置成本。
- 配置缺失时应该给友好提示，而不是直接让程序崩掉，因为用户最需要的是“知道缺了什么”。

**容易踩的坑：**
- 把 `apiKey` 写死在代码里，既不安全也不利于切环境。
- 只读取一个固定路径，导致项目配置和全局配置无法共存。
- 请求层不兜底，主程序就会充满 `try...catch` 和各种分支。

**面试怎么说：**
我会把配置读取和模型请求抽成单独请求层。这样上层只需要知道“怎么发消息、怎么拿结果”，而不用关心配置文件从哪来、客户端怎么初始化、异常怎么转换成用户能理解的提示信息。

### 6. 主程序控制模块（`src/app.js`）

**一句话作用：**
作为 CLI 应用的主控制器，负责把输入、请求、输出、退出和历史落盘串起来。

**我学到的点：**
- `app.js` 最核心的职责是流程编排，而不是具体实现某个底层能力。
- `messages` 必须集中维护，因为它是整次会话的上下文状态。
- 异步 CLI 程序最怕两件事：状态丢失和重复关闭。

**为什么这样设计：**
- `readline` 负责接收用户输入，`ora` 负责加载态，`request` 层负责拿回复，`logger` 负责渲染输出，这样职责分工最清楚。
- 用户每问一次都要把 `user` 和 `assistant` 消息一起推进 `messages`，否则上下文就断了。
- 正常退出、`Ctrl + C`、未捕获异常都应该走统一的收尾逻辑，避免历史漏存或重复存。

**容易踩的坑：**
- 在多个地方分别维护会话数组，最后很容易出现上下文不一致。
- 关闭逻辑没有防重，可能触发多次 `close` 或多次写历史。
- 只考虑正常退出，不考虑异常退出，会让真实使用时的数据经常丢失。

**面试怎么说：**
我会把 `app.js` 设计成一个主控制器，专门做流程编排。它不负责具体的日志渲染和 API 请求细节，而是负责把用户输入、模型响应、会话状态、退出清理这些环节按正确顺序组织起来，这样代码才有扩展性。

## 这类项目面试最容易被问什么

**1. 为什么要把项目拆成 `utils`、`request`、`app` 三层？**
因为这三层的变化频率和职责完全不同。`utils` 是基础能力，`request` 是外部依赖接入层，`app` 是流程编排层。分开之后更容易维护、测试和替换。

**2. 为什么配置文件要做项目级优先、全局级兜底？**
因为项目可能有自己的模型和接口要求，但用户又不想每个项目都重复配置，所以最合理的方式就是局部覆盖全局。

**3. 为什么不能把 `apiKey` 写死在代码里？**
因为这既不安全，也不利于多环境切换。配置应该外置，代码只负责读取和使用。

**4. 为什么日志模块要支持优雅退化？**
因为终端能力和第三方库都有不确定性。输出效果变差可以接受，但不能因为渲染失败影响主流程。

**5. 为什么历史记录要按项目分目录保存？**
因为会话记录本质上是项目上下文的一部分。按项目隔离后更容易查找、调试和恢复。

**6. 为什么异步 CLI 程序要统一处理退出逻辑？**
因为只要退出路径一多，就容易出现重复关闭、历史漏存、状态不一致这些问题。统一收口能明显降低风险。







# vscode中代码补全

### 如何使用continue

- 配置问题，不是大模型问题
  - baseurl直接拿官网首页的配置，而不是具体页面的配置（因为可能过期了）

### 代码自动补充，不需要在.yaml配置context，因为context只是给你聊天修改bug使用

- 代码自动补充，会依照你当前文件上面内容，补充的





