import { CONFIG } from '../config/config.js';
import { showSystemMessage, showToast } from '../main.js';
import { AudioRecorder } from './audio-recorder.js';

/**
 * @fileoverview Handles the floating microphone button's UI interactions and recording logic for mobile WebSocket mode.
 */

// DOM Elements
let floatingMicButton;
let messageInput;
let sendButton;

// Dependencies injected from main.js
let client;
let isConnected;
let selectedModelConfig;
let chatUI;
let pcmToWavBlob;

// State variables for floating mic
let isFloatingMicRecording = false;
let hasRequestedMicPermission; // 从 deps 接收统一的权限状态
let floatingMicAudioRecorder = null;
let floatingMicAudioChunks = [];
let floatingMicInitialTouchY = 0;
let isFloatingMicCancelling = false;
let floatingMicRecordingTimeout = null;

/**
 * @function initFloatingMicButton
 * @description Initializes the floating microphone button's event listeners and dependencies.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.client - WebSocket client instance.
 * @param {Function} deps.isConnected - Function to check WebSocket connection status.
 * @param {object} deps.selectedModelConfig - Currently selected model configuration.
 * @param {HTMLElement} deps.messageInput - The message input textarea element.
 * @param {HTMLElement} deps.sendButton - The send button element.
 * @param {Function} deps.showToast - Function to display toast messages.
 * @param {Function} deps.showSystemMessage - Function to display system messages in chat.
 * @param {object} deps.chatUI - Chat UI module.
 * @param {Function} deps.pcmToWavBlob - Function to convert PCM data to WAV Blob.
 * @param {object} deps.CONFIG - Global configuration object.
 * @param {Function} deps.hasRequestedMicPermission - Function to get the unified microphone permission status.
 * @param {Function} deps.updateMicButtonStates - Function to update the state of microphone buttons.
 */
export function initFloatingMicButton(deps) {
    ({ client, isConnected, selectedModelConfig, messageInput, sendButton, showToast, showSystemMessage, chatUI, pcmToWavBlob, CONFIG, hasRequestedMicPermission, updateMicButtonStates } = deps);

    floatingMicButton = document.getElementById('floating-mic-button');

    if (!floatingMicButton) {
        console.warn('Floating mic button element not found.');
        return;
    }

    // Check microphone permission initially and update button visibility
    checkMicPermissionAndSetVisibility();

    // Add event listeners
    floatingMicButton.addEventListener('touchstart', handleFloatingMicTouchStart);
    floatingMicButton.addEventListener('touchmove', handleFloatingMicTouchMove);
    floatingMicButton.addEventListener('touchend', handleFloatingMicTouchEnd);
}

/**
 * @function checkMicPermissionAndSetVisibility
 * @description Checks microphone permission and sets the visibility of the floating mic button.
 * @returns {Promise<void>}
 */
async function checkMicPermissionAndSetVisibility() {
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        if (permissionStatus.state === 'granted') {
            floatingMicButton.style.display = 'flex'; // Show button if permission is granted
            // hasRequestedMicPermission = true; // 不再在此处直接设置，而是通过 deps 传递
        } else {
            floatingMicButton.style.display = 'none'; // Hide button if permission is not granted
            // hasRequestedMicPermission = false; // 不再在此处直接设置
        }
        // Listen for changes in permission status
        permissionStatus.onchange = () => {
            if (permissionStatus.state === 'granted') {
                floatingMicButton.style.display = 'flex';
                // hasRequestedMicPermission = true; // 不再在此处直接设置
            } else {
                floatingMicButton.style.display = 'none';
                // hasRequestedMicPermission = false; // 不再在此处直接设置
            }
        };
    } catch (error) {
        console.error('Error checking microphone permission:', error);
        floatingMicButton.style.display = 'none'; // Hide button on error
        hasRequestedFloatingMicPermission = false;
    }
}

/**
 * @function handleFloatingMicTouchStart
 * @description Handles the touchstart event for the floating microphone button.
 * @param {TouchEvent} e - The touch event object.
 * @returns {Promise<void>}
 */
async function handleFloatingMicTouchStart(e) {
    e.preventDefault(); // Prevent default touch behavior (e.g., scrolling)

    if (!isConnected() || !selectedModelConfig.isWebSocket) {
        showSystemMessage('请先连接到 WebSocket 模式。');
        return;
    }

    if (isFloatingMicRecording) return;

    // 首次触摸，只请求权限
    if (!hasRequestedMicPermission()) { // 使用统一的权限状态
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately after getting permission
            // hasRequestedMicPermission = true; // 不再在此处直接设置
            showToast('已获取麦克风权限，请再次按住按钮开始录音');
            return;
        } catch (error) {
            showSystemMessage(`获取麦克风权限失败: ${error.message}`);
            console.error('获取麦克风权限失败:', error);
            resetFloatingMicState();
            // hasRequestedMicPermission = false; // Reset permission state on error
            return;
        }
    }

    // 权限已请求过，现在开始录音
    try {
        showToast('录音已开始...');
        floatingMicButton.classList.add('recording');
        messageInput.placeholder = '正在录音，请说话...';
        messageInput.value = '';
        messageInput.disabled = true;
        sendButton.disabled = true;
        updateMicButtonStates(false, true); // 启动浮动麦克风，禁用主麦克风

        floatingMicAudioChunks = [];
        floatingMicAudioRecorder = new AudioRecorder();

        await floatingMicAudioRecorder.start((chunk) => {
            floatingMicAudioChunks.push(chunk);
        }, { returnRaw: true });

        isFloatingMicRecording = true;
        isFloatingMicCancelling = false; // Reset cancelling state
        floatingMicInitialTouchY = e.touches[0].clientY; // Record initial Y for swipe detection

        floatingMicRecordingTimeout = setTimeout(() => {
            if (isFloatingMicRecording) {
                showToast('录音超时，自动停止');
                stopFloatingMicRecordingAndSend();
            }
        }, 60 * 1000); // 60 seconds timeout

    } catch (error) {
        showSystemMessage(`启动录音失败: ${error.message}`);
        console.error('启动录音失败:', error);
        resetFloatingMicState();
        // hasRequestedMicPermission = false; // Reset permission state on error
    }
}

/**
 * @function handleFloatingMicTouchMove
 * @description Handles the touchmove event for the floating microphone button, for swipe-to-cancel.
 * @param {TouchEvent} e - The touch event object.
 * @returns {void}
 */
function handleFloatingMicTouchMove(e) {
    if (!isFloatingMicRecording || isFloatingMicCancelling) return;

    const currentY = e.touches[0].clientY;
    const deltaY = floatingMicInitialTouchY - currentY; // Positive for upward swipe

    const swipeThreshold = 50; // Pixels to swipe up to trigger cancel

    if (deltaY > swipeThreshold) {
        cancelFloatingMicRecording();
        floatingMicButton.classList.add('cancelling');
        isFloatingMicCancelling = true;
    }
}

/**
 * @function handleFloatingMicTouchEnd
 * @description Handles the touchend event for the floating microphone button.
 * @returns {Promise<void>}
 */
async function handleFloatingMicTouchEnd() {
    if (!isFloatingMicRecording) return;

    clearTimeout(floatingMicRecordingTimeout);
    floatingMicButton.classList.remove('recording', 'cancelling');
    messageInput.disabled = false;
    sendButton.disabled = false;

    if (isFloatingMicCancelling) {
        showToast('录音已取消');
        resetFloatingMicState();
        return;
    }

    showToast('正在处理语音...');
    
    try {
        if (floatingMicAudioRecorder) {
            floatingMicAudioRecorder.stop();
            floatingMicAudioRecorder = null;
        }

        if (floatingMicAudioChunks.length === 0) {
            showSystemMessage('没有录到音频，请重试');
            resetFloatingMicState();
            return;
        }

        const totalLength = floatingMicAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of floatingMicAudioChunks) {
            mergedAudioData.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        floatingMicAudioChunks = [];

        // 使用传入的 pcmToWavBlob 函数
        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.SAMPLE_RATE); // 使用输入采样率

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
            // 显示用户语音消息
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = totalLength / (CONFIG.AUDIO.SAMPLE_RATE * 2); // 16位PCM，2字节/采样
            chatUI.displayAudioMessage(audioUrl, duration, 'user', audioBlob);
        } else {
            showSystemMessage('未获取到转录文本。');
        }

    } catch (error) {
        showSystemMessage(`语音转文字失败: ${error.message}`);
        console.error('语音转文字失败:', error);
    } finally {
        resetFloatingMicState();
        updateMicButtonStates(false, false); // 停止浮动麦克风，启用所有麦克风按钮
    }
}

/**
 * @function cancelFloatingMicRecording
 * @description Cancels the floating microphone recording.
 * @returns {void}
 */
function cancelFloatingMicRecording() {
    if (!isFloatingMicRecording) return;

    clearTimeout(floatingMicRecordingTimeout);
    showToast('录音已取消');
    
    if (floatingMicAudioRecorder) {
        floatingMicAudioRecorder.stop();
        floatingMicAudioRecorder = null;
    }
    floatingMicAudioChunks = [];
    // Do not reset hasRequestedMicPermission here
}

/**
 * @function resetFloatingMicState
 * @description Resets the state variables for floating microphone recording.
 * @returns {void}
 */
function resetFloatingMicState() {
    isFloatingMicRecording = false;
    isFloatingMicCancelling = false;
    floatingMicButton.classList.remove('recording', 'cancelling');
    messageInput.placeholder = '输入消息...';
    messageInput.disabled = false;
    sendButton.disabled = false;
    updateMicButtonStates(false, false); // 重置浮动麦克风状态，启用所有麦克风按钮
}
