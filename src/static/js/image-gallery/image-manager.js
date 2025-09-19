// src/static/js/image-gallery/image-manager.js

const IMAGE_MODAL_HTML = `
    <div id="imagePreviewModal" class="modal">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2 class="modal-title">图片详情</h2>
            <div class="modal-image-container">
                <img id="modalImage" src="" alt="图片预览">
            </div>
            <div class="modal-info">
                <p>
                    <i class="fas fa-id-card" aria-hidden="true"></i> Public ID:
                    <span id="modalPublicId"></span>
                    <button class="copy-button" data-target="modalPublicId" aria-label="复制 Public ID">
                        <i class="fas fa-copy" aria-hidden="true"></i>
                    </button>
                </p>
                <p>
                    <i class="fas fa-link" aria-hidden="true"></i> URL:
                    <a id="modalImageUrl" href="#" target="_blank">点击查看完整URL</a>
                    <button class="copy-button" data-target="modalImageUrl" aria-label="复制 URL">
                        <i class="fas fa-copy" aria-hidden="true"></i>
                    </button>
                    <button class="open-link-button" data-target="modalImageUrl" aria-label="在新标签页打开">
                        <i class="fas fa-external-link-alt" aria-hidden="true"></i>
                    </button>
                </p>
            </div>
            <div class="modal-actions">
                <button id="modalDeleteButton" class="btn-danger">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i> 删除图片
                </button>
                <button id="modalDownloadButton" class="btn-primary">
                    <i class="fas fa-download" aria-hidden="true"></i> 下载
                </button>
                <button id="modalCloseButton" class="btn-secondary">
                    <i class="fas fa-times" aria-hidden="true"></i> 关闭
                </button>
            </div>
        </div>
    </div>
`;

// 导出初始化函数，用于设置必要的 DOM 元素
export function initImageManager() {
    // 将模态框 HTML 添加到 body
    if (!document.getElementById('imagePreviewModal')) {
        document.body.insertAdjacentHTML('beforeend', IMAGE_MODAL_HTML);
    }

    _elements = {
        modal: document.getElementById('imagePreviewModal'),
        closeButton: document.querySelector('#imagePreviewModal .close-button'),
        modalImage: document.getElementById('modalImage'),
        modalPublicId: document.getElementById('modalPublicId'),
        modalImageUrl: document.getElementById('modalImageUrl'),
        copyPublicIdButton: document.querySelector('.copy-button[data-target="modalPublicId"]'),
        copyUrlButton: document.querySelector('.copy-button[data-target="modalImageUrl"]'),
        openLinkButton: document.querySelector('.open-link-button[data-target="modalImageUrl"]'),
        deleteButton: document.getElementById('modalDeleteButton'),
        downloadButton: document.getElementById('modalDownloadButton'),
        modalCloseButton: document.getElementById('modalCloseButton'),
        modalContent: document.querySelector('#imagePreviewModal .modal-content'), // 新增
    };

    setupModalEventListeners();
}

// 导出核心函数，用于在聊天界面显示图片并绑定浮窗事件
export function displayCloudinaryImage(imageElement, secureUrl, publicId, altText = 'Generated Image') {
    if (!imageElement || !secureUrl || !publicId) {
        console.error('Invalid parameters for updateImageWithCloudinaryInfo:', imageElement, secureUrl, publicId);
        return;
    }

    // 更新图片的 src 为 Cloudinary URL
    imageElement.src = secureUrl;
    imageElement.alt = altText; // 更新 alt 文本
    imageElement.dataset.publicId = publicId; // 存储 public_id

    // 为图片绑定点击事件，打开模态框
    imageElement.style.cursor = 'pointer'; // 提示用户可点击
    imageElement.addEventListener('click', () => openImageModal(secureUrl, publicId));
}

// 浮窗相关函数
function openImageModal(imageUrl, publicId) {
    if (!_elements.modal) return;

    populateModalContent(imageUrl, publicId);
    _elements.modal.classList.add('active'); // 添加 active 类以显示模态框
    document.body.style.overflow = 'hidden'; // 禁止背景滚动
}

function closeImageModal() {
    if (!_elements.modal) return;

    _elements.modal.classList.remove('active'); // 移除 active 类以隐藏模态框
    document.body.style.overflow = ''; // 恢复背景滚动
    _currentPublicId = null;
    _currentImageUrl = null;
}

function populateModalContent(imageUrl, publicId) {
    _elements.modalImage.src = imageUrl;
    _elements.modalImage.alt = publicId;
    _elements.modalPublicId.textContent = publicId;
    _elements.modalImageUrl.href = imageUrl;
    _elements.modalImageUrl.textContent = imageUrl; // 显示完整 URL

    _currentPublicId = publicId;
    _currentImageUrl = imageUrl;
}

function setupModalEventListeners() {
    if (!_elements.modal) return;

    _elements.closeButton.addEventListener('click', closeImageModal);
    _elements.modalCloseButton.addEventListener('click', closeImageModal);
    _elements.modal.addEventListener('click', (event) => {
        if (event.target === _elements.modal) {
            closeImageModal();
        }
    });

    // 防止在模态框内容上点击时关闭
    _elements.modalContent.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    _elements.copyPublicIdButton.addEventListener('click', () => copyToClipboard(_elements.modalPublicId.textContent));
    _elements.copyUrlButton.addEventListener('click', () => copyToClipboard(_elements.modalImageUrl.href));
    _elements.openLinkButton.addEventListener('click', () => window.open(_elements.modalImageUrl.href, '_blank'));
    _elements.downloadButton.addEventListener('click', () => downloadImage(_currentImageUrl, _currentPublicId.split('/').pop() + '.png')); // 简单处理文件名
    _elements.deleteButton.addEventListener('click', () => {
        if (confirm('确定要删除这张图片吗？此操作不可逆！')) {
            deleteCloudinaryImage(_currentPublicId);
        }
    });
}

// 辅助函数（复制、下载、删除）
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert('已复制到剪贴板！');
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制。');
    }
}

async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        alert('图片下载成功！');
    } catch (error) {
        console.error('下载图片失败:', error);
        alert('下载图片失败。');
    }
}

async function deleteCloudinaryImage(publicId) {
    try {
        // 由于 Worker 间通信通常不需要密码，这里移除前端密码提示
        // 假设 kapture-worker 会处理其自身的身份验证逻辑，或者不需要密码
        const response = await fetch('/api/cloudinary/delete-image', { // 修改路径为 /api/cloudinary/delete-image
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                // 'Authorization': `Bearer ${password}` // 移除认证密码
            },
            body: JSON.stringify({ public_id: publicId })
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message || '图片删除成功！');
            closeImageModal();
            // 可能需要通知画廊刷新
        } else {
            alert(`图片删除失败: ${result.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('删除图片失败:', error);
        alert('删除图片失败。');
    }
}

export async function uploadBase64ToCloudinary(base64Image, fileName, folder = 'ai_generated_images') { // 移除 password 参数
    try {
        const response = await fetch('/api/cloudinary/upload-base64', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'Authorization': `Bearer ${password}` // 移除认证密码
            },
            body: JSON.stringify({ base64Image, fileName, folder })
        });

        const result = await response.json();

        if (response.ok) {
            console.log('图片上传到 Cloudinary 成功:', result);
            return {
                public_id: result.public_id,
                secure_url: result.secure_url
            };
        } else {
            console.error('图片上传到 Cloudinary 失败:', result.error);
            throw new Error(result.error || 'Failed to upload image to Cloudinary.');
        }
    } catch (error) {
        console.error('上传 Base64 图片到 Cloudinary 发生错误:', error);
        throw error;
    }
}

// 私有变量和状态
let _elements = {}; // 存储模态框相关的 DOM 元素
let _currentPublicId = null;
let _currentImageUrl = null;

// 在文件末尾添加事件监听器等，确保 DOM 加载完成后执行
// document.addEventListener('DOMContentLoaded', () => {
//     initImageManager(); // 在 DOM 加载完成后初始化
// });