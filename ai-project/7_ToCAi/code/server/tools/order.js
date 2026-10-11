import { tool } from "@langchain/core/tools";
import { z } from "zod";

function getOneYearAgoTimestamp() {
    const now = new Date();
    now.setFullYear(now.getFullYear() - 1);
    return now.getTime();
}

export default tool(
    async () => {
        //获取一年前的日期
        const date = getOneYearAgoTimestamp();
        try {
            const response = await fetch(`http://localhost:5000/orders?date=${date}`);
            if (!response.ok) {
                return `获取订单失败：${response.status} ${response.statusText}`;
            }
            const data = await response.json();
            return JSON.stringify(data.data);
        } catch (error) {
            console.error("获取订单失败:", error);
            return "获取订单失败，请稍后重试";
        }
    },
    {
        name: "get_orders",
        description: "获取一年内的订单列表",
        schema: z.object({}),
    }
);
