import { AudioRecorder } from './audio/audio-recorder.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { CONFIG } from './config/config.js';
import { MultimodalLiveClient } from './core/websocket-client.js';
import { ToolManager } from './tools/tool-manager.js'; // 确保导入 ToolManager
import { Logger } from './utils/logger.js';
import { ScreenRecorder } from './video/screen-recorder.js';
import { VideoManager } from './video/video-manager.js';

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

const VISION_SYSTEM_PROMPT = `你是一个顶级的多模态视觉分析专家，你的首要任务是精确、深入地分析用户提供的视觉材料（如图片、图表、截图、视频等），并根据视觉内容回答问题。
所有回复信息以Markdown格式响应。
严格遵循以下规则进行所有响应：
1. **Markdown格式化：**始终使用标准的Markdown语法进行文本、代码块和列表。
2. **LaTeX数学公式：**对于所有数学公式，使用正确的LaTeX语法。
    - 行内数学公式应使用单个美元符号括起来（例如，$\sin^2\theta + \cos^2\theta = 1$）。
    - 展示数学公式应使用双美元符号括起来（例如，$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$）。
    - 确保所有LaTeX命令拼写正确且正确关闭（例如，\boldsymbol{\sin}而不是\boldsymbol{\sin}}）。
3. **简洁性：**提供直接答案，无需不必要的对话填充、开场白或礼貌用语。
4. **准确性：**确保内容准确并直接回答用户的问题。
`;

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
// const screenIcon = document.getElementById('screen-icon'); // 删除，不再需要
const screenContainer = document.getElementById('screen-preview-container'); // 更新 ID
const screenPreview = document.getElementById('screen-preview-element'); // 更新 ID
const _inputAudioVisualizer = document.getElementById('input-audio-visualizer'); // 保持，可能用于输入音频可视化
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const fpsInput = document.getElementById('fps-input');
const configToggle = document.getElementById('toggle-config');
const configContainer = document.querySelector('.control-panel');
const systemInstructionInput = document.getElementById('system-instruction');
systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT;
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const mobileConnectButton = document.getElementById('mobile-connect');
const interruptButton = document.getElementById('interrupt-button'); // 新增
const newChatButton = document.getElementById('new-chat-button'); // 新增

// 新增的 DOM 元素
const themeToggleBtn = document.getElementById('theme-toggle');
const toggleLogBtn = document.getElementById('toggle-log');
const _logPanel = document.querySelector('.chat-container.log-mode');
const clearLogsBtn = document.getElementById('clear-logs');
const modeTabs = document.querySelectorAll('.mode-tabs .tab');
const chatContainers = document.querySelectorAll('.chat-container');

// 新增媒体预览相关 DOM 元素
const mediaPreviewsContainer = document.getElementById('media-previews');
const videoPreviewContainer = document.getElementById('video-container'); // 对应 video-manager.js 中的 video-container
const videoPreviewElement = document.getElementById('preview'); // 对应 video-manager.js 中的 preview
const stopScreenButton = document.getElementById('stop-screen-button');

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

// 视觉模型相关 DOM 元素
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
    // 如果没有保存的系统指令，使用新的通用翻译系统指令作为默认值
    systemInstructionInput.value = UNIVERSAL_TRANSLATION_SYSTEM_PROMPT;
    CONFIG.SYSTEM_INSTRUCTION.TEXT = UNIVERSAL_TRANSLATION_SYSTEM_PROMPT;
}

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

            // 移除所有 tab 和 chat-container 的 active 类
            modeTabs.forEach(t => t.classList.remove('active'));
            chatContainers.forEach(c => c.classList.remove('active'));

            // 添加当前点击 tab 和对应 chat-container 的 active 类
            tab.classList.add('active');
            document.querySelector(`.chat-container.${mode}-mode`).classList.add('active');

            // 确保在切换模式时停止所有媒体流
            if (videoManager) {
                stopVideo();
            }
            if (screenRecorder) {
                stopScreenSharing();
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
 });

// State variables
let isRecording = false;
let audioStreamer = null;
let audioCtx = null;
let isConnected = false;
let audioRecorder = null;
let micStream = null; // 新增：用于保存麦克风流
let isVideoActive = false;
let videoManager = null;
let isScreenSharing = false;
let screenRecorder = null;
let isUsingTool = false;
let isUserScrolling = false; // 新增：用于判断用户是否正在手动滚动
let audioDataBuffer = []; // 新增：用于累积AI返回的PCM音频数据
let currentAudioElement = null; // 新增：用于跟踪当前播放的音频元素，确保单例播放
let chatHistory = []; // 用于存储聊天历史
let currentSessionId = null; // 用于存储当前会话ID
let isTranslationRecording = false; // 新增：翻译模式下是否正在录音
let hasRequestedTranslationMicPermission = false; // 新增：标记是否已请求过翻译麦克风权限
let translationAudioRecorder = null; // 新增：翻译模式下的 AudioRecorder 实例
let translationAudioChunks = []; // 新增：翻译模式下录制的音频数据块
let recordingTimeout = null; // 新增：用于处理长按录音的定时器
let initialTouchY = 0; // 新增：用于判断手指上滑取消
// 新增：聊天模式语音输入相关状态变量
let isChatRecording = false; // 聊天模式下是否正在录音
let hasRequestedChatMicPermission = false; // 标记是否已请求过聊天麦克风权限
let chatAudioRecorder = null; // 聊天模式下的 AudioRecorder 实例
let chatAudioChunks = []; // 聊天模式下录制的音频数据块
let chatRecordingTimeout = null; // 聊天模式下用于处理长按录音的定时器
let chatInitialTouchY = 0; // 聊天模式下用于判断手指上滑取消
let attachedFile = null; // 新增：用于存储待发送的附件信息
let visionAttachedFiles = []; // 新增：用于存储视觉模型待发送的多个附件信息
let visionChatHistory = []; // 新增：用于存储视觉模式的聊天历史

// Multimodal Client
const client = new MultimodalLiveClient();

// State variables
let selectedModelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === CONFIG.API.MODEL_NAME); // 初始选中默认模型

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

/**
 * 辅助函数：写入字符串到DataView。
 * @param {DataView} view - DataView实例。
 * @param {number} offset - 写入偏移量。
 * @param {string} string - 要写入的字符串。
 */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

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

/**
 * Connects to the WebSocket server.
 * @returns {Promise<void>}
 */
async function connectToWebsocket() {
    if (!apiKeyInput.value) {
        logMessage('Please input API Key', 'system');
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
            const apiKey = apiKeyInput.value;
            const modelName = selectedModelConfig.name;
            const systemInstruction = systemInstructionInput.value;

            if (!currentSessionId) {
                currentSessionId = generateUniqueSessionId();
                logMessage(`新会话开始，ID: ${currentSessionId}`, 'system');
            }

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

            chatHistory.push({
                role: 'user',
                content: userContent // 保持为数组，因为可能包含文本和图片
            });

            // 清除附件（发送后）
            clearAttachedFile();

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

// 声明一个全局变量来跟踪当前 AI 消息的内容 div
let currentAIMessageContentDiv = null;

/**
 * 创建并添加一个新的 AI 消息元素到聊天历史。
 * @returns {HTMLElement} 新创建的 AI 消息的内容 div 元素。
 */
function createAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    
    // 创建Markdown容器
    const markdownContainer = document.createElement('div');
    markdownContainer.classList.add('markdown-container');
    contentDiv.appendChild(markdownContainer);
    
    // 复制按钮（保持不变）
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button', 'material-symbols-outlined');
    copyButton.textContent = 'content_copy';

    /**
     * @function
     * @description 处理复制按钮点击事件，将消息内容复制到剪贴板。
     * @param {Event} event - 点击事件对象。
     * @returns {void}
     */
    copyButton.addEventListener('click', async () => {
        const textToCopy = markdownContainer.textContent; // 从 markdownContainer 获取文本
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

    contentDiv.appendChild(copyButton); // 复制按钮放在内容div内
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    scrollToBottom();
    return {
        container: messageDiv,
        markdownContainer, // 返回Markdown容器引用
        contentDiv,
        rawMarkdownBuffer: '' // 新增：用于累积原始Markdown文本
    };
}

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
                                // 检查是否有 functionCall
                                const functionCallPart = choice.delta.parts?.find(p => p.functionCall);
                                if (functionCallPart) {
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    // 在工具调用前，确保当前 AI 消息完成
                                    if (currentAIMessageContentDiv) {
                                        currentAIMessageContentDiv = null; // 重置，以便工具响应后创建新消息
                                    }
                                } else if (choice.delta.content) {
                                    // 只有在没有 functionCall 时才累积文本
                                    if (!functionCallDetected) {
                                        if (!currentAIMessageContentDiv) {
                                            currentAIMessageContentDiv = createAIMessageElement();
                                        }
                                        // 追加到原始Markdown缓冲区
                                        currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        // 立即渲染Markdown
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
                chatHistory.push({
                    role: 'assistant',
                    content: currentAIMessageContentDiv.rawMarkdownBuffer // AI文本消息统一为字符串
                });
            }
            currentAIMessageContentDiv = null; // 重置，以便工具响应后创建新消息

            try {
                isUsingTool = true;
                logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                const toolResult = await toolManager.handleToolCall(currentFunctionCall);

                const toolResponsePart = toolResult.functionResponses[0].response.output;

                // 将模型调用工具添加到 chatHistory
                chatHistory.push({
                    role: 'assistant', // 模型角色
                    // 恢复使用 parts 数组以匹配参考代码
                    parts: [{
                        functionCall: {
                            name: currentFunctionCall.name,
                            args: currentFunctionCall.args
                        }
                    }]
                });

                // 将工具响应添加到 chatHistory
                chatHistory.push({
                    role: 'tool', // 工具角色
                    // 恢复使用 parts 数组
                    parts: [{
                        functionResponse: {
                            name: currentFunctionCall.name,
                            response: toolResponsePart
                        }
                    }]
                });

                // 递归调用，将工具结果发送回模型
                await processHttpStream({
                    ...requestBody,
                    messages: chatHistory, // 直接使用更新后的 chatHistory
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId // 确保传递会话ID
                }, apiKey);

            } catch (toolError) {
                Logger.error('工具执行失败:', toolError);
                logMessage(`工具执行失败: ${toolError.message}`, 'system');
                
                // 将模型调用工具添加到 chatHistory (即使失败也要记录)
                chatHistory.push({
                    role: 'assistant',
                    parts: [{
                        functionCall: {
                            name: currentFunctionCall.name,
                            args: currentFunctionCall.args
                        }
                    }]
                });

                // 将工具错误响应添加到 chatHistory
                chatHistory.push({
                    role: 'tool',
                    parts: [{
                        functionResponse: {
                            name: currentFunctionCall.name,
                            response: { error: toolError.message }
                        }
                    }]
                });

                await processHttpStream({
                    ...requestBody,
                    messages: chatHistory, // 直接使用更新后的 chatHistory
                    tools: toolManager.getToolDeclarations(),
                    sessionId: currentSessionId // 确保传递会话ID
                }, apiKey);
            } finally {
                isUsingTool = false;
            }
        } else {
            // 如果没有工具调用，且流已完成，将完整的 AI 响应添加到 chatHistory
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                chatHistory.push({
                    role: 'assistant',
                    content: currentAIMessageContentDiv.rawMarkdownBuffer // AI文本消息统一为字符串
                });
            }
            currentAIMessageContentDiv = null; // 重置
            logMessage('Turn complete (HTTP)', 'system');
        }

    } catch (error) {
        Logger.error('处理 HTTP 流失败:', error);
        logMessage(`处理流失败: ${error.message}`, 'system');
        // 错误发生时也重置 currentAIMessageContentDiv
        if (currentAIMessageContentDiv) {
            currentAIMessageContentDiv = null;
        }
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
    if (!apiKeyInput.value) {
        logMessage('请输入 API Key', 'system');
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

/**
 * Updates the display of media preview containers.
 */
function updateMediaPreviewsDisplay() {
    if (isVideoActive || isScreenSharing) {
        mediaPreviewsContainer.style.display = 'flex'; // 使用 flex 布局
        if (isVideoActive) {
            videoPreviewContainer.style.display = 'block';
        } else {
            videoPreviewContainer.style.display = 'none';
        }
        if (isScreenSharing) {
            screenContainer.style.display = 'block';
        } else {
            screenContainer.style.display = 'none';
        }
    } else {
        mediaPreviewsContainer.style.display = 'none';
    }
}

/**
 * Handles the video toggle. Starts or stops video streaming.
 * @returns {Promise<void>}
 */
async function handleVideoToggle() {
    if (!isVideoActive) {
        // 开启摄像头逻辑...
        Logger.info('Video toggle clicked, current state:', { isVideoActive, isConnected });
        
        localStorage.setItem('video_fps', fpsInput.value);

        try {
            // 显示预览容器
            mediaPreviewsContainer.style.display = 'flex';
            videoPreviewContainer.style.display = 'block';

            Logger.info('Attempting to start video');
            if (!videoManager) {
                videoManager = new VideoManager(videoPreviewElement, { // 传入 videoPreviewElement
                    width: 640,
                    height: 480,
                    facingMode: 'user' // 默认前置摄像头
                });
            }
            
            await videoManager.start(fpsInput.value,(frameData) => {
                if (isConnected) {
                    client.sendRealtimeInput([frameData]);
                }
            });

            isVideoActive = true;
            cameraButton.classList.add('active');
            cameraButton.textContent = 'videocam_off'; // 直接修改按钮文本
            updateMediaPreviewsDisplay(); // 更新预览显示
            Logger.info('摄像头已启动');
            logMessage('摄像头已启动', 'system');

        } catch (error) {
            Logger.error('摄像头错误:', error);
            logMessage(`错误: ${error.message}`, 'system');
            isVideoActive = false;
            videoManager = null;
            cameraButton.classList.remove('active');
            cameraButton.textContent = 'videocam'; // 直接修改按钮文本
            // 错误处理时隐藏预览
            mediaPreviewsContainer.style.display = 'none';
            videoPreviewContainer.style.display = 'none';
            updateMediaPreviewsDisplay(); // 更新预览显示
        }
    } else {
        // 修复：确保能通过控制台按钮关闭摄像头
        stopVideo();
    }
}

/**
 * Stops the video streaming.
 */
function stopVideo() {
    // 确保更新状态
    isVideoActive = false;
    // 修复：更新控制台按钮状态
    cameraButton.textContent = 'videocam';
    cameraButton.classList.remove('active');
    
    // 其余关闭逻辑保持不变...
    Logger.info('Stopping video...');
    if (videoManager) {
        videoManager.stop(); // 调用 videoManager 自身的停止方法
        // 关闭视频流
        if (videoManager.stream) { // videoManager.stream 应该保存了 MediaStream 对象
            videoManager.stream.getTracks().forEach(track => track.stop());
        }
        videoManager = null; // 清空 videoManager 引用
    }
    // 停止时隐藏预览
    mediaPreviewsContainer.style.display = 'none';
    videoPreviewContainer.style.display = 'none';
    updateMediaPreviewsDisplay(); // 更新预览显示
    logMessage('摄像头已停止', 'system');
}

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
            updateMediaPreviewsDisplay(); // 更新预览显示
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
            updateMediaPreviewsDisplay(); // 更新预览显示
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
    updateMediaPreviewsDisplay(); // 更新预览显示
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
        chatHistory = []; // 清空聊天历史
        currentSessionId = null; // 重置会话ID
        messageHistory.innerHTML = ''; // 清空显示区域
        logMessage('新聊天已开始', 'system');
        // 如果不需要完全刷新页面，可以移除这行
        // location.reload();
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
 * @function generateUniqueSessionId
 * @description 生成一个唯一的会话ID。
 * @returns {string} 唯一的会话ID字符串。
 */
function generateUniqueSessionId() {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
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
    if (translationVoiceInputButton) translationVoiceInputButton.style.display = 'inline-flex'; // 使用 inline-flex 保持 Material Symbols 的对齐
    // 翻译模式下隐藏聊天语音输入按钮
    if (chatVoiceInputButton) chatVoiceInputButton.style.display = 'none';
  });
  
  chatModeBtn.addEventListener('click', () => {
    translationContainer.classList.remove('active');
    chatContainer.classList.add('active');
    if (visionContainer) visionContainer.classList.remove('active'); // 新增：隐藏视觉容器
    logContainer.classList.remove('active'); // 确保日志容器在聊天模式下也隐藏
    
    // 恢复聊天模式特有的元素显示
    updateMediaPreviewsDisplay(); // 根据视频/屏幕共享状态更新媒体预览显示
    if (inputArea) inputArea.style.display = 'flex'; // 恢复输入区域显示

    translationModeBtn.classList.remove('active');
    chatModeBtn.classList.add('active');
    if (visionModeBtn) visionModeBtn.classList.remove('active'); // 新增：取消视觉按钮激活
    // 聊天模式下隐藏翻译语音输入按钮
    if (translationVoiceInputButton) translationVoiceInputButton.style.display = 'none';
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
    if (translationVoiceInputButton) translationVoiceInputButton.style.display = 'none';
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
      if (translationVoiceInputButton) translationVoiceInputButton.style.display = 'none';
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
  if (translationVoiceInputButton) {
    // 鼠标事件
    translationVoiceInputButton.addEventListener('mousedown', startTranslationRecording);
    translationVoiceInputButton.addEventListener('mouseup', stopTranslationRecording);
    translationVoiceInputButton.addEventListener('mouseleave', (e) => {
      // 如果鼠标在按住时移出按钮区域，也视为取消
      if (isTranslationRecording) {
        cancelTranslationRecording();
      }
    });

    // 触摸事件
    translationVoiceInputButton.addEventListener('touchstart', (e) => {
      e.preventDefault(); // 阻止默认的触摸行为，如滚动
      initialTouchY = e.touches[0].clientY; // 记录初始Y坐标
      startTranslationRecording();
    });
    translationVoiceInputButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      stopTranslationRecording();
    });
    translationVoiceInputButton.addEventListener('touchmove', (e) => {
      if (isTranslationRecording) {
        const currentTouchY = e.touches[0].clientY;
        // 如果手指上滑超过一定距离，视为取消
        if (initialTouchY - currentTouchY > 50) { // 50px 阈值
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
    if (e.key === 'Escape' && isTranslationRecording) {
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
 * @function startTranslationRecording
 * @description 开始翻译模式下的语音录音。
 * @returns {Promise<void>}
 */
async function startTranslationRecording() {
  if (isTranslationRecording) return;

  // 首次点击，只请求权限
  if (!hasRequestedTranslationMicPermission) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 成功获取权限后，立即停止流，因为我们只是为了请求权限
      stream.getTracks().forEach(track => track.stop());
      hasRequestedTranslationMicPermission = true;
      logMessage('已请求并获取麦克风权限。请再次点击开始录音。', 'system');
      translationVoiceInputButton.textContent = '点击开始录音'; // 提示用户再次点击
      // 不开始录音，直接返回
      return;
    } catch (error) {
      logMessage(`获取麦克风权限失败: ${error.message}`, 'system');
      console.error('获取麦克风权限失败:', error);
      alert('无法访问麦克风。请确保已授予麦克风权限。');
      resetTranslationRecordingState(); // 权限失败时重置所有状态
      hasRequestedTranslationMicPermission = false; // 确保权限请求状态也重置
      return;
    }
  }

  // 权限已请求过，现在开始录音
  try {
    logMessage('开始录音...', 'system');
    translationVoiceInputButton.classList.add('recording-active'); // 添加录音激活类
    translationInputTextarea.placeholder = '正在录音，请说话...';
    translationInputTextarea.value = ''; // 清空输入区

    translationAudioChunks = []; // 清空之前的音频数据
    translationAudioRecorder = new AudioRecorder(); // 创建新的 AudioRecorder 实例

    await translationAudioRecorder.start((chunk) => {
      // AudioRecorder 现在应该返回 ArrayBuffer 或 Uint8Array
      translationAudioChunks.push(chunk);
    }, { returnRaw: true }); // 传递选项，让 AudioRecorder 返回原始 ArrayBuffer

    isTranslationRecording = true;
    translationVoiceInputButton.textContent = '录音中...'; // 更新按钮文本

    // 设置一个超时，防止用户忘记松开按钮
    recordingTimeout = setTimeout(() => {
      if (isTranslationRecording) {
        logMessage('录音超时，自动停止并发送', 'system');
        stopTranslationRecording();
      }
    }, 60 * 1000); // 最长录音 60 秒

  } catch (error) {
    logMessage(`启动录音失败: ${error.message}`, 'system');
    console.error('启动录音失败:', error);
    alert('无法访问麦克风。请确保已授予麦克风权限。');
    resetTranslationRecordingState(); // 录音失败时重置所有状态
    hasRequestedTranslationMicPermission = false; // 确保权限请求状态也重置
  }
}

/**
 * @function stopTranslationRecording
 * @description 停止翻译模式下的语音录音并发送进行转文字。
 * @returns {Promise<void>}
 */
async function stopTranslationRecording() {
  if (!isTranslationRecording) return;

  clearTimeout(recordingTimeout); // 清除超时定时器
  logMessage('停止录音，正在转文字...', 'system');
  translationVoiceInputButton.classList.remove('recording-active'); // 移除录音激活类
  translationInputTextarea.placeholder = '正在处理语音...';

  try {
    if (translationAudioRecorder) {
      translationAudioRecorder.stop(); // 停止录音
      translationAudioRecorder = null;
    }

    if (translationAudioChunks.length === 0) {
      logMessage('没有录到音频，请重试', 'system');
      resetTranslationRecordingState();
      return;
    }

    // 将所有音频块合并成一个 Uint8Array
    const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const mergedAudioData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of translationAudioChunks) {
      mergedAudioData.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    translationAudioChunks = []; // 清空缓冲区

    // 将合并后的原始音频数据转换为 WAV Blob
    const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE); // 使用 pcmToWavBlob 函数

    // 发送转文字请求到 Worker
    const response = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: {
        'Content-Type': audioBlob.type, // 使用 Blob 的 MIME 类型
      },
      body: audioBlob,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`转文字失败: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    const transcriptionText = result.text || '未获取到转录文本。';

    translationInputTextarea.value = transcriptionText; // 打印到输入区
    logMessage('语音转文字成功', 'system');

  } catch (error) {
    logMessage(`语音转文字失败: ${error.message}`, 'system');
    console.error('语音转文字失败:', error);
    translationInputTextarea.placeholder = '语音转文字失败，请重试。';
  } finally {
    resetTranslationRecordingState();
    hasRequestedTranslationMicPermission = false; // 录音停止后，重置权限请求状态
  }
}

/**
 * @function cancelTranslationRecording
 * @description 取消翻译模式下的语音录音。
 * @returns {void}
 */
function cancelTranslationRecording() {
  if (!isTranslationRecording) return;

  clearTimeout(recordingTimeout); // 清除超时定时器
  logMessage('录音已取消', 'system');
  
  if (translationAudioRecorder) {
    translationAudioRecorder.stop(); // 停止录音
    translationAudioRecorder = null;
  }
  translationAudioChunks = []; // 清空音频数据
  resetTranslationRecordingState();
  translationInputTextarea.placeholder = '输入要翻译的内容...';
  hasRequestedTranslationMicPermission = false; // 录音取消后，重置权限请求状态
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
 * @function resetTranslationRecordingState
 * @description 重置翻译模式录音相关的状态。
 * @returns {void}
 */
function resetTranslationRecordingState() {
  isTranslationRecording = false;
  translationVoiceInputButton.classList.remove('recording-active'); // 移除录音激活类
  translationVoiceInputButton.textContent = '语音输入'; // 恢复按钮文本
}

/**
 * @function handleTranslation
 * @description 处理翻译请求，获取输入内容、语言和模型，向后端发送翻译请求，并显示翻译结果。
 * @returns {Promise<void>}
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
    // 构建提示词
    const prompt = inputLang === 'auto' ?
      `你是一个专业的翻译助手，请将以下内容翻译成${getLanguageName(outputLang)}：\n\n${inputText}` :
      `你是一个专业的翻译助手，请将以下内容从${getLanguageName(inputLang)}翻译成${getLanguageName(outputLang)}：\n\n${inputText}`;
    
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization 头部由后端 worker.js 在 handleTranslationRequest 中处理
      },
      body: JSON.stringify({
        model: model,
        messages: [
            {
                role: 'system',
                content: systemInstructionInput.value
                    .replace(/\{\{to\}\}/g, getLanguageName(outputLang))
                    .replace(/\{\{title_prompt\}\}/g, '') // 暂时替换为空字符串
                    .replace(/\{\{summary_prompt\}\}/g, '') // 暂时替换为空字符串
                    .replace(/\{\{terms_prompt\}\}/g, '') // 暂时替换为空字符串
            },
            { role: 'user', content: prompt }
        ],
        stream: false // 翻译通常不需要流式响应
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
 * @function getLanguageName
 * @description 根据语言代码获取语言的中文名称。
 * @param {string} code - 语言代码（如 'en', 'zh', 'auto'）。
 * @returns {string} 语言的中文名称或原始代码（如果未找到）。
 */
function getLanguageName(code) {
  const language = CONFIG.TRANSLATION.LANGUAGES.find(lang => lang.code === code);
  return language ? language.name : code;
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
 * ----------------------------------------------------------------
 * 附件处理相关函数
 * ----------------------------------------------------------------
 */

async function handleFileAttachment(event, mode = 'chat') {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const previewsContainer = mode === 'vision' ? visionAttachmentPreviews : fileAttachmentPreviews;
    const fileList = mode === 'vision' ? visionAttachedFiles : [attachedFile]; // a bit of a hack for single vs multi file

    for (const file of files) {
        // 检查文件类型和大小
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm'];
        if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showSystemMessage(`不支持的文件类型: ${file.type}。`);
            continue;
        }
        if (file.size > 20 * 1024 * 1024) { // 20MB 大小限制
            showSystemMessage('文件大小不能超过 20MB。');
            continue;
        }

        try {
            const base64String = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });

            const fileData = {
                name: file.name,
                type: file.type,
                base64: base64String
            };

            if (mode === 'vision') {
                visionAttachedFiles.push(fileData);
                displayFilePreview({
                    type: file.type.startsWith('image/') ? 'image' : 'video',
                    src: base64String,
                    name: file.name,
                    mode: 'vision',
                    index: visionAttachedFiles.length - 1
                });
            } else {
                // Chat mode currently only supports one attachment
                clearAttachedFile(); // Clear previous before adding new one
                attachedFile = fileData;
                displayFilePreview({
                    type: file.type.startsWith('image/') ? 'image' : 'pdf',
                    src: base64String,
                    name: file.name,
                    mode: 'chat'
                });
            }
            showToast(`文件已附加: ${file.name}`);

        } catch (error) {
            console.error('处理文件时出错:', error);
            showSystemMessage(`处理文件失败: ${error.message}`);
        }
    }

    // 重置 file input 以便可以再次选择同一个文件
    event.target.value = '';
}

/**
 * @function displayFilePreview
 * @description 在预览区域显示选定文件的预览。
 * @param {object} options - 预览选项。
 * @param {string} options.type - 预览类型 ('image' 或 'canvas')。
 * @param {string} [options.src] - 图像的 Base64 数据 URL (如果 type 是 'image')。
 * @param {HTMLCanvasElement} [options.canvas] - Canvas 元素 (如果 type 是 'canvas')。
 * @param {string} options.name - 文件名。
 */
function displayFilePreview({ type, src, name, mode, index }) {
    const container = mode === 'vision' ? visionAttachmentPreviews : fileAttachmentPreviews;
    
    // Clear previous preview in chat mode
    if (mode === 'chat') {
        container.innerHTML = '';
    }

    const previewCard = document.createElement('div');
    previewCard.className = 'file-preview-card';
    previewCard.title = name;
    if (mode === 'vision') {
        previewCard.dataset.index = index;
    }

    let previewElement;
    if (type.startsWith('image')) {
        previewElement = document.createElement('img');
        previewElement.src = src;
        previewElement.alt = name;
    } else if (type.startsWith('video')) {
        previewElement = document.createElement('video');
        previewElement.src = src;
        previewElement.alt = name;
        previewElement.muted = true;
        previewElement.autoplay = true;
        previewElement.loop = true;
        previewElement.playsInline = true;
    } else { // PDF or other
        previewElement = document.createElement('div');
        previewElement.className = 'file-placeholder';
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'description'; // PDF icon
        const text = document.createElement('p');
        text.textContent = name;
        previewElement.appendChild(icon);
        previewElement.appendChild(text);
    }


    const closeButton = document.createElement('button');
    closeButton.className = 'close-button material-symbols-outlined';
    closeButton.textContent = 'close';
    closeButton.onclick = (e) => {
        e.stopPropagation();
        if (mode === 'vision') {
            removeVisionAttachment(index);
        } else {
            clearAttachedFile();
        }
    };

    previewCard.appendChild(previewElement);
    previewCard.appendChild(closeButton);
    container.appendChild(previewCard);
}

/**
 * @function clearAttachedFile
 * @description 清除已附加的文件状态和预览。
 */
function clearAttachedFile(mode = 'chat') {
    if (mode === 'vision') {
        visionAttachedFiles = [];
        visionAttachmentPreviews.innerHTML = '';
    } else {
        attachedFile = null;
        fileAttachmentPreviews.innerHTML = '';
    }
}




function removeVisionAttachment(indexToRemove) {
    visionAttachedFiles.splice(indexToRemove, 1);
    // Re-render all previews to correctly update indices
    visionAttachmentPreviews.innerHTML = '';
    visionAttachedFiles.forEach((file, index) => {
        displayFilePreview({
            type: file.type,
            src: file.base64,
            name: file.name,
            mode: 'vision',
            index: index
        });
    });
}


async function handleSendVisionMessage() {
    const text = visionInputText.value.trim();
    if (!text && visionAttachedFiles.length === 0) {
        showToast('请输入文本或添加附件。');
        return;
    }

    const visionModelSelect = document.getElementById('vision-model-select');
    const selectedModel = visionModelSelect.value;

    // 显示用户消息
    displayVisionUserMessage(text, visionAttachedFiles);

    // 将用户消息添加到历史记录
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    // 清理输入
    visionInputText.value = '';
    clearAttachedFile('vision');

    // 显示加载状态
    visionSendButton.disabled = true;
    visionSendButton.textContent = 'progress_activity';
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';

    try {
        // 统一使用流式请求
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: 'system', content: VISION_SYSTEM_PROMPT },
                    ...visionChatHistory
                ],
                stream: true, // 始终启用流式响应
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API 请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let finalContent = ''; // 用于存储最终的 content 部分
        let reasoningStarted = false;

        markdownContainer.innerHTML = ''; // 清空 "加载中" 消息

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n\n').forEach(part => {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (delta) {
                            // 处理思维链内容
                            if (delta.reasoning_content) {
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block'; // 显示思维链容器
                                    reasoningStarted = true;
                                }
                                // 使用 innerHTML 追加，以便渲染 Markdown 换行等
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            // 处理主要内容
                            if (delta.content) {
                                finalContent += delta.content;
                                markdownContainer.innerHTML = marked.parse(finalContent);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
            });
            visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
        }

        // 流结束后，对最终内容进行一次 MathJax 排版
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }
        
        // 将最终的 AI content（不包含思维链）添加到历史记录
        visionChatHistory.push({ role: 'assistant', content: finalContent });

    } catch (error) {
        console.error('Error sending vision message:', error);
        markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
    } finally {
        visionSendButton.disabled = false;
        visionSendButton.textContent = 'send';
    }
}

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
    visionMessageHistory.appendChild(messageDiv);
    visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
}

function createVisionAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    
    // 新增：思维链容器
    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none'; // 默认隐藏
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
            // 合并思维链和主要内容进行复制
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.textContent = 'check';
            setTimeout(() => { copyButton.textContent = 'content_copy'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    contentDiv.appendChild(copyButton);
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    visionMessageHistory.appendChild(messageDiv);
    visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
    
    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer, // 返回思维链容器
        contentDiv,
    };
}

/**
 * @function initVision
 * @description 初始化视觉功能，主要是填充模型选择下拉菜单。
 * @returns {void}
 */
function initVision() {
    const visionModelSelect = document.getElementById('vision-model-select');
    if (!visionModelSelect) return;

    visionModelSelect.innerHTML = ''; // 清空现有选项
    CONFIG.VISION.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.VISION.DEFAULT_MODEL) {
            option.selected = true;
        }
        visionModelSelect.appendChild(option);
    });
}
