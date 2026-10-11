import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import fs from 'fs';
import config from './config.js';
import toolsManager from './tools/index.js';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  baseURL: config.API_URL,
  apiKey: config.API_KEY,
  dangerouslyAllowBrowser: true
});
await toolsManager.init();
function getSystemPrompt() {
  return fs.readFileSync("./doc/a2uiRule.md").toString();
}
let historyMessages = [];

function sendA2uiEvent(item, res) {
  if (item?.createSurface) {
    // 通知前端挂载画布
    res.write(`data: ${JSON.stringify({ type: 'a2ui:createSurface', ...item.createSurface })}\n\n`);
  }
  if (item?.updateComponents) {
    // 完整的 updateComponents 对象（作为批量完成信号）
    res.write(`data: ${JSON.stringify({ type: 'a2ui:updateComponents', ...item.updateComponents })}\n\n`);
  }
  if (item?.updateDataModel) {
    // 通知前端更新数据模型
    res.write(`data: ${JSON.stringify({ type: 'a2ui:updateDataModel', ...item.updateDataModel })}\n\n`);
  }
}

/**
 * 从类数组内容中提取完整的 JSON 对象（{} 配对）
 * 适用于提取 datas 数组中的 item，或 components 数组中的组件
 */
function extractArrayItems(str) {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push({ start, end: i + 1, json: str.slice(start, i + 1) });
        start = -1;
      }
    }
  }

  return results;
}

/**
 * 从 updateComponents 的部分流内容中，提取 components 数组里已完整的组件对象
 * 返回 { surfaceId, components: [...] }
 */
function extractComponentsFromPartialUpdateComponents(str) {
  // 提取 surfaceId
  const sidMatch = str.match(/"surfaceId"\s*:\s*"([^"]+)"/);
  const surfaceId = sidMatch ? sidMatch[1] : 'unknown';

  // 找到 "components" 数组的起始位置
  const compsMatch = str.match(/"components"\s*:\s*\[/);
  if (!compsMatch) return { surfaceId, components: [] };

  const compsContent = str.slice(compsMatch.index + compsMatch[0].length);
  const items = extractArrayItems(compsContent);
  return {
    surfaceId,
    components: items.map(item => item.json),
  };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    historyMessages.push({ role: 'user', content: message });


    const allTools = toolsManager.getAllTools();
    const tools = allTools.length > 0
      ? { tools: allTools.map(({ func, ...toolDef }) => toolDef), tool_choice: 'auto' }
      : {};


    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // let assistantResponse = '';
    let messages = [...historyMessages]
    let buffer = '';
    let state = 'normal'; // normal, a2ui
    let a2uiContent = '';
    let sentDatasKeys = new Set();    // 已发送的 datas item 的 key（createSurface/updateComponents/updateDataModel）
    let sentComponentIds = new Set(); // 已发送的组件 id

    while (true) {
      const stream = await openai.chat.completions.create({
        model: config.model,
        messages: [{ role: 'system', content: getSystemPrompt() }, ...messages],
        stream: true,
        ...tools,
      });

      const toolCallsMap = {};
      let hasToolCalls = false;
      let toolCallsFinished = false;
      let roundText = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta || {};
        const finishReason = chunk.choices[0]?.finish_reason;

        if (delta.tool_calls) {
          hasToolCalls = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
            }
            const call = toolCallsMap[idx];
            if (tc.id) call.id += tc.id;
            if (tc.type) call.type = tc.type;
            if (tc.function?.name) call.function.name += tc.function.name;
            if (tc.function?.arguments) call.function.arguments += tc.function.arguments;
          }
        }

        const content = delta.content || '';
        if (content) {
          roundText += content;

          if (state === 'normal') {
            buffer += content;
            const startTagIndex = buffer.indexOf('<a2ui>');
            if (startTagIndex !== -1) {
              const beforeContent = buffer.slice(0, startTagIndex);
              if (beforeContent) {
                res.write(`data: ${JSON.stringify({ type: 'text', content: beforeContent })}\n\n`);
              }
              state = 'a2ui';
              a2uiContent = buffer.slice(startTagIndex + 6);
              buffer = '';
            } else {
              const keepLength = 5;
              if (buffer.length > keepLength) {
                const sendContent = buffer.slice(0, -keepLength);
                buffer = buffer.slice(-keepLength);
                res.write(`data: ${JSON.stringify({ type: 'text', content: sendContent })}\n\n`);
              }
            }
          } 
          
          // a2ui类型
          else if (state === 'a2ui') {
            a2uiContent += content;

            // 先检查 </a2ui> 闭合标签位置
            const endTagIndex = a2uiContent.indexOf('</a2ui>');
            const searchEnd = endTagIndex !== -1 ? endTagIndex : a2uiContent.length;
            const searchStr = a2uiContent.slice(0, searchEnd);

            // a2ui JSON 现在直接是数组 [...]
            const arrayStart = searchStr.indexOf('[');
            let consumed = 0;

            if (arrayStart !== -1) {
              const contentStart = arrayStart + 1;
              const arrayContent = searchStr.slice(contentStart);

              // 1. 提取数组中已完整的 item（createSurface / updateComponents / updateDataModel）
              const arrayItems = extractArrayItems(arrayContent);
              let arrayItemsEnd = 0;

              for (const item of arrayItems) {
                arrayItemsEnd = item.end;
                try {
                  const parsed = JSON.parse(item.json);
                  const key = Object.keys(parsed)[0]; // 'createSurface' | 'updateComponents' | 'updateDataModel'

                  if (!sentDatasKeys.has(key)) {
                    sentDatasKeys.add(key);
                    sendA2uiEvent(parsed, res);

                    // 对于已完整的 updateComponents，也逐个发送组件事件
                    if (key === 'updateComponents' && parsed.updateComponents?.components) {
                      for (const comp of parsed.updateComponents.components) {
                        if (!sentComponentIds.has(comp.id)) {
                          sentComponentIds.add(comp.id);
                          res.write(`data: ${JSON.stringify({
                            type: 'a2ui:component',
                            surfaceId: parsed.updateComponents.surfaceId,
                            component: comp,
                          })}\n\n`);
                        }
                      }
                    }
                  }
                } catch (e) {
                  // 解析失败跳过
                }
              }

              // 2. 检查剩余未完成的部分中，是否有 updateComponents 正在流式下发
              //    从中增量提取 components 数组里已完整的组件对象
              const remaining = arrayContent.slice(arrayItemsEnd);
              if (remaining.includes('"updateComponents"') && remaining.includes('"components"')) {
                const { surfaceId, components: compJsons } =
                  extractComponentsFromPartialUpdateComponents(remaining);

                for (const compJson of compJsons) {
                  try {
                    const comp = JSON.parse(compJson);
                    if (!sentComponentIds.has(comp.id)) {
                      sentComponentIds.add(comp.id);
                      res.write(`data: ${JSON.stringify({
                        type: 'a2ui:component',
                        surfaceId,
                        component: comp,
                      })}\n\n`);
                    }
                  } catch (e) {
                    // 跳过解析失败的组件
                  }
                }
              }

              // 计算已消费的位置（相对于 searchStr）
              consumed = contentStart + arrayItemsEnd;
            }

            if (endTagIndex !== -1) {
              // 找到闭合标签，退出 a2ui 状态
              state = 'normal';
              buffer = a2uiContent.slice(endTagIndex + 7);
              a2uiContent = '';
              sentDatasKeys.clear();
              sentComponentIds.clear();
            } else {
              // 保留未处理完的部分（保留数组开头 [ 前缀）
              if (consumed > 0) {
                a2uiContent = '[' + a2uiContent.slice(consumed);
              }
              // 如果 consumed === 0，保持 a2uiContent 不变（还没找到数组）
            }
          }
        }

        if (finishReason === 'tool_calls') {
          toolCallsFinished = true;
          break;
        }
      }

      if (toolCallsFinished) {
        messages.push({
          role: 'assistant',
          content: roundText,
          tool_calls: Object.values(toolCallsMap),
        });

        for (const call of Object.values(toolCallsMap)) {
          const args = JSON.parse(call.function.arguments);
          let output;
          try {
            output = await toolsManager.executeTool(call.function.name, args);
          } catch (err) {
            output = { error: err.message };
          }
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(output),
          });
        }
      } else {
        messages.push({
          role: 'assistant',
          content: roundText,
        });
        break;
      }
    }


    // 处理循环结束后可能剩余的内容
    if (buffer) {
      res.write(`data: ${JSON.stringify({ type: 'text', content: buffer })}\n\n`);
    }
    if (state === 'a2ui' && a2uiContent) {
      // 如果在 a2ui 模式下结束但没有找到结束标签，作为文本发送
      res.write(`data: ${JSON.stringify({ type: 'text', content: '<a2ui>' + a2uiContent })}\n\n`);
    }

    // historyMessages.push({ role: 'assistant', content: assistantResponse });
    historyMessages = messages;

    res.write('data: [DONE]\n\n');
    res.end();

    fs.writeFileSync('./history.json', JSON.stringify(historyMessages, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 登陆接口
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // 固定写死的返回内容
  res.json({
    code: 200,
    message: "登录成功",
    data: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJpYXQiOjE1MTYyMzkwMjJ9.6kGfR8vQ6Q1vG4uU5B5z1K5d3m5x7y8z9a2s3d4f5g6",
      userInfo: {
        id: 1,
        username: username,
        nickname: "测试用户",
        avatar: "https://example.com/avatar.jpg"
      }
    }
  });
});

// 查询商品接口
app.get('/shoplist', (req, res) => {
  const { searchName } = req.query;

  // 固定写死的商品数据
  const shopList = [
    {
      id: 1,
      name: "商品一",
      price: 99.99,
      image: "https://img1.baidu.com/it/u=2216096732,2944278875&fm=253&app=138&f=JPEG?w=800&h=1067",
      description: "这是商品一的描述信息"
    },
    {
      id: 2,
      name: "商品二",
      price: 199.99,
      image: "https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fimg.alicdn.com%2Fimgextra%2Fi2%2F2220165493008%2FO1CN01Vdg5fz1Y5iR4O5SQX_%21%212220165493008-0-qnaigc.jpg&refer=http%3A%2F%2Fimg.alicdn.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1786105363&t=fb7a6ffb57c65f00713e769a11dbe379",
      description: "这是商品二的描述信息"
    },
    {
      id: 3,
      name: "商品三",
      price: 299.99,
      image: "https://qcloud.dpfile.com/pc/emDDuswDYGXwuum7OYonFR9KhA93Q340QWRLN4TYzSIJaDImHBIhpzU0ffbOukJv.jpg",
      description: "这是商品三的描述信息"
    }
  ];



  // 固定写死的返回内容
  res.json({
    code: 200,
    message: "获取商品列表成功",
    data: {
      list: shopList,
      total: shopList.length
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
