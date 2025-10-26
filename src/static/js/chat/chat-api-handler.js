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
        this.config = config;
    }

    /**
     * Processes an HTTP Server-Sent Events (SSE) stream from the chat completions API.
     * It handles text accumulation, UI updates, and tool calls.
     * @param {object} requestBody - The request body to be sent to the model.
     * @param {string} apiKey - The API key for authorization.
     * @returns {Promise<void>}
     */
    async streamChatCompletion(requestBody, apiKey, uiOverrides = null) {
        const ui = uiOverrides || chatUI;

        let currentMessages = requestBody.messages;
        const selectedModelName = requestBody.model;
        const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName);
        
        const isCurrentModelGeminiType = selectedModelName.includes('gemini');
        const isReasoningEnabledGlobally = localStorage.getItem('geminiEnableReasoning') === 'true';
        
        let enableReasoning;
        if (modelConfig && modelConfig.enableReasoning !== undefined) {
            enableReasoning = modelConfig.enableReasoning;
        } else {
            enableReasoning = isCurrentModelGeminiType && isReasoningEnabledGlobally;
        }
        
        const disableSearch = modelConfig ? modelConfig.disableSearch : false;
        const tools = requestBody.tools;

        try {
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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

            let qwenToolCallAssembler = null;

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
                                    qwenToolCallParts.forEach(toolCallChunk => {
                                        const func = toolCallChunk.function;
                                        if (func && func.name) {
                                            if (!qwenToolCallAssembler) {
                                                qwenToolCallAssembler = { tool_name: func.name, arguments: func.arguments || '' };
                                                Logger.info('Qwen MCP tool call started:', qwenToolCallAssembler);
                                                ui.logMessage(`模型请求 MCP 工具: ${qwenToolCallAssembler.tool_name}`, 'system');
                                                if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                            } else {
                                                qwenToolCallAssembler.arguments += func.arguments || '';
                                            }
                                        } else if (qwenToolCallAssembler && func && func.arguments) {
                                            qwenToolCallAssembler.arguments += func.arguments;
                                        }
                                    });
                                } else if (functionCallPart) {
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    ui.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                } else if (choice.delta && !functionCallDetected && !qwenToolCallAssembler) {
                                    if (choice.delta.reasoning_content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer) {
                                            if (!reasoningStarted) {
                                                this.state.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                                reasoningStarted = true;
                                            }
                                            const reasoningText = choice.delta.reasoning_content;
                                            
                                            if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string') {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer += reasoningText;
                                            } else {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer = reasoningText;
                                            }
                                            
                                            const reasoningContentEl = this.state.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content');
                                            if (reasoningContentEl) {
                                                reasoningContentEl.innerHTML += reasoningText.replace(/\n/g, '<br>');
                                            }
                                        }
                                    }
                                    
                                    if (choice.delta.content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer &&
                                            reasoningStarted && !answerStarted) {
                                            const separator = document.createElement('hr');
                                            separator.className = 'answer-separator';
                                            if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                                this.state.currentAIMessageContentDiv.markdownContainer.before(separator);
                                            }
                                            answerStarted = true;
                                        }

                                        if (typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string') {
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        } else {
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer = choice.delta.content || '';
                                        }

                                        if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                            this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(
                                                this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                                            );
                                        }
                                        
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

                console.log(`[${timestamp()}] [DISPATCH] Analyzing tool call for model: ${requestBody.model}`);
                
                // 🎯 修复：统一处理所有工具调用
                const mcpToolCall = currentFunctionCall.tool_name
                    ? currentFunctionCall
                    : { 
                        tool_name: currentFunctionCall.name, 
                        arguments: typeof currentFunctionCall.args === 'string' 
                            ? currentFunctionCall.args 
                            : JSON.stringify(currentFunctionCall.args || {})
                    };
                
                console.log(`[${timestamp()}] [DISPATCH] Unified tool call routing to _handleMcpToolCall...`);
                await this._handleMcpToolCall(mcpToolCall, requestBody, apiKey, uiOverrides);
                
                console.log(`[${timestamp()}] [DISPATCH] Returned from tool call handler.`);

            } else {
                if (this.state.currentAIMessageContentDiv &&
                    typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string' &&
                    this.state.currentAIMessageContentDiv.rawMarkdownBuffer.trim() !== '') {
                    
                    const historyEntry = {
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    };
                    
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
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
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
        let callId = `call_${Date.now()}`;
        console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall START ---`);

        try {
            this.state.isUsingTool = true;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to true.`);

            console.log(`[${timestamp()}] [MCP] Displaying tool call status UI for tool: ${toolCode.tool_name}`);
            ui.displayToolCallStatus(toolCode.tool_name, toolCode.arguments);
            ui.logMessage(`通过代理执行 MCP 工具: ${toolCode.tool_name} with args: ${JSON.stringify(toolCode.arguments)}`, 'system');
            console.log(`[${timestamp()}] [MCP] Tool call status UI displayed.`);

            // 🎯 修复：使用统一的 MCP 代理端点
            const server_url = "/api/mcp-proxy";
            console.log(`[${timestamp()}] [MCP] Using default MCP server URL: ${server_url}`);

            let parsedArguments;
            try {
                parsedArguments = this._robustJsonParse(toolCode.arguments);
            } catch (e) {
                const errorMsg = `无法解析来自模型的工具参数: ${toolCode.arguments}`;
                console.error(`[${timestamp()}] [MCP] ROBUST PARSE FAILED: ${errorMsg}`, e);
                throw new Error(errorMsg);
            }

            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                parameters: parsedArguments,
                requestId: `tool_call_${Date.now()}`
            };
            console.log(`[${timestamp()}] [MCP] Constructed proxy request body:`, JSON.stringify(proxyRequestBody, null, 2));

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

            let toolResultContent;

            if (toolCode.tool_name === 'python_sandbox') {
                console.log(`[${timestamp()}] [MCP] Processing python_sandbox output`);
                let isFileHandled = false;
                
                let actualStdout = '';
                if (toolRawResult && toolRawResult.stdout && typeof toolRawResult.stdout === 'string') {
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && toolRawResult.type === 'text' && toolRawResult.stdout) {
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && typeof toolRawResult === 'string') {
                    actualStdout = toolRawResult.trim();
                }
                
                console.log(`[${timestamp()}] [MCP] Actual stdout content:`, actualStdout.substring(0, 200) + '...');
                
                if (actualStdout) {
                    try {
                        let fileData = JSON.parse(actualStdout);
                        console.log(`[${timestamp()}] [MCP] First level JSON parsed:`, fileData);
                        
                        if (fileData && fileData.type === 'text' && fileData.stdout) {
                            console.log(`[${timestamp()}] [MCP] Detected wrapped structure, extracting stdout`);
                            actualStdout = fileData.stdout;
                            fileData = JSON.parse(actualStdout);
                            console.log(`[${timestamp()}] [MCP] Second level JSON parsed:`, fileData);
                        }
                        
                        if (fileData && fileData.type === 'image' && fileData.image_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected image file`);
                            const title = fileData.title || 'Generated Chart';
                            displayImageResult(fileData.image_base64, title, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
                            toolResultContent = { output: `Image "${title}" generated and displayed.` };
                            isFileHandled = true;
                        }
                        else if (fileData && fileData.type && ['excel', 'word', 'ppt', 'pdf'].includes(fileData.type) && fileData.data_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected standard format office file:`, fileData.type);
                            const extensionMap = { 'word': 'docx', 'excel': 'xlsx', 'ppt': 'pptx', 'pdf': 'pdf' };
                            const fileExtension = extensionMap[fileData.type] || fileData.type;
                            const fileName = fileData.title ? `${fileData.title}.${fileExtension}` : `download.${fileExtension}`;
                            
                            this._createFileDownload(fileData.data_base64, fileName, fileData.type, ui);
                            this.state.currentAIMessageContentDiv = null;
                            
                            toolResultContent = { output: `${fileData.type.toUpperCase()} file "${fileName}" generated and available for download.` };
                            isFileHandled = true;
                        }
                        else if (fileData && fileData.file && fileData.file.name && fileData.file.content) {
                            console.log(`[${timestamp()}] [MCP] Detected custom format file:`, fileData.file.name);
                            const { name, content } = fileData.file;
                            const fileExtension = name.split('.').pop().toLowerCase();
                            
                            const fileTypeMap = { 'docx': 'word', 'xlsx': 'excel', 'pptx': 'ppt', 'pdf': 'pdf' };
                            const fileType = fileTypeMap[fileExtension];

                            if (fileType) {
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
                toolResultContent = { output: toolRawResult };
            }

            if (toolCode.tool_name === 'mcp_tool_catalog' && toolRawResult && toolRawResult.data && Array.isArray(toolRawResult.data)) {
                console.log(`[${timestamp()}] [MCP] Discovered new tools via mcp_tool_catalog. Merging...`);
                
                const currentModelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);
                let allCurrentTools = currentModelConfig && currentModelConfig.tools ? [...currentModelConfig.tools] : [];

                const newToolsToAdd = toolResult.data.filter(newTool =>
                    !allCurrentTools.some(existingTool => existingTool.function.name === newTool.function.name)
                );
                allCurrentTools = [...allCurrentTools, ...newToolsToAdd];
                
                requestBody.tools = allCurrentTools;
                console.log(`[${timestamp()}] [MCP] Updated requestBody.tools with ${newToolsToAdd.length} new tools.`);
            }

            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: callId,
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: JSON.stringify(parsedArguments)
                    }
                }]
            });

            console.log(`[${timestamp()}] [MCP] Pushing 'tool' result message to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResultContent),
                tool_call_id: callId
            });

            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool result...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides);
            console.log(`[${timestamp()}] [MCP] Chat completion stream finished.`);
 
        } catch (toolError) {
            console.error(`[${timestamp()}] [MCP] --- CATCH BLOCK ERROR ---`, toolError);
            Logger.error('MCP 工具执行失败:', toolError);
            ui.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            
            const callId = `call_${Date.now()}`;
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history on error...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: callId,
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: toolCode.arguments
                    }
                }]
            });
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' error result to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message }),
                tool_call_id: callId
            });
            
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
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    /**
     * @private
     * @description Creates a self-contained, persistent message element for a file download link.
     * @param {string} base64Data - The base64 encoded file data
     * @param {string} fileName - The name of the file to download
     * @param {string} fileType - The type of file (excel, word, ppt, pdf)
     * @param {object} ui - The UI adapter
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

            const messageContainer = ui.createAIMessageElement();
            
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
     * @description Attempts to parse a JSON string that may have minor syntax errors.
     * @param {string} jsonString - The JSON string to parse.
     * @returns {object} The parsed JavaScript object.
     * @throws {Error} If the string cannot be parsed even after cleanup attempts.
     */
    _robustJsonParse(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn("[MCP] Standard JSON.parse failed, attempting robust parsing...", e);
            let cleanedString = jsonString;

            cleanedString = cleanedString.replace(/,\s*([}\]])/g, '$1');
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\n/g, '$1\\n');
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\r/g, '$1\\r');
            cleanedString = cleanedString.replace(/:( *[0-9\.]+)\"/g, ':$1');
            cleanedString = cleanedString.replace(/:( *(?:true|false))\"/g, ':$1');

            try {
                return JSON.parse(cleanedString);
            } catch (finalError) {
                console.error("[MCP] Robust JSON parsing failed after cleanup.", finalError);
                throw finalError || e;
            }
        }
    }

    /**
     * ✨ [新增] 独立的工具调用方法
     * @description 负责将工具调用请求发送到后端的 MCP 代理。
     * @param {string} toolName - 要调用的工具名称。
     * @param {object} parameters - 工具所需的参数。
     * @returns {Promise<object>} - 返回工具执行的结果。
     */
    async callTool(toolName, parameters) {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [ChatApiHandler] Calling tool via proxy: ${toolName}`, parameters);
        
        try {
            // 🎯 修复：直接使用统一的 MCP 代理端点
            const server_url = "/api/mcp-proxy";
            console.log(`[${timestamp()}] [ChatApiHandler] Using default MCP server URL: ${server_url}`);

            const response = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tool_name: toolName,
                    parameters: parameters || {},
                    requestId: `tool_call_${Date.now()}`
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`工具代理请求失败: ${errorData.details || errorData.error || response.statusText}`);
            }

            const result = await response.json();
            console.log(`[${timestamp()}] [ChatApiHandler] Tool call successful:`, result);
            
            return {
                success: result.success !== false,
                output: result.output || result.result || JSON.stringify(result),
                rawResult: result
            };

        } catch (error) {
            console.error(`[${timestamp()}] [ChatApiHandler] Error calling tool ${toolName}:`, error);
            return {
                success: false,
                error: error.message,
                output: `工具执行出错: ${error.message}`
            };
        }
    }
}