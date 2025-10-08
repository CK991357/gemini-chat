import { AttachmentManager } from './attachments/file-attachment.js'; // T2 新增
import { AudioRecorder } from './audio/audio-recorder.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { ChatApiHandler } from './chat/chat-api-handler.js';
import * as chatUI from './chat/chat-ui.js'; // T11: 导入聊天UI模块
import { initializeChessCore } from './chess/chess-core.js';
import { CONFIG } from './config/config.js';
import { initializePromptSelect } from './config/prompt-manager.js';
import { MultimodalLiveClient } from './core/websocket-client.js';
import { HistoryManager } from './history/history-manager.js';
import { initImageManager } from './image-gallery/image-manager.js'; // 导入 ImageManager 的初始化函数
import { ScreenHandler } from './media/screen-handlers.js'; // T4: 导入 ScreenHandler
import { VideoHandler } from './media/video-handlers.js'; // T3: 导入 VideoHandler
import { ToolManager } from './tools/tool-manager.js'; // 确保导入 ToolManager
import { initializeTranslationCore } from './translation/translation-core.js';
import { Logger } from './utils/logger.js';
import { displayVisionMessage, getVisionHistoryManager, initializeVisionCore } from './vision/vision-core.js'; // T8: 新增, 导入 displayVisionMessage

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
const videoPreviewContainer = document.getElementById('video-container'); // 对应 websocket/video/video-manager.js 中的 video-container
const videoPreviewElement = document.getElementById('preview'); // 对应 websocket/video/video-manager.js 中的 preview
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
    // 新增：初始化思维链开关
    const reasoningCheckbox = document.getElementById('enable-reasoning-checkbox');
    if (reasoningCheckbox) {
        // 1. 初始化
        const savedReasoningState = localStorage.getItem('geminiEnableReasoning') === 'true';
        reasoningCheckbox.checked = savedReasoningState;

        // 2. 监听变化并保存
        reasoningCheckbox.addEventListener('change', () => {
            localStorage.setItem('geminiEnableReasoning', reasoningCheckbox.checked);
            showToast(`Gemini 思维链已${reasoningCheckbox.checked ? '开启' : '关闭'}`);
        });
    }

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
        themeToggleBtn.innerHTML = savedTheme === 'dark-mode' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    } else {
        if (globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches) {
            body.classList.add('dark-mode');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            body.classList.add('light-mode');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    }

    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('theme', 'light-mode');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
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
                const isVisionMode = visionModeBtn.classList.contains('active');

                if (isChatMode) {
                    // 为聊天模式渲染历史记录
                    if (historyManager) {
                        historyManager.renderHistoryList();
                    }
                } else if (isVisionMode) {
                    // 为视觉/国际象棋模式渲染历史记录
                    const visionHistoryManager = getVisionHistoryManager();
                    if (visionHistoryManager) {
                        visionHistoryManager.renderHistoryList();
                    } else {
                        historyContent.innerHTML = '<p class="empty-history">视觉历史记录正在初始化...</p>';
                    }
                } else {
                    // 其他模式（如翻译）显示占位符
                    historyContent.innerHTML = '<p class="empty-history">当前模式暂不支持历史记录功能。</p>';
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
        chatUI.logMessage('日志已清空', 'system');
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
   fileInput.multiple = true; // 允许选择多个文件
   fileInput.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'chat'));
 
 
   // T10: 初始化 HistoryManager
   historyManager = new HistoryManager({
       mode: 'chat', // 明确指定模式为 'chat'
       elements: {
           historyContent: historyContent,
       },
       updateChatUI: (sessionData) => {
           messageHistory.innerHTML = '';
           sessionData.messages.forEach(message => {
               if (message.role === 'user') {
                   const textPart = message.content.find(p => p.type === 'text')?.text || '';
                   const filesToDisplay = [];

                   message.content.forEach(part => {
                       if (part.type === 'image_url') {
                           const imageUrl = part.image_url.url;
                           const mimeMatch = imageUrl.match(/^data:(.*?);base64,/);
                           const fileType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                           filesToDisplay.push({ base64: imageUrl, name: 'Loaded Image', type: fileType });
                       } else if (part.type === 'audio_url') {
                           const audioUrl = part.audio_url.url;
                           const mimeMatch = audioUrl.match(/^data:(.*?);base64,/);
                           const fileType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                           filesToDisplay.push({ base64: audioUrl, name: 'Loaded Audio', type: fileType });
                       } else if (part.type === 'pdf_url') {
                           const pdfUrl = part.pdf_url.url;
                           const mimeMatch = pdfUrl.match(/^data:(.*?);base64,/);
                           const fileType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                           filesToDisplay.push({ base64: pdfUrl, name: 'Loaded PDF', type: fileType });
                       }
                   });
                   chatUI.displayUserMessage(textPart, filesToDisplay);
               } else if (message.role === 'assistant') {
                   const aiMessage = chatUI.createAIMessageElement();
                   
                   // 渲染主要内容
                   aiMessage.rawMarkdownBuffer = message.content || '';
                   aiMessage.markdownContainer.innerHTML = marked.parse(aiMessage.rawMarkdownBuffer);

                   // 检查并渲染思维链
                   if (message.reasoning && message.reasoning.trim() !== '') {
                       aiMessage.rawReasoningBuffer = message.reasoning;
                       const reasoningContent = aiMessage.reasoningContainer.querySelector('.reasoning-content');
                       reasoningContent.innerHTML = message.reasoning.replace(/\n/g, '<br>');
                       aiMessage.reasoningContainer.style.display = 'block';
                       
                       // 在思维链和答案之间添加分隔线
                       const separator = document.createElement('hr');
                       separator.className = 'answer-separator';
                       aiMessage.markdownContainer.before(separator);
                   }

                   // 对两个容器都应用数学公式排版
                   if (typeof MathJax !== 'undefined' && MathJax.startup) {
                       MathJax.startup.promise.then(() => {
                           MathJax.typeset([aiMessage.markdownContainer, aiMessage.reasoningContainer]);
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
       logMessage: chatUI.logMessage,
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
       logMessage: chatUI.logMessage, // 传递日志函数
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
       logMessage: chatUI.logMessage, // 传递日志函数
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
    initializeTranslationCore(translationElements, mediaHandlers, showToast);
    // 视觉模型相关 DOM 元素 - 更新为新的结构
    const visionElements = {
        visionModelSelect: document.getElementById('vision-model-select'),
        visionPromptSelect: document.getElementById('vision-prompt-select'),
        visionSendButton: document.getElementById('vision-send-button'),
        visionSummaryButton: document.getElementById('vision-summary-button'),
        visionAttachmentButton: document.getElementById('vision-attachment-button'),
        visionFileInput: document.getElementById('vision-file-input'),
        visionInputText: document.getElementById('vision-input-text'),
        visionMessageHistory: document.getElementById('vision-message-history'),
        // 新增：切换按钮
        toggleToChessButton: document.getElementById('toggle-to-chess-button'),
        toggleToVisionButton: document.getElementById('toggle-to-vision-button')
    };

    // 定义 visionHandlers
    const visionHandlers = {
        showToast: showToast,
        showSystemMessage: showSystemMessage
    };

    // 初始化视觉功能
    initializeVisionCore(visionElements, attachmentManager, visionHandlers);
    
    // 建立象棋模块和视觉模块的通信桥梁
    window.displayVisionMessage = (message) => {
        // 调用 vision-core 中的显示函数
        if (typeof displayVisionMessage === 'function') {
            displayVisionMessage(message);
        }
    };
    
    // 初始化国际象棋 - 确保在所有DOM元素就绪后调用
    setTimeout(() => {
        initializeChessCore({
            showToast: showToast,
            displayVisionMessage: displayVisionMessage // 注入渲染函数
        });
        
        // 手动添加切换按钮事件监听器作为备份
        const toggleToChessBtn = document.getElementById('toggle-to-chess-button');
        const toggleToVisionBtn = document.getElementById('toggle-to-vision-button');
        
        if (toggleToChessBtn) {
            toggleToChessBtn.addEventListener('click', () => {
                const chessFullscreen = document.getElementById('chess-fullscreen');
                const visionChatFullscreen = document.getElementById('vision-chat-fullscreen');
                if (chessFullscreen && visionChatFullscreen) {
                    visionChatFullscreen.classList.remove('active');
                    chessFullscreen.classList.add('active');
                    console.log('Switched to chess view');
                }
            });
        }
        
        if (toggleToVisionBtn) {
            toggleToVisionBtn.addEventListener('click', () => {
                const chessFullscreen = document.getElementById('chess-fullscreen');
                const visionChatFullscreen = document.getElementById('vision-chat-fullscreen');
                if (chessFullscreen && visionChatFullscreen) {
                    chessFullscreen.classList.remove('active');
                    visionChatFullscreen.classList.add('active');
                    console.log('Switched to vision chat view');
                }
            });
        }
    }, 500);
   // 初始化指令模式选择
   initializePromptSelect(promptSelect, systemInstructionInput);

   // T11: 初始化聊天UI模块并注入依赖
   const transcribeAudioHandler = async (audioBlob, buttonElement) => {
       buttonElement.disabled = true;
       buttonElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
       try {
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
           const transcriptionText = result.text || '未获取到转录文本。';
           const { markdownContainer } = chatUI.createAIMessageElement();
           markdownContainer.innerHTML = marked.parse(transcriptionText);
           if (typeof MathJax !== 'undefined' && MathJax.startup) {
               MathJax.startup.promise.then(() => {
                   MathJax.typeset([markdownContainer]);
               }).catch((err) => console.error('MathJax typesetting failed:', err));
           }
           chatUI.scrollToBottom();
           chatUI.logMessage('语音转文字成功', 'system');
       } catch (error) {
           chatUI.logMessage(`语音转文字失败: ${error.message}`, 'system');
           console.error('语音转文字失败:', error);
       } finally {
           buttonElement.disabled = false;
           buttonElement.innerHTML = '<i class="fa-solid fa-file-alt"></i>';
       }
   };

   chatUI.initChatUI(
       { // 注入 DOM 元素
           messageHistory: document.getElementById('message-history'),
           logsContainer: document.getElementById('logs-container')
       },
       { // 注入处理器
           transcribeAudioHandler,
           formatTime,
           isUserScrolling: () => isUserScrolling
       },
       { // 注入库
           marked: window.marked,
           MathJax: window.MathJax
       }
   );
   // 初始化 ChatApiHandler
   chatApiHandler = new ChatApiHandler({
       toolManager: toolManager,
       historyManager: historyManager,
       state: {
           get chatHistory() { return chatHistory; },
           set chatHistory(value) { chatHistory = value; },
           get currentSessionId() { return currentSessionId; },
           set currentSessionId(value) { currentSessionId = value; },
           get currentAIMessageContentDiv() { return currentAIMessageContentDiv; },
           set currentAIMessageContentDiv(value) { currentAIMessageContentDiv = value; },
           get isUsingTool() { return isUsingTool; },
           set isUsingTool(value) { isUsingTool = value; }
       },
       libs: {
           marked: window.marked,
           MathJax: window.MathJax
       },
       config: CONFIG // 注入完整的配置对象
   });
    // 初始化 ImageManager (模态框)
    initImageManager();
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
let chatApiHandler = null; // 新增 ChatApiHandler 实例


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

// T11: All UI functions previously here have been successfully moved to src/static/js/chat/chat-ui.js

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
                chatUI.logMessage('麦克风权限被拒绝，请在浏览器设置中启用', 'system');
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
            chatUI.logMessage('Microphone started', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone error:', error);
            chatUI.logMessage(`Error: ${error.message}`, 'system');
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
            chatUI.logMessage('Microphone stopped', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone stop error:', error);
            chatUI.logMessage(`Error stopping microphone: ${error.message}`, 'system');
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
    if (!apiKeyInput.value) {
        chatUI.logMessage('Please input API Key', 'system');
        return;
    }

    // Save values to localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
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
        await client.connect(config,apiKeyInput.value);
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
        chatUI.logMessage('已连接到 Gemini 2.0 Flash 多模态实时 API', 'system');
        updateConnectionStatus();
    } catch (error) {
        const errorMessage = error.message || '未知错误';
        Logger.error('连接错误:', error);
        chatUI.logMessage(`连接错误: ${errorMessage}`, 'system');
        isConnected = false;
        connectButton.textContent = '连接';
        connectButton.classList.remove('connected');
        messageInput.disabled = true;
        sendButton.disabled = true;
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
        updateConnectionStatus();
        
        if (videoHandler && videoHandler.getIsVideoActive()) { // T3: 使用 videoHandler 停止视频
            videoHandler.stopVideo();
        }
        
        if (screenHandler && screenHandler.getIsScreenActive()) { // T4: 使用 screenHandler 停止屏幕共享
            screenHandler.stopScreenSharing();
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
    chatUI.logMessage('已从服务器断开连接', 'system');
    updateConnectionStatus();
    
    if (videoHandler && videoHandler.getIsVideoActive()) { // T3: 使用 videoHandler 停止视频
        videoHandler.stopVideo();
    }
    
    if (screenHandler && screenHandler.getIsScreenActive()) { // T4: 使用 screenHandler 停止屏幕共享
        screenHandler.stopScreenSharing();
    }
}

/**
 * Handles sending a text message.
 */
async function handleSendMessage(attachmentManager) { // T2: 传入管理器
    const message = messageInput.value.trim();
    const attachedFiles = attachmentManager.getChatAttachedFiles(); // T2: 从管理器获取所有附件
    // 如果没有文本消息，但有附件，也允许发送
    if (!message && attachedFiles.length === 0) return;

    // 确保在处理任何消息之前，会话已经存在
    // 这是修复“新会话第一条消息不显示”问题的关键
    if (selectedModelConfig && !selectedModelConfig.isWebSocket && !currentSessionId) {
        historyManager.generateNewSession();
    }

    // 使用新的函数显示用户消息
    chatUI.displayUserMessage(message, attachedFiles); // 传递文件数组
    messageInput.value = ''; // 清空输入框
 
    // 在发送用户消息后，重置 currentAIMessageContentDiv，确保下一个AI响应会创建新气泡
    currentAIMessageContentDiv = null;

    if (selectedModelConfig.isWebSocket) {
        // WebSocket 模式不支持文件上传，可以提示用户或禁用按钮
        if (attachedFiles.length > 0) {
            showSystemMessage('实时模式尚不支持文件上传。');
            attachmentManager.clearAttachedFile('chat'); // T2: 使用管理器清除附件
            return;
        }
        client.send({ text: message });
    } else {
        // HTTP 模式下发送消息
        try {
            const apiKey = apiKeyInput.value;
            const modelName = selectedModelConfig.name;
            let systemInstruction = systemInstructionInput.value;

            // 构建消息内容，参考 OCR 项目的成功实践
            const userContent = [];
            if (message) {
                userContent.push({ type: 'text', text: message });
            }
            // 将所有附件添加到 userContent
            attachedFiles.forEach(file => {
                if (file.type.startsWith('image/')) {
                    userContent.push({
                        type: 'image_url',
                        image_url: { url: file.base64 }
                    });
                } else if (file.type === 'application/pdf') {
                    userContent.push({
                        type: 'pdf_url',
                        pdf_url: { url: file.base64 }
                    });
                } else if (file.type.startsWith('audio/')) {
                    userContent.push({
                        type: 'audio_url',
                        audio_url: { url: file.base64 }
                    });
                }
            });

            chatHistory.push({
                role: 'user',
                content: userContent // 保持为数组，因为可能包含文本和图片
            });

            // 清除附件（发送后）
            attachmentManager.clearAttachedFile('chat'); // T2: 使用管理器清除附件

            let requestBody = {
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
                requestBody.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            // 动态添加工具定义，统一处理所有 Qwen、Zhipu 和 Gemini 工具模型
            if (selectedModelConfig && (selectedModelConfig.isQwen || selectedModelConfig.isZhipu || selectedModelConfig.isGemini) && selectedModelConfig.tools) {
                requestBody.tools = selectedModelConfig.tools;
            }

            await chatApiHandler.streamChatCompletion(requestBody, apiKey);

        } catch (error) {
            Logger.error('发送 HTTP 消息失败:', error);
            chatUI.logMessage(`发送消息失败: ${error.message}`, 'system');
        }
    }
}
        
        // Event Listeners
        client.on('open', () => {
            chatUI.logMessage('WebSocket connection opened', 'system');
        });
        
        client.on('log', (log) => {
            chatUI.logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system');
        });
        
        let reconnectAttempts = 0;
        const MAX_RECONNECT = 3;
        
        client.on('close', (event) => {
            chatUI.logMessage(`WebSocket connection closed (code ${event.code})`, 'system');
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
                chatUI.logMessage(`处理音频时出错: ${error.message}`, 'system');
            }
        });
        
        // 声明一个全局变量来跟踪当前 AI 消息的内容 div
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
                currentAIMessageContentDiv = chatUI.createAIMessageElement();
            }
        }
 
        const text = data.modelTurn.parts.map(part => part.text).join('');
        
        if (text) {
            if (!currentAIMessageContentDiv) {
                currentAIMessageContentDiv = chatUI.createAIMessageElement();
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
            chatUI.scrollToBottom();
        }
    }
});

client.on('interrupted', () => {
    audioStreamer?.stop();
    isUsingTool = false;
    Logger.info('Model interrupted');
    chatUI.logMessage('Model interrupted', 'system');
    // 确保在中断时完成当前文本消息并添加到聊天历史
    if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
        chatHistory.push({
            role: 'assistant',
            content: currentAIMessageContentDiv.rawMarkdownBuffer // AI文本消息统一为字符串
        });
    }
    currentAIMessageContentDiv = null; // 重置，以便下次创建新消息
    // 处理累积的音频数据 (保持不变)
    if (audioDataBuffer.length > 0) {
        const audioBlob = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (CONFIG.AUDIO.OUTPUT_SAMPLE_RATE * 2);
        const audioBlobForDisplay = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        chatUI.displayAudioMessage(audioUrl, duration, 'ai', audioBlobForDisplay);
        audioDataBuffer = [];
    }
});

client.on('setupcomplete', () => {
    chatUI.logMessage('Setup complete', 'system');
});

client.on('turncomplete', () => {
    isUsingTool = false;
    chatUI.logMessage('Turn complete', 'system');
    // 在对话结束时刷新文本缓冲区并添加到聊天历史
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
        const audioBlobForDisplay = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        chatUI.displayAudioMessage(audioUrl, duration, 'ai', audioBlobForDisplay);
        audioDataBuffer = []; // 清空缓冲区
    }

    // T15: 在WebSocket模式对话完成时保存历史
    if (isConnected && !selectedModelConfig.isWebSocket) {
        historyManager.saveHistory();
    }
});

client.on('error', (error) => {
    if (error instanceof ApplicationError) {
        Logger.error(`Application error: ${error.message}`, error);
    } else {
        Logger.error('Unexpected error', error);
    }
    chatUI.logMessage(`Error: ${error.message}`, 'system');
});

// ... (新增 processHttpStream 辅助函数)

/**
 * 处理 HTTP SSE 流，包括文本累积和工具调用。
 * @param {Object} requestBody - 发送给模型的请求体。
 * @param {string} apiKey - API Key。
 * @returns {Promise<void>}
 */
// The processHttpStream function has been moved to chat-api-handler.js


// 添加全局错误处理
globalThis.addEventListener('error', (event) => {
    chatUI.logMessage(`系统错误: ${event.message}`, 'system');
});

client.on('message', (message) => {
    if (message.error) {
        Logger.error('Server error:', message.error);
        chatUI.logMessage(`Server error: ${message.error}`, 'system');
    }
});

sendButton.addEventListener('click', () => handleSendMessage(attachmentManager)); // T2: 传入管理器

/**
 * @function handleInterruptPlayback
 * @description 处理中断按钮点击事件，停止当前语音播放。
 * @returns {void}
 */
function handleInterruptPlayback() {
    if (audioStreamer) {
        audioStreamer.stop();
        Logger.info('Audio playback interrupted by user.');
        chatUI.logMessage('语音播放已中断', 'system');
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
            const audioBlobForDisplay = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
            chatUI.displayAudioMessage(audioUrl, duration, 'ai', audioBlobForDisplay);
            audioDataBuffer = []; // 清空缓冲区
        }
    } else {
        Logger.warn('Attempted to interrupt playback, but audioStreamer is not initialized.');
        chatUI.logMessage('当前没有语音播放可中断', 'system');
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
            handleSendMessage(attachmentManager); // T2: 传入管理器
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
        chatUI.logMessage(`未找到模型配置: ${selectedModelName}`, 'system');
        // 恢复到默认模型配置
        selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);
        modelSelect.value = CONFIG.API.MODEL_NAME;
    }
    Logger.info(`模型选择已更改为: ${selectedModelConfig.displayName}`);
    chatUI.logMessage(`模型选择已更改为: ${selectedModelConfig.displayName}`, 'system');
    // 如果已连接，断开连接以应用新模型
    if (isConnected) {
        disconnect(); // 调用统一的断开连接函数
    }
});

/**
 * 统一的连接函数，根据模型类型选择 WebSocket 或 HTTP。
 */
async function connect() {
    if (!apiKeyInput.value) {
        chatUI.logMessage('请输入 API Key', 'system');
        return;
    }

    // 保存值到 localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
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
        chatUI.logMessage('已断开连接 (HTTP 模式)', 'system');
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
        chatUI.logMessage(`已连接到 Gemini HTTP API (${selectedModelConfig.displayName})`, 'system');
        updateConnectionStatus();
    } catch (error) {
        const errorMessage = error.message || '未知错误';
        Logger.error('HTTP 连接错误:', error);
        chatUI.logMessage(`HTTP 连接错误: ${errorMessage}`, 'system');
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
 * Initializes the application and all its modules.
 */
async function initializeApp() {
    try {
        
        // Initialize chess module
        initializeChessCore();
        
    } catch (error) {
        Logger.error('Failed to initialize application:', error);
    }
}

initializeApp();

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
            chatUI.logMessage('音频正在播放中...', 'system');
        } else {
            chatUI.logMessage('音频未播放', 'system');
        }
    }
    
    // 在连接成功后添加检查
    client.on('setupcomplete', () => {
        chatUI.logMessage('Setup complete', 'system');
        setTimeout(checkAudioPlayback, 1000); // 1秒后检查音频状态
    });
    
    /**
     * 添加权限检查。
     */
    async function checkAudioPermissions() {
        try {
            const permission = await navigator.permissions.query({ name: 'speaker' });
            chatUI.logMessage(`扬声器权限状态: ${permission.state}`, 'system');
        } catch (error) {
            chatUI.logMessage(`扬声器权限检查失败: ${error.message}`, 'system');
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
            chatUI.logMessage('新聊天已开始', 'system');
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
                    chatUI.scrollToBottom(); // 尝试滚动到底部
                }
            }, { passive: true });
        }
    }
    // --- START: Add Voice Input Listeners for Chat Mode ---
    if (chatVoiceInputButton) {
        // Mouse events for press-and-hold recording
        chatVoiceInputButton.addEventListener('mousedown', startChatRecording);
        chatVoiceInputButton.addEventListener('mouseup', stopChatRecording);
        chatVoiceInputButton.addEventListener('mouseleave', () => {
            if (isChatRecording) {
                cancelChatRecording();
            }
        });

        // Touch events for press-and-hold recording on mobile
        chatVoiceInputButton.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling/zooming
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
                // Check for a significant upward swipe to cancel
                if (chatInitialTouchY - currentTouchY > 50) {
                    cancelChatRecording();
                }
            }
        });
    }
    // --- END: Add Voice Input Listeners for Chat Mode ---
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
            chatUI.logMessage(`警告：您正在使用${browser.name}。${browser.message}`, 'system');
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
    chatUI.logMessage('开始录音...', 'system');

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
      showToast('没有录到音频，请重试');
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
        messageInput.value += transcriptionText;
        showToast('语音转文字成功');
        chatUI.logMessage(`语音转文字成功: ${transcriptionText}`, 'system'); // 添加日志
    } else {
        showToast('未获取到转录文本。');
        chatUI.logMessage('未获取到转录文本。', 'system'); // 添加日志
    }

  } catch (error) {
    showToast(`语音转文字失败: ${error.message}`);
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
    chatUI.scrollToBottom();
}
