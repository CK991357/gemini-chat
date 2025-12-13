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
        const baseDelay = 3000; // 3秒基础延迟
        const maxDelay = 20000; // 20秒最大延迟
        let lastError;
    
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
    
                if (response.status === 429) {
                    // 指数退避 + 随机抖动
                    const exponentialBackoff = baseDelay * Math.pow(2, attempt);
                    const jitter = Math.random() * 1000; // 1秒随机抖动
                    const waitTime = Math.min(exponentialBackoff + jitter, maxDelay);
                    
                    console.warn(`[ChatApiHandler] API速率限制(429)。将在 ${Math.round(waitTime)}ms 后重试 (尝试 ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
    
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
                }
    
                return response;
    
            } catch (error) {
                lastError = error;
                console.warn(`[ChatApiHandler] API调用失败 (尝试 ${attempt + 1}/${maxRetries}):`, error.message);
                // 移除立即抛出逻辑，让循环自然结束
            }
        }
        // 🎯 修复：确保始终返回 Error 对象
        const finalError = lastError || new Error(`API调用在 ${maxRetries} 次重试后仍然失败`);
        console.error(`[ChatApiHandler] 所有重试均失败:`, finalError.message);
        throw finalError;
    }

    /**
     * 🎯 智能检测Agent请求
     */
    _isAgentRequest(requestBody) {
        // 基于消息内容特征来判断是否为Agent模式
        const agentKeywords = ['思考:', '研究计划:', '行动:', '行动输入:', '最终答案:'];
        
        // 检查最近的几条消息
        // 兼容性修复：requestBody.messages 可能不是数组（可能为对象或字符串），因此先进行类型判断并回退到 chatHistory
        let recentMessagesSource = [];
        if (Array.isArray(requestBody.messages)) {
            recentMessagesSource = requestBody.messages;
        } else if (Array.isArray(requestBody.chatHistory)) {
            recentMessagesSource = requestBody.chatHistory;
        } else if (requestBody.messages) {
            // 如果 messages 是单条消息对象或字符串，包装成数组以便处理
            recentMessagesSource = [requestBody.messages];
        }
        const recentMessages = recentMessagesSource.slice(-5);
        
        return recentMessages.some(msg => {
                const content = msg && msg.content ? msg.content : (typeof msg === 'string' ? msg : null);
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
     * 🎯 判断是否为 DeepSeek 模型
     */
    _isDeepSeekModel(modelName) {
        return modelName && (
            modelName === 'deepseek-chat' || 
            modelName === 'deepseek-reasoner' ||
            modelName.includes('deepseek') ||
            modelName.includes('DeepSeek')
        );
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
        
        // ================================================================
        // 🎯 新增：DeepSeek 模型特殊处理
        // ================================================================
        const isDeepSeekModel = this._isDeepSeekModel(selectedModelName);
        
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
            // ================================================================
            // 🎯 构建适用于 DeepSeek 的请求体
            // ================================================================
            let requestBodyToSend = { ...requestBody, tools };
            
            // 如果是 DeepSeek 模型，添加 thinking 参数（如果使用思考模式）
            if (isDeepSeekModel) {
                // 对于 DeepSeek，移除 Gemini 特有的参数
                delete requestBodyToSend.enableReasoning;
                delete requestBodyToSend.disableSearch;
                
                // 如果模型是 deepseek-reasoner，开启思考模式
                if (selectedModelName === 'deepseek-reasoner') {
                    requestBodyToSend.thinking = { type: "enabled" };
                }
            } else {
                // 非 DeepSeek 模型，保留原有的参数
                requestBodyToSend.enableReasoning = enableReasoning;
                requestBodyToSend.disableSearch = disableSearch;
            }
            
            // 🎯 注意：streamChatCompletion 保持原有的 fetch 逻辑，不在这里使用重试
            // 因为流式响应不适合重试机制
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                // 使用调整后的请求体
                body: JSON.stringify(requestBodyToSend)
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
                                    // ================================================================
                                    // 🎯 新增：DeepSeek 思考模式特殊处理
                                    // ================================================================
                                    if (isDeepSeekModel) {
                                        // DeepSeek 模型在 delta 中返回 reasoning_content
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
                const isDeepSeekModel = modelConfig && modelConfig.isDeepSeek; // 新增

                // 为 Qwen、Zhipu 和启用了工具的 Gemini 模型统一路由到 MCP 处理器
                if (isQwenModel || isZhipuModel || isGeminiToolModel|| isDeepSeekModel) {
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
                    // ================================================================
                    // 🎯 新增：DeepSeek 思考内容保存
                    // ================================================================
                    if (isDeepSeekModel && 
                        typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string' &&
                        this.state.currentAIMessageContentDiv.rawReasoningBuffer.trim() !== '') {
                        historyEntry.reasoning = this.state.currentAIMessageContentDiv.rawReasoningBuffer;
                    } else if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string' &&
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
        const isDeepSeekModel = this._isDeepSeekModel(requestBody.model);
        
        try {
            let response;
            
            if (isAgentMode) {
                // 🎯 Agent模式：使用带重试的专用方法
                console.log('[ChatApiHandler] Agent模式检测到，启用智能重试机制');
                
                // ================================================================
                // 🎯 新增：DeepSeek 模型特殊处理
                // ================================================================
                let requestBodyToSend = { ...requestBody, stream: false };
                
                if (isDeepSeekModel) {
                    // 对于 DeepSeek，移除 Gemini 特有的参数
                    delete requestBodyToSend.enableReasoning;
                    delete requestBodyToSend.disableSearch;
                    
                    // 如果模型是 deepseek-reasoner，开启思考模式
                    if (requestBody.model === 'deepseek-reasoner') {
                        requestBodyToSend.thinking = { type: "enabled" };
                    }
                }
                
                response = await this._fetchWithAgentRetry('/api/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(requestBodyToSend)
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
                    // ================================================================
                    // 🎯 新增：DeepSeek 思考内容处理
                    // ================================================================
                    if (isDeepSeekModel && json.choices[0].message.reasoning_content) {
                        // DeepSeek 返回的思考内容，可以用于后续处理
                        json.choices[0].message.reasoning = json.choices[0].message.reasoning_content;
                    }
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
            const toolStatusElement = ui.displayToolCallStatus(toolCode.tool_name, toolCode.arguments); // 🎯 捕获状态元素
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

            // 🎯 新增：Crawl4AI 普通模式参数修正逻辑
            if (toolCode.tool_name === 'crawl4ai' && parsedArguments.mode === 'extract') {
                console.log('[MCP] 检测到 crawl4ai extract 调用，执行参数修正...');
                
                // 兼容双重嵌套和单层嵌套
                const paramsTarget = parsedArguments.parameters || parsedArguments;

                if (paramsTarget.schema && paramsTarget.schema_definition === undefined) {
                    console.log('[MCP] 修正参数：将 "schema" 重命名为 "schema_definition"');
                    paramsTarget.schema_definition = paramsTarget.schema;
                    delete paramsTarget.schema;
                }
            }

            // ✨ 修复：构建简化的请求体，不再包含 server_url
            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                parameters: parsedArguments, // Send the full, parsed arguments object
                requestId: `tool_call_${Date.now()}`,
                // 🎯 核心修复：在这里明确地添加当前的 session_id
                session_id: this.state.currentSessionId
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

            // 🔥🔥🔥 [最终方案] 统一的文件处理逻辑 - 仅crawl4ai使用流式解析 🔥🔥🔥
            let toolRawResult = null;

            console.log(`[${timestamp()}] [MCP] Tool call: ${toolCode.tool_name}`);

            // 判断是否为crawl4ai工具，仅crawl4ai使用流式解析
            if (toolCode.tool_name === 'crawl4ai') {
                console.log(`[${timestamp()}] [MCP] Starting NDJSON stream parsing for crawl4ai...`);
                
                const reader = proxyResponse.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            console.log(`[${timestamp()}] [MCP] NDJSON stream finished.`);
                            break;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n');
                        buffer = parts.pop(); // 最后一个不完整的行保留在 buffer 中

                        for (const part of parts) {
                            if (!part.trim()) continue;

                            try {
                                const message = JSON.parse(part);
                                
                                if (message.type === 'heartbeat') {
                                    // 忽略心跳包，但记录日志
                                    console.log(`[${timestamp()}] [MCP] Heartbeat received.`);
                                } else if (message.type === 'status' || message.type === 'progress') {
                                    // 实时更新 UI 状态
                                    const statusText = message.message || message.status || 'Processing...';
                                    const progress = message.progress !== undefined ? message.progress : null;
                                    
                                    // 🎯 使用捕获到的 toolStatusElement 进行更新
                                    if (toolStatusElement && ui.updateToolCallProgress) {
                                        ui.updateToolCallProgress(toolStatusElement, statusText, progress);
                                    }
                                    console.log(`[${timestamp()}] [MCP] Status Update: ${statusText} (Progress: ${progress})`);

                                } else if (message.type === 'result') {
                                    // 最终结果
                                    toolRawResult = message.data;
                                    console.log(`[${timestamp()}] [MCP] Final result received.`);
                                    break; // 退出 for 循环
                                } else if (message.type === 'error') {
                                    // 错误处理
                                    const errorMsg = message.message || 'Unknown streaming error.';
                                    console.error(`[${timestamp()}] [MCP] Streaming Error: ${errorMsg}`);
                                    throw new Error(`工具执行失败 (流式错误): ${errorMsg}`);
                                }
                            } catch (e) {
                                console.error(`[${timestamp()}] [MCP] Error parsing stream part: ${part}`, e);
                                // 忽略单个解析错误，继续处理下一行
                            }
                        }

                        if (toolRawResult) break; // 退出 while 循环
                    }
                    
                    // 标记 UI 状态为完成（成功）
                    if (toolStatusElement && ui.markToolCallCompleted) {
                        ui.markToolCallCompleted(toolStatusElement, true);
                    }
                    
                } catch (streamError) {
                    console.error(`[${timestamp()}] [MCP] Stream processing error:`, streamError);
                    // 标记 UI 状态为完成（失败）
                    if (toolStatusElement && ui.markToolCallCompleted) {
                        ui.markToolCallCompleted(toolStatusElement, false);
                    }
                    throw streamError;
                }
                
            } else {
                // 非流式解析：其他所有工具
                console.log(`[${timestamp()}] [MCP] Using non-streaming parsing for ${toolCode.tool_name}...`);
                
                try {
                    // 读取完整的响应
                    const responseData = await proxyResponse.json();
                    toolRawResult = responseData;
                    
                    // 标记 UI 状态为完成（成功）
                    if (toolStatusElement && ui.markToolCallCompleted) {
                        ui.markToolCallCompleted(toolStatusElement, true);
                    }
                    
                    console.log(`[${timestamp()}] [MCP] Received non-streaming result from backend:`, toolRawResult);
                } catch (parseError) {
                    console.error(`[${timestamp()}] [MCP] Error parsing non-streaming response:`, parseError);
                    
                    // 尝试读取文本响应，可能是错误信息
                    try {
                        const errorText = await proxyResponse.text();
                        console.error(`[${timestamp()}] [MCP] Raw error response:`, errorText);
                        throw new Error(`工具执行失败 (非流式): ${errorText.substring(0, 200)}`);
                    } catch (textError) {
                        throw new Error(`工具执行失败 (非流式解析错误): ${parseError.message}`);
                    }
                }
            }

            if (!toolRawResult) {
                throw new Error("工具执行失败: 未接收到有效结果。");
            }

            console.log(`[${timestamp()}] [MCP] Received unified result from backend:`, toolRawResult);
            // 🔥🔥🔥 [最终方案] 逻辑结束 🔥🔥🔥

            let toolResultContent;

            // 1. 只处理 Python 沙盒的返回
            if (toolCode.tool_name === 'python_sandbox') {
                const stdout = toolRawResult.stdout || '';
                const stderr = toolRawResult.stderr || '';

                if (stderr.trim()) {
                    // 如果有错误，将整个后端返回作为输出，让前端适配器或 Agent 去分析
                    toolResultContent = { output: toolRawResult };
                    console.warn(`[MCP] Python Sandbox executed with error.`);
                } else {
                    // 如果没有错误，尝试将 stdout 解析为"智能包裹" (JSON)
                    try {
                        const outputData = JSON.parse(stdout.trim());
                        
                        // ================================================================
                        // 🚀 智能调度中心：根据 'type' 字段决定如何处理
                        // ================================================================

                        if (outputData.type === 'image' && outputData.image_base64) {
                            // --- 图片处理分支 ---
                            console.log(`[MCP] Dispatching to Image Renderer for title: "${outputData.title}"`);
                            
                            // 1. 构造浏览器可以识别的、完整的 Data URL
                            const dataUrl = `data:image/png;base64,${outputData.image_base64}`;
                            
                            // 2. 调用专门的图片显示函数
                            displayImageResult(dataUrl, outputData.title || 'Generated Image', `image_${Date.now()}.png`);
                            
                            // 3. 返回给模型的简洁确认信息
                            toolResultContent = { output: `Image "${outputData.title || 'image'}" generated and displayed.` };

                        } else if (['excel', 'word', 'powerpoint', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                            // --- 文档/文件处理分支 (您已有的、优秀的代码) ---
                            console.log(`[MCP] Dispatching to File Downloader for type: "${outputData.type}"`);
                            
                            // 1. 调用通用的文件下载函数
                            ui.createFileDownloadLink(outputData.data_base64, outputData.title || `download.${outputData.type}`, outputData.type);
                            
                            // 2. 移除当前AI消息框，因为文件下载链接在一个独立的消息框中
                            this.state.currentAIMessageContentDiv = null;

                            // 3. 返回给模型的简洁确认信息
                            toolResultContent = { output: `${outputData.type.toUpperCase()} file generated and ready for download.` };

                        } else {
                            // --- 其他 JSON 输出分支 ---
                            // 如果是 JSON 但不是我们约定的文件类型，则将其字符串化后输出
                            console.log('[MCP] Received a generic JSON object, outputting as string.');
                            toolResultContent = { output: stdout };
                        }
                    } catch (e) {
                        // --- 纯文本输出分支 (catch 块) ---
                        // 如果 stdout 无法被解析为 JSON，则直接作为纯文本输出
                        console.log('[MCP] stdout is not JSON, outputting as plain text.');
                        toolResultContent = { output: stdout };
                    }
                }
            } else {
                // 2. 其他所有工具的返回保持不变
                toolResultContent = { output: toolRawResult };
            }
            // 🔥🔥🔥 [最终方案] 逻辑结束 🔥🔥🔥

            // --- (保留 mcp_tool_catalog 的特殊处理逻辑) ---
            if (toolCode.tool_name === 'mcp_tool_catalog' && toolRawResult && toolRawResult.data && Array.isArray(toolRawResult.data)) {
                console.log(`[${timestamp()}] [MCP] Discovered new tools via mcp_tool_catalog. Merging...`);
                
                // 获取当前Qwen模型的完整工具列表
                const currentModelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);
                let allCurrentTools = currentModelConfig && currentModelConfig.tools ? [...currentModelConfig.tools] : [];

                // 过滤掉重复的工具，然后合并
                const newToolsToAdd = toolRawResult.data.filter(newTool =>
                    !allCurrentTools.some(existingTool => existingTool.function.name === newTool.function.name)
                );
                allCurrentTools = [...allCurrentTools, ...newToolsToAdd];
                
                // 更新 requestBody，确保下次 streamChatCompletion 包含最新工具列表
                requestBody.tools = allCurrentTools;
                console.log(`[${timestamp()}] [MCP] Updated requestBody.tools with ${newToolsToAdd.length} new tools.`);
            }

            // --- (保留历史记录日志的逻辑) ---
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: callId,
                    type: 'function',
                    function: { name: toolCode.tool_name, arguments: JSON.stringify(parsedArguments) }
                }]
            });
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResultContent),
                tool_call_id: callId
            });

            // --- (保留再次调用 streamChatCompletion 的逻辑) ---
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides);

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
                content: JSON.stringify({ error: toolError.message }),
                tool_call_id: callId
            });
            
            // 再次调用模型，让它知道工具失败了
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool error...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides);
            console.log(`[${timestamp()}] [MCP] Chat completion stream after error finished.`);
            
            // 标记 UI 状态为完成（失败）
            if (toolStatusElement && ui.markToolCallCompleted) {
                ui.markToolCallCompleted(toolStatusElement, false);
            }
            
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
        
        // 🔥 防御性修复：处理 Agent 模型可能产生的多层嵌套参数
        let finalParameters = parameters || {};
        
        // 检查是否为三层嵌套：{ mode: "...", parameters: { parameters: { ... } } }
        if (finalParameters.parameters && typeof finalParameters.parameters === 'object') {
            const innerParams = finalParameters.parameters;
            if (innerParams.parameters && typeof innerParams.parameters === 'object') {
                console.warn(`[${timestamp()}] [ChatApiHandler] ⚠️ 发现并修复 ${toolName} 的三层嵌套参数结构。`);
                // 合并中间层参数和最内层参数
                finalParameters = { ...finalParameters, ...innerParams.parameters };
                // 合并中间层其他参数（如 mode, url 等）
                for (const [key, value] of Object.entries(innerParams)) {
                    if (key !== 'parameters' && !(key in finalParameters)) {
                        finalParameters[key] = value;
                    }
                }
                delete finalParameters.parameters; // 删除顶层多余的 parameters 键
            }
        }
        
        console.log(`[${timestamp()}] [ChatApiHandler] Forwarding tool call to backend proxy: ${toolName}`, finalParameters);
        
        try {
            // 核心：简单地将请求发送到通用的后端代理端点
            const response = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tool_name: toolName,
                    parameters: finalParameters,
                    requestId: `tool_call_${Date.now()}`,
                    // 🎯 核心修复：为Agent的工具调用添加会话ID，使其能够读写文件
                    session_id: this.state.currentSessionId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`工具代理请求失败: ${errorData.details || errorData.error || response.statusText}`);
            }

            let result;
            if (toolName === 'crawl4ai') {
                // 🎯 针对 crawl4ai 长流程任务：使用健壮的 NDJSON 解析
                console.log(`[${timestamp()}] [ChatApiHandler] Using robust NDJSON parser for ${toolName}.`);
                const responseText = await response.text();
                const lines = responseText.trim().split('\n').filter(line => line.trim());

                let finalResult = null;
                for (const line of lines) {
                    try {
                        const message = JSON.parse(line);
                        if (message.type === 'result') {
                            finalResult = message.data;
                            break;
                        } else if (message.type === 'error') {
                            throw new Error(`工具执行失败 (流式错误): ${message.message || 'Unknown streaming error.'}`);
                        }
                    } catch (e) {
                        console.warn(`[${timestamp()}] [ChatApiHandler] Error parsing line in ${toolName} call:`, line, e);
                    }
                }

                if (!finalResult) {
                    throw new Error("工具执行失败: 未从流中接收到最终结果。");
                }
                result = finalResult;

            } else {
                // 🎯 其他所有工具：使用原始的 JSON 解析
                result = await response.json();
            }

            console.log(`[${timestamp()}] [ChatApiHandler] Received final result from backend proxy:`, result);
            
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