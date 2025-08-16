import { QwenMcpClient } from '../mcp.js'; // Import Qwen MCP Client
import { Logger } from '../utils/logger.js';
import * as chatUI from './chat-ui.js';

/**
 * @class ChatApiHandler
 * @description Handles the business logic for chat API interactions,
 * including processing streaming responses and managing tool calls for both Gemini and Qwen.
 */
export class ChatApiHandler {
    constructor({ toolManager, historyManager, state, libs }) {
        this.toolManager = toolManager;
        this.historyManager = historyManager;
        this.state = state;
        this.libs = libs;
        this.qwenMcpClient = null; // To be initialized on demand for Qwen tool calls
    }

    async streamChatCompletion(requestBody, apiKey) {
        // Reset state for the new message
        this.state.currentAIMessageContentDiv = null;
        let isToolResponseFollowUp = requestBody.messages.some(msg => msg.role === 'tool');

        try {
            // Use the correct endpoint. The worker will route based on the model name.
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let geminiFunctionCall = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    Logger.info('HTTP Stream finished.');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim().startsWith('data:')) {
                        const jsonStr = line.substring(5).trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const data = JSON.parse(jsonStr);

                            // --- DECISION POINT ---
                            // 1. Check for Qwen Tool Call
                            if (data.tool_code) {
                                await this.handleQwenToolCall(data.tool_code, requestBody);
                                return; // Qwen MCP client handles the rest of the flow
                            }

                            // 2. Check for Gemini Tool Call (existing logic)
                            const choice = data.choices?.[0];
                            const functionCallPart = choice?.delta?.parts?.find(p => p.functionCall);
                            if (functionCallPart) {
                                geminiFunctionCall = functionCallPart.functionCall;
                                continue; // Accumulate function call parts if necessary
                            }

                            // 3. Process as regular text content
                            const textContent = choice?.delta?.content || '';
                            if (textContent) {
                                if (!this.state.currentAIMessageContentDiv) {
                                    this.state.currentAIMessageContentDiv = chatUI.createAIMessageElement();
                                }
                                this.state.currentAIMessageContentDiv.rawMarkdownBuffer += textContent;
                                this.renderMarkdown();
                            }

                        } catch (e) {
                            Logger.error('Error parsing SSE chunk:', e, jsonStr);
                        }
                    }
                }
            }

            // --- POST-STREAM PROCESSING ---
            // Handle Gemini tool call if detected
            if (geminiFunctionCall) {
                await this.handleGeminiToolCall(geminiFunctionCall, requestBody, apiKey);
            } else {
                // Finalize regular text message
                this.finalizeMessage();
            }

        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            chatUI.logMessage(`处理流失败: ${error.message}`, 'system');
            if (this.state.currentAIMessageContentDiv?.markdownContainer) {
                this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            this.state.currentAIMessageContentDiv = null;
        }
    }
    
    async handleQwenToolCall(toolCall, originalRequestBody) {
        if (!this.qwenMcpClient) {
            chatUI.logMessage('检测到Qwen工具调用，正在初始化MCP客户端...', 'system');
            this.qwenMcpClient = new QwenMcpClient({
                // Assuming CONFIG is available or passed differently
                tavilyServerUrl: 'https://tavilymcp.10110531.xyz',
                callbacks: {
                    logMessage: chatUI.logMessage,
                    createAIMessageElement: chatUI.createAIMessageElement,
                    scrollToBottom: chatUI.scrollToBottom,
                    onToolStart: (tc) => {
                        const el = chatUI.createAIMessageElement();
                        const toolName = tc?.tool_name?.split('::')[1] || tc?.tool_name || '未知工具';
                        el.contentDiv.innerHTML = `<div class="tool-call-status">正在使用工具: <strong>${toolName}</strong>...</div>`;
                        return el;
                    },
                    onToolEnd: (element, toolResult) => {
                        const toolName = toolResult?.tool_name?.split('::')[1] || toolResult?.tool_name || '未知工具';
                        element.contentDiv.innerHTML = `<div class="tool-call-status">✅ 工具 <strong>${toolName}</strong> 调用完成。</div>`;
                    },
                    onUpdateContent: (element, content) => {
                        element.markdownContainer.innerHTML = this.libs.marked.parse(content);
                        if (this.libs.MathJax?.startup) {
                            this.libs.MathJax.startup.promise.then(() => {
                                this.libs.MathJax.typeset([element.markdownContainer]);
                            });
                        }
                        chatUI.scrollToBottom();
                    },
                    onComplete: (finalContent) => {
                        this.state.chatHistory.push({ role: 'assistant', content: finalContent });
                        this.historyManager.saveHistory();
                    },
                    onError: (errorMessage) => chatUI.logMessage(errorMessage, 'system'),
                }
            });
            await this.qwenMcpClient.initialize();
        }
        
        // The sendMessage in QwenMcpClient will now handle the full loop
        await this.qwenMcpClient.sendMessage(originalRequestBody, toolCall);
    }

    async handleGeminiToolCall(functionCall, requestBody, apiKey) {
        // This logic is extracted from the old implementation
        if (this.state.currentAIMessageContentDiv?.rawMarkdownBuffer) {
            this.state.chatHistory.push({
                role: 'assistant',
                content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
            });
        }
        this.state.currentAIMessageContentDiv = null;

        try {
            this.state.isUsingTool = true;
            chatUI.logMessage(`执行工具: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`, 'system');
            const toolResult = await this.toolManager.handleToolCall(functionCall);
            const toolResponsePart = toolResult.functionResponses[0].response.output;

            this.state.chatHistory.push({
                role: 'assistant',
                parts: [{ functionCall }]
            });
            this.state.chatHistory.push({
                role: 'tool',
                parts: [{ functionResponse: { name: functionCall.name, response: toolResponsePart } }]
            });

            // Recurse with updated history
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
            }, apiKey);

        } catch (toolError) {
            Logger.error('工具执行失败:', toolError);
            chatUI.logMessage(`工具执行失败: ${toolError.message}`, 'system');
            // Handle tool error response if necessary
        } finally {
            this.state.isUsingTool = false;
        }
    }

    renderMarkdown() {
        if (this.state.currentAIMessageContentDiv) {
            this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(this.state.currentAIMessageContentDiv.rawMarkdownBuffer);
            if (this.libs.MathJax?.startup) {
                this.libs.MathJax.startup.promise.then(() => {
                    this.libs.MathJax.typeset([this.state.currentAIMessageContentDiv.markdownContainer]);
                }).catch((err) => console.error('MathJax typesetting failed:', err));
            }
            chatUI.scrollToBottom();
        }
    }

    finalizeMessage() {
        if (this.state.currentAIMessageContentDiv?.rawMarkdownBuffer?.trim()) {
            this.state.chatHistory.push({
                role: 'assistant',
                content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
            });
            this.historyManager.saveHistory();
        }
        this.state.currentAIMessageContentDiv = null;
        chatUI.logMessage('Turn complete (HTTP)', 'system');
    }
}