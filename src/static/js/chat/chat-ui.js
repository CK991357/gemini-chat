/**
 * @fileoverview Manages all UI rendering for the main chat interface.
 * This module is responsible for creating and displaying user messages,
 * AI responses, system logs, and other UI elements within the chat history.
 */

// Module-level state, populated by initChatUI
let elements = {};
let handlers = {};
let libraries = {};

// 导入 ImageManager 中的 openImageModal
import { openImageModal } from '../image-gallery/image-manager.js';

/**
 * Initializes the Chat UI module with necessary dependencies.
 * @param {object} el - A collection of essential DOM elements.
 * @param {object} hdl - A collection of event handler functions.
 * @param {object} libs - A collection of external libraries (e.g., marked, MathJax).
 */
export function initChatUI(el, hdl, libs) {
    elements = el;
    handlers = hdl;
    libraries = libs;
    
    // 🎯 初始化Agent事件监听器
    setupAgentEventListeners();
}

/**
 * Logs a message to the dedicated logs container in the UI.
 * @param {string} message - The message content to log.
 * @param {string} [type='system'] - The type of message (e.g., 'system', 'user', 'ai').
 */
export function logMessage(message, type = 'system') {
    if (!elements.logsContainer) return;
    const rawLogEntry = document.createElement('div');
    rawLogEntry.classList.add('log-entry', type);
    rawLogEntry.innerHTML = `
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="emoji">${type === 'system' ? '⚙️' : (type === 'user' ? '🫵' : '🤖')}</span>
        <span>${message}</span>
    `;
    elements.logsContainer.appendChild(rawLogEntry);
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

/**
 * Displays a user's message in the chat history, including text and optional attachments.
 * @param {string} text - The text content of the user's message.
 * @param {Array<object>} files - An array of file objects with base64 data for display.
 */
export function displayUserMessage(text, files) {
    if (!elements.messageHistory) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '👤';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    if (text) {
        const textNode = document.createElement('p');
        textNode.textContent = text;
        contentDiv.appendChild(textNode);
    }

    if (files && files.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'attachments-grid'; // Use a grid for multiple attachments

        files.forEach(file => {
            let fileDisplayElement;
            if (file.type.startsWith('image/')) {
                fileDisplayElement = document.createElement('img');
                fileDisplayElement.src = file.base64;
                fileDisplayElement.alt = file.name || 'Attached Image';
                fileDisplayElement.style.maxWidth = '200px';
                fileDisplayElement.style.maxHeight = '200px';
                fileDisplayElement.style.borderRadius = '8px';
            } else if (file.type === 'application/pdf') {
                fileDisplayElement = document.createElement('div');
                fileDisplayElement.className = 'file-placeholder';
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-file-pdf';
                const textElement = document.createElement('p');
                textElement.textContent = file.name;
                fileDisplayElement.appendChild(icon);
                fileDisplayElement.appendChild(textElement);
            } else if (file.type.startsWith('audio/')) {
                // For audio files in chat history, we use the full audio player
                fileDisplayElement = document.createElement('audio');
                fileDisplayElement.src = file.base64;
                fileDisplayElement.controls = true;
                fileDisplayElement.style.maxWidth = '100%';
            } else {
                fileDisplayElement = document.createElement('div');
                fileDisplayElement.className = 'file-placeholder';
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-file';
                const textElement = document.createElement('p');
                textElement.textContent = file.name;
                fileDisplayElement.appendChild(icon);
                fileDisplayElement.appendChild(textElement);
            }

            if (fileDisplayElement) {
                fileDisplayElement.classList.add('chat-attachment'); // Add a class for styling
                attachmentsContainer.appendChild(fileDisplayElement);
            }
        });
        contentDiv.appendChild(attachmentsContainer);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * Displays an audio message player in the chat history.
 * The transcription logic is handled by an injected handler.
 * @param {string} audioUrl - The URL of the audio file to be played.
 * @param {number} duration - The duration of the audio in seconds.
 * @param {string} type - The message type, either 'user' or 'ai'.
 * @param {Blob} audioBlob - The raw audio blob for transcription.
 */
export function displayAudioMessage(audioUrl, duration, type, audioBlob) {
    if (!elements.messageHistory) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = type === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content', 'audio-content');

    const audioPlayerDiv = document.createElement('div');
    audioPlayerDiv.classList.add('audio-player');

    const playButton = document.createElement('button');
    playButton.classList.add('audio-play-button');
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

    const audioWaveform = document.createElement('div');
    audioWaveform.classList.add('audio-waveform');
    const audioProgressBar = document.createElement('div');
    audioProgressBar.classList.add('audio-progress-bar');
    audioWaveform.appendChild(audioProgressBar);

    const audioDurationSpan = document.createElement('span');
    audioDurationSpan.classList.add('audio-duration');
    audioDurationSpan.textContent = handlers.formatTime ? handlers.formatTime(duration) : '00:00';

    const downloadButton = document.createElement('a');
    downloadButton.classList.add('audio-download-button');
    downloadButton.innerHTML = '<i class="fa-solid fa-download"></i>';
    downloadButton.download = `gemini_audio_${Date.now()}.wav`;
    downloadButton.href = audioUrl;

    const transcribeButton = document.createElement('button');
    transcribeButton.classList.add('audio-transcribe-button');
    transcribeButton.innerHTML = '<i class="fa-solid fa-file-alt"></i>';
    transcribeButton.addEventListener('click', () => {
        if (handlers.transcribeAudioHandler) {
            handlers.transcribeAudioHandler(audioBlob, transcribeButton);
        }
    });

    const audioElement = new Audio(audioUrl);
    audioElement.preload = 'metadata';
    audioElement.addEventListener('timeupdate', () => {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        audioProgressBar.style.width = `${progress}%`;
        if (handlers.formatTime) {
            audioDurationSpan.textContent = handlers.formatTime(audioElement.currentTime);
        }
    });
    audioElement.addEventListener('ended', () => {
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        audioProgressBar.style.width = '0%';
        if (handlers.formatTime) {
            audioDurationSpan.textContent = handlers.formatTime(duration);
        }
    });
    playButton.addEventListener('click', () => {
        if (audioElement.paused) {
            audioElement.play();
            playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            audioElement.pause();
            playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    });

    audioPlayerDiv.appendChild(playButton);
    audioPlayerDiv.appendChild(audioWaveform);
    audioPlayerDiv.appendChild(audioDurationSpan);
    audioPlayerDiv.appendChild(downloadButton);
    audioPlayerDiv.appendChild(transcribeButton);
    contentDiv.appendChild(audioPlayerDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * Creates and returns a new AI message element, ready to be populated.
 * @returns {object} An object containing references to the message's container,
 * markdown container, reasoning container, and a buffer for raw markdown.
 */
export function createAIMessageElement() {
    if (!elements.messageHistory) return null;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none';
    const reasoningTitle = document.createElement('h4');
    reasoningTitle.className = 'reasoning-title';
    reasoningTitle.innerHTML = '<span class="material-symbols-outlined">psychology</span> 思维链';
    const reasoningContent = document.createElement('div');
    reasoningContent.className = 'reasoning-content';
    reasoningContainer.appendChild(reasoningTitle);
    reasoningContainer.appendChild(reasoningContent);
    contentDiv.appendChild(reasoningContainer);

    const markdownContainer = document.createElement('div');
    markdownContainer.classList.add('markdown-container');
    contentDiv.appendChild(markdownContainer);

    // 复制按钮 - 复制渲染后的纯文本
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button');
    copyButton.title = '复制渲染文本';
    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyButton.addEventListener('click', async () => {
        try {
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
            copyButton.title = '已复制！';
            setTimeout(() => { 
                copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
                copyButton.title = '复制渲染文本';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    // 🆕 新增：复制原始Markdown按钮
    const copyRawButton = document.createElement('button');
    copyRawButton.classList.add('copy-raw-button');
    copyRawButton.title = '复制原始Markdown';
    copyRawButton.innerHTML = '<i class="fa-solid fa-code"></i>';
    copyRawButton.addEventListener('click', async () => {
        try {
            // 通过按钮引用获取消息元素
            const el = copyRawButton._messageEl;
            let textToCopy = '';
            
            // 如果有思维链，先添加思维链
            if (el.rawReasoningBuffer && el.rawReasoningBuffer.trim() !== '') {
                textToCopy += `<!-- 思维链开始 -->\n${el.rawReasoningBuffer}\n<!-- 思维链结束 -->\n\n`;
            }
            
            // 添加主要内容的原始Markdown
            textToCopy += el.rawMarkdownBuffer || '';
            
            await navigator.clipboard.writeText(textToCopy);
            copyRawButton.innerHTML = '<i class="fa-solid fa-check"></i>';
            copyRawButton.title = '已复制原始Markdown！';
            setTimeout(() => { 
                copyRawButton.innerHTML = '<i class="fa-solid fa-code"></i>';
                copyRawButton.title = '复制原始Markdown';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy raw markdown: ', err);
        }
    });

    contentDiv.appendChild(copyButton);
    contentDiv.appendChild(copyRawButton); // 🆕 添加新按钮
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();

    // 创建返回对象
    const el = {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: '',
        rawReasoningBuffer: '',
        copyButton: copyButton,
        copyRawButton: copyRawButton // 🆕 存储引用
    };

    // 🆕 为按钮添加对el对象的引用，方便事件处理器访问
    copyButton._messageEl = el;
    copyRawButton._messageEl = el;

    return el;
}

/**
 * 通用添加消息接口（兼容旧代码调用 chatUI.addMessage）
 * @param {{role:string, content:string}} msg
 */
export function addMessage(msg) {
    if (!msg || !msg.role) return;
    const role = msg.role;
    let content = msg.content || '';

    if (role === 'assistant') {
        const el = createAIMessageElement();
        if (!el) return;
        
        // 存储原始内容到缓冲区
        let rawContent = content;
        
        // 如果 content 是对象，尝试提取友好字段（stdout/output），否则格式化为代码块
        if (typeof content === 'object' && content !== null) {
            if (typeof content.stdout === 'string') {
                content = content.stdout;
                rawContent = content; // 使用处理后的字符串作为原始内容
            } else if (typeof content.output === 'string') {
                content = content.output;
                rawContent = content; // 使用处理后的字符串作为原始内容
            } else {
                // 为对象生成可读 JSON
                const pre = document.createElement('pre');
                pre.className = 'assistant-json-output';
                const jsonString = JSON.stringify(content, null, 2);
                pre.textContent = jsonString;
                el.markdownContainer.appendChild(pre);
                
                // 🆕 存储原始JSON到缓冲区
                el.rawMarkdownBuffer = jsonString;
                
                scrollToBottom();
                return;
            }
        }

        // 🆕 存储原始Markdown内容
        el.rawMarkdownBuffer = String(rawContent);
        
        if (libraries && libraries.marked) {
            try {
                el.markdownContainer.innerHTML = libraries.marked.parse(String(content));
            } catch (_e) {
                el.markdownContainer.textContent = String(content);
            }
        } else {
            el.markdownContainer.textContent = String(content);
        }
        scrollToBottom();
    } else if (role === 'user') {
        // 简单地显示用户消息
        displayUserMessage(content, msg.files || []);
    } else {
        // 将系统消息记录到日志
        logMessage(content, 'system');
    }
}

/**
 * Scrolls the main message history container to the bottom.
 * Respects user's manual scrolling.
 */
export function scrollToBottom() {
    if (!elements.messageHistory || (handlers.isUserScrolling && handlers.isUserScrolling())) return;
    requestAnimationFrame(() => {
        elements.messageHistory.scrollTop = elements.messageHistory.scrollHeight;
    });
}

/**
 * @function displayToolCallStatus
 * @description 在聊天记录中显示一个工具调用状态的UI提示。
 * @param {string} toolName - 正在调用的工具名称。
 * @param {object} args - 传递给工具的参数。
 * @returns {HTMLElement} 返回创建的状态元素。
 */
export function displayToolCallStatus(toolName, _args) {
    if (!elements.messageHistory) return null;
    const statusDiv = document.createElement('div');
    statusDiv.className = 'tool-call-status';

    const icon = document.createElement('i');
    icon.className = 'fas fa-cog fa-spin'; // 使用 Font Awesome 齿轮图标并添加旋转效果

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'tool-status-content-wrapper';

    const text = document.createElement('span');
    text.className = 'tool-status-text';
    text.textContent = `正在调用工具: ${toolName}...`;

    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'tool-progress-bar-container';
    progressBarContainer.style.display = 'none'; // 默认隐藏
    const progressBar = document.createElement('div');
    progressBar.className = 'tool-progress-bar';
    progressBarContainer.appendChild(progressBar);

    contentWrapper.appendChild(text);
    contentWrapper.appendChild(progressBarContainer);

    statusDiv.appendChild(icon);
    statusDiv.appendChild(contentWrapper);

    elements.messageHistory.appendChild(statusDiv);
    scrollToBottom();
    
    // 🎯 存储对进度条的引用，方便更新
    statusDiv.progressBar = progressBar;
    statusDiv.statusTextElement = text;

    return statusDiv; // 返回元素以便在 chat-api-handler 中引用
}

/**
 * @function updateToolCallProgress
 * @description 实时更新工具调用状态的文本和进度条。
 * @param {HTMLElement} element - displayToolCallStatus 返回的状态元素。
 * @param {string} statusText - 要显示的新状态文本。
 * @param {number|null} progress - 0到100的进度值，或null。
 */
export function updateToolCallProgress(element, statusText, progress) {
    if (!element || !element.statusTextElement) return;

    element.statusTextElement.textContent = statusText;

    if (progress !== null && progress >= 0 && progress <= 100) {
        const progressBarContainer = element.querySelector('.tool-progress-bar-container');
        if (progressBarContainer) {
            progressBarContainer.style.display = 'block';
        }
        if (element.progressBar) {
            element.progressBar.style.width = `${progress}%`;
        }
    }
}
 
/**
 * @function markToolCallCompleted
 * @description 标记工具调用状态为完成或失败，将图标替换为最终标记，并移除进度条。
 * @param {HTMLElement} element - displayToolCallStatus 返回的状态元素。
 * @param {boolean} success - 是否成功完成。
 */
export function markToolCallCompleted(element, success = true) {
    if (!element) return;

    // 1. 替换图标
    const icon = element.querySelector('.fa-cog');
    if (icon) {
        icon.classList.remove('fa-cog', 'fa-spin');
        icon.classList.add(success ? 'fa-check-circle' : 'fa-times-circle');
        icon.style.color = success ? 'green' : 'red';
    }
    
    // 2. 移除进度条
    const progressBarContainer = element.querySelector('.tool-progress-bar-container');
    if (progressBarContainer) {
        progressBarContainer.parentNode.removeChild(progressBarContainer);
    }
    
    // 3. 更新最终状态文本
    if (element.statusTextElement) {
        element.statusTextElement.textContent = success ?
            element.statusTextElement.textContent.replace('...', ' (完成)') :
            element.statusTextElement.textContent.replace('...', ' (失败)');
    }
}

/**
 * @function removeToolCallStatus
 * @description 移除工具调用状态的UI提示。
 * @param {HTMLElement} element - displayToolCallStatus 返回的状态元素。
 */
export function removeToolCallStatus(element) {
    // 保持此函数存在，但不再在 _handleMcpToolCall 中调用它
    if (element && element.parentNode) {
        // element.parentNode.removeChild(element); // 保持原样，但我们不会调用它
    }
}

/**
 * Displays an image in the chat history. Handles both full Data URLs and raw Base64 strings.
 * @param {string} imageData - The full Data URL (e.g., 'data:image/png;base64,...') or a raw Base64 string.
 * @param {string} [altText='Generated Image'] - Alternative text for the image.
 * @param {string} [fileName='generated_image.png'] - The default filename for download.
 */
export function displayImageResult(imageData, altText = 'Generated Image', _fileName = 'generated_image.png') {
    if (!elements.messageHistory) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content', 'image-result-content');

    const imageElement = document.createElement('img');
    
    // ================================================================
    // 🚀 [最终方案] 智能 URL 构造逻辑
    // ================================================================
    let finalSrc = imageData;
    // 检查传入的字符串是否已经是一个完整的 Data URL
    if (!imageData.startsWith('data:image/')) {
        // 如果不是，则假定它是一个裸的 Base64 字符串，并为其添加前缀
        console.warn('[displayImageResult] Received raw Base64 string. Adding Data URL prefix. This might indicate a legacy call.');
        finalSrc = `data:image/png;base64,${imageData}`;
    }
    // ================================================================

    imageElement.src = finalSrc; // 使用处理过的 finalSrc
    imageElement.alt = altText;
    imageElement.classList.add('chat-image-result');
    contentDiv.appendChild(imageElement);
    
    // ... (后续的 onload 和 onerror 逻辑保持不变) ...

    let dimensions = 'N/A';
    let imageType = 'image/png';

    // 从 finalSrc 中提取 MIME 类型
    const mimeMatch = finalSrc.match(/^data:(image\/[a-zA-Z0-9-.+]+);base64,/);
    if (mimeMatch && mimeMatch[1]) {
        imageType = mimeMatch[1];
    }
    
    imageElement.onload = () => {
        dimensions = `${imageElement.naturalWidth}x${imageElement.naturalHeight} px`;
        const base64Data = finalSrc.split(',')[1] || '';
        const sizeInBytes = (base64Data.length * 0.75) - (base64Data.endsWith('==') ? 2 : (base64Data.endsWith('=') ? 1 : 0));
        const sizeInKB = (sizeInBytes / 1024).toFixed(2);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        const size = sizeInKB < 1024 ? `${sizeInKB} KB` : `${sizeInMB} MB`;

        imageElement.addEventListener('click', () => {
            // 传递 finalSrc，确保模态框接收到正确的 Data URL
            openImageModal(finalSrc, altText, dimensions, size, imageType);
        });
    };

    imageElement.onerror = () => {
        // 在 onerror 日志中打印 finalSrc，便于调试
        console.error('Failed to load image for modal preview:', finalSrc);
    };

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}
// 🚀🚀🚀 [v2.2 核心新增] 可导出的文件下载链接创建函数 🚀🚀🚀
/**
 * @description 在聊天窗口中创建一个独立的消息气泡，用于文件下载。
 * @param {string} base64Data - Base64编码的文件数据。
 * @param {string} fileName - 下载时的文件名。
 * @param {string} fileType - 文件类型 (e.g., 'word', 'excel', 'powerpoint')。
 */
export function createFileDownloadLink(base64Data, fileName, fileType) {
    const timestamp = () => new Date().toISOString();
    console.log(`[${timestamp()}] [FILE UI] Creating download link for ${fileType}: ${fileName}`);
    
    try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const mimeTypes = {
            'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'word': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'powerpoint': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // 兼容 ppt
            'pdf': 'application/pdf'
        };
        
        const mimeType = mimeTypes[fileType] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName;
        downloadLink.textContent = `📥 Download ${fileType.toUpperCase()}: ${fileName}`;
        downloadLink.className = 'file-download-link';
        
        // --- 保证样式一致的核心 ---
        // 将所有内联样式原封不动地复制过来
        downloadLink.style.display = 'inline-block';
        downloadLink.style.margin = '10px 0';
        downloadLink.style.padding = '8px 12px';
        downloadLink.style.backgroundColor = '#f0f8ff';
        downloadLink.style.border = '1px solid #007acc';
        downloadLink.style.borderRadius = '4px';
        downloadLink.style.color = '#007acc';
        downloadLink.style.textDecoration = 'none';
        downloadLink.style.fontWeight = 'bold';
        // --- 样式代码结束 ---

        // 创建一个独立的消息容器来展示下载链接
        const messageContainer = createAIMessageElement();
        
        if (messageContainer && messageContainer.markdownContainer) {
            const successMsg = document.createElement('p');
            successMsg.textContent = `✅ 文件 ${fileName} 已生成并可供下载。`;
            // 您可以为这段文字也添加一些样式，使其更突出
            successMsg.style.fontWeight = 'bold';
            successMsg.style.margin = '5px 0';

            messageContainer.markdownContainer.appendChild(successMsg);
            messageContainer.markdownContainer.appendChild(downloadLink);
        }
        
        downloadLink.addEventListener('click', () => {
            setTimeout(() => { URL.revokeObjectURL(url); }, 100);
        });
        
        scrollToBottom();
        
    } catch (error) {
        console.error(`[${timestamp()}] [FILE UI] Error creating download link:`, error);
        const errorContainer = createAIMessageElement();
        if (errorContainer && errorContainer.markdownContainer) {
            errorContainer.markdownContainer.innerHTML = `<p style="color: red;">创建文件下载时出错 ${fileName}: ${error.message}</p>`;
        }
    }
}

/**
 * 🎯 显示Agent思考过程在聊天区
 */
export function displayAgentThinking(content, iteration, sessionId) {
    if (!elements.messageHistory) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai', 'agent-thinking');
    messageDiv.setAttribute('data-agent-session', sessionId);
    messageDiv.setAttribute('data-iteration', iteration);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const thinkingHeader = document.createElement('div');
    thinkingHeader.className = 'agent-thinking-header';
    thinkingHeader.innerHTML = `
        <span class="agent-badge">Agent思考</span>
        <span class="iteration-badge">第${iteration}次迭代</span>
    `;

    const thinkingContent = document.createElement('div');
    thinkingContent.className = 'agent-thinking-content';
    thinkingContent.textContent = content;

    contentDiv.appendChild(thinkingHeader);
    contentDiv.appendChild(thinkingContent);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * 🎯 显示Agent步骤在聊天区
 */
export function displayAgentStep(step, sessionId) {
    if (!elements.messageHistory) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai', 'agent-step');
    messageDiv.setAttribute('data-agent-session', sessionId);
    messageDiv.setAttribute('data-step-type', step.type);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = step.type === 'think' ? '💭' : '🎯';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const stepHeader = document.createElement('div');
    stepHeader.className = 'agent-step-header';
    
    const stepTypeMap = {
        'think': { text: '模型思考', icon: '💭' },
        'action': { text: '工具执行', icon: '🛠️' },
        'observation': { text: '执行结果', icon: '📊' }
    };
    
    const stepInfo = stepTypeMap[step.type] || { text: step.type, icon: '📝' };
    
    stepHeader.innerHTML = `
        <span class="step-type">${stepInfo.icon} ${stepInfo.text}</span>
        ${step.tool ? `<span class="tool-badge">${step.tool}</span>` : ''}
    `;

    const stepContent = document.createElement('div');
    stepContent.className = 'agent-step-content';
    
    if (step.type === 'think') {
        stepContent.innerHTML = `
            <div class="thinking-text">${escapeHtml(step.content)}</div>
        `;
    } else if (step.type === 'action') {
        stepContent.innerHTML = `
            <div class="action-info">
                <strong>工具:</strong> ${step.tool}
            </div>
            ${step.parameters ? `
            <details class="parameters-details">
                <summary>参数</summary>
                <pre>${JSON.stringify(step.parameters, null, 2)}</pre>
            </details>
            ` : ''}
        `;
    } else if (step.type === 'observation') {
        stepContent.innerHTML = `
            <div class="observation-result ${step.success ? 'success' : 'error'}">
                <strong>${step.success ? '✅ 成功' : '❌ 失败'}:</strong>
                <div class="output-text">${escapeHtml(step.content)}</div>
            </div>
        `;
    }

    contentDiv.appendChild(stepHeader);
    contentDiv.appendChild(stepContent);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * 🎯 显示Agent最终答案在聊天区
 */
export function displayAgentFinalAnswer(content, sessionId, iterations) {
    if (!elements.messageHistory) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai', 'agent-final-answer');
    messageDiv.setAttribute('data-agent-session', sessionId);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🎉';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const header = document.createElement('div');
    header.className = 'agent-final-header';
    header.innerHTML = `
        <span class="final-badge">Agent最终答案</span>
        <span class="iterations-info">经过 ${iterations} 次迭代</span>
    `;

    const answerContent = document.createElement('div');
    answerContent.className = 'agent-answer-content';
    
    // 使用marked解析markdown内容
    if (libraries && libraries.marked) {
        answerContent.innerHTML = libraries.marked.parse(content);
    } else {
        answerContent.textContent = content;
    }

    contentDiv.appendChild(header);
    contentDiv.appendChild(answerContent);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();
    
    // 应用数学公式渲染
    if (libraries && libraries.MathJax && libraries.MathJax.typeset) {
        libraries.MathJax.typeset([answerContent]);
    }
}

/**
 * 🎯 显示Agent错误在聊天区
 */
export function displayAgentError(error, sessionId, iteration) {
    if (!elements.messageHistory) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai', 'agent-error');
    messageDiv.setAttribute('data-agent-session', sessionId);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '❌';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const errorHeader = document.createElement('div');
    errorHeader.className = 'agent-error-header';
    errorHeader.innerHTML = `
        <span class="error-badge">Agent执行错误</span>
        <span class="iteration-info">第${iteration}次迭代</span>
    `;

    const errorContent = document.createElement('div');
    errorContent.className = 'agent-error-content';
    errorContent.textContent = error;

    contentDiv.appendChild(errorHeader);
    contentDiv.appendChild(errorContent);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * 🎯 设置Agent事件监听器
 */
export function setupAgentEventListeners() {
    // Agent开始事件
    window.addEventListener('chat:agent_started', (event) => {
        const { userMessage, sessionId, maxIterations } = event.detail;
        
        // 显示Agent开始消息
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'system', 'agent-start');
        messageDiv.setAttribute('data-agent-session', sessionId);
        
        messageDiv.innerHTML = `
            <div class="avatar">🚀</div>
            <div class="content">
                <div class="agent-start-header">
                    <span class="agent-title">🤖 Agent模式启动</span>
                </div>
                <div class="agent-start-info">
                    <p><strong>用户请求:</strong> ${escapeHtml(userMessage)}</p>
                    <p><strong>最大迭代次数:</strong> ${maxIterations}</p>
                    <p><strong>会话ID:</strong> ${sessionId}</p>
                </div>
            </div>
        `;
        
        if (elements.messageHistory) {
            elements.messageHistory.appendChild(messageDiv);
            scrollToBottom();
        }
    });

    // Agent思考事件
    window.addEventListener('chat:agent_thinking', (event) => {
        const { content, iteration, sessionId } = event.detail;
        displayAgentThinking(content, iteration, sessionId);
    });

    // Agent步骤事件
    window.addEventListener('chat:agent_step', (event) => {
        displayAgentStep(event.detail, event.detail.sessionId);
    });

    // Agent步骤完成事件
    window.addEventListener('chat:agent_step_completed', (event) => {
        displayAgentStep(event.detail, event.detail.sessionId);
    });

    // Agent最终答案事件
    window.addEventListener('chat:agent_final_answer', (event) => {
        const { content, sessionId, iterations } = event.detail;
        displayAgentFinalAnswer(content, sessionId, iterations);
    });

    // Agent错误事件
    window.addEventListener('chat:agent_error', (event) => {
        const { error, iteration, sessionId } = event.detail;
        displayAgentError(error, sessionId, iteration);
    });

    // Agent完成事件
    window.addEventListener('chat:agent_completed', (event) => {
        const { result, sessionId, duration } = event.detail;
        
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'system', 'agent-complete');
        messageDiv.setAttribute('data-agent-session', sessionId);
        
        const durationSeconds = (duration / 1000).toFixed(1);
        const modelName = result.model || 'N/A';
        
        messageDiv.innerHTML = `
            <div class="avatar">🏁</div>
            <div class="content">
                <div class="agent-complete-header">
                    <span class="complete-badge">Agent执行完成</span>
                </div>
                <div class="agent-complete-info">
                    <p><strong>模型:</strong> ${modelName}</p>
                    <p><strong>总用时:</strong> ${durationSeconds}秒</p>
                    <p><strong>迭代次数:</strong> ${result.iterations}</p>
                    <p><strong>任务复杂度:</strong> ${result.taskComplexity}</p>
                    <p><strong>状态:</strong> ${result.success ? '✅ 成功' : '❌ 失败'}</p>
                    ${result.hasErrors ? '<p><strong>⚠️ 包含错误步骤</strong></p>' : ''}
                </div>
            </div>
        `;
        
        if (elements.messageHistory) {
            elements.messageHistory.appendChild(messageDiv);
            scrollToBottom();
        }
    });
}

// HTML转义辅助函数
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, '<br>');
}