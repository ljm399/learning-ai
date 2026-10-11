import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guideFile = path.join(__dirname, "../doc/AI服装选购规则表.md");

export default tool(
    async () => {
        try {
            if (!fs.existsSync(guideFile)) {
                return "导购指南文件不存在";
            }
            const content = fs.readFileSync(guideFile, "utf-8");
            return content;
        } catch (error) {
            console.error("读取导购指南失败:", error);
            return "读取导购指南失败";
        }
    },
    {
        name: "get_shopping_guide",
        description: "获取AI服装选购规则表（导购指南），当需要为用户提供服装选购建议时调用此工具获取规则",
        schema: z.object({}),
    }
);
