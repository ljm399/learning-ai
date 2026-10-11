import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//根据用户id拼接出用户对话记录所在地址
//001 -> jsondata/001.json
function getConvertsFilePath(userId) {
    //../jsondata/001.json
    return path.join(__dirname, '..', 'jsondata', `${userId}.json`);
}
//根据userId读取到用户的对话记录对象，
function getAllConvertByUserId(userId) {
    const filePath = getConvertsFilePath(userId);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const converts = JSON.parse(data);
    return converts
}

function formatToLangChainMessage(openaiArr = []) {
    return openaiArr.filter(Boolean).map((item) => {
        const role = item.role || item.type;
        if (role === 'assistant') {
            const msgConfig = { content: item.content };
            if (item.tool_calls && item.tool_calls.length > 0) {
                msgConfig.tool_calls = item.tool_calls.map(tc => ({
                    id: tc.id,
                    name: tc.function?.name || tc.name,
                    args: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.args || tc.function?.arguments),
                    type: 'tool_call'
                }));
            }
            return new AIMessage(msgConfig);
        } else if (role === 'tool') {
            return new ToolMessage({
                content: item.content,
                tool_call_id: item.tool_call_id
            });
        } else if (role === 'user') {
            return new HumanMessage(item.content);
        }
        return null;
    }).filter(Boolean);
}
function formatToOpenAIHistory(langchainArr = []) {
    return langchainArr.map((msg) => {
        const type = msg._getType?.() || msg.constructor.name;
        if (msg instanceof HumanMessage || type === 'human' || type === 'HumanMessage') {
            return {
                role: 'user',
                content: msg.content,
                id: msg.id
            };
        } else if (msg instanceof AIMessage || type === 'ai' || type === 'AIMessage' || type === 'AIMessageChunk') {
            const result = {
                role: 'assistant',
                content: msg.content,
                id: msg.id
            };
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                result.tool_calls = msg.tool_calls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
                    }
                }));
            }
            return result;
        } else if (msg instanceof ToolMessage || type === 'tool' || type === 'ToolMessage') {
            return {
                role: 'tool',
                content: msg.content,
                tool_call_id: msg.tool_call_id,
                id: msg.id
            };
        }
        return null;
    }).filter(Boolean);
}
function getConvertByCid(userId, cid) {
    //获取到了用户所有的对话
    const allConverts = getAllConvertByUserId(userId);
    //再用cid取出某一条对话
    return allConverts[cid] || null;
}
//接收到一个langChain对象对话记录数组，加入到当前记录里
//[Human，AIMEssage]
function updateHistoryMessage(userId, cid, langchainArr = []) {
    const filePath = getConvertsFilePath(userId);
    if (!fs.existsSync(filePath)) {
        return false;
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const converts = JSON.parse(data);
    if (!converts[cid]) {
        return false;
    }
    //把langChain对象格式的历史记录数组，转化为openai格式，因为我们存的是openai格式
    const openaiHistory = formatToOpenAIHistory(langchainArr);
    //拼接上原来的，而不是顶掉
    //history-该对话之前的历史
    const history = converts[cid].messages || [];
    converts[cid].messages = [...history, ...openaiHistory];

    fs.writeFileSync(filePath, JSON.stringify(converts, null, 4), 'utf-8');
    return true;
}

function createConvert(userId) {
    const filePath = getConvertsFilePath(userId);
    let converts = {};
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        converts = JSON.parse(data);
    }
    //生成对话id-》u+userId+当前事件
    const cid = `u${userId}${Date.now()}`;
    converts[cid] = {
        title: '新对话',
        messages: []
    };
    fs.writeFileSync(filePath, JSON.stringify(converts, null, 4), 'utf-8');
    return { cid, convert: converts[cid] };
}


export { getConvertsFilePath, getAllConvertByUserId, getConvertByCid, createConvert, formatToOpenAIHistory, formatToLangChainMessage, updateHistoryMessage };
