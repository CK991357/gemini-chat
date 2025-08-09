/**
 * @fileoverview Centralized DOM element declarations.
 * This module queries and exports all necessary DOM elements for the application,
 * making it easier to manage and preventing clutter in the main script.
 */

// 聊天和日志容器
export const logsContainer = document.getElementById('logs-container');
export const messageHistory = document.getElementById('message-history');

// 主要控制按钮和输入框
export const messageInput = document.getElementById('message-input');
export const sendButton = document.getElementById('send-button');
export const connectButton = document.getElementById('connect-button');
export const mobileConnectButton = document.getElementById('mobile-connect');
export const newChatButton = document.getElementById('new-chat-button');
export const interruptButton = document.getElementById('interrupt-button');

// 媒体控制按钮
export const micButton = document.getElementById('mic-button');
export const cameraButton = document.getElementById('camera-button');
export const stopVideoButton = document.getElementById('stop-video');
export const screenButton = document.getElementById('screen-button');
export const stopScreenButton = document.getElementById('stop-screen-button');

// 媒体预览容器
export const mediaPreviewsContainer = document.getElementById('media-previews');
export const videoPreviewContainer = document.getElementById('video-container');
export const videoPreviewElement = document.getElementById('preview');
export const screenContainer = document.getElementById('screen-preview-container');
export const screenPreview = document.getElementById('screen-preview-element');

// 配置面板相关
export const configToggle = document.getElementById('toggle-config');
export const configContainer = document.querySelector('.control-panel');
export const apiKeyInput = document.getElementById('api-key');
export const voiceSelect = document.getElementById('voice-select');
export const fpsInput = document.getElementById('fps-input');
export const promptSelect = document.getElementById('prompt-select');
export const systemInstructionInput = document.getElementById('system-instruction');
export const applyConfigButton = document.getElementById('apply-config');
export const responseTypeSelect = document.getElementById('response-type-select');

// UI切换和模式相关
export const themeToggleBtn = document.getElementById('theme-toggle');
export const toggleLogBtn = document.getElementById('toggle-log');
export const clearLogsBtn = document.getElementById('clear-logs');
export const modeTabs = document.querySelectorAll('.mode-tabs .tab');
export const chatContainers = document.querySelectorAll('.chat-container');
export const historyContent = document.getElementById('history-list-container');

// 附件相关
export const attachmentButton = document.getElementById('attachment-button');
export const fileInput = document.getElementById('file-input');
export const fileAttachmentPreviews = document.getElementById('file-attachment-previews');

// 翻译模式相关
export const translationVoiceInputButton = document.getElementById('translation-voice-input-button');
export const translationInputTextarea = document.getElementById('translation-input-text');
export const chatVoiceInputButton = document.getElementById('chat-voice-input-button');
export const translationOcrButton = document.getElementById('translation-ocr-button');
export const translationOcrInput = document.getElementById('translation-ocr-input');

// 视觉模型相关
export const visionModeBtn = document.getElementById('vision-mode-button');
export const visionContainer = document.querySelector('.vision-container');
export const visionMessageHistory = document.getElementById('vision-message-history');
export const visionAttachmentPreviews = document.getElementById('vision-attachment-previews');
export const visionInputText = document.getElementById('vision-input-text');
export const visionAttachmentButton = document.getElementById('vision-attachment-button');
export const visionFileInput = document.getElementById('vision-file-input');
export const visionSendButton = document.getElementById('vision-send-button');

// 未使用的或已废弃的元素（暂时保留并注释，以便后续确认是否可以彻底删除）
// export const _audioVisualizer = document.getElementById('audio-visualizer');
// export const _inputAudioVisualizer = document.getElementById('input-audio-visualizer');
// export const _logPanel = document.querySelector('.chat-container.log-mode');