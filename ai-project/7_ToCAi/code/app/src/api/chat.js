import { fetchEventSource } from '@microsoft/fetch-event-source';
import request from '../utils/request.js';

// 获取当前对话记录的详情
export function getChatDetail(chatId) {
  return request({
    url: '/chat/detail',
    method: 'get',
    params: { cid: chatId },
  });
}

// 获取用户的对话记录列表
export function getChatList() {
  return request({
    url: '/chat/list',
    method: 'get',
  });
}

// 发送提问到接口（SSE 流式）
export function sendChatMessage(data, onChunk) {
  return fetchEventSource(`${request.defaults.baseURL}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: localStorage.getItem('token'),
    },
    body: JSON.stringify(data),
    openWhenHidden: true,
    onmessage(msg) {
      if (!msg.data) return;
      let chunk = msg.data;
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === 'assistant') {
          chunk = { content: parsed.content, id: parsed.id };
        }
      } catch {
        // 非 JSON，直接使用原始文本
      }


      onChunk?.(chunk);
    },
    onerror(err) {
      throw err;  // 发生错误时直接抛出，杜绝自动重试
    },
    onclose(err) {
      throw err;
    }
  });
}

// 创建新对话
export function createChat(data) {
  return request({
    url: '/chat/create',
    method: 'post',
    data,
  });
}
