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
}

document.addEventListener('DOMContentLoaded', () => {
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

    // 聊天消息写入 messageHistory (仅当 messageType 为 'text' 时)
    if ((type === 'user' || type === 'ai') && messageType === 'text') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.textContent = type === 'user' ? '👤' : '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        contentDiv.textContent = message; // 暂时只支持纯文本，后续可考虑 Markdown 渲染

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        messageHistory.appendChild(messageDiv);
        
        // 确保在DOM更新后滚动
        scrollToBottom(); // 直接调用，内部有 requestAnimationFrame
    }
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

            // 显示转录文本
            logMessage(transcriptionText, 'ai', 'text'); // 调用 logMessage 函数

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
/**
 * Handles sending a text message.
 */
async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    logMessage(message, 'user');
    messageInput.value = ''; // 清空输入框

    if (selectedModelConfig.isWebSocket) {
        // WebSocket 模式下的逻辑保持不变
        client.send({ text: message });
    } else {
        // HTTP 模式下发送消息 (针对纯文本模型，但支持工具调用)
        try {
            const apiKey = apiKeyInput.value;
            const modelName = selectedModelConfig.name;
            const systemInstruction = systemInstructionInput.value;

            // 初始请求体
            let initialRequestBody = {
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        /**
                         * @description 用户消息内容。
                         * @type {Array<Object>}
                         * @property {string} type - 内容类型，例如 "text"。
                         * @property {string} text - 文本内容。
                         */
                        content: [{ type: "text", text: message }] // 确保 content 包含 type 字段
                    }
                ],
                generationConfig: {
                    responseModalities: ['text']
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
                ],
                tools: toolManager.getToolDeclarations(), // 使用 getToolDeclarations
                stream: true
            };

            if (systemInstruction) {
                initialRequestBody.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            // 调用辅助函数处理 HTTP 流和工具调用
            await processHttpStream(initialRequestBody, apiKey);

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

// 添加消息缓冲机制
let messageBuffer = '';
let bufferTimer = null;

client.on('content', (data) => {
    if (data.modelTurn) {
        if (data.modelTurn.parts.some(part => part.functionCall)) {
            isUsingTool = true;
            Logger.info('Model is using a tool');
        } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
            isUsingTool = false;
            Logger.info('Tool usage completed');
        }

        const text = data.modelTurn.parts.map(part => part.text).join('');
        
        if (text) {
            // 缓冲消息
            messageBuffer += text;
            
            // 清除现有定时器
            if (bufferTimer) clearTimeout(bufferTimer);
            
            // 设置新定时器
            bufferTimer = setTimeout(() => {
                if (messageBuffer.trim()) {
                    logMessage(messageBuffer, 'ai', 'text'); // 明确指定为文本消息
                    messageBuffer = '';
                }
            }, 300); // 300ms缓冲时间
        }
    }
});

client.on('interrupted', () => {
    audioStreamer?.stop();
    isUsingTool = false;
    Logger.info('Model interrupted');
    logMessage('Model interrupted', 'system');
    // 确保在中断时也刷新文本缓冲区
    if (messageBuffer.trim()) {
        logMessage(messageBuffer, 'ai', 'text');
        messageBuffer = '';
    }
    // 处理累积的音频数据
    if (audioDataBuffer.length > 0) {
        const audioBlob = pcmToWavBlob(audioDataBuffer, CONFIG.AUDIO.OUTPUT_SAMPLE_RATE);
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (CONFIG.AUDIO.OUTPUT_SAMPLE_RATE * 2); // 16位PCM，2字节/采样
        displayAudioMessage(audioUrl, duration, 'ai');
        audioDataBuffer = []; // 清空缓冲区
    }
});

client.on('setupcomplete', () => {
    logMessage('Setup complete', 'system');
});

client.on('turncomplete', () => {
    isUsingTool = false;
    logMessage('Turn complete', 'system');
    // 在对话结束时刷新文本缓冲区
    if (messageBuffer.trim()) {
        logMessage(messageBuffer, 'ai', 'text');
        messageBuffer = '';
    }
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
    let accumulatedText = '';
    let currentMessages = requestBody.messages; // 维护消息历史

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
                                    // 停止文本累积，因为模型现在在调用工具
                                    if (accumulatedText.trim()) {
                                        updateLastAIMessage(accumulatedText);
                                        accumulatedText = ''; // 清空已显示的文本
                                    }
                                } else if (choice.delta.content) {
                                    // 只有在没有 functionCall 时才累积文本
                                    if (!functionCallDetected) {
                                        messageBuffer += choice.delta.content || ''; // 累积到 messageBuffer
                                        // 清除现有定时器
                                        if (bufferTimer) clearTimeout(bufferTimer);
                                        // 设置新定时器
                                        bufferTimer = setTimeout(() => {
                                            if (messageBuffer.trim()) {
                                                updateLastAIMessage(messageBuffer); // 使用 updateLastAIMessage
                                                messageBuffer = ''; // 清空缓冲区
                                            }
                                        }, 300); // 300ms缓冲时间
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
            // 确保在处理工具调用前刷新文本缓冲区
            if (messageBuffer.trim()) {
                updateLastAIMessage(messageBuffer);
                messageBuffer = '';
            }

            try {
                isUsingTool = true; // 设置工具使用状态
                logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                const toolResult = await toolManager.handleToolCall(currentFunctionCall); // 使用 handleToolCall

                // 将工具结果作为新的消息发送回模型
                // 注意：Gemini API 的 functionResponse 结构可能与 OpenAI 不同
                // toolManager.handleToolCall 已经返回了 { functionResponses: [{ response: { output: result }, id }] }
                // 我们需要将其转换为 Gemini API 期望的 content 结构
                const toolResponsePart = toolResult.functionResponses[0].response.output; // 假设 output 是实际结果

                const newMessages = [
                    ...currentMessages, // 包含之前的消息历史
                    {
                        role: 'model', // 模型调用工具
                        parts: [{ functionCall: currentFunctionCall }]
                    },
                    {
                        role: 'tool', // 工具返回结果
                        /**
                         * @description 工具响应内容。
                         * @type {Array<Object>}
                         * @property {Object} functionResponse - 函数响应对象。
                         * @property {string} functionResponse.name - 函数名称。
                         * @property {string} functionResponse.content - 工具的实际响应内容，已字符串化。
                         */
                        parts: [{ functionResponse: { name: currentFunctionCall.name, content: JSON.stringify(toolResponsePart) } }] // 确保 content 字段是字符串化的 JSON
                    }
                ];

                // 递归调用，将工具结果发送回模型
                await processHttpStream({
                    ...requestBody,
                    messages: newMessages,
                    tools: toolManager.getToolDeclarations(), // 再次发送工具定义
                }, apiKey);

            } catch (toolError) {
                Logger.error('工具执行失败:', toolError);
                logMessage(`工具执行失败: ${toolError.message}`, 'system');
                // 如果工具执行失败，将错误信息作为工具响应发送回模型
                const newMessages = [
                    ...currentMessages,
                    {
                        role: 'model',
                        parts: [{ functionCall: currentFunctionCall }]
                    },
                    {
                        role: 'tool',
                        parts: [{ functionResponse: { name: currentFunctionCall.name, content: { error: toolError.message } } }]
                    }
                ];
                await processHttpStream({
                    ...requestBody,
                    messages: newMessages,
                    tools: toolManager.getToolDeclarations(),
                }, apiKey);
            } finally {
                isUsingTool = false; // 重置工具使用状态
            }
        } else {
            // 如果没有工具调用，则处理累积的文本
            if (messageBuffer.trim()) { // 使用 messageBuffer
                updateLastAIMessage(messageBuffer);
                messageBuffer = '';
            }
            logMessage('Turn complete (HTTP)', 'system');
        }

    } catch (error) {
        Logger.error('处理 HTTP 流失败:', error);
        logMessage(`处理流失败: ${error.message}`, 'system');
    }
}

/**
 * 更新聊天历史中最后一个 AI 消息的内容。
 * 如果没有 AI 消息，则创建一个新的。
 * @param {string} text - 要更新的文本内容。
 */
function updateLastAIMessage(text) {
    let lastAIMessage = messageHistory.querySelector('.message.ai:last-child .content');
    if (!lastAIMessage) {
        // 如果没有 AI 消息，创建一个新的
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'ai');

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.textContent = '🤖';

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        contentDiv.textContent = text;

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        messageHistory.appendChild(messageDiv);
    } else {
        lastAIMessage.textContent = text;
    }
    scrollToBottom();
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
        // 确保在中断时也刷新文本缓冲区
        if (messageBuffer.trim()) {
            logMessage(messageBuffer, 'ai', 'text');
            messageBuffer = '';
        }
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
    const mediaButtons = [micButton, cameraButton, screenButton];
    mediaButtons.forEach(btn => {
        if (btn) {
            btn.disabled = !isConnected || !selectedModelConfig.isWebSocket;
        }
    });
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
