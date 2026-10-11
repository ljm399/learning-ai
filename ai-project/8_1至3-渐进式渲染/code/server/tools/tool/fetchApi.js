/**
 * 发起 HTTP 请求并返回响应数据
 * @param {Object} params
 * @param {string} params.url - 请求的 URL
 * @param {Object} [params.options] - fetch 选项
 * @returns {Promise<Object>} 响应数据
 */
async function fetchApi({ method, url, options = {} }) {
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
            success: true,
            data,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}

export default {
    type: 'function',
    function: {
        name: 'fetchApi',
        description: '通过 fetch 请求 API 接口',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: '请求的 URL',
                },
                options: {
                    type: 'object',
                    description: 'fetch 选项',
                    properties: {
                        method: {
                            type: 'string',
                            description: 'HTTP 方法',
                        },
                        headers: {
                            type: 'object',
                            description: '请求头',
                        },
                        body: {
                            type: 'string',
                            description: '请求体',
                        },
                    },
                    additionalProperties: true,
                },
            },
            required: ['url'],
            additionalProperties: false,
        },
        strict: true,
    },
    func: fetchApi,
};