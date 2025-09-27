/**
 * @fileoverview Manages file attachments for both chat and vision modes.
 * Encapsulates state and UI logic for file previews and handling.
 * Includes image compression functionality for vision mode.
 */

import { imageCompressor } from '../utils/image-compressor.js';

/**
 * @class AttachmentManager
 * @description Handles all logic related to file attachments, including
 * selection, validation, preview display, and state management.
 */
export class AttachmentManager {
    /**
     * @constructor
     * @param {object} config - The configuration object for the manager.
     * @param {HTMLElement} config.chatPreviewsContainer - The container for chat attachment previews.
     * @param {HTMLElement} config.visionPreviewsContainer - The container for vision attachment previews.
     * @param {function(string, number=): void} config.showToast - Function to display a toast message.
     * @param {function(string): void} config.showSystemMessage - Function to display a system message.
     */
    constructor({ chatPreviewsContainer, visionPreviewsContainer, showToast, showSystemMessage }) {
        this.chatPreviewsContainer = chatPreviewsContainer;
        this.visionPreviewsContainer = visionPreviewsContainer;
        this.showToast = showToast;
        this.showSystemMessage = showSystemMessage;

        this.chatAttachedFiles = []; // For multi-file chat mode
        this.visionAttachedFiles = []; // For multi-file vision mode
        this.enableCompression = true; // 默认启用图片压缩（针对视觉模式）

        if (!this.chatPreviewsContainer) {
            console.error("AttachmentManager: chatPreviewsContainer is not provided.");
        }
        if (!this.visionPreviewsContainer) {
            console.warn("AttachmentManager: visionPreviewsContainer is not provided. Vision mode attachments will be disabled.");
        }
    }

    /**
     * @method getAttachedFile
     * @description Returns the array of attached files for chat mode.
     * @returns {Array<object>} The array of file data objects.
     */
    getChatAttachedFiles() {
        return this.chatAttachedFiles;
    }

    /**
     * @method getVisionAttachedFiles
     * @description Returns the array of attached files for vision mode.
     * @returns {Array<object>} The array of file data objects.
     */
    getVisionAttachedFiles() {
        return this.visionAttachedFiles;
    }

    /**
     * @method handleFileAttachment
     * @description Handles the file input change event for attachments.
     * @param {Event} event - The file input change event.
     * @param {string} [mode='chat'] - The attachment mode ('chat' or 'vision').
     * @returns {Promise<void>}
     */
    async handleFileAttachment(event, mode = 'chat') {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (!this._validateFile(file, files, mode)) { // Pass all files and mode for type consistency check
                continue;
            }

            try {
                // 处理图片压缩 - 仅对视觉模式的图片进行压缩
                let processedFile = file;
                let compressionInfo = null;
                
                if (mode === 'vision' && this.enableCompression && file.type.startsWith('image/')) {
                    if (imageCompressor.needsCompression(file)) {
                        const originalSize = (file.size / 1024 / 1024).toFixed(2);
                        this.showToast(`正在压缩图片(${originalSize}MB)...`, 5000);
                        processedFile = await imageCompressor.compressImage(file);
                        
                        // 如果压缩成功且减小了文件大小
                        if (processedFile && processedFile.size < file.size) {
                            compressionInfo = imageCompressor.getCompressionInfo(file, processedFile);
                            this.showToast(`图片压缩完成: ${compressionInfo.originalSize} → ${compressionInfo.compressedSize} (减少 ${compressionInfo.compressionRatio})`, 3000);
                        }
                    }
                }
                
                const base64String = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(processedFile);
                });

                const fileData = {
                    name: processedFile.name,
                    type: processedFile.type,
                    base64: base64String
                };

                if (mode === 'vision') {
                    this.visionAttachedFiles.push(fileData);
                    this.displayFilePreview({
                        type: file.type,
                        src: base64String,
                        name: file.name,
                        mode: 'vision',
                        index: this.visionAttachedFiles.length - 1
                    });
                } else {
                    this.chatAttachedFiles.push(fileData);
                    this.displayFilePreview({
                        type: file.type,
                        src: base64String,
                        name: file.name,
                        mode: 'chat',
                        index: this.chatAttachedFiles.length - 1 // Pass index for removal
                    });
                }
                this.showToast(`文件已附加: ${file.name}`);

            } catch (error) {
                console.error('处理文件时出错:', error);
                this.showSystemMessage(`处理文件失败: ${error.message}`);
            }
        }
        event.target.value = ''; // Reset file input
    }

    /**
     * @method displayFilePreview
     * @description Displays a preview of the attached file in the UI.
     * @param {object} options - Preview options.
     * @param {string} options.type - The MIME type of the file.
     * @param {string} options.src - The base64 data URL of the file.
     * @param {string} options.name - The name of the file.
     * @param {string} options.mode - The attachment mode ('chat' or 'vision').
     * @param {number} [options.index] - The index of the file in vision mode.
     */
    displayFilePreview({ type, src, name, mode, index }) {
        const container = mode === 'vision' ? this.visionPreviewsContainer : this.chatPreviewsContainer;
        if (!container) return;

        // In chat mode, we append new previews instead of clearing the container
        // The clearing will be handled by clearAttachedFile when needed (e.g., before sending)

        const previewCard = this._createPreviewCard({ type, src, name, mode, index });
        container.appendChild(previewCard);
    }

    /**
     * @method clearAttachedFile
     * @description Clears the attached file state and UI for the specified mode.
     * @param {string} [mode='chat'] - The mode to clear ('chat' or 'vision').
     */
    clearAttachedFile(mode = 'chat') {
        if (mode === 'vision') {
            this.visionAttachedFiles = [];
            this.visionPreviewsContainer.innerHTML = '';
        } else {
            this.chatAttachedFiles = [];
            this.chatPreviewsContainer.innerHTML = '';
        }
    }

    /**
     * @method removeChatAttachment
     * @description Removes a specific attachment in chat mode.
     * @param {number} indexToRemove - The index of the file to remove.
     */
    removeChatAttachment(indexToRemove) {
        this.chatAttachedFiles.splice(indexToRemove, 1);
        // Re-render all previews to correctly update indices
        this.chatPreviewsContainer.innerHTML = '';
        this.chatAttachedFiles.forEach((file, index) => {
            this.displayFilePreview({
                type: file.type,
                src: file.base64,
                name: file.name,
                mode: 'chat',
                index: index
            });
        });
    }

    /**
     * @method removeVisionAttachment
     * @description Removes a specific attachment in vision mode.
     * @param {number} indexToRemove - The index of the file to remove.
     */
    removeVisionAttachment(indexToRemove) {
        this.visionAttachedFiles.splice(indexToRemove, 1);
        // Re-render all previews to correctly update indices
        this.visionPreviewsContainer.innerHTML = '';
        this.visionAttachedFiles.forEach((file, index) => {
            this.displayFilePreview({
                type: file.type,
                src: file.base64,
                name: file.name,
                mode: 'vision',
                index: index
            });
        });
    }
    /**
     * @method toggleCompression
     * @description 启用或禁用图片压缩功能
     * @param {boolean} enabled - 是否启用压缩
     */
    toggleCompression(enabled) {
        this.enableCompression = enabled;
        this.showToast(`图片压缩功能已${enabled ? '启用' : '禁用'}`);
    }
    
    /**
     * @method _validateFile
     * @private
     * @description Validates a file based on type and size.
     * @param {File} file - The file to validate.
     * @returns {boolean} True if the file is valid, false otherwise.
     */
    _validateFile(file, allFiles, mode) {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm',
            'audio/aac', 'audio/flac', 'audio/mp3', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/mpga',
            'audio/mp4', 'audio/opus', 'audio/pcm', 'audio/wav', 'audio/webm', 'audio/aiff', 'audio/ogg'
        ];
        const maxSize = 20 * 1024 * 1024; // 20MB

        if (mode === 'chat' && allFiles.length > 1) {
            const firstFileType = allFiles[0].type.split('/')[0];
            for (let i = 1; i < allFiles.length; i++) {
                if (!allFiles[i].type.startsWith(firstFileType)) {
                    this.showSystemMessage(`单次上传时，聊天模式下只能上传同类型文件。请确保所有选定文件类型一致。`);
                    return false;
                }
            }
        }

        if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            this.showSystemMessage(`不支持的文件类型: ${file.type}。`);
            return false;
        }
        if (file.size > maxSize) {
            this.showSystemMessage('文件大小不能超过 20MB。');
            return false;
        }
        return true;
    }

    /**
     * @method _createPreviewCard
     * @private
     * @description Creates a DOM element for a file preview.
     * @param {object} options - Preview options.
     * @returns {HTMLElement} The preview card element.
     */
    _createPreviewCard({ type, src, name, mode, index }) {
        const previewCard = document.createElement('div');
        previewCard.className = 'file-preview-card';
        previewCard.title = name;
        if (mode === 'vision') {
            previewCard.dataset.index = index;
        }

        let previewElement;
        if (type.startsWith('image/')) {
            previewElement = document.createElement('img');
            previewElement.src = src;
            previewElement.alt = name;
        } else if (type.startsWith('video/')) {
            previewElement = document.createElement('video');
            previewElement.src = src;
            previewElement.alt = name;
            previewElement.muted = true;
            previewElement.autoplay = true;
            previewElement.loop = true;
            previewElement.playsInline = true;
        } else if (type === 'application/pdf') {
            previewElement = document.createElement('div');
            previewElement.className = 'file-placeholder';
            const icon = document.createElement('i'); // 使用 <i> 标签
            icon.className = 'fa-solid fa-file-pdf'; // Font Awesome PDF 图标
            const text = document.createElement('p');
            text.textContent = name;
            previewElement.appendChild(icon);
            previewElement.appendChild(text);
        } else if (type.startsWith('audio/')) {
            previewElement = document.createElement('div');
            previewElement.className = 'file-placeholder';
            const icon = document.createElement('i'); // 使用 <i> 标签
            icon.className = 'fa-solid fa-file-audio'; // Font Awesome 音频图标
            const text = document.createElement('p');
            text.textContent = name;
            previewElement.appendChild(icon);
            previewElement.appendChild(text);
        }
        else {
            previewElement = document.createElement('div');
            previewElement.className = 'file-placeholder';
            const icon = document.createElement('i'); // 使用 <i> 标签
            icon.className = 'fa-solid fa-file'; // Font Awesome 通用文件图标
            const text = document.createElement('p');
            text.textContent = name;
            previewElement.appendChild(icon);
            previewElement.appendChild(text);
        }

        const closeButton = document.createElement('button');
        closeButton.className = 'close-button'; // 移除 material-symbols-outlined
        const closeIcon = document.createElement('i');
        closeIcon.className = 'fa-solid fa-times'; // Font Awesome close icon
        closeButton.appendChild(closeIcon);
        closeButton.onclick = (e) => {
            e.stopPropagation();
            if (mode === 'vision') {
                this.removeVisionAttachment(index);
            } else if (mode === 'chat') {
                this.removeChatAttachment(index);
            }
        };

        previewCard.appendChild(previewElement);
        previewCard.appendChild(closeButton);
        return previewCard;
    }
}