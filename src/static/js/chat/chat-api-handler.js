console.log("--- ChatApiHandler v3 Loaded ---");
import { Logger } from '../utils/logger.js';
import * as chatUI from './chat-ui.js';
import { displayImageResult } from './chat-ui.js';

/**
 * @class ChatApiHandler
 * @description Handles the business logic for chat API interactions,
 * including processing streaming responses and managing tool calls.
 */
export class ChatApiHandler {
    /**
     * @constructor
     * @param {object} dependencies - The dependencies required by the handler.
     * @param {ToolManager} dependencies.toolManager - The tool manager instance.
     * @param {HistoryManager} dependencies.historyManager - The history manager instance.
     * @param {object} dependencies.state - A state object containing shared variables.
     * @param {Array} dependencies.state.chatHistory - The chat history array.
     * @param {string|null} dependencies.state.currentSessionId - The current session ID.
     * @param {HTMLElement|null} dependencies.state.currentAIMessageContentDiv - The current AI message container.
     * @param {boolean} dependencies.state.isUsingTool - Flag indicating if a tool is in use.
     * @param {object} dependencies.libs - External libraries.
     * @param {object} dependencies.libs.marked - The marked.js library instance.
     * @param {object} dependencies.libs.MathJax - The MathJax library instance.
     */
    constructor({ toolManager, historyManager, state, libs, config }) {
        this.toolManager = toolManager;
        this.historyManager = historyManager;
        this.state = state;
        this.libs = libs;
        this.config = config; // 存储配置对象
    }

    /**
     * 🎯 [核心修复] Agent模式专用智能重试机制
     * 专门处理Agent模式下的API速率限制问题
     */
    async _fetchWithAgentRetry(url, options) {
        const maxRetries = 3;
        const baseDelay = 2000; // 2秒基础延迟
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Agent模式专用退避策略：2s, 4s, 8s
                    const backoffTime = baseDelay * Math.pow(2, attempt - 1);
                    console.log(`[ChatApiHandler] Agent模式第${attempt}次重试，等待${backoffTime}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                }
                
                const response = await fetch(url, options);
                
                // 🎯 专门处理429错误
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    if (retryAfter) {
                        // 如果服务器告知重试时间，使用服务器建议
                        const waitTime = parseInt(retryAfter) * 1000;
                        console.log(`[ChatApiHandler] 服务器建议${waitTime}ms后重试`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    throw new Error(`Agent模式速率限制 (429)，第${attempt + 1}次尝试`);
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
                
            } catch (error) {
                lastError = error;
                console.warn(`[ChatApiHandler] Agent模式API调用失败 (尝试 ${attempt + 1}):`, error.message);
                
                // 如果是网络错误或5xx错误，继续重试
                if (error.message.includes('fetch') || error.message.includes('5')) {
                    continue;
                }
                // 如果是4xx错误（除429外），立即失败
                if (error.message.includes('4') && !error.message.includes('429')) {
                    break;
                }
            }
        }
        
        throw lastError || new Error(`Agent模式API调用失败，已重试${maxRetries}次`);
    }

    /**
     * 🎯 智能检测Agent请求
     */
    _isAgentRequest(requestBody) {
        // 基于消息内容特征来判断是否为Agent模式
        const agentKeywords = ['思考:', '研究计划:', '行动:', '行动输入:', '最终答案:'];
        
        // 检查最近的几条消息
        const recentMessages = requestBody.messages?.slice(-5) || [];
        
        return recentMessages.some(msg => {
            const content = msg.content;
            if (typeof content === 'string') {
                return agentKeywords.some(kw => content.includes(kw));
            } else if (Array.isArray(content)) {
                // 处理多模态消息
                const textPart = content.find(p => p.type === 'text');
                return textPart && agentKeywords.some(kw => textPart.text.includes(kw));
            }
            return false;
        });
    }

    /**
     * Processes an HTTP Server-Sent Events (SSE) stream from the chat completions API.
     * It handles text accumulation, UI updates, and tool calls.
     * @param {object} requestBody - The request body to be sent to the model.
     * @param {string} apiKey - The API key for authorization.
     * @returns {Promise<void>}
     */
    async streamChatCompletion(requestBody, apiKey, uiOverrides = null) {
        // ✅ 步骤2: 接收 uiOverrides 参数
        const ui = uiOverrides || chatUI; // ✅ 如果有覆盖则使用，否则回退到默认的 chatUI

        let currentMessages = requestBody.messages;
        const selectedModelName = requestBody.model; // 获取当前模型名称
        const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName);
        
        // 检查当前模型是否为Gemini类型（通过名称判断，不依赖isGemini标签）
        const isCurrentModelGeminiType = selectedModelName.includes('gemini');
        const isReasoningEnabledGlobally = localStorage.getItem('geminiEnableReasoning') === 'true';
        
        let enableReasoning;
        if (modelConfig && modelConfig.enableReasoning !== undefined) {
            // 如果模型配置中明确设置了 enableReasoning，则以其为准
            enableReasoning = modelConfig.enableReasoning;
        } else {
            // 否则，回退到 localStorage 中的全局开关状态，但仅限于 Gemini 类型模型
            enableReasoning = isCurrentModelGeminiType && isReasoningEnabledGlobally;
        }
        
        const disableSearch = modelConfig ? modelConfig.disableSearch : false;
        
        // 提取 tools 字段，它可能来自 vision-core.js 或 chat-ui.js
        const tools = requestBody.tools;

        try {
            // 🎯 注意：streamChatCompletion 保持原有的 fetch 逻辑，不在这里使用重试
            // 因为流式响应不适合重试机制
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                // 将 tools, enableReasoning 和 disableSearch 参数添加到请求体中
                body: JSON.stringify({ ...requestBody, tools, enableReasoning, disableSearch })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP API 请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let functionCallDetected = false;
            let currentFunctionCall = null;
            let reasoningStarted = false;
            let answerStarted = false;

            // --- Qwen Tool Call Stream Assembler ---
            let qwenToolCallAssembler = null;
            // ---

            const isToolResponseFollowUp = currentMessages.some(msg => msg.role === 'tool');
            if (!isToolResponseFollowUp) {
                this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    Logger.info('HTTP Stream finished.');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');

                while (boundary !== -1) {
                    const message = buffer.substring(0, boundary);
                    buffer = buffer.substring(boundary + 2);

                    if (message.startsWith('data: ')) {
                        const jsonStr = message.substring(6);
                        if (jsonStr === '[DONE]') {
                            boundary = buffer.indexOf('\n\n');
                            continue;
                        }
                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.choices && data.choices.length > 0) {
                                const choice = data.choices[0];
                                const functionCallPart = choice.delta.parts?.find(p => p.functionCall);
                                const qwenToolCallParts = choice.delta.tool_calls;

                                if (qwenToolCallParts && Array.isArray(qwenToolCallParts)) {
                                    // --- Qwen Tool Call Assembly Logic ---
                                    qwenToolCallParts.forEach(toolCallChunk => {
                                        const func = toolCallChunk.function;
                                        if (func && func.name) { // First chunk
                                            if (!qwenToolCallAssembler) {
                                                qwenToolCallAssembler = { tool_name: func.name, arguments: func.arguments || '' };
                                                Logger.info('Qwen MCP tool call started:', qwenToolCallAssembler);
                                                ui.logMessage(`模型请求 MCP 工具: ${qwenToolCallAssembler.tool_name}`, 'system');
                                                if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                            } else {
                                                qwenToolCallAssembler.arguments += func.arguments || '';
                                            }
                                        } else if (qwenToolCallAssembler && func && func.arguments) { // Subsequent chunks
                                            qwenToolCallAssembler.arguments += func.arguments;
                                        }
                                    });
                                    // --- End Assembly Logic ---

                                } else if (functionCallPart) {
                                    // Gemini Function Call Detected
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    ui.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;

                                } else if (choice.delta && !functionCallDetected && !qwenToolCallAssembler) {
                                    // Process reasoning and content only if no tool call is active
                                    if (choice.delta.reasoning_content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        // 兼容性检查：确保 reasoningContainer 存在
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer) {
                                            if (!reasoningStarted) {
                                                this.state.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                                reasoningStarted = true;
                                            }
                                            const reasoningText = choice.delta.reasoning_content;
                                            
                                            // 兼容性检查：确保 rawReasoningBuffer 存在
                                            if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string') {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer += reasoningText;
                                            } else {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer = reasoningText;
                                            }
                                            
                                            // 兼容性检查：确保 reasoning-content 元素存在
                                            const reasoningContentEl = this.state.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content');
                                            if (reasoningContentEl) {
                                                reasoningContentEl.innerHTML += reasoningText.replace(/\n/g, '<br>');
                                            }
                                        }
                                    }
                                    
                                    if (choice.delta.content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        // 兼容性检查：确保 reasoningContainer 存在且需要添加分隔线
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer &&
                                            reasoningStarted && !answerStarted) {
                                            const separator = document.createElement('hr');
                                            separator.className = 'answer-separator';
                                            // 兼容性检查：确保 markdownContainer 存在
                                            if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                                this.state.currentAIMessageContentDiv.markdownContainer.before(separator);
                                            }
                                            answerStarted = true;
                                        }

                                        // 兼容性处理：确保 rawMarkdownBuffer 存在
                                        if (typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string') {
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        } else {
                                            // 如果不存在，初始化
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer = choice.delta.content || '';
                                        }

                                        // 兼容性检查：确保 markdownContainer 存在
                                        if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                            this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(
                                                this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                                            );
                                        }
                                        
                                        // 应用数学公式渲染 - 兼容性处理
                                        if (typeof this.libs.MathJax !== 'undefined' && this.libs.MathJax.startup) {
                                            this.libs.MathJax.startup.promise.then(() => {
                                                const containersToTypeset = [];
                                                if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                                    containersToTypeset.push(this.state.currentAIMessageContentDiv.markdownContainer);
                                                }
                                                if (this.state.currentAIMessageContentDiv.reasoningContainer) {
                                                    containersToTypeset.push(this.state.currentAIMessageContentDiv.reasoningContainer);
                                                }
                                                if (containersToTypeset.length > 0) {
                                                    this.libs.MathJax.typeset(containersToTypeset);
                                                }
                                            }).catch((err) => console.error('MathJax typesetting failed:', err));
                                        }
                                        
                                        // 调用滚动函数
                                        if (ui.scrollToBottom) {
                                            ui.scrollToBottom();
                                        }
                                    }
                                }
                            }
                            if (data.usage) {
                                Logger.info('Usage:', data.usage);
                            }
                        } catch (e) {
                            Logger.error('Error parsing SSE chunk:', e, jsonStr);
                        }
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }

            // --- Post-Stream Processing ---
            if (qwenToolCallAssembler) {
                functionCallDetected = true;
                currentFunctionCall = qwenToolCallAssembler;
                try {
                    JSON.parse(currentFunctionCall.arguments);
                } catch (e) {
                    console.error("Failed to parse assembled tool call arguments.", e);
                }
            }

            const timestamp = () => new Date().toISOString();
            if (functionCallDetected && currentFunctionCall) {
                console.log(`[${timestamp()}] [DISPATCH] Stream finished. Tool call detected.`);
                
                // 兼容性处理：保存最终文本到历史记录
                if (this.state.currentAIMessageContentDiv &&
                    typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string' &&
                    this.state.currentAIMessageContentDiv.rawMarkdownBuffer.trim() !== '') {
                    
                    console.log(`[${timestamp()}] [DISPATCH] Saving final text part to history.`);
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;

                // 根据 currentFunctionCall 的结构区分是 Gemini 调用还是 Qwen 调用
                console.log(`[${timestamp()}] [DISPATCH] Analyzing tool call for model: ${requestBody.model}`);
                const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);

                const isQwenModel = modelConfig && modelConfig.isQwen;
                const isZhipuModel = modelConfig && modelConfig.isZhipu;
                const isGeminiToolModel = modelConfig && modelConfig.isGemini; // 新增：检查Gemini工具模型标签

                // 为 Qwen、Zhipu 和启用了工具的 Gemini 模型统一路由到 MCP 处理器
                if (isQwenModel || isZhipuModel || isGeminiToolModel) {
                    // 对于 Gemini 风格的 functionCall，我们将其标准化为 MCP 期望的格式
                    const mcpToolCall = currentFunctionCall.tool_name
                        ? currentFunctionCall
                        : { tool_name: currentFunctionCall.name, arguments: JSON.stringify(currentFunctionCall.args || {}) };
                    
                    console.log(`[${timestamp()}] [DISPATCH] Detected Qwen/Zhipu/Gemini MCP tool call. Routing to _handleMcpToolCall...`);
                    await this._handleMcpToolCall(mcpToolCall, requestBody, apiKey, uiOverrides);

                } else {
                    // 否则，处理为标准的、前端执行的 Gemini 函数调用（例如默认的 Google 搜索）
                    console.log(`[${timestamp()}] [DISPATCH] Model is not configured for MCP. Routing to _handleGeminiToolCall...`);
                    await this._handleGeminiToolCall(currentFunctionCall, requestBody, apiKey, uiOverrides);
                }
                console.log(`[${timestamp()}] [DISPATCH] Returned from tool call handler.`);

            } else {
                // 兼容性处理：保存非工具调用的响应
                if (this.state.currentAIMessageContentDiv &&
                    typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string' &&
                    this.state.currentAIMessageContentDiv.rawMarkdownBuffer.trim() !== '') {
                    
                    const historyEntry = {
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    };
                    
                    // 兼容性检查：如果有思维链内容也保存
                    if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string' &&
                        this.state.currentAIMessageContentDiv.rawReasoningBuffer.trim() !== '') {
                        historyEntry.reasoning = this.state.currentAIMessageContentDiv.rawReasoningBuffer;
                    }
                    
                    this.state.chatHistory.push(historyEntry);
                }
                this.state.currentAIMessageContentDiv = null;
                
                if (ui.logMessage) {
                    ui.logMessage('Turn complete (HTTP)', 'system');
                }
                
                // 保存历史记录 - 只在有 historyManager 时保存
                if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                    this.historyManager.saveHistory();
                }
            }
     
        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            ui.logMessage(`处理流失败: ${error.message}`, 'system');
            if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            this.state.currentAIMessageContentDiv = null;
            // 确保在失败时也保存历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory(); // Ensure history is saved even on failure
            }
        }
    }

    /**
     * @description 兼容方法：提供一个非流式的 completeChat 接口，返回模型的完整JSON响应。
     * 许多Agent逻辑期望llm.completeChat类似于OpenAI风格的非流式response。
     * @param {object} requestBody
     * @param {string} apiKey
     * @returns {Promise<object>} 响应JSON
     */
    async completeChat(requestBody, apiKey) {
        const isAgentMode = this._isAgentRequest(requestBody);
        
        try {
            let response;
            
            if (isAgentMode) {
                // 🎯 Agent模式：使用带重试的专用方法
                console.log('[ChatApiHandler] Agent模式检测到，启用智能重试机制');
                response = await this._fetchWithAgentRetry('/api/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ ...requestBody, stream: false })
                });
            } else {
                // 标准模式：保持原有逻辑
                response = await fetch('/api/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ ...requestBody, stream: false })
                });
            }

            if (response.ok) {
                let json = null;
                try { json = await response.json(); } catch (_e) { json = null; }

                // 检查是否为预期的非流式响应（含 choices/message）
                if (json && Array.isArray(json.choices) && json.choices[0] && json.choices[0].message && json.choices[0].message.content) {
                    return json;
                }
                // 如果返回结构不符，继续走流式回退逻辑
            }

            // 回退：使用流式接口并等待其完成，然后从 state 中提取最终文本
            console.warn('[ChatApiHandler] Non-stream response missing or backend does not support non-stream mode; falling back to stream adapter.');
            // 我们复用现有的 streamChatCompletion，它会在完成时将最终内容推入 this.state.chatHistory
            await this.streamChatCompletion(requestBody, apiKey);

            // 尝试从 chatHistory 中取最后一条 assistant 内容
            let finalText = null;
            if (Array.isArray(this.state.chatHistory)) {
                for (let i = this.state.chatHistory.length - 1; i >= 0; i--) {
                    const entry = this.state.chatHistory[i];
                    if (entry && entry.role === 'assistant') {
                        if (typeof entry.content === 'string' && entry.content.trim() !== '') {
                            finalText = entry.content;
                            break;
                        }
                        // 也可能存在 parts/markdown buffer
                        if (entry.parts && entry.parts[0] && entry.parts[0].functionResponse && entry.parts[0].functionResponse.response) {
                            finalText = entry.parts[0].functionResponse.response;
                            break;
                        }
                    }
                }
            }

            // 其次尝试从 currentAIMessageContentDiv 缓冲提取
            if (!finalText && this.state.currentAIMessageContentDiv && typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string') {
                finalText = this.state.currentAIMessageContentDiv.rawMarkdownBuffer;
            }

            if (finalText) {
                return {
                    choices: [
                        { message: { content: finalText } }
                    ]
                };
            }

            throw new Error('无法从流式/非流式响应中提取最终文本');

        } catch (error) {
            console.error(`[ChatApiHandler] completeChat ${isAgentMode ? 'Agent模式' : '标准模式'} 失败:`, error);
            throw error;
        }
    }

    /**
     * @private
     * @description Handles the execution of a Gemini tool call.
     * @param {object} functionCall - The Gemini function call object.
     * @param {object} requestBody - The original request body.
     * @param {string} apiKey - The API key.
     * @returns {Promise<void>}
     */
    _handleGeminiToolCall = async (functionCall, requestBody, apiKey, uiOverrides = null) => {
        const ui = uiOverrides || chatUI;
        try {
            this.state.isUsingTool = true;
            ui.logMessage(`执行 Gemini 工具: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`, 'system');
            const toolResult = await this.toolManager.handleToolCall(functionCall);
            const toolResponsePart = toolResult.functionResponses[0].response.output;

            this.state.chatHistory.push({
                role: 'assistant',
                parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
            });

            this.state.chatHistory.push({
                role: 'tool',
                parts: [{ functionResponse: { name: functionCall.name, response: toolResponsePart } }]
            });

            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides);
 
        } catch (toolError) {
            Logger.error('Gemini 工具执行失败:', toolError);
            ui.logMessage(`Gemini 工具执行失败: ${toolError.message}`, 'system');
            this.state.chatHistory.push({
                role: 'assistant',
                parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
            });
            this.state.chatHistory.push({
                role: 'tool',
                parts: [{ functionResponse: { name: functionCall.name, response: { error: toolError.message } } }]
            });
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides);
        } finally {
            this.state.isUsingTool = false;
            // 保存工具调用的历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    /**
     * @private
     * @description Handles the execution of a Qwen MCP tool call via the backend proxy.
     * @param {object} toolCode - The tool_code object from the Qwen model.
     * @param {object} requestBody - The original request body.
     * @param {string} apiKey - The API key.
     * @returns {Promise<void>}
     */
    _handleMcpToolCall = async (toolCode, requestBody, apiKey, uiOverrides = null) => {
        const ui = uiOverrides || chatUI;
        const timestamp = () => new Date().toISOString();
        const callId = `call_${Date.now()}`; // 在函数顶部声明并初始化 callId
        console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall START ---`);

        try {
            this.state.isUsingTool = true;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to true.`);

            // 显示工具调用状态UI
            console.log(`[${timestamp()}] [MCP] Displaying tool call status UI for tool: ${toolCode.tool_name}`);
            ui.displayToolCallStatus(toolCode.tool_name, toolCode.arguments);
            ui.logMessage(`通过代理执行 MCP 工具: ${toolCode.tool_name} with args: ${JSON.stringify(toolCode.arguments)}`, 'system');
            console.log(`[${timestamp()}] [MCP] Tool call status UI displayed.`);
 
            // ✨ 修复：不再查找 mcp_server_url，直接发送到后端代理
            console.log(`[${timestamp()}] [MCP] Using unified backend proxy for tool: ${toolCode.tool_name}`);

            // --- Revert to Standard MCP Request Format for glm4v ---
            // We are no longer using Tavily's non-standard API.
            // We will now send the full, unmodified arguments object to the proxy.
            let parsedArguments;
            try {
                parsedArguments = this._robustJsonParse(toolCode.arguments);
            } catch (e) {
                const errorMsg = `无法解析来自模型的工具参数，即使在尝试修复后也是如此: ${toolCode.arguments}`;
                console.error(`[${timestamp()}] [MCP] ROBUST PARSE FAILED: ${errorMsg}`, e);
                throw new Error(errorMsg);
            }

            // ✨ 修复：构建简化的请求体，不再包含 server_url
            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                parameters: parsedArguments, // Send the full, parsed arguments object
                requestId: `tool_call_${Date.now()}`
            };
            console.log(`[${timestamp()}] [MCP] Constructed proxy request body:`, JSON.stringify(proxyRequestBody, null, 2));

            // 调用后端代理
            console.log(`[${timestamp()}] [MCP] Sending fetch request to /api/mcp-proxy...`);
            const proxyResponse = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proxyRequestBody)
            });
            console.log(`[${timestamp()}] [MCP] Fetch request to /api/mcp-proxy FINISHED. Response status: ${proxyResponse.status}`);

            if (!proxyResponse.ok) {
                const errorData = await proxyResponse.json();
                const errorMsg = `MCP 代理请求失败: ${errorData.details || proxyResponse.statusText}`;
                console.error(`[${timestamp()}] [MCP] ERROR: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            const toolRawResult = await proxyResponse.json();
            console.log(`[${timestamp()}] [MCP] Successfully parsed JSON from proxy response:`, toolRawResult);

            let toolResultContent; // Declare without initializing

            // Enhanced handling for python_sandbox output to detect and display images and download files
            if (toolCode.tool_name === 'python_sandbox') {
                console.log(`[${timestamp()}] [MCP] Processing python_sandbox output`);
                let isFileHandled = false;
                
                // 关键修复：处理MCP代理返回的嵌套结构
                let actualStdout = '';
                if (toolRawResult && toolRawResult.stdout && typeof toolRawResult.stdout === 'string') {
                    // 如果toolRawResult.stdout是字符串，直接使用
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && toolRawResult.type === 'text' && toolRawResult.stdout) {
                    // 如果toolRawResult是对象且包含stdout字段
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && typeof toolRawResult === 'string') {
                    // 如果toolRawResult本身就是字符串
                    actualStdout = toolRawResult.trim();
                }
                
                console.log(`[${timestamp()}] [MCP] Actual stdout content:`, actualStdout.substring(0, 200) + '...');
                
                if (actualStdout) {
                    // 尝试解析为JSON对象
                    try {
                        let fileData = JSON.parse(actualStdout);
                        console.log(`[${timestamp()}] [MCP] First level JSON parsed:`, fileData);
                        
                        // 关键修复：如果解析出来的是包装结构，提取实际的stdout内容
                        if (fileData && fileData.type === 'text' && fileData.stdout) {
                            console.log(`[${timestamp()}] [MCP] Detected wrapped structure, extracting stdout`);
                            actualStdout = fileData.stdout;
                            fileData = JSON.parse(actualStdout); // 重新解析实际的Python输出
                            console.log(`[${timestamp()}] [MCP] Second level JSON parsed:`, fileData);
                        }
                        
                        // 处理图片类型
                        if (fileData && fileData.type === 'image' && fileData.image_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected image file`);
                            const title = fileData.title || 'Generated Chart';
                            displayImageResult(fileData.image_base64, title, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
                            toolResultContent = { output: `Image "${title}" generated and displayed.` };
                            isFileHandled = true;
                        }
                        // 处理Office文档和PDF类型（标准格式）
                        else if (fileData && fileData.type && ['excel', 'word', 'ppt', 'pdf'].includes(fileData.type) && fileData.data_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected standard format office file:`, fileData.type);
                            const extensionMap = { 'word': 'docx', 'excel': 'xlsx', 'ppt': 'pptx', 'pdf': 'pdf' };
                            const fileExtension = extensionMap[fileData.type] || fileData.type;
                            const fileName = fileData.title ? `${fileData.title}.${fileExtension}` : `download.${fileExtension}`;
                            
                            // *** KEY FIX START ***
                            // 1. Create the persistent download link in its own, new message container.
                            this._createFileDownload(fileData.data_base64, fileName, fileData.type, ui);
                            // 2. 强制状态重置：明确设置当前消息容器为 null，确保后续文本响应创建新的容器。
                            this.state.currentAIMessageContentDiv = null;
                            // *** KEY FIX END ***
                            
                            toolResultContent = { output: `${fileData.type.toUpperCase()} file "${fileName}" generated and available for download.` };
                            isFileHandled = true;
                        }
                        // 处理自定义格式
                        else if (fileData && fileData.file && fileData.file.name && fileData.file.content) {
                            console.log(`[${timestamp()}] [MCP] Detected custom format file:`, fileData.file.name);
                            const { name, content } = fileData.file;
                            const fileExtension = name.split('.').pop().toLowerCase();
                            
                            const fileTypeMap = { 'docx': 'word', 'xlsx': 'excel', 'pptx': 'ppt', 'pdf': 'pdf' };
                            const fileType = fileTypeMap[fileExtension];

                            if (fileType) {
                                // 关键修复：创建独立下载链接并强制状态重置
                                this._createFileDownload(content, name, fileType, ui);
                                this.state.currentAIMessageContentDiv = null;

                                toolResultContent = { output: `${fileType.toUpperCase()} file "${name}" generated and available for download.` };
                                isFileHandled = true;
                            }
                        } else {
                            console.log(`[${timestamp()}] [MCP] JSON parsed but format not recognized:`, Object.keys(fileData));
                        }

                    } catch (e) {
                        console.log(`[${timestamp()}] [MCP] JSON parse failed:`, e.message);
                        console.log(`[${timestamp()}] [MCP] Raw content that failed to parse:`, actualStdout.substring(0, 200));
                    }

                    // 如果不是JSON格式，继续原有的图片检测逻辑
                    if (!isFileHandled) {
                        console.log(`[${timestamp()}] [MCP] Checking for image format`);
                        if (actualStdout.startsWith('iVBORw0KGgo') || actualStdout.startsWith('/9j/')) {
                            console.log(`[${timestamp()}] [MCP] Detected image format`);
                            displayImageResult(actualStdout, 'Generated Chart', `chart_${Date.now()}.png`);
                            toolResultContent = { output: 'Image generated and displayed.' };
                            isFileHandled = true;
                        } else if (actualStdout) {
                            console.log(`[${timestamp()}] [MCP] Treating as plain text output`);
                            toolResultContent = { output: actualStdout };
                        }
                    }
                 }
                 
                 console.log(`[${timestamp()}] [MCP] File handling completed, isFileHandled:`, isFileHandled);
                 
                 // 处理stderr
                 if (toolRawResult && toolRawResult.stderr) {
                     ui.logMessage(`Python Sandbox STDERR: ${toolRawResult.stderr}`, 'system');
                     if (toolResultContent && toolResultContent.output) {
                         toolResultContent.output += `\nError: ${toolRawResult.stderr}`;
                    } else {
                        toolResultContent = { output: `Error: ${toolRawResult.stderr}` };
                    }
                }
                
                if (!toolResultContent) {
                    toolResultContent = { output: "Tool executed successfully with no output." };
                }
            } else {
                // For ALL other tools, wrap the raw result consistently to ensure a predictable
                // structure for the transit worker.
                toolResultContent = { output: toolRawResult };
            }

            // --- Special handling for mcp_tool_catalog tool ---
            if (toolCode.tool_name === 'mcp_tool_catalog' && toolRawResult && toolRawResult.data && Array.isArray(toolRawResult.data)) {
                console.log(`[${timestamp()}] [MCP] Discovered new tools via mcp_tool_catalog. Merging...`);
                
                // 获取当前Qwen模型的完整工具列表
                const currentModelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);
                let allCurrentTools = currentModelConfig && currentModelConfig.tools ? [...currentModelConfig.tools] : [];

                // 过滤掉重复的工具，然后合并
                const newToolsToAdd = toolResult.data.filter(newTool =>
                    !allCurrentTools.some(existingTool => existingTool.function.name === newTool.function.name)
                );
                allCurrentTools = [...allCurrentTools, ...newToolsToAdd];
                
                // 更新 requestBody，确保下次 streamChatCompletion 包含最新工具列表
                requestBody.tools = allCurrentTools;
                console.log(`[${timestamp()}] [MCP] Updated requestBody.tools with ${newToolsToAdd.length} new tools.`);
            }

            // --- Refactored History Logging based on AliCloud Docs ---
            // 1. Push the assistant's decision to call the tool.
            // This must be an object with a `tool_calls` array.
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null, // Qwen expects content to be null when tool_calls are present
                tool_calls: [{
                    id: callId, // Generate a unique ID for the call
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: JSON.stringify(parsedArguments) // 使用 parsedArguments
                    }
                }]
            });

            // 2. Push the result from the tool execution.
            // This must be an object with `role: 'tool'`.
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' result message to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResultContent), // Use the possibly modified content
                tool_call_id: callId // 确保匹配 assistant message 中的 ID
            });

            // 再次调用模型以获得最终答案
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool result...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                // 确保再次传递工具定义，以防需要连续调用
                tools: requestBody.tools // Now 'requestBody.tools' might be updated with newly discovered tools
            }, apiKey, uiOverrides);
            console.log(`[${timestamp()}] [MCP] Chat completion stream finished.`);
 
        } catch (toolError) {
            console.error(`[${timestamp()}] [MCP] --- CATCH BLOCK ERROR ---`, toolError);
            Logger.error('MCP 工具执行失败:', toolError);
            ui.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            
            // 即使失败，也要将失败信息以正确的格式加入历史记录
            const callId = `call_${Date.now()}`; // 统一生成 ID
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history on error...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: callId, // 使用统一的 ID
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: toolCode.arguments // 保持原始字符串格式
                    }
                }]
            });
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' error result to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message }), // Use the possibly modified content
                tool_call_id: callId // 确保匹配 assistant message 中的 ID
            });
            
            // 再次调用模型，让它知道工具失败了
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool error...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides);
            console.log(`[${timestamp()}] [MCP] Chat completion stream after error finished.`);
        } finally {
            this.state.isUsingTool = false;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to false.`);
            console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall END ---`);
            // 保存工具调用的历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    /**
     * @private
     * @description Creates a self-contained, persistent message element for a file download link.
     * This function is purely for UI creation and does NOT modify the handler's state.
     * @param {string} base64Data - The base64 encoded file data
     * @param {string} fileName - The name of the file to download
     * @param {string} fileType - The type of file (excel, word, ppt, pdf)
     * @param {object} ui - The UI adapter (必须从调用者传递)
     */
    _createFileDownload(base64Data, fileName, fileType, ui) {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [FILE] Creating persistent download for ${fileType} file: ${fileName}`);
        
        try {
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const mimeTypes = {
                'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'word': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'ppt': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'pdf': 'application/pdf'
            };
            
            const mimeType = mimeTypes[fileType] || 'application/octet-stream';
            const blob = new Blob([bytes], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = fileName;
            downloadLink.textContent = `📥 Download ${fileType.toUpperCase()}: ${fileName}`;
            downloadLink.className = 'file-download-link';
            downloadLink.style.display = 'inline-block';
            downloadLink.style.margin = '10px 0';
            downloadLink.style.padding = '8px 12px';
            downloadLink.style.backgroundColor = '#f0f8ff';
            downloadLink.style.border = '1px solid #007acc';
            downloadLink.style.borderRadius = '4px';
            downloadLink.style.color = '#007acc';
            downloadLink.style.textDecoration = 'none';
            downloadLink.style.fontWeight = 'bold';

            // 关键修复：创建独立的消息容器，不依赖状态
            // 注意：这里不传递任何参数，让 UI 库创建标准消息容器
            const messageContainer = ui.createAIMessageElement();
            
            // 关键：确保这个新容器不会被设置为全局当前消息
            // 通过不将其赋值给 this.state.currentAIMessageContentDiv 来实现
            
            // 添加到新容器的内容区域
            if (messageContainer && messageContainer.markdownContainer) {
                const successMsg = document.createElement('p');
                successMsg.textContent = `✅ 文件 ${fileName} 已生成并可供下载。`;
                successMsg.style.fontWeight = 'bold';
                successMsg.style.margin = '5px 0';

                messageContainer.markdownContainer.appendChild(successMsg);
                messageContainer.markdownContainer.appendChild(downloadLink);
                messageContainer.markdownContainer.appendChild(document.createElement('br'));
                
                console.log(`[${timestamp()}] [FILE] Download link added to independent container for ${fileName}`);
            }
            
            downloadLink.addEventListener('click', () => {
                setTimeout(() => { URL.revokeObjectURL(url); }, 100);
            });
            
            console.log(`[${timestamp()}] [FILE] Download link created successfully in its own container for ${fileName}`);
            
            if (ui.scrollToBottom) {
                ui.scrollToBottom();
            }
            
        } catch (error) {
            console.error(`[${timestamp()}] [FILE] Error creating download link:`, error);
            const errorContainer = ui.createAIMessageElement();
            if (errorContainer && errorContainer.markdownContainer) {
                const errorElement = document.createElement('p');
                errorElement.textContent = `创建文件下载时出错 ${fileName}: ${error.message}`;
                errorElement.style.color = 'red';
                errorContainer.markdownContainer.appendChild(errorElement);
            }
        }
    }

    /**
     * @private
     * @description Attempts to parse a JSON string that may have minor syntax errors,
     * which can sometimes be output by language models.
     * @param {string} jsonString - The JSON string to parse.
     * @returns {object} The parsed JavaScript object.
     * @throws {Error} If the string cannot be parsed even after cleanup attempts.
     */
    _robustJsonParse(jsonString) {
        try {
            // First, try the standard parser.
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn("[MCP] Standard JSON.parse failed, attempting robust parsing...", e);
            let cleanedString = jsonString;

            // 1. Remove trailing commas from objects and arrays.
            cleanedString = cleanedString.replace(/,\s*([}\]])/g, '$1');

            // 2. Escape unescaped newlines and carriage returns within string literals, but not within JSON structure.
            // This is a common issue with LLM output that can break JSON.
            // This regex tries to target content inside string values, not keys or structural elements.
            // This is a heuristic and might not cover all cases, but should help with common code snippets.
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\n/g, '$1\\n');
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\r/g, '$1\\r');


            // 3. Fix issue where a quote is added after a number or boolean.
            // e.g., "max_results": 5" -> "max_results": 5
            cleanedString = cleanedString.replace(/:( *[0-9\.]+)\"/g, ':$1');
            cleanedString = cleanedString.replace(/:( *(?:true|false))\"/g, ':$1');

            try {
                // Retry parsing with the cleaned string.
                return JSON.parse(cleanedString);
            } catch (finalError) {
                console.error("[MCP] Robust JSON parsing failed after cleanup.", finalError);
                // Throw the original error for better context if the final one is not informative.
                throw finalError || e;
            }
        }
    }

    /**
     * ✨ [最终优化版] 独立的工具调用方法
     * @description 将所有工具调用统一发送到后端代理，由后端决定如何处理。
     * @param {string} toolName - 要调用的工具名称。
     * @param {object} parameters - 工具所需的参数。
     * @returns {Promise<object>} - 返回工具执行的结果。
     */
    async callTool(toolName, parameters) {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [ChatApiHandler] Forwarding tool call to backend proxy: ${toolName}`, parameters);
        
        try {
            // 核心：简单地将请求发送到通用的后端代理端点
            const response = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tool_name: toolName,
                    parameters: parameters || {},
                    requestId: `tool_call_${Date.now()}`
                    // ✨ 注意：不再需要发送任何 server_url
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`工具代理请求失败: ${errorData.details || errorData.error || response.statusText}`);
            }

            const result = await response.json();
            console.log(`[${timestamp()}] [ChatApiHandler] Received result from backend proxy:`, result);
            
            // 适配 Orchestrator 预期的返回格式
            return {
                success: result.success !== false,
                output: result.output || result.result || result.data || JSON.stringify(result),
                rawResult: result
            };

        } catch (error) {
            console.error(`[${timestamp()}] [ChatApiHandler] Error during tool proxy call for ${toolName}:`, error);
            // 向上抛出错误，让 Orchestrator 能够捕获并处理
            throw error; 
        }
    }
}