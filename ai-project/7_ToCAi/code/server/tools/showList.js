import { tool } from "@langchain/core/tools";
import { z } from "zod";

export default tool(
    async ({ productList }) => {
        const result = {
            type: "card",
            name: "listCard",
            data: productList
        }
        return JSON.stringify(result);
    },
    {
        name: "showList",
        description: "前端展示工具，当需要向用户展示商品列表时调用此工具，此工具会返回json，携带此json回答用户",
        schema: z.object({
            productList: z.array(z.record(z.any())).describe("要展示的商品列表")
        }),
    }
);
