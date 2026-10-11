import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { generateToken } from './utils/token.js';
import { authMiddleware, loadUsers } from './utils/auth.js';
import { getAllConvertByUserId, getConvertByCid, createConvert, getConvertsFilePath } from './utils/convertUtils.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getGraph, generateTitle } from './utils/llm.js';
import fs from "fs"
import { fileURLToPath } from 'url';
import { getSystemContext } from './utils/docUtils.js';
import { parseImageToBase64 } from './utils/fileUtils.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userImageDir = path.join(__dirname, 'userImage');
if (!fs.existsSync(userImageDir)) {
    fs.mkdirSync(userImageDir, { recursive: true });
}

app.use('/userImage', express.static(userImageDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, userImageDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'));
        }
    }
});

// 验证token中间件
app.use(authMiddleware);
//获取系统上下文
const systemContext = getSystemContext();
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ code: 400, message: '上传失败，未接收到文件' });
    }
    const url = `http://localhost:3000/userImage/${req.file.filename}`;
    res.json({ code: 200, data: { url } });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const users = loadUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        const token = generateToken(user.id);
        return res.json({
            code: 200,
            message: '登录成功',
            data: {
                id: user.id,
                username: user.username,
                token
            }
        });
    } else {
        return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }
});
app.get('/chat/list', async (req, res) => {

    const list = getAllConvertByUserId(req.userId);
    const needGenerate = []
    //过滤出所有标题是新对话的内容
    Object.keys(list)
        .forEach((key) => {
            let item = list[key]
            if (item.title === '新对话' && item.messages.length > 0) {
                needGenerate.push({
                    cid: key,
                    item: item
                })
            }
        })

    if (needGenerate.length > 0) {
        const titles = await Promise.all(
            //给新标题并发生成标题
            needGenerate.map((item) => generateTitle(item.item.messages, item.cid))
        );
        titles.forEach((title) => {
            //根据cid找到原来的,修改title
            list[title.cid].title = title.content
        })
        //修改后写入
        const filePath = getConvertsFilePath(req.userId);
        fs.writeFileSync(filePath, JSON.stringify(list));
    }
    //提取出cid和标题返回
    const data = Object.entries(list).map(([cid, item]) => ({ cid, title: item.title }));
    res.json({ code: 200, data });
});
app.get('/chat/detail', (req, res) => {
    const { cid } = req.query;
    if (!cid) {
        return res.status(400).json({ code: 400, message: '缺少 cid 参数' });
    }

    const convert = getConvertByCid(req.userId, cid);

    if (!convert) {
        return res.status(404).json({ code: 404, message: '对话不存在' });
    }

    res.json({ code: 200, data: convert });
});
app.post('/chat/create', (req, res) => {
    const { cid, convert } = createConvert(req.userId);
    res.json({ code: 200, data: { cid, ...convert } });
});
app.post('/chat/send', async (req, res) => {
    const { cid, message } = req.body
    res.writeHead(200, {
        'Content-Type': 'text/event-stream;charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })
    //调用图，从来请求大模型
    const graph = getGraph();

    let humanMessage;
    if (Array.isArray(message)) {
        // OpenAI 格式：content 为数组，可能包含 text 和 image_url
        const processedContent = message.map(item => {
            if (item.type === 'image_url' && item.image_url?.url) {
                //base64转化，如果你的图片是公网可访问的，不用这一步
                const { dataUrl } = parseImageToBase64(item.image_url.url);
                return { type: 'image_url', image_url: { url: dataUrl } };
            }
            return item;
        });
        humanMessage = new HumanMessage({ content: processedContent });
    } else {
        humanMessage = new HumanMessage(message);
    }


    // 读取用户记忆文件
    const memoryPath = path.join(__dirname, 'memory', `${req.userId}.md`);
    let memoryContent = '';
    if (fs.existsSync(memoryPath)) {
        memoryContent = fs.readFileSync(memoryPath, 'utf-8');
    }

    // 组装额外消息：系统上下文和用户记忆分别作为独立的 system 消息
    const extraMessages = [new SystemMessage(systemContext)];
    if (memoryContent) {
        extraMessages.push(new SystemMessage(`## 用户记忆\n${memoryContent}`));
    }

    const stream = graph.streamEvents(
        { messages: [humanMessage] },
        {
            configurable: {
                userId: req.userId,
                sessionId: cid,
                //以后有要带上，但是不写入记录的内容，就在extraMessage这里传过去，比如rag搜索到的内容
                extraMessage: extraMessages
            },
            version: "v2"
        }
    )
    // const arr = [];
    for await (const event of stream) {
        //langchain会把工具里的调用model的返回也下发，所以这里特别判断了下不是agent才继续
        if (event.metadata?.langgraph_node !== 'agent') continue;
        // arr.push(event);
        //如果event是on_chat_model_stream，才代表是ai的返回了
        if (event.event === 'on_chat_model_stream') {
            const chunk = event.data.chunk;
            if (chunk.content) {
                res.write(`data: ${JSON.stringify({ type: "assistant", content: chunk.content, id: chunk.id })}\n\n`)
            }
        }
    }
    // fs.writeFileSync("./a.json", JSON.stringify(arr))
    res.write(`data: ${JSON.stringify({ type: "done" })}`)
    res.end();
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
