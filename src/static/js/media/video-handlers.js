/**
 * @file video-handlers.js
 * @description Manages camera control logic, including starting/stopping video streams and updating UI.
 */

import { showSystemMessage } from '../main.js'; // 导入必要的辅助函数
import { Logger } from '../utils/logger.js';
import { VideoManager } from '../video/video-manager.js';

/**
 * @class VideoHandler
 * @description A class to encapsulate all functionality related to video capture and display.
 */
export class VideoHandler {
    /**
     * @constructor
     * @param {object} options - The options for the video handler.
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

        this.videoManager = null;
        this.isVideoActive = false;
        this.fps = localStorage.getItem('video_fps') || 1; // 从 localStorage 获取 FPS

        this.elements.cameraButton.addEventListener('click', () => {
            if (this.isConnected() && this.getSelectedModelConfig().isWebSocket) {
                this.handleVideoToggle();
            } else if (!this.getSelectedModelConfig().isWebSocket) {
                showSystemMessage('当前模型不支持摄像头功能。');
            }
        });
        this.elements.stopVideoButton.addEventListener('click', () => this.stopVideo());

        // 移动端翻转摄像头按钮事件监听
        if ('ontouchstart' in window) {
            this.elements.flipCameraButton.addEventListener('touchstart', async (e) => {
                e.preventDefault();
                await this.flipCamera();
            });
        } else {
            this.elements.flipCameraButton.addEventListener('click', async () => {
                await this.flipCamera();
            });
        }
    }

    /**
     * @description Handles the video toggle. Starts or stops video streaming.
     * @returns {Promise<void>}
     */
    async handleVideoToggle() {
        if (!this.isVideoActive) {
            // 开启摄像头逻辑...
            Logger.info('Video toggle clicked, current state:', { isVideoActive: this.isVideoActive, isConnected: this.isConnected() });

            localStorage.setItem('video_fps', this.elements.fpsInput.value);
            this.fps = this.elements.fpsInput.value; // 更新当前 FPS

            try {
                // 显示预览容器
                this.elements.mediaPreviewsContainer.style.display = 'flex';
                this.elements.videoPreviewContainer.style.display = 'block';

                Logger.info('Attempting to start video');
                if (!this.videoManager) {
                    this.videoManager = new VideoManager();
                }

                await this.videoManager.start(this.fps, (frameData) => {
                    if (this.isConnected()) {
                        this.client.sendRealtimeInput([frameData]);
                    }
                });

                this.isVideoActive = true;
                this.elements.cameraButton.classList.add('active');
                this.elements.cameraButton.textContent = 'videocam_off'; // 直接修改按钮文本
                this.updateMediaPreviewsDisplay(); // 更新预览显示
                this.logMessage('摄像头已启动', 'system');

            } catch (error) {
                Logger.error('摄像头错误:', error);
                this.logMessage(`错误: ${error.message}`, 'system');
                this.isVideoActive = false;
                this.videoManager = null;
                this.elements.cameraButton.classList.remove('active');
                this.elements.cameraButton.textContent = 'videocam'; // 直接修改按钮文本
                // 错误处理时隐藏预览
                this.elements.mediaPreviewsContainer.style.display = 'none';
                this.elements.videoPreviewContainer.style.display = 'none';
                this.updateMediaPreviewsDisplay(); // 更新预览显示
            }
        } else {
            this.stopVideo();
        }
    }

    /**
     * @description Stops the video streaming.
     * @returns {void}
     */
    stopVideo() {
        if (!this.isVideoActive) return; // 如果未激活，则直接返回

        this.isVideoActive = false;
        this.elements.cameraButton.textContent = 'videocam';
        this.elements.cameraButton.classList.remove('active');

        Logger.info('Stopping video...');
        if (this.videoManager) {
            this.videoManager.stop();
            this.videoManager = null;
        }
        this.updateMediaPreviewsDisplay(); // 更新预览显示
        this.logMessage('摄像头已停止', 'system');
    }

    /**
     * @description Toggles the camera facing mode (user/environment).
     * @returns {Promise<void>}
     */
    async flipCamera() {
        if (!this.videoManager) {
            this.logMessage('摄像头未激活，无法翻转', 'system');
            return;
        }

        this.elements.flipCameraButton.disabled = true; // 禁用按钮防止重复点击
        try {
            await this.videoManager.flipCamera();
            this.logMessage('摄像头已翻转', 'system');
        } catch (error) {
            this.logMessage(`翻转摄像头失败: ${error.message}`, 'error');
            console.error('翻转摄像头失败:', error);
        } finally {
            this.elements.flipCameraButton.disabled = false; // 重新启用按钮
        }
    }

    /**
     * @description Checks if video is currently active.
     * @returns {boolean} True if video is active, false otherwise.
     */
    getIsVideoActive() {
        return this.isVideoActive;
    }
}
