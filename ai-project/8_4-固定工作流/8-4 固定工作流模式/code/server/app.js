import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { runChatWorkflow } from './workflow/chatWorkflow.js';

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
    const { message } = req.body;

    historyMessages.push({ role: 'user', content: message });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 执行固定工作流，传入 res 用于流式输出
    const assistantResponse = await runChatWorkflow(message, res);

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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
