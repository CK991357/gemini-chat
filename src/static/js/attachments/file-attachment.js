import { showSystemMessage, showToast } from '../chat/chat-ui.js';
import * as DOM from '../ui/dom-elements.js';

// State variables
export let attachedFile = null;
export let visionAttachedFiles = [];

/**
 * @function handleFileAttachment
 * @description Handles the file attachment event from a file input. It validates the file type and size,
 *              reads the file as a Base64 string, and then calls the function to display a preview.
 *              It supports different modes for chat and vision functionalities.
 * @param {Event} event - The file input change event.
 * @param {string} [mode='chat'] - The mode of attachment, can be 'chat' or 'vision'.
 * @returns {Promise<void>}
 */
export async function handleFileAttachment(event, mode = 'chat') {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const previewsContainer = mode === 'vision' ? DOM.visionAttachmentPreviews : DOM.fileAttachmentPreviews;

    for (const file of files) {
        // Check file type and size
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm'];
        if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showSystemMessage(`Unsupported file type: ${file.type}.`);
            continue;
        }
        if (file.size > 20 * 1024 * 1024) { // 20MB size limit
            showSystemMessage('File size cannot exceed 20MB.');
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
            showToast(`File attached: ${file.name}`);

        } catch (error) {
            console.error('Error processing file:', error);
            showSystemMessage(`Failed to process file: ${error.message}`);
        }
    }

    // Reset file input to allow selecting the same file again
    event.target.value = '';
}

/**
 * @function displayFilePreview
 * @description Displays a preview of the selected file in the corresponding preview area.
 * @param {object} options - The preview options.
 * @param {string} options.type - The type of preview ('image', 'video', 'pdf', etc.).
 * @param {string} options.src - The Base64 data URL of the file.
 * @param {string} options.name - The name of the file.
 * @param {string} options.mode - The mode, 'chat' or 'vision'.
 * @param {number} [options.index] - The index of the file in the vision attachments array.
 */
function displayFilePreview({ type, src, name, mode, index }) {
    const container = mode === 'vision' ? DOM.visionAttachmentPreviews : DOM.fileAttachmentPreviews;
    
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
 * @description Clears the attached file state and its preview from the UI.
 * @param {string} [mode='chat'] - The mode to clear attachments for, 'chat' or 'vision'.
 */
export function clearAttachedFile(mode = 'chat') {
    if (mode === 'vision') {
        visionAttachedFiles.length = 0; // More efficient way to clear array
        DOM.visionAttachmentPreviews.innerHTML = '';
    } else {
        attachedFile = null;
        DOM.fileAttachmentPreviews.innerHTML = '';
    }
}

/**
 * @function removeVisionAttachment
 * @description Removes a specific attachment from the vision mode file list and re-renders the previews.
 * @param {number} indexToRemove - The index of the attachment to remove.
 */
function removeVisionAttachment(indexToRemove) {
    visionAttachedFiles.splice(indexToRemove, 1);
    // Re-render all previews to correctly update indices
    DOM.visionAttachmentPreviews.innerHTML = '';
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