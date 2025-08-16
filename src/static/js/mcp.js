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
     * 接收到工具调用指令后，处理完整的工具执行和响应流程。
     * @async
     * @param {object} originalRequestBody - 包含完整历史记录的原始请求体。
     * @param {object} toolCall - 从后端解析出的 `tool_code` 对象，结构为 { tool_name, tool_params }。
     * @returns {Promise<void>}
     */
    async sendMessage(originalRequestBody, toolCall) {
        let finalContent = '';
        let currentAIMessageElement = null;

        try {
            // --- 步骤 1: UI提示 & 执行工具 ---
            this.callbacks.logMessage(`Qwen MCP: Received tool call: ${toolCall.tool_name}`, 'system');
            currentAIMessageElement = this.callbacks.onToolStart(toolCall);

            const mcpRequestBody = {
                type: "tool_use",
                tool_name: toolCall.tool_name.split('::')[1], // Extract "search" from "tavily::search"
                arguments: toolCall.tool_params
            };

            const toolResponse = await fetch(this.tavilyServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mcpRequestBody)
            });

            if (!toolResponse.ok) {
                throw new Error(`Tool execution failed! status: ${toolResponse.status}`);
            }
            const toolResult = await toolResponse.json();
            this.callbacks.onToolEnd(currentAIMessageElement, toolCall); // Pass original toolCall for name

            // --- 步骤 2: 将结果发回模型 ---
            const assistantMessageWithToolCall = {
                role: 'assistant',
                content: `<tool_code>${JSON.stringify(toolCall)}</tool_code>`
            };
            const toolResponseMessage = {
                role: 'tool',
                content: JSON.stringify(toolResult) // Send the entire tool result back
            };

            const newRequestBody = {
                ...originalRequestBody,
                messages: [
                    ...originalRequestBody.messages,
                    assistantMessageWithToolCall,
                    toolResponseMessage
                ]
            };

            this.callbacks.logMessage('Qwen MCP: Sending tool result back to model...', 'system');
            
            // --- 步骤 3: 获取并流式处理最终答案 ---
            const finalResponse = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRequestBody)
            });

            if (!finalResponse.ok) {
                throw new Error(`Final response fetch failed! status: ${finalResponse.status}`);
            }

            const reader = finalResponse.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalMessageElement = this.callbacks.createAIMessageElement();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim().startsWith('data:')) {
                        const dataStr = line.substring(5).trim();
                        if (dataStr === '[DONE]') continue;
                        try {
                            const chunk = JSON.parse(dataStr);
                            const textContent = chunk.choices?.[0]?.delta?.content || '';
                            if (textContent) {
                                finalContent += textContent;
                                this.callbacks.onUpdateContent(finalMessageElement, finalContent);
                            }
                        } catch (e) {
                            console.warn('Failed to parse final response chunk:', dataStr, e);
                        }
                    }
                }
            }
            
            this.callbacks.onComplete(finalContent);

        } catch (error) {
            console.error('MCP chat flow failed:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('MCP 聊天流程失败: ' + error.message);
            }
        }
    }
}