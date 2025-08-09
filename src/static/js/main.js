import {
    attachedFile,
    clearAttachedFile,
    handleFileAttachment
} from './attachments/file-attachment.js';
import { AudioRecorder } from './audio/audio-recorder.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import {
    createAIMessageElement,
    displayAudioMessage,
    displayUserMessage,
    pcmToWavBlob,
    scrollToBottom,
    showSystemMessage
} from './chat/chat-ui.js';
import { CONFIG } from './config/config.js';
import { MultimodalLiveClient } from './core/websocket-client.js';
import {
    chatHistory,
    currentSessionId,
    generateNewSession,
    renderHistoryList,
    saveHistory,
    setChatHistory,
    setCurrentSessionId
} from './history/session-manager.js';
import { handleVideoToggle, stopVideo, updateMediaPreviewsDisplay } from './media/video-handlers.js';
import {
    cancelTranslationRecording,
    isRecording as isTranslationAudioRecording,
    startTranslationRecording,
    stopTranslationRecording,
    initialTouchY as translationInitialTouchY
} from './translation/translation-audio.js';
import { handleTranslation } from './translation/translation-core.js';
import { handleTranslationOcr, toggleOcrButtonVisibility } from './translation/translation-ocr.js';
import { Logger } from './utils/logger.js';
import { ScreenRecorder } from './video/screen-recorder.js';
import { handleSendVisionMessage, initVision } from './vision/vision-core.js';
/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI, audio, video, and WebSocket interactions.
 */

const UNIVERSAL_TRANSLATION_SYSTEM_PROMPT = `You are a professional translation assistant. Only focus on the translation task and ignore other tasks! Strictly adhere to the following: only output the translated text. Do not include any additional prefixes, explanations, or introductory phrases, such as "Okay, here is the translation:" ,"Sure, I can help you with that!"or "Here is your requested translation:" and so on.

## Translation Requirements

1. !!!Important!Strictly adhere to the following: only output the translated text. Do not include any other words which are no related to the translation,such as polite expressions, additional prefixes, explanations, or introductory phrases.
2. Word Choice: Do not translate word-for-word rigidly. Instead, use idiomatic expressions and common phrases in the target language (e.g., idioms, internet slang).
3. Sentence Structure: Do not aim for sentence-by-sentence translation. Adjust sentence length and word order to better suit the expression habits of the target language.
4. Punctuation Usage: Use punctuation marks accurately (including adding and modifying) according to different expression habits.
5. Format Preservation: Only translate the text content from the original. Content that cannot be translated should remain as is. Do not add extra formatting to the translated content.
`;




// Load saved values from localStorage
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedFPS = localStorage.getItem('video_fps');
const savedSystemInstruction = localStorage.getItem('system_instruction');


if (savedApiKey) {
    DOM.apiKeyInput.value = savedApiKey;
}
if (savedVoice) {
    voiceSelect.value = savedVoice;
}

if (savedFPS) {
    fpsInput.value = savedFPS;
}
// Note: The logic for loading saved system instructions is now handled by the prompt selection logic.
// We will set the default prompt based on the new config structure.

document.addEventListener('DOMContentLoaded', () => {
    // 配置 marked.js
    marked.setOptions({
      breaks: true, // 启用 GitHub Flavored Markdown 的换行符支持
      highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
      langPrefix: 'hljs language-' // highlight.js css expects a language prefix
    });

    // 初始化highlight.js
    hljs.configure({
      ignoreUnescapedHTML: true,
      throwUnescapedHTML: false
    });
    // hljs.highlightAll(); // 不再需要在这里调用，因为 marked.js 会处理

    // 动态生成模型选择下拉菜单选项
    const modelSelect = document.getElementById('model-select');
    modelSelect.innerHTML = ''; // 清空现有选项
    CONFIG.API.AVAILABLE_MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.API.MODEL_NAME) { // 默认选中 config 中定义的模型
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });

    // 1. 光暗模式切换逻辑
    const body = document.body;
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
        body.classList.add(savedTheme);
        themeToggleBtn.textContent = savedTheme === 'dark-mode' ? 'dark_mode' : 'light_mode';
    } else {
        if (globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches) {
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

    // 2. 模式切换逻辑 (文字聊天/系统日志)
    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;

            // 修正：在切换子模式前，先隐藏视觉模式容器（如果它处于激活状态）
            if (visionContainer && visionContainer.classList.contains('active')) {
                visionContainer.classList.remove('active');
                // 同时取消视觉主模式按钮的激活状态
                visionModeBtn.classList.remove('active');
            }

            // 移除所有 tab 和 chat-container 的 active 类
            modeTabs.forEach(t => t.classList.remove('active'));
            chatContainers.forEach(c => c.classList.remove('active'));

            // 添加当前点击 tab 和对应 chat-container 的 active 类
            tab.classList.add('active');
            const targetContainer = document.querySelector(`.chat-container.${mode}-mode`);
            if (targetContainer) {
                targetContainer.classList.add('active');
            }

            // 特别处理历史记录的占位符
            if (mode === 'history') {
                // 这个判断逻辑现在可以简化，因为我们总是在切换前隐藏了视觉容器
                // 但为了保险起见，我们保留一个明确的检查
                // 此处假设：如果用户刚才在视觉模式，那么历史记录应该显示占位符
                // 一个简单的判断方法是检查 visionModeBtn 是否还有 active class (虽然我们上面移除了，但可以作为逻辑标记)
                // 更稳妥的方式是设置一个临时变量，但为了最小改动，我们直接修改内容
                // 注意：此处的逻辑需要与 visionModeBtn 的点击事件配合
                // 一个更简单的逻辑是：如果历史记录标签被点击，而文字聊天主按钮不是激活状态，则显示占位符
                if (!chatModeBtn.classList.contains('active')) {
                     historyContent.innerHTML = '<p class="empty-history">当前模式暂不支持历史记录功能。</p>';
                } else {
                    renderHistoryList();
                }
            }


            // 确保在切换模式时停止所有媒体流
            if (videoManager) {
                stopVideo();
            }
            if (screenRecorder) {
                stopScreenSharing();
            }
            // 媒体预览容器的显示由 isVideoActive 或 isScreenSharing 状态控制
            updateMediaPreviewsDisplay(isScreenSharing);
        });
    });

    // 默认激活文字聊天模式
    document.querySelector('.tab[data-mode="text"]').click();

    // 3. 日志显示控制逻辑
    DOM.toggleLogBtn.addEventListener('click', () => {
        // 切换到日志标签页
        document.querySelector('.tab[data-mode="log"]').click();
    });

    clearLogsBtn.addEventListener('click', () => {
        logsContainer.innerHTML = ''; // 清空日志内容
        logMessage('日志已清空', 'system');
    });

    // 4. 配置面板切换逻辑 (现在通过顶部导航的齿轮图标控制)
    configToggle.addEventListener('click', () => {
        configContainer.classList.toggle('active'); // control-panel 现在是 configContainer
        configToggle.classList.toggle('active');
        // 移动端滚动锁定
        if (globalThis.innerWidth <= 1200) {
            document.body.style.overflow = configContainer.classList.contains('active')
                ? 'hidden' : '';
        }
    });

    applyConfigButton.addEventListener('click', () => {
        configContainer.classList.remove('active');
        configToggle.classList.remove('active');
        // 确保关闭设置面板时解除滚动锁定
        if (globalThis.innerWidth <= 1200) {
            document.body.style.overflow = '';
        }
    });

   // 附件按钮事件监听 (只绑定一次)
   attachmentButton.addEventListener('click', () => fileInput.click());
   fileInput.addEventListener('change', handleFileAttachment);

   // 视觉模型附件按钮事件监听
   visionAttachmentButton.addEventListener('click', () => visionFileInput.click());
   visionFileInput.addEventListener('change', (event) => handleFileAttachment(event, 'vision'));
   visionSendButton.addEventListener('click', handleSendVisionMessage);
 
   // 初始化翻译功能
   initTranslation();
   // 初始化视觉功能
   initVision();
   // 初始化指令模式选择
   initializePromptSelect();
   // 初始化时渲染历史记录列表
   renderHistoryList();
 });

// State variables
let isRecording = false;
let audioStreamer = null;
let audioCtx = null;
let isConnected = false;
let audioRecorder = null;
let micStream = null; // 新增：用于保存麦克风流
let isScreenSharing = false;
let screenRecorder = null;
let isUsingTool = false;
let isUserScrolling = false; // 新增：用于判断用户是否正在手动滚动
let audioDataBuffer = []; // 新增：用于累积AI返回的PCM音频数据
let currentAudioElement = null; // 新增：用于跟踪当前播放的音频元素，确保单例播放
// 新增：聊天模式语音输入相关状态变量
let isChatRecording = false; // 聊天模式下是否正在录音
let hasRequestedChatMicPermission = false; // 标记是否已请求过聊天麦克风权限
let chatAudioRecorder = null; // 聊天模式下的 AudioRecorder 实例
let chatAudioChunks = []; // 聊天模式下录制的音频数据块
let chatRecordingTimeout = null; // 聊天模式下用于处理长按录音的定时器
let chatInitialTouchY = 0; // 聊天模式下用于判断手指上滑取消

// Multimodal Client
const client = new MultimodalLiveClient();

// State variables
let selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME); // 初始选中默认模型

/**
 * Logs a message to the UI.
 * @param {string} message - The message to log.
 * @param {string} [type='system'] - The type of the message (system, user, ai).
 * @param {string} [messageType='text'] - 消息在聊天历史中的类型 ('text' 或 'audio')。
 */
function logMessage(message, type = 'system', messageType = 'text') {
    // 原始日志始终写入 logsContainer
    const rawLogEntry = document.createElement('div');
    rawLogEntry.classList.add('log-entry', type);
    rawLogEntry.innerHTML = `
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="emoji">${type === 'system' ? '⚙️' : (type === 'user' ? '🫵' : '🤖')}</span>
        <span>${message}</span>
    `;
    logsContainer.appendChild(rawLogEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

}

/**
 * Updates the microphone icon based on the recording state.
 */
function updateMicIcon() {
    if (micButton) {
        // 修复：直接更新按钮图标
        micButton.textContent = isRecording ? 'mic_off' : 'mic';
        micButton.classList.toggle('active', isRecording);
    }
}

/**
 * Updates the audio visualizer based on the audio volume.
 * @param {number} volume - The audio volume (0.0 to 1.0).
 * @param {boolean} [isInput=false] - Whether the visualizer is for input audio.
 */
// function updateAudioVisualizer(volume, isInput = false) {
//     // 移除音频可视化，因为音频模式已删除，且在文字模式下不需要实时显示音频波形
//     // 如果未来需要，可以考虑在其他地方重新引入
//     // const visualizer = isInput ? inputAudioVisualizer : audioVisualizer;
//     // const audioBar = visualizer.querySelector('.audio-bar') || document.createElement('div');
//
//     // if (!visualizer.contains(audioBar)) {
//     //     audioBar.classList.add('audio-bar');
//     //     visualizer.appendChild(audioBar);
//     // }
//
//     // audioBar.style.width = `${volume * 100}%`;
//     // if (volume > 0) {
//     //     audioBar.classList.add('active');
//     // } else {
//     //     audioBar.classList.remove('active');
//     // }
// }

/**
 * Initializes the audio context and streamer if not already initialized.
 * @returns {Promise<AudioStreamer>} The audio streamer instance.
 */
async function ensureAudioInitialized() {
    if (!audioCtx) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        audioCtx = new AudioContext();
        
        // 确保在用户交互后恢复音频上下文
        if (audioCtx.state === 'suspended') {
            const resumeHandler = async () => {
                await audioCtx.resume();
                document.removeEventListener('click', resumeHandler);
                document.removeEventListener('touchstart', resumeHandler);
            };
            
            document.addEventListener('click', resumeHandler);
            document.addEventListener('touchstart', resumeHandler);
        }
    }
    
    if (!audioStreamer) {
        audioStreamer = new AudioStreamer(audioCtx);
    }
    
    return audioStreamer;
}

/**
 * Handles the microphone toggle. Starts or stops audio recording.
 * @returns {Promise<void>}
 */
async function handleMicToggle() {
    if (!isRecording) {
        try {
            // 增加权限状态检查
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            if (permissionStatus.state === 'denied') {
                logMessage('麦克风权限被拒绝，请在浏览器设置中启用', 'system');
                return;
            }
            await ensureAudioInitialized();
            audioRecorder = new AudioRecorder();
            
            const inputAnalyser = audioCtx.createAnalyser();
            inputAnalyser.fftSize = 256;
            const _inputDataArray = new Uint8Array(inputAnalyser.frequencyBinCount); // 重命名为 _inputDataArray
            
            await audioRecorder.start((base64Data) => {
                if (isUsingTool) {
                    client.sendRealtimeInput([{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data,
                        interrupt: true     // Model isn't interruptable when using tools, so we do it manually
                    }]);
                } else {
                    client.sendRealtimeInput([{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }]);
                }
                
                // 移除输入音频可视化
                // inputAnalyser.getByteFrequencyData(_inputDataArray); // 使用重命名后的变量
                // const inputVolume = Math.max(..._inputDataArray) / 255;
                // updateAudioVisualizer(inputVolume, true);
            });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStream = stream; // 保存流引用
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(inputAnalyser);
            
            await audioStreamer.resume();
            isRecording = true;
            Logger.info('Microphone started');
            logMessage('Microphone started', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isRecording = false;
            updateMicIcon();
        }
    } else {
        try {
            // 修复：确保正确关闭麦克风
            if (audioRecorder && isRecording) {
                audioRecorder.stop();
                // 确保关闭音频流
                if (micStream) {
                    micStream.getTracks().forEach(track => track.stop());
                    micStream = null;
                }
            }
            isRecording = false;
            logMessage('Microphone stopped', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone stop error:', error);
            logMessage(`Error stopping microphone: ${error.message}`, 'system');
            isRecording = false; // 即使出错也要尝试重置状态
            updateMicIcon();
        }
    }
}

/**
 * Resumes the audio context if it's suspended.
 * @returns {Promise<void>}
 */
async function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
}

/**
 * Connects to the WebSocket server.
 * @returns {Promise<void>}
 */
async function connectToWebsocket() {
    if (!DOM.apiKeyInput.value) {
        logMessage('Please input API Key', 'system');
        return;
    }

    // Save values to localStorage
    localStorage.setItem('gemini_api_key', DOM.apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);

        /**
         * @description 根据用户选择的响应类型构建模型生成配置。
         * @param {string} selectedResponseType - 用户选择的响应类型 ('text' 或 'audio')。
         * @returns {string[]} 响应模态数组。
         */
        /**
         * @description 根据用户选择的响应类型构建模型生成配置。
         * @param {string} selectedResponseType - 用户选择的响应类型 ('text' 或 'audio')。
         * @returns {string[]} 响应模态数组。
         */
        function getResponseModalities(selectedResponseType) {
            if (selectedResponseType === 'audio') {
                return ['audio'];
            } else {
                return ['text'];
            }
        }

        const config = {
            model: CONFIG.API.MODEL_NAME,
            generationConfig: {
                responseModalities: getResponseModalities(responseTypeSelect.value),
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voiceSelect.value
                        }
                    },
                }
            },

            systemInstruction: {
                parts: [{
                    text: systemInstructionInput.value     // You can change system instruction in the config.js file
                }],
            }
        };  

    try {
        await client.connect(config,DOM.apiKeyInput.value);
        isConnected = true;
        await resumeAudioContext();
        connectButton.textContent = '断开连接';
        connectButton.classList.add('connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        // 启用媒体按钮
        micButton.disabled = false;
        cameraButton.disabled = false;
        screenButton.disabled = false;
        logMessage('已连接到 Gemini 2.0 Flash 多模态实时 API', 'system');
        updateConnectionStatus();
    } catch (error) {
        const errorMessage = error.message || '未知错误';
        Logger.error('连接错误:', error);
        logMessage(`连接错误: ${errorMessage}`, 'system');
        isConnected = false;
        connectButton.textContent = '连接';
        connectButton.classList.remove('connected');
        messageInput.disabled = true;
        sendButton.disabled = true;
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
        updateConnectionStatus();
        
        if (videoManager) {
            stopVideo();
        }
        
        if (screenRecorder) {
            stopScreenSharing();
        }
    }
}

/**
 * Disconnects from the WebSocket server.
 */
function disconnectFromWebsocket() {
    client.disconnect();
    isConnected = false;
    if (audioStreamer) {
        audioStreamer.stop();
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder = null;
        }
        isRecording = false;
        updateMicIcon();
    }
    connectButton.textContent = '连接';
    connectButton.classList.remove('connected');
    messageInput.disabled = true;
    sendButton.disabled = true;
    if (micButton) micButton.disabled = true;
    if (cameraButton) cameraButton.disabled = true;
    if (screenButton) screenButton.disabled = true;
    logMessage('已从服务器断开连接', 'system');
    updateConnectionStatus();
    
    if (videoManager) {
        stopVideo();
    }
    
    if (screenRecorder) {
        stopScreenSharing();
    }
}

/**
 * Handles sending a text message.
 */
async function handleSendMessage() {
    const message = messageInput.value.trim();
    // 如果没有文本消息，但有附件，也允许发送
    if (!message && !attachedFile) return;

    // 确保在处理任何消息之前，会话已经存在
    // 这是修复“新会话第一条消息不显示”问题的关键
    if (selectedModelConfig && !selectedModelConfig.isWebSocket && !currentSessionId) {
        setCurrentSessionId(null);
        setChatHistory([]);
        generateNewSession();
    }

    // 使用新的函数显示用户消息
    displayUserMessage(message, attachedFile);
    messageInput.value = ''; // 清空输入框

    // 在发送用户消息后，重置 currentAIMessageContentDiv，确保下一个AI响应会创建新气泡
    currentAIMessageContentDiv = null;

    if (selectedModelConfig.isWebSocket) {
        // WebSocket 模式不支持文件上传，可以提示用户或禁用按钮
        if (attachedFile) {
            showSystemMessage('实时模式尚不支持文件上传。');
            clearAttachedFile(); // 清除附件
            return;
        }
        client.send({ text: message });
    } else {
        // HTTP 模式下发送消息
        try {
            const apiKey = DOM.apiKeyInput.value;
            const modelName = selectedModelConfig.name;
            const systemInstruction = systemInstructionInput.value;

            // 构建消息内容，参考 OCR 项目的成功实践
            const userContent = [];
            if (message) {
                userContent.push({ type: 'text', text: message });
            }
            if (attachedFile) {
                // 参考项目使用 image_url 并传递完整的 Data URL
                userContent.push({
                    type: 'image_url',
                    image_url: {
                        url: attachedFile.base64
                    }
                });
            }

            const newHistory = [...chatHistory, {
                role: 'user',
                content: userContent
            }];
            setChatHistory(newHistory);

            // 清除附件（发送后）
            clearAttachedFile();

            let requestBody = {
                model: modelName,
                messages: [...chatHistory],
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
                requestBody.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            await processHttpStream(requestBody, apiKey);

        } catch (error) {
            Logger.error('发送 HTTP 消息失败:', error);
            logMessage(`发送消息失败: ${error.message}`, 'system');
        }
    }
}

// Event Listeners
client.on('open', () => {
    logMessage('WebSocket connection opened', 'system');
});

client.on('log', (log) => {
    logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system');
});

let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

client.on('close', (event) => {
    logMessage(`WebSocket connection closed (code ${event.code})`, 'system');
    if (event.code === 1006 && reconnectAttempts < MAX_RECONNECT) {
        setTimeout(() => {
            reconnectAttempts++;
            connectToWebsocket();
        }, 2000);
    }
});

client.on('audio', async (data) => {
    try {
        await resumeAudioContext();
        const streamer = await ensureAudioInitialized();
        streamer.addPCM16(new Uint8Array(data));
        // 同时将音频数据累积到缓冲区
        audioDataBuffer.push(new Uint8Array(data));
    } catch (error) {
        logMessage(`处理音频时出错: ${error.message}`, 'system');
    }
});

let currentAIMessageContentDiv = null;

client.on('content', (data) => {
    if (data.modelTurn) {
        if (data.modelTurn.parts.some(part => part.functionCall)) {
            isUsingTool = true;
            Logger.info('Model is using a tool');
            // 在工具调用前，确保当前 AI 消息完成
            if (currentAIMessageContentDiv) {
                currentAIMessageContentDiv = null; // 重置，以便工具响应后创建新消息
            }
        } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
            isUsingTool = false;
            Logger.info('Tool usage completed');
            // 工具响应后，如果需要，可以立即创建一个新的 AI 消息块来显示后续文本
            if (!currentAIMessageContentDiv) {
                currentAIMessageContentDiv = createAIMessageElement();
            }
        }

        const text = data.modelTurn.parts.map(part => part.text).join('');
        
        if (text) {
            if (!currentAIMessageContentDiv) {
                currentAIMessageContentDiv = createAIMessageElement();
            }
            
            // 追加文本到原始Markdown缓冲区
            currentAIMessageContentDiv.rawMarkdownBuffer += text;
            
            // 渲染Markdown并高亮代码
            // 注意：marked.js 已经集成了 highlight.js，所以不需要单独调用 hljs.highlightElement
            // 立即更新 innerHTML，确保实时渲染
            currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(currentAIMessageContentDiv.rawMarkdownBuffer);
            
            // 触发 MathJax 渲染
            if (typeof MathJax !== 'undefined') {
                if (typeof MathJax !== 'undefined' && MathJax.startup) {
                    MathJax.startup.promise.then(() => {
                        MathJax.typeset([currentAIMessageContentDiv.markdownContainer]);
                    }).catch((err) => console.error('MathJax typesetting failed:', err));
                }
            }
            scrollToBottom();
        }
    }
});

client.on('interrupted', () => {
    audioStreamer?.stop();
    isUsingTool = false;
    Logger.info('Model interrupted');
    logMessage('Model interrupted', 'system');
    // 确保在中断时完成当前文本消息并添加到聊天历史
    if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
        const newHistory = [...chatHistory, {
            role: 'assistant',
            content: currentAIMessageContentDiv.rawMarkdownBuffer
        }];
        setChatHistory(newHistory);
    }
    currentAIMessageContentDiv = null; // 重置，以便下次创建新消息
    // 处理累积的音频数据 (保持不变)
    if (audioDataBuffer.length > 0) {
        const audioBlob = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (CONFIG.AUDIO.OUTPUT_SAMPLE_RATE * 2);
        displayAudioMessage(audioUrl, duration, 'ai');
        audioDataBuffer = [];
    }
});

client.on('setupcomplete', () => {
    logMessage('Setup complete', 'system');
});

client.on('turncomplete', () => {
    isUsingTool = false;
    logMessage('Turn complete', 'system');
    // 在对话结束时刷新文本缓冲区并添加到聊天历史
    if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
        const newHistory = [...chatHistory, {
            role: 'assistant',
            content: currentAIMessageContentDiv.rawMarkdownBuffer
        }];
        setChatHistory(newHistory);
    }
    currentAIMessageContentDiv = null; // 重置
    // 处理累积的音频数据
    if (audioDataBuffer.length > 0) {
        const audioBlob = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (CONFIG.AUDIO.OUTPUT_SAMPLE_RATE * 2); // 16位PCM，2字节/采样
        displayAudioMessage(audioUrl, duration, 'ai');
        audioDataBuffer = []; // 清空缓冲区
    }

    // T15: 在WebSocket模式对话完成时保存历史
    if (isConnected && !selectedModelConfig.isWebSocket) {
        saveHistory();
    }
});

client.on('error', (error) => {
    if (error instanceof ApplicationError) {
        Logger.error(`Application error: ${error.message}`, error);
    } else {
        Logger.error('Unexpected error', error);
    }
    logMessage(`Error: ${error.message}`, 'system');
});

// ... (新增 processHttpStream 辅助函数)

/**
 * 处理 HTTP SSE 流，包括文本累积和工具调用。
 * @param {Object} requestBody - 发送给模型的请求体。
 * @param {string} apiKey - API Key。
 * @returns {Promise<void>}
 */
async function processHttpStream(requestBody, apiKey) {
    // let accumulatedText = ''; // 不再需要累积文本，直接追加
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
        let reasoningStarted = false;
        let answerStarted = false; // 新增：用于标记最终答案是否开始

        // 在 HTTP 流开始时，为新的 AI 响应创建一个新的消息块
        // 只有当不是工具响应的后续文本时才创建新消息块
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
                    if (jsonStr === '[DONE]') {
                        return;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.choices && data.choices.length > 0) {
                            const choice = data.choices[0];
                            if (choice.delta) {
                                const functionCallPart = choice.delta.parts?.find(p => p.functionCall);

                                // 1. 处理思维链
                                if (choice.delta.reasoning_content) {
                                    if (!currentAIMessageContentDiv) currentAIMessageContentDiv = createAIMessageElement();
                                    if (!reasoningStarted) {
                                        currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                        reasoningStarted = true;
                                    }
                                    currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content').innerHTML += choice.delta.reasoning_content.replace(/\n/g, '<br>');
                                }
                                
                                // 2. 处理工具调用
                                if (functionCallPart) {
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (currentAIMessageContentDiv) currentAIMessageContentDiv = null;
                                }
                                // 3. 处理最终答案
                                else if (choice.delta.content) {
                                    if (!functionCallDetected) {
                                        if (!currentAIMessageContentDiv) currentAIMessageContentDiv = createAIMessageElement();
                                        
                                        // 当思维链存在且最终答案首次出现时，插入分隔符
                                        if (reasoningStarted && !answerStarted) {
                                            const separator = document.createElement('hr');
                                            separator.className = 'answer-separator';
                                            currentAIMessageContentDiv.markdownContainer.before(separator);
                                            answerStarted = true;
                                        }

                                        currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(currentAIMessageContentDiv.rawMarkdownBuffer);
                                        
                                        if (typeof MathJax !== 'undefined' && MathJax.startup) {
                                            MathJax.startup.promise.then(() => {
                                                MathJax.typeset([currentAIMessageContentDiv.markdownContainer, currentAIMessageContentDiv.reasoningContainer]);
                                            }).catch((err) => console.error('MathJax typesetting failed:', err));
                                        }
                                        scrollToBottom();
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
            });
        }

        // 处理工具调用
        if (functionCallDetected && currentFunctionCall) {
            // 确保在处理工具调用前，当前 AI 消息已完成并添加到聊天历史
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                const newHistory = [...chatHistory, {
                    role: 'assistant',
                    content: currentAIMessageContentDiv.rawMarkdownBuffer
                }];
                setChatHistory(newHistory);
            }
            currentAIMessageContentDiv = null; // 重置，以便工具响应后创建新消息

            try {
                isUsingTool = true;
                logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                const toolResult = await toolManager.handleToolCall(currentFunctionCall);

                const toolResponsePart = toolResult.functionResponses[0].response.output;

                // 将模型调用工具添加到 chatHistory
                const newHistoryWithFuncCall = [...chatHistory, {
                    role: 'assistant',
                    parts: [{
                        functionCall: {
                            name: currentFunctionCall.name,
                            args: currentFunctionCall.args
                        }
                    }]
                }];
                setChatHistory(newHistoryWithFuncCall);

                // 将工具响应添加到 chatHistory
                const newHistoryWithToolResponse = [...chatHistory, {
                    role: 'tool',
                    parts: [{
                        functionResponse: {
                            name: currentFunctionCall.name,
                            response: toolResponsePart
                        }
                    }]
                }];
                setChatHistory(newHistoryWithToolResponse);

                // 递归调用，将工具结果发送回模型
                await processHttpStream({
                    ...requestBody,
                    messages: [...chatHistory],
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId // 确保传递会话ID
                }, apiKey);

            } catch (toolError) {
                Logger.error('工具执行失败:', toolError);
                logMessage(`工具执行失败: ${toolError.message}`, 'system');
                
                // 将模型调用工具添加到 chatHistory (即使失败也要记录)
                const newHistoryWithFuncCallError = [...chatHistory, {
                    role: 'assistant',
                    parts: [{
                        functionCall: {
                            name: currentFunctionCall.name,
                            args: currentFunctionCall.args
                        }
                    }]
                }];
                setChatHistory(newHistoryWithFuncCallError);

                // 将工具错误响应添加到 chatHistory
                const newHistoryWithToolError = [...chatHistory, {
                    role: 'tool',
                    parts: [{
                        functionResponse: {
                            name: currentFunctionCall.name,
                            response: { error: toolError.message }
                        }
                    }]
                }];
                setChatHistory(newHistoryWithToolError);

                await processHttpStream({
                    ...requestBody,
                    messages: [...chatHistory],
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId // 确保传递会话ID
                }, apiKey);
            } finally {
                isUsingTool = false;
            }
        } else {
            // 如果没有工具调用，且流已完成，将完整的 AI 响应添加到 chatHistory
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                const newHistory = [...chatHistory, {
                    role: 'assistant',
                    content: currentAIMessageContentDiv.rawMarkdownBuffer
                }];
                setChatHistory(newHistory);
            }
            currentAIMessageContentDiv = null; // 重置
            logMessage('Turn complete (HTTP)', 'system');
            // T15: 在HTTP模式对话完成时保存历史
            saveHistory();
        }

    } catch (error) {
        Logger.error('处理 HTTP 流失败:', error);
        logMessage(`处理流失败: ${error.message}`, 'system');
        // 错误发生时，确保AI消息容器存在再更新内容，否则直接重置
        if (currentAIMessageContentDiv && currentAIMessageContentDiv.markdownContainer) {
            currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
        }
        currentAIMessageContentDiv = null; // 最终重置
    }
}


// 添加全局错误处理
globalThis.addEventListener('error', (event) => {
    logMessage(`系统错误: ${event.message}`, 'system');
});

client.on('message', (message) => {
    if (message.error) {
        Logger.error('Server error:', message.error);
        logMessage(`Server error: ${message.error}`, 'system');
    }
});

sendButton.addEventListener('click', handleSendMessage);

/**
 * @function handleInterruptPlayback
 * @description 处理中断按钮点击事件，停止当前语音播放。
 * @returns {void}
 */
function handleInterruptPlayback() {
    if (audioStreamer) {
        audioStreamer.stop();
        Logger.info('Audio playback interrupted by user.');
        logMessage('语音播放已中断', 'system');
        // 确保在中断时也刷新文本缓冲区并添加到聊天历史
        if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
            const newHistory = [...chatHistory, {
                role: 'assistant',
                content: currentAIMessageContentDiv.rawMarkdownBuffer
            }];
            setChatHistory(newHistory);
        }
        currentAIMessageContentDiv = null; // 重置
        // 处理累积的音频数据
        if (audioDataBuffer.length > 0) {
            const audioBlob = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (CONFIG.AUDIO.OUTPUT_SAMPLE_RATE * 2); // 16位PCM，2字节/采样
            displayAudioMessage(audioUrl, duration, 'ai');
            audioDataBuffer = []; // 清空缓冲区
        }
    } else {
        Logger.warn('Attempted to interrupt playback, but audioStreamer is not initialized.');
        logMessage('当前没有语音播放可中断', 'system');
    }
}

interruptButton.addEventListener('click', handleInterruptPlayback); // 新增事件监听器

/**
 * 监听消息输入框的键盘事件。
 * 当用户在文本区域中按下 Enter 键时，如果同时按下了 Shift 键，则发送消息；
 * 否则，允许默认的换行行为。
 * @param {KeyboardEvent} event - 键盘事件对象。
 * @returns {void}
 */
messageInput.addEventListener('keydown', (event) => {
    // 检查是否是 Enter 键
    if (event.key === 'Enter') {
        // 如果同时按下了 Shift 键，或者在 macOS 上按下了 Command 键 (event.metaKey)，则发送消息
        // 在 Windows/Linux 上，通常是 Shift + Enter 或 Ctrl + Enter
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            event.preventDefault(); // 阻止默认的换行行为
            handleSendMessage();
        } else {
            // 允许默认的换行行为
            // 对于 textarea，单独的 Enter 键默认就是换行，所以这里不需要额外处理
        }
    }
});

micButton.addEventListener('click', () => {
    if (isConnected) handleMicToggle();
});

connectButton.addEventListener('click', () => {
    if (isConnected) {
        disconnect(); // 调用统一的断开连接函数
    } else {
        connect(); // 调用统一的连接函数
    }
});

messageInput.disabled = true;
sendButton.disabled = true;
micButton.disabled = true;
cameraButton.disabled = true;
screenButton.disabled = true;
connectButton.textContent = '连接';

// 移动端连接按钮逻辑
mobileConnectButton?.addEventListener('click', () => {
    if (isConnected) {
        disconnect();
    } else {
        connect();
    }
});


// 监听模型选择变化
const modelSelect = document.getElementById('model-select'); // 确保这里获取到 modelSelect
modelSelect.addEventListener('change', () => {
    const selectedModelName = modelSelect.value;
    selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName);
    if (!selectedModelConfig) {
        logMessage(`未找到模型配置: ${selectedModelName}`, 'system');
        // 恢复到默认模型配置
        selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);
        modelSelect.value = CONFIG.API.MODEL_NAME;
    }
    Logger.info(`模型选择已更改为: ${selectedModelConfig.displayName}`);
    logMessage(`模型选择已更改为: ${selectedModelConfig.displayName}`, 'system');
    // 如果已连接，断开连接以应用新模型
    if (isConnected) {
        disconnect(); // 调用统一的断开连接函数
    }
});

/**
 * 统一的连接函数，根据模型类型选择 WebSocket 或 HTTP。
 */
async function connect() {
    if (!DOM.apiKeyInput.value) {
        logMessage('请输入 API Key', 'system');
        return;
    }

    // 保存值到 localStorage
    localStorage.setItem('gemini_api_key', DOM.apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);
    localStorage.setItem('video_fps', fpsInput.value); // 保存 FPS

    // 根据选定的模型配置决定连接方式
    if (selectedModelConfig.isWebSocket) {
        await connectToWebsocket();
    } else {
        await connectToHttp();
    }
}

/**
 * 统一的断开连接函数。
 */
function disconnect() {
    if (selectedModelConfig.isWebSocket) {
        disconnectFromWebsocket();
    } else {
        // 对于 HTTP 模式，没有“断开连接”的概念，但需要重置 UI 状态
        resetUIForDisconnectedState();
        logMessage('已断开连接 (HTTP 模式)', 'system');
    }
}

/**
 * 连接到 HTTP API。
 * @returns {Promise<void>}
 */
async function connectToHttp() {
    try {
        // 模拟连接成功状态
        isConnected = true;
        connectButton.textContent = '断开连接';
        connectButton.classList.add('connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        // 在 HTTP 模式下禁用麦克风、摄像头和屏幕共享按钮
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
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
 * 重置 UI 到未连接状态。
 */
function resetUIForDisconnectedState() {
    isConnected = false;
    connectButton.textContent = '连接';
    connectButton.classList.remove('connected');
    messageInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    cameraButton.disabled = true;
    screenButton.disabled = true;
    updateConnectionStatus();

    if (audioStreamer) {
        audioStreamer.stop();
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder = null;
        }
        isRecording = false;
        updateMicIcon();
    }
    if (videoManager) {
        stopVideo();
    }
    if (screenRecorder) {
        stopScreenSharing();
    }
}

/**
 * Updates the connection status display for all connection buttons.
 */
function updateConnectionStatus() {
    const connectButtons = [
        document.getElementById('connect-button'),
        document.getElementById('mobile-connect')
    ];

    connectButtons.forEach(btn => {
        if (btn) {
            btn.textContent = isConnected ? '断开连接' : '连接';
            btn.classList.toggle('connected', isConnected);
        }
    });

    // 根据连接状态和模型类型禁用/启用媒体按钮
    const mediaButtons = [micButton, cameraButton, screenButton, chatVoiceInputButton];
    mediaButtons.forEach(btn => {
        if (btn) {
            btn.disabled = !isConnected || !selectedModelConfig.isWebSocket;
        }
    });
    
    // 附件按钮仅在 HTTP 模式下可用
    if (attachmentButton) {
        attachmentButton.disabled = !isConnected || selectedModelConfig.isWebSocket;
    }
}

updateConnectionStatus(); // 初始更新连接状态


cameraButton.addEventListener('click', () => {
    if (isConnected) handleVideoToggle();
});
stopVideoButton.addEventListener('click', stopVideo); // 绑定新的停止视频按钮

// 获取预览窗中的翻转按钮
const flipCameraButton = document.getElementById('flip-camera');

// 绑定翻转按钮事件（确保在DOM加载完成后执行）
// 仅在非触屏设备上绑定 click 事件，避免与移动端 touchstart 冲突
if (!('ontouchstart' in window)) {
    flipCameraButton.addEventListener('click', async () => {
        if (videoManager) {
            flipCameraButton.disabled = true; // 禁用按钮防止重复点击
            try {
                await videoManager.flipCamera();
                logMessage('摄像头已翻转', 'system');
            } catch (error) {
                logMessage(`翻转摄像头失败: ${error.message}`, 'error');
                console.error('翻转摄像头失败:', error);
            } finally {
                flipCameraButton.disabled = false; // 重新启用按钮
            }
        } else {
            logMessage('摄像头未激活，无法翻转', 'system');
        }
    });
}

cameraButton.disabled = true;

/**
 * Handles the screen share toggle. Starts or stops screen sharing.
 * @returns {Promise<void>}
 */
async function handleScreenShare() {
    if (!isScreenSharing) {
        try {
            Logger.info('Starting screen sharing...'); // 添加日志
            // 显示预览容器
            mediaPreviewsContainer.style.display = 'flex';
            screenContainer.style.display = 'block';

            screenRecorder = new ScreenRecorder();
            // 性能优化：添加帧节流
            const throttle = (func, limit) => {
                let lastFunc;
                let lastRan;
                return function() {
                    const context = this;
                    const args = arguments;
                    if (!lastRan) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    } else {
                        clearTimeout(lastFunc);
                        lastFunc = setTimeout(function() {
                            if ((Date.now() - lastRan) >= limit) {
                                func.apply(context, args);
                                lastRan = Date.now();
                            }
                        }, limit - (Date.now() - lastRan));
                    }
                }
            };
            const throttledSendFrame = throttle((frameData) => { // 移除 no-this-alias 警告，因为这里没有 this 的别名问题
                if (isConnected) {
                    client.sendRealtimeInput([{
                        mimeType: "image/jpeg",
                        data: frameData
                    }]);
                }
            }, 1000 / fpsInput.value); // 根据 fpsInput 的值进行节流

            await screenRecorder.start(screenPreview, throttledSendFrame);

            isScreenSharing = true;
            // 修改按钮状态
            screenButton.textContent = 'stop_screen_share';
            screenButton.classList.add('active');
            updateMediaPreviewsDisplay(isScreenSharing);
            Logger.info('屏幕共享已启动');
            logMessage('屏幕共享已启动', 'system');

        } catch (error) {
            Logger.error('屏幕共享错误:', error);
            logMessage(`错误: ${error.message}`, 'system');
            // 确保错误时重置状态
            isScreenSharing = false;
            screenButton.classList.remove('active');
            screenButton.textContent = 'screen_share';
            mediaPreviewsContainer.style.display = 'none';
            screenContainer.style.display = 'none';
            updateMediaPreviewsDisplay(isScreenSharing);
        }
    } else {
        stopScreenSharing();
    }
}

/**
 * Stops the screen sharing.
 * @returns {void}
 */
function stopScreenSharing() {
    if (screenRecorder) {
        screenRecorder.stop();
        screenRecorder = null;
    }
    isScreenSharing = false;
    screenButton.classList.remove('active');
    screenButton.textContent = 'screen_share'; // 直接修改按钮文本
    // 停止时隐藏预览
    mediaPreviewsContainer.style.display = 'none';
    screenContainer.style.display = 'none';
    updateMediaPreviewsDisplay(isScreenSharing);
    logMessage('屏幕共享已停止', 'system');
}

screenButton.addEventListener('click', () => {
    if (isConnected) handleScreenShare();
});
stopScreenButton.addEventListener('click', stopScreenSharing); // 绑定新的停止屏幕共享按钮

screenButton.disabled = true;

/**
 * Initializes mobile-specific event handlers.
 */
function initMobileHandlers() {
    // 移动端摄像头按钮
    document.getElementById('camera-button').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected) handleVideoToggle();
    });
    
    // 移动端屏幕共享按钮
    document.getElementById('screen-button').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected) handleScreenShare();
    });

    // 新增：移动端麦克风按钮
    document.getElementById('mic-button').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected) handleMicToggle();
    });
    
    // 移动端翻转摄像头
    document.getElementById('flip-camera').addEventListener('touchstart', async (e) => {
        e.preventDefault();
        if (videoManager) {
            const flipCameraButton = document.getElementById('flip-camera');
            flipCameraButton.disabled = true; // 禁用按钮防止重复点击
            try {
                await videoManager.flipCamera();
                logMessage('摄像头已翻转', 'system');
            } catch (error) {
                logMessage(`翻转摄像头失败: ${error.message}`, 'error');
                console.error('翻转摄像头失败:', error);
            } finally {
                flipCameraButton.disabled = false; // 重新启用按钮
            }
        } else {
            logMessage('摄像头未激活，无法翻转', 'system');
        }
    });
    
    /**
     * 检查音频播放状态。
     */
    function checkAudioPlayback() {
        if (audioStreamer && audioStreamer.isPlaying) {
            logMessage('音频正在播放中...', 'system');
        } else {
            logMessage('音频未播放', 'system');
        }
    }
    
    // 在连接成功后添加检查
    client.on('setupcomplete', () => {
        logMessage('Setup complete', 'system');
        setTimeout(checkAudioPlayback, 1000); // 1秒后检查音频状态
    });
    
    /**
     * 添加权限检查。
     */
    async function checkAudioPermissions() {
        try {
            const permission = await navigator.permissions.query({ name: 'speaker' });
            logMessage(`扬声器权限状态: ${permission.state}`, 'system');
        } catch (error) {
            logMessage(`扬声器权限检查失败: ${error.message}`, 'system');
        }
    }
}

// 在 DOMContentLoaded 中调用
document.addEventListener('DOMContentLoaded', () => {
    // ... 原有代码 ...
    
    // 添加移动端事件处理
    if ('ontouchstart' in window) {
        initMobileHandlers();
    }

    /**
     * @function
     * @description 处理“新建聊天”按钮点击事件，刷新页面以开始新的聊天。
     * @returns {void}
     */
    /**
     * @function
     * @description 处理“新建聊天”按钮点击事件，根据当前激活的模式清空对应的聊天历史。
     * @returns {void}
     */
    newChatButton.addEventListener('click', () => {
        // 仅在 HTTP 模式下启用历史记录功能
        if (selectedModelConfig && !selectedModelConfig.isWebSocket) {
            generateNewSession();
        } else {
            // 对于 WebSocket 模式或未连接时，保持原有简单重置逻辑
            setChatHistory([]);
            setCurrentSessionId(null);
            messageHistory.innerHTML = '';
            logMessage('新聊天已开始', 'system');
            showSystemMessage('实时模式不支持历史记录。');
        }
    });

    /**
     * @function
     * @description 处理“新建聊天”按钮点击事件，刷新页面以开始新的聊天。
     * @returns {void}
     */
    // 添加视图缩放阻止
    document.addEventListener('touchmove', (e) => {
        // 仅在非 message-history 区域阻止缩放行为
        if (!e.target.closest('#message-history') && e.scale !== 1) {
            e.preventDefault();
        }
    }, { passive: true }); // 将 passive 设置为 true，提高滚动性能

    // 添加浏览器兼容性检测
    if (!checkBrowserCompatibility()) {
        return; // 阻止后续初始化
    }

    const messageHistory = document.getElementById('message-history');
    if (messageHistory) {
        /**
         * 监听鼠标滚轮事件，判断用户是否正在手动滚动。
         * @param {WheelEvent} e - 滚轮事件对象。
         */
        messageHistory.addEventListener('wheel', () => {
            isUserScrolling = true;
        }, { passive: true }); // 使用 passive: true 提高滚动性能

        /**
         * 监听滚动事件，如果滚动条已经到底部，则重置 isUserScrolling。
         * @param {Event} e - 滚动事件对象。
         */
        messageHistory.addEventListener('scroll', () => {
            // 如果滚动条已经到底部，则重置 isUserScrolling
            if (messageHistory.scrollHeight - messageHistory.clientHeight <= messageHistory.scrollTop + 1) {
                isUserScrolling = false;
            }
        });
    }

    // 移动端触摸事件支持
    if ('ontouchstart' in window) {
        if (messageHistory) {
            /**
             * 监听触摸开始事件，判断用户是否正在手动滚动。
             * @param {TouchEvent} e - 触摸事件对象。
             */
            messageHistory.addEventListener('touchstart', () => {
                isUserScrolling = true;
            }, { passive: true });

            /**
             * 监听触摸结束事件，无论是否接近底部，都重置 isUserScrolling。
             * @param {TouchEvent} e - 触摸事件对象。
             */
            messageHistory.addEventListener('touchend', () => {
                isUserScrolling = false; // 无论是否接近底部，都重置为 false
                // 如果用户在触摸结束时接近底部，可以尝试自动滚动
                const threshold = 50; // 离底部50px视为"接近底部"
                const isNearBottom = messageHistory.scrollHeight - messageHistory.clientHeight <=
                                    messageHistory.scrollTop + threshold;
                if (isNearBottom) {
                    scrollToBottom(); // 尝试滚动到底部
                }
            }, { passive: true });
        }
    }
});

/**
 * 检测当前设备是否为移动设备。
 * @returns {boolean} 如果是移动设备则返回 true，否则返回 false。
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}



/**
 * 检查浏览器兼容性并显示警告。
 * @returns {boolean} 如果浏览器兼容则返回 true，否则返回 false。
 */
function checkBrowserCompatibility() {
    const incompatibleBrowsers = [
        { name: 'Firefox', test: /Firefox/i, supported: false, message: 'Firefox 浏览器可能不支持某些视频功能，建议使用 Chrome 或 Edge。' },
        { name: '狐猴浏览器', test: /Lemur/i, supported: false, message: '狐猴浏览器可能存在兼容性问题，建议使用 Chrome 或 Edge。' }
    ];
    
    const userAgent = navigator.userAgent;
    for (const browser of incompatibleBrowsers) {
        if (browser.test.test(userAgent) && !browser.supported) {
            logMessage(`警告：您正在使用${browser.name}。${browser.message}`, 'system');
            // 可以在这里显示一个更明显的 UI 警告
            return false;
        }
    }
    return true;
}

/**
 * @function initTranslation
 * @description 初始化翻译功能，包括UI元素的获取、语言下拉菜单的填充、事件监听器的绑定以及模式切换逻辑。
 * @returns {void}
 */
function initTranslation() {
  const translationModeBtn = document.getElementById('translation-mode-button');
  const chatModeBtn = document.getElementById('chat-mode-button');
  const translationContainer = document.querySelector('.translation-container');
  const chatContainer = document.querySelector('.chat-container.text-mode'); // 确保是文字聊天容器
  const logContainer = document.querySelector('.chat-container.log-mode'); // 获取日志容器
  const inputArea = document.querySelector('.input-area'); // 获取输入区域
  
  // 语言列表从 CONFIG 中获取
  const languages = CONFIG.TRANSLATION.LANGUAGES;
  
  // 初始化语言下拉菜单
  const inputLangSelect = document.getElementById('translation-input-language-select');
  const outputLangSelect = document.getElementById('translation-output-language-select');
  
  languages.forEach(lang => {
    const inputOption = document.createElement('option');
    inputOption.value = lang.code;
    inputOption.textContent = lang.name;
    inputLangSelect.appendChild(inputOption);
    
    // 输出语言不包括"自动检测"
    if (lang.code !== 'auto') {
      const outputOption = document.createElement('option');
      outputOption.value = lang.code;
      outputOption.textContent = lang.name;
      outputLangSelect.appendChild(outputOption);
    }
  });
  
  // 设置默认语言从 CONFIG 中获取
  inputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_INPUT_LANG;
  outputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_OUTPUT_LANG;

  // 填充翻译模型选择下拉菜单
  const translationModelSelect = document.getElementById('translation-model-select');
  translationModelSelect.innerHTML = ''; // 清空现有选项
  CONFIG.TRANSLATION.MODELS.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.displayName;
    if (model.name === CONFIG.TRANSLATION.DEFAULT_MODEL) {
      option.selected = true;
    }
    translationModelSelect.appendChild(option);
  });
  
  // 翻译按钮事件
  document.getElementById('translate-button').addEventListener('click', handleTranslation);

  // 新增：OCR按钮事件
  translationOcrButton.addEventListener('click', () => translationOcrInput.click());
  translationOcrInput.addEventListener('change', handleTranslationOcr);

  // 新增：监听翻译模型选择变化，以控制OCR按钮的显示
  document.getElementById('translation-model-select').addEventListener('change', toggleOcrButtonVisibility);
  // 初始加载时也调用一次，以设置正确的初始状态
  toggleOcrButtonVisibility();
  
  // 复制按钮事件
  document.getElementById('translation-copy-button').addEventListener('click', () => {
    const outputText = document.getElementById('translation-output-text').textContent;
    navigator.clipboard.writeText(outputText).then(() => {
      logMessage('翻译结果已复制', 'system');
    }).catch(err => {
      logMessage('复制失败: ' + err, 'system');
    });
  });
  
  // 模式切换事件
  translationModeBtn.addEventListener('click', () => {
    translationContainer.classList.add('active');
    chatContainer.classList.remove('active');
    if (visionContainer) visionContainer.classList.remove('active'); // 新增：隐藏视觉容器
    logContainer.classList.remove('active'); // 隐藏日志容器
    
    // 隐藏聊天模式特有的元素
    if (mediaPreviewsContainer) mediaPreviewsContainer.style.display = 'none';
    if (inputArea) inputArea.style.display = 'none';

    translationModeBtn.classList.add('active');
    chatModeBtn.classList.remove('active');
    if (visionModeBtn) visionModeBtn.classList.remove('active'); // 新增：取消视觉按钮激活
    
    // 确保停止所有媒体流
    if (videoManager) stopVideo();
    if (screenRecorder) stopScreenSharing();
    // 翻译模式下显示语音输入按钮
    if (DOM.translationVoiceInputButton) DOM.translationVoiceInputButton.style.display = 'inline-flex'; // 使用 inline-flex 保持 Material Symbols 的对齐
    // 翻译模式下隐藏聊天语音输入按钮
    if (chatVoiceInputButton) chatVoiceInputButton.style.display = 'none';
  });
  
  chatModeBtn.addEventListener('click', () => {
    translationContainer.classList.remove('active');
    chatContainer.classList.add('active');
    if (visionContainer) visionContainer.classList.remove('active'); // 新增：隐藏视觉容器
    logContainer.classList.remove('active'); // 确保日志容器在聊天模式下也隐藏
    
    // 恢复聊天模式特有的元素显示
    updateMediaPreviewsDisplay(isScreenSharing);
    if (inputArea) inputArea.style.display = 'flex'; // 恢复输入区域显示

    translationModeBtn.classList.remove('active');
    chatModeBtn.classList.add('active');
    if (visionModeBtn) visionModeBtn.classList.remove('active'); // 新增：取消视觉按钮激活
    
    // 激活文字聊天子标签页
    document.querySelector('.tab[data-mode="text"]').click();

    // 聊天模式下隐藏翻译语音输入按钮
    if (DOM.translationVoiceInputButton) DOM.translationVoiceInputButton.style.display = 'none';
    // 聊天模式下显示聊天语音输入按钮
    if (chatVoiceInputButton) chatVoiceInputButton.style.display = 'inline-flex';
  });

  // 确保日志按钮也能正确切换模式
  document.getElementById('toggle-log').addEventListener('click', () => {
    translationContainer.classList.remove('active');
    chatContainer.classList.remove('active');
    if (visionContainer) visionContainer.classList.remove('active'); // 新增：隐藏视觉容器
    logContainer.classList.add('active');
    
    // 隐藏聊天模式特有的元素
    if (mediaPreviewsContainer) mediaPreviewsContainer.style.display = 'none';
    if (inputArea) inputArea.style.display = 'none';

    translationModeBtn.classList.remove('active');
    chatModeBtn.classList.remove('active'); // 确保聊天按钮也取消激活
    if (visionModeBtn) visionModeBtn.classList.remove('active'); // 新增：取消视觉按钮激活
    // 媒体流停止
    if (videoManager) stopVideo();
    if (screenRecorder) stopScreenSharing();

    // 日志模式下隐藏语音输入按钮
    if (DOM.translationVoiceInputButton) DOM.translationVoiceInputButton.style.display = 'none';
    // 日志模式下隐藏聊天语音输入按钮
    if (chatVoiceInputButton) chatVoiceInputButton.style.display = 'none';
  });

  // 新增：视觉模式切换事件
  if (visionModeBtn) {
    visionModeBtn.addEventListener('click', () => {
      if (visionContainer) visionContainer.classList.add('active');
      translationContainer.classList.remove('active');
      chatContainer.classList.remove('active');
      logContainer.classList.remove('active');

      // 隐藏其他模式的特定UI
      if (mediaPreviewsContainer) mediaPreviewsContainer.style.display = 'none';
      if (inputArea) inputArea.style.display = 'none';
      if (DOM.translationVoiceInputButton) DOM.translationVoiceInputButton.style.display = 'none';
      if (chatVoiceInputButton) chatVoiceInputButton.style.display = 'none';

      visionModeBtn.classList.add('active');
      translationModeBtn.classList.remove('active');
      chatModeBtn.classList.remove('active');

      // 确保停止所有媒体流
      if (videoManager) stopVideo();
      if (screenRecorder) stopScreenSharing();
    });
  }

  // 翻译模式语音输入按钮事件监听
  if (DOM.translationVoiceInputButton) {
    // 鼠标事件
    DOM.translationVoiceInputButton.addEventListener('mousedown', startTranslationRecording);
    DOM.translationVoiceInputButton.addEventListener('mouseup', stopTranslationRecording);
    DOM.translationVoiceInputButton.addEventListener('mouseleave', () => {
      if (isTranslationAudioRecording()) {
        cancelTranslationRecording();
      }
    });

    // 触摸事件
    DOM.translationVoiceInputButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      translationInitialTouchY = e.touches[0].clientY;
      startTranslationRecording();
    });
    DOM.translationVoiceInputButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      stopTranslationRecording();
    });
    DOM.translationVoiceInputButton.addEventListener('touchmove', (e) => {
      if (isTranslationAudioRecording()) {
        const currentTouchY = e.touches[0].clientY;
        if (translationInitialTouchY - currentTouchY > 50) {
          cancelTranslationRecording();
        }
      }
    });
  }

  // 聊天模式语音输入按钮事件监听
  if (chatVoiceInputButton) {
    // 鼠标事件
    chatVoiceInputButton.addEventListener('mousedown', startChatRecording);
    chatVoiceInputButton.addEventListener('mouseup', stopChatRecording);
    chatVoiceInputButton.addEventListener('mouseleave', (e) => {
      // 如果鼠标在按住时移出按钮区域，也视为取消
      if (isChatRecording) {
        cancelChatRecording();
      }
    });

    // 触摸事件
    chatVoiceInputButton.addEventListener('touchstart', (e) => {
      e.preventDefault(); // 阻止默认的触摸行为，如滚动
      chatInitialTouchY = e.touches[0].clientY; // 记录初始Y坐标
      startChatRecording();
    });
    chatVoiceInputButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      stopChatRecording();
    });
    chatVoiceInputButton.addEventListener('touchmove', (e) => {
      if (isChatRecording) {
        const currentTouchY = e.touches[0].clientY;
        // 如果手指上滑超过一定距离，视为取消
        if (chatInitialTouchY - currentTouchY > 50) { // 50px 阈值
          cancelChatRecording();
        }
      }
    });
  }

  // 监听 Esc 键取消录音
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isTranslationAudioRecording()) {
      cancelTranslationRecording();
    } else if (e.key === 'Escape' && isChatRecording) { // 新增：聊天模式下按 Esc 取消录音
      cancelChatRecording();
    }
  });

  // 初始设置聊天模式下语音输入按钮的显示状态
  // 默认激活文字聊天模式，所以这里应该显示
  if (chatVoiceInputButton) {
    // 检查当前激活的模式，如果不是聊天模式，则隐藏
    const currentActiveModeTab = document.querySelector('.mode-tabs .tab.active');
    if (currentActiveModeTab && currentActiveModeTab.dataset.mode === 'text') {
      chatVoiceInputButton.style.display = 'inline-flex';
    } else {
      chatVoiceInputButton.style.display = 'none';
    }
  }
} // 闭合 initTranslation 函数


/**
 * @function startChatRecording
 * @description 开始聊天模式下的语音录音。
 * @returns {Promise<void>}
 */
async function startChatRecording() {
  if (isChatRecording) return;

  // 首次点击，只请求权限
  if (!hasRequestedChatMicPermission) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      hasRequestedChatMicPermission = true;
      showToast('已获取麦克风权限，请再次点击开始录音');
      return;
    } catch (error) {
      showSystemMessage(`获取麦克风权限失败: ${error.message}`);
      console.error('获取麦克风权限失败:', error);
      resetChatRecordingState();
      hasRequestedChatMicPermission = false;
      return;
    }
  }

  // 权限已请求过，现在开始录音
  try {
    showToast('录音已开始...');
    chatVoiceInputButton.classList.add('recording'); // 使用新的 CSS 类
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
    }, 60 * 1000);

  } catch (error) {
    showSystemMessage(`启动录音失败: ${error.message}`);
    console.error('启动录音失败:', error);
    resetChatRecordingState();
    hasRequestedChatMicPermission = false;
  }
}

/**
 * @function stopChatRecording
 * @description 停止聊天模式下的语音录音并发送进行转文字。
 * @returns {Promise<void>}
 */
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

    const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);

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
    console.error('语音转文字失败:', error);
  } finally {
    resetChatRecordingState();
    // 不重置权限状态，以便用户可以连续录音
    // hasRequestedChatMicPermission = false;
  }
}

/**
 * @function cancelChatRecording
 * @description 取消聊天模式下的语音录音。
 * @returns {void}
 */
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

/**
 * @function resetChatRecordingState
 * @description 重置聊天模式录音相关的状态。
 * @returns {void}
 */
function resetChatRecordingState() {
  isChatRecording = false;
  chatVoiceInputButton.classList.remove('recording');
  messageInput.placeholder = '输入消息...';
}



/**
 * 显示一个 Toast 轻提示。
 * @param {string} message - 要显示的消息。
 * @param {number} [duration=3000] - 显示时长（毫秒）。
 */
export function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;

    container.appendChild(toast);

    // 触发显示动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 在指定时长后移除
    setTimeout(() => {
        toast.classList.remove('show');
        // 在动画结束后从 DOM 中移除
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, duration);
}

/**
 * 在聊天记录区显示一条系统消息。
 * @param {string} message - 要显示的消息。
 */
export function showSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system-info'); // 使用一个特殊的类

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.textContent = message;

    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    scrollToBottom();
}


/**
 * @function initializePromptSelect
 * @description 初始化指令模式下拉菜单，填充选项并设置事件监听器。
 */
function initializePromptSelect() {
    if (!DOM.promptSelect) return;

    // 1. 清空现有选项
    DOM.promptSelect.innerHTML = '';

    // 2. 从配置填充选项
    CONFIG.PROMPT_OPTIONS.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.displayName;
        DOM.promptSelect.appendChild(optionElement);
    });

    // 3. 设置默认值并更新文本域
    const savedPromptId = localStorage.getItem('selected_prompt_id') || CONFIG.DEFAULT_PROMPT_ID;
    DOM.promptSelect.value = savedPromptId;
    updateSystemInstruction();


    // 4. 添加事件监听器
    DOM.promptSelect.addEventListener('change', () => {
        updateSystemInstruction();
        // 保存用户的选择
        localStorage.setItem('selected_prompt_id', DOM.promptSelect.value);
    });
}


/**
 * @function updateSystemInstruction
 * @description 根据下拉菜单的当前选择，更新隐藏的 system-instruction 文本域的值。
 */
function updateSystemInstruction() {
    if (!DOM.promptSelect || !systemInstructionInput) return;

    const selectedId = DOM.promptSelect.value;
    const selectedOption = CONFIG.PROMPT_OPTIONS.find(option => option.id === selectedId);

    if (selectedOption) {
        systemInstructionInput.value = selectedOption.prompt;
        // (可选) 如果需要，也可以更新 CONFIG 对象，但这通常在连接时才需要
        // CONFIG.SYSTEM_INSTRUCTION.TEXT = selectedOption.prompt;
        logMessage(`指令模式已切换为: ${selectedOption.displayName}`, 'system');
    }
}
