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
    constructor({ chatPreviewsContainer, visionPreviewsContainer, showToast, showSystemMessage }) {
        this.chatPreviewsContainer = chatPreviewsContainer;
        this.visionPreviewsContainer = visionPreviewsContainer;
        this.showToast = showToast;
        this.showSystemMessage = showSystemMessage;

        this.attachedFile = null; // For single-file chat mode
        this.visionAttachedFiles = []; // For multi-file vision mode
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
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm'];
            if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                this.showSystemMessage(`不支持的文件类型: ${file.type}。`);
                continue;
            }
            if (file.size > 20 * 1024 * 1024) { // 20MB size limit
                this.showSystemMessage('文件大小不能超过 20MB。');
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
                    this.visionAttachedFiles.push(fileData);
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
        } else { // PDF or other
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
}