/**
 * @file screen-handlers.js
 * @description Manages screen sharing logic, including starting/stopping screen capture and updating UI.
 */

import { showSystemMessage } from '../main.js'; // 导入必要的辅助函数
import { Logger } from '../utils/logger.js';
import { ScreenRecorder } from '../video/screen-recorder.js';

/**
 * @class ScreenHandler
 * @description Manages screen sharing logic, including starting/stopping screen capture and updating UI.
 */
export class ScreenHandler {
    /**
     * @constructor
     * @param {object} options - The options for the screen handler.
     * @param {object} options.elements - A collection of DOM elements.
     * @param {Function} options.isConnected - Function to get the current connection status.
     * @param {object} options.client - The MultimodalLiveClient instance.
     * @param {Function} options.updateMediaPreviewsDisplay - Function to update the display of media preview containers.
     * @param {Function} options.logMessage - Function to log system messages.
     * @param {Function} options.getSelectedModelConfig - Function to get the currently selected model configuration.
     */
    constructor({ elements, isConnected, client, updateMediaPreviewsDisplay, logMessage, getSelectedModelConfig }) {
        this.elements = elements;
        this.isConnected = isConnected;
        this.client = client;
        this.updateMediaPreviewsDisplay = updateMediaPreviewsDisplay;
        this.logMessage = logMessage;
        this.getSelectedModelConfig = getSelectedModelConfig;

        this.screenRecorder = null;
        this.isScreenSharing = false;
        this.throttledSendFrame = this.throttle(this.sendFrame.bind(this), 1000 / parseInt(this.elements.fpsInput.value));

        this.elements.screenButton.addEventListener('click', () => {
            if (this.isConnected() && this.getSelectedModelConfig().isWebSocket) {
                this.handleScreenShare();
            } else if (!this.getSelectedModelConfig().isWebSocket) {
                showSystemMessage('当前模型不支持屏幕共享功能。');
            }
        });
        this.elements.stopScreenButton.addEventListener('click', () => this.stopScreenSharing());

        // 监听 FPS 输入框的变化，重新计算节流函数
        this.elements.fpsInput.addEventListener('change', () => {
            this.throttledSendFrame = this.throttle(this.sendFrame.bind(this), 1000 / parseInt(this.elements.fpsInput.value));
            this.logMessage(`屏幕共享帧率已更新为: ${this.elements.fpsInput.value} FPS`, 'system');
        });
    }

    /**
     * @description 节流函数，用于限制函数执行频率。
     * @param {Function} func - 要节流的函数。
     * @param {number} limit - 限制时间（毫秒）。
     * @returns {Function} 节流后的函数。
     */
    throttle(func, limit) {
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
        };
    }

    /**
     * @description 发送屏幕帧数据到 WebSocket 客户端。
     * @param {object} frameData - 屏幕帧数据。
     */
    sendFrame(frameData) {
        if (this.isConnected()) {
            this.client.sendRealtimeInput([frameData]);
        }
    }

    /**
     * @description Handles the screen sharing toggle. Starts or stops screen capture.
     * @returns {Promise<void>}
     */
    async handleScreenShare() {
        if (!this.isScreenSharing) {
            Logger.info('Screen share button clicked, current state:', { isScreenSharing: this.isScreenSharing, isConnected: this.isConnected() });

            try {
                this.elements.mediaPreviewsContainer.style.display = 'flex';
                this.elements.screenContainer.style.display = 'block';

                Logger.info('Attempting to start screen sharing');
                if (!this.screenRecorder) {
                    this.screenRecorder = new ScreenRecorder();
                }

                await this.screenRecorder.start(this.elements.screenPreview, (frameData) => {
                    this.throttledSendFrame(frameData);
                });

                this.isScreenSharing = true;
                this.elements.screenButton.classList.add('active');
                this.elements.screenButton.textContent = 'stop_screen_share';
                this.updateMediaPreviewsDisplay();
                this.logMessage('屏幕共享已启动', 'system');

            } catch (error) {
                Logger.error('屏幕共享错误:', error);
                this.logMessage(`错误: ${error.message}`, 'system');
                this.isScreenSharing = false;
                this.screenRecorder = null;
                this.elements.screenButton.classList.remove('active');
                this.elements.screenButton.textContent = 'screen_share';
                this.elements.mediaPreviewsContainer.style.display = 'none';
                this.elements.screenContainer.style.display = 'none';
                this.updateMediaPreviewsDisplay();
            }
        } else {
            this.stopScreenSharing();
        }
    }

    /**
     * @description Stops the screen sharing.
     * @returns {void}
     */
    stopScreenSharing() {
        if (!this.isScreenSharing) return;

        this.isScreenSharing = false;
        this.elements.screenButton.textContent = 'screen_share';
        this.elements.screenButton.classList.remove('active');

        Logger.info('Stopping screen sharing...');
        if (this.screenRecorder) {
            this.screenRecorder.stop();
            this.screenRecorder = null;
        }
        this.updateMediaPreviewsDisplay();
        this.logMessage('屏幕共享已停止', 'system');
    }

    /**
     * @description Checks if screen sharing is currently active.
     * @returns {boolean} True if screen sharing is active, false otherwise.
     */
    getIsScreenActive() {
        return this.isScreenSharing;
    }
}
