/**
 * @fileoverview 模块，用于处理与Qwen模型的MCP（模型上下文协议）交互。
 * 负责协调模型、外部工具（如Tavily搜索）和UI之间的通信。
 */

// 直接从CDN导入ESM版本的McpClient，不再依赖全局变量
import { McpClient } from 'https://cdn.jsdelivr.net/npm/@modelcontextprotocol/sdk@latest/dist/index.js';

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
        this.mcpClient = null;
    }

    /**
     * 初始化MCP客户端
     * @async
     * @description 实例化并配置McpClient，连接到Tavily服务器。
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.mcpClient = new McpClient({
                servers: {
                    // 定义一个名为 'tavily' 的MCP服务器
                    'tavily': {
                        // 指定服务器的URL，使用您设置的自定义域名
                        url: this.tavilyServerUrl,
                        // 可以在此添加其他服务器特定配置，例如认证头
                        // headers: { 'Authorization': 'Bearer YOUR_SERVER_API_KEY' }
                    }
                }
            });
            console.log('QwenMcpClient initialized successfully, connected to:', this.tavilyServerUrl);
        } catch (error) {
            console.error('Failed to initialize McpClient:', error);
            // 可以在此处通过回调通知UI初始化失败
            if (this.callbacks.onError) {
                this.callbacks.onError('MCP客户端初始化失败: ' + error.message);
            }
        }
    }

    /**
     * 发送消息并处理完整的MCP流程
     * @async
     * @param {object} requestBody - 发送给模型的初始请求体。
     * @returns {Promise<void>}
     */
    async sendMessage(requestBody) {
        if (!this.mcpClient) {
            const errorMsg = 'MCP client is not initialized.';
            console.error(errorMsg);
            if (this.callbacks.onError) this.callbacks.onError(errorMsg);
            return;
        }

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
            // 3. 使用mcpClient.chat处理整个流程
            const stream = await this.mcpClient.chat(finalRequestBody);

            for await (const chunk of stream) {
                switch (chunk.type) {
                    case 'tool-start':
                        console.log('Tool call started:', chunk.toolCall);
                        // 任务T7的UI回调：显示工具使用状态
                        if (this.callbacks.onToolStart) {
                           currentAIMessageElement = this.callbacks.onToolStart(chunk.toolCall);
                        }
                        break;

                    case 'tool-end':
                        console.log('Tool call finished:', chunk.toolResult);
                        // 任务T7的UI回调：更新工具使用状态为完成
                        if (this.callbacks.onToolEnd && currentAIMessageElement) {
                            this.callbacks.onToolEnd(currentAIMessageElement, chunk.toolResult);
                        }
                        break;

                    case 'text':
                        // 这是模型的最终文本响应
                        if (!currentAIMessageElement) {
                            // 如果没有工具调用，则创建一个新的AI消息元素
                            currentAIMessageElement = this.callbacks.createAIMessageElement();
                        }
                        finalContent += chunk.content;
                        // 通过回调流式更新UI
                        if (this.callbacks.onUpdateContent && currentAIMessageElement) {
                            this.callbacks.onUpdateContent(currentAIMessageElement, finalContent);
                        }
                        break;
                }
            }
            
            // 整个流程完成后的回调
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