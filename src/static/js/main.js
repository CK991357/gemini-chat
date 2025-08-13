import { AttachmentManager } from './attachments/file-attachment.js'; // T2 新增
import { AudioRecorder } from './audio/audio-recorder.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { ChatAPI } from './chat/chat-api.js'; // T12: 导入 ChatAPI
import * as chatUI from './chat/chat-ui.js'; // T11: 导入聊天UI模块
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

// Manager and State Variables
// These are declared here and initialized in DOMContentLoaded to avoid race conditions.
let attachmentManager = null;
let historyManager = null;
let videoHandler = null;
let screenHandler = null;
let chatApi = null;
let audioRecorder = null;
let audioStreamer = null;
let audioCtx = null;
let micStream = null;

// State variables
let isRecording = false;
let isConnected = false;
let isUserScrolling = false;
let currentAudioElement = null;
let chatHistory = [];
let currentSessionId = null;
let selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);

// Chat voice input state
let isChatRecording = false;
let hasRequestedChatMicPermission = false;
let chatAudioRecorder = null;
let chatAudioChunks = [];
let chatRecordingTimeout = null;
let chatInitialTouchY = 0;

// Translation voice input state
let translationAudioRecorder = null;
let translationAudioChunks = [];
let recordingTimeout = null;
let _isTranslationRecording = false;
let hasRequestedMicPermission = false;

// WebSocket Client Instance
const client = new MultimodalLiveClient();
const toolManager = new ToolManager(); // 初始化 ToolManager

// DOM Elements (grouped for clarity)
// Main Containers & Controls
const logsContainer = document.getElementById('logs-container');
const messageHistory = document.getElementById('message-history');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectButton = document.getElementById('connect-button');
const mobileConnectButton = document.getElementById('mobile-connect');
const newChatButton = document.getElementById('new-chat-button');
const interruptButton = document.getElementById('interrupt-button');

// Config Panel
const configToggle = document.getElementById('toggle-config');
const configContainer = document.querySelector('.control-panel');
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const fpsInput = document.getElementById('fps-input');
const promptSelect = document.getElementById('prompt-select');
const systemInstructionInput = document.getElementById('system-instruction');
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const modelSelect = document.getElementById('model-select');

// Media Controls & Previews
const micButton = document.getElementById('mic-button');
const cameraButton = document.getElementById('camera-button');
const stopVideoButton = document.getElementById('stop-video');
const flipCameraButton = document.getElementById('flip-camera');
const screenButton = document.getElementById('screen-button');
const stopScreenButton = document.getElementById('stop-screen-button');
const mediaPreviewsContainer = document.getElementById('media-previews');
const videoPreviewContainer = document.getElementById('video-container');
const videoPreviewElement = document.getElementById('preview');
const screenContainer = document.getElementById('screen-preview-container');
const screenPreview = document.getElementById('screen-preview-element');

// Attachments
const attachmentButton = document.getElementById('attachment-button');
const fileInput = document.getElementById('file-input');
const fileAttachmentPreviews = document.getElementById('file-attachment-previews');

// UI Toggles & Tabs
const themeToggleBtn = document.getElementById('theme-toggle');
const toggleLogBtn = document.getElementById('toggle-log');
const clearLogsBtn = document.getElementById('clear-logs');
const modeTabs = document.querySelectorAll('.mode-tabs .tab');
const chatContainers = document.querySelectorAll('.chat-container');
const historyContent = document.getElementById('history-list-container');

// Translation Mode
const translationVoiceInputButton = document.getElementById('translation-voice-input-button');
const translationInputTextarea = document.getElementById('translation-input-text');
const translationOcrButton = document.getElementById('translation-ocr-button');
const translationOcrInput = document.getElementById('translation-ocr-input');

// Chat Mode Voice Input
const chatVoiceInputButton = document.getElementById('chat-voice-input-button');

// Vision Mode
const visionModeBtn = document.getElementById('vision-mode-button');
const visionContainer = document.querySelector('.vision-container');
const visionMessageHistory = document.getElementById('vision-message-history');
const visionAttachmentPreviews = document.getElementById('vision-attachment-previews');
const visionInputText = document.getElementById('vision-input-text');
const visionAttachmentButton = document.getElementById('vision-attachment-button');
const visionFileInput = document.getElementById('vision-file-input');
const visionSendButton = document.getElementById('vision-send-button');


// Load saved values from localStorage
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedFPS = localStorage.getItem('video_fps');

if (savedApiKey) apiKeyInput.value = savedApiKey;
if (savedVoice) voiceSelect.value = savedVoice;
if (savedFPS) fpsInput.value = savedFPS;


document.addEventListener('DOMContentLoaded', () => {
    // Configure marked.js for Markdown rendering
    marked.setOptions({
      breaks: true,
      highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
      langPrefix: 'hljs language-'
    });

    // Configure highlight.js
    hljs.configure({
      ignoreUnescapedHTML: true,
      throwUnescapedHTML: false
    });

    // Dynamically populate model select dropdown
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

    // Theme toggle logic
    const body = document.body;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        body.classList.add(savedTheme);
        themeToggleBtn.textContent = savedTheme === 'dark-mode' ? 'dark_mode' : 'light_mode';
    } else {
        const prefersDark = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
        body.classList.add(prefersDark ? 'dark-mode' : 'light-mode');
        themeToggleBtn.textContent = prefersDark ? 'dark_mode' : 'light_mode';
    }

    themeToggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        body.classList.toggle('light-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        themeToggleBtn.textContent = isDarkMode ? 'dark_mode' : 'light_mode';
        localStorage.setItem('theme', isDarkMode ? 'dark-mode' : 'light-mode');
    });

    // Mode switching logic (Text/Log/History)
    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            modeTabs.forEach(t => t.classList.remove('active'));
            chatContainers.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetContainer = document.querySelector(`.chat-container.${mode}-mode`);
            if (targetContainer) {
                targetContainer.classList.add('active');
            }
            if (mode === 'history') {
                historyManager.renderHistoryList();
            }
        });
    });
    document.querySelector('.tab[data-mode="text"]').click(); // Default to text mode

    // Log panel controls
    toggleLogBtn.addEventListener('click', () => document.querySelector('.tab[data-mode="log"]').click());
    clearLogsBtn.addEventListener('click', () => {
        logsContainer.innerHTML = '';
        chatUI.logMessage('日志已清空', 'system');
    });

    // Config panel toggle
    configToggle.addEventListener('click', () => {
        configContainer.classList.toggle('active');
        configToggle.classList.toggle('active');
    });
    applyConfigButton.addEventListener('click', () => {
        configContainer.classList.remove('active');
        configToggle.classList.remove('active');
    });

    // =================================================================
    // == MANAGER INITIALIZATION
    // =================================================================

    attachmentManager = new AttachmentManager({
       chatPreviewsContainer: fileAttachmentPreviews,
       visionPreviewsContainer: visionAttachmentPreviews,
       showToast: showToast,
       showSystemMessage: showSystemMessage
    });

    historyManager = new HistoryManager({
        elements: { historyContent },
        updateChatUI: (sessionData) => {
            messageHistory.innerHTML = '';
            sessionData.messages.forEach(message => {
                if (message.role === 'user') {
                    const textPart = message.content.find(p => p.type === 'text')?.text || '';
                    const imagePart = message.content.find(p => p.type === 'image_url');
                    const file = imagePart ? { base64: imagePart.image_url.url, name: 'Loaded Image' } : null;
                    chatUI.displayUserMessage(textPart, file);
                } else if (message.role === 'assistant') {
                    const aiMessage = chatUI.createAIMessageElement();
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
        logMessage: chatUI.logMessage,
    });
    historyManager.init();

    screenHandler = new ScreenHandler({
        elements: { screenButton, stopScreenButton, fpsInput, mediaPreviewsContainer, screenContainer, screenPreview },
        isConnected: () => isConnected,
        client: client,
        updateMediaPreviewsDisplay: updateMediaPreviewsDisplay,
        logMessage: chatUI.logMessage,
        getSelectedModelConfig: () => selectedModelConfig,
    });

    videoHandler = new VideoHandler({
        elements: { cameraButton, stopVideoButton, flipCameraButton, fpsInput, mediaPreviewsContainer, videoPreviewContainer, videoPreviewElement },
        isConnected: () => isConnected,
        client: client,
        updateMediaPreviewsDisplay: updateMediaPreviewsDisplay,
        logMessage: chatUI.logMessage,
        getSelectedModelConfig: () => selectedModelConfig,
    });

    // T12: Initialize ChatAPI AFTER all its dependencies are created
    chatApi = new ChatAPI({
        client: client,
        toolManager: toolManager,
        callbacks: {
            onConnectionOpen: () => {
                isConnected = true;
                updateConnectionStatus();
                messageInput.disabled = false;
                sendButton.disabled = false;
                chatUI.logMessage('连接成功', 'system');
                historyManager.init(); // 使用 init() 替代不存在的 loadLastSession()
            },
            onConnectionClose: (event) => {
                chatUI.logMessage(`连接关闭: ${event.reason || '未知原因'}`, 'system');
                resetUIForDisconnectedState();
            },
            onConnectionError: (error) => {
                const errorMessage = error ? error.message : '未知错误';
                chatUI.logMessage(`连接错误: ${errorMessage}`, 'system');
                console.error('Connection Error:', error); // 在控制台打印详细错误
                resetUIForDisconnectedState();
            },
            onMessageStart: () => {
                chatUI.createAIMessageElement();
            },
            onMessageStream: (data) => {
                chatUI.updateAIMessage(data);
            },
            onMessageComplete: (finalMessage) => {
                chatUI.finalizeAIMessage(finalMessage);
                const newHistory = [...chatHistory, { role: 'assistant', content: finalMessage }];
                historyManager.setChatHistory(newHistory);
                historyManager.saveHistory();
            },
            onToolCode: (code) => {
                toolManager.displayToolCode(code);
            },
            onAudioStream: async (audioData) => {
                await ensureAudioInitialized();
                audioStreamer.play(audioData);
            },
            onInterrupted: () => {
                if (audioStreamer) audioStreamer.stop();
            },
        },
        stateGetters: {
            getApiKey: () => apiKeyInput.value,
            getVoice: () => voiceSelect.value,
            getSystemInstruction: () => systemInstructionInput.value,
            getResponseType: () => responseTypeSelect.value,
            getChatHistory: () => chatHistory,
            getSelectedModelConfig: () => selectedModelConfig,
            getIsConnected: () => isConnected,
        },
        stateUpdaters: {
            setChatHistory: (newHistory) => { chatHistory = newHistory; },
            setCurrentSessionId: (newId) => { currentSessionId = newId; },
            setIsConnected: (status) => { isConnected = status; },
            addUserMessageToUI: (text, file) => {
                chatUI.displayUserMessage(text, file);
                const userContent = [];
                if (text) userContent.push({ type: 'text', text });
                if (file) userContent.push({ type: 'image_url', image_url: { url: file.base64 } });

                const newHistory = [...historyManager.getChatHistory(), { role: 'user', content: userContent }];
                historyManager.setChatHistory(newHistory);
                historyManager.saveHistory();
            }
        }
    });


    // Other initializations
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
    const mediaHandlers = { videoHandler, screenHandler, updateMediaPreviewsDisplay };
    initializeTranslationCore(translationElements, mediaHandlers, {
        isTranslationRecording,
        startTranslationRecording,
        stopTranslationRecording,
        cancelTranslationRecording,
        resetRecordingState
    }, showToast);

    const visionElements = {
        visionModelSelect: document.getElementById('vision-model-select'),
        visionSendButton: document.getElementById('vision-send-button'),
        visionAttachmentButton: document.getElementById('vision-attachment-button'),
        visionFileInput: document.getElementById('vision-file-input'),
        visionInputText: document.getElementById('vision-input-text'),
        visionMessageHistory: document.getElementById('vision-message-history'),
    };
    initializeVisionCore(visionElements, attachmentManager, { showToast });

    initializePromptSelect(promptSelect, systemInstructionInput);

    chatUI.initChatUI(
       { messageHistory, logsContainer },
       { transcribeAudioHandler, formatTime, isUserScrolling: () => isUserScrolling },
       { marked: window.marked, MathJax: window.MathJax }
    );

    // Mobile specific handlers
    if ('ontouchstart' in window) {
        initMobileHandlers();
    }

    // Scroll handling
    if (messageHistory) {
        messageHistory.addEventListener('wheel', () => { isUserScrolling = true; }, { passive: true });
        messageHistory.addEventListener('scroll', () => {
            if (messageHistory.scrollHeight - messageHistory.clientHeight <= messageHistory.scrollTop + 1) {
                isUserScrolling = false;
            }
        });
    }
});

// =================================================================
// == EVENT LISTENERS
// =================================================================

sendButton.addEventListener('click', () => handleSendMessage(attachmentManager));
messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSendMessage(attachmentManager);
    }
});

connectButton.addEventListener('click', () => isConnected ? disconnect() : connect());
mobileConnectButton?.addEventListener('click', () => isConnected ? disconnect() : connect());

micButton.addEventListener('click', () => { if (isConnected) handleMicToggle(); });
interruptButton.addEventListener('click', handleInterruptPlayback);
newChatButton.addEventListener('click', () => {
    if (selectedModelConfig && !selectedModelConfig.isWebSocket) {
        historyManager.generateNewSession();
    } else {
        chatHistory = [];
        currentSessionId = null;
        messageHistory.innerHTML = '';
        chatUI.logMessage('新聊天已开始', 'system');
        showSystemMessage('实时模式不支持历史记录。');
    }
});

modelSelect.addEventListener('change', () => {
    const selectedModelName = modelSelect.value;
    selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName) || CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME);
    Logger.info(`模型选择已更改为: ${selectedModelConfig.displayName}`);
    chatUI.logMessage(`模型选择已更改为: ${selectedModelConfig.displayName}`, 'system');
    if (isConnected) disconnect();
});

attachmentButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'chat'));

// =================================================================
// == CORE FUNCTIONS
// =================================================================

async function connect() {
    if (chatApi) await chatApi.connect();
}

function disconnect() {
    if (chatApi) chatApi.disconnect();
}

async function handleSendMessage(attachmentManager) {
    const message = messageInput.value.trim();
    const attachedFile = attachmentManager.getAttachedFile();
    if (!message && !attachedFile) return;
    if (chatApi) await chatApi.sendMessage(message, attachedFile);
    messageInput.value = '';
}

function resetUIForDisconnectedState() {
    isConnected = false;
    updateConnectionStatus();
    messageInput.disabled = true;
    sendButton.disabled = true;

    if (audioStreamer) audioStreamer.stop();
    if (audioRecorder) {
        audioRecorder.stop();
        audioRecorder = null;
    }
    isRecording = false;
    updateMicIcon();

    if (videoHandler?.getIsVideoActive()) videoHandler.stopVideo();
    if (screenHandler?.getIsScreenActive()) screenHandler.stopScreenSharing();
}

function updateConnectionStatus() {
    const buttons = [connectButton, mobileConnectButton];
    buttons.forEach(btn => {
        if (btn) {
            btn.textContent = isConnected ? '断开连接' : '连接';
            btn.classList.toggle('connected', isConnected);
        }
    });

    const mediaButtons = [micButton, cameraButton, screenButton, chatVoiceInputButton];
    mediaButtons.forEach(btn => {
        if (btn) btn.disabled = !isConnected || !selectedModelConfig.isWebSocket;
    });
    if (attachmentButton) {
        attachmentButton.disabled = !isConnected || selectedModelConfig.isWebSocket;
    }
}

function updateMediaPreviewsDisplay() {
    const isVideoActive = videoHandler?.getIsVideoActive() || false;
    const isScreenActive = screenHandler?.getIsScreenActive() || false;
    mediaPreviewsContainer.style.display = (isVideoActive || isScreenActive) ? 'flex' : 'none';
    videoPreviewContainer.style.display = isVideoActive ? 'block' : 'none';
    screenContainer.style.display = isScreenActive ? 'block' : 'none';
}

// =================================================================
// == AUDIO HANDLING
// =================================================================

async function ensureAudioInitialized() {
    if (!audioCtx) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') {
            const resume = () => audioCtx.resume().then(() => {
                document.removeEventListener('click', resume);
                document.removeEventListener('touchstart', resume);
            });
            document.addEventListener('click', resume);
            document.addEventListener('touchstart', resume);
        }
    }
    if (!audioStreamer) {
        audioStreamer = new AudioStreamer(audioCtx);
    }
    return audioStreamer;
}

async function handleMicToggle() {
    if (!isRecording) {
        try {
            const permission = await navigator.permissions.query({ name: 'microphone' });
            if (permission.state === 'denied') {
                chatUI.logMessage('麦克风权限被拒绝，请在浏览器设置中启用', 'system');
                return;
            }
            await ensureAudioInitialized();
            audioRecorder = new AudioRecorder();
            await audioRecorder.start((base64Data) => {
                client.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data: base64Data }]);
            });
            isRecording = true;
            chatUI.logMessage('Microphone started', 'system');
        } catch (error) {
            Logger.error('Microphone error:', error);
            chatUI.logMessage(`Error: ${error.message}`, 'system');
            isRecording = false;
        }
    } else {
        if (audioRecorder) audioRecorder.stop();
        isRecording = false;
        chatUI.logMessage('Microphone stopped', 'system');
    }
    updateMicIcon();
}

function updateMicIcon() {
    if (micButton) {
        micButton.textContent = isRecording ? 'mic_off' : 'mic';
        micButton.classList.toggle('active', isRecording);
    }
}

function handleInterruptPlayback() {
    if (audioStreamer) {
        audioStreamer.stop();
        chatUI.logMessage('语音播放已中断', 'system');
    } else {
        chatUI.logMessage('当前没有语音播放可中断', 'system');
    }
}

// =================================================================
// == UTILITY & HELPER FUNCTIONS
// =================================================================

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function pcmToWavBlob(pcmDataBuffers, sampleRate) {
    let dataLength = pcmDataBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

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
        view.buffer.set(pcmBuffer, offset); // More efficient way to copy buffer
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}

export function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

export function showSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-info';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = message;
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    chatUI.scrollToBottom();
}

// =================================================================
// == MOBILE & TRANSLATION SPECIFIC (Could be further modularized)
// =================================================================

function initMobileHandlers() {
    document.getElementById('mic-button').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected) handleMicToggle();
    });
}

function isTranslationRecording() { return _isTranslationRecording; }

async function startTranslationRecording(elements) {
    // Implementation for translation recording
}

async function stopTranslationRecording(elements) {
    // Implementation for stopping translation recording
}

function cancelTranslationRecording(elements) {
    // Implementation for canceling translation recording
}

function resetRecordingState(elements) {
    _isTranslationRecording = false;
    elements.voiceInputButton.classList.remove('recording-active');
}

async function transcribeAudioHandler(audioBlob, buttonElement) {
    // Implementation for transcribing audio
}

// Initial UI state setup
updateConnectionStatus();
