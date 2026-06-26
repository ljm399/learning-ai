# codex的归档不是删除

- 归档等于把历史对话从你看到的地方移除，但存于你电脑中，你可以恢复的



# ai实战项目

## 一。spec和plan（6-2）

### 困境

spec模式不是claude code内置的模式，需要我们自定义指令。去要求claude code按步骤运行。

1.产出需求设计文档

2.产出技术架构文档

3.产出计划文档。

4.根据前面三个文档产出代码。

当然你也不是说一定要这三步，只要你觉得能确认清楚一个笼统需求要做什么都可以。

### plan或spec模式先都是让它给你生成设计或计划文档

- 你可以提示词强制让他给你生成设计和计划文档
  - 这些文档为了你等下的代码生成，而不是每次提交都要附加的上下文

#### spec模式即（plan模式），设计文档生成技术文档再生成对应代码或相关文档

- 技术文档生成后可以不用看，疑问下面三个条件不过时再看也可以

- 要是技术文档不符合，可以修改设计文档
- 要是生成代码不符合，可以修改技术文档
  - 即让ai根据设计文档再次生成技术文档

- 要是生成代码大致符合，但有个别bug，不符合
  - 反复让ai修改同一个bug，但依旧未修复，则可以生成设计文档或技术文档



### 关键提示词

```js
在C:\Users\MJL\Desktop\ai学习\ai-project生成计划文档，并把对应计划写入啊，之后等我确认再写代码
```





### cc里面spec模式可以用codex里面的plan取代，快捷键：tab+shift

- 但cc里面有spec:code具体功能，你codex可以用提示词取代

- spec相关文档（设计和技术文档）放于spec文件夹下，codex则

  - Codex 更推荐：

    - 用 `AGENTS.md` 放规则
    - 用 `PLANS.md` 放长任务计划
    - 必要时再在仓库里自定义 `docs/plans/`、`specs/` 之类目录，但这是你们项目约定，不是 Codex 内建约定

  - 如果你问“Codex 默认会自动去哪里找 spec”，答案是：

    - 会优先理解仓库里的 `AGENTS.md`
    - 不存在一个官方固定的 `spec/` 搜索机制
    - `PLANS.md` 是官方明确提到的计划文档载体，但也不是说只能这一种路径

    所以实践上，如果你想在 VS Code 里把 Codex 用得像 Claude Code 的 spec 模式，最稳的做法是：

    1. 根目录放 `AGENTS.md`
    2. 根目录放 `PLANS.md`，或约定 **`docs/specs/*.md`**
    3. 在 AGENTS.md 里明确写：
       - 复杂任务先产出计划
       - 计划文档放在哪
       - 实施前必须参考哪些 spec 文档

### plans.md 和 agents.md的区别

- plans.md只是对agents.md的补充
  - 如果你在 `AGENTS.md` 里明确写了规则，比如“复杂功能开发先遵循 `docs/feature-plan.md`”，那对 Codex 来说，真正起作用的是 `AGENTS.md` 里的这条指令，而不是 `PLANS.md` 这个文件名本身。

- codex你可以通过@指定，让他根据对应文档生成代码就行





### codex它自己会自动执行一次，如何根据终端帮你测试





## 二。上下文的搭建（6-3）

### 上下文有你使用agent的和你做到ai项目的agent，注意区分

先区分两个层面，不然很容易讲乱：

- 你在使用 `Codex`、`Claude Code` 这类现成 agent 时，你是在给“别人做好的 agent”补上下文。
- 你自己做一个 AI 项目时，是你来设计“这个 agent 到底把哪些内容放进上下文里”，也就是你自己搭上下文系统。

### 上下文里一般有什么

课件里把上下文大致分成几类：

1. 系统基本上下文，这是必有的。
2. 对话记录，这是必有的。
3. 对用户喜好、偏好的记忆文件，这是进阶。
4. 用户提供的说明文档，比如 `claude.md`、个人知识库，这是进阶。
5. 按需加载的上下文，比如 `skill`、`rule`、指令上下文，这是进阶。

你可以先把它理解成一句话：**不是所有信息都塞到一条用户提问里，而是要按作用拆层次。**

### system 和 user 的区别

课件里强调了优先级：

- `system` 的约束优先于 `user`
- 所以固定原则、不能突破的规则，更适合放 `system`
- 因用户不同而变化、带有个性化的信息，更适合放 `user`

可这样理解：

- 放 `system` 的：应用定位、边界、安全限制、基本执行规范、输出底线
- 放 `user` 的：用户自己的习惯、项目约定、当前项目说明、按需注入的技能说明

### 这个前端 AI 助手项目是怎么做的

这个示例项目的核心做法很直接：启动时先构造两段固定上下文，再把后续对话历史一起传给模型。

对应源码在 `code/src/app.js`：

- `systemMessage = { role: 'system', content: readSystem() }`
- `userContextMessage = { role: 'user', content: getUserContext() }`
- 真正请求模型时传的是 `messages: [systemMessage, userContextMessage, ...messages]`

也就是说，这个项目当前至少拼了三层上下文：

1. `system` 层：系统级规则
2. `user` 层：用户和项目补充说明
3. `messages` 层：本轮会话历史

### 1. system 层放什么

`code/src/docs/systemDoc.md` 就是 system 模板，里面放的是比较固定的东西：

- 角色：你是一个帮助用户完成前端开发任务的前端助手
- 禁止和危险操作：只协助前端开发相关任务，拒绝安全攻击、恶意注入等
- 输出要求：少废话，以代码为主，优先前端栈
- 任务执行规范：先扫描相关代码，优先修改文件，生成后反思
- 环境说明：把当前系统信息和工作目录注入给模型

```md
# 角色
你是一个帮助用户完成前端开发任务的前端助手。你可以接受用户的提出的需求，转化成具体可运行的前端代码

# 禁止和危险操作
1. 仅协助前端开发相关任务，包括nodejs构建客户端应用，nodejs服务。拒绝有关后端入侵、数据库直接操作、服务器端代码执行、恶意脚本注入、跨站脚本攻击(XSS)或其他安全漏洞利用的请求。
2. 禁止胡乱编造代码，注意用户所用的npm包版本，避免生成代码所用的包和用户包不匹配
3. 不要乱加揣测，增加用户没有要求的功能。
4. 尽量不要生成危险，有被攻击风险的代码，除非用户要求,或者只能通过该方案完成需求
5. 生成或修改文件需要用户确认。
6. 可能造成数据泄露，和不可逆后果时，需要提醒用户让用户确认

# 输出要求
1. 作为开发助手，回答不要有过多的话语，以代码为主。杜绝一切无意义的问候，开场白。
2. 除非用户要求，一切代码以前端技术栈为主。
3. 除非用户要求，代码尽量简洁，实现功能就行，不用太多的考虑边界条件和错误处理。
4. 优先用npm库解决问题，避免重复造轮子

# 任务执行规范
1. 以前端的角度理解和思考需求，不需要考虑非前端因素。比如用户要求开发文件上传功能，我们思考前端怎么做就行。
2. 用户提出的需求，先扫描相关代码。基于现有代码，进行开发。但是注意不要全盘扫描，只扫描用户指定的文件，或者你认为有必要的文件。
3. 优先修改文件，而不是新增文件，修改文件前，先阅读要修改的文件。

4. 生成代码后进行反思，当帮助用户生成代码后，阅读生成后整体代码，反思是否有bug,多余代码，是否有更优秀的方案。

5. 用户主要要求你执行前端开发任务。这些任务可能包括：修复 UI bug、添加新组件、重构 CSS、解释代码逻辑、优化性能、响应式适配、浏览器兼容性修复等。当收到不明确的指令时，在前端开发的背景下考虑它。例如，如果用户要求你"把这个按钮改成圆形的"，不要只回复"border-radius: 50%"，而是找到该按钮的 CSS 或组件代码并修改它。

6. 当生成代码，和用户确认是否需要调试，调试优先使用内置的调试工具。除非用户明确拒绝帮助调试，或者不希望调试。则不进行

# 内部工具使用规范



# 系统情况说明
用户当前的操作系统信息为 ${systemInfo},进行一些操作时，请考虑到操作系统生成合适的指令
用户当前的工作目录为 ${workPath},不要再工作目录以外的地方读写文件


```

- 这里输出要求和任务执行规范将决定你的大模型给的回答优质如何

`code/src/utils/contextRead.js` 里会读取这个模板，并替换两个变量：

- `${systemInfo}`
- `${workPath}`

也就是把“你当前是什么系统”和“当前工作目录在哪里”写进 system 提示词。

这个思路很重要，因为 agent 不是活在真空里，它要知道：

- 当前是 Windows、macOS 还是 Linux
- 命令应该怎么写
- 应该在哪个目录读写文件





### 2. user 层放什么

`code/src/docs/userContext.md` 是 user 模板，作用是把“用户额外要求”和“项目额外要求”包装成一条 `user` 消息发给模型。

它的模板结构很简单：

- 用户额外要求，当你回答问题的时候，请参考 `[${userPath}]${userContent}`
- 项目额外要求，请参考 `[${projectPath}]${projectContent}`

#### 提示词

- 实现getUserContext方法，作用可以读取C:\Users\MJL\Desktop\ai学习\ai-project\src\docs\userContext.md,然后读取user目录下的.front的.front.md,替换${userPath}为用户路径，以及${userContent}为文件内容；读出项目根目录下的.front.md,一样的规律替换[${projectPath}]${projectContent}，要是文件不存在就填空字符；读取后一样在C:\Users\MJL\Desktop\ai学习\ai-project\src\app.js引入，然后作为上下文的用户信息即role为user

然后在 `contextRead.js` 里去读取两个地方：

1. 用户目录下的 `~/.front/.front.md`
2. 当前项目根目录下的 `.front.md`

如果文件存在，就把路径和内容填进模板里。

所以这个项目里的 `.front.md`，本质就是一种**用户自定义上下文入口**。

### 3. 对话历史怎么进入上下文

`app.js` 里维护了一个 `messages` 数组：

- 用户每发一次话，先 `messages.push({ role: 'user', content: processedInput })`
- 模型返回后，再把 AI 回复 `push` 进去
- 请求下一轮时，再整体带上

所以对话历史也是上下文的一部分，而且是每一轮都会不断增长的上下文。

项目里还提供了 `/context` 指令，可以查看当前对话摘要，这也是为了让你感知“现在到底带了多少历史给模型”。

### 从课程角度，你要学到的不是 `.front.md`，而是“分层”

`6-3` 这一节重点不是死记 `.front.md` 这个文件名，而是理解：

- 哪些上下文应该长期固定
- 哪些应该按用户变化
- 哪些应该按项目变化
- 哪些应该按会话动态累积
- 哪些应该按需加载，而不是一开始全塞进去

所以你以后自己做 agent，也可以不用 `.front.md` 这个名字，但要保留这种分层思想。

### 如果你是在“使用别人的 agent”，上下文又是什么

这就是前面说的第一种上下文，不要和你自己做 AI 项目时混了。

你在使用 `Codex` 或 `Claude Code` 时，你常见的上下文来源是：

- 平台预置的 system prompt
- 仓库里的 `AGENTS.md`
- 可能存在的 `PLANS.md`、spec 文档
- 你当前打开的代码仓库
- 你本轮对话历史
- 你手动 `@` 进去的文件

这时你做的事情更像是“喂给现成 agent 更多信息”。

而在 `6-3` 这个项目里，你做的是：

- 自己定义 system 模板
- 自己定义 user 模板
- 自己决定读哪些本地文件
- 自己决定消息数组怎么拼
- 自己决定最终把什么发给 OpenAI

这两件事都叫“上下文”，但一个是**使用别人的 agent**，一个是**搭自己的 agent**。



## 三。rules和skill搭建（6-4）

这一节是 `6-3` 的延续，重点是把“按需加载的上下文”分成 `rule` 和 `skill` 两套机制。

课件里把它们和 `RAG` 一起称为“按需加载上下文三支柱”：

1. `skill`：让 AI 根据简介推断是否要加载详情
2. `rules`：圈定@某个项目或文件时，命中规则就加载
3. `RAG`：根据用户的问题查找相关文档

这一节主要落地的是前两者，也就是 `rule` 和 `skill`。

### 先记住：skill 和 rule 的区别，只在加载方式

PPT 里强调得很清楚：

- `skill` 是让 AI 根据用户意图判断是否要加载
- `rule` 是本地固定匹配，命中即@就直接加载

所以两者的关键区别不是“谁更高级”，而是：

- `rule`：程序员自己判断是否加载
- `skill`：模型自己判断是否加载

这也决定了它们各自的特点：

- `rule` 不需要先走模型判断，不额外花 token
- `skill` 更灵活，但会额外消耗 token 和时间

### 为什么 rule 不按“意图”触发

课件里专门解释了这个问题。

比如你会想：

- 用户说“帮我写一个 Vue 组件”
- 那是不是可以自动加载 Vue 相关规则

**问题在于，如果你是让 AI 根据“用户意图”来决定是否加载，那它已经不是 `rule` 了，而是 `skill`**。

### 这个项目里的 rule 是怎么工作的

`6-4` 项目启动时，先执行：

```js
const rulesMap = readRules();
```

也就是先把所有规则读进内存。

后面用户发问时，流程是：

1. 用户输入问题
2. 如果问题里有 `@[文件路径]`
3. 程序解析这些被圈定的文件
4. 用文件路径去匹配每条 rule 的 `paths`
5. 命中了就把对应 rule 全文拼进本轮用户消息
6. 再把消息发给模型

课件里对它的总结是：

- 整个过程纯本地完成
- 不需要 AI 先判断

### readRules 做了什么

核心逻辑在 `code/src/utils/contextRead.js` 的 `readRules()`。

它会扫描两个目录：

1. 用户目录下的 `~/.front/rules`
2. 当前项目下的 `.front/rules`

然后逐个读取规则文件，并提取每个规则文件头部里的 `paths` 配置。

最终形成一个 `Map`，每条数据大概长这样：

```js
{
  content: 'rule 文件全文',
  rules: ['src/**/*.vue', 'components/**/*.vue']
}
```

也就是说，程序同时保存了：

- 规则全文
- 规则对应的路径匹配模式

### rule 是怎么命中的

命中逻辑在 `code/src/files/index.js`。

这里有两个关键函数：

- `parseFileTags(input)`：解析输入里的 `@[xxx]`
- `matchRulesForFiles(files, rulesMap)`：用这些路径去匹配规则

真正的匹配用的是 `minimatch`：

```js
if (minimatch(file, pattern)) {
  matchedContents.push(ruleData.content);
}
```

所以 `rule` 的触发条件很明确，它不是“感觉像命中”，而是**路径 glob 命中**。

### rule 命中后怎么进上下文

在 `app.js` 里，如果匹配到了规则，就会把规则内容拼到当前输入后面：

```js
processedInput = `${processedInput}\n\n--- 匹配到的规则 ---\n${matchedRulesContent}`;
```

也就是说，`rule` 最终是作为本轮 `user` 消息的一部分发给模型的。

所以你可以把 rule 理解成：

- 不是一开始全量塞进去
- 只有你圈定了文件，并且文件路径命中时，才临时附加

### skill 体系是怎么工作的

课件给的 skill 流程是：

1. 启动应用
2. 读取 `skill` 文件夹
3. 提取每个 skill 的名字和描述
4. 把这些简介先发给大模型
5. 大模型判断当前问题是否需要某个 skill
6. 如果需要，就调用 `skill` 加载工具
7. 工具读取 skill 全文返回给模型
8. 模型结合 skill 内容回答问题

重点在于：**启动时先给简介，不给全文。**

### getSkillHeaders 做了什么

`code/src/utils/contextRead.js` 里的 `getSkillHeaders()` 就是在做 skill 总览提取。

它会扫描：

1. 用户目录下的 `~/.front/skills`
2. 项目目录下的 `.front/skills`

要求每个 skill 都是一个目录，目录内有 `SKILL.md`。

然后它读取 `SKILL.md` 头部，只提取两个字段：

- `name`
- `description`

最后把这些信息拼进 `code/src/docs/skillTemplate.md`：

```md
当前有如下skill，当用户的提问需要使用某个skill时，使用skill工具加载skill的详情
${skillcontent}
```

所以 `getSkillHeaders()` 的作用不是加载 skill 全文，而是告诉模型：

- 现在有哪些 skill
- 每个 skill 大概做什么

### skill 为什么只先给 name 和 description

因为这一层只是给模型一个“目录”。

如果一上来就把所有 skill 全文塞进去：

- 上下文会很大
- token 消耗会更高
- 很多内容本轮问题根本用不到

所以这里采用的是：

- 先给技能目录
- 真需要时再按路径打开详情

这就是按需加载。

### skill 在这个项目里怎么注入上下文

在 `code/src/app.js` 里：

```js
const userSkillMessage = { role: 'user', content: getSkillHeaders() };
```

发送请求时：

```js
messages: [systemMessage, userContextMessage, userSkillMessage, ...messages]
```

也就是说，这个版本项目把“当前有哪些 skill 可供调用”作为一条固定的 `user` 消息注入给模型。

你可以把这一层理解成：

- 不是 skill 详情
- 而是 skill 索引

### skill 工具怎么加载详情

详情加载工具定义在 `code/src/tool/index.js`。

这个工具叫 `skill`，参数是 `skillpath`。

当模型决定需要某个 skill 时：

1. 调用 `skill` 工具
2. 把 skill 路径传给工具
3. 工具本地读取这个路径对应的文件
4. 返回 `SKILL.md` 全文给模型

代码逻辑非常直接：

```js
skill: ({ skillpath }) => {
  const content = fs.readFileSync(path.resolve(skillpath), 'utf-8');
  return `skill的内容为:${content}`;
}
```

所以 skill 的完整链路可以记成：

```js
先把 skill 简介给模型
-> 模型判断要不要用
-> 调用 skill 工具
-> 本地读取 SKILL.md 全文
-> 返回给模型
-> 模型结合 skill 内容回答
```

### 为什么 PPT 说 skill 体系“还没真的生效”

这一页很关键。

课件的意思不是说 skill 没实现，而是说：

- 现在已经实现了“按需加载 skill 到上下文”
- 但 skill 还只是说明书，不是真正的执行能力

因为 AI 真正要做事情，除了有 skill 说明，还得有对应的“手”，也就是 **function tool**。

所以当前阶段的 skill 更像：

- 参考资料
- 操作说明
- 能力目录

而不是完整的可执行系统。

真正让它像 `Claude Code` 一样具备行动能力，还要继续补工具体系。

### 实现细节补充：这两个正则是在做什么

#### `/^---\s*\n([\s\S]*?)\n---\s*\n/`

这个正则用于提取 markdown 文件最前面的 frontmatter 头部。

- `^---`：从开头匹配 `---`
- `\s*\n`：允许这一行末尾有空白，然后换行
- `([\s\S]*?)`：非贪婪提取中间所有内容
- `\n---\s*\n`：直到遇到结尾分隔符 `---`

作用就是把类似下面这段先截出来：

```md
---
name: vue
description: Vue 相关开发规范
paths:
  - src/**/*.vue
---
```

#### `/paths:\s*\n([\s\S]*?)(?=\n\S|$)/`

这个正则用于只提取 frontmatter 里的 `paths:` 这一块。

- `paths:\s*\n`：定位 `paths:` 的开始
- `([\s\S]*?)`：抓取下面多行内容
- `(?=\n\S|$)`：遇到下一个顶格字段，或者文本结束，就停止

这样可以只拿到：

```md
- src/**/*.vue
- components/**/*.vue
```

然后再继续按 `- xxx` 的格式提取具体路径规则。





## 四。function tool体系(6-5)

这一节承接上一节的结论。

`6-4` 里我们已经把 `skill` 按需加载进上下文了，但课件也明确说了：**skill 还只是说明书，不是真正的执行能力。**

真正让 agent 能“做事”的，是 `function tool` 体系。

### 这一节要解决的核心问题

PPT 里一上来讲的是“本地和 MCP 归一”。

因为真实项目里的工具来源一般有两种：

- 本地 tool
- MCP 提供的 tool

它们在三个地方都有差异：

1. 定义格式不一样
2. 获取方式不一样
3. 调用方式不一样

所以这节课的目标不是单纯“加个工具”，而是把这两种工具统一成一套可用的工具体系。

### 一。为什么先要做归一

如果不归一，你后面的请求层就会很麻烦：

- 本地工具要单独维护一套定义
- MCP 工具又要单独维护一套定义
- 调用时还要区分“这是本地工具还是 MCP 工具”
- 模型返回 `tool_calls` 后，执行层会越来越乱

所以这里的思路很像做接口适配层：

- 不管工具来自哪里
- 最终都整理成统一的数据结构
- 最终都走统一的执行入口

### 二。定义格式归一

PPT 里提到，MCP 的工具天然是 MCP 标准格式，而 OpenAI 请求 `tools` 时又是另一套格式。

这个项目先做的第一步是：

- **本地工具也按 MCP 风格来定义**

```js
{
  define: {
    // 按 mcp 标准格式定义 tool 的名字、描述、入参
  },
  handle(arg) {
    // 工具执行逻辑
  }
}
```

在代码里，本地工具 `skill` 就是这么写的，位置在 `code/src/tools/local/skill.js`：

```js
export default {
  define: {
    name: "skill",
    description: "加载skill的详情时使用",
    inputSchema: {
      type: "object",
      properties: {
        skillpath: {
          type: "string",
          description: "要加载的skill的路径"
        }
      },
      required: ["skillpath"]
    }
  },
  handle({ skillpath }) {
    const content = fs.readFileSync(path.resolve(skillpath), 'utf-8');
    return `skill的内容为:${content}`;
  }
};
```

- required: ["skillpath"]解释：
  - **`skillpath` 这个参数是必填项，调用时必须传入，不能省略**。

你要注意这里已经不是上一节那种简单 `toolList + toolMap` 了，而是把：

- 工具描述
- 输入参数 schema
- 执行逻辑

都包到一个对象里。

### 三。调用和获取方式归一

PPT 第二步讲的是“调用和获取方式归一”。

因为：

- 本地工具平时往往是代码里直接 `import`
- 调用时也是自己找函数名去执行

而 MCP 工具则是：

- 通过 `client.listTools()` 获取
- 通过 `client.callTool()` 调用

为了抹平这层差异，项目里专门做了一个 `LocalClient`，位置在 `code/src/tools/local/LocalClient.js`。

这个类故意模仿 MCP 客户端，提供了三个核心方法：

- `registerTool`
- `listTools`
- `callTool`

这样一来，本地工具在使用方式上就和 MCP 工具接近了。

### 四。LocalClient 是怎么模拟 MCP 的

`LocalClient` 内部用一个 `Map` 存本地工具：

- `registerTool(tool)`：注册本地工具
- `listTools()`：返回所有工具的 `define`
- `callTool({ name, arguments })`：按名字找到工具并执行 `handle`

最关键的是它返回值也故意模仿了 MCP 的 `callTool` 结果格式：

```js
{
  content: [
    {
      type: 'text',
      text: content
    }
  ]
}
```

如果出错，也返回统一的错误结构：

```js
{
  content: [
    {
      type: 'text',
      text: `Error: ${error.message}`
    }
  ],
  isError: true
}
```

这一步非常重要，因为后面执行工具时，就可以不关心“这是本地还是 MCP”，只管拿结果里的 `content[0].text`。

### 五。本地工具如何注册成统一格式

`code/src/tools/local/index.js` 里做了本地工具的统一整理。

流程是：

1. new 一个 `LocalClient`
2. 用 `registerTool()` 注册本地工具
3. 用 `listTools()` 拿到本地工具列表
4. 再额外做一个“工具名 -> client”的映射表

代码核心是：

```js
const localClient = new LocalClient();
localClient.registerTool(skill);

const localTools = localClient.listTools();
const localMap = {};
localTools.tools.forEach((tool) => {
  localMap[tool.name] = localClient;
});
```

这样项目就得到了两份东西：

- `localTools`：给模型看的工具定义数组
- `localMap`：执行时按工具名找到对应 client

### 六。MCP 工具怎么接进来

`code/src/tools/mcp/index.js` 负责读取 MCP 配置、连接 MCP 服务、收集 MCP 工具。

它主要做了这几步：

1. 读取用户目录和项目目录下 `.front/settings.json`
2. 合并其中的 `mcpServer` 配置
3. 按不同类型建立 transport
4. 调用 `client.connect()`
5. 调用 `client.listTools()`
6. 给工具名加上服务名前缀
7. 记录“工具名 -> mcp client”的映射

这里支持几种 MCP 连接类型：

- `stdio`
- `sse`
- `http` / `streamablehttp`

### 七。为什么 MCP 工具名要加服务名前缀

因为不同 MCP 服务里，可能会有同名工具。

比如：

- `serverA` 有个 `search`
- `serverB` 也有个 `search`

如果直接合并，一定冲突。

所以项目里把工具名处理成：

```js
${服务名}__${原工具名}
```

例如：

- `github__search_repositories`
- `browser__navigate`

这样既避免重名，也能反查这个工具属于哪个 client。

### 八。MCP 连接后的最终结果是什么

本质上最终要得到两份数据：

```js
{
  tools: [],
  nameMap: {
    "某个工具名": 对应客户端
  }
}
```

这正对应了 `code/src/tools/index.js` 的设计思路。

它先拿本地工具：

```js
const { localTools, localMap } = getLocalTool();
const tools = [...localTools];
const toolNameMap = { ...localMap };
```

然后再把 MCP 工具继续追加进这两个容器里：链接mcp以及做出对应的映射

```js
linkMcpAndListTool(tools, toolNameMap)
```

所以这里的总目标非常明确：

- `tools`：统一后的工具定义列表
- `toolNameMap`：统一后的工具执行路由表

### 九。OpenAI 和 MCP 的工具格式还不一样，所以还要再转一层

虽然本地工具先按 MCP 风格定义了，但发给 OpenAI 时，格式还是要转成 OpenAI 的 `tools` 协议。

这一步在 `code/src/tools/util.js` 里完成：

```js
export function transformToOpenAi(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }))
}
```

也就是说，项目内部统一偏向 MCP 风格，但真正请求 OpenAI 时，再做一次协议转换。

这样做的好处是：

- 内部只维护一套工具描述结构
- 对外请求哪个模型协议，就临时转成哪个协议

### 十。app.js 这一节最大的变化是什么

`6-5` 的 `app.js` 和上一节相比，最大的变化不是多了一个 import，而是**请求方式改了**。

它引入了：

```js
import toolResult from "./tools/index.js"
```

然后在请求时把工具体系一起传给请求层：

```js
const nowMessage = await getAIResponse({
  openai,
  toolResult,
  contextMessageList: [systemMessage, userContextMessage, userSkillMessage],
  messages: messages
});
```

也就是说：

- `app.js` 不再自己直接拿一次 assistant 文本回复就结束
- 而是把“上下文 + 工具体系 + 当前消息历史”统一交给请求层处理

因为真正的工具调用循环，已经下沉到 `request/index.js` 了。

### 十一。真正的 function tool 调用链在哪里

核心逻辑在 `code/src/request/index.js`。

完整流程可以拆成下面几步：

1. 调用 OpenAI 接口
2. 把统一后的 tools 一起传进去
3. 拿到模型回复
4. 检查是否有 `tool_calls`
5. 如果有，就逐个执行工具
6. 把工具执行结果以 `role: "tool"` 追加到消息里
7. 再次调用模型
8. 直到没有新的工具调用为止

### 十二。第一次请求时是怎么把工具交给模型的

在 `getAIResponse()` 里，请求写法是：

```js
response = await openai.chat.completions.create({
  model: model || config.model || 'doubao-seed-2.0-code',
  messages: [...contextMessageList, ...messages],
  temperature: 0.7,
  tools: transformToOpenAi(toolResult.tools)
});
```

这里你要特别记住两点：

1. 传给模型的上下文，还是 `[固定上下文, 会话历史]`
2. 但现在额外多传了一个 `tools`

也就是说，模型此时不仅能“看上下文回答”，还知道“自己可以调用哪些函数工具”。

#### const { apiKey, baseURL } = config; 这个具体值在那

当前这段代码在 [src/request/index.js](C:/Users/MJL/Desktop/ai学习/ai-project/src/request/index.js) 里：

```
const config = readConfig();
const { apiKey, baseURL } = config;
```

而 `readConfig()` 会按这个顺序去找配置文件：

1. 项目目录下的 `.front/settings.json`
2. 用户主目录下的 `.front/settings.json`

### 十三。模型一旦返回 tool_calls，程序怎么处理

在 `request/index.js` 里，先拿到：

```js
let aiMessage = response.choices[0].message;
messages.push(aiMessage);
```

然后检查：

```js
if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
```

如果模型发起了工具调用，就遍历每一个 `toolCall`：

```js
for (const toolCall of aiMessage.tool_calls) {
  const functionName = toolCall.function.name;
  const functionArgs = JSON.parse(toolCall.function.arguments);
  const excuteResult = await excuteTool(functionName, functionArgs);

  messages.push({
    tool_call_id: toolCall.id,
    role: "tool",
    content: excuteResult
  });
}
```

这里就是标准的 tool use 回填流程：

- assistant 先说“我要调哪个工具”
- 程序真正去执行工具
- 执行结果以 `tool` 消息身份放回消息数组
- 再继续问模型

### 十四。统一执行入口 excuteTool 做了什么

`code/src/tools/index.js` 里提供了统一执行函数：

```js
export async function excuteTool(name, args) {
  const result = await toolNameMap[name].callTool({
    name: name,
    arguments: args
  });
  return result.content[0].text
}
```

这段代码很关键，因为它完全不在乎工具是本地的还是 MCP 的。

它只做两件事：

1. 根据 `toolNameMap[name]` 找到对应 client
2. 调用这个 client 的 `callTool`

由于本地 `LocalClient` 和 MCP client 都已经被整理成相似接口，所以这里可以真正做到统一执行。

### 十五。为什么 getAIResponse 里要递归再调一次自己

工具执行完以后，代码里不是直接返回，而是：

```js
await getAIResponse(questionObj);
```

原因很简单：

- 模型第一次回复，可能只是为了发起工具调用
- 工具结果回填后，模型还要再看一次结果，才能给出最终答复
- 而且一次工具调用后，模型还有可能继续发起下一轮工具调用

所以这个递归调用的本质是：

- 只要模型还在要工具
- 就继续“请求模型 -> 执行工具 -> 回填结果 -> 再请求模型”

直到模型最终只返回普通 assistant 内容，不再请求工具为止。

### 十六。app.js 最后为什么是取最后一个 assistant 消息

因为现在 `messages` 里不再只有用户和 assistant，还会多出：

- assistant 的 tool call 消息
- tool 的执行结果消息
- 再次生成的 assistant 消息

所以 `app.js` 不能像之前那样简单打印单条回复，而是改成：

```js
const lastAssistantMessage = [...nowMessage].reverse().find(msg => msg.role === 'assistant');
```

然后把最后一个 assistant 消息内容展示出来。

这说明从 `6-5` 开始，消息数组已经变成了真正的“多角色协作记录”，而不是简单聊天记录。

### 十七。MCP 为什么要做成异步、非阻塞

PPT 最后一页讲的是优化点。

因为 MCP 往往连接的是第三方服务，它们可能：

- 连接失败
- 启动很慢
- 长时间无响应

所以对于 MCP 工具，设计上应该尽量：

- 异步连接
- 单个服务失败不影响整体
- 不要因为一个 MCP 服务卡住整个应用

代码里也已经体现了这个思路：

- `linkMcpAndListTool()` 是 `async`
- 每个服务都包在 `try/catch` 里
- 单个服务连不上时直接跳过，不中断其他服务

### 这一节可以这样记

- `function tool` 是让 agent 真正具备“手”的能力。
- 项目里的工具来源有两种：本地工具和 MCP 工具。
- `6-5` 的核心是把它们在定义、获取、调用上做归一。
- 本地工具先按 MCP 风格定义，再由 `LocalClient` 模拟 MCP 的 `listTools` 和 `callTool`。
- MCP 工具通过读取 `.front/settings.json` 连接第三方服务，再统一收集工具列表。
- 所有工具先统一成内部结构，再通过 `transformToOpenAi()` 转成 OpenAI 的 `tools` 参数格式。
- 模型返回 `tool_calls` 后，程序执行工具，并把结果以 `role: "tool"` 回填，再递归请求模型。
- 从这一步开始，agent 才从“会看说明书”升级到“能真正做事”。



### 因为学习，所以上面6-5没用landchain，之后的项目用langchain更快配置好



### Object.assign ()

```js
const tar = { a: 1 };
const src1 = { b: 2 };
const src2 = { c: 3, a: 99 }; // a会覆盖前面
const res = Object.assign(tar, src1, src2);

console.log(tar); // { a:99, b:2, c:3 } 原对象被改
console.log(res === tar); // true
```



### 项目的skill覆盖user用户目录的相同的skill

会覆盖。

因为这里的顺序是：

```
const settingsPaths = [
  path.join(getUserHomeDir(), ".front", "settings.json"),
  path.join(getCurrentWorkingDir(), ".front", "settings.json"),
];
```

也就是先读“用户目录”的配置，再读“项目根目录”的配置。然后每次都执行：

```
Object.assign(mergedMcpServer, parsedConfig.mcpServer || {});
```

`Object.assign` 的行为是：后面的同名键会覆盖前面的同名键。

所以如果两边都有同一个 MCP server 名，比如：

```
// 用户目录
{
  "mcpServer": {
    "github": { "type": "stdio", "command": "xxx" }
  }
}
// 项目根目录
{
  "mcpServer": {
    "github": { "type": "sse", "url": "http://localhost:3001/sse" }
  }
}
```

最终 `mergedMcpServer.github` 会是“项目根目录”这份，也就是项目配置覆盖用户配置。



### getToolRuntime为什么起这个名字，它和time有什么关系吗

这里的 `runtime` 不是“时间”的意思，是“运行时”的意思，英文里 `runtime` 在编程语境下通常指“程序运行时所需要的一组实际对象、状态和能力”。

所以 `getToolRuntime()` 的含义不是“获取工具时间”，而是“获取工具运行时环境”或者更准确一点，“组装并返回当前这次运行要用到的工具体系”。



### entries解释

```js
const serverEntries = Object.entries(mcpServerConfig);
for (const [serverName, serverConfig] of serverEntries) {
```

```js
const tar = { a: 1, b: 2, c: 99 };
const arr = Object.entries(tar);
console.log(arr);
// [ ['a', 1], ['b', 2], ['c', 99] ]

const user = { name: "小明", age: 18 };
for (const [key, value] of Object.entries(user)) {
  console.log(key, value);
}
// name 小明
// age 18
```



### this.toolMap.set(tool.define.name, tool);解释

### 核心作用

- key 不存在：新增一条键值对
- key 已存在：**覆盖原有 value**

```js
// 1. 初始化空Map
const toolMap = new Map();

// 2. 存入工具，key为工具名称字符串
toolMap.set("searchTool", searchFn);
toolMap.set("calcTool", calcFn);

// 3. 链式连续set
toolMap.set("weather", getWeather).set("dbQuery", queryDB);

// 4. 覆盖同名key（更新工具）
toolMap.set("searchTool", newSearchFn);

// 读取工具
const tool = toolMap.get("searchTool");
```



### 费曼

### 你复述请求大模型流程逻辑缺失

1. 调用 AI 接口时，必须把转换后的 tools 数组传入请求参数，让模型知晓可用工具；
2. 配置读取规则：apiKey、baseURL 从项目 / 用户目录两层 settings.json 读取；
3. 模型返回消息后，判断是否存在 tool_calls：
   - 解析工具名、入参，调用统一执行函数 executeTool
   - executeTool 依靠全局 toolNameMap 匹配对应客户端，统一调用 callTool，无视本地 / MCP 来源
   - 工具执行结果封装为 role=tool 的消息，追加进消息列表

这一节讲 function tool 体系，核心是让 AI Agent 真正拥有执行操作的能力，解决本地工具和 MCP 远程工具不兼容的问题，做三层归一：定义格式、获取方式、调用方式。

首先，不归一的痛点是两套工具要分开维护定义、调用时还要区分来源，执行逻辑会越来越乱，所以做一层适配层，把所有工具统一成一套标准结构、一套调用入口。

第一步统一定义格式：本地工具不再用简单列表，全部按照 MCP 标准编写，每个工具对象包含 define 和 handle 两块，define 里写明工具名称、描述、入参 schema，标注必填参数；handle 是工具实际运行逻辑。

第二步统一获取和调用方式：原生本地工具靠 import 硬编码调用，MCP 工具靠客户端 listTools、callTool 操作，两者 API 不一样。我们封装 LocalClient 类完整模拟 MCP 客户端，提供 registerTool 注册、listTools 拉取定义、callTool 执行三大方法，内部用 Map 存储本地工具，并且返回值、报错格式和 MCP 完全一致，上层不用区分工具来源。

本地工具统一注册流程：实例化 LocalClient，注册所有 skill，导出标准化工具列表，同时生成 “工具名对应 LocalClient” 的映射表。

然后接入 MCP 工具：读取两层目录的配置文件，支持多种传输通道连接 MCP 服务；不同 MCP 服务会出现同名工具，所以给工具名拼接服务前缀避免冲突；每个 MCP 服务也生成专属客户端映射。MCP 连接设计为异步容错，单个服务连失败不会影响整体。

之后合并全部工具：本地、MCP 工具合并到同一个 tools 数组，映射表合并为全局 toolNameMap，作为统一调度依据。

虽然内部统一 MCP 格式，但调用 OpenAI 大模型需要专用协议，所以写转换函数 transformToOpenAi，把内部 MCP 工具转换成 OpenAI 支持的 function 格式传给接口。

完整调用流程在 request 请求层：发起 AI 请求时携带转换后的 tools，模型识别后如果返回 tool_calls，就解析工具名称和参数，调用统一执行函数 executeTool；函数通过全局映射找到对应客户端，调用 callTool 执行工具，拿到结果封装成 tool 角色消息追加到会话列表。

工具结果回填后，递归重新请求大模型，循环往复，直到模型不再调用工具、只输出文本。此时消息列表混合多种角色，需要反向筛选最后一条 assistant 消息作为最终回答。




# 要是自己提示词复杂，那就可以在md文件写好，然后@给ai就行



# 当你看完后开发文档或者视频不知道怎么做，可以直接开启ai的plan模式，让ai询问你细节







# 你可以自行测试一个文件是否有问题

```js
....
export async function readSystemContext() {
  const template = await fs.readFile(SYSTEM_DOC_PATH, "utf-8");
  const systemInfo = getSystemInfo();
  const workPath = process.cwd();

  return template
    .replaceAll("${systemInfo}", systemInfo)
    .replaceAll("${workPath}", workPath);
}

/**
 * 获取当前用户操作系统信息。
 *
 * @returns {string} 操作系统信息字符串
 */
export function getSystemInfo() {
  return `${os.platform()} ${os.release()} (${os.arch()})`;
}
readSystemContext().then(res=>{
    console.log(res,'res');
});
console.log(getSystemInfo(),'getSystemInfo');


export default {
  readSystemContext,
  getSystemInfo,
};

```

- 运行node contextReader.js就可以看到是否问题

### 知识补充

```js
const __filename = fileURLToPath(import.meta.url);
console.log(__filename,import.meta.url);//C:\Users\MJL\Desktop\ai学习\ai-project\src\utils\contextReader.js 
file:///C:/Users/MJL/Desktop/ai%E5%AD%A6%E4%B9%A0/ai-proje
ct/src/utils/contextReader.js
```

- 这个使用了import.meta.url,运行路径不能是/Desktop/ai学习/ai-project/src/utils (main)，而应该是从根目录(即~/Desktop/ai学习/ai-project)开始运行node src/utils/contextReader.js

# codex追求目标选项

- 普通对话：你发指令→AI 做一步→你检查→再发指令；

- 开启 goal 后：AI 自动拆任务、改代码、跑测试、对照 spec 验收；**直到满足 goal 的完成条件才主动停止**，中间不用你反复回车触发工作
