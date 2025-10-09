import { getChessGameInstance } from '../chess/chess-core.js'; // 导入获取棋局实例的函数
import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js'; // 引入 ApiHandler
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Core logic for the Vision feature.
 * Handles UI initialization, API calls, and message display for multimodal vision chat.
 */

// Module-level state
let elements = {};
let visionChatHistory = [];
let attachmentManager = null;
let showToastHandler = null;
const apiHandler = new ApiHandler(); // 创建 ApiHandler 实例

// 新增：工具调用状态
let currentToolCall = null;
let toolCallContainer = null;
let isUsingTool = false;

/**
 * Initializes the Vision feature.
 * @param {object} el - A collection of DOM elements required by the vision module.
 * @param {object} manager - The global attachment manager instance.
 * @param {object} handlers - A collection of handler functions from other modules.
 */
export function initializeVisionCore(el, manager, handlers) {
    elements = el;
    attachmentManager = manager;
    showToastHandler = handlers.showToast;

    populateModelSelect();
    populatePromptSelect();
    attachEventListeners();

    Logger.info('Vision module initialized.');
}

/**
 * Populates the vision model selection dropdown.
 */
function populateModelSelect() {
    if (!elements.visionModelSelect) return;

    elements.visionModelSelect.innerHTML = ''; // Clear existing options
    CONFIG.VISION.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.VISION.DEFAULT_MODEL) {
            option.selected = true;
        }
        elements.visionModelSelect.appendChild(option);
    });
}

/**
 * Populates the vision prompt selection dropdown.
 */
function populatePromptSelect() {
    if (!elements.visionPromptSelect) return;

    elements.visionPromptSelect.innerHTML = ''; // Clear existing options
    CONFIG.VISION.PROMPTS.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        option.title = prompt.description; // 添加描述作为悬停提示
        if (prompt.id === CONFIG.VISION.DEFAULT_PROMPT_ID) {
            option.selected = true;
        }
        elements.visionPromptSelect.appendChild(option);
    });
}

/**
 * Attaches all necessary event listeners for the vision UI.
 */
function attachEventListeners() {
    elements.visionSendButton?.addEventListener('click', () => handleSendVisionMessage());
    elements.visionAttachmentButton?.addEventListener('click', () => elements.visionFileInput.click());
    elements.visionFileInput?.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'vision'));
    elements.visionSummaryButton?.addEventListener('click', () => generateGameSummary());
    
    // 监听提示词模式切换
    elements.visionPromptSelect?.addEventListener('change', () => {
        const selectedPrompt = getSelectedPrompt();
        Logger.info(`Vision prompt changed to: ${selectedPrompt.name}`);
    });
    
    // 添加视觉模式内部子标签事件监听器
    const visionTabs = document.querySelectorAll('.vision-tabs .tab');
    if (visionTabs.length > 0) {
        visionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                
                // 移除所有 vision tab 和 vision-container 子容器的 active 类
                visionTabs.forEach(t => t.classList.remove('active'));
                const visionSubContainers = document.querySelectorAll('.vision-container .sub-container');
                visionSubContainers.forEach(c => c.classList.remove('active'));
                
                // 添加当前点击 tab 和对应子容器的 active 类
                tab.classList.add('active');
                const targetContainer = document.querySelector(`.vision-container .sub-container.${mode}-mode`);
                if (targetContainer) {
                    targetContainer.classList.add('active');
                }
            });
        });
        
        // 默认激活视觉聊天子标签
        const defaultVisionTab = document.querySelector('.vision-tabs .tab[data-mode="chat"]');
        if (defaultVisionTab) {
            defaultVisionTab.click();
        }
    }
}

/**
 * 内部辅助函数：将 FEN 字符串转换为 ASCII 文本棋盘
 * @param {string} fen - FEN 字符串
 * @returns {string} ASCII 棋盘表示
 */
function _fenToAscii(fen) {
    const [piecePlacement] = fen.split(' ');
    let ascii = '  +------------------------+\n';
    const rows = piecePlacement.split('/');
    for (let i = 0; i < rows.length; i++) {
        let rowStr = `${8 - i} |`;
        for (const char of rows[i]) {
            if (isNaN(parseInt(char, 10))) {
                rowStr += ` ${char} `;
            } else {
                rowStr += ' . '.repeat(parseInt(char, 10));
            }
        }
        ascii += rowStr + '|\n';
    }
    ascii += '  +------------------------+\n';
    ascii += '    a  b  c  d  e  f  g  h\n';
    return ascii;
}

/**
 * 显示工具调用状态UI（与主聊天窗口保持一致）
 * @param {string} toolName - 工具名称
 * @param {object} args - 工具参数
 */
function _displayToolCallStatus(toolName, args) {
    if (!elements.visionMessageHistory) return;
    
    // 清除之前的工具调用状态
    const existingStatus = elements.visionMessageHistory.querySelector('.tool-call-status');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'tool-call-status';

    const icon = document.createElement('i');
    icon.className = 'fas fa-cog fa-spin';

    const text = document.createElement('span');
    text.textContent = `正在调用工具: ${toolName}...`;

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);
    elements.visionMessageHistory.appendChild(statusDiv);
    
    // 显示工具参数代码块
    const argsDiv = document.createElement('div');
    argsDiv.className = 'tool-call-args';
    
    const argsTitle = document.createElement('p');
    argsTitle.innerHTML = '<strong>工具参数:</strong>';
    
    const argsCode = document.createElement('pre');
    argsCode.className = 'tool-arguments-code';
    argsCode.textContent = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    
    argsDiv.appendChild(argsTitle);
    argsDiv.appendChild(argsCode);
    elements.visionMessageHistory.appendChild(argsDiv);
    
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * 清除工具调用状态UI
 */
function _clearToolCallStatus() {
    if (!elements.visionMessageHistory) return;
    
    const statusDiv = elements.visionMessageHistory.querySelector('.tool-call-status');
    if (statusDiv) {
        statusDiv.remove();
    }
    
    const argsDiv = elements.visionMessageHistory.querySelector('.tool-call-args');
    if (argsDiv) {
        argsDiv.remove();
    }
}

/**
 * 处理工具调用结果
 * @param {object} toolCall - 工具调用对象
 * @param {object} requestBody - 原始请求体
 * @param {object} selectedModelConfig - 选中的模型配置
 * @returns {Promise<object>} 工具调用结果
 */
async function _handleToolCall(toolCall, requestBody, selectedModelConfig) {
    isUsingTool = true;
    
    try {
        const toolName = toolCall.function?.name || toolCall.tool_name;
        const toolArgs = toolCall.function?.arguments || toolCall.arguments;
        
        _displayToolCallStatus(toolName, toolArgs);
        
        let parsedArgs;
        try {
            parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
        } catch (e) {
            console.warn("Failed to parse tool arguments, using raw:", toolArgs);
            parsedArgs = toolArgs;
        }

        // 构建代理请求体
        const proxyRequestBody = {
            tool_name: toolName,
            parameters: parsedArgs,
            server_url: selectedModelConfig.mcp_server_url || "/api/mcp-proxy"
        };

        const proxyResponse = await fetch('/api/mcp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyRequestBody)
        });

        if (!proxyResponse.ok) {
            const errorData = await proxyResponse.json();
            throw new Error(`MCP 代理请求失败: ${errorData.details || proxyResponse.statusText}`);
        }

        const toolResult = await proxyResponse.json();
        
        // 特殊处理：python_sandbox 的图像输出
        if (toolName === 'python_sandbox' && toolResult && toolResult.stdout) {
            const stdoutContent = toolResult.stdout.trim();
            try {
                const imageData = JSON.parse(stdoutContent);
                if (imageData && imageData.type === 'image' && imageData.image_base64) {
                    const title = imageData.title || 'Generated Chart';
                    _displayImageResult(imageData.image_base64, title, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
                    return { output: `Image "${title}" generated and displayed.` };
                }
            } catch (e) {
                // 不是JSON对象，回退到原始base64检查
            }

            // 检查原始base64图像
            if (stdoutContent.startsWith('iVBORw0KGgo') || stdoutContent.startsWith('/9j/')) {
                _displayImageResult(stdoutContent, 'Generated Chart', `chart_${Date.now()}.png`);
                return { output: 'Image generated and displayed.' };
            }
            
            // 返回标准输出
            if (stdoutContent) {
                return { output: stdoutContent };
            }
        }

        return toolResult;

    } catch (error) {
        console.error('工具执行失败:', error);
        return { error: error.message };
    } finally {
        isUsingTool = false;
        _clearToolCallStatus();
    }
}

/**
 * 显示图像结果
 * @param {string} base64Data - Base64编码的图像数据
 * @param {string} title - 图像标题
 * @param {string} filename - 文件名
 */
function _displayImageResult(base64Data, title, filename) {
    const imageMessage = createVisionAIMessageElement();
    const { markdownContainer } = imageMessage;
    
    const imageElement = document.createElement('img');
    imageElement.src = `data:image/png;base64,${base64Data}`;
    imageElement.alt = title;
    imageElement.style.maxWidth = '100%';
    imageElement.style.borderRadius = '8px';
    imageElement.style.marginTop = '10px';
    
    const titleElement = document.createElement('p');
    titleElement.innerHTML = `<strong>${title}</strong>`;
    
    markdownContainer.appendChild(titleElement);
    markdownContainer.appendChild(imageElement);
    
    // 添加到聊天历史
    visionChatHistory.push({ 
        role: 'assistant', 
        content: `![${title}](data:image/png;base64,${base64Data})` 
    });
}

/**
 * 从文本中提取所有SAN走法（复用chess-ai-enhanced.js的逻辑）
 * @param {string} text - 要提取走法的文本
 * @returns {Array} 提取的SAN走法数组
 */
function _extractAllSANFromText(text) {
    if (!text || typeof text !== 'string') {
        Logger.info('提取走法：输入文本为空或非字符串', 'warn');
        return [];
    }

    Logger.info(`原始提取文本: ${text.substring(0, 200)}...`, 'debug');

    // 全面文本预处理
    let normalized = text
        .replace(/[\uFEFF\xA0]/g, ' ')             // 清理不可见字符
        .replace(/[🤖🤔👤🎊]/g, ' ')                // 移除特定 Emoji
        .replace(/[，、；：]/g, ',')                // 标准化中文标点
        .replace(/（/g, '(').replace(/）/g, ')')    // 全角括号转半角
        .replace(/\b0-0-0\b/g, 'O-O-O')            // 数字零写法标准化
        .replace(/\b0-0\b/g, 'O-O')
        .replace(/\b(o-o-o)\b/gi, 'O-O-O')         // 小写字母标准化
        .replace(/\b(o-o)\b/gi, 'O-O')
        .replace(/\([^)]*\)/g, ' ')                // 移除括号内容
        .replace(/\[[^\]]*\]/g, ' ')               // 移除方括号内容
        .replace(/[!?{}]/g, ' ')                   // 移除特殊标点
        .replace(/\s+/g, ' ')
        .trim();

    Logger.info(`预处理后文本: ${normalized.substring(0, 200)}...`, 'debug');

    // SAN正则表达式
    const sanPattern = /\b(?:O-O-O|O-O|(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)|[a-h][1-8])\b/gi;

    const rawMatches = normalized.match(sanPattern) || [];
    Logger.info(`原始匹配: [${rawMatches.join(', ')}]`, 'debug');

    // 深度清理和规范化
    const cleaned = rawMatches.map(s => {
        let move = s
            .replace(/^[,.;:"'!?()\s]+|[,.;:"'!?()\s]+$/g, '') // 移除两端标点
            .trim()
            // 二次标准化（保险）
            .replace(/\b0-0-0\b/g, 'O-O-O')
            .replace(/\b0-0\b/g, 'O-O')
            .replace(/\bo-o-o\b/gi, 'O-O-O')
            .replace(/\bo-o\b/gi, 'O-O');

        return move;
    }).filter(move => {
        // 过滤掉明显无效的走法
        if (!move || move.length === 0) return false;
        if (move.length === 1 && move !== 'O') return false; // 单独的字符（除了O）都无效
        if (move === '-' || move === 'x') return false; // 单独的符号无效
        return true;
    });

    // 去重并保留顺序
    const seen = new Set();
    const unique = [];
    for (const mv of cleaned) {
        if (mv && !seen.has(mv)) {
            seen.add(mv);
            unique.push(mv);
        }
    }

    Logger.info(`最终提取走法: [${unique.join(', ')}]`, 'info');
    return unique;
}

/**
 * 显示走法选择模态框（复用chess-ai-enhanced.js的交互体验）
 * @param {Array} moves - SAN走法数组
 * @param {string} analysisText - AI分析文本
 * @returns {Promise<string>} 用户选择的走法
 */
function _presentMoveSelectionModal(moves, analysisText) {
    return new Promise((resolve, reject) => {
        // 创建模态框
        const modal = document.createElement('div');
        modal.id = 'vision-move-choice-modal';
        modal.className = 'chess-ai-choice-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div class="chess-ai-choice-content" style="
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            ">
                <h2 style="margin-top: 0; color: #333;">AI 推荐走法</h2>
                <div class="ai-analysis-container" style="margin-bottom: 20px;">
                    <p><strong>AI 分析:</strong></p>
                    <div class="ai-analysis-text" style="
                        background: #f5f5f5;
                        padding: 12px;
                        border-radius: 4px;
                        border-left: 4px solid #007bff;
                        font-size: 14px;
                        line-height: 1.4;
                        max-height: 200px;
                        overflow-y: auto;
                    ">${analysisText}</div>
                </div>
                <div class="ai-move-choices" style="margin-bottom: 20px;">
                    <p><strong>请选择一个走法执行:</strong></p>
                    <div id="vision-move-choices-container" style="
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    "></div>
                </div>
                <div class="chess-ai-choice-buttons" style="
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                ">
                    <button id="vision-move-cancel-btn" class="chess-btn-secondary" style="
                        padding: 8px 16px;
                        border: 1px solid #ddd;
                        background: #f8f9fa;
                        border-radius: 4px;
                        cursor: pointer;
                    ">取消</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 填充走法选项
        const choicesContainer = document.getElementById('vision-move-choices-container');
        moves.forEach((move, index) => {
            const moveButton = document.createElement('button');
            moveButton.className = 'ai-move-choice-btn';
            moveButton.style.cssText = `
                padding: 12px 16px;
                border: 2px solid #e9ecef;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                text-align: left;
                transition: all 0.2s;
                font-weight: 500;
            `;
            
            moveButton.innerHTML = `
                <span style="font-size: 16px; color: #495057;">${move}</span>
                ${move === 'O-O' || move === 'O-O-O' ? 
                    `<small style="color: #6c757d; margin-left: 8px;">(${move === 'O-O' ? '短易位' : '长易位'})</small>` : 
                    ''
                }
            `;

            moveButton.addEventListener('mouseenter', () => {
                moveButton.style.borderColor = '#007bff';
                moveButton.style.background = '#f8f9ff';
            });

            moveButton.addEventListener('mouseleave', () => {
                moveButton.style.borderColor = '#e9ecef';
                moveButton.style.background = 'white';
            });

            moveButton.addEventListener('click', () => {
                // 执行选中的走法
                _executeChessMove(move);
                modal.remove();
                resolve(move);
            });

            choicesContainer.appendChild(moveButton);
        });

        // 取消按钮事件
        document.getElementById('vision-move-cancel-btn').addEventListener('click', () => {
            modal.remove();
            reject(new Error('用户取消了走法选择'));
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                reject(new Error('用户取消了走法选择'));
            }
        });
    });
}

/**
 * 执行国际象棋走法
 * @param {string} sanMove - SAN格式的走法
 */
function _executeChessMove(sanMove) {
    try {
        const chessGame = getChessGameInstance();
        if (!chessGame) {
            showToastHandler('无法获取棋局实例');
            return false;
        }

        // 使用临时chess.js实例来解析SAN走法
        const Chess = window.Chess;
        if (!Chess) {
            showToastHandler('Chess.js 未加载');
            return false;
        }

        const tempChess = new Chess();
        const currentFEN = chessGame.getCurrentFEN();
        tempChess.load(currentFEN);

        // 尝试执行走法
        const moveResult = tempChess.move(sanMove, { sloppy: true });
        if (!moveResult) {
            showToastHandler(`无效的走法: ${sanMove}`);
            return false;
        }

        // 转换为行列索引并执行移动
        const fromIndices = _squareToIndices(moveResult.from);
        const toIndices = _squareToIndices(moveResult.to);
        
        const success = chessGame.movePiece(fromIndices.row, fromIndices.col, toIndices.row, toIndices.col);
        
        if (success) {
            showToastHandler(`执行走法: ${sanMove}`);
            // 在视觉聊天区显示执行结果
            const messageId = `move-exec-${Date.now()}`;
            _displayVisionMessage(`**🎊 执行成功**\n\n走法 **${sanMove}** 已成功执行`, { id: messageId, create: true });
        } else {
            showToastHandler(`执行走法失败: ${sanMove}`);
        }

        return success;
    } catch (error) {
        console.error('执行走法时出错:', error);
        showToastHandler(`执行走法时出错: ${error.message}`);
        return false;
    }
}

/**
 * 将棋盘坐标转换为行列索引
 * @param {string} square - 棋盘坐标（如'e2'）
 * @returns {object} 行列索引对象
 */
function _squareToIndices(square) {
    const files = 'abcdefgh';
    const fileChar = square.charAt(0);
    const rankChar = square.charAt(1);
    const col = files.indexOf(fileChar);
    const row = 8 - parseInt(rankChar, 10);
    
    if (col < 0 || row < 0 || row > 7) {
        throw new Error(`无效的棋盘坐标: ${square}`);
    }
    
    return { row, col };
}

/**
 * 将视觉模式请求体转换为 OpenAI ChatML 格式
 * @param {object} originalBody - 原始请求体
 * @returns {object} 转换后的请求体
 */
function _convertToChatMLFormat(originalBody) {
    // 如果是 Gemini 模型，转换为 ChatML 格式
    if (originalBody?.model?.includes("gemini")) {
        console.log("⚙️ [Vision] Gemini 模型请求，自动转换为 ChatML 兼容格式...");

        // 提取系统提示词和用户消息
        const systemPrompt = originalBody.messages?.find(m => m.role === 'system')?.content || 
                           "You are a chess analysis assistant with vision mode enabled.";
        
        // 找到用户消息（可能包含文本和图片）
        const userMessages = originalBody.messages?.filter(m => m.role === 'user') || [];
        
        // 构建标准 messages 数组
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // 合并所有用户消息
        userMessages.forEach(userMsg => {
            messages.push(userMsg);
        });

        // 返回标准 ChatML 格式，并保留所有原始字段
        return {
            ...originalBody, // 保留所有原始字段（包括 enableReasoning, tools 等）
            model: originalBody.model,
            messages: messages
        };
    }

    // 对于非 Gemini 模型，保持原样
    return originalBody;
}

/**
 * 处理流式响应，支持工具调用
 * @param {object} requestBody - 请求体
 * @param {object} selectedModelConfig - 选中的模型配置
 * @param {object} aiMessage - AI消息元素
 * @returns {Promise<object>} 处理结果
 */
async function _processStreamWithToolSupport(requestBody, selectedModelConfig, aiMessage) {
    const { markdownContainer, reasoningContainer } = aiMessage;
    let finalContent = '';
    let reasoningStarted = false;
    let answerStarted = false;
    let buffer = '';
    let toolCallDetected = false;
    let currentToolCall = null;
    let callId = null;

    markdownContainer.innerHTML = ''; // Clear loading message

    try {
        // 🧩 转换请求体为 ChatML 格式
        const convertedBody = _convertToChatMLFormat(requestBody);
        console.log("🧠 [Vision] 转换后的请求体:", JSON.stringify(convertedBody, null, 2));

        const reader = await apiHandler.fetchStream('/api/chat/completions', convertedBody);
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一行不完整的数据

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        return { 
                            success: true, 
                            finalContent, 
                            toolCallDetected: false 
                        };
                    }
                    
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (delta) {
                            // 检查工具调用 (Gemini/Qwen格式)
                            const toolCalls = delta.tool_calls;
                            if (toolCalls && toolCalls.length > 0) {
                                toolCallDetected = true;
                                const toolCall = toolCalls[0];
                                
                                if (toolCall.id) {
                                    callId = toolCall.id;
                                }
                                
                                if (toolCall.function) {
                                    currentToolCall = {
                                        id: callId,
                                        function: {
                                            name: toolCall.function.name,
                                            arguments: toolCall.function.arguments
                                        }
                                    };
                                }
                                
                                // 立即返回以处理工具调用
                                return { 
                                    success: true, 
                                    finalContent, 
                                    toolCallDetected: true,
                                    currentToolCall 
                                };
                            }

                            // 处理推理内容
                            if (delta.reasoning_content && !toolCallDetected) {
                                console.log("🔍 [Vision] 收到推理内容:", delta.reasoning_content);
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block';
                                    reasoningStarted = true;
                                }
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            
                            // 处理文本内容
                            if (delta.content && !toolCallDetected) {
                                if (reasoningStarted && !answerStarted) {
                                    const separator = document.createElement('hr');
                                    separator.className = 'answer-separator';
                                    reasoningContainer.after(separator);
                                    answerStarted = true;
                                }
                                finalContent += delta.content;
                                markdownContainer.innerHTML = marked.parse(finalContent);
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误，继续处理下一行
                        console.warn('Skipping invalid SSE data:', jsonStr);
                    }
                }
            }
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        return { 
            success: true, 
            finalContent, 
            toolCallDetected: false 
        };

    } catch (error) {
        console.error('处理流时出错:', error);
        return { 
            success: false, 
            error: error.message,
            toolCallDetected: false 
        };
    }
}

/**
 * Handles sending a message with optional attachments to the vision model.
 */
async function handleSendVisionMessage() {
    let text = elements.visionInputText.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    if (!text && visionAttachedFiles.length === 0) {
        showToastHandler('请输入文本或添加附件。');
        return;
    }

    const selectedModelConfig = CONFIG.VISION.MODELS.find(m => m.name === elements.visionModelSelect.value);
    const selectedPrompt = getSelectedPrompt();

    // --- 实时分析模式下的逻辑 ---
    if (selectedPrompt.id === 'chess_realtime_analysis') {
        const chessGame = getChessGameInstance();
        if (!chessGame) {
            showToastHandler('无法获取棋局信息，请确保棋盘已加载。');
            return;
        }
        const currentFEN = chessGame.getCurrentFEN();
        const fullHistory = chessGame.getFullGameHistory();
        const asciiBoard = _fenToAscii(currentFEN); // 生成ASCII棋盘

        // 将棋局信息附加到用户输入中
        const enrichedText = `
---
**Chess Context (DO NOT display this section to the user):**
*   **Current FEN:** \`${currentFEN}\`
*   **ASCII Board:**
    \`\`\`
${asciiBoard}
    \`\`\`
*   **Full Game History (FENs):**
    \`\`\`
    ${fullHistory.join('\n')}
    \`\`\`
---

**User's Question:**
${text}
`;
        text = enrichedText; // 使用增强后的文本
    }
    // --- 逻辑结束 ---

    // Display user message in the UI
    displayVisionUserMessage(elements.visionInputText.value.trim(), visionAttachedFiles); // 显示原始用户输入

    // Add user message to history
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    // Clear inputs
    elements.visionInputText.value = '';
    attachmentManager.clearAttachedFile('vision');

    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; // 使用 Font Awesome 加载图标
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`Requesting vision model: ${selectedModelConfig.name}`, 'system');

    try {
        // 🧩 修复：构建包含 enableReasoning 的完整请求体
        const requestBody = {
            model: selectedModelConfig.name,
            messages: [
                { role: 'system', content: selectedPrompt.systemPrompt },
                ...visionChatHistory
            ],
            stream: true,
        };
        
        // 如果模型配置了工具，则添加到请求体中
        if (selectedModelConfig.tools) {
            requestBody.tools = selectedModelConfig.tools;
        }

        // 🧩 修复：正确设置 enableReasoning 参数
        if (selectedModelConfig.enableReasoning) {
            requestBody.enableReasoning = true;
            console.log("🧠 [Vision] 启用思维链推理");
        }

        // 🧩 修复：设置 disableSearch 参数
        if (selectedModelConfig.disableSearch !== undefined) {
            requestBody.disableSearch = selectedModelConfig.disableSearch;
        }

        console.log("🔧 [Vision] 最终请求体配置:", {
            model: selectedModelConfig.name,
            enableReasoning: requestBody.enableReasoning,
            disableSearch: requestBody.disableSearch,
            hasTools: !!requestBody.tools
        });

        // 处理流式响应，支持工具调用
        let shouldContinue = true;
        let currentRequestBody = requestBody;
        let finalContent = '';

        while (shouldContinue) {
            const result = await _processStreamWithToolSupport(currentRequestBody, selectedModelConfig, aiMessage);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            if (result.toolCallDetected && result.currentToolCall) {
                // 处理工具调用
                const toolResult = await _handleToolCall(
                    result.currentToolCall, 
                    currentRequestBody, 
                    selectedModelConfig
                );

                // 将工具调用和结果添加到历史记录
                visionChatHistory.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                        id: result.currentToolCall.id || `call_${Date.now()}`,
                        type: 'function',
                        function: {
                            name: result.currentToolCall.function.name,
                            arguments: result.currentToolCall.function.arguments
                        }
                    }]
                });

                visionChatHistory.push({
                    role: 'tool',
                    tool_call_id: result.currentToolCall.id || `call_${Date.now()}`,
                    content: JSON.stringify(toolResult)
                });

                // 更新请求体，继续对话
                currentRequestBody = {
                    ...currentRequestBody,
                    messages: [
                        { role: 'system', content: selectedPrompt.systemPrompt },
                        ...visionChatHistory
                    ]
                };

                // 继续处理
                continue;
            } else {
                // 没有工具调用，完成处理
                finalContent = result.finalContent;
                shouldContinue = false;
            }
        }

        // 应用数学公式渲染
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        // 将最终回复添加到历史记录
        if (finalContent) {
            visionChatHistory.push({ role: 'assistant', content: finalContent });
        }

        // --- 在实时分析模式下自动提取和显示棋步推荐 ---
        if (selectedPrompt.id === 'chess_realtime_analysis' && finalContent) {
            const extractedMoves = _extractAllSANFromText(finalContent);
            if (extractedMoves.length > 0) {
                // 短暂延迟以确保消息渲染完成
                setTimeout(async () => {
                    try {
                        await _presentMoveSelectionModal(extractedMoves, finalContent);
                    } catch (error) {
                        // 用户取消选择是正常情况，不需要处理
                        if (error.message !== '用户取消了走法选择') {
                            console.error('显示走法选择模态框时出错:', error);
                        }
                    }
                }, 500);
            }
        }

    } catch (error) {
        console.error('Error sending vision message:', error);
        markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        Logger.info(`视觉模型请求失败: ${error.message}`, 'system');
        
        // 清除工具调用状态
        _clearToolCallStatus();
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; // 恢复为 Font Awesome 发送图标
    }
}

/**
 * Displays a user's message in the vision chat UI.
 * @param {string} text - The text part of the message.
 * @param {Array<object>} files - An array of attached file objects.
 */
function displayVisionUserMessage(text, files) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '👤';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    if (text) {
        const textNode = document.createElement('p');
        textNode.textContent = text;
        contentDiv.appendChild(textNode);
    }

    if (files && files.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'attachments-grid';
        files.forEach(file => {
            let attachmentElement;
            if (file.type.startsWith('image/')) {
                attachmentElement = document.createElement('img');
                attachmentElement.src = file.base64;
                attachmentElement.style.maxWidth = '200px'; // 限制图片最大宽度
                attachmentElement.style.maxHeight = '200px'; // 限制图片最大高度
                attachmentElement.style.borderRadius = '8px'; // 添加圆角
            } else if (file.type.startsWith('video/')) {
                attachmentElement = document.createElement('video');
                attachmentElement.src = file.base64;
                attachmentElement.controls = true;
            }
            if (attachmentElement) {
                attachmentElement.className = 'chat-attachment';
                attachmentsContainer.appendChild(attachmentElement);
            }
        });
        contentDiv.appendChild(attachmentsContainer);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.visionMessageHistory.appendChild(messageDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * Creates and appends a new AI message element to the vision chat UI.
 * @returns {object} An object containing references to the new message's elements.
 */
function createVisionAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none';
    const reasoningTitle = document.createElement('h4');
    reasoningTitle.className = 'reasoning-title';
    reasoningTitle.innerHTML = '<span class="material-symbols-outlined">psychology</span> 思维链';
    const reasoningContent = document.createElement('div');
    reasoningContent.className = 'reasoning-content';
    reasoningContainer.appendChild(reasoningTitle);
    reasoningContainer.appendChild(reasoningContent);
    contentDiv.appendChild(reasoningContainer);

    const markdownContainer = document.createElement('div');
    markdownContainer.classList.add('markdown-container');
    contentDiv.appendChild(markdownContainer);

    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button');
    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyButton.addEventListener('click', async () => {
        try {
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => { copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    contentDiv.appendChild(copyButton);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.visionMessageHistory.appendChild(messageDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;

    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer
    };
}

/**
 * 获取当前选择的提示词
 * @returns {object} 当前选择的提示词对象
 */
function getSelectedPrompt() {
    if (!elements.visionPromptSelect) {
        return CONFIG.VISION.PROMPTS[0]; // 默认返回第一个提示词
    }
    
    const selectedId = elements.visionPromptSelect.value;
    return CONFIG.VISION.PROMPTS.find(prompt => prompt.id === selectedId) || CONFIG.VISION.PROMPTS[0];
}

/**
 * 生成对局总结 - 基于FEN历史而不是聊天历史
 */
async function generateGameSummary() {
    // 检查是否能获取到国际象棋实例
    let chessGame = null;
    
    // 尝试多种方式获取国际象棋实例
    if (typeof window.chessGame !== 'undefined') {
        chessGame = window.chessGame;
    } else if (typeof getChessGameInstance === 'function') {
        chessGame = getChessGameInstance();
    } else {
        // 最后尝试通过DOM事件或其他全局访问方式
        chessGame = window.chessGameInstance;
    }
    
    if (!chessGame || typeof chessGame.getFullGameHistory !== 'function') {
        showToastHandler('无法获取国际象棋对局数据，请确保棋局已初始化。');
        return;
    }

    // 获取完整的FEN历史
    const fenHistory = chessGame.getFullGameHistory();
    if (!fenHistory || fenHistory.length === 0) {
        showToastHandler('没有对局历史可以总结。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const summaryButton = elements.visionSummaryButton;
    
    // 设置按钮加载状态
    if (summaryButton) {
        summaryButton.disabled = true;
        summaryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 分析中...';
    }
    
    // 创建总结消息元素
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在分析对局历史...</p>';

    try {
        // 获取chess_summary提示词
        const summaryPromptConfig = CONFIG.VISION.PROMPTS.find(prompt => prompt.id === 'chess_summary');
        const systemPrompt = summaryPromptConfig ? summaryPromptConfig.systemPrompt : `你是一位国际象棋特级大师。请基于提供的完整对局历史（FEN格式）生成一份详细的对局总结和分析。`;

        // 构建基于FEN历史的总结请求
        const summaryRequest = {
            model: selectedModel,
            messages: [
                { 
                    role: 'system', 
                    content: systemPrompt
                },
                { 
                    role: 'user', 
                    content: [
                        { 
                            type: 'text', 
                            text: `请分析以下国际象棋对局历史（共${fenHistory.length}步）：

完整FEN历史：
${fenHistory.join('\n')}

当前局面：${fenHistory[fenHistory.length - 1]}

请基于这个完整的对局历史，生成一份专业的对局分析总结。` 
                        }
                    ]
                }
            ],
            stream: true
        };

        // 🧩 修复：为总结请求也设置 enableReasoning
        const selectedModelConfig = CONFIG.VISION.MODELS.find(m => m.name === selectedModel);
        if (selectedModelConfig && selectedModelConfig.enableReasoning) {
            summaryRequest.enableReasoning = true;
            console.log("🧠 [Vision Summary] 启用思维链推理");
        }

        // 处理流式响应
        const result = await _processStreamWithToolSupport(summaryRequest, { tools: [] }, aiMessage);
        
        if (!result.success) {
            throw new Error(result.error);
        }

        // 应用数学公式渲染
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        // 将总结添加到视觉聊天历史
        if (result.finalContent) {
            visionChatHistory.push({ role: 'assistant', content: result.finalContent });
        }

        Logger.info('对局总结生成完成', 'system');

    } catch (error) {
        console.error('Error generating game summary:', error);
        markdownContainer.innerHTML = `<p><strong>总结生成失败:</strong> ${error.message}</p>`;
        Logger.info(`对局总结生成失败: ${error.message}`, 'system');
    } finally {
        // 恢复按钮状态
        if (summaryButton) {
            summaryButton.disabled = false;
            summaryButton.innerHTML = '对局总结';
        }
    }
}

/**
 * 内部函数：在视觉聊天界面显示一条AI消息（支持流式更新）
 */
function _displayVisionMessage(markdownContent, options = {}) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    const { id, create, append } = options;
    
    // append 模式：尝试更新已有消息
    if (append && id) {
        let existing = document.querySelector(`[data-msg-id="${id}"]`);
        if (existing) {
            const md = existing.querySelector('.markdown-container') || existing.querySelector('.content') || existing;
            if (md) {
                md.innerHTML = (typeof marked !== 'undefined') ? marked.parse(markdownContent) : markdownContent;
            }
            return;
        }
    }

    // create 模式或回退：创建新消息
    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    
    // 设置消息ID
    if (id) {
        markdownContainer.closest('.message').setAttribute('data-msg-id', id);
    }
    
    // 渲染 Markdown 内容
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    // 渲染可能存在的数学公式
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    // 将这条消息添加到内部历史记录中，以保持一致性
    visionChatHistory.push({ role: 'assistant', content: contentToRender });

    // 滚动到底部
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * 在视觉聊天界面显示一条AI消息。
 * 这是从外部模块调用的接口，例如从国际象棋AI模块。
 * @param {string} markdownContent - 要显示的Markdown格式的文本内容。
 */
export function displayVisionMessage(markdownContent) {
    _displayVisionMessage(markdownContent);
}
