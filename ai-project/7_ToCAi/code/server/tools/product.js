import { tool } from "@langchain/core/tools";
import { z } from "zod";

export default tool(
    async ({ type }) => {
        try {

            const response = await fetch(`http://localhost:5000/search?type=${type}`);
            if (!response.ok) {
                return `搜索商品失败：${response.status} ${response.statusText}`;
            }
            //把业务后端接口返回的商品列表，再给到大模型
            const data = await response.json();
            return JSON.stringify(data);
        } catch (error) {
            console.error("搜索商品失败:", error);
            return "搜索商品失败，请稍后重试";
        }
    },
    {
        name: "search_products",
        description: "当大模型明确了要给用户购买什么后调用此工具获取商品列表",
        schema: z.object({
            type: z.string().describe("服装种类，如羽绒服，t桖，牛仔裤等等"),
        }),
    }
);
