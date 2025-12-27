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
import { createVisionHistoryManager } from './history/vision-history-manager.js'; // 修复：导入 Vision 历史管理器创建函数
import { initImageManager } from './image-gallery/image-manager.js'; // 导入 ImageManager 的初始化函数
import { ScreenHandler } from './media/screen-handlers.js'; // T4: 导入 ScreenHandler
import { VideoHandler } from './media/video-handlers.js'; // T3: 导入 VideoHandler
import { ToolManager } from './tools/tool-manager.js'; // 确保导入 ToolManager
import { initializeTranslationCore } from './translation/translation-core.js';
import { Logger } from './utils/logger.js';
import { displayVisionMessage, initializeVisionCore } from './vision/vision-core.js'; // T8: 新增, 导入 displayVisionMessage 和 initializeVisionCore

// ✨ 1. 新增：导入工具定义，这是让Skill模式工作的关键

// 🚀 新增导入
import { skillContextManager } from './tool-spec-system/skill-context-manager.js';
import { enhancedToolDefinitions } from './tools_mcp/enhanced-tool-definitions.js';

// 🚀 增强的模型工具管理器
class EnhancedModelToolManager {
  constructor() {
    this.modelToolsCache = new Map();
  }

  /**
   * 获取当前模型的增强工具配置
   */
  async getEnhancedToolsForModel(modelName) {
    if (this.modelToolsCache.has(modelName)) {
      return this.modelToolsCache.get(modelName);
    }

    const modelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === modelName);
    if (!modelConfig || !modelConfig.tools) {
      return [];
    }

    let enhancedTools;
    if (modelConfig.isGemini) {
      enhancedTools = await enhancedToolDefinitions.getEnhancedTools(modelConfig.tools, modelName);
    } else if (modelConfig.isZhipu) {
      enhancedTools = await enhancedToolDefinitions.getEnhancedTools(modelConfig.tools, modelName);
    } else {
      enhancedTools = await enhancedToolDefinitions.getEnhancedTools(modelConfig.tools, modelName);
    }

    this.modelToolsCache.set(modelName, enhancedTools);
    return enhancedTools;
  }

  clearCache() {
    this.modelToolsCache.clear();
  }
}

// 创建全局实例
export const enhancedModelToolManager = new EnhancedModelToolManager();

// 🎯 获取基础技能管理器的函数
// 这个函数应该在技能系统初始化后调用
window.getBaseSkillManager = function() {
  // 🎯 关键修复：返回 skill-manager.js 中导出的 Promise，确保单例
  const { skillManagerPromise } = window.skillManagerModule || {};
  if (skillManagerPromise) {
    return skillManagerPromise;
  }
  
  // 降级方案：返回一个简单的技能管理器
  return Promise.resolve({
    findRelevantSkills: (userQuery, context = {}) => {
      console.log(`[BaseSkillManager] 降级查询: ${userQuery}`);
      return [];
    }
  });
};

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

// 🚀 新增：智能代理系统开关
const agentModeToggle = document.getElementById('agent-mode-toggle');

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
   fileInput.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'chat', currentSessionId));
 
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
    // 建立象棋模块和视觉模块的通信桥梁
    window.displayVisionMessage = (message) => {
        // 调用 vision-core 中的显示函数
        if (typeof displayVisionMessage === 'function') {
            displayVisionMessage(message);
        }
    };
    
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

   // 创建 Vision 历史管理器
   const visionHistoryManager = createVisionHistoryManager();

   // 初始化 Vision 模式的 ChatApiHandler
   visionApiHandler = new ChatApiHandler({
       toolManager: toolManager,
       historyManager: visionHistoryManager,
       state: {
           chatHistory: visionHistoryManager.getCurrentSessionMessages(), // 从历史管理器获取消息
           currentSessionId: visionHistoryManager.getCurrentSessionId(),
           currentAIMessageContentDiv: null,
           isUsingTool: false
       },
       libs: {
           marked: window.marked,
           MathJax: window.MathJax
       },
       config: CONFIG,
       // [新增] 确保传递正确的元素引用
       elements: {
           messageHistory: visionElements.visionMessageHistory,
           logsContainer: document.getElementById('logs-container')
       }
   });

   // 定义 visionHandlers - 确保包含历史管理器
   const visionHandlers = {
       showToast: showToast,
       showSystemMessage: showSystemMessage,
       chatApiHandler: visionApiHandler,
       historyManager: visionHistoryManager // 添加历史管理器到 handlers
   };

   // 初始化视觉功能
   initializeVisionCore(visionElements, attachmentManager, visionHandlers);
   
   // 初始化国际象棋 - 确保在所有DOM元素就绪后调用
   setTimeout(() => {
       initializeChessCore({
           showToast: showToast,
           displayVisionMessage: displayVisionMessage, // 注入渲染函数
           chatApiHandler: visionApiHandler // 修改为使用 visionApiHandler
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
   
   // 初始化 ImageManager (模态框)
   initImageManager();

   // 🚀 新增：初始化智能代理系统
   initializeEnhancedAgent();
   
   // 🚀 在DOMContentLoaded中初始化技能系统
  initializeEnhancedSkillSystem();
   
   // 🎯 添加调试状态检查
   setTimeout(debugAgentSystem, 2000);
   
   // 确保工作流样式加载
   loadWorkflowStyles();
// 🎯 核心功能最终版：浮窗式、带搜索的 CRUD 文件管理器
const fileManagerButton = document.getElementById('file-manager-button');
const fileManagerModal = document.getElementById('file-manager-modal');
const closeFileManagerButton = document.getElementById('close-file-manager');
const fileManagerSearchInput = document.getElementById('file-manager-search');
const fileListContainer = document.getElementById('file-list-container');
const refreshFileListButton = document.getElementById('refresh-file-list');

const backendHostname = 'https://pythonsandbox.10110531.xyz';
let isFileManagerAuthenticated = false;
let allFilesCache = []; // 用于缓存文件列表以支持前端搜索

function openFileManager() {
    if (isFileManagerAuthenticated) {
        fileManagerModal.style.display = 'flex';
        updateFileList(); // 每次打开都刷新
    } else {
        const password = prompt("请输入文件管理器访问密码:");
        if (password) verifyPasswordAndOpen(password);
    }
}

function closeFileManager() {
    fileManagerModal.style.display = 'none';
}

async function verifyPasswordAndOpen(password) {
    try {
        showToast('正在验证...');
        const response = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        if (response.status === 200) {
            isFileManagerAuthenticated = true;
            showToast('验证成功！');
            fileManagerModal.style.display = 'flex';
            await updateFileList();
        } else {
            showToast('密码错误！');
        }
    } catch (error) { showToast('验证时发生网络错误。'); }
}

async function updateFileList() {
    if (!isFileManagerAuthenticated) return;
    try {
        const response = await fetch(`/api/v1/files/global/list-all`);
        if (!response.ok) throw new Error(`无法获取文件列表 (状态: ${response.status})`);
        allFilesCache = await response.json(); // 更新缓存
        renderFileList(allFilesCache); // 渲染列表
    } catch (error) {
        showToast(`获取文件列表失败`, 3000);
    }
}

function renderFileList(files) {
    fileListContainer.innerHTML = '';
    if (files.length === 0) {
        fileListContainer.innerHTML = '<div class="fm-list-item">所有工作区内暂无文件。</div>';
    } else {
        files.sort((a, b) => a.name.localeCompare(b.name)).forEach(file => {
            const item = document.createElement('div');
            item.className = 'fm-list-item';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'fm-file-info';
            
            const fileName = document.createElement('span');
            fileName.className = 'fm-file-name';
            fileName.textContent = file.name;
            
            const sessionTag = document.createElement('span');
            sessionTag.className = 'fm-session-tag';
            sessionTag.textContent = `所属会话: ${file.session_id.substring(0, 8)}...`;
            
            fileInfo.appendChild(fileName);
            fileInfo.appendChild(sessionTag);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'fm-file-actions';

            // 下载按钮
            const downloadLink = document.createElement('a');
            downloadLink.className = 'fm-action-icon download-button';
            downloadLink.href = `${backendHostname}/api/v1/files/global/download/${encodeURIComponent(file.name)}`;
            downloadLink.title = `下载`;
            downloadLink.target = '_blank';
            downloadLink.innerHTML = '<i class="fa-solid fa-download"></i>';
            
            // 重命名按钮
            const renameButton = document.createElement('button');
            renameButton.className = 'fm-action-icon rename-button';
            renameButton.title = `重命名`;
            renameButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
            renameButton.onclick = () => handleRename(file.name);

            // 删除按钮
            const deleteButton = document.createElement('button');
            deleteButton.className = 'fm-action-icon delete-button';
            deleteButton.title = `删除`;
            deleteButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            deleteButton.onclick = () => handleDelete(file.name);

            actionsDiv.appendChild(downloadLink);
            actionsDiv.appendChild(renameButton);
            actionsDiv.appendChild(deleteButton);

            item.appendChild(fileInfo);
            item.appendChild(actionsDiv);
            fileListContainer.appendChild(item);
        });
    }
}

// =========================================================================
// 🎯 核心修复：添加缺失的 handleRename 和 handleDelete 函数
// =========================================================================

/**
 * 处理文件重命名操作
 * @param {string} oldFilename - 要重命名的当前文件名
 */
async function handleRename(oldFilename) {
    const newFilename = prompt("请输入新的文件名:", oldFilename);

    // 检查用户是否取消或输入了空名称，或者名称没有改变
    if (!newFilename || newFilename.trim() === '' || newFilename === oldFilename) {
        return; // 用户取消或未做更改，直接返回
    }

    try {
        showToast(`正在重命名 "${oldFilename}"...`);
        const response = await fetch(`/api/v1/files/global/rename/${encodeURIComponent(oldFilename)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_filename: newFilename.trim() })
        });

        if (response.ok) {
            showToast('文件重命名成功！');
            await updateFileList(); // 刷新文件列表
        } else {
            // 处理特定错误，如文件名冲突
            if (response.status === 409) {
                 showToast('重命名失败：新文件名已存在。');
            } else {
                const errorData = await response.json();
                showToast(`重命名失败: ${errorData.detail || '未知错误'}`);
            }
        }
    } catch (error) {
        showToast(`网络错误: ${error.message}`);
    }
}

/**
 * 处理文件删除操作
 * @param {string} filename - 要删除的文件名
 */
async function handleDelete(filename) {
    // 添加确认步骤，防止误删
    if (!confirm(`您确定要永久删除文件 "${filename}" 吗？此操作无法撤销。`)) {
        return; // 用户取消
    }

    try {
        showToast(`正在删除 "${filename}"...`);
        const response = await fetch(`/api/v1/files/global/delete/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        // 204 No Content 是 DELETE 成功的标准响应
        if (response.ok || response.status === 204) {
            showToast('文件删除成功！');
            await updateFileList(); // 刷新文件列表
        } else {
            const errorData = await response.json();
            showToast(`删除失败: ${errorData.detail || '未知错误'}`);
        }
    } catch (error) {
        showToast(`网络错误: ${error.message}`);
    }
}

function resetFileManagerAuth() {
    isFileManagerAuthenticated = false;
    closeFileManager();
}

// --- 绑定事件 ---
fileManagerButton.addEventListener('click', openFileManager);
closeFileManagerButton.addEventListener('click', closeFileManager);
refreshFileListButton.addEventListener('click', updateFileList);
// 新增：搜索框事件
fileManagerSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredFiles = allFilesCache.filter(file => file.name.toLowerCase().includes(searchTerm));
    renderFileList(filteredFiles);
});
// 新增：点击遮罩层关闭模态框
fileManagerModal.addEventListener('click', (e) => {
    if (e.target === fileManagerModal) {
        closeFileManager();
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
let currentAIMessageContentDiv = null; // 新增：用于跟踪当前播放的音频元素，确保单例播放
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
let visionApiHandler = null; // 确保这里声明了 visionApiHandler

// 🚀 新增：智能代理系统实例
let orchestrator = null;
let agentThinkingDisplay = null; // 🚀 新增：Agent思考显示实例

// 添加实时采样率侦测状态（当服务器未发送采样率元数据时尝试估算）
let _realtimeDetectBytes = 0;
let _realtimeDetectStart = 0;
let _realtimeDetectDone = false;

// 🚀 修改智能代理系统初始化函数
async function initializeEnhancedAgent() {
    try {
        console.log('🚀 准备智能代理系统（开关控制初始化模式）...');
        
        // 🎯 提前初始化 AgentThinkingDisplay (保留自原有逻辑)
        const { AgentThinkingDisplay } = await import('./agent/AgentThinkingDisplay.js');
        agentThinkingDisplay = new AgentThinkingDisplay();
        console.log('✅ AgentThinkingDisplay 初始化完成');
        
        // 🎯 关键修改：创建占位符Orchestrator，不立即初始化
        orchestrator = {
            isEnabled: false,
            isInitialized: false,
            _initState: 'created',
            _initializing: false,
            
            // 占位方法
            handleUserRequest: (userMessage, files = [], context = {}) => {
                console.log('🔌 Orchestrator 未初始化，使用标准模式');
                return { enhanced: false, type: 'standard_fallback' };
            },
            
            setEnabled: async function(enabled) {
                console.log(`🎯 设置智能代理开关: ${enabled}, 当前初始化状态: ${this._initState}`);
                
                // 🎯 立即更新开关状态
                this.isEnabled = enabled;
                localStorage.setItem('agentModeEnabled', enabled);
                
                if (enabled && this._initState === 'created') {
                    // 🎯 开关打开且未初始化，开始初始化
                    console.log('🔌 开关触发Orchestrator初始化...');
                    await this._initializeOrchestrator();
                } else if (!enabled && this._initState === 'initialized') {
                    // 🎯 开关关闭且已初始化，清理资源
                    console.log('🔌 开关关闭，清理Agent资源');
                    // 🎯 修复：在关闭模式时隐藏仪表盘
                    if (agentThinkingDisplay) {
                        agentThinkingDisplay.hide();
                    }
                    this._cleanupResources();
                }
                
                // 🎯 简化：直接使用Toast提示状态
                if (enabled && this._initState === 'initialized') {
                    showToast('智能代理系统已启用');
                } else if (!enabled) {
                    showToast('智能代理系统已禁用');
                }
            },
            
            // 真正的初始化方法
            _initializeOrchestrator: async function() {
                if (this._initState === 'initialized') {
                    console.log('✅ Orchestrator 已初始化');
                    return true;
                }
                
                if (this._initializing) {
                    console.log('🔄 Orchestrator 正在初始化中...');
                    return new Promise((resolve) => {
                        const checkInterval = setInterval(() => {
                            if (this._initState === 'initialized') {
                                clearInterval(checkInterval);
                                resolve(true);
                            }
                        }, 100);
                    });
                }
                
                this._initializing = true;
                console.log('🔄 开始初始化 Orchestrator...');
                showToast('智能代理系统初始化中...', 3000);
                
                try {
                    // 动态导入 Orchestrator
                    const { Orchestrator } = await import('./agent/Orchestrator.js');
                    
                    // 创建真正的 Orchestrator 实例
                    const realOrchestrator = new Orchestrator(chatApiHandler, {
                        enabled: true,
                        containerId: 'workflow-container',
                        maxIterations: 10,
                    });
                    
                    // 等待初始化完成
                    await realOrchestrator.ensureInitialized();
                    
                    // 🎯 替换占位符为真实实例
                    // Object.assign 复制实例属性 (如 this.agentSystem, this.tools)
                    Object.assign(this, realOrchestrator);
                    
                    // 🎯 关键修复：手动复制原型方法，确保外部调用指向真实实例的逻辑
                    // 占位符的 handleUserRequest 必须被真实实例的同名方法覆盖
                    this.handleUserRequest = realOrchestrator.handleUserRequest.bind(realOrchestrator);
                    
                    this._initState = 'initialized';
                    this._initializing = false;
                    
                    console.log('✅ Orchestrator 初始化完成');
                    showToast('智能代理系统已就绪', 2000);
                    
                    return true;
                } catch (error) {
                    console.error('❌ Orchestrator 初始化失败:', error);
                    this._initializing = false;
                    this._initState = 'failed';
                    showToast('智能代理系统初始化失败，使用标准模式', 3000);
                    this.isEnabled = false;
                    
                    // 更新开关状态
                    if (agentModeToggle) {
                        agentModeToggle.checked = false;
                    }
                    
                    return false;
                }
            },
            
            _cleanupResources: function() {
                // 清理Agent相关资源，但不销毁实例
                this.currentWorkflow = null;
                this.currentContext = null;
                if (this.agentSystem) {
                    this.agentSystem.executor = null;
                }
                console.log('🔌 Agent资源清理完成');
            },
            
            ensureInitialized: function() {
                if (this._initState === 'initialized') return Promise.resolve(true);
                if (this.isEnabled) {
                    return this._initializeOrchestrator();
                } else {
                    return Promise.resolve(false);
                }
            }
        };
        
        // 挂载到全局
        window.orchestrator = orchestrator;
        
        // 🎯 初始化 Agent 开关状态和事件监听
        const isAgentEnabled = localStorage.getItem('agentModeEnabled') === 'true';
        if (agentModeToggle) {
            agentModeToggle.checked = isAgentEnabled;
            agentModeToggle.disabled = false;
            
            // 🎯 修改开关事件监听器 - 核心逻辑
            agentModeToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                console.log(`🔘 智能代理开关状态变化: ${enabled}`);
                
                // 立即更新开关视觉状态
                agentModeToggle.checked = enabled;
                
                // 调用 Orchestrator 的 setEnabled 方法
                await orchestrator.setEnabled(enabled);
                
                // 如果初始化失败，确保开关状态正确
                if (enabled && orchestrator._initState === 'failed') {
                    agentModeToggle.checked = false;
                }
            });
            
            // 🎯 如果之前是开启状态，触发初始化
            if (isAgentEnabled) {
                console.log('🔘 检测到之前开启状态，触发Orchestrator初始化...');
                setTimeout(async () => {
                    await orchestrator.setEnabled(true);
                }, 1000);
            }
        }
        
        console.log('✅ 智能代理系统准备完成（开关控制初始化模式）');

        // 🎯 临时调试：强行触发一次已知会发出的事件，检查是否能被接收
        // 延迟执行，确保 Orchestrator 有足够时间完成初始化（如果 isAgentEnabled 为 true）
        setTimeout(async () => {
            if (orchestrator && orchestrator.callbackManager && orchestrator.isEnabled) {
                try {
                    console.log('[Main.js Debug] 尝试手动触发一个研究开始事件...');
                    // 使用 Orchestrator.js 中 setupHandlers 映射的事件名称 on_research_start
                    await orchestrator.callbackManager.invokeEvent('on_research_start', {
                        run_id: 'debug_run_id',
                        data: {
                            topic: '测试主题',
                            availableTools: ['tool1'],
                            researchMode: 'standard',
                            researchData: { keywords: ['test'], sources: [], toolCalls: [], metrics: {} }
                        },
                        agentType: 'deep_research' // 模拟 Agent 传递的类型
                    });
                    console.log('[Main.js Debug] 手动触发事件成功。');
                } catch (eventError) {
                    console.error('[Main.js Debug] 手动触发事件失败:', eventError);
                }
            } else {
                console.log('[Main.js Debug] Orchestrator 未启用或未初始化，跳过手动触发事件。');
            }
        }, 2000); // 给予 2 秒时间确保异步初始化完成
        
    } catch (error) {
        console.error('智能代理系统准备失败:', error);
        ensureBasicAgentFunctionality();
    }
}

// 🛡️ 确保基础功能可用的降级方案
function ensureBasicAgentFunctionality() {
    console.log('🛡️ 启用智能代理系统降级模式');
    
    window.orchestrator = {
        isEnabled: false,
        isInitialized: false,
        handleUserRequest: () => ({ enhanced: false, type: 'standard_fallback' }),
        setEnabled: (enabled) => {
            console.log('🛡️ 降级模式: setEnabled called', enabled);
            if (enabled) {
                showToast('智能代理系统暂时不可用，请刷新页面重试');
            }
        }
    };
    
    if (agentModeToggle) {
        agentModeToggle.checked = false;
        agentModeToggle.disabled = true;
    }
}

/**
 * 🚀 加载工作流样式
 */
function loadWorkflowStyles() {
  if (!document.querySelector('link[href*="workflow-ui.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/workflow-ui.css';
    document.head.appendChild(link);
    
    // 添加加载错误处理
    link.onerror = () => {
      console.warn('工作流样式加载失败，使用备用样式');
      injectFallbackStyles();
    };
  }
}

/**
 * 🚀 备用样式注入
 */
function injectFallbackStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .workflow-container { 
      display: none; 
      margin: 20px 0; 
      padding: 16px; 
      background: #f8f9fa; 
      border-radius: 8px; 
      border: 1px solid #ddd; 
    }
    .workflow-step { 
      margin: 8px 0; 
      padding: 12px; 
      background: white; 
      border-radius: 6px; 
    }
    .workflow-step-running { background: #f0f8ff; }
    .workflow-step-success { background: #f0fff0; }
    .workflow-step-failed { background: #fff0f0; }
  `;
  document.head.appendChild(style);
}


/**
 * 辅助函数：获取当前模型可用的工具名称列表
 * [已修复] 将 modelConfig.tools 作为数组使用，而不是函数
 */
function getAvailableToolNames(currentModel) {
    const modelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === currentModel);
    // 如果模型配置或工具列表不存在，返回空数组
    if (!modelConfig || !modelConfig.tools) {
        return [];
    }
    
    try {
        // --- 关键修复 ---
        // modelConfig.tools 是工具定义的数组，而不是一个函数。
        // 我们直接使用这个数组。
        const toolDefinitions = modelConfig.tools;

        // 确保它是一个数组，以防配置错误
        if (!Array.isArray(toolDefinitions)) {
            console.error(`[Agent System] Error: modelConfig.tools for model '${currentModel}' is not an array.`);
            return [];
        }

        // 从每个工具定义中提取函数名称
        // 使用可选链 (?.) 增加代码健壮性
        return toolDefinitions
            .map(tool => tool.function?.name)
            .filter(Boolean); // 过滤掉任何可能为空的名称
        // --- 修复结束 ---

    } catch (error) {
        // 保留 try...catch 块以处理任何意外错误
        console.error('获取可用工具失败:', error);
        return [];
    }
}

/**
 * ✨ [修复] 标准聊天请求处理函数
 * @description 根据模型配置决定是否添加工具定义
 */
async function handleStandardChatRequest(message, attachedFiles, modelName, apiKey, pushToHistory = true) {
    const userContent = [];
    if (message) {
        userContent.push({ type: 'text', text: message });
    }

    attachedFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
            userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
        } else if (file.type === 'application/pdf') {
            userContent.push({ type: 'pdf_url', pdf_url: { url: file.base64 } });
        } else if (file.type.startsWith('audio/')) {
            userContent.push({ type: 'audio_url', audio_url: { url: file.base64 } });
        }
    });

    if (pushToHistory) {
        chatHistory.push({ role: 'user', content: userContent });
    }

    // 🎯 修复：只在模型配置明确要求时才添加工具定义
    const modelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === modelName);
    
    const requestBody = {
        model: modelName,
        messages: chatHistory,
        generationConfig: { responseModalities: ['text'] },
        stream: true,
        sessionId: currentSessionId
    };

    // 🎯 关键修复：只有配置了 tools 字段的模型才添加工具定义
    if (modelConfig && modelConfig.tools) {
        const toolType = modelConfig.isGemini ? 'geminiMcpTools' :
                        modelConfig.isZhipu ? 'mcpTools' : 'customTools';
        console.log(`🎯 [工具注入] 为模型 ${modelName} 注入工具定义 (${toolType})`);
        requestBody.tools = modelConfig.tools;
    } else {
        console.log(`🔍 [工具跳过] 模型 ${modelName} 未配置工具，使用标准请求`);
    }

    await chatApiHandler.streamChatCompletion(requestBody, apiKey);
}

/**
 * 🚀 [关键修复] 处理用户消息发送的核心函数
 * @description 严格区分WebSocket和HTTP模式，确保WebSocket模式完全独立
 */
async function handleSendMessage(attachmentManager) {
    const messageText = messageInput.value.trim();
    const attachedFiles = attachmentManager.getChatAttachedFiles();
    if (!messageText && attachedFiles.length === 0) return;

    // 如果是 HTTP 模式且尚无 session，先创建会话以避免后续生成新会话时清空刚刚渲染的用户消息
    if (!selectedModelConfig.isWebSocket && !currentSessionId) {
        historyManager.generateNewSession();
    }

    // 🚀 关键修复：立即执行所有UI更新和清理操作
    chatUI.displayUserMessage(messageText, attachedFiles);
    messageInput.value = '';
    attachmentManager.clearAttachedFile('chat');
    window.currentAIMessageContentDiv = null;

    // 🚀 严格分离WebSocket和HTTP模式
    if (selectedModelConfig.isWebSocket) {
        // WebSocket模式 - 完全独立，不涉及任何HTTP请求
        await handleWebSocketMessage(messageText, attachedFiles);
    } else {
        // HTTP模式 - 使用增强的逻辑
        await handleEnhancedHttpMessage(messageText, attachedFiles);
    }
}

/**
 * 🚀 处理WebSocket模式消息发送
 * @description WebSocket模式完全独立，不涉及任何HTTP请求或代理系统
 */
async function handleWebSocketMessage(messageText, attachedFiles) {
    if (!isConnected) {
        chatUI.logMessage('未连接到WebSocket，请先点击连接按钮', 'system');
        return;
    }

    try {
        const parts = [];
        
        // 添加文本部分
        if (messageText) {
            parts.push({ text: messageText });
        }
        
        // 处理附件（WebSocket模式只支持图片）
        for (const file of attachedFiles) {
            if (file.type.startsWith('image/')) {
                // 将base64数据转换为inlineData格式
                const base64Data = file.base64.split(',')[1]; // 移除data URL前缀
                parts.push({
                    inlineData: {
                        mimeType: file.type,
                        data: base64Data
                    }
                });
            } else {
                chatUI.logMessage(`WebSocket模式暂不支持${file.type}类型的附件`, 'system');
            }
        }
        
        // 发送消息到WebSocket
        client.send(parts, true);
        chatUI.logMessage('消息已通过WebSocket发送', 'system');
        
    } catch (error) {
        console.error('WebSocket消息发送失败:', error);
        chatUI.logMessage(`WebSocket消息发送失败: ${error.message}`, 'system');
    }
}

/**
 * 🚀 初始化增强技能系统
 */
async function initializeEnhancedSkillSystem() {
  try {
    console.log('🚀 正在初始化增强技能系统...');
    
    // 1. 初始化技能上下文管理器
    const contextReady = await skillContextManager.ensureInitialized();
    if (!contextReady) {
      console.warn('❌ 技能上下文管理器初始化失败，使用降级模式');
      return;
    }

    // 2. 预加载常用模型的增强定义
    const defaultModel = CONFIG.API.MODEL_NAME;
    await enhancedModelToolManager.getEnhancedToolsForModel(defaultModel);
    
    console.log('✅ 增强技能系统初始化完成');
    
  } catch (error) {
    console.error('❌ 增强技能系统初始化失败:', error);
  }
}

/**
 * 🚀 修改核心消息处理函数
 */
// =========================================================================
// 🚀 [最终方案 V2 - 替换] 增强的消息处理函数，仅负责启动 Agent
// =========================================================================
async function handleEnhancedHttpMessage(messageText, attachedFiles) {
    if (!currentSessionId) {
        historyManager.generateNewSession();
    }

    const apiKey = apiKeyInput.value;
    const modelName = selectedModelConfig.name;
    const isAgentModeEnabled = orchestrator && orchestrator.isEnabled;
    
    // 如果 Agent 模式未启用，直接回退到标准模式
    if (!isAgentModeEnabled) {
        console.log("💬 Agent 模式未启用，使用标准对话");
        await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey);
        return;
    }

    try {
        // 🎯 核心修复：在 Agent 流程开始前，将用户消息推入历史记录
        const userContent = [];
        if (messageText) {
            userContent.push({ type: 'text', text: messageText });
        }
        attachedFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
            } else if (file.type === 'application/pdf') {
                userContent.push({ type: 'pdf_url', pdf_url: { url: file.base64 } });
            } else if (file.type.startsWith('audio/')) {
                userContent.push({ type: 'audio_url', audio_url: { url: file.base64 } });
            }
        });
        chatHistory.push({ role: 'user', content: userContent });
        
        // 🚀 获取可用工具名称和增强工具定义
        const availableToolNames = getAvailableToolNames(modelName);
        const enhancedTools = await enhancedModelToolManager.getEnhancedToolsForModel(modelName);
        
        // 🚀 生成技能上下文
        const contextResult = await skillContextManager.generateRequestContext(
            messageText,
            availableToolNames,
            selectedModelConfig
        );

        console.log(`🎯 [技能上下文] 级别: ${contextResult.contextLevel}, 复杂工具: ${contextResult.hasComplexTools}`);

        // 2. 准备 Agent 上下文
        const agentContext = {
            model: modelName,
            apiKey: apiKey,
            messages: chatHistory,
            apiHandler: chatApiHandler,
            availableTools: availableToolNames, // 传递原始工具名称列表
            enhancedTools: enhancedTools, // 传递增强工具定义
            contextResult: contextResult // 传递技能上下文结果
        };
        
        // 🔥 核心修改：调用 Orchestrator，但不处理其返回值的 content
        // 我们在这里“发射后不管”，渲染工作将由 'research:end' 事件监听器处理
        const agentResult = await orchestrator.handleUserRequest(messageText, attachedFiles, agentContext);

        // 🎯 核心修复：如果 Agent 模式成功执行，更新用户消息的历史记录
        // Orchestrator 返回的 originalUserMessage 包含完整的用户原始指令，用于历史记录持久化
        if (agentResult && agentResult.enhanced && agentResult.originalUserMessage) {
            // 找到 chatHistory 中最后一条用户消息（即当前消息）
            const lastUserMessageIndex = chatHistory.length - 1;
            if (lastUserMessageIndex >= 0 && chatHistory[lastUserMessageIndex].role === 'user') {
                // 替换为 Orchestrator 返回的、包含完整上下文的原始消息
                // 确保 content 结构是正确的数组格式
                chatHistory[lastUserMessageIndex].content = [{ type: 'text', text: agentResult.originalUserMessage }];
                console.log('✅ 历史记录中的用户消息已更新为 Orchestrator 返回的原始消息。');
            }
        }

        // 如果 Orchestrator 决定不处理 (e.g., 非研究请求)，则回退
        if (agentResult && !agentResult.enhanced) {
            console.log("💬 Orchestrator 决定不处理，回退到标准对话");
            // 🎯 关键修复：回退时，不重复推入历史记录 (pushToHistory = false)
            await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey, false);
        }
        
        // ‼️ 重要：这里不再有任何创建 AI 消息或渲染 report 的代码。
        // 我们相信 'research:end' 事件会最终触发渲染。
        // 对于 user_guide 等简单情况，Orchestrator 内部会直接触发事件或返回可直接显示的内容，
        // 我们可以在这里做一个简单的处理。
        if (agentResult && agentResult.type === 'user_guide') {
             const aiMessage = chatUI.createAIMessageElement();
             aiMessage.markdownContainer.innerHTML = marked.parse(agentResult.content);
             chatUI.scrollToBottom();
        }

    } catch (error) {
        console.error("🤖 Agent 模式执行失败:", error);
        if (window.agentThinkingDisplay) {
            window.agentThinkingDisplay.hide();
        }
        showSystemMessage(`智能代理执行时发生错误: ${error.message}`);
        
        // 🎯 关键修复：如果 Agent 失败，将用户消息从历史记录中移除，并回退到标准模式
        // 移除刚刚推入的 user 消息
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
            chatHistory.pop();
        }
        // 使用标准模式重新发送，让标准模式自己处理历史记录推入
        await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey, true);
    }
}

/**
 * 🚀 处理增强的标准 Skill 模式请求 (修正版)
 */
async function handleEnhancedStandardRequest(messageText, attachedFiles, modelName, apiKey, enhancedTools, contextResult) {
    // 1. 构造用户内容
    const userContent = [];
    
    // ✅ 关键修正：直接使用 skillContextManager 生成的增强版Prompt
    // 它已经包含了技能指南和用户的原始请求
    userContent.push({ type: 'text', text: contextResult.enhancedPrompt });

    attachedFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
            userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
        } else if (file.type === 'application/pdf') {
            userContent.push({ type: 'pdf_url', pdf_url: { url: file.base64 } });
        } else if (file.type.startsWith('audio/')) {
            userContent.push({ type: 'audio_url', audio_url: { url: file.base64 } });
        }
    });

    chatHistory.push({ role: 'user', content: userContent });

    // 2. 构造请求体
    const requestBody = {
        model: modelName,
        messages: chatHistory,
        generationConfig: { responseModalities: ['text'] },
        stream: true,
        sessionId: currentSessionId
        // ✅ 移除对 systemInstruction 的动态修改
    };

    // 3. 注入增强工具定义
    if (enhancedTools && enhancedTools.length > 0) {
        requestBody.tools = enhancedTools;
        console.log(`🎯 [增强工具注入] 为模型 ${modelName} 注入 ${enhancedTools.length} 个增强工具定义`);
    } else {
        console.log(`🔍 [工具跳过] 模型 ${modelName} 未配置工具，使用标准请求`);
    }

    // 4. 发送请求
    await chatApiHandler.streamChatCompletion(requestBody, apiKey);
}

/**
 * 🚀 处理增强的智能代理模式
 */
async function handleEnhancedAgentMode(messageText, attachedFiles, modelName, apiKey, availableToolNames, enhancedTools, contextResult) {
    console.log("🤖 Agent Mode ON: 智能路由用户请求 (增强模式)");
    
    try {
        // 1. 检查开关和初始化状态
        if (!orchestrator.isEnabled) {
            console.log('🔌 Agent开关未启用，使用标准模式');
            await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey);
            return;
        }
        
        if (orchestrator._initState !== 'initialized') {
            console.log('🔄 Agent系统未初始化，立即初始化...');
            showToast('正在初始化智能代理系统...');
            
            const initSuccess = await orchestrator.ensureInitialized();
            if (!initSuccess) {
                console.log('❌ Agent初始化失败，使用标准模式');
                await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey);
                return;
            }
        }
        
        // 2. 准备 Agent 上下文
        const agentContext = {
            model: modelName,
            apiKey: apiKey,
            messages: chatHistory,
            apiHandler: chatApiHandler,
            availableTools: availableToolNames, // 传递原始工具名称列表
            enhancedTools: enhancedTools, // 传递增强工具定义
            contextResult: contextResult // 传递技能上下文结果
        };
        
        console.log(`[Agent] 可用工具: ${availableToolNames.join(', ')}`);
        
        // 3. 使用真正的 Orchestrator 处理请求
        const agentResult = await orchestrator.handleUserRequest(messageText, attachedFiles, agentContext);
        
        console.log('🎯 Orchestrator处理结果:', agentResult);
        
        // 4. 处理结果
        if (agentResult.enhanced) {
            if (agentResult.type === 'workflow_pending') {
                showWorkflowUI(agentResult.workflow);
                console.log("🎯 工作流等待执行");
                
                return new Promise((resolve) => {
                    const handleWorkflowResult = (event) => {
                        const finalResult = event.detail;
                        window.removeEventListener('workflow:result', handleWorkflowResult);
                        
                        if (finalResult.skipped) {
                            handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey)
                                .finally(resolve);
                        } else {
                            chatUI.addMessage({ role: 'assistant', content: finalResult.content });
                            console.log('工作流执行详情:', finalResult);
                            resolve();
                        }
                    };
                    window.addEventListener('workflow:result', handleWorkflowResult);
                });
            } else if (agentResult.type === 'agent_result') {
                if (agentResult.fallback) {
                    chatUI.addMessage({ role: 'assistant', content: agentResult.content });
                } else {
                    displayAgentSummary(agentResult);
                    
                    if (agentResult.report) {
                        chatUI.addMessage({ role: 'assistant', content: agentResult.report });
                    }
                    
                    console.log(`Agent执行完成，${agentResult.iterations}次迭代，完整报告已显示`);
                }
                console.log('Agent执行详情:', agentResult);
            } else {
                chatUI.addMessage({ role: 'assistant', content: agentResult.content });
                console.log('增强结果详情:', agentResult);
            }
        } else {
            console.log("💬 未触发增强模式，使用标准对话");
            if (window.agentThinkingDisplay && window.agentThinkingDisplay.currentSession) {
                 window.agentThinkingDisplay.hide();
            }
            await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey);
        }
        
    } catch (error) {
        console.error("🤖 Agent模式执行失败:", error);
        if (window.agentThinkingDisplay) {
            window.agentThinkingDisplay.hide();
        }
        await handleStandardChatRequest(messageText, attachedFiles, modelName, apiKey);
    }
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
 * Initializes the audio context and streamer if not already initialized.
 * @returns {Promise<AudioStreamer>} The audio streamer instance.
 */
// 🚀 修复：改进音频流初始化，确保实时播放可用
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
            document.removeEventListener('touchstart', resumeHandler);
        }
    }
    
    if (!audioStreamer) {
        audioStreamer = new AudioStreamer(audioCtx);
        
        // 🎯 修复：添加音频播放状态监听
        audioStreamer.onPlaybackStart = () => {
            console.log('🔊 音频实时播放开始');
            chatUI.logMessage('音频开始播放', 'system');
        };
        
        audioStreamer.onPlaybackEnd = () => {
            console.log('🔊 音频实时播放结束');
            chatUI.logMessage('音频播放结束', 'system');
        };
        
        audioStreamer.onPlaybackError = (error) => {
            console.error('🔊 音频播放错误:', error);
            chatUI.logMessage(`音频播放错误: ${error.message}`, 'system');
        };
        
        // 🎯 修复：添加音频播放进度监听
        audioStreamer.onPlaybackProgress = (progress) => {
            // 可以在这里添加音频播放进度显示
            console.log('🔊 音频播放进度:', progress);
        };
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
// 🚀 修复：在连接成功时初始化音频系统
async function connectToWebsocket() {
    if (!apiKeyInput.value) {
        chatUI.logMessage('Please input API Key', 'system');
        return;
    }

    // Save values to localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);

    const config = {
        model: CONFIG.API.MODEL_NAME,
        generationConfig: {
            responseModalities: responseTypeSelect.value === 'audio' ? ['audio'] : ['text'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voiceSelect.value
                    }
                },
            }
        },
        systemInstruction: {
            parts: [{ text: systemInstructionInput.value }],
        }
    };

    try {
        // 🎯 修复：在连接前确保音频系统初始化
        await ensureAudioInitialized();
        
        await client.connect(config, apiKeyInput.value);
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
        
        // 🎯 修复：连接成功后测试音频系统
        console.log('🔊 WebSocket连接成功，音频系统已准备就绪');
        debugAudioState();
        
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
        
        if (videoHandler && videoHandler.getIsVideoActive()) {
            videoHandler.stopVideo();
        }
        
        if (screenHandler && screenHandler.getIsScreenActive()) {
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

// 🚀 修复：WebSocket音频处理 - 监听audio事件并进行实时播放
client.on('audio', (payload) => {
    // payload may be either an ArrayBuffer (legacy) or an object { data: ArrayBuffer, sampleRate: number }
    let buffer = null;
    let detectedSampleRate = null;

    if (payload && payload.data && payload.data instanceof ArrayBuffer) {
        buffer = payload.data;
        detectedSampleRate = payload.sampleRate || null;
    } else if (payload instanceof ArrayBuffer) {
        buffer = payload;
    } else {
        console.warn('Unknown audio payload format', payload);
        return;
    }

    console.log('🚀 接收到实时音频数据:', buffer.byteLength, 'bytes', detectedSampleRate ? `(rate=${detectedSampleRate})` : '');

    // 🎯 实时播放处理
    if (audioStreamer) {
        try {
            const int16Array = new Int16Array(buffer);

            // 如果服务器在 mimeType 中提供了采样率，优先使用
            if (detectedSampleRate && typeof detectedSampleRate === 'number') {
                audioStreamer.sampleRate = detectedSampleRate;
            } else if (!_realtimeDetectDone) {
                // 启动基于到达字节率的估算（仅在没有显式采样率并且尚未完成估算时）
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (!_realtimeDetectStart) {
                    _realtimeDetectStart = now;
                    _realtimeDetectBytes = 0;
                }
                _realtimeDetectBytes += buffer.byteLength;
                const elapsed = (now - _realtimeDetectStart) / 1000;
                // 在累计一定时间后进行估算（0.6s），可以调整阈值
                if (elapsed >= 0.6) {
                    const bytesPerSec = _realtimeDetectBytes / elapsed;
                    const estimatedSampleRate = Math.round(bytesPerSec / 2); // 2 bytes per sample for Int16 mono
                    // 合理范围检查
                    if (estimatedSampleRate >= 8000 && estimatedSampleRate <= 96000) {
                        audioStreamer.sampleRate = estimatedSampleRate;
                        console.log('🔎 估算到服务器采样率:', estimatedSampleRate);
                    } else {
                        console.warn('🔎 估算到的采样率不在合理范围，使用默认值', CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
                    }
                    _realtimeDetectDone = true;
                }
            }

            audioStreamer.addPCM16(int16Array);
            console.log('🔊 实时音频数据已发送到AudioStreamer播放');
        } catch (error) {
            console.error('实时音频播放失败:', error);
        }
    }

    // 累积音频数据用于最终显示（保留原始字节）
    const audioData = new Uint8Array(buffer);
    audioDataBuffer.push(audioData);
});

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

// 🚀 修复：改进 interrupted 事件处理
client.on('interrupted', () => {
    audioStreamer?.stop();
    isUsingTool = false;
    Logger.info('Model interrupted');
    chatUI.logMessage('Model interrupted', 'system');
    
    // 处理文本消息
    if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
        chatHistory.push({
            role: 'assistant',
            content: currentAIMessageContentDiv.rawMarkdownBuffer
        });
    }
    currentAIMessageContentDiv = null;
    
    // 🎯 修复：中断时也处理音频数据
    processAudioData('interrupted');
});

client.on('setupcomplete', () => {
    chatUI.logMessage('Setup complete', 'system');
});

// 🚀 修复：改进 turncomplete 事件处理
client.on('turncomplete', () => {
    isUsingTool = false;
    chatUI.logMessage('Turn complete', 'system');
    
    // 处理文本消息
    if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
        chatHistory.push({
            role: 'assistant',
            content: currentAIMessageContentDiv.rawMarkdownBuffer
        });
    }
    currentAIMessageContentDiv = null; // 重置
    
    // 🎯 修复：处理累积的音频数据，但不重复播放
    // 因为音频已经在实时播放过了，这里只用于生成可下载的音频文件
    processAudioData('turncomplete');

    // 重置实时采样率侦测状态，以便下一轮重新估算
    _realtimeDetectBytes = 0;
    _realtimeDetectStart = 0;
    _realtimeDetectDone = false;

    // 保存历史记录
    if (isConnected && !selectedModelConfig.isWebSocket) {
        historyManager.saveHistory();
    } else if (isConnected && selectedModelConfig.isWebSocket) {
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
 * 🚀 修复：改进音频数据处理，确保实时播放和最终显示都正常工作
 * @param {string} source - 来源 ('turncomplete', 'interrupted', 'user_interrupt')
 */
function processAudioData(source) {
    if (audioDataBuffer.length > 0) {
        try {
            // Use the runtime-detected sample rate from the audioStreamer when available.
            const finalSampleRate = (audioStreamer && audioStreamer.sampleRate) || CONFIG.AUDIO.OUTPUT_SAMPLE_RATE;
            const audioBlob = pcmToWavBlob(audioDataBuffer, finalSampleRate);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (finalSampleRate * 2);
            
            console.log('🚀 处理最终音频数据:', {
                source: source,
                bufferLength: audioDataBuffer.length,
                totalBytes: audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0),
                duration: duration,
                audioUrl: audioUrl
            });
            
            // 🎯 修复：只在需要时才显示音频消息
            // 如果音频已经实时播放过了，可以跳过显示，或者仍然显示供用户重播
            if (source !== 'realtime_only') {
                // 显示音频消息（供重播和下载）
                chatUI.displayAudioMessage(audioUrl, duration, 'ai', audioBlob);
                
                // 将音频消息添加到聊天历史
                chatHistory.push({
                    role: 'assistant',
                    content: `[音频消息，时长: ${duration.toFixed(2)}秒]`,
                    audioData: audioBlob
                });
            }
            
        } catch (error) {
            console.error('音频处理失败:', error);
            chatUI.logMessage(`音频处理失败: ${error.message}`, 'system');
        } finally {
            audioDataBuffer = []; // 清空缓冲区
        }
    }
}

/**
 * @function handleInterruptPlayback
 * @description 处理中断按钮点击事件，停止当前语音播放。
 * @returns {void}
 */
// 🚀 修复：改进中断播放处理
function handleInterruptPlayback() {
    if (audioStreamer) {
        audioStreamer.stop();
        Logger.info('Audio playback interrupted by user.');
        chatUI.logMessage('语音播放已中断', 'system');
        
        // 处理文本消息
        if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
            chatHistory.push({
                role: 'assistant',
                content: currentAIMessageContentDiv.rawMarkdownBuffer
            });
        }
        currentAIMessageContentDiv = null;
        
        // 🎯 修复：用户中断时处理音频数据
        processAudioData('user_interrupt');
    } else {
        Logger.warn('Attempted to interrupt playback, but audioStreamer is not initialized.');
        chatUI.logMessage('当前没有语音播放可中断', 'system');
    }
}

// 🚀 修复：添加音频调试功能
function debugAudioState() {
    console.log('🔊 音频状态调试:', {
        audioCtx: audioCtx ? {
            state: audioCtx.state,
            sampleRate: audioCtx.sampleRate
        } : '未初始化',
        audioStreamer: audioStreamer ? {
            isPlaying: audioStreamer.isPlaying,
            audioQueueLength: audioStreamer.audioQueue ? audioStreamer.audioQueue.length : 0
        } : '未初始化',
        audioDataBuffer: {
            length: audioDataBuffer.length,
            totalBytes: audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0)
        },
        isRecording: isRecording,
        isConnected: isConnected
    });
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
    // 🚀 关键修复：更新按钮状态
    updateConnectionStatus();
    // 如果已连接，断开连接以应用新模型
    if (isConnected) {
        disconnect();
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

    // 🚀 关键修复：根据模型配置决定连接方式
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
        // 对于 HTTP 模式，重置UI状态
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

    // 🚀 关键修复：根据模型类型和连接状态控制按钮状态
    const isWebSocketModel = selectedModelConfig.isWebSocket;
    
    // 媒体按钮仅在 WebSocket 模式且已连接时启用
    const mediaButtons = [micButton, cameraButton, screenButton, chatVoiceInputButton];
    mediaButtons.forEach(btn => {
        if (btn) {
            btn.disabled = !isConnected || !isWebSocketModel;
        }
    });
    
    // 附件按钮仅在 HTTP 模式且已连接时启用
    if (attachmentButton) {
        attachmentButton.disabled = !isConnected || isWebSocketModel;
    }
    
    // 发送按钮在任何模式连接后都启用
    if (sendButton) {
        sendButton.disabled = !isConnected;
    }
    
    // 消息输入框在任何模式连接后都启用
    if (messageInput) {
        messageInput.disabled = !isConnected;
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
     * @description 处理"新建聊天"按钮点击事件，刷新页面以开始新的聊天。
     * @returns {void}
     */
    newChatButton.addEventListener('click', () => {
        if (currentSessionId) {
            cleanupSession(currentSessionId);
        }
        resetFileManagerAuth(); // 🎯 核心修改：重置文件管理器状态（包括关闭模态框）
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
     * @description 处理"新建聊天"按钮点击事件，刷新页面以开始新的聊天。
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
// =========================================================================
// 🚀 [最终方案 - 新增] 监听 Agent 实时生成的图片事件
// =========================================================================
// 这个事件由 DeepResearchAgent.js 中的 _handleGeneratedImage 方法触发，
// 并通过 Orchestrator.js 的 setupHandlers 转发为 'research:image_generated'。
// 它的唯一职责是实时显示图片，不参与最终报告的生成。
window.addEventListener('research:image_generated', (e) => {
    // 从事件详情中解构出标题和 base64 数据
    const { title, base64 } = e.detail.data;
    
    // 检查 chatUI 模块及其 displayImageResult 函数是否可用
    if (window.chatUI && typeof window.chatUI.displayImageResult === 'function') {
        // 构造一个完整的 Data URL，这是 <img> 标签和 displayImageResult 函数所期望的格式
        const dataUrl = `data:image/png;base64,${base64}`;
        
        // 调用您现有的、功能强大的 displayImageResult 函数
        // 它会自动处理图片在聊天窗口的显示、添加点击事件，并连接到 image-manager.js 的模态框
        window.chatUI.displayImageResult(dataUrl, title, `${title.replace(/\s/g, '_')}.png`);
        
        // 给出清晰的用户反馈
        showToast(`✅ Agent 已生成图表: ${title}`);
    } else {
        // 如果 UI 函数不可用，提供一个健壮的降级方案
        console.warn('chatUI.displayImageResult function not found. Cannot display generated image in chat window.');
        chatUI.logMessage(`Agent generated an image: "${title}" (display function unavailable)`, 'system');
    }
});

// 🚀🚀🚀 [v2.2 核心新增] 监听 Agent 生成的文件事件 🚀🚀🚀
// 这个事件由 DeepResearchAgent.js 中的 _executeToolCall 方法触发
window.addEventListener('on_file_generated', (event) => {
    const fileData = event.detail.data;
    console.log("📦 [Main.js] 接收到 on_file_generated 事件，准备创建下载链接...");

    if (fileData && fileData.data_base64) {
        // 调用我们刚刚在 chat-ui.js 中导出的新函数
        chatUI.createFileDownloadLink(
            fileData.data_base64,
            fileData.title,
            fileData.type
        );
        showToast(`✅ Agent 已生成文件: ${fileData.title}`);
    } else {
        console.warn('[Main.js] on_file_generated 事件未包含有效的文件数据。');
        showSystemMessage("Agent尝试生成文件，但未能成功返回文件内容。");
    }
});

// =========================================================================
// 🚀 [最终方案 V2 - 新增] Agent 专属的最终报告渲染入口
// =========================================================================
window.addEventListener('research:end', (e) => {
    console.log("🏁 [Main.js] 接收到 research:end 事件，准备渲染最终报告...");
    const result = e.detail.data;

    // 1. 健壮性检查
    if (!result || !result.report) {
        console.warn("[Main.js] 'research:end' 事件未包含有效的报告内容，跳过渲染。");
        showSystemMessage("研究已结束，但未能生成最终报告。");
        return;
    }

    // 2. 隐藏思考动画
    if (window.agentThinkingDisplay) {
        window.agentThinkingDisplay.hide();
    }

    // 3. 显示摘要卡片 (如果存在 displayAgentSummary 函数)
    if (result.success && typeof displayAgentSummary === 'function') {
        displayAgentSummary(result);
    }
    
    // 4. 获取最终 Markdown 并渲染
    const finalReportMarkdown = result.report;
    const aiMessage = chatUI.createAIMessageElement();
    aiMessage.rawMarkdownBuffer = finalReportMarkdown;
    aiMessage.markdownContainer.innerHTML = marked.parse(finalReportMarkdown);
    
    // 应用数学公式和代码高亮
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([aiMessage.markdownContainer]);
        });
    }
    aiMessage.markdownContainer.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
    
    chatUI.scrollToBottom();

    // 🔥🔥🔥 [核心修改：历史记录持久化] 🔥🔥🔥
    // 确保仅在 HTTP 模式下保存（WebSocket模式通常不保存这种长文本历史）
    if (selectedModelConfig && !selectedModelConfig.isWebSocket) {
        console.log("💾 [Main.js] 正在将 Agent 报告保存到历史记录...");
        
        // 1. 手动将 Agent 的回复推入 chatHistory 全局数组
        // 这是关键：让后续的对话（第5轮、第6轮）能看到这份报告
        chatHistory.push({
            role: 'assistant',
            content: finalReportMarkdown,
            metadata: {
                is_agent_report: true,
                agent_mode: result.research_mode,
                sources_count: result.sources ? result.sources.length : 0
            }
        });

        // 2. 调用 HistoryManager 进行云端保存
        // 确保 historyManager 实例已初始化
        if (historyManager) {
            historyManager.saveHistory();
            console.log("✅ [Main.js] Agent 报告已保存到云端历史。");
        }
    }
    // 🔥🔥🔥 [修改结束] 🔥🔥🔥
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

// 新增：文件上传事件监听
window.addEventListener('file-uploaded', (event) => {
    const { filename, container_path, session_id, file_size } = event.detail;
    
    // 创建系统消息通知模型
    const systemMessage = `文件 "${filename}" 已上传到会话工作区。在代码解释器中可以通过路径 "${container_path}" 访问该文件。`;
    
    // 添加到聊天历史
    chatHistory.push({
        role: 'system',
        content: systemMessage
    });
    
    // 显示系统消息
    showSystemMessage(systemMessage);
    
    console.log(`📁 文件上传成功: ${filename} -> ${container_path} (${file_size} bytes)`);
});

// 新增：会话清理函数
async function cleanupSession(sessionId) {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/v1/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            console.log(`✅ 会话 ${sessionId} 已清理`);
        } else {
            console.warn(`⚠️ 会话清理失败: ${sessionId}`);
        }
    } catch (error) {
        console.error('❌ 会话清理错误:', error);
    }
}

// 新增：页面卸载时清理会话
window.addEventListener('beforeunload', () => {
    if (currentSessionId) {
        // 使用同步请求确保清理完成
        fetch(`/api/v1/sessions/${currentSessionId}`, {
            method: 'DELETE',
            keepalive: true // 确保在页面卸载时请求能完成
        }).catch(() => {
            // 忽略错误，因为页面正在卸载
        });
    }
});

// 🚀 添加调试工具到控制台
window.getAgentStatus = () => orchestrator?.getStatus();
window.getToolStats = () => orchestrator?.getToolStatistics();
window.toggleAgentMode = (enabled) => {
    const toggle = document.getElementById('agent-mode-toggle');
    if (toggle) {
        toggle.checked = enabled;
        toggle.dispatchEvent(new Event('change'));
    }
};

// 🎯 新增：Agent系统状态调试函数
function debugAgentSystem() {
    console.log('🔍 Agent系统状态:', {
        orchestrator: window.orchestrator ? {
            isEnabled: orchestrator.isEnabled,
            initState: orchestrator._initState,
            isInitialized: orchestrator.isInitialized
        } : '未创建',
        agentThinkingDisplay: window.agentThinkingDisplay ? '已创建' : '未创建',
        agentModeToggle: agentModeToggle ? {
            checked: agentModeToggle.checked,
            disabled: agentModeToggle.disabled
        } : '未找到'
    });
}

// Debug helpers: allow manually inspecting/overriding audio sample rate from console
window.setAudioSampleRate = (rate) => {
    if (!audioStreamer) {
        console.warn('audioStreamer 未初始化');
        return;
    }
    audioStreamer.sampleRate = rate;
    console.log('audioStreamer.sampleRate 已设置为', rate);
};

window.getAudioSampleRate = () => audioStreamer?.sampleRate || null;

/**
 * @function startAgentThinking
 * @description 启动 Agent 思考显示，如果实例不存在则创建。
 * @param {string} userMessage - 用户消息。
 * @param {number} [maxIterations=8] - 最大迭代次数。
 * @returns {Promise<string>} 会话 ID。
 */
export async function startAgentThinking(userMessage, maxIterations = 8) {
    // 🎯 修复：由于已在 initializeEnhancedAgent 中提前创建，这里不再需要动态导入和创建
    try {
        if (!agentThinkingDisplay) {
            // 降级处理：如果由于某种原因未创建，则动态导入
            const { AgentThinkingDisplay } = await import('./agent/AgentThinkingDisplay.js');
            agentThinkingDisplay = new AgentThinkingDisplay();
        }
        return agentThinkingDisplay.startSession(userMessage, maxIterations);
    } catch (error) {
        console.error('启动Agent思考显示失败:', error);
        // 返回一个虚拟会话ID，避免阻塞主流程
        return `agent_fallback_${Date.now()}`;
    }
}

/**
 * @function stopAgentThinking
 * @description 停止 Agent 思考显示并隐藏。
 * @param {boolean} [destroy=false] - 是否完全销毁实例。
 * @returns {void}
 */
export function stopAgentThinking(destroy = false) {
    if (agentThinkingDisplay) {
        agentThinkingDisplay.hide();
        if (destroy) {
            // 确保 destroy 方法存在
            if (typeof agentThinkingDisplay.destroy === 'function') {
                agentThinkingDisplay.destroy();
            }
            agentThinkingDisplay = null;
        }
    }
}

/**
 * @function getAgentThinkingDisplay
 * @description 获取当前的Agent思考显示实例（用于调试或高级操作）。
 * @returns {AgentThinkingDisplay|null}
 */
export function getAgentThinkingDisplay() {
    return agentThinkingDisplay;
}

/**
 * @function displayAgentSummary
 * @description 新增：显示Agent执行摘要卡片，避免重复显示完整摘要。
 * @param {Object} agentResult - Agent执行结果对象。
 * @returns {void}
 */
function displayAgentSummary(agentResult) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'message assistant agent-execution-summary'; // 使用 message assistant 类以保持样式一致性
    
    // 确保 messageHistory 元素可用
    const messageHistoryElement = document.getElementById('message-history');
    if (!messageHistoryElement) {
        console.error('messageHistory 元素未找到，无法显示 Agent 摘要。');
        return;
    }

    // 确保 intermediateSteps 是数组
    const toolCount = agentResult.intermediateSteps?.length || 0;
    const statusText = agentResult.success ? '✅ 成功' : '❌ 失败';
    
    summaryDiv.innerHTML = `
        <div class="content">
            <div class="summary-header">
                <span class="summary-icon">📊</span>
                <strong>Agent执行摘要</strong>
            </div>
            <div class="summary-details">
                <span>模型: ${agentResult.model ? agentResult.model.replace('models/', '') : 'N/A'}</span>
                <span>•</span>
                <span>迭代: ${agentResult.iterations}次</span>
                <span>•</span>
                <span>工具: ${toolCount}个</span>
                <span>•</span>
                <span>状态: ${statusText}</span>
            </div>
            <div class="summary-note">
                💡 详细执行过程已在聊天记录中显示
            </div>
        </div>
    `;
    
    // 添加到消息历史中
    messageHistoryElement.appendChild(summaryDiv);
    chatUI.scrollToBottom();
}
