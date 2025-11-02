// src/static/js/image-gallery/image-manager.js


// 导出初始化函数，用于设置必要的 DOM 元素
// 私有变量和状态
let _elements = {}; // 存储模态框相关的 DOM 元素
let _currentImageSrc = null; // 用于存储当前显示的图片 src
let _currentImageTitle = null; // 用于存储当前显示的图片标题

export function initImageManager() {
    _elements = {
        modal: document.getElementById('image-modal'),
        closeButton: document.getElementById('close-image-modal'),
        modalImage: document.getElementById('modal-image-display'),
        modalTitle: document.getElementById('modal-image-title'),
        modalImageInfoTitle: document.getElementById('modal-image-info-title'),
        modalImageInfoDimensions: document.getElementById('modal-image-info-dimensions'),
        modalImageInfoSize: document.getElementById('modal-image-info-size'),
        modalImageInfoType: document.getElementById('modal-image-info-type'),
        modalImageInfoUrl: document.getElementById('modal-image-info-url'),
        copyUrlButton: document.getElementById('copy-image-url-button'),
        downloadButton: document.getElementById('download-image-button'),
    };

    setupModalEventListeners();
}

/**
 * 打开图片模态框。
 * @param {string} src 图片的 src 属性（Base64 或 URL）。
 * @param {string} title 图片的标题。
 * @param {string} dimensions 图片的尺寸信息。
 * @param {string} size 图片的文件大小信息。
 * @param {string} type 图片的文件类型信息。
 */
export function openImageModal(src, title = '图片详情', dimensions = 'N/A', size = 'N/A', type = 'N/A') {
    if (!_elements.modal) {
        console.error('Image modal elements not initialized.');
        return;
    }

    _currentImageSrc = src;
    _currentImageTitle = title;

    populateModalContent(src, title, dimensions, size, type);
    _elements.modal.style.display = 'flex'; // 显示模态框
    document.body.style.overflow = 'hidden'; // 禁止背景滚动
}

/**
 * 关闭图片模态框。
 */
function closeImageModal() {
    if (!_elements.modal) return;

    _elements.modal.style.display = 'none'; // 隐藏模态框
    document.body.style.overflow = ''; // 恢复背景滚动
    _currentImageSrc = null;
    _currentImageTitle = null;
}

/**
 * 填充模态框内容。
 * @param {string} src 图片的 src 属性（Base64 或 URL）。
 * @param {string} title 图片的标题。
 * @param {string} dimensions 图片的尺寸信息。
 * @param {string} size 图片的文件大小信息。
 * @param {string} type 图片的文件类型信息。
 */
function populateModalContent(src, title, dimensions, size, type) {
    _elements.modalImage.src = src;
    _elements.modalImage.alt = title;
    _elements.modalTitle.textContent = title;
    _elements.modalImageInfoTitle.textContent = title;
    _elements.modalImageInfoDimensions.textContent = dimensions;
    _elements.modalImageInfoSize.textContent = size;
    _elements.modalImageInfoType.textContent = type;
    _elements.modalImageInfoUrl.href = src; // 原始链接
    _elements.modalImageInfoUrl.textContent = src.length > 50 ? src.substring(0, 47) + '...' : src; // 显示部分或全部URL

    // 下载按钮设置
    const suggestedFileName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'download';
    _elements.downloadButton.href = src;
    _elements.downloadButton.download = `${suggestedFileName}.${type.split('/')[1] || 'png'}`; // 默认png
}

/**
 * 设置模态框事件监听器。
 */
function setupModalEventListeners() {
    if (!_elements.modal) return;

    _elements.closeButton.addEventListener('click', closeImageModal);
    _elements.modal.addEventListener('click', (event) => {
        if (event.target === _elements.modal) {
            closeImageModal();
        }
    });

    _elements.copyUrlButton.addEventListener('click', () => {
        copyToClipboard(_currentImageSrc);
    });

    // 下载按钮已经在 populateModalContent 中设置了 href 和 download 属性
}

/**
 * 辅助函数：将文本复制到剪贴板。
 * @param {string} text 要复制的文本。
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        // 可以添加一个视觉反馈，例如 toast 消息
        console.log('图片链接已复制到剪贴板！');
    } catch (err) {
        console.error('复制失败:', err);
    }
}

// 在文件末尾添加事件监听器等，确保 DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    initImageManager(); // 在 DOM 加载完成后初始化
});