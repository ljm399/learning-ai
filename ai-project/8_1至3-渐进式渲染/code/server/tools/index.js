import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// 获取当前目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 工具管理对象
const toolsManager = {
    // 存储所有工具
    tools: {},

    // 初始化，加载所有工具
    async init() {
        const toolDir = path.join(__dirname, 'tool');

        // 清空现有工具
        this.tools = {};

        // 读取工具目录下的所有文件
        const toolFiles = fs.readdirSync(toolDir);

        // 导入每个工具
        for (const file of toolFiles) {
            if (file.endsWith('.js')) {
                const toolPath = path.join(toolDir, file);
                const toolModule = await import(pathToFileURL(toolPath));
                const tool = toolModule.default;
                const toolName = tool.function?.name || tool.name;
                this.tools[toolName] = tool;
            }
        }

        return this;
    },

    // 获取所有工具
    getAllTools() {
        return Object.values(this.tools);
    },

    // 根据名称获取特定工具
    getTool(name) {
        return this.tools[name];
    },

    // 执行工具
    async executeTool(name, ...args) {
        const tool = this.tools[name];

        if (!tool) {
            throw new Error(`Tool "${name}" not found`);
        }

        if (typeof tool.func !== 'function') {
            throw new Error(`Tool "${name}" does not have a callable function`);
        }

        try {
            return await tool.func(...args);
        } catch (error) {
            throw new Error(`Error executing tool "${name}": ${error.message}`);
        }
    },
};

export default toolsManager;