/**
 * @fileoverview Manages file attachments for both chat and vision modes.
 * Encapsulates state and UI logic for file previews and handling.
 */

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
    constructor({ chatPreviewsContainer, visionPreviewsContainer, showToast, showSystemMessage, mode = 'chat' }) {
        this.chatPreviewsContainer = chatPreviewsContainer;
        this.visionPreviewsContainer = visionPreviewsContainer;
        this.showToast = showToast;
        this.showSystemMessage = showSystemMessage;
        this.mode = mode; // 'chat' or 'vision'

        this.attachedFile = null; // For single-file chat mode
        this.visionAttachedFiles = []; // For multi-file vision mode

        if (!this.chatPreviewsContainer) {
            console.error("AttachmentManager: chatPreviewsContainer is not provided.");
        }
        if (!this.visionPreviewsContainer) {
            console.warn("AttachmentManager: visionPreviewsContainer is not provided. Vision mode attachments will be disabled.");
        }
    }

    /**
     * @method getAttachedFile
     * @description Returns the currently attached file for chat mode.
     * @returns {object|null} The file data object or null.
     */
    getAttachedFile() {
        return this.attachedFile;
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
            if (!this._validateFile(file)) {
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
                    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'file',
                    source: file,
                    data: base64String,
                    mimeType: file.type,
                    name: file.name
                };

                if (mode === 'vision') {
                    // Vision mode keeps its simpler structure for now
                    this.visionAttachedFiles.push({
                        name: file.name,
                        type: file.type,
                        base64: base64String
                    });
                    this.displayFilePreview({
                        type: file.type,
                        src: base64String,
                        name: file.name,
                        mode: 'vision',
                        index: this.visionAttachedFiles.length - 1
                    });
                } else {
                    this.clearAttachedFile('chat'); // Clear previous before adding new one
                    this.attachedFile = fileData;
                    this.displayFilePreview({
                        type: file.type,
                        src: base64String,
                        name: file.name,
                        mode: 'chat'
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

        if (mode === 'chat') {
            container.innerHTML = '';
        }

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
            this.attachedFile = null;
            this.chatPreviewsContainer.innerHTML = '';
        }
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
     * @method addUrlAttachment
     * @description Handles adding an attachment from a URL string.
     * @param {string} url - The URL of the media to attach.
     * @returns {Promise<void>}
     */
    async addUrlAttachment(url) {
        if (this.mode !== 'chat') {
            this.showSystemMessage('URL attachments are only supported in chat mode.');
            return;
        }

        try {
            // A basic URL validation
            new URL(url);
        } catch (_) {
            this.showSystemMessage('请输入有效的 URL。');
            return;
        }

        // For URL attachments, we don't have a real MIME type until fetched,
        // so we'll use a generic placeholder or try to infer from extension.
        // The backend worker is responsible for handling the actual fetching and MIME type detection.
        const fileData = {
            id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'url',
            source: url,
            data: url, // For URL type, data is the URL itself
            mimeType: 'application/octet-stream', // Placeholder MIME type
            name: url.substring(url.lastIndexOf('/') + 1) || url,
        };

        this.clearAttachedFile('chat'); // Clear previous before adding new one
        this.attachedFile = fileData;

        // We need a generic preview for URLs as we don't have the content yet.
        this.displayFilePreview({
            type: 'url', // Special type for preview logic
            src: url,
            name: fileData.name,
            mode: 'chat'
        });

        this.showToast(`URL 已附加: ${fileData.name}`);
    }

    /**
     * @method _validateFile
     * @private
     * @description Validates a file based on type and size.
     * @param {File} file - The file to validate.
     * @returns {boolean} True if the file is valid, false otherwise.
     */
    _validateFile(file) {
        let allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm'];
        const maxSize = 20 * 1024 * 1024; // 20MB

        // Conditionally add more types for chat mode
        if (this.mode === 'chat') {
            allowedTypes.push('application/pdf', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4');
        }

        // A more robust check for generic types
        const isAllowed = allowedTypes.includes(file.type) ||
                          file.type.startsWith('image/') ||
                          file.type.startsWith('video/') ||
                          (this.mode === 'chat' && file.type.startsWith('audio/'));

        if (!isAllowed) {
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
        } else if (type === 'url') {
            previewElement = document.createElement('div');
            previewElement.className = 'file-placeholder url-placeholder';
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = 'link'; // 使用链接图标
            const text = document.createElement('p');
            text.textContent = name;
            previewElement.appendChild(icon);
            previewElement.appendChild(text);
        }
        else {
            previewElement = document.createElement('div');
            previewElement.className = 'file-placeholder';
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = 'description';
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
                this.removeVisionAttachment(index);
            } else {
                this.clearAttachedFile('chat');
            }
        };

        previewCard.appendChild(previewElement);
        previewCard.appendChild(closeButton);
        return previewCard;
    }
}
