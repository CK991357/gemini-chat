import { Logger } from '../utils/logger.js';
import { VideoManager } from '../video/video-manager.js';

/**
 * @fileoverview Handles high-level UI logic for video and screen sharing controls.
 */

/**
 * Indicates if the video camera is currently active.
 * @type {boolean}
 */
export let isVideoActive = false;

/**
 * The VideoManager instance.
 * @type {VideoManager|null}
 */
let videoManager = null;

/**
 * Toggles the video camera on or off.
 * @function handleVideoToggle
 * @description Handles the UI logic for starting and stopping the video camera, including updating button states and managing the VideoManager instance.
 * @returns {Promise<void>}
 */
export async function handleVideoToggle(fpsInput, mediaPreviewsContainer, videoPreviewContainer, videoPreviewElement, cameraButton, client, logMessage, updateMediaPreviewsDisplay) {
    if (!isVideoActive) {
        Logger.info('Video toggle clicked, starting video...');
        localStorage.setItem('video_fps', fpsInput.value);

        try {
            mediaPreviewsContainer.style.display = 'flex';
            videoPreviewContainer.style.display = 'block';

            if (!videoManager) {
                videoManager = new VideoManager(videoPreviewElement, {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                });
            }
            
            await videoManager.start(fpsInput.value, (frameData) => {
                if (client.isConnected()) {
                    client.sendRealtimeInput([frameData]);
                }
            });

            isVideoActive = true;
            cameraButton.classList.add('active');
            cameraButton.textContent = 'videocam_off';
            updateMediaPreviewsDisplay();
            logMessage('摄像头已启动', 'system');

        } catch (error) {
            Logger.error('摄像头错误:', error);
            logMessage(`错误: ${error.message}`, 'system');
            isVideoActive = false;
            videoManager = null;
            cameraButton.classList.remove('active');
            cameraButton.textContent = 'videocam';
            updateMediaPreviewsDisplay();
        }
    } else {
        stopVideo(cameraButton, logMessage, updateMediaPreviewsDisplay);
    }
}

/**
 * Stops the video stream and updates the UI.
 * @function stopVideo
 * @description Stops the video stream, cleans up the VideoManager instance, and resets the UI elements to their inactive state.
 * @returns {void}
 */
export function stopVideo(cameraButton, logMessage, updateMediaPreviewsDisplay) {
    isVideoActive = false;
    cameraButton.textContent = 'videocam';
    cameraButton.classList.remove('active');
    
    Logger.info('Stopping video...');
    if (videoManager) {
        videoManager.stop();
        if (videoManager.stream) {
            videoManager.stream.getTracks().forEach(track => track.stop());
        }
        videoManager = null;
    }
    updateMediaPreviewsDisplay();
    logMessage('摄像头已停止', 'system');
}

/**
 * Updates the display of the media preview containers based on active streams.
 * @function updateMediaPreviewsDisplay
 * @description Shows or hides the media preview containers based on whether video or screen sharing is active.
 * @param {boolean} isScreenSharingActive - The current state of screen sharing.
 * @returns {void}
 */
export function updateMediaPreviewsDisplay(isScreenSharingActive, mediaPreviewsContainer, videoPreviewContainer, screenContainer) {
    if (isVideoActive || isScreenSharingActive) {
        mediaPreviewsContainer.style.display = 'flex';
        videoPreviewContainer.style.display = isVideoActive ? 'block' : 'none';
        screenContainer.style.display = isScreenSharingActive ? 'block' : 'none';
    } else {
        mediaPreviewsContainer.style.display = 'none';
    }
}