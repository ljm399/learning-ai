# 2-5 RAG本地知识库

**RAG** 全称：**Retrieval-Augmented Generation**

中文：**检索增强生成**

## 1. 读取文档为字符串

### 步骤

1. 将本地知识库文件放到 `code/server/doc/` 目录
2. 读取 `doc/` 目录所有文件，逐个读取为字符串

### 解释

RAG 的“知识来源”通常是：公司文档、产品说明、FAQ、制度流程等。第一步是把这些文件读成纯文本，方便后续切分与向量化。

- 要是不向量化，每次提问都要携带巨量的system上下文，会消耗巨量token

#### 读取文档的现实情况（对应图片“读取文档”）

本项目为了把流程讲清楚，直接把 `doc/` 目录里的文件当作 **txt** 用 `fs.readFileSync` 读入并 `toString()`。

但在真实工作中，资料经常是：Word、Excel、PDF、网页等，读取通常不能只靠 `fs`，需要用对应的解析库/loader 把内容提取成“纯文本”。

本项目当前代码侧体现的是：

- **先把文档转成可切分的纯文本**（无论来自哪种格式）
- 后续切分、向量化、入库、检索的流程不变

### 代码（核心）

文件：`code/server/utils.js`

```js
export async function readFileToText(path) {
    const result = fs.readFileSync(path)
    return result.toString();
}

export async function readDocToText() {
    const dirInfo = fs.readdirSync("./doc")
    const docArr = []
    for (let i = 0; i < dirInfo.length; i++) {
        const filename = dirInfo[i];
        const filepath = "./doc/" + filename
        const fileText = await readFileToText(filepath);
        docArr.push(fileText);
    }
    return docArr;
}
```

## 2. 切割文档内容（Chunking）

### 步骤

1. 对每个文档文本进行切分，得到多个 chunk
2. chunk 之间保留 overlap（重叠），避免上下文断裂导致检索命中但信息不完整

### 解释

向量检索的粒度一般不是“整篇文档”，而是“小段文本”。

- chunk 太大：检索不够精确、embedding 成本高
  - embedding向量化

- chunk 太小：信息不足、回答容易缺上下文
- overlap：让 chunk 之间共享一部分文本，提升召回与可读性

#### 切割方案（对应图片“切割方案”）

- **方案 1：固定长度硬切（不推荐）**
  - 做法：比如每 200 个字符切一刀。
  - 问题：很容易把一句完整语义从中间切断，导致检索命中了但读起来断裂，模型也更难正确理解。

- **方案 2：使用文本切割库（推荐）**
  - 本项目使用：`@langchain/textsplitters` 的 `RecursiveCharacterTextSplitter`。
  - 思路：
    - 用 `separators` 指定“优先切分点”（先按段落/换行，再按标点、空格等）。
    - 配合 `chunkOverlap`，最大程度保证语义完整，同时避免边界信息丢失。

### 代码（核心）

文件：`code/server/utils.js`

```js
export async function splitDoc(docText) {
    const spliter = new RecursiveCharacterTextSplitter({
        chunkSize: 50,
        chunkOverlap: 20,
        separators: ["\n\n", "\n", ".", "。", ",", "，", " ", "但是", "."]
    })
    const chunks = await spliter.splitText(docText);
    return chunks;
}
```

#### chunkSize / chunkOverlap 详细解释

#### 类比理解（更直观）

- **把文档想成一本书**
  - **chunkSize** 就像“每页放多少字”（页大小）。页太大：翻一页信息多但找重点慢；页太小：翻页频繁，内容容易看不全。
  - **chunkOverlap** 就像“每页底部重复印上一页最后几行”（续页提示）。这样即使一句话跨页，也不会断掉。

- **把文档想成切面包**
  - **chunkSize** 是“每片面包的厚度”。太厚：一片里混了太多内容；太薄：一片不够吃（信息不够）。
  - **chunkOverlap** 是“相邻两片之间故意留一点重叠区域”。虽然会有重复，但能保证你不会把夹心/关键部分恰好切断。

- **chunkSize: 50**
  - 含义：每个 chunk 的“目标长度”。在 `RecursiveCharacterTextSplitter` 里，这个长度单位**按字符（character）计**（不是 token）。
  - 作用：决定了向量库里一条记录承载多少上下文。
  - 影响：
    - chunkSize **更大**：
      - 优点：单条检索命中时上下文更完整。
      - 缺点：embedding 成本更高；检索粒度变粗（可能一大段里只有一小句相关，也会整段带进 prompt，浪费上下文窗口）。
    - chunkSize **更小**：
      - 优点：检索更精确，带入 prompt 的噪音更少。
      - 缺点：容易出现“命中但不够用”，答案缺前因后果。

- **chunkOverlap: 20**
  - 含义：相邻 chunk 之间**重复/重叠**的字符数量。
  - 作用：防止关键信息刚好落在两个 chunk 边界处，导致任一 chunk 都“上下文不完整”。
  - 直观例子：
    - chunk1 覆盖字符 `[0..49]`
    - chunk2 覆盖字符 `[30..79]`（与 chunk1 重叠 20 个字符）
  - 代价：重叠会带来一定的“重复存储/重复检索”，但通常能显著提升可用性。

- **为什么 overlap 能救命（再举个句子跨边界的例子）**
  - 假设原文有一句话：`“请假需要提前 1 天在系统提交申请，并抄送直属主管。”`
  - 如果硬切导致 `“并抄送直属主...”` 被切到下一段，第一段缺结尾，第二段缺开头。
  - 有 overlap 后，第二段会“带上”第一段末尾的一部分字符，更容易让模型读到完整句子。

- **如何调参（经验）**
  - 文本较短、信息密度高（FAQ/制度条款）：chunkSize 可以偏小（更精准）。
  - 文本较长、叙述性强（教程/长文档）：chunkSize 可以适当增大，overlap 也可以略增，避免断句断段。
  - overlap 常见取值：约为 chunkSize 的 **10%~30%**；本项目的 `20/50=40%` 偏高，优点是更不容易断上下文，缺点是会更“冗余”。

依赖：`@langchain/textsplitters`（见 `code/server/package.json`）。

## 3. 文本转向量并存入向量数据库（离线阶段：只做一次）

### 步骤

1. 遍历 `doc/` 目录所有文档
2. 每篇文档 split 成 chunks
3. 对每个 chunk 调用 embedding 接口生成向量
4. 把向量 + 原文本作为 metadata 存入向量库（带持久化）

### 解释

这一步是“建库/入库”，属于离线预处理：

- **只需要做一次**（知识库更新时再重跑）
- 成功后向量库落盘，后续提问无需再次向量化所有文档

本项目使用：

- embedding：阿里云百炼兼容 OpenAI 的接口，模型 `text-embedding-v4`
- 向量库：`ruvector`，通过 `storagePath` 持久化到本地文件

### 代码（核心）

#### 3.1 入库脚本入口

文件：`code/server/vectorLocalDoc.js`

```js
import { readDocToText, splitDoc } from "./utils.js"
import { storeIn } from "./vector/index.js";

const arr = await readDocToText();
for (let i = 0; i < arr.length; i++) {
    const resultArr = await splitDoc(arr[i]);
    for (let j = 0; j < resultArr.length; j++) {
        const text = resultArr[j];
        await storeIn(text)
    }
}
```

#### 3.2 生成向量（Embedding）

文件：`code/server/vector/index.js`

```js
export async function createVetor(text) {
    const openai = new OpenAI({
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "sk-..."
    })
    const result = await openai.embeddings.create({
        model: "text-embedding-v4",
        input: [text],
        dimensions: 2048
    })
    return result.data[0].embedding
}
```

#### 3.3 存入向量库（带 metadata）

文件：`code/server/vector/index.js`

```js
export async function storeIn(text) {
    const vector = await createVetor(text)
    await add(text, vector, text)
}
```

文件：`code/server/vector/store.js`

```js
const db = new VectorDb({
    dimensions: 2048,
    storagePath: "./data/vectorData.db",
    metric: "Cosine"
});

export async function add(id, vector, originText) {
    await db.insert({
        id,
        vector,
        metadata: {
            text: originText
        }
    })
}
```

关键点：`storagePath: "./data/vectorData.db"` 让向量数据持久化到磁盘（不然就是纯内存，服务重启就没了）。

## 4. 收到提问：把“问题”向量化并检索相关文档

### 步骤

1. 用户输入问题 `qtext`
2. 将 `qtext` 调用同一个 embedding 模型生成向量
3. 用这个向量去向量库做 TopK 检索（本项目 `k=5`）
4. 拿到命中的 chunk 文本，作为“参考资料”拼接为 RAG 上下文

### 解释

向量检索解决的就是：

- “我问的内容，跟本地资料哪几段最像？”

注意：embedding 模型的选择要一致。

- 文档入库用的 embedding 模型是什么
- 查询检索时也必须用同一模型（否则向量空间不一致，检索无意义）

### 代码（核心）

#### 4.1 问题检索 TopK

文件：`code/server/vector/index.js`

```js
export async function createVetor(text) {
    const openai = new OpenAI({
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "sk-..."
    })
    const result = await openai.embeddings.create({
        model: "text-embedding-v4",
        input: [text],
        dimensions: 2048
    })
    return result.data[0].embedding
}
export async function textSearch(text) {
    const textVector = await createVetor(text)
    const searchResult = await search(textVector);
    return searchResult
}
```

文件：`code/server/vector/store.js`

```js
export async function search(searchVector) {
    const searchArr = await db.search({
        vector: searchVector,
        k: 5
    })
    return searchArr.map((r) => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata
    }))
}
```

#### 4.2 组装 RAG 上下文（模板 + 命中的文本）

文件：`code/server/ragContext.md`

```md
#说明
我们有一些本地资料供你参考，如果有冲突，以本地资料为准
#参考资料
${text}
```

文件：`code/server/utils.js`

```js
export async function createRAGContext(qtext) {
    const ragContext = fs.readFileSync("./ragContext.md")
    const searchArr = await searchByQuestion(qtext)
    let allStr = ''
    for (let i = 0; i < searchArr.length; i++) {
        const str = searchArr[i].metadata.text + "\n"
        allStr += str;
    }
    let ragString = ragContext.toString();
    ragString = ragString.replace("${text}", allStr)
    return ragString;
}
```

## 5. 把检索到的文档作为 system 上下文给到大模型（在线阶段）

### 步骤

1. 前端把用户问题发给后端 `/llm`
2. 后端在 `requestAI()` 中先构造 `ragContext`（上一节）
3. 将 `ragContext` 作为一条 `system` 消息放进 messages，让模型在回答时优先参考本地资料

### 解释

RAG 的关键不是“检索”，而是“把检索结果**正确注入提示词**”。

本项目的注入方式是：

- 第一条 `system`：通用角色设定（`context2.md`）
- 第二条 `system`：RAG 上下文（`ragContext.md` + 检索命中 chunk）
- 后面才是历史对话与用户问题

这样模型在生成答案时，就能利用本地资料完成“有依据”的回答。

### 代码（核心）

文件：`code/server/utils.js`

```js
export async function requestAI(opt) {
    const { openai, queryObj, userId, convertId, res } = opt
    const conversationObj = readConversation();
    const singleConvertList = conversationObj[userId][convertId].list;

    singleConvertList.push(queryObj);
    const ragContext = await createRAGContext(queryObj.content)

    const llmres = await openai.chat.completions.create({
        model: "qwen-plus",
        messages: [
            { role: "system", content: systemString },
            { role: "system", content: ragContext },
            ...singleConvertList
        ],
        tools: toolList,
        stream: true
    })
    // ... 省略：SSE 流式返回与工具调用处理
}
```

请求入口：`code/server/index.js` 的 `/llm`。

```js
app.post("/llm", async (req, res) => {
    const { keyword, userId, convertId } = req.body;
    const queryObj = { role: "user", content: keyword };
    await requestAI({ openai, userId, convertId, res, queryObj })
});
```

## 6. 补充：如何“只入库一次”与项目实践要点

- **[入库只做一次]**
  - 运行 `code/server/vectorLocalDoc.js` 进行建库（读取->切分->embedding->insert）。
  - 之后正常启动服务并提问即可，检索直接读取 `./data/vectorData.db`。

- **[向量库持久化]**
  - `VectorDb({ storagePath: "./data/vectorData.db" })` 决定是否落盘。
  - 落盘后服务重启也能继续检索。

- **[检索条数 TopK]**
  - `k: 5` 代表返回最相关的 5 个 chunk，可根据资料规模调整。

- **[RAG Prompt 模板]**
  - `ragContext.md` 里写“冲突以本地资料为准”，属于常见的 RAG 防幻觉策略之一。





# agent长期记忆

## 0. 目标与整体思路

长期记忆（Long-term Memory）要解决的是：

- 聊天轮数多了以后，模型的上下文窗口有限，不能一直把所有历史对话都带上。
- 我们希望 agent 能“记住用户”，例如用户的身份、偏好、近期状态、行为模式，并在后续回答中持续体现。

本项目的落地方式是：

1. **定期/按需**从历史对话中抽取“用户特征”（用大模型总结）
2. 把特征存到本地 `userMemo.json`
3. 每次用户提问时，把“用户特征”作为 **system** 上下文注入给大模型（让模型按用户特征来回答）

对应项目代码目录：`ppt和源码/2-6 agent长期记忆/code/server`。

#### 为什么要做长期记忆（对应图片补充）

- **大模型 API 本身是“无状态”的**：
  - 只要你不把“历史信息/用户特征”放进本次请求的 `messages`，模型就不会“自己记住你”。
- 因此要想实现“像认识你很久的老管家一样”的效果，通常要走这条链路：
  - **从对话中分析出用户特征**（让 AI 帮我们提取）
  - **按 userId 存储到数据库/文件**（形成长期记忆）
  - **后续每次提问都把记忆取出来，当作上下文再喂给模型**

本项目分别用两个文件来承载这两类数据：

- **对话记录**：`code/server/dbdata/conversation.json`
- **用户长期记忆**：`code/server/dbdata/userMemo.json`

## 1. 我们需要记忆哪些内容

### 步骤

1. 先明确要长期记忆的维度（不同应用关注点不同）
2. 为每个维度设计结构化 schema（最好是 JSON）
3. 从对话中持续提取并更新这些字段

### 解释

图片里给的常见维度：

- **身份**：职业、地区等（稳定、低频变化）
- **喜好**：食物、运动等（相对稳定，中低频变化）
- **状态**：情绪、身体状态（变化快，高频）
- **用户行为模式**：比如表达方式、作息、常见诉求（本项目未实现，但属于可扩展方向）

注意：没有统一标准，应该按你的业务目标决定要“记什么”。

### 代码（核心：把维度固化为 prompt + JSON）

本项目把“维度”固化成 3 个独立的提示词文件（分别生成 JSON）：

- 身份：`code/server/context/sfMemo.md`
- 喜好：`code/server/context/likeMemo.md`
- 状态：`code/server/context/statusMemo.md`

示例（身份维度）：

文件：`code/server/context/sfMemo.md`

```md
#要求
总结对话记录提取出用户的身份特点

#生成具体要求
按下面json生成，并且返回一个json，纯粹的返回json就好，不需要携带任何的md格式。仔细阅读json数据的属性的含义，如果没有提取到该属性的信息，则返回空字符串，不生成没提到的属性
```json
{
    "career":"职业",
    "location":"居住地"
}
```
## 2. 生成用户特征（从历史对话 -> JSON 记忆）-- 这个项目里面没有实现自动化更新，手动node，要是之后项目需要，再写

### 步骤

1. 按 `userId` 读取该用户的历史对话记录
2. 把对话记录（数组）交给大模型，让其按某个维度的 schema 生成 JSON
3. 将生成结果写入 `userMemo.json`，并采用“增量合并”的更新策略

### 解释

这里的关键点（对应图片“进一步优化”）：

- 让模型输出 **严格 JSON**（便于程序解析；也避免模型输出一堆废话）
- **没提到的字段就返回空/不更新**（避免模型胡编，或者用空值覆盖已有记忆）
- 记忆更新最好按“维度”拆开（身份/喜好/状态各自独立更新频率和更新窗口）

### 代码（核心）

#### 2.1 读取用户历史对话

文件：`code/server/agentMemory.js`

```js
export function getUserConvertList(userId) {
    const jsonStr = fs.readFileSync("./dbdata/conversation.json")
    const jsonObj = JSON.parse(jsonStr);
    const userConvertIdList = Object.keys(jsonObj[userId])
    const conversationArr = [];
    for (let i = 0; i < userConvertIdList.length; i++) {
        const _id = userConvertIdList[i];
        const convertList = jsonObj[userId][_id];
        //如果需要，可以限定截取最近50,100,30
        conversationArr.push(convertList)
    }
    return conversationArr;
}
```

#### 2.2 用大模型按 schema 生成 JSON

文件：`code/server/agentMemory.js`

```js
export async function getUserLiker(conversationArr, md) {
    const llmres = await openai.chat.completions.create({
        model: "qwen-plus",
        messages: [
            { role: "system", content: md },
            { role: "user", content: JSON.stringify(conversationArr) }
        ]
    })
    return llmres.choices[0].message
}
```

其中 `md` 就是上面那些 `sfMemo.md / likeMemo.md / statusMemo.md` 的内容。

#### 2.3 记忆写入：增量合并（不空字段覆盖）

文件：`code/server/agentMemory.js`

```js
export function storeIn(userId, type, result) {
    const memojsonStr = fs.readFileSync("./dbdata/userMemo.json")
    const memojsonObj = JSON.parse(memojsonStr);
    const memoInObj = memojsonObj[userId]?.[type] || {}
    const resultContent = JSON.parse(result.content);

    for (let key in resultContent) {
        if (resultContent[key]) {
            memoInObj[key] = resultContent[key]
        }
    }

    if (memojsonObj[userId]) {
        memojsonObj[userId][type] = memoInObj;
    } else {
        memojsonObj[userId] = {};
        memojsonObj[userId][type] = memoInObj
    }

    fs.writeFileSync("./dbdata/userMemo.json", JSON.stringify(memojsonObj));
}
```

这段逻辑对应图片里的提示：**“如果没有提取到则返回空 / 不要硬塞不存在的”**，并通过 `if (resultContent[key])` 做了“仅非空字段才更新”。

#### 2.4 三个维度分别生成（身份 / 喜好 / 状态）

文件：`code/server/agentMemory.js`

```js
export async function createSf(userId) {
    const conversationArr = getUserConvertList(userId);
    const sfMemo = fs.readFileSync("./context/sfMemo.md")
    const result = await getUserLiker(conversationArr, sfMemo.toString())
    storeIn(userId, 'sf', result)
}

export async function createLike(userId) {
    const conversationArr = getUserConvertList(userId);
    const sfMemo = fs.readFileSync("./context/likeMemo.md")
    const result = await getUserLiker(conversationArr, sfMemo.toString())
    storeIn(userId, 'like', result)
}

export async function createStatus(userId) {
    const conversationArr = getUserConvertList(userId);
    const sfMemo = fs.readFileSync("./context/statusMemo.md")
    const result = await getUserLiker(conversationArr, sfMemo.toString())
    storeIn(userId, 'status', result)
}
```

## 3. 使用长期记忆：把用户特征注入到 system 上下文

### 步骤

1. 每次用户提问时，后端根据 `userId` 读取 `userMemo.json`
2. 把 JSON 记忆转成一段“可读的约束/事实字符串”
3. 作为一条新的 `system` message 注入到大模型 `messages` 中

### 解释

长期记忆能生效的关键是“注入位置”。

- 放在 `system`：优先级最高，相当于对模型的长期约束/事实补充
- 放在 `user/assistant` 历史对话：优先级更低，容易被忽略

本项目把 `userMemo` 放在 RAG 上下文之后、历史对话之前：

`system(角色)` -> `system(RAG资料)` -> `system(用户记忆)` -> `历史对话 + 本轮问题`

### 代码（核心）

#### 3.1 读取并把记忆 JSON 转为可注入字符串

文件：`code/server/utils/utils.js`

```js
export async function getUserMemoById(id) {
    const memoJSonstr = fs.readFileSync("./dbdata/userMemo.json")
    const jsonObj = JSON.parse(memoJSonstr)
    const useMemo = jsonObj[id];

    let str = "以下是用户的一些特点，请牢记，回答的时候根据用户特点进行回答\n";
    const { sf, like, status } = useMemo
    if (sf) {
        if (sf.career) str += "我的职业是" + sf.career + "\n"
        if (sf.location) str += "我的居住地是" + sf.location + "\n"
    }
    if (like) {
        if (like.career) str += "我喜欢的食物有" + like.food.join(",") + "\n"
        if (like.sport) str += "我喜欢的运动是" + like.sport.join(",") + "\n"
    }
    if (status) {
        if (status.feel) str += "我的感情状态：" + status.feel + "\n"
        if (status.body) str += "我的身体状态" + status.body + "\n"
    }
    return str;
}
```

#### 3.2 注入到 messages（system）

文件：`code/server/utils/utils.js`

```js
export async function requestAI(opt) {
    const { openai, queryObj, userId, convertId, res } = opt
    const conversationObj = readConversation();
    const singleConvertList = conversationObj[userId][convertId].list;

    singleConvertList.push(queryObj);
    const ragContext = await createRAGContext(queryObj.content)
    const userMemo = await getUserMemoById(userId);

    const llmres = await openai.chat.completions.create({
        model: "qwen-plus",
        messages: [
            { role: "system", content: systemString },
            { role: "system", content: ragContext },
            { role: "system", content: userMemo },
            ...singleConvertList
        ],
        tools: toolList,
        stream: true
    })
    // ... 省略
}
```

上面这段就是图片里提到的第 3 步：

1. 用户提问
2. 读取用户特征（`getUserMemoById(userId)`）
3. 每次对话都把特征作为上下文给到 AI 接口（`{ role: "system", content: userMemo }`）

## 4. 更新策略（即node 上面的agent.js,在2. 生成用户特征（从历史对话 -> JSON 记忆）里面）

### 步骤

1. 为不同维度设置不同的更新频率（按天/周/月或按对话轮次触发）
2. 为不同维度设置不同的对话采样范围（最近 10/30/50 条等）
3. 在 `getUserConvertList()` 中加入“截取最近 N 条”逻辑（本项目留了注释位）

### 解释

1. **什么时候更新？**
   - 每轮对话都更新：成本高，容易抖动
   - 定时更新：更稳定，成本可控
2. **用多大范围生成？**
   - 范围太小：不够全面
   - 范围太大：噪音多、成本高

图片里的建议（按业务自定义）：

- 身份：更新频率低（比如 1 个月）+ 范围更大（比如最近 50 轮）
- 喜好：更新频率中（比如 1 周）
- 状态：更新频率高（比如 1 天）+ 范围更小（比如最近 10 轮）

### 代码（对应“范围可截取”的关键位置）

文件：`code/server/agentMemory.js`

```js
//如果需要，可以限定截取最近50,100,30
conversationArr.push(convertList)
```

这里就是你实现“取最近 N 轮/最近 N 条消息”的挂载点：根据维度不同在 `createSf/createLike/createStatus` 中做不同的截取策略。



# MCP

## 0. MCP 是什么

MCP（Model Context Protocol）可以理解为：

- **一套“模型如何调用外部能力”的协议**（把外部能力以 tool/function 的形式暴露出来）
- 通过 MCP，客户端（例如 agent/IDE/应用）可以：
  - `listTools()` 获取服务端提供的工具列表
  - `callTool()` 调用某个工具并拿到结构化结果

#### 为什么会需要 MCP

当公司/团队规模变大后，大家都会做自己的“function tool / 外部服务”。如果没有统一规范，常见问题是：

- **接口路径不统一**：每个团队自定义一套调用方式
- **入参/出参格式不统一**：客户端要写很多“适配层”去兼容不同返回
- **工具发现困难**：不知道有哪些工具、每个工具需要什么参数

MCP 的价值就在于：

- **大家约定同一种协议/格式**
- 客户端用统一方式做工具发现（`listTools`）与调用（`callTool`）



### 解释mcp和Transport，以及@modelcontextprotocol/sdk的作用

> 一句话总纲：**MCP 是应用层协议；HTTP / SSE /stdio 只是传输层（transport），负责把 MCP 的 JSON-RPC 消息传过去**。 “MCP 说白了就是一个 http 服务” 是简化口语，严格来说是错的，只有当你选用 HTTP 系列 transport 时，它才表现成 HTTP 服务。

#### 1. 层级关系

```
MCP 协议（JSON-RPC 消息规范：initialize、tools/list、tools/call……）
        ↓
Transport（传输通道，三选一）
  ├─ stdio：进程 stdin/stdout，无网络、无端口
  ├─ Streamable HTTP：HTTP 长连接新规范（MCP 官方主推）
  └─ SSE：老流式方案（SSE 单向读 + POST 单独发消息）
```

`@modelcontextprotocol/sdk` 的作用：**帮你封装 MCP 协议消息，同时提供不同 transport 的实现类，不用自己手写 JSON-RPC 编解码**。 SDK 不绑定 HTTP，transport 是可插拔的。

#### 2. stdio transport（你当前 demo 用的）

模型：Client 作为父进程，spawn 子进程启动 MCP Server；消息走管道 stdin/stdout。 ✅ 优点

- 不用监听端口、不用处理 CORS、TLS、鉴权
- 本地桌面 / IDE 集成最主流（Cursor、Claude Desktop 都是这种方式）
- 权限边界天然：server 和 client 是同一个用户身份 ❌ 局限
- 只能本机调用，不能跨机器共享
- 每一个 client 连接，通常拉起一个独立 server 进程（多客户端没法复用服务实例）

> 对应你 demo：启动 server 是跑命令，client 执行 `spawn` 拉起这个命令通信，**没有任何 HTTP 端口**。

#### 3. SSE transport（旧流式方案）

经典两段式：

1. Client 发起 GET 请求建立 SSE 长连接 → Server 返回 sessionId；SSE 通道**只能服务器往客户端推消息**（单向）
2. Client 要发请求（调用工具），走单独的 POST HTTP 接口带上 sessionId 特点：SSE 本身单向，所以需要两条通路，实现比较繁琐，属于早期方案。

#### 4. Streamable HTTP（MCP 新标准，推荐网络场景）

统一入口（比如 `/mcp`），**同一个 HTTP 端点同时承载双向消息**：

- 可以短请求
- 也可以升级成长连接流式传输 不再需要 SSE 那种 “单独 POST + SSE 接收” 两套接口，是官方现在主推的网络 transport。

表格

| Transport       | 网络        | 多客户端共享         | 适用场景                                   |
| --------------- | ----------- | -------------------- | ------------------------------------------ |
| stdio           | ❌ 无端口    | ❌ 一般一客户端一进程 | 本地 IDE、桌面客户端、本机工具             |
| SSE             | ✅ HTTP 网络 | ✅ 可共享服务         | 历史存量实现，新项目不优先选               |
| Streamable HTTP | ✅ HTTP 网络 | ✅ 可共享服务         | 跨机器、容器、服务化部署，网关、鉴权、观测 |

#### 5. 容易踩的误区

1. ❌ MCP = HTTP 接口 ✅ MCP 是协议；HTTP 只是可选传输。stdio MCP 完全不是 HTTP。
2. ❌ `@modelcontextprotocol/sdk` 就是 express 服务 ✅ SDK 和 express 无关；express 只是你如果要做 Streamable HTTP 服务时，用来搭 Web 服务的底层 Web 框架，SDK 可以配到 express 路由上。
3. ❌ SSE 是双向通信 ✅ SSE 原生只能服务端推；客户端发消息必须额外 POST。
4. ❌ 换成 Streamable HTTP 之后，MCP 协议本身变了 ✅ **MCP 的消息结构（initialize、tools/call 等载荷完全不变），只是消息跑的通道换了**。这就是 transport 插拔的含义。





## 2. 服务端流程

### 步骤

1. 创建 `McpServer`（声明 name/version）
2. `registerTool()` 注册工具（function tool）
3. 创建 `StdioServerTransport`
4. `server.connect(transport)` 启动并监听 transport

### 解释

服务端的本质：

- 把你“想让模型/客户端调用的能力”封装为 tool
- tool 执行完返回 MCP 规定的结构化响应（这里是 `content: [{type: "text", text: "..."}]`）

### 代码（核心）

文件：`ppt和源码/2-7 MCP协议/code/mcpdemo/stdioMcpServer.js`

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { exec } from 'child_process';
const server = new McpServer({
    name: "mylocal",
    version: "1.0.0"
})

server.registerTool("open_postman", {
    description: "打开用户的本地postman"
}, () => {
    // ... 执行打开 Postman 的逻辑
    const path = 'C:/Users/Administrator/AppData/Local/Postman/Postman.exe'
exec(`start "" "${path}"`, (error) => {
    if (error) {
        console.error('启动失败，请确认路径是否正确');
    } else {
        console.log('Postman启动成功！');
    }
});
    return {
        content: [{ type: "text", text: "打开成功" }]
    };
})

const transport = new StdioServerTransport()
await server.connect(transport);
```



## 3. 客户端流程（对应图片“客户端流程”）

### 步骤

1. 创建 `Client`
2. 创建 `StdioClientTransport` 并指定 `command`（启动 MCP server 的命令）
3. `client.connect(transport)` 建立连接
4. `client.listTools()` 获取工具列表
5. `client.callTool()` 调用指定工具

### 解释

图片里提到的：

- “创建 transport，url 设置为 mcp 地址”在 stdio 模式下对应的是：
  - transport 里配置 `command`（要启动哪个 MCP server 命令）
- “connect 方法连接”对应 `client.connect(transport)`
- “listTools / callTool”对应 MCP client 的核心调用方式

### 代码（核心）

文件：`ppt和源码/2-7 MCP协议/code/mcpdemo/stdioMcpClient.js`

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
    name: "mycl",
    version: "1.0.0"
})

const transport = new StdioClientTransport({
    command: "mylocalmcp"
})

await client.connect(transport)

const res = await client.listTools();
const res2 = await client.callTool({
    name: "open_postman"
})

console.log(res2);
```

## 4. 为什么 `command: "mylocalmcp"` 能工作

### 步骤

1. 在 `package.json` 的 `bin` 字段注册一个命令名
2. 命令映射到你的 MCP server 入口脚本

### 解释

在 npm 包安装后（或 link 后），`mylocalmcp` 就会变成一个可执行命令，实际执行的就是 `./stdioMcpServer.js`。

### 代码（核心）

文件：`ppt和源码/2-7 MCP协议/code/mcpdemo/package.json`

```json
"bin": {
  "mylocalmcp": "./stdioMcpServer.js"
}
```

  





### 当mcp的transport通过http，则可以通过global.fetch测试

```js
const originalFetch = global.fetch;
global.fetch = async function (...args) {
    const [url, options = {}] = args;
    // 打印请求信息
    console.log('=== FETCH REQUEST START ===');
    console.log('URL:', url);
    console.log('Method:', options.method || 'GET');

    // 打印请求头
    if (options.headers) {
        console.log('Request Headers:', options.headers);
    }
    // 打印请求体（如果有）
    if (options.body) {
        console.log('Request Body:', options.body);
    }

    console.log('=== FETCH REQUEST END ===');
    const response = await originalFetch.apply(this, args)
    return response;

};
```

#### 解释：`const originalFetch = global.fetch;`

- **作用**：先把“原始的 fetch 函数”保存下来。
- **原因**：下面会把 `global.fetch` 重写成我们自己的函数（加日志）。如果不保存原始引用，重写之后你在新函数里再调用 `global.fetch` 会变成调用自己，导致**无限递归**。

#### 解释：`const response = await originalFetch.apply(this, args)`

- **`apply` 是什么**：
  - `fn.apply(thisArg, argsArray)` 会以指定的 `thisArg` 作为 `this`，并把数组 `argsArray` 展开为参数调用函数。
- **为什么这里用 `apply(this, args)`**：
  - 你重写的 `global.fetch = async function (...args) {}` 会收到所有入参（`url` 和 `options`）。
  - 用 `apply(this, args)` 可以把**原封不动的参数**转发给原始 `fetch`，同时保持当前调用的 `this` 语义一致。
- **`response` 是什么**：
  - `fetch()` 返回的是一个 `Response` 对象（Promise resolve 后得到），里面包含 status、headers、body 等信息。

#### 这段代码怎么“调用/触发”

这段代码本身不会发请求，它只是“拦截并包装”全局的 `fetch`。

- **触发方式**：在你执行完这段重写代码之后，项目里任何地方只要调用了 `fetch(...)`，都会先进入你重写的函数打印日志，然后再执行原始请求。
- **在 MCP 里的典型触发点**：当你使用 **HTTP 类 transport** 时，SDK 内部会通过 `fetch` 发出 MCP 协议请求。
  - 例如你打开的代码里有：`StreamableHTTPClientTransport`（会用 HTTP + fetch）。
  - 此时调用 `await client.connect(transport)`、`client.listTools()`、`client.callTool()` 过程中，SDK 可能会触发多次 `fetch`，你就能看到 URL、headers、body。
- **注意**：本笔记前面的 `mcpdemo` 是 stdio transport，stdio 不走 HTTP/fetch，因此重写 `global.fetch` **不会看到任何请求日志**。







# 知识补充

### 网络地址 localhost:3000/a/?b=3 和 localhost:3000/a?b=3 的区别

区别核心：**路径部分是否以 `/` 结尾**。

- **`http://localhost:3000/a/?b=3`**
  - pathname 是：`/a/`（以斜杠结尾，更像“目录”）
  - query 是：`b=3`
- **`http://localhost:3000/a?b=3`**
  - pathname 是：`/a`（不以斜杠结尾，更像“资源/文件”）
  - query 是：`b=3`

#### 可能带来的影响

- **路由匹配差异（最常见）**
  - 很多框架/网关会把 `/a` 和 `/a/` 当成两个不同的路由。
  - 如果后端只注册了其中一个，另一个可能会 404。
  - 有些框架会自动做 301/308 重定向把不规范的那个跳到规范路径，但不是所有框架都默认开启。

- **相对路径解析不同（前端/反向代理时容易踩坑）**
  - 浏览器解析相对路径时，会以当前 URL 的“目录语义”作为基准：
    - `/a/` 更像目录；
    - `/a` 更像文件。
  - 例如页面里有相对资源 `./x.js`，在两种路径下拼出来的最终 URL 可能不同。

- **缓存与代理层 key 可能不同**
  - CDN / 反向代理可能把 `/a` 和 `/a/` 当成两个 cache key。
  - 即使返回内容相同，也可能产生两份缓存，导致命中率下降或行为不一致。





### 所以/? 一般是打开首页的时候这样写

对的，但`/?xxx=yyy` **本身很常见也完全合理**，关键在于：**你是不是“要在当前页面/路由上，用 query 来表达状态”**。

## 什么时候用 `/?` 很合适
- **[首页就是承载页]** 你这个项目首页 `/` 就是聊天主界面，所以用 `/?convertId=...` 表达“打开哪段会话”很自然。
- **[同一路由内切换状态]** 不想换页面组件，只是换筛选/分页/选中项，例如：
  - `/?tab=history`
  - `/?page=2`
- **[可分享/可刷新]** 把状态放 URL，复制链接、刷新页面都能恢复。

## 什么时候“不适合”用 `/?`
- **[语义上不是首页]** 比如你本来就有明确页面：
  - 会话详情页：`/chat/:convertId`
  - 用户页：`/user/:id`
  这时更推荐用**路径参数**（path param）而不是首页 query。
- **[参数很多且层级很强]** URL 会变得难读、难维护，此时拆成子路由更清晰。

