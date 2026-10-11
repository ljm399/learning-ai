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

// 节点类型定义
export const NODE_TYPES = {
  REQUEST_API: 'request_api',
  GET_FASHION_GUIDE: 'get_fashion_guide',
  AI_SELECT_PRODUCT: 'ai_select_product',
  AI_FILTER_PRODUCTS: 'ai_filter_products',
  CUSTOM_LLM: 'custom_llm'
};

export const NODE_NAMES = {
  orchestrator: '编排主Agent',
  request_api: '请求接口节点',
  get_fashion_guide: '获取服装推荐攻略节点',
  ai_select_product: 'AI选品Agent',
  ai_filter_products: 'AI筛选商品Agent',
  custom_llm: '自定义上下文Agent'
};

// 缓存攻略内容
let guidesContentCache = null;
// 缓存编排提示词
let orchestratorPromptCache = null;

/**
 * 深度遍历对象，替换字符串中的模板变量 {变量名}
 */


function replaceTemplateParams(obj, context) {
  if (typeof obj === 'string') {
    // 替换字符串中的模板变量
    return obj.replace(/\{(\w+)\}/g, (match, key) => {
      if (context.hasOwnProperty(key)) {
        const value = context[key];
        // 如果是对象或数组，转成JSON字符串；否则直接转字符串
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return match; // 没有找到对应的变量，保持原样
    });
  } else if (Array.isArray(obj)) {
    // 递归处理数组
    return obj.map(item => replaceTemplateParams(item, context));
  } else if (obj !== null && typeof obj === 'object') {
    // 递归处理对象
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = replaceTemplateParams(obj[key], context);
      }
    }
    return result;
  }
  return obj; // 其他类型直接返回
}

/**
 * 发送状态更新到前端
 */
function sendStageUpdate(res, stage, status, data = null, frontendHint = null) {
  const payload = {
    type: 'stage',
    stage,
    stageName: NODE_NAMES[stage] || stage,
    status,
    data,
    frontendHint
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 读取编排提示词
 */
async function loadOrchestratorPrompt() {
  if (orchestratorPromptCache) {
    return orchestratorPromptCache;
  }
  const promptPath = path.join(__dirname, '../doc/orchestrator-prompt.md');
  orchestratorPromptCache = await fs.readFile(promptPath, 'utf-8');
  return orchestratorPromptCache;
}

/**
 * 编排主Agent - 决定调用哪些节点
 */
export async function orchestratorAgent(userQuestion) {
  console.log('[编排主Agent] 分析用户问题，决定节点执行计划');

  const systemPrompt = await loadOrchestratorPrompt();
  const prompt = `用户的问题是：${userQuestion}

${systemPrompt}

请直接返回JSON，不要其他文字。在返回的JSON中，确保将 {userQuestion} 替换为实际的用户问题内容。`;

  const response = await openai.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  });

  let result = response.choices[0]?.message?.content?.trim() || '';

  // 尝试提取JSON
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    result = jsonMatch[0];
  }

  const plan = JSON.parse(result);
  console.log('[编排主Agent] 执行计划:', JSON.stringify(plan, null, 2));
  return plan;

}

/**
 * 节点1：请求接口节点
 */
export async function nodeRequestApi(params, context) {
  console.log('[节点1] 请求接口节点启动，params:', params);

  const { url = 'http://localhost:3000/api/query-products', method = 'POST', body = {}, data = {} } = params;

  try {
    // 支持 data 或 body 字段
    const requestBody = Object.keys(data).length > 0 ? data : body;

    // 如果有推荐结果且请求体为空，添加到请求体
    if (context.recommendResult && Object.keys(requestBody).length === 0) {
      requestBody.categories = [context.recommendResult];
    }

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();
    console.log('[节点1] 接口返回数据量:', responseData.products?.length || 0);
    return { products: responseData.products || [] };
  } catch (error) {
    console.error('[节点1] 接口请求失败，使用本地数据:', error.message);
    // 降级到本地查询
    return { products: productsData.slice(0, 5) };
  }
}

/**
 * 节点2：获取服装推荐攻略节点
 */
export async function nodeGetFashionGuide(params, context) {
  console.log('[节点2] 获取服装推荐攻略节点启动');

  if (guidesContentCache) {
    console.log('[节点2] 使用缓存的攻略');
    return { guides: [{ id: 1, title: '服装搭配全攻略', content: guidesContentCache }] };
  }

  try {
    const guidePath = path.join(__dirname, '../doc/fashion-guide.md');
    guidesContentCache = await fs.readFile(guidePath, 'utf-8');
    console.log('[节点2] 攻略加载成功');
    return { guides: [{ id: 1, title: '服装搭配全攻略', content: guidesContentCache }] };
  } catch (error) {
    console.error('[节点2] 攻略加载失败:', error);
    return { guides: [{ id: 1, title: '服装搭配全攻略', content: '这是一份服装搭配攻略...' }] };
  }
}

/**
 * 节点3：AI选品Agent - 根据攻略和用户需求选定具体商品或商品种类
 */
export async function nodeAiSelectProduct(params, context) {
  console.log('[节点3] AI选品Agent启动');

  const { userQuestion } = params;
  const guides = context.guides || [];

  if (!guides || guides.length === 0) {
    console.log('[节点3] 没有攻略数据，返回默认推荐');
    return { recommendResult: '连衣裙' };
  }

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
    result = result.replace(/^["']|["']$/g, '').trim();

    console.log('[节点3] AI选品结果:', result);
    return { recommendResult: result };
  } catch (error) {
    console.error('[节点3] AI选品出错:', error);
    return { recommendResult: '连衣裙' };
  }
}

/**
 * 节点4：AI筛选商品Agent - 根据用户需求和商品列表筛选2-3个商品
 */
export async function nodeAiFilterProducts(params, context) {
  console.log('[节点4] AI筛选商品Agent启动');

  const { count = 3 } = params;
  const products = context.products || [];
  const userQuestion = context.userQuestion || '';
  const recommendResult = context.recommendResult || '';

  if (!products || products.length === 0) {
    console.log('[节点4] 没有商品数据');
    return { filteredProducts: [] };
  }

  // 如果商品数量已经很少，直接返回
  if (products.length <= count) {
    console.log('[节点4] 商品数量不足，直接返回全部');
    return { filteredProducts: products };
  }

  const productsText = products.map((p, i) =>
    `${i + 1}. ${p.name} - ¥${p.price} - ${p.description}`
  ).join('\n');

  const prompt = `用户的需求是：${userQuestion}
推荐方向：${recommendResult}

以下是可供选择的商品列表：
${productsText}

请从中选出最符合用户需求的${count}个商品，只返回商品的序号（用逗号分隔），不要其他文字。
例如：1,3,5`;

  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    let result = response.choices[0]?.message?.content?.trim() || '';

    // 提取数字
    const numbers = result.match(/\d+/g) || [];
    const indices = numbers.map(n => parseInt(n) - 1).filter(i => i >= 0 && i < products.length);

    // 去重并限制数量
    const uniqueIndices = [...new Set(indices)].slice(0, count);

    // 如果AI没有选出足够的商品，补充一些
    while (uniqueIndices.length < count && uniqueIndices.length < products.length) {
      for (let i = 0; i < products.length && uniqueIndices.length < count; i++) {
        if (!uniqueIndices.includes(i)) {
          uniqueIndices.push(i);
        }
      }
    }

    const filteredProducts = uniqueIndices.map(i => products[i]);
    console.log('[节点4] 筛选出商品:', filteredProducts.map(p => p.name));
    return { filteredProducts };
  } catch (error) {
    console.error('[节点4] AI筛选出错，返回前几个商品:', error);
    return { filteredProducts: products.slice(0, count) };
  }
}

/**
 * 节点5：自定义上下文Agent - 纯粹请求大模型接口
 */
export async function nodeCustomLlm(params, context, res) {
  console.log('[节点5] 自定义上下文Agent启动');

  const { systemPrompt = '你是一个专业的服装搭配顾问', userPromptTemplate } = params;

  // 构建用户提示词
  let userPrompt = userPromptTemplate || '请根据以上信息回复用户。';

  // 替换模板变量
  userPrompt = userPrompt.replace('{userQuestion}', context.userQuestion || '');

  //添加上下文信息
  const contextParts = [];
  if (context.guides && context.guides.length > 0) {
    contextParts.push(`以下是服装搭配攻略：\n${context.guides[0].content}`);
  }
  if (context.recommendResult) {
    contextParts.push(`推荐方向：${context.recommendResult}`);
  }
  if (context.filteredProducts && context.filteredProducts.length > 0) {
    const productsText = context.filteredProducts.map(product =>
      `【${product.name}】\n价格: ¥${product.price}\n分类: ${product.category}\n描述: ${product.description}`
    ).join('\n\n');
    contextParts.push(`以下是推荐的商品：\n${productsText}`);
  }

  if (contextParts.length > 0) {
    userPrompt = `用户的问题是：${context.userQuestion || ''}\n\n${contextParts.join('\n\n')}\n\n${userPrompt}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        if (res) {
          res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
        }
      }
    }

    console.log('[节点5] 自定义Agent输出完成');
    return { response: fullResponse };
  } catch (error) {
    console.error('[节点5] 自定义Agent出错:', error);
    return { response: '抱歉，生成回复时出错了。' };
  }
}

/**
 * 执行节点
 */
async function executeNode(node, context, res) {
  const { name, params, frontendHint } = node;

  // 对params进行模板替换
  const resolvedParams = replaceTemplateParams(params, context);

  sendStageUpdate(res, name, 'start', null, frontendHint);

  let result;
  switch (name) {
    case NODE_TYPES.REQUEST_API:
      result = await nodeRequestApi(resolvedParams, context);
      break;
    case NODE_TYPES.GET_FASHION_GUIDE:
      result = await nodeGetFashionGuide(resolvedParams, context);
      break;
    case NODE_TYPES.AI_SELECT_PRODUCT:
      // 确保params中有userQuestion
      if (!resolvedParams.userQuestion) {
        resolvedParams.userQuestion = context.userQuestion;
      }
      result = await nodeAiSelectProduct(resolvedParams, context);
      break;
    case NODE_TYPES.AI_FILTER_PRODUCTS:
      result = await nodeAiFilterProducts(resolvedParams, context);
      break;
    case NODE_TYPES.CUSTOM_LLM:
      result = await nodeCustomLlm(resolvedParams, context, res);
      break;
    default:
      console.log(`未知节点类型: ${name}`);
      result = {};
  }

  sendStageUpdate(res, name, 'done', result, frontendHint);
  return result;
}

/**
 * 主编排工作流
 */
export async function runOrchestratorWorkflow(userQuestion, res) {
  console.log('===== Agent编排工作流启动 =====');

  // 上下文对象，用于在节点间传递数据
  const context = { userQuestion };

  try {
    // 步骤1：编排主Agent决定执行计划
    sendStageUpdate(res, 'orchestrator', 'start', null, '正在分析您的需求，制定推荐方案...');
    const plan = await orchestratorAgent(userQuestion);

    // 将plan写入本地plan.json
    const planPath = path.join(__dirname, '../plan.json');
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    console.log('Plan已保存到:', planPath);

    sendStageUpdate(res, 'orchestrator', 'done', { nodeCount: plan.nodes.length }, '正在分析您的需求，制定推荐方案...');

    // 接口侧自己消化plan，依次执行每个节点
    let finalResponse = '';
    for (const node of plan.nodes) {
      const result = await executeNode(node, context, res);

      // 将结果合并到上下文中
      Object.assign(context, result);

      // 如果是custom_llm节点，保存回复
      if (node.name === NODE_TYPES.CUSTOM_LLM && result.response) {
        finalResponse = result.response;
      }
    }

    // 如果没有custom_llm节点生成回复，使用默认回复
    if (!finalResponse) {
      finalResponse = `已为您完成推荐分析。${context.recommendResult ? '推荐方向：' + context.recommendResult : ''}`;
    }

    console.log('===== Agent编排工作流完成 =====');
    return finalResponse;
  } catch (error) {
    console.error('编排工作流执行出错:', error);
    throw error;
  }
}
