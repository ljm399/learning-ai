import OpenAI from 'openai';
import config from '../config.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  baseURL: config.API_URL,
  apiKey: config.API_KEY,
  dangerouslyAllowBrowser: true
});

/**
 * 变量替换函数：将 ${nodeResults.node-1} 和 ${globals.userPrompt} 等替换为实际值
 */
function interpolateVariables(template, globals, nodeResults, forJson = false) {
  if (!template || typeof template !== 'string') {
    return template;
  }

  return template.replace(/\$\{([^}]+)\}/g, (match, path) => {
    try {
      path = path.trim();

      let value;
      // 处理 nodeResults.xxx
      if (path.startsWith('nodeResults.')) {
        const nodeId = path.replace('nodeResults.', '');
        value = nodeResults[nodeId];
      }
      // 处理 globals.xxx
      else if (path.startsWith('globals.')) {
        const key = path.replace('globals.', '');
        value = globals[key];
      }

      if (value !== undefined) {
        // 如果是用于 JSON 上下文中，确保字符串被正确引用
        if (forJson) {
          if (typeof value === 'string') {
            // 对于字符串值，返回带引号的 JSON 格式
            return JSON.stringify(value);
          } else if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        } else {
          // 普通上下文中
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        }
      }

      return 'undefined';
    } catch (e) {
      console.warn('[变量替换] 失败:', match, e);
      return match;
    }
  });
}

/**
 * 安全解析 JSON 字符串（支持无引号的键名）
 */
function safeParseJson(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  try {
    // 先尝试直接解析
    return JSON.parse(str);
  } catch (e) {
    // 失败时尝试修复
    try {
      // 修复键名没有引号的情况
      let fixed = str
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
        .replace(/:\s*([^,}\]]+)/g, (match, val) => {
          val = val.trim();
          // 如果已经是引号包围的，保持原样
          if ((val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'")) ||
              val === 'true' || val === 'false' || val === 'null' ||
              !isNaN(Number(val))) {
            return `:${val}`;
          }
          // 否则加上引号
          return `:"${val}"`;
        })
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      return JSON.parse(fixed);
    } catch (e2) {
      console.warn('[JSON解析] 失败，尝试 eval 方式:', str);
      try {
        // 最后的手段：使用 Function 构造函数
        const parseFunc = new Function(`return ${str};`);
        return parseFunc();
      } catch (e3) {
        console.warn('[JSON解析] 完全失败，返回原样:', str);
        return str;
      }
    }
  }
}

/**
 * 发送状态更新到前端
 */
function sendStageUpdate(res, nodeId, label, status, data = null) {
  const payload = {
    type: 'stage',
    stage: nodeId,
    stageName: label,
    status, // 'start', 'done'
    data
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Request 节点处理器：发送 HTTP 请求
 */
async function handleRequestNode(node, globals, nodeResults) {
  console.log(`[Request节点] ${node.id} - ${node.label}`);

  const { url, method, params } = node.config;

  // 变量替换
  const interpolatedUrl = interpolateVariables(url, globals, nodeResults);

  // 对于 params，我们先尝试直接替换并解析
  let parsedParams;
  if (params) {
    // 先尝试智能解析：检测是否是对象字面量
    if (params.trim().startsWith('{')) {
      // 构建一个临时对象，先进行变量替换
      // 特别处理：对于 {categories:${nodeResults.node-6}} 这样的格式
      let tempParams = params;

      // 进行变量替换，但这次标记是用于 JSON 的
      tempParams = interpolateVariables(tempParams, globals, nodeResults, true);

      console.log(`[Request节点] 替换后参数: ${tempParams}`);

      parsedParams = safeParseJson(tempParams);
    } else {
      // 简单字符串
      parsedParams = interpolateVariables(params, globals, nodeResults);
    }
  }

  console.log(`[Request节点] URL: ${interpolatedUrl}`);
  console.log(`[Request节点] 参数:`, parsedParams);

  const fetchOptions = {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' }
  };

  if (parsedParams && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    fetchOptions.body = JSON.stringify(parsedParams);
  }

  const response = await fetch(interpolatedUrl, fetchOptions);
  const result = await response.json();

  console.log(`[Request节点] 结果:`, result);
  return result;
}

/**
 * Condition 节点处理器：条件判断
 */
async function handleConditionNode(node, globals, nodeResults, edges) {
  console.log(`[Condition节点] ${node.id} - ${node.label}`);

  const { branches } = node.config;

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];

    // 如果是 else 分支，直接匹配
    if (branch.isElse) {
      console.log(`[Condition节点] 匹配到 else 分支: ${branch.label}`);
      return `branch-${i}`;
    }

    // 执行条件判断
    let condition = branch.condition;
    if (condition) {
      condition = interpolateVariables(condition, globals, nodeResults);

      try {
        // 安全执行条件表达式
        // 创建一个安全的上下文
        const context = {
          nodeResults,
          globals
        };

        // 使用 Function 构造函数来执行条件
        // 先尝试解析条件，确保安全
        const evalFunc = new Function('nodeResults', 'globals', `return ${condition};`);
        const result = evalFunc(nodeResults, globals);

        console.log(`[Condition节点] 条件 "${condition}" 结果: ${result}`);

        if (result) {
          console.log(`[Condition节点] 匹配到分支: ${branch.label}`);
          return `branch-${i}`;
        }
      } catch (e) {
        console.error(`[Condition节点] 条件执行失败:`, condition, e);
      }
    }
  }

  // 默认返回第一个分支
  return 'branch-0';
}

/**
 * Return 节点处理器：直接返回固定内容
 */
async function handleReturnNode(node, globals, nodeResults) {
  console.log(`[Return节点] ${node.id} - ${node.label}`);

  let content = node.config.content;
  content = interpolateVariables(content, globals, nodeResults);
  const result = safeParseJson(content);

  console.log(`[Return节点] 内容:`, result);
  return result;
}

/**
 * Document 节点处理器：返回固定文档内容
 */
async function handleDocumentNode(node, globals, nodeResults) {
  console.log(`[Document节点] ${node.id} - ${node.label}`);

  const content = node.config.content;
  console.log(`[Document节点] 内容长度: ${content?.length || 0}`);
  return content;
}

/**
 * AI 节点处理器：调用大模型
 */
async function handleAINode(node, globals, nodeResults, res) {
  console.log(`[AI节点] ${node.id} - ${node.label}`);

  let { system, prompt } = node.config;

  // 变量替换
  system = interpolateVariables(system, globals, nodeResults);
  prompt = interpolateVariables(prompt, globals, nodeResults);

  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  console.log(`[AI节点] 调用模型: ${config.model}`);

  // 检查是否需要流式输出（最后一个 AI 节点）
  // 这里简化处理：直接调用非流式，但也可以根据需要支持
  const response = await openai.chat.completions.create({
    model: config.model,
    messages,
    temperature: 0.7
  });

  const result = response.choices[0]?.message?.content?.trim() || '';
  console.log(`[AI节点] 结果长度: ${result.length}`);
  return result;
}

/**
 * 获取下一个节点 ID
 */
function getNextNodeId(currentNodeId, edges, branchHandle = null) {
  let matchingEdge;

  if (branchHandle) {
    // condition 节点，根据分支 handle 查找
    matchingEdge = edges.find(e => e.source === currentNodeId && e.sourceHandle === branchHandle);
  } else {
    // 普通节点，直接查找
    matchingEdge = edges.find(e => e.source === currentNodeId && !e.sourceHandle);
  }

  return matchingEdge?.target || null;
}

/**
 * 主工作流执行引擎
 */
export async function executeWorkflow(workflowData, userPrompt, res) {
  console.log('===== 工作流引擎启动 =====');

  const { nodes, edges } = workflowData;

  // 构建节点映射
  const nodeMap = {};
  for (const node of nodes) {
    nodeMap[node.id] = node;
  }

  // 初始化全局变量和节点结果
  const globals = {
    userPrompt,
    token: 'test-token' // 这里可以从请求中获取
  };
  const nodeResults = {};

  // 找到开始节点
  let currentNodeId = 'start';
  let lastResult = null;
  let shouldReturnImmediately = false;

  try {
    while (currentNodeId) {
      const node = nodeMap[currentNodeId];

      if (!node) {
        console.warn(`[工作流] 找不到节点: ${currentNodeId}`);
        break;
      }

      console.log(`[工作流] 执行节点: ${node.id} (${node.type})`);

      // 发送开始状态
      if (node.type !== 'start' && node.type !== 'end') {
        sendStageUpdate(res, node.id, node.label, 'start');
      }

      let result = null;
      let nextHandle = null;

      switch (node.type) {
        case 'start':
          // 开始节点，直接继续
          break;

        case 'end':
          // 结束节点，返回最后结果
          console.log('[工作流] 到达结束节点');
          shouldReturnImmediately = true;
          break;

        case 'request':
          result = await handleRequestNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          break;

        case 'condition':
          nextHandle = await handleConditionNode(node, globals, nodeResults, edges);
          // condition 节点不存储结果
          break;

        case 'return':
          result = await handleReturnNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          // return 节点直接返回
          shouldReturnImmediately = true;
          break;

        case 'document':
          result = await handleDocumentNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          break;

        case 'ai':
          result = await handleAINode(node, globals, nodeResults, res);
          nodeResults[node.id] = result;
          lastResult = result;
          break;

        default:
          console.warn(`[工作流] 未知节点类型: ${node.type}`);
      }

      // 发送完成状态
      if (node.type !== 'start' && node.type !== 'end') {
        sendStageUpdate(res, node.id, node.label, 'done', result ? { hasResult: true } : null);
      }

      // 如果需要立即返回
      if (shouldReturnImmediately) {
        break;
      }

      // 获取下一个节点
      currentNodeId = getNextNodeId(node.id, edges, nextHandle);
    }

    console.log('===== 工作流执行完成 =====');
    return lastResult;

  } catch (error) {
    console.error('[工作流] 执行出错:', error);
    throw error;
  }
}

/**
 * 流式执行 AI 节点（用于最后回复）
 */
export async function streamAIResponse(node, globals, nodeResults, res) {
  console.log(`[AI流式节点] ${node.id} - ${node.label}`);

  let { system, prompt } = node.config;

  // 变量替换
  system = interpolateVariables(system, globals, nodeResults);
  prompt = interpolateVariables(prompt, globals, nodeResults);

  const messages = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

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
      res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
    }
  }

  return fullResponse;
}

/**
 * 增强版工作流执行：智能检测最后一个 AI 节点并流式输出
 */
export async function executeWorkflowWithStreaming(workflowData, userPrompt, res, token = 'test-token') {
  console.log('===== 增强版工作流引擎启动 =====');

  const { nodes, edges } = workflowData;

  // 构建节点映射和边映射
  const nodeMap = {};
  for (const node of nodes) {
    nodeMap[node.id] = node;
  }

  // 初始化全局变量和节点结果
  const globals = {
    userPrompt,
    token
  };
  const nodeResults = {};

  // 找到开始节点
  let currentNodeId = 'start';
  let lastResult = null;
  let shouldReturnImmediately = false;
  let isReturnNode = false;

  // 分析工作流，找到最后一个节点
  const lastNodeId = findLastNode(nodes, edges);
  console.log('[工作流] 最后一个节点:', lastNodeId);

  try {
    while (currentNodeId) {
      const node = nodeMap[currentNodeId];

      if (!node) {
        console.warn(`[工作流] 找不到节点: ${currentNodeId}`);
        break;
      }

      console.log(`[工作流] 执行节点: ${node.id} (${node.type})`);

      // 发送开始状态
      if (node.type !== 'start' && node.type !== 'end') {
        sendStageUpdate(res, node.id, node.label, 'start');
      }

      let result = null;
      let nextHandle = null;

      switch (node.type) {
        case 'start':
          break;

        case 'end':
          shouldReturnImmediately = true;
          break;

        case 'request':
          result = await handleRequestNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          break;

        case 'condition':
          nextHandle = await handleConditionNode(node, globals, nodeResults, edges);
          break;

        case 'return':
          result = await handleReturnNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          shouldReturnImmediately = true;
          isReturnNode = true;
          break;

        case 'document':
          result = await handleDocumentNode(node, globals, nodeResults);
          nodeResults[node.id] = result;
          lastResult = result;
          break;

        case 'ai':
          // 如果是最后一个有效节点，使用流式输出
          if (node.id === lastNodeId) {
            console.log('[工作流] 最后一个AI节点，使用流式输出');
            sendStageUpdate(res, node.id, node.label, 'start');
            result = await streamAIResponse(node, globals, nodeResults, res);
            nodeResults[node.id] = result;
            lastResult = result;
            sendStageUpdate(res, node.id, node.label, 'done');
            shouldReturnImmediately = true;
          } else {
            result = await handleAINode(node, globals, nodeResults, res);
            nodeResults[node.id] = result;
            lastResult = result;
          }
          break;

        default:
          console.warn(`[工作流] 未知节点类型: ${node.type}`);
      }

      // 发送完成状态（流式 AI 节点已在内部处理）
      if (node.type !== 'start' && node.type !== 'end' &&
          !(node.type === 'ai' && node.id === lastNodeId)) {
        sendStageUpdate(res, node.id, node.label, 'done', result ? { hasResult: true } : null);
      }

      // 如果是 return 节点，直接发送内容
      if (isReturnNode) {
        const returnContent = typeof lastResult === 'object'
          ? JSON.stringify(lastResult)
          : String(lastResult);
        res.write(`data: ${JSON.stringify({ type: 'content', content: returnContent })}\n\n`);
      }

      if (shouldReturnImmediately) {
        break;
      }

      currentNodeId = getNextNodeId(node.id, edges, nextHandle);
    }

    console.log('===== 工作流执行完成 =====');
    return lastResult;

  } catch (error) {
    console.error('[工作流] 执行出错:', error);
    throw error;
  }
}

/**
 * 找到最后一个执行的节点（在 end 之前）
 */
function findLastNode(nodes, edges) {
  // 找到指向 end 的边
  const endEdge = edges.find(e => e.target === 'end');
  if (endEdge) {
    return endEdge.source;
  }

  // 如果没有找到，找一个 AI 节点或 return 节点
  const aiNode = nodes.find(n => n.type === 'ai');
  if (aiNode) return aiNode.id;

  const returnNode = nodes.find(n => n.type === 'return');
  if (returnNode) return returnNode.id;

  // 随便返回一个非 start/end 的节点
  const normalNode = nodes.find(n => n.type !== 'start' && n.type !== 'end');
  return normalNode?.id;
}
