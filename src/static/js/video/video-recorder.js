import { CONFIG } from '../config/config.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Implements a video recorder for capturing and processing video frames from a camera.
 * It supports previewing the video and sending frames to a callback function.
 */
export class VideoRecorder {
    /**
     * Creates a new VideoRecorder instance.
     * @param {Object} [options] - Configuration options for the recorder.
     * @param {number} [options.fps=15] - Frames per second for video capture.
     * @param {number} [options.quality=0.7] - JPEG quality for captured frames (0.0 - 1.0).
     * @param {number} [options.width=640] - Width of the captured video.
     * @param {number} [options.height=480] - Height of the captured video.
     * @param {number} [options.maxFrameSize=102400] - Maximum size of a frame in bytes (100KB).
     */
    constructor(options = {}) {
        this.stream = null;
        this.previewElement = null;
        this.isRecording = false;
        this.onVideoData = null;
        this.frameCanvas = document.createElement('canvas');
        this.frameCtx = this.frameCanvas.getContext('2d');
        this.captureInterval = null;
        
        // 🔥 修正：获取优化配置
        const videoConfig = CONFIG.WEBSOCKET_VIDEO || {};
        const optimizationEnabled = videoConfig.OPTIMIZATION_ENABLED || false;
        
        if (optimizationEnabled) {
            // 使用优化配置
            this.options = {
                fps: options.fps || videoConfig.TRANSMISSION?.FPS || 2,
                quality: videoConfig.IMAGE_QUALITY || 0.8,
                width: videoConfig.RESOLUTION?.WIDTH || 1280,
                height: videoConfig.RESOLUTION?.HEIGHT || 720,
                maxFrameSize: 200 * 1024,
                optimizationEnabled: true,
                preprocessing: videoConfig.PREPROCESSING || {}
            };
        } else {
            // 使用原有配置（向后兼容）
            this.options = {
                fps: options.fps || 2,
                quality: 0.6,
                width: 640,
                height: 480,
                maxFrameSize: 100 * 1024,
                optimizationEnabled: false,
                ...options
            };
        }
        
        this.frameCount = 0;
        this.actualWidth = this.options.width;
        this.actualHeight = this.options.height;
        
        // 🔥 新增：传输状态管理
        this.transmissionState = {
            lastTransmitTime: 0,
            transmitInterval: videoConfig.TRANSMISSION?.ADAPTIVE_INTERVAL || 500,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0 // 新增：连续成功次数
        };
        
        console.log('VideoRecorder initialized with optimization:', this.options.optimizationEnabled);
    }

    /**
     * Starts video recording.
     * @param {HTMLVideoElement} previewElement - The video element to display the video preview.
     * @param {string} facingMode - Camera facing mode ('user' or 'environment').
     * @param {Function} onVideoData - Callback function to receive video frame data.
     * @throws {ApplicationError} Throws an error if the video recording fails to start.
     */
    async start(previewElement, facingMode, onVideoData) {
        try {
            this.previewElement = previewElement;
            this.onVideoData = onVideoData;

            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    facingMode: facingMode,
                    width: { ideal: this.options.width },
                    height: { ideal: this.options.height }
                }
            });

            const videoTrack = this.stream.getVideoTracks()[0];
            // 获取视频轨道的实际分辨率
            const settings = videoTrack.getSettings();
            this.actualWidth = settings.width;
            this.actualHeight = settings.height;

            // 🔥 修正：根据优化配置决定是否限制分辨率
            if (!this.options.optimizationEnabled && this.actualHeight > 480) {
                const aspectRatio = this.actualWidth / this.actualHeight;
                this.actualHeight = 480;
                this.actualWidth = Math.round(this.actualHeight * aspectRatio);
            }

            // 设置画布尺寸
            this.frameCanvas.width = this.actualWidth;
            this.frameCanvas.height = this.actualHeight;

            // Set up preview
            this.previewElement.srcObject = this.stream;
            await this.previewElement.play();

            // Start frame capture loop
            this.isRecording = true;
            this.startFrameCapture();
            
            Logger.info('Video recording started');

        } catch (error) {
            Logger.error('Failed to start video recording:', error);
            throw new ApplicationError(
                'Failed to start video recording',
                ErrorCodes.VIDEO_START_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * Starts the frame capture loop.
     * @private
     */
    startFrameCapture() {
        const frameInterval = 1000 / this.options.fps;
        
        this.captureInterval = setInterval(() => {
            if (this.isRecording && this.onVideoData) {
                this.captureFrame();
            }
        }, frameInterval);

        Logger.info(`Video capture started at ${this.options.fps} FPS, optimization: ${this.options.optimizationEnabled}`);
    }

    /**
     * 🔥 新增：增强的帧捕获逻辑
     * @private
     */
    captureFrame() {
        if (!this.isRecording || !this.onVideoData) return;
        
        const currentTime = Date.now();
        
        // 传输频率控制
        if (currentTime - this.transmissionState.lastTransmitTime < this.transmissionState.transmitInterval) {
            return;
        }

        try {
            // 绘制当前帧
            this.frameCtx.drawImage(
                this.previewElement,
                0, 0, this.frameCanvas.width, this.frameCanvas.height
            );

            // 🔥 新增：智能图像优化
            const optimizedQuality = this.optimizeImageForAI();
            
            // 转换为Base64
            const imageData = this.frameCanvas.toDataURL('image/jpeg', optimizedQuality);
            const base64Data = imageData.split(',')[1];

            if (this.validateFrame(base64Data)) {
                this.frameCount++;
                
                // 记录传输开始时间
                const startTime = Date.now();
                
                // 传输帧数据
                this.onVideoData(base64Data);
                
                // 更新传输状态
                this.transmissionState.lastTransmitTime = currentTime;
                this.adjustTransmissionStrategy(true); // 传输成功，调用策略调整
                Logger.debug(`Optimized frame #${this.frameCount} (${Math.round(base64Data.length/1024)}KB)`);
            }
            
        } catch (error) {
            Logger.error('Frame capture error:', error);
            this.adjustTransmissionStrategy(false); // 帧捕获/处理失败，调用策略调整
        }
    }

    /**
     * 🔥 新增：智能图像优化方法
     * @returns {number} Optimized image quality
     * @private
     */
    optimizeImageForAI() {
        if (!this.options.optimizationEnabled || !this.options.preprocessing) {
            return this.options.quality;
        }
        
        try {
            const { CONTRAST_ENHANCE, BRIGHTNESS_ADJUST } = this.options.preprocessing;
            
            if (CONTRAST_ENHANCE || BRIGHTNESS_ADJUST) {
                const imageData = this.frameCtx.getImageData(0, 0, this.frameCanvas.width, this.frameCanvas.height);
                this.enhanceImage(imageData, CONTRAST_ENHANCE, BRIGHTNESS_ADJUST);
                this.frameCtx.putImageData(imageData, 0, 0);
            }
            
            return this.options.quality;
        } catch (error) {
            console.warn('Image optimization failed, using default quality:', error);
            return this.options.quality;
        }
    }

    /**
     * 🔥 新增：图像增强
     * @param {ImageData} imageData - Image data to enhance
     * @param {boolean} contrastEnhance - Whether to enhance contrast
     * @param {number} brightnessAdjust - Brightness adjustment value
     * @private
     */
    enhanceImage(imageData, contrastEnhance, brightnessAdjust) {
        const data = imageData.data;
        const contrast = contrastEnhance ? 1.2 : 1.0;
        const brightness = brightnessAdjust || 0;
        
        for (let i = 0; i < data.length; i += 4) {
            // RGB通道分别处理
            data[i] = Math.min(255, (data[i] - 128) * contrast + 128 + brightness);     // R
            data[i + 1] = Math.min(255, (data[i + 1] - 128) * contrast + 128 + brightness); // G
            data[i + 2] = Math.min(255, (data[i + 2] - 128) * contrast + 128 + brightness); // B
        }
    }

    /**
     * 🔥 修正：自适应传输策略 (AIMD)
     * 根据传输结果调整帧发送间隔。
     * @param {boolean} success - 传输是否成功。
     * @private
     */
    adjustTransmissionStrategy(success) {
        if (success) {
            this.transmissionState.consecutiveSuccesses++;
            this.transmissionState.consecutiveFailures = 0;
            
            // 乘性减：连续成功5次后逐步降低间隔
            if (this.transmissionState.consecutiveSuccesses >= 5) {
                this.transmissionState.transmitInterval = Math.max(
                    100, // 下限100ms
                    this.transmissionState.transmitInterval - 50 // 每次减50ms
                );
                this.transmissionState.consecutiveSuccesses = 0;
            }
        } else {
            this.transmissionState.consecutiveFailures++;
            this.transmissionState.consecutiveSuccesses = 0;
            
            // 加性增：每次失败增加200ms
            this.transmissionState.transmitInterval = Math.min(
                3000, // 上限3s
                this.transmissionState.transmitInterval + 200
            );
            
            if (this.transmissionState.consecutiveFailures > 3) {
                Logger.warn(`Transmission interval increased to ${this.transmissionState.transmitInterval}ms`);
            }
        }
    }

    /**
     * Stops video recording.
     * @throws {ApplicationError} Throws an error if the video recording fails to stop.
     */
    stop() {
        try {
            this.isRecording = false;
            
            if (this.captureInterval) {
                clearInterval(this.captureInterval);
                this.captureInterval = null;
            }

            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            if (this.previewElement) {
                this.previewElement.srcObject = null;
            }

            this.stream = null;
            Logger.info('Video recording stopped');

        } catch (error) {
            Logger.error('Failed to stop video recording:', error);
            throw new ApplicationError(
                'Failed to stop video recording',
                ErrorCodes.VIDEO_STOP_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * Checks if video recording is supported by the browser.
     * @returns {boolean} True if video recording is supported, false otherwise.
     * @throws {ApplicationError} Throws an error if video recording is not supported.
     * @static
     */
    static checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new ApplicationError(
                'Video recording is not supported in this browser',
                ErrorCodes.VIDEO_NOT_SUPPORTED
            );
        }
        return true;
    }

    /**
     * Validates a captured frame.
     * @param {string} base64Data - Base64 encoded frame data.
     * @returns {boolean} True if the frame is valid, false otherwise.
     * @private
     */
    validateFrame(base64Data) {
        // Check if it's a valid base64 string
        if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
            Logger.error('Invalid base64 data');
            return false;
        }
        
        // Check minimum size (1KB)
        if (base64Data.length < 1024) {
            Logger.error('Frame too small');
            return false;
        }
        
        return true;
    }

    /**
     * Optimizes the frame quality to reduce size.
     * @param {string} base64Data - Base64 encoded frame data.
     * @returns {string} Optimized base64 encoded frame data.
     * @private
     */
    optimizeFrameQuality(base64Data) {
        let quality = this.options.quality;
        let currentSize = base64Data.length;
        
        while (currentSize > this.options.maxFrameSize && quality > 0.3) {
            quality -= 0.1;
            const jpegData = this.frameCanvas.toDataURL('image/jpeg', quality);
            base64Data = jpegData.split(',')[1];
            currentSize = base64Data.length;
        }
        
        return base64Data;
    }
}