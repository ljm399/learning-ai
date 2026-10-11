import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyFile = path.join(__dirname, "../doc/退货标准.md");

const apiKey = process.env.API_KEY;

const model = new ChatOpenAI({
    model: "deepseek-v4-flash",
    apiKey,
    configuration: {
        baseURL: "https://api.deepseek.com",
    },
});

export default tool(
    async ({ order_info, return_reason }) => {
        const policy = fs.readFileSync(policyFile, "utf-8");
        // Orders have historically used both names; the backend expects productId.
        const productId = order_info?.productId ?? order_info?.orderId;

        if (productId === undefined || productId === null || productId === "") {
            return "退货处理失败：订单信息缺少商品 ID";
        }

        console.log(order_info,'order_info');
        
        const systemPrompt = `你是退货审核助手。请根据以下退货标准，判断用户的退货申请是否可以直接退货。
今天的日期为${new Date().toLocaleDateString('zh-CN')}

退货标准：
${policy || "（暂无具体退货标准，请根据常识判断）"}

重要约束：
1. 你只能返回两种结果之一："可以直接退货" 或 "需要申请退货"
2. 不要返回任何解释、说明或其他内容`;

        const userPrompt = `订单信息：
${JSON.stringify(order_info, null, 2)}

退货理由：
${return_reason}`;

        try {
            const res = await model.invoke([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            const content = res.content.trim();
            console.log(content,"content");
            

            if (content.includes("可以直接退货")) {
                const response = await fetch("http://localhost:5000/return", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productId }),
                });
                if (!response.ok) {
                    return `直接退货失败：${response.status} ${response.statusText}`;
                }

                return "退货成功啦";
            }
            const response = await fetch("http://localhost:5000/applyreturn", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
            });
            if (!response.ok) {
                return `申请退货失败：${response.status} ${response.statusText}`;
            }

            return '你的退货申请，我们已经收到，请等待审核';
        } catch (error) {
            console.error("退货处理失败:", error);
            return "退货处理失败，请稍后重试";
        }
    },
    {
        name: "return_audit",
        description: "当用户需要退货时，调用此工具审核该退货申请。传入订单信息、退货理由，AI判断后直接退货或提交退货申请",
        schema: z.object({
            order_info: z.record(z.any()).describe("订单信息对象，包含 productId/orderId、商品、金额和时间等字段"),
            return_reason: z.string().describe("用户的退货理由"),
        }),
    }
);
