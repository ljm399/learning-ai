import "dotenv/config";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import tools from "../tools/index.js"
import { formatToLangChainMessage, getConvertByCid, updateHistoryMessage } from "./convertUtils.js";
export function createModel() {
    const apiKey = process.env.DEEPSEEK_API_KEY
    const model = new ChatOpenAI({
        modelName: "deepseek-v4-flash",
        apiKey,
        configuration: {
            baseURL: "https://api.deepseek.com"
        }
    })

    
    const modelWithTool = model.bindTools(tools);
    //绑定工具
    return modelWithTool;
}
export function getGraph() {
    const openaiModel = createModel();
    const workflow = new StateGraph(MessagesAnnotation);
    async function callModel(state, opt) {
        //messages不是一成不变的，如果经过了agent->tool->agent
        const { messages } = state
        //取出这次对话之前的历史，合并本次的新问题，再发出
        const userId = opt.configurable.userId
        const sessionId = opt.configurable.sessionId;
        const extraMessage = opt.configurable.extraMessage;
        //history.messages-之前的对话，但是他是openai格式的
        const history = getConvertByCid(userId, sessionId)
        const langchainHistory = formatToLangChainMessage(history.messages)
        const stream = await openaiModel.stream([...extraMessage,...langchainHistory, ...messages])
        let fullResponse = null;
        for await (const chunks of stream) {
            if (!fullResponse) {
                //第一个chunk走赋值
                fullResponse = chunks;
            } else {
                //非第一个走合并
                fullResponse = fullResponse.concat(chunks)
            }
        }

        return { messages: [fullResponse] }
    }
    function shouleContinue(state) {
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
            return "saveResult"
        }
        return "tools"
    }
    const toolNode = new ToolNode(tools);
    function saveResult(state, opt) {
        const { messages } = state;
        const userId = opt.configurable.userId
        const sessionId = opt.configurable.sessionId;
        updateHistoryMessage(userId, sessionId, messages)
        return {};
    }
    //千万不要加一个节点，做初始记录的读取
    workflow
        .addNode("agent", callModel)
        .addNode("tools", toolNode)
        .addNode("saveResult", saveResult)
        .addEdge("__start__", "agent")
        .addEdge("saveResult", "__end__")
        .addConditionalEdges("agent", shouleContinue)
        .addEdge("tools", "agent")
    return workflow.compile();
}

export async function generateTitle(messages, cid) {
    const apiKey = process.env.DEEPSEEK_API_KEY
    const model = new ChatOpenAI({
        model: "deepseek-v4-flash",
        apiKey,
        configuration: {
            baseURL: "https://api.deepseek.com",
        },
    });
    //user:你好\nassistant:你好呀，有什么可以帮你
    const res = await model.invoke([
        { role: "system", content: "请根据以下对话历史，生成一个不超过10个字的简短标题。直接返回标题文本，不要加引号或解释。" },
        { role: "user", content: JSON.stringify(messages) }
    ]);

    return {
        cid: cid,
        content: res.content.trim().replace(/["']/g, "")
    }
}