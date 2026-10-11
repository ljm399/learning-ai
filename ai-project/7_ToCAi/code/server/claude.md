# 项目介绍
该项目是一个AI应用的后端部分，主要提供给前端调用的AI接口，比如发送提问，获取对话，新建对话，获取用户对话列表，登录等
# 技术栈
项目使用express搭建，请求大模型使用@langchain+langGraph等。
项目为esm规范
本项目数据采用json储存在jsondata文件夹中。
对话记录的储存方案为，按userId为文件名写入到jsondata。每个用户会用一个${userId}.json储存它的对话记录到jsondata里
假设用户a的id为001,储存为为一个001.json文件
``` json
  {
    "u001178232412":{
        "title":"xxx",
    "u001178232422": {
        "title": "YYY",
        "messages": {
            "checkpoint": {
                "v": 4,
                "id": "1f13b239-a4b0-6d21-8006-b67ebd59f087",
                "ts": "2026-04-18T12:39:12.370Z",
                "channel_values": {
                    "messages": [
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "HumanMessage"
                            ],
                            "kwargs": {
                                "content": "你好",
                                "additional_kwargs": {},
                                "response_metadata": {},
                                "id": "cc7b8c44-3b21-42c0-95c2-a4ad09b39327"
                            }
                        },
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "AIMessage"
                            ],
                            "kwargs": {
                                "content": "你好！有什么我可以帮你的吗？",
                                "additional_kwargs": {
                                    "reasoning_content": "用户现在只是打了个招呼“你好”，我需要友好地回应。首先，检查是否需要使用工具，显然这里不需要，直接简单回应用户就好，保持亲切自然。"
                                },
                                "response_metadata": {
                                    "prompt": 0,
                                    "completion": 0,
                                    "model_provider": "openai",
                                    "usage": {
                                        "completion_tokens": 54,
                                        "prompt_tokens": 453,
                                        "total_tokens": 507,
                                        "prompt_tokens_details": {
                                            "cached_tokens": 0
                                        },
                                        "completion_tokens_details": {
                                            "reasoning_tokens": 43
                                        }
                                    },
                                    "finish_reason": "stop",
                                    "model_name": "doubao-seed-2.0-code",
                                    "service_tier": "default"
                                },
                                "tool_call_chunks": [],
                                "id": "021776515781245af559081728f7c409f9049e42e5d0da8d7f470",
                                "usage_metadata": {
                                    "input_tokens": 453,
                                    "output_tokens": 54,
                                    "total_tokens": 507,
                                    "input_token_details": {
                                        "cache_read": 0
                                    },
                                    "output_token_details": {
                                        "reasoning": 43
                                    }
                                },
                                "invalid_tool_calls": [],
                                "tool_calls": []
                            }
                        },
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "HumanMessage"
                            ],
                            "kwargs": {
                                "content": "用天地同寿算法计算3和5",
                                "additional_kwargs": {},
                                "response_metadata": {},
                                "id": "5944e279-2403-49d0-a8c2-940057116696"
                            }
                        },
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "AIMessageChunk"
                            ],
                            "kwargs": {
                                "content": "",
                                "additional_kwargs": {
                                    "reasoning_content": "先理一理，用户让我用天地同寿算法计算3和5。首先，我需要确认天地同寿算法是什么。根据提供的函数定义，custom_calc函数就是用来执行这个算法的，参数是a和b。所以，我需要调用这个工具，传入a=3和b=5。\n\n接下来，检查用户的请求是否符合要求。用户明确提到了天地同寿算法，并且给出了两个数字3和5，所以参数齐全，不需要追问更多信息。然后，按照规定的格式生成函数调用。注意要用<seed:tool_call>包裹，并且参数部分正确填写。确认没有其他内容，只返回函数调用即可。",
                                    "tool_calls": [
                                        {
                                            "function": {
                                                "arguments": "{\"a\": 3, \"b\": 5}",
                                                "name": "custom_calc"
                                            },
                                            "id": "call_69hprndmiib6mjwwgifedxtn",
                                            "index": 0,
                                            "type": "function"
                                        }
                                    ]
                                },
                                "response_metadata": {
                                    "prompt": 0,
                                    "completion": 0,
                                    "model_provider": "openai",
                                    "usage": {
                                        "completion_tokens": 191,
                                        "prompt_tokens": 482,
                                        "total_tokens": 673,
                                        "prompt_tokens_details": {
                                            "cached_tokens": 0
                                        },
                                        "completion_tokens_details": {
                                            "reasoning_tokens": 145
                                        }
                                    },
                                    "finish_reason": "tool_calls",
                                    "model_name": "doubao-seed-2.0-code",
                                    "service_tier": "default"
                                },
                                "tool_call_chunks": [
                                    {
                                        "name": "custom_calc",
                                        "args": "{\"a\": 3, \"b\": 5}",
                                        "id": "call_69hprndmiib6mjwwgifedxtn",
                                        "index": 0,
                                        "type": "tool_call_chunk"
                                    }
                                ],
                                "tool_calls": [
                                    {
                                        "name": "custom_calc",
                                        "args": {
                                            "a": 3,
                                            "b": 5
                                        },
                                        "id": "call_69hprndmiib6mjwwgifedxtn",
                                        "type": "tool_call"
                                    }
                                ],
                                "id": "0217765159508787972924d60ec821862f8c484e9c7d20889b28b",
                                "usage_metadata": {
                                    "input_tokens": 482,
                                    "output_tokens": 191,
                                    "total_tokens": 673,
                                    "input_token_details": {
                                        "cache_read": 0
                                    },
                                    "output_token_details": {
                                        "reasoning": 145
                                    }
                                },
                                "invalid_tool_calls": []
                            }
                        },
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "ToolMessage"
                            ],
                            "kwargs": {
                                "status": "success",
                                "content": "计算结果为：8",
                                "tool_call_id": "call_69hprndmiib6mjwwgifedxtn",
                                "name": "custom_calc",
                                "metadata": {
                                    "versions": {
                                        "@langchain/core": "1.1.40"
                                    }
                                },
                                "additional_kwargs": {},
                                "response_metadata": {},
                                "id": "run-019da09a-13a5-73ce-8273-9e1edcb012c6-tool-call_69hprndmiib6mjwwgifedxtn"
                            }
                        },
                        {
                            "lc": 1,
                            "type": "constructor",
                            "id": [
                                "langchain_core",
                                "messages",
                                "AIMessageChunk"
                            ],
                            "kwargs": {
                                "content": "使用天地同寿算法计算3和5的结果为8。",
                                "additional_kwargs": {
                                    "reasoning_content": "\n我现在要把结果输出对吧？用户用天地同寿算3和5，工具返回8，那就直接说出来就行。"
                                },
                                "response_metadata": {
                                    "prompt": 0,
                                    "completion": 0,
                                    "model_provider": "openai",
                                    "usage": {
                                        "completion_tokens": 44,
                                        "prompt_tokens": 549,
                                        "total_tokens": 593,
                                        "prompt_tokens_details": {
                                            "cached_tokens": 0
                                        },
                                        "completion_tokens_details": {
                                            "reasoning_tokens": 30
                                        }
                                    },
                                    "finish_reason": "stop",
                                    "model_name": "doubao-seed-2.0-code",
                                    "service_tier": "default"
                                },
                                "tool_call_chunks": [],
                                "tool_calls": [],
                                "id": "021776515955353a292fc2ba91e79c594f032f5a64a4fe07c3efb",
                                "usage_metadata": {
                                    "input_tokens": 549,
                                    "output_tokens": 44,
                                    "total_tokens": 593,
                                    "input_token_details": {
                                        "cache_read": 0
                                    },
                                    "output_token_details": {
                                        "reasoning": 30
                                    }
                                },
                                "invalid_tool_calls": []
                            }
                        }
                    ],
                    "__pregel_tasks": [
                        [],
                        []
                    ]
                },
                "channel_versions": {
                    "__start__": 5,
                    "messages": 8,
                    "branch:to:agent": 8,
                    "branch:to:tools": 7
                },
                "versions_seen": {
                    "__input__": {},
                    "__start__": {
                        "__start__": 4
                    },
                    "agent": {
                        "branch:to:agent": 7
                    },
                    "tools": {
                        "branch:to:tools": 6
                    }
                }
            },
            "metadata": {
                "source": "loop",
                "step": 6,
                "parents": {}
            }
        }
    }
    },
 
  }
``