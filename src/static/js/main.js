import { AttachmentManager } from './attachments/file-attachment.js'; // T2 新增
import { AudioRecorder } from './audio/audio-recorder.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { ChatAPI } from './chat/chat-api.js'; // <--- 添加这一行
import { CONFIG } from './config/config.js';
import { initializePromptSelect } from './config/prompt-manager.js';
import { MultimodalLiveClient } from './core/websocket-client.js';
import { HistoryManager } from './history/history-manager.js';
import { ScreenHandler } from './media/screen-handlers.js'; // T4: 导入 ScreenHandler
import { VideoHandler } from './media/video-handlers.js'; // T3: 导入 VideoHandler
import { ToolManager } from './tools/tool-manager.js'; // 确保导入 ToolManager
import { initializeTranslationCore } from './translation/translation-core.js';
import { Logger } from './utils/logger.js';
import { initializeVisionCore } from './vision/vision-core.js'; // T8: 新增

/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI, audio, video, and WebSocket interactions.
 */

// DOM Elements
const logsContainer = document.getElementById('logs-container'); // 用于原始日志输出
const toolManager = new ToolManager(); // 初始化 ToolManager
const messageHistory = document.getElementById('message-history'); // 用于聊天消息显示
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const _audioVisualizer = document.getElementById('audio-visualizer'); // 保持，虽然音频模式删除，但可能用于其他音频可视化
const connectButton = document.getElementById('connect-button');
const cameraButton = document.getElementById('camera-button');
const stopVideoButton = document.getElementById('stop-video'); // 使用正确的ID
const screenButton = document.getElementById('screen-button');
const screenContainer = document.getElementById('screen-preview-container'); // 更新 ID
const screenPreview = document.getElementById('screen-preview-element'); // 更新 ID
const _inputAudioVisualizer = document.getElementById('input-audio-visualizer'); // 保持，可能用于输入音频可视化
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const fpsInput = document.getElementById('fps-input');
const configToggle = document.getElementById('toggle-config');
const configContainer = document.querySelector('.control-panel');
const promptSelect = document.getElementById('prompt-select');
const systemInstructionInput = document.getElementById('system-instruction');
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const mobileConnectButton = document.getElementById('mobile-connect');
const interruptButton = document.getElementById('interrupt-button'); // 新增
const newChatButton = document.getElementById('new-chat-button'); // 新增

// 新增的 DOM 元素
const chatModeBtn = document.getElementById('chat-mode-button');
const themeToggleBtn = document.getElementById('theme-toggle');
const toggleLogBtn = document.getElementById('toggle-log');
const _logPanel = document.querySelector('.chat-container.log-mode');
const clearLogsBtn = document.getElementById('clear-logs');
const modeTabs = document.querySelectorAll('.mode-tabs .tab');
const chatContainers = document.querySelectorAll('.chat-container');
const historyContent = document.getElementById('history-list-container'); // 新增：历史记录面板

// 新增媒体预览相关 DOM 元素
const mediaPreviewsContainer = document.getElementById('media-previews');
const videoPreviewContainer = document.getElementById('video-container'); // 对应 video-manager.js 中的 video-container
const videoPreviewElement = document.getElementById('preview'); // 对应 video-manager.js 中的 preview
const stopScreenButton = document.getElementById('stop-screen-button'); // 确保 ID 正确

// 附件相关 DOM 元素
const attachmentButton = document.getElementById('attachment-button');
const fileInput = document.getElementById('file-input');


// 附件预览 DOM 元素
const fileAttachmentPreviews = document.getElementById('file-attachment-previews');

// 翻译模式相关 DOM 元素
const translationVoiceInputButton = document.getElementById('translation-voice-input-button'); // 新增
const translationInputTextarea = document.getElementById('translation-input-text'); // 新增
// 新增：聊天模式语音输入相关 DOM 元素
const chatVoiceInputButton = document.getElementById('chat-voice-input-button');

// 新增：翻译OCR相关 DOM 元素
const translationOcrButton = document.getElementById('translation-ocr-button');
const translationOcrInput = document.getElementById('translation-ocr-input');

// 视觉模型相关 DOM 元素
const visionModeBtn = document.getElementById('vision-mode-button');
const visionContainer = document.querySelector('.vision-container');
const visionMessageHistory = document.getElementById('vision-message-history');
const visionAttachmentPreviews = document.getElementById('vision-attachment-previews');
const visionInputText = document.getElementById('vision-input-text');
const visionAttachmentButton = document.getElementById('vision-attachment-button');
const visionFileInput = document.getElementById('vision-file-input');
const visionSendButton = document.getElementById('vision-send-button');

// T3: 确保 flipCameraButton 存在
const flipCameraButton = document.getElementById('flip-camera');


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

            // 只有当当前激活的顶层模式是聊天模式时，才移除视觉模式的激活状态
            // 这样可以确保在视觉模式下切换子标签时不会丢失顶层激活状态
            if (visionContainer && visionContainer.classList.contains('active') && 
                (mode === 'log' || mode === 'history') && 
                chatModeBtn.classList.contains('active')) {
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
                // 检查当前激活的顶层模式
                const isChatMode = chatModeBtn.classList.contains('active');
                const isTranslationMode = document.querySelector('.translation-container')?.classList.contains('active');
                const isVisionMode = visionContainer?.classList.contains('active');
                
                // 只有在聊天模式下才显示历史记录，其他模式显示占位符
                if (!isChatMode) {
                     historyContent.innerHTML = '<p class="empty-history">当前模式暂不支持历史记录功能。</p>';
                } else {
                    historyManager.renderHistoryList();
                }
            }

            // 处理系统日志或历史记录显示时隐藏其他模式的主功能区
            if (mode === 'log' || mode === 'history') {
                // 检查当前激活的顶层模式
                const isTranslationMode = document.querySelector('.translation-container')?.classList.contains('active');
                const isVisionMode = visionContainer?.classList.contains('active');
                
                // 在翻译或视觉模式下显示系统日志或历史记录时，隐藏对应的主功能区
                if (isTranslationMode) {
                    document.querySelector('.translation-container').style.display = 'none';
                }
                if (isVisionMode) {
                    visionContainer.style.display = 'none';
                }
            } else {
                // 切换到其他模式时，确保显示主功能区
                const translationContainer = document.querySelector('.translation-container');
                if (translationContainer) {
                    translationContainer.style.display = '';
                }
                if (visionContainer) {
                    visionContainer.style.display = '';
                }
            }

            // 确保在切换模式时停止所有媒体流
            if (videoHandler && videoHandler.getIsVideoActive()) { // T3: 使用 videoHandler 停止视频
                videoHandler.stopVideo();
            }
            if (screenHandler && screenHandler.getIsScreenActive()) { // T4: 使用 screenHandler 停止屏幕共享
                screenHandler.stopScreenSharing();
            }
            // 媒体预览容器的显示由 isVideoActive 或 isScreenSharing 状态控制
            updateMediaPreviewsDisplay();
        });
    });

    // 默认激活文字聊天模式
    document.querySelector('.tab[data-mode="text"]').click();

    // 3. 日志显示控制逻辑
    toggleLogBtn.addEventListener('click', () => {
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
   // T2: 初始化附件管理器
   attachmentManager = new AttachmentManager({ // T2: 初始化全局变量
       chatPreviewsContainer: fileAttachmentPreviews,
       visionPreviewsContainer: visionAttachmentPreviews,
       showToast: showToast,
       showSystemMessage: showSystemMessage
   });

   // 附件按钮事件监听 (只绑定一次)
   attachmentButton.addEventListener('click', () => fileInput.click());
   fileInput.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'chat'));
 
 
   // T10: 初始化 HistoryManager
   historyManager = new HistoryManager({
       elements: {
           historyContent: historyContent,
       },
       updateChatUI: (sessionData) => {
           messageHistory.innerHTML = '';
           sessionData.messages.forEach(message => {
               if (message.role === 'user') {
                   const textPart = message.content.find(p => p.type === 'text')?.text || '';
                   const imagePart = message.content.find(p => p.type === 'image_url');
                   const file = imagePart ? { base64: imagePart.image_url.url, name: 'Loaded Image' } : null;
                   displayUserMessage(textPart, file);
               } else if (message.role === 'assistant') {
                   const aiMessage = createAIMessageElement();
                   aiMessage.rawMarkdownBuffer = message.content;
                   aiMessage.markdownContainer.innerHTML = marked.parse(message.content);
                   if (typeof MathJax !== 'undefined' && MathJax.startup) {
                       MathJax.startup.promise.then(() => {
                           MathJax.typeset([aiMessage.markdownContainer]);
                       }).catch((err) => console.error('MathJax typesetting failed:', err));
                   }
               }
           });
       },
       getChatHistory: () => chatHistory,
       setChatHistory: (newHistory) => { chatHistory = newHistory; },
       getCurrentSessionId: () => currentSessionId,
       setCurrentSessionId: (newId) => { currentSessionId = newId; },
       showToast: showToast,
       showSystemMessage: showSystemMessage,
       logMessage: logMessage,
   });
   historyManager.init(); // 初始化并渲染历史列表

   // T4: 初始化 ScreenHandler
   screenHandler = new ScreenHandler({
       elements: {
           screenButton: screenButton,
           stopScreenButton: stopScreenButton,
           fpsInput: fpsInput,
           mediaPreviewsContainer: mediaPreviewsContainer,
           screenContainer: screenContainer,
           screenPreview: screenPreview,
       },
       isConnected: () => isConnected, // 传递 isConnected 状态
       client: client, // 传递 WebSocket 客户端实例
       updateMediaPreviewsDisplay: updateMediaPreviewsDisplay, // 传递更新函数
       logMessage: logMessage, // 传递日志函数
       getSelectedModelConfig: () => selectedModelConfig, // 传递获取模型配置的函数
   });

   // T3: 初始化 VideoHandler
   videoHandler = new VideoHandler({
       elements: {
           cameraButton: cameraButton,
           stopVideoButton: stopVideoButton,
           flipCameraButton: flipCameraButton, // 确保传递翻转按钮
           fpsInput: fpsInput,
           mediaPreviewsContainer: mediaPreviewsContainer,
           videoPreviewContainer: videoPreviewContainer,
           videoPreviewElement: videoPreviewElement,
       },
       isConnected: () => isConnected, // 传递 isConnected 状态
       client: client, // 传递 WebSocket 客户端实例
       updateMediaPreviewsDisplay: updateMediaPreviewsDisplay, // 传递更新函数
       logMessage: logMessage, // 传递日志函数
       getSelectedModelConfig: () => selectedModelConfig, // 传递获取模型配置的函数
   });

    // 初始化翻译功能
    const translationElements = {
        translationModeBtn: document.getElementById('translation-mode-button'),
        chatModeBtn: document.getElementById('chat-mode-button'),
        visionModeBtn: document.getElementById('vision-mode-button'),
        toggleLogBtn: document.getElementById('toggle-log'),
        translationContainer: document.querySelector('.translation-container'),
        chatContainer: document.querySelector('.chat-container.text-mode'),
        visionContainer: document.querySelector('.vision-container'),
        logContainer: document.querySelector('.chat-container.log-mode'),
        inputArea: document.querySelector('.input-area'),
        mediaPreviewsContainer: document.getElementById('media-previews'),
        inputLangSelect: document.getElementById('translation-input-language-select'),
        outputLangSelect: document.getElementById('translation-output-language-select'),
        translationModelSelect: document.getElementById('translation-model-select'),
        translateButton: document.getElementById('translate-button'),
        translationOcrButton: document.getElementById('translation-ocr-button'),
        translationOcrInput: document.getElementById('translation-ocr-input'),
        copyButton: document.getElementById('translation-copy-button'),
        outputText: document.getElementById('translation-output-text'),
        translationVoiceInputButton: document.getElementById('translation-voice-input-button'),
        translationInputTextarea: document.getElementById('translation-input-text'),
    };
    const mediaHandlers = {
        videoHandler,
        screenHandler,
        updateMediaPreviewsDisplay
    };
    initializeTranslationCore(translationElements, mediaHandlers, {
        isTranslationRecording,
        startTranslationRecording,
        stopTranslationRecording,
        cancelTranslationRecording,
        resetRecordingState
    }, showToast);
    // T8: 初始化视觉功能
    const visionElements = {
        visionModelSelect: document.getElementById('vision-model-select'),
        visionSendButton: document.getElementById('vision-send-button'),
        visionAttachmentButton: document.getElementById('vision-attachment-button'),
        visionFileInput: document.getElementById('vision-file-input'),
        visionInputText: document.getElementById('vision-input-text'),
        visionMessageHistory: document.getElementById('vision-message-history'),
    };
    const visionHandlers = {
        showToast: showToast,
    };
    initializeVisionCore(visionElements, attachmentManager, visionHandlers);
   // 初始化指令模式选择
   initializePromptSelect(promptSelect, systemInstructionInput);
 
    // 实例化 ChatAPI 并注入依赖  <--- 添加或修改此代码块
    chatApi = new ChatAPI({
        client: client,
        toolManager: toolManager,
        callbacks: {
            logMessage,
            createAIMessageElement,
            displayAudioMessage,
            pcmToWavBlob,
            scrollToBottom,
            ensureAudioInitialized,
            getAudioSampleRate: () => CONFIG.AUDIO.OUTPUT_SAMPLE_RATE,
            historyManager,
            audioStreamer,
            showSystemMessage,
            updateConnectionStatus, // 确保传递
            resetUIForDisconnectedState, // 确保传递
        },
        stateGetters: {
            getChatHistory: () => chatHistory,
            getCurrentSessionId: () => currentSessionId,
            getSelectedModelConfig: () => selectedModelConfig,
            getSystemInstruction: () => systemInstructionInput.value,
            getApiKey: () => apiKeyInput.value,
            isConnected: () => isConnected,
        },
        stateUpdaters: {
            updateChatHistory: (newHistory) => { chatHistory = newHistory; },
            resetCurrentAIMessage: () => { currentAIMessageContentDiv = null; },
            setIsConnected: (status) => { isConnected = status; }, // 新增
            setCurrentSessionId: (newId) => { currentSessionId = newId; }, // 新增
        }
    });
   });

// State variables
let isRecording = false;
let audioStreamer = null;
let audioCtx = null;
let isConnected = false;
let audioRecorder = null;
let micStream = null; // 新增：用于保存麦克风流
let isUsingTool = false;
let isUserScrolling = false; // 新增：用于判断用户是否正在手动滚动
let audioDataBuffer = []; // 新增：用于累积AI返回的PCM音频数据
let currentAudioElement = null; // 新增：用于跟踪当前播放的音频元素，确保单例播放
let chatHistory = []; // 用于存储聊天历史
let currentSessionId = null; // 用于存储当前会话ID
// 新增：聊天模式语音输入相关状态变量
let isChatRecording = false; // 聊天模式下是否正在录音
let hasRequestedChatMicPermission = false; // 标记是否已请求过聊天麦克风权限
let chatAudioRecorder = null; // 聊天模式下的 AudioRecorder 实例
let chatAudioChunks = []; // 聊天模式下录制的音频数据块
let chatRecordingTimeout = null; // 聊天模式下用于处理长按录音的定时器
let chatInitialTouchY = 0; // 聊天模式下用于判断手指上滑取消
let attachmentManager = null; // T2: 提升作用域
let historyManager = null; // T10: 提升作用域
let videoHandler = null; // T3: 新增 VideoHandler 实例
let screenHandler = null; // T4: 新增 ScreenHandler 实例
let chatApi = null; // 新增 ChatAPI 实例

/**
 * @fileoverview Manages audio recording for the translation feature.
 */

let translationAudioRecorder = null;
let translationAudioChunks = [];
let recordingTimeout = null;
let _isTranslationRecording = false;
let hasRequestedMicPermission = false;

/**
 * Checks if translation recording is currently active.
 * @returns {boolean} True if recording is active, false otherwise.
 */
function isTranslationRecording() {
    return _isTranslationRecording;
}


/**
 * Starts the audio recording for translation.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @returns {Promise<void>}
 */
async function startTranslationRecording(elements) {
    if (_isTranslationRecording) return;

    if (!hasRequestedMicPermission) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasRequestedMicPermission = true;
            logMessage('已获取麦克风权限，请再次长按开始录音。', 'system');
            return;
        } catch (error) {
            logMessage(`获取麦克风权限失败: ${error.message}`, 'system');
            console.error('获取麦克风权限失败:', error);
            resetRecordingState(elements);
            hasRequestedMicPermission = false;
            return;
        }
    }

    try {
        logMessage('开始录音...', 'system');
        elements.voiceInputButton.classList.add('recording-active');
        elements.inputTextarea.placeholder = '正在录音，请说话...';
        elements.inputTextarea.value = '';

        translationAudioChunks = [];
        translationAudioRecorder = new AudioRecorder();

        await translationAudioRecorder.start((chunk) => {
            translationAudioChunks.push(chunk);
        }, { returnRaw: true });

        _isTranslationRecording = true;

        recordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                logMessage('录音超时，自动停止', 'system');
                stopTranslationRecording(elements);
            }
        }, 60000); // 60 seconds timeout

    } catch (error) {
        logMessage(`启动录音失败: ${error.message}`, 'system');
        console.error('启动录音失败:', error);
        resetRecordingState(elements);
        hasRequestedMicPermission = false;
    }
}

/**
 * Stops the audio recording and processes the audio data.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @returns {Promise<void>}
 */
async function stopTranslationRecording(elements) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    logMessage('停止录音，正在处理...', 'system');
    elements.inputTextarea.placeholder = '正在处理语音...';

    try {
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
        }

        if (translationAudioChunks.length === 0) {
            logMessage('没有录到音频', 'system');
            resetRecordingState(elements);
            return;
        }

        const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of translationAudioChunks) {
            mergedAudioData.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        translationAudioChunks = [];

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
        elements.inputTextarea.value = result.text || '未获取到转录文本。';
        logMessage('语音转文字成功', 'system');

    } catch (error) {
        logMessage(`语音转文字失败: ${error.message}`, 'system');
        console.error('语音转文字失败:', error);
        elements.inputTextarea.placeholder = '语音转文字失败，请重试。';
    } finally {
        resetRecordingState(elements);
    }
}

/**
 * Cancels the current audio recording.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 */
function cancelTranslationRecording(elements) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    logMessage('录音已取消', 'system');

    if (translationAudioRecorder) {
        translationAudioRecorder.stop();
        translationAudioRecorder = null;
    }
    translationAudioChunks = [];
    resetRecordingState(elements);
    elements.inputTextarea.placeholder = '输入要翻译的内容...';
}

/**
 * Resets the recording state and UI elements.
 * @param {object} elements - DOM elements to reset.
 */
function resetRecordingState(elements) {
    _isTranslationRecording = false;
    elements.voiceInputButton.classList.remove('recording-active');
}

/**
 * 将PCM数据转换为WAV Blob。
 * @param {Uint8Array[]} pcmDataBuffers - 包含PCM数据的Uint8Array数组。
 * @param {number} sampleRate - 采样率 (例如 24000)。
 * @returns {Blob} WAV格式的Blob。
 */
function pcmToWavBlob(pcmDataBuffers, sampleRate = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE) { // 确保使用配置中的输出采样率
    let dataLength = 0;
    for (const buffer of pcmDataBuffers) {
        dataLength += buffer.length;
    }

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF'); // RIFF identifier
    view.setUint32(4, 36 + dataLength, true); // file length
    writeString(view, 8, 'WAVE'); // RIFF type
    writeString(view, 12, 'fmt '); // format chunk identifier
    view.setUint32(16, 16, true); // format chunk length
    view.setUint16(20, 1, true); // sample format (1 = PCM)
    view.setUint16(22, 1, true); // num channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * numChannels * bytesPerSample)
    view.setUint16(32, 2, true); // block align (numChannels * bytesPerSample)
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data'); // data chunk identifier
    view.setUint32(40, dataLength, true); // data length

    // Write PCM data
    let offset = 44;
    for (const pcmBuffer of pcmDataBuffers) {
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setUint8(offset + i, pcmBuffer[i]);
        }
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}

// Multimodal Client
const client = new MultimodalLiveClient();

// State variables
let selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME); // 初始选中默认模型


/**
 * 格式化秒数为 MM:SS 格式。
 * @param {number} seconds - 总秒数。
 * @returns {string} 格式化后的时间字符串。
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

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
 * 创建并添加一个新的 AI 消息元素到聊天历史。
 * @returns {object} 包含对新创建元素的引用的对象。
 */
function createAIMessageElement() {
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
    copyButton.classList.add('copy-button', 'material-symbols-outlined');
    copyButton.textContent = 'content_copy';

    copyButton.addEventListener('click', async () => {
        try {
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.textContent = 'check';
            setTimeout(() => { copyButton.textContent = 'content_copy'; }, 2000);
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
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: ''
    };
}

/**
 * 在聊天历史中显示用户的多模态消息。
 * @param {string} text - 文本消息内容。
 * @param {object|null} file - 附加的文件对象，包含 base64 等信息。
 */
function displayUserMessage(text, file) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '👤';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    // 如果有文本，则添加文本内容
    if (text) {
        const textNode = document.createElement('p');
        // 为了安全，纯文本使用 textContent
        textNode.textContent = text;
        contentDiv.appendChild(textNode);
    }

    // 如果有文件，则添加图片预览
    if (file && file.base64) {
        const img = document.createElement('img');
        img.src = file.base64;
        img.alt = file.name || 'Attached Image';
        img.style.maxWidth = '200px';
        img.style.maxHeight = '200px';
        img.style.borderRadius = '8px';
        img.style.marginTop = text ? '10px' : '0';
        contentDiv.appendChild(img);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * 在聊天历史中显示语音消息。
 * @param {string} audioUrl - 语音文件的URL。
 * @param {number} duration - 语音时长（秒）。
 * @param {string} type - 消息类型 ('user' 或 'ai')。
 */
function displayAudioMessage(audioUrl, duration, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = type === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content', 'audio-content'); // 添加 audio-content 类

    const audioPlayerDiv = document.createElement('div');
    audioPlayerDiv.classList.add('audio-player');

    const playButton = document.createElement('button');
    playButton.classList.add('audio-play-button', 'material-icons');
    playButton.textContent = 'play_arrow'; // 默认播放图标

    const audioWaveform = document.createElement('div');
    audioWaveform.classList.add('audio-waveform');

    const audioProgressBar = document.createElement('div');
    audioProgressBar.classList.add('audio-progress-bar');
    audioWaveform.appendChild(audioProgressBar);

    const audioDurationSpan = document.createElement('span');
    audioDurationSpan.classList.add('audio-duration');
    audioDurationSpan.textContent = formatTime(duration);

    const downloadButton = document.createElement('a');
    downloadButton.classList.add('audio-download-button', 'material-icons');
    downloadButton.textContent = 'download';
    downloadButton.download = `gemini_audio_${Date.now()}.wav`;
    downloadButton.href = audioUrl;

    const transcribeButton = document.createElement('button');
    transcribeButton.classList.add('audio-transcribe-button', 'material-icons');
    transcribeButton.textContent = 'text_fields'; // 转文字图标

    transcribeButton.addEventListener('click', async () => {
        // 禁用按钮防止重复点击
        transcribeButton.disabled = true;
        transcribeButton.textContent = 'hourglass_empty'; // 显示加载状态

        try {
            // 获取原始音频 Blob
            // 由于 audioUrl 是通过 URL.createObjectURL(audioBlob) 创建的，
            // 我们需要一种方式来获取原始的 Blob。
            // 最直接的方式是修改 displayAudioMessage 的调用，让它直接传递 Blob。
            // 但为了最小化改动，我们假设 audioUrl 对应的 Blob 仍然在内存中，
            // 或者我们可以重新 fetch 一次（但这不是最佳实践）。
            // 更好的方法是，在生成 audioUrl 的地方，同时保存 audioBlob。
            // 考虑到当前结构，我们假设 audioUrl 对应的 Blob 仍然有效，
            // 或者我们可以在这里重新获取一次，但更推荐的方式是传递原始 Blob。

            // 临时方案：重新 fetch audioUrl 获取 Blob。
            // 长期方案：修改 displayAudioMessage 的调用，直接传递 audioBlob。
            const audioBlobResponse = await fetch(audioUrl);
            if (!audioBlobResponse.ok) {
                throw new Error(`无法获取音频 Blob: ${audioBlobResponse.statusText}`);
            }
            const audioBlob = await audioBlobResponse.blob();

            // 发送转文字请求到 Worker，直接发送 Blob
            const response = await fetch('/api/transcribe-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': audioBlob.type, // 使用 Blob 的 MIME 类型
                },
                body: audioBlob, // 直接发送 Blob
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`转文字失败: ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            const transcriptionText = result.text || '未获取到转录文本。';

            const { markdownContainer } = createAIMessageElement();
            markdownContainer.innerHTML = marked.parse(transcriptionText);
            // 触发 MathJax 渲染 (如果需要)
            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => {
                    MathJax.typeset([markdownContainer]);
                }).catch((err) => console.error('MathJax typesetting failed:', err));
            }
            scrollToBottom();

            logMessage('语音转文字成功', 'system');
        } catch (error) {
            logMessage(`语音转文字失败: ${error.message}`, 'system');
            console.error('语音转文字失败:', error);
        } finally {
            transcribeButton.disabled = false; // 重新启用按钮
            transcribeButton.textContent = 'text_fields'; // 恢复图标
        }
    });

    const audioElement = new Audio(audioUrl);
    audioElement.preload = 'metadata'; // 预加载元数据以获取时长
    audioElement.playbackRate = 1.0; // 新增：确保播放速率为1.0

    playButton.addEventListener('click', () => {
        if (currentAudioElement && currentAudioElement !== audioElement) {
            // 暂停上一个播放的音频
            currentAudioElement.pause();
            const prevPlayButton = currentAudioElement.closest('.audio-player').querySelector('.audio-play-button');
            if (prevPlayButton) {
                prevPlayButton.textContent = 'play_arrow';
            }
        }

        if (audioElement.paused) {
            audioElement.play();
            playButton.textContent = 'pause';
            currentAudioElement = audioElement;
        } else {
            audioElement.pause();
            playButton.textContent = 'play_arrow';
            currentAudioElement = null;
        }
    });

    audioElement.addEventListener('timeupdate', () => {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        audioProgressBar.style.width = `${progress}%`;
        audioDurationSpan.textContent = formatTime(audioElement.currentTime); // 显示当前播放时间
    });

    audioElement.addEventListener('ended', () => {
        playButton.textContent = 'play_arrow';
        audioProgressBar.style.width = '0%';
        audioDurationSpan.textContent = formatTime(duration); // 播放结束后显示总时长
        currentAudioElement = null;
    });

    audioPlayerDiv.appendChild(playButton);
    audioPlayerDiv.appendChild(audioWaveform);
    audioPlayerDiv.appendChild(audioDurationSpan);
    audioPlayerDiv.appendChild(downloadButton); // 添加下载按钮
    audioPlayerDiv.appendChild(transcribeButton); // 添加转文字按钮
    contentDiv.appendChild(audioPlayerDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * Scrolls the message history to the bottom.
 * @returns {void}
 */
function scrollToBottom() {
    const messageHistory = document.getElementById('message-history');
    if (!messageHistory) return; // 安全检查

    // 使用 requestAnimationFrame 确保在浏览器下一次重绘前执行，提高平滑度
    requestAnimationFrame(() => {
        // 检查用户是否正在手动滚动
        if (typeof isUserScrolling !== 'boolean' || !isUserScrolling) {
            messageHistory.scrollTop = messageHistory.scrollHeight;
        }
    });
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


// 添加全局错误处理
globalThis.addEventListener('error', (event) => {
    logMessage(`系统错误: ${event.message}`, 'system');
});

sendButton.addEventListener('click', () => chatApi.handleSendMessage(attachmentManager));

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
            chatHistory.push({
                role: 'assistant',
                content: currentAIMessageContentDiv.rawMarkdownBuffer // AI文本消息统一为字符串
            });
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

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            event.preventDefault();
            chatApi.handleSendMessage(attachmentManager); // <--- 修改这里
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
 * 统一的连接函数。
 */
async function connect() {
    if (!apiKeyInput.value) {
        logMessage('请输入 API Key', 'system');
        return;
    }
    // 保存最新的配置到 localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);
    localStorage.setItem('video_fps', fpsInput.value);

    // 调用 ChatAPI 的 connect 方法
    await chatApi.connect();
}

/**
 * 统一的断开连接函数。
 */
function disconnect() {
    // 调用 ChatAPI 的 disconnect 方法
    chatApi.disconnect();
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
    if (videoHandler && videoHandler.getIsVideoActive()) { // T3: 使用 videoHandler 停止视频
        videoHandler.stopVideo();
    }
    if (screenHandler && screenHandler.getIsScreenActive()) { // T4: 使用 screenHandler 停止屏幕共享
        screenHandler.stopScreenSharing();
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
            // 摄像头按钮的禁用状态现在由 VideoHandler 内部管理，这里只处理其他按钮
            if (btn === cameraButton) {
                btn.disabled = !isConnected || !selectedModelConfig.isWebSocket;
            } else {
                btn.disabled = !isConnected || !selectedModelConfig.isWebSocket;
            }
        }
    });
    
    // 附件按钮仅在 HTTP 模式下可用
    if (attachmentButton) {
        attachmentButton.disabled = !isConnected || selectedModelConfig.isWebSocket;
    }
}

updateConnectionStatus(); // 初始更新连接状态

/**
 * Updates the display of media preview containers.
 */
function updateMediaPreviewsDisplay() {
    // 使用 videoHandler.getIsVideoActive() 获取摄像头状态
    const isVideoActiveNow = videoHandler ? videoHandler.getIsVideoActive() : false;

    if (isVideoActiveNow || (screenHandler && screenHandler.getIsScreenActive())) { // T4: 使用 screenHandler.getIsScreenActive()
        mediaPreviewsContainer.style.display = 'flex'; // 使用 flex 布局
        if (isVideoActiveNow) {
            videoPreviewContainer.style.display = 'block';
        } else {
            videoPreviewContainer.style.display = 'none';
        }
        if (screenHandler && screenHandler.getIsScreenActive()) { // T4: 使用 screenHandler.getIsScreenActive()
            screenContainer.style.display = 'block';
        } else {
            screenContainer.style.display = 'none';
        }
    } else {
        mediaPreviewsContainer.style.display = 'none';
    }
}





/**
 * Initializes mobile-specific event handlers.
 */
function initMobileHandlers() {

    // 新增：移动端麦克风按钮
    document.getElementById('mic-button').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected) handleMicToggle();
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
            historyManager.generateNewSession();
        } else {
            // 对于 WebSocket 模式或未连接时，保持原有简单重置逻辑
            chatHistory = [];
            currentSessionId = null;
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
