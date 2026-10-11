import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeWorkflowWithStreaming } from './workflow/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 模拟商品查询接口
app.post('/api/query-products', (req, res) => {
  console.log('[模拟接口] 查询商品');
  // 直接返回固定的商品数据
  const result = [
    {
      id: 1,
      name: '白色法式连衣裙',
      category: 'dress',
      price: 399,
      description: '优雅法式风格，收腰设计显瘦，适合约会或聚会',
      keywords: ['法式', '收腰', '优雅']
    },
    {
      id: 13,
      name: '白色小白鞋',
      category: 'shoes',
      price: 299,
      description: '百搭小白鞋，舒适好走，搭配任何风格',
      keywords: ['小白鞋', '百搭', '舒适']
    },
    {
      id: 16,
      name: '简约金属项链',
      category: 'accessory',
      price: 129,
      description: '简约设计，点缀造型，提升精致感',
      keywords: ['项链', '简约', '精致']
    }
  ];

  res.json({ products: result });
});

let historyMessages = [];

app.post('/api/chat', async (req, res) => {
  try {
    const { message, token } = req.body;

    historyMessages.push({ role: 'user', content: message });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 读取工作流配置
    const workflowPath = path.join(__dirname, './data/workflow.json');
    const workflowData = JSON.parse(await fs.readFile(workflowPath, 'utf-8'));

    console.log('[API] 工作流配置加载成功');

    // 执行工作流，传入 token
    const assistantResponse = await executeWorkflowWithStreaming(workflowData, message, res, token);

    historyMessages.push({ role: 'assistant', content: assistantResponse });

    res.write('data: [DONE]\n\n');
    res.end();

    await fs.writeFile('./history.json', JSON.stringify(historyMessages, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error:', error);
    // 如果响应还没结束，发送错误
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

// 保存工作流接口
app.post('/flow/save', async (req, res) => {
  try {
    const flowData = req.body;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `workflow-${timestamp}.json`;
    const filePath = `./data/${fileName}`;

    // 确保 data 目录存在
    try {
      await fs.access('./data');
    } catch {
      await fs.mkdir('./data', { recursive: true });
    }


    // 同时保存一个 latest.json 方便获取最新版本
    await fs.writeFile('./data/workflow.json', JSON.stringify(flowData, null, 2), 'utf-8');

    console.log(`[工作流保存] 已保存到: ${filePath}`);

    res.json({
      success: true,
      message: '工作流保存成功',
      path: filePath,
      fileName: fileName
    });
  } catch (error) {
    console.error('[工作流保存] 错误:', error);
    res.status(500).json({ success: false, message: '保存失败: ' + error.message });
  }
});


// 登录验证接口
app.post('/api/login', (req, res) => {
  const { token } = req.body;
  console.log('[登录验证] 收到token:', token);
  // 固定返回成功
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
