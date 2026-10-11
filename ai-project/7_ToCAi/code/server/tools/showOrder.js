import { tool } from "@langchain/core/tools";
import { z } from "zod";

export default tool(
    async ({ order }) => {
        const result = {
            type: "card",
            name: "orderCard",
            data: order
        }
        return JSON.stringify(result);
    },
    {
        name: "showOrder",
        description: "前端展示工具，当需要向用户展示订单详情或订单卡片时调用此工具，此工具会返回json，携带此json回答用户",
        schema: z.object({
            order: z.record(z.any()).describe("要展示的订单信息，包含订单号、状态、商品、金额、时间等字段")
        }),
    }
);
