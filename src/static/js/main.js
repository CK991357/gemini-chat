import { AudioRecorder } from './audio/audio-recorder.js';
import { CONFIG } from './config/config.js';
import { ToolManager } from './tools/tool-manager.js';
import { Logger } from './utils/logger.js';

/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI and HTTP interactions.
 */

const UNIVERSAL_TRANSLATION_SYSTEM_PROMPT = `You are a professional translation assistant. Strictly adhere to the following: only output the translated text. Do not include any additional prefixes, explanations, or introductory phrases, such as "Okay, here is the translation:" ,"Sure, I can help you with that!"or "Here is your requested translation:" and so on.

## Translation Requirements

1. !!!Important!Strictly adhere to the following: only output the translated text. Do not include any other words which are no related to the translation,such as polite expressions, additional prefixes, explanations, or introductory phrases.
2. Word Choice: Do not translate word-for-word rigidly. Instead, use idiomatic expressions and common phrases in the target language (e.g., idioms, internet slang).
3. Sentence Structure: Do not aim for sentence-by-sentence translation. Adjust sentence length and word order to better suit the expression habits of the target language.
4. Punctuation Usage: Use punctuation marks accurately (including adding and modifying) according to different expression habits.
5. Format Preservation: Only translate the text content from the original. Content that cannot be translated should remain as is. Do not add extra formatting to the translated content.
`;

// DOM Elements
const logsContainer = document.getElementById('logs-container');
const toolManager = new ToolManager();
const messageHistory = document.getElementById('message-history');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectButton = document.getElementById('connect-button');
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const fpsInput = document.getElementById('fps-input');
const configToggle = document.getElementById('toggle-config');
const configContainer = document.querySelector('.control-panel');
const systemInstructionInput = document.getElementById('system-instruction');
systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT;
const applyConfigButton = document.getElementById('apply-config');
const mobileConnectButton = document.getElementById('mobile-connect');
const newChatButton = document.getElementById('new-chat-button');

const themeToggleBtn = document.getElementById('theme-toggle');
const toggleLogBtn = document.getElementById('toggle-log');
const clearLogsBtn = document.getElementById('clear-logs');
const modeTabs = document.querySelectorAll('.mode-tabs .tab');
const chatContainers = document.querySelectorAll('.chat-container');

// 翻译模式相关 DOM 元素
const translationInputTextarea = document.getElementById('translation-input-text');
// 聊天模式语音输入按钮
const chatVoiceInputButton = document.getElementById('chat-voice-input-button');


// Load saved values from localStorage
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedFPS = localStorage.getItem('video_fps');
const savedSystemInstruction = localStorage.getItem('system_instruction');

if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
}
if (savedVoice) {
    voiceSelect.value = savedVoice;
}
if (savedFPS) {
    fpsInput.value = savedFPS;
}
if (savedSystemInstruction) {
    systemInstructionInput.value = savedSystemInstruction;
    CONFIG.SYSTEM_INSTRUCTION.TEXT = savedSystemInstruction;
} else {
    systemInstructionInput.value = UNIVERSAL_TRANSLATION_SYSTEM_PROMPT;
    CONFIG.SYSTEM_INSTRUCTION.TEXT = UNIVERSAL_TRANSLATION_SYSTEM_PROMPT;
}

document.addEventListener('DOMContentLoaded', () => {
    marked.setOptions({
      breaks: true,
      highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
      langPrefix: 'hljs language-'
    });

    hljs.configure({
      ignoreUnescapedHTML: true,
      throwUnescapedHTML: false
    });

    const modelSelect = document.getElementById('model-select');
    modelSelect.innerHTML = '';
    CONFIG.API.AVAILABLE_MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.API.MODEL_NAME) {
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });

    const body = document.body;
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
        body.classList.add(savedTheme);
        themeToggleBtn.textContent = savedTheme === 'dark-mode' ? 'dark_mode' : 'light_mode';
    } else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            body.classList.add('dark-mode');
            themeToggleBtn.textContent = 'dark_mode';
        } else {
            body.classList.add('light-mode');
            themeToggleBtn.textContent = 'light_mode';
        }
    }

    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeToggleBtn.textContent = 'light_mode';
            localStorage.setItem('theme', 'light-mode');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeToggleBtn.textContent = 'dark_mode';
            localStorage.setItem('theme', 'dark-mode');
        }
    });

    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            modeTabs.forEach(t => t.classList.remove('active'));
            chatContainers.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.chat-container.${mode}-mode`).classList.add('active');
        });
    });

    document.querySelector('.tab[data-mode="text"]').click();

    toggleLogBtn.addEventListener('click', () => {
        document.querySelector('.tab[data-mode="log"]').click();
    });

    clearLogsBtn.addEventListener('click', () => {
        logsContainer.innerHTML = '';
        logMessage('日志已清空', 'system');
    });

    configToggle.addEventListener('click', () => {
        configContainer.classList.toggle('active');
        configToggle.classList.toggle('active');
        if (window.innerWidth <= 1200) {
            document.body.style.overflow = configContainer.classList.contains('active') ? 'hidden' : '';
        }
    });

    applyConfigButton.addEventListener('click', () => {
        configContainer.classList.remove('active');
        configToggle.classList.remove('active');
        if (window.innerWidth <= 1200) {
            document.body.style.overflow = '';
        }
    });

    newChatButton.addEventListener('click', () => {
        chatHistory = [];
        currentSessionId = null;
        messageHistory.innerHTML = '';
        logMessage('新聊天已开始', 'system');
    });

    if (messageHistory) {
        messageHistory.addEventListener('wheel', () => {
            isUserScrolling = true;
        }, { passive: true });

        messageHistory.addEventListener('scroll', () => {
            if (messageHistory.scrollHeight - messageHistory.clientHeight <= messageHistory.scrollTop + 1) {
                isUserScrolling = false;
            }
        });
    }
    
    initTranslation();
    initChatVoiceInput();
});

// State variables
let isConnected = false;
let isUsingTool = false;
let isUserScrolling = false;
let chatHistory = [];
let currentSessionId = null;
let selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);

// Speech-to-text state
let isChatRecording = false;
let hasRequestedChatMicPermission = false;
let chatAudioRecorder = null;
let chatAudioChunks = [];
let chatRecordingTimeout = null;
let chatInitialTouchY = 0;

/**
 * Converts PCM data to a WAV Blob.
 * @param {Uint8Array[]} pcmDataBuffers - Array of Uint8Arrays containing PCM data.
 * @param {number} sampleRate - The sample rate.
 * @returns {Blob} A Blob in WAV format.
 */
function pcmToWavBlob(pcmDataBuffers, sampleRate = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE) {
    let dataLength = 0;
    for (const buffer of pcmDataBuffers) {
        dataLength += buffer.length;
    }

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (const pcmBuffer of pcmDataBuffers) {
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setUint8(offset + i, pcmBuffer[i]);
        }
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * Helper function to write a string to a DataView.
 * @param {DataView} view - The DataView instance.
 * @param {number} offset - The offset to write to.
 * @param {string} string - The string to write.
 */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}


/**
 * Logs a message to the UI.
 * @param {string} message - The message to log.
 * @param {string} [type='system'] - The type of the message (system, user, ai).
 */
function logMessage(message, type = 'system') {
    const rawLogEntry = document.createElement('div');
    rawLogEntry.classList.add('log-entry', type);
    rawLogEntry.innerHTML = `
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="emoji">${type === 'system' ? '⚙️' : (type === 'user' ? '🫵' : '🤖')}</span>
        <span>${message}</span>
    `;
    logsContainer.appendChild(rawLogEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    if (type === 'user' || type === 'ai') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.textContent = type === 'user' ? '👤' : '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        
        contentDiv.innerHTML = marked.parse(message);
        
        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-button', 'material-symbols-outlined');
        copyButton.textContent = 'content_copy';
        copyButton.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(message);
            copyButton.textContent = 'check';
            setTimeout(() => {
              copyButton.textContent = 'content_copy';
            }, 2000);
          } catch (err) {
            console.error('复制失败:', err);
          }
        });
        
        contentDiv.appendChild(copyButton);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        messageHistory.appendChild(messageDiv);
        
        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise([contentDiv]).catch((err) => console.error('MathJax typesetting failed:', err));
        }
        
        scrollToBottom();
    }
}

/**
 * Scrolls the message history to the bottom.
 */
function scrollToBottom() {
    if (!messageHistory) return;
    requestAnimationFrame(() => {
        if (!isUserScrolling) {
            messageHistory.scrollTop = messageHistory.scrollHeight;
        }
    });
}

/**
 * Handles sending a text message via HTTP.
 */
async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    logMessage(message, 'user');
    messageInput.value = '';
    currentAIMessageContentDiv = null;

    try {
        const apiKey = apiKeyInput.value;
        const modelName = selectedModelConfig.name;
        const systemInstruction = systemInstructionInput.value;

        if (!currentSessionId) {
            currentSessionId = generateUniqueSessionId();
            logMessage(`新会话开始，ID: ${currentSessionId}`, 'system');
        }
        chatHistory.push({
            role: 'user',
            content: [{ type: 'text', text: message }]
        });

        let initialRequestBody = {
            model: modelName,
            messages: chatHistory,
            generationConfig: {
                responseModalities: ['text']
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
            ],
            enableGoogleSearch: true,
            stream: true,
            sessionId: currentSessionId
        };

        if (systemInstruction) {
            initialRequestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        await processHttpStream(initialRequestBody, apiKey);

    } catch (error) {
        Logger.error('发送 HTTP 消息失败:', error);
        logMessage(`发送消息失败: ${error.message}`, 'system');
    }
}

let currentAIMessageContentDiv = null;

function createAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    const markdownContainer = document.createElement('div');
    markdownContainer.classList.add('markdown-container');
    contentDiv.appendChild(markdownContainer);
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button', 'material-symbols-outlined');
    copyButton.textContent = 'content_copy';
    copyButton.addEventListener('click', async () => {
        const textToCopy = markdownContainer.textContent;
        try {
            await navigator.clipboard.writeText(textToCopy);
            copyButton.textContent = 'check';
            setTimeout(() => {
                copyButton.textContent = 'content_copy';
            }, 2000);
            logMessage('文本已复制到剪贴板', 'system');
        } catch (err) {
            logMessage('复制失败: ' + err, 'system');
            console.error('复制文本失败:', err);
        }
    });
    contentDiv.appendChild(copyButton);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    scrollToBottom();
    return {
        container: messageDiv,
        markdownContainer,
        contentDiv,
        rawMarkdownBuffer: ''
    };
}

/**
 * Processes an HTTP SSE stream, including text accumulation and tool calls.
 * @param {Object} requestBody - The request body to send to the model.
 * @param {string} apiKey - The API Key.
 */
async function processHttpStream(requestBody, apiKey) {
    let currentMessages = requestBody.messages;

    try {
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP API 请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let functionCallDetected = false;
        let currentFunctionCall = null;

        const isToolResponseFollowUp = currentMessages.some(msg => msg.role === 'tool');
        if (!isToolResponseFollowUp) {
            currentAIMessageContentDiv = createAIMessageElement();
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                Logger.info('HTTP Stream finished.');
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n\n').forEach(part => {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.choices && data.choices.length > 0) {
                            const choice = data.choices[0];
                            if (choice.delta) {
                                const functionCallPart = choice.delta.parts?.find(p => p.functionCall);
                                if (functionCallPart) {
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (currentAIMessageContentDiv) {
                                        currentAIMessageContentDiv = null;
                                    }
                                } else if (choice.delta.content) {
                                    if (!functionCallDetected) {
                                        if (!currentAIMessageContentDiv) {
                                            currentAIMessageContentDiv = createAIMessageElement();
                                        }
                                        currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(currentAIMessageContentDiv.rawMarkdownBuffer);
                                        if (typeof MathJax !== 'undefined') {
                                            MathJax.typesetPromise([currentAIMessageContentDiv.markdownContainer]).catch((err) => console.error('MathJax typesetting failed:', err));
                                        }
                                        scrollToBottom();
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        Logger.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
            });
        }

        if (functionCallDetected && currentFunctionCall) {
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                chatHistory.push({
                    role: 'assistant',
                    content: [{ type: 'text', text: currentAIMessageContentDiv.rawMarkdownBuffer }]
                });
            }
            currentAIMessageContentDiv = null;

            try {
                isUsingTool = true;
                logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                const toolResult = await toolManager.handleToolCall(currentFunctionCall);
                const toolResponsePart = toolResult.functionResponses[0].response.output;

                chatHistory.push({
                    role: 'assistant',
                    parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }]
                });
                chatHistory.push({
                    role: 'tool',
                    parts: [{ functionResponse: { name: currentFunctionCall.name, response: toolResponsePart } }]
                });

                await processHttpStream({
                    ...requestBody,
                    messages: chatHistory,
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId
                }, apiKey);

            } catch (toolError) {
                Logger.error('工具执行失败:', toolError);
                logMessage(`工具执行失败: ${toolError.message}`, 'system');
                chatHistory.push({
                    role: 'assistant',
                    parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }]
                });
                chatHistory.push({
                    role: 'tool',
                    parts: [{ functionResponse: { name: currentFunctionCall.name, response: { error: toolError.message } } }]
                });
                await processHttpStream({
                    ...requestBody,
                    messages: chatHistory,
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId
                }, apiKey);
            } finally {
                isUsingTool = false;
            }
        } else {
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                chatHistory.push({
                    role: 'assistant',
                    content: [{ type: 'text', text: currentAIMessageContentDiv.rawMarkdownBuffer }]
                });
            }
            currentAIMessageContentDiv = null;
            logMessage('Turn complete (HTTP)', 'system');
        }

    } catch (error) {
        Logger.error('处理 HTTP 流失败:', error);
        logMessage(`处理流失败: ${error.message}`, 'system');
        if (currentAIMessageContentDiv) {
            currentAIMessageContentDiv = null;
        }
    }
}

window.addEventListener('error', (event) => {
    logMessage(`系统错误: ${event.message}`, 'system');
});

sendButton.addEventListener('click', handleSendMessage);

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSendMessage();
    }
});

connectButton.addEventListener('click', () => {
    if (isConnected) {
        disconnect();
    } else {
        connect();
    }
});

mobileConnectButton?.addEventListener('click', () => {
    if (isConnected) {
        disconnect();
    } else {
        connect();
    }
});

document.getElementById('model-select').addEventListener('change', () => {
    const selectedModelName = document.getElementById('model-select').value;
    selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName);
    if (!selectedModelConfig) {
        logMessage(`未找到模型配置: ${selectedModelName}`, 'system');
        selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);
        document.getElementById('model-select').value = CONFIG.API.MODEL_NAME;
    }
    Logger.info(`模型选择已更改为: ${selectedModelConfig.displayName}`);
    logMessage(`模型选择已更改为: ${selectedModelConfig.displayName}`, 'system');
    if (isConnected) {
        disconnect();
    }
});

/**
 * Unified connection function.
 */
async function connect() {
    if (!apiKeyInput.value) {
        logMessage('请输入 API Key', 'system');
        return;
    }
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);
    localStorage.setItem('video_fps', fpsInput.value);
    await connectToHttp();
}

/**
 * Unified disconnection function.
 */
function disconnect() {
    resetUIForDisconnectedState();
    logMessage('已断开连接 (HTTP 模式)', 'system');
}

/**
 * Connects to the HTTP API.
 */
async function connectToHttp() {
    try {
        isConnected = true;
        messageInput.disabled = false;
        sendButton.disabled = false;
        chatVoiceInputButton.disabled = false; // Enable voice input on connect
        logMessage(`已连接到 Gemini HTTP API (${selectedModelConfig.displayName})`, 'system');
        updateConnectionStatus();
    } catch (error) {
        const errorMessage = error.message || '未知错误';
        Logger.error('HTTP 连接错误:', error);
        logMessage(`HTTP 连接错误: ${errorMessage}`, 'system');
        resetUIForDisconnectedState();
    }
}

/**
 * Resets the UI to a disconnected state.
 */
function resetUIForDisconnectedState() {
    isConnected = false;
    messageInput.disabled = true;
    sendButton.disabled = true;
    chatVoiceInputButton.disabled = true; // Disable voice input on disconnect
    updateConnectionStatus();
}

/**
 * Updates the connection status display for all connection buttons.
 */
function updateConnectionStatus() {
    const connectButtons = [connectButton, mobileConnectButton];
    connectButtons.forEach(btn => {
        if (btn) {
            btn.textContent = isConnected ? '断开连接' : '连接';
            btn.classList.toggle('connected', isConnected);
        }
    });
}

function generateUniqueSessionId() {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Initializes translation functionality.
 */
function initTranslation() {
  const translationModeBtn = document.getElementById('translation-mode-button');
  const chatModeBtn = document.getElementById('chat-mode-button');
  const translationContainer = document.querySelector('.translation-container');
  const chatContainer = document.querySelector('.chat-container.text-mode');
  const logContainer = document.querySelector('.chat-container.log-mode');
  const inputArea = document.querySelector('.input-area');
  
  const languages = CONFIG.TRANSLATION.LANGUAGES;
  const inputLangSelect = document.getElementById('translation-input-language-select');
  const outputLangSelect = document.getElementById('translation-output-language-select');
  
  languages.forEach(lang => {
    const inputOption = document.createElement('option');
    inputOption.value = lang.code;
    inputOption.textContent = lang.name;
    inputLangSelect.appendChild(inputOption);
    
    if (lang.code !== 'auto') {
      const outputOption = document.createElement('option');
      outputOption.value = lang.code;
      outputOption.textContent = lang.name;
      outputLangSelect.appendChild(outputOption);
    }
  });
  
  inputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_INPUT_LANG;
  outputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_OUTPUT_LANG;

  const translationModelSelect = document.getElementById('translation-model-select');
  translationModelSelect.innerHTML = '';
  CONFIG.TRANSLATION.MODELS.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.displayName;
    if (model.name === CONFIG.TRANSLATION.DEFAULT_MODEL) {
      option.selected = true;
    }
    translationModelSelect.appendChild(option);
  });
  
  document.getElementById('translate-button').addEventListener('click', handleTranslation);
  
  document.getElementById('translation-copy-button').addEventListener('click', () => {
    const outputText = document.getElementById('translation-output-text').textContent;
    navigator.clipboard.writeText(outputText).then(() => {
      logMessage('翻译结果已复制', 'system');
    }).catch(err => {
      logMessage('复制失败: ' + err, 'system');
    });
  });
  
  translationModeBtn.addEventListener('click', () => {
    translationContainer.classList.add('active');
    chatContainer.classList.remove('active');
    logContainer.classList.remove('active');
    if (inputArea) inputArea.style.display = 'none';
    translationModeBtn.classList.add('active');
    chatModeBtn.classList.remove('active');
  });
  
  chatModeBtn.addEventListener('click', () => {
    translationContainer.classList.remove('active');
    chatContainer.classList.add('active');
    logContainer.classList.remove('active');
    if (inputArea) inputArea.style.display = 'flex';
    translationModeBtn.classList.remove('active');
    chatModeBtn.classList.add('active');
  });

  document.getElementById('toggle-log').addEventListener('click', () => {
    translationContainer.classList.remove('active');
    chatContainer.classList.remove('active');
    logContainer.classList.add('active');
    if (inputArea) inputArea.style.display = 'none';
    translationModeBtn.classList.remove('active');
    chatModeBtn.classList.remove('active');
  });
}

/**
 * Handles a translation request.
 */
async function handleTranslation() {
  const inputText = document.getElementById('translation-input-text').value.trim();
  if (!inputText) {
    logMessage('请输入要翻译的内容', 'system');
    return;
  }
  
  const inputLang = document.getElementById('translation-input-language-select').value;
  const outputLang = document.getElementById('translation-output-language-select').value;
  const model = document.getElementById('translation-model-select').value;
  
  const outputElement = document.getElementById('translation-output-text');
  outputElement.textContent = '翻译中...';
  
  try {
    const prompt = inputLang === 'auto' ?
      `你是一个专业的翻译助手，请将以下内容翻译成${getLanguageName(outputLang)}：\n\n${inputText}` :
      `你是一个专业的翻译助手，请将以下内容从${getLanguageName(inputLang)}翻译成${getLanguageName(outputLang)}：\n\n${inputText}`;
    
    const response = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
            {
                role: 'system',
                content: systemInstructionInput.value
                    .replace(/\{\{to\}\}/g, getLanguageName(outputLang))
                    .replace(/\{\{title_prompt\}\}/g, '')
                    .replace(/\{\{summary_prompt\}\}/g, '')
                    .replace(/\{\{terms_prompt\}\}/g, '')
            },
            { role: 'user', content: prompt }
        ],
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`翻译请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    const translatedText = data.choices[0].message.content;
    
    outputElement.textContent = translatedText;
    logMessage('翻译完成', 'system');
  } catch (error) {
    logMessage(`翻译失败: ${error.message}`, 'system');
    outputElement.textContent = '翻译失败，请重试';
    console.error('翻译错误:', error);
  }
}

/**
 * Gets the language name from its code.
 * @param {string} code - The language code.
 * @returns {string} The language name.
 */
function getLanguageName(code) {
  const language = CONFIG.TRANSLATION.LANGUAGES.find(lang => lang.code === code);
  return language ? language.name : code;
}

/**
 * Shows a toast message.
 * @param {string} message - The message to show.
 * @param {number} [duration=3000] - The duration in ms.
 */
export function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, duration);
}

/**
 * Shows a system message in the chat history.
 * @param {string} message - The message to show.
 */
export function showSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system-info');
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.textContent = message;
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Initializes chat voice input functionality.
 */
function initChatVoiceInput() {
    if (chatVoiceInputButton) {
        chatVoiceInputButton.addEventListener('mousedown', startChatRecording);
        chatVoiceInputButton.addEventListener('mouseup', stopChatRecording);
        chatVoiceInputButton.addEventListener('mouseleave', () => {
            if (isChatRecording) cancelChatRecording();
        });
        chatVoiceInputButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            chatInitialTouchY = e.touches[0].clientY;
            startChatRecording();
        });
        chatVoiceInputButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopChatRecording();
        });
        chatVoiceInputButton.addEventListener('touchmove', (e) => {
            if (isChatRecording) {
                const currentTouchY = e.touches[0].clientY;
                if (chatInitialTouchY - currentTouchY > 50) {
                    cancelChatRecording();
                }
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isChatRecording) {
            cancelChatRecording();
        }
    });
}

async function startChatRecording() {
    if (isChatRecording) return;
    if (!hasRequestedChatMicPermission) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasRequestedChatMicPermission = true;
            showToast('已获取麦克风权限，请再次点击开始录音');
            return;
        } catch (error) {
            showSystemMessage(`获取麦克风权限失败: ${error.message}`);
            resetChatRecordingState();
            hasRequestedChatMicPermission = false;
            return;
        }
    }
    try {
        showToast('录音已开始...');
        chatVoiceInputButton.classList.add('recording');
        messageInput.placeholder = '正在录音，请说话...';
        messageInput.value = '';
        chatAudioChunks = [];
        chatAudioRecorder = new AudioRecorder();
        await chatAudioRecorder.start((chunk) => {
            chatAudioChunks.push(chunk);
        }, { returnRaw: true });
        isChatRecording = true;
        chatRecordingTimeout = setTimeout(() => {
            if (isChatRecording) {
                showToast('录音超时，自动停止');
                stopChatRecording();
            }
        }, 60000);
    } catch (error) {
        showSystemMessage(`启动录音失败: ${error.message}`);
        resetChatRecordingState();
        hasRequestedChatMicPermission = false;
    }
}

async function stopChatRecording() {
    if (!isChatRecording) return;
    clearTimeout(chatRecordingTimeout);
    showToast('正在处理语音...');
    try {
        if (chatAudioRecorder) {
            chatAudioRecorder.stop();
            chatAudioRecorder = null;
        }
        if (chatAudioChunks.length === 0) {
            showSystemMessage('没有录到音频，请重试');
            resetChatRecordingState();
            return;
        }
        const totalLength = chatAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chatAudioChunks) {
            mergedAudioData.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        chatAudioChunks = [];
        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.SAMPLE_RATE);
        const response = await fetch('/api/transcribe-audio', {
            method: 'POST',
            headers: { 'Content-Type': audioBlob.type },
            body: audioBlob,
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`转文字失败: ${errorData.error || response.statusText}`);
        }
        const result = await response.json();
        const transcriptionText = result.text;
        if (transcriptionText) {
            messageInput.value = transcriptionText;
            showToast('语音转文字成功');
        } else {
            showSystemMessage('未获取到转录文本。');
        }
    } catch (error) {
        showSystemMessage(`语音转文字失败: ${error.message}`);
    } finally {
        resetChatRecordingState();
    }
}

function cancelChatRecording() {
    if (!isChatRecording) return;
    clearTimeout(chatRecordingTimeout);
    showToast('录音已取消');
    if (chatAudioRecorder) {
        chatAudioRecorder.stop();
        chatAudioRecorder = null;
    }
    chatAudioChunks = [];
    resetChatRecordingState();
}

function resetChatRecordingState() {
    isChatRecording = false;
    chatVoiceInputButton.classList.remove('recording');
    messageInput.placeholder = '输入消息...';
}

// Initial UI State
messageInput.disabled = true;
sendButton.disabled = true;
chatVoiceInputButton.disabled = true;
connectButton.textContent = '连接';
updateConnectionStatus();
