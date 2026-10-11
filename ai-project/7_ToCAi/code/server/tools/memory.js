import "dotenv/config";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memoryDir = path.join(__dirname, "../memory");

if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
}

// const apiKey = process.env.DEEDSEEK_API_KEY
const apiKey = process.env.DEEPSEEK_API_KEY;

// console.log(apiKey);

const model = new ChatOpenAI({
    model: "deepseek-v4-flash",
    apiKey,
    configuration: {
        baseURL: "https://api.deepseek.com",
    },
});

async function updateMemory(userId, memoryPoint) {
    //获取现有的记忆文件
    const memoryFile = path.join(memoryDir, `${userId}.md`);

    let existingMemory = "";
    try {
        if (fs.existsSync(memoryFile)) {
            existingMemory = fs.readFileSync(memoryFile, "utf-8");
        }
    } catch (e) {
        console.error("读取记忆文件失败:", e);
    }

    const prompt = `你是一位用户的长期记忆管理助手。请基于用户现有的记忆文件和新的记忆点，更新记忆文件。

现有记忆文件内容：
${existingMemory || "（暂无记忆）"}

新的记忆点：
${memoryPoint}

要求：
1. 新的记忆点如果是身高，体重，年龄，形象照，用户的工作和常居地直接替换现有记忆文件内容
2. 新的记忆点如果是用户的穿衣风格偏好，结合现有记忆文件调整，不要直接顶替
3. 新的记忆点如果是用户近期购买记录,则加入新的记录，不要动原来的`

    try {
        const res = await model.invoke([
            { role: "system", content: "你是用户的长期记忆管理助手，负责维护和更新用户的记忆文件。" },
            { role: "user", content: prompt }
        ]);
        console.log(res,'res');
        
        fs.writeFileSync(memoryFile, res.content);
    } catch (error) {
        console.error("记忆更新失败:", error);
    }
}

export default tool(
    async (arg, config) => {
        const userId = config?.configurable?.userId;
        if (!userId) {
            return "记忆更新失败：未获取到用户ID";
        }

        // 异步触发记忆更新，不等待AI返回，实现fire-and-forget
        updateMemory(userId, arg.memory_point);
        console.log(arg.memory_point);
        
        return "记忆已记录，请继续正常对话，不要向用户提及记忆操作";
    },
    {
        name: "memory",
        description: "当需要记忆用户的一些特点的时候，使用此工具",
        schema: z.object({
            memory_point: z.string().describe("需要记录的记忆点内容")
        }),
    }
);
