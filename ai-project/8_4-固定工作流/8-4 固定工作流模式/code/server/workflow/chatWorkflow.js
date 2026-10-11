import OpenAI from 'openai';
import config from '../config.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { productsData } from '../data/products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  baseURL: config.API_URL,
  apiKey: config.API_KEY,
  dangerouslyAllowBrowser: true
});

// 节点名称定义
export const WORKFLOW_STAGES = {
  QUERY_GUIDES: 'query_guides',
  ANALYZE_CATEGORIES: 'analyze_categories',
  QUERY_PRODUCTS: 'query_products',
  AI_RESPONSE: 'ai_response'
};

export const STAGE_NAMES = {
  query_guides: '查询穿搭攻略',
  analyze_categories: '分析推荐品类',
  query_products: '查询商品',
  ai_response: 'AI 生成回复'
};

// 缓存攻略内容
let guidesContentCache = null;

/**
 * 读取穿搭攻略md文档
 */
async function loadGuidesContent() {
  if (guidesContentCache) {
    return guidesContentCache;
  }
  const guidePath = path.join(__dirname, '../doc/fashion-guide.md');
  guidesContentCache = await fs.readFile(guidePath, 'utf-8');
  return guidesContentCache;
}

/**
 * 发送状态更新到前端
 */
function sendStageUpdate(res, stage, status, data = null) {
  const payload = {
    type: 'stage',
    stage,
    stageName: STAGE_NAMES[stage],
    status, // 'start', 'done'
    data
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 模块1：查询推荐攻略模块
 */
export async function queryRecommendGuides(userQuestion) {
  console.log('[模块1] 查询穿搭攻略模块启动');
  const guidesText = await loadGuidesContent();
  // 把整个攻略作为一个对象返回
  return [{ id: 1, title: '服装搭配全攻略', content: guidesText }];
}

/**
 * 模块2：AI分析推荐商品模块
 */
export async function analyzeRecommendCategories(guides, userQuestion) {
  console.log('[模块2] AI分析推荐商品模块启动');

  const guidesText = guides[0].content;

  const prompt = `用户的问题是：${userQuestion}

以下是服装搭配攻略：
${guidesText}

请根据用户问题和攻略内容，直接推荐一个最合适的商品名称或者商品种类，如果没有特别合适的具体商品，就推荐一个服装品类。
比如法式连衣裙，可爱款短袖
只返回商品名称或品类名称，不要其他文字。`;

  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    let result = response.choices[0]?.message?.content?.trim() || 'dress';

    // 清理可能的多余字符
    result = result.replace(/^["']|["']$/g, '').trim();

    console.log('[模块2] AI推荐结果:', result);
    return result;
  } catch (error) {
    console.error('[模块2] AI分析出错:', error);
    return ' ';
  }
}

/**
 * 模块3：查询商品数据模块 - 调用模拟接口
 */
export async function queryProductsByCategories(recommendResult) {
  console.log('[模块3] 查询商品数据模块启动，推荐结果:', recommendResult);

  // 判断是商品名称还是品类
  const matchedProduct = productsData.find(p => p.name === recommendResult);
  let categories = [];

  if (matchedProduct) {
    // 是具体商品，使用该商品的品类
    categories = [matchedProduct.category];
  } else {
    // 是品类，直接使用
    categories = [recommendResult];
  }

  try {
    // 调用本地模拟接口
    const response = await fetch('http://localhost:3000/api/query-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories })
    });

    let data = await response.json();

    // 如果是具体商品，优先展示这个商品
    if (matchedProduct) {
      const otherProducts = data.products.filter(p => p.name !== recommendResult);
      data.products = [matchedProduct, ...otherProducts];
    }

    console.log('[模块3] 查询到商品数量:', data.products.length);
    return data.products;
  } catch (error) {
    console.error('[模块3] 调用模拟接口失败，使用本地查询:', error.message);
    // 降级到本地查询
    let matchedProducts = productsData.filter(product =>
      categories.includes(product.category)
    );

    // 如果是具体商品，优先展示这个商品
    if (matchedProduct) {
      const otherProducts = matchedProducts.filter(p => p.name !== recommendResult);
      matchedProducts = [matchedProduct, ...otherProducts];
    }

    const result = [];
    const categoryCount = {};
    for (const product of matchedProducts) {
      if (!categoryCount[product.category]) categoryCount[product.category] = 0;
      if (categoryCount[product.category] < 3) {
        result.push(product);
        categoryCount[product.category]++;
      }
    }
    return result;
  }
}

/**
 * 模块4：AI流式输出最终回复
 */
export async function aiStreamResponse(products, guides, userQuestion, recommendResult, res) {
  console.log('[模块4] AI流式输出回复模块启动');

  const guidesText = guides[0].content;

  const productsText = products.map(product =>
    `【${product.name}】\n价格: ¥${product.price}\n分类: ${product.category}\n描述: ${product.description}`
  ).join('\n\n')

  // 判断是商品名称还是品类
  const isProduct = productsData.some(p => p.name === recommendResult);
  const recommendInfo = isProduct
    ? `重点推荐商品：${recommendResult}`
    : `推荐品类：${recommendResult}`;

  const prompt = `用户的问题是：${userQuestion}

以下是服装搭配攻略：
${guidesText}

${recommendInfo}

以下是可供推荐的商品：
${productsText}

请根据以上信息，给用户一个友好的穿搭推荐回复。回复需要：
1. 先回应用户的问题
2. 简单介绍适合的风格和穿搭要点
3. 推荐合适的商品，并说明推荐理由
4. 保持语气亲切自然

请直接给出回复内容，不要使用JSON格式。`;

  const stream = await openai.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    temperature: 0.7
  });

  let fullResponse = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
    }
  }

  console.log('[模块4] 流式输出完成');
  return fullResponse;
}

/**
 * 主工作流：按顺序执行所有模块并流式输出
 */
export async function runChatWorkflow(userQuestion, res) {
  console.log('===== 聊天工作流启动 =====');

  try {
    // 步骤1：查询推荐攻略
    sendStageUpdate(res, WORKFLOW_STAGES.QUERY_GUIDES, 'start');
    const guides = await queryRecommendGuides(userQuestion);
    sendStageUpdate(res, WORKFLOW_STAGES.QUERY_GUIDES, 'done', { count: guides.length });

    // 步骤2：AI分析推荐商品种类
    sendStageUpdate(res, WORKFLOW_STAGES.ANALYZE_CATEGORIES, 'start');
    const recommendResult = await analyzeRecommendCategories(guides, userQuestion);
    sendStageUpdate(res, WORKFLOW_STAGES.ANALYZE_CATEGORIES, 'done', { recommendResult });

    // 步骤3：查询商品数据
    sendStageUpdate(res, WORKFLOW_STAGES.QUERY_PRODUCTS, 'start');
    const products = await queryProductsByCategories(recommendResult);
    sendStageUpdate(res, WORKFLOW_STAGES.QUERY_PRODUCTS, 'done', { count: products.length });

    // 步骤4：AI流式输出最终回复
    sendStageUpdate(res, WORKFLOW_STAGES.AI_RESPONSE, 'start');
    const finalResponse = await aiStreamResponse(products, guides, userQuestion, recommendResult, res);
    sendStageUpdate(res, WORKFLOW_STAGES.AI_RESPONSE, 'done');

    console.log('===== 聊天工作流完成 =====');
    return finalResponse;
  } catch (error) {
    console.error('工作流执行出错:', error);
    throw error;
  }
}
