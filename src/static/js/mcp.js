/**
 * @fileoverview 模块，用于处理与Qwen模型的MCP（模型上下文协议）交互。
 * 负责协调模型、外部工具（如Tavily搜索）和UI之间的通信。
 * 最终修复：移除对外部SDK的依赖，使用原生fetch实现MCP客户端逻辑。
 */

/**
 * QwenMcpClient 类
 * @class
 * @description 管理与Qwen模型的工具调用流程。
 */
export class QwenMcpClient {
    /**
     * 构造函数
     * @param {object} options - 配置选项。
     * @param {string} options.tavilyServerUrl - Tavily MCP服务器的URL。
     * @param {object} options.callbacks - 用于与UI通信的回调函数。
     */
    constructor({ tavilyServerUrl, callbacks }) {
        this.tavilyServerUrl = tavilyServerUrl;
        this.callbacks = callbacks;
        // 初始化时不再需要复杂的McpClient实例
        console.log('QwenMcpClient initialized for server:', this.tavilyServerUrl);
    }

    /**
     * 初始化MCP客户端 (现在是一个空操作，为了保持接口一致性)
     * @returns {Promise<void>}
     */
    async initialize() {
        // 不需要执行任何操作，因为我们直接使用fetch
        return Promise.resolve();
    }

    /**
     * 发送消息并处理完整的MCP流程
     * @async
     * @param {object} requestBody - 发送给模型的初始请求体。
     * @returns {Promise<void>}
     */
    async sendMessage(requestBody) {
        // 1. 定义Tavily搜索工具的schema
        const tools = [{
            type: "function",
            function: {
                name: "tavily::search", // 格式: server_name::tool_name
                description: "当需要回答有关时事、近期事件或需要实时网络信息的任何问题时，请使用此工具。",
                parameters: {
                    type: "object",
                    required: ["query"],
                    properties: {
                        query: {
                            type: "string",
                            description: "要执行的搜索查询。例如：'最新的AI技术进展是什么？'"
                        }
                    },
                }
            }
        }];

        // 2. 将工具定义合并到请求体中
        const finalRequestBody = {
            ...requestBody,
            tools: tools,
            stream: true // 确保启用了流式响应
        };

        let finalContent = '';
        let currentAIMessageElement = null;

        try {
            // 3. 使用 fetch API 发送请求到我们的 MCP Worker
            const response = await fetch(this.tavilyServerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(finalRequestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保留不完整的行

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        const chunk = JSON.parse(line);
                        
                        switch (chunk.type) {
                            case 'tool-start':
                                console.log('Tool call started:', chunk.toolCall);
                                if (this.callbacks.onToolStart) {
                                   currentAIMessageElement = this.callbacks.onToolStart(chunk.toolCall);
                                }
                                break;

                            case 'tool-end':
                                console.log('Tool call finished:', chunk.toolResult);
                                if (this.callbacks.onToolEnd && currentAIMessageElement) {
                                    this.callbacks.onToolEnd(currentAIMessageElement, chunk.toolResult);
                                }
                                break;

                            case 'text':
                                if (!currentAIMessageElement) {
                                    currentAIMessageElement = this.callbacks.createAIMessageElement();
                                }
                                finalContent += chunk.content;
                                if (this.callbacks.onUpdateContent && currentAIMessageElement) {
                                    this.callbacks.onUpdateContent(currentAIMessageElement, finalContent);
                                }
                                break;
                        }
                    } catch (e) {
                        console.warn('Failed to parse JSON chunk:', line, e);
                    }
                }
            }

            if (this.callbacks.onComplete) {
                this.callbacks.onComplete(finalContent);
            }

        } catch (error) {
            console.error('MCP chat flow failed:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('MCP 聊天流程失败: ' + error.message);
            }
        }
    }
}