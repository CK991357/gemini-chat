/**
 * @fileoverview Image compression utility for reducing image file sizes
 * before uploading to AI models. Primarily used in vision mode.
 */

/**
 * @class ImageCompressor
 * @description Handles image compression with configurable quality and size limits
 */
export class ImageCompressor {
    constructor() {
        this.MAX_DIMENSION = 1024; // 最大边长限制
        this.DEFAULT_QUALITY = 0.95; // 默认压缩质量
        this.COMPRESSION_THRESHOLD = 1024 * 1024; // 1MB 压缩门槛
    }

    /**
     * 检查文件是否需要压缩
     * @param {File} file - 原始文件
     * @returns {boolean} - 是否需要压缩
     */
    needsCompression(file) {
        return file.size > this.COMPRESSION_THRESHOLD && file.type.startsWith('image/');
    }

    /**
     * 压缩图片文件
     * @param {File} file - 原始图片文件
     * @param {object} options - 压缩选项
     * @param {number} [options.quality=0.8] - 压缩质量 (0-1)
     * @param {number} [options.maxDimension=1024] - 最大边长
     * @param {boolean} [options.keepFormat=true] - 是否保持原始格式
     * @returns {Promise<File>} - 压缩后的文件
     */
    async compressImage(file, options = {}) {
        const { 
            quality = this.DEFAULT_QUALITY, 
            maxDimension = this.MAX_DIMENSION,
            keepFormat = true 
        } = options;
        
        if (!this.needsCompression(file)) {
            return file;
        }

        try {
            return await this._processImage(file, quality, maxDimension, keepFormat);
        } catch (error) {
            console.warn('图片压缩失败，使用原始文件:', error);
            return file;
        }
    }

    /**
     * 内部图片处理方法
     * @private
     */
    async _processImage(file, quality, maxDimension, keepFormat) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                try {
                    // 计算压缩后的尺寸
                    const { width, height } = this._calculateDimensions(
                        img.width, 
                        img.height, 
                        maxDimension
                    );
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // 设置更好的图片质量
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // 绘制并压缩
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 确定输出格式和文件名
                    const outputFormat = keepFormat ? file.type : 'image/jpeg';
                    const outputFileName = keepFormat ? file.name : this._getCompressedFileName(file.name);
                    
                    // 转换为Blob
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('压缩失败：无法生成blob'));
                            return;
                        }
                        
                        // 创建新的File对象
                        const compressedFile = new File(
                            [blob], 
                            outputFileName,
                            { 
                                type: outputFormat,
                                lastModified: Date.now()
                            }
                        );
                        
                        console.log(`图片压缩完成: ${(file.size / 1024).toFixed(2)}KB → ${(compressedFile.size / 1024).toFixed(2)}KB`);
                        resolve(compressedFile);
                    }, outputFormat, quality);
                    
                } catch (error) {
                    reject(error);
                } finally {
                    // 清理资源
                    URL.revokeObjectURL(img.src);
                }
            };
            
            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * 计算压缩后的图片尺寸
     * @private
     */
    _calculateDimensions(originalWidth, originalHeight, maxDimension) {
        let width = originalWidth;
        let height = originalHeight;
        
        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = (height * maxDimension) / width;
                width = maxDimension;
            } else {
                width = (width * maxDimension) / height;
                height = maxDimension;
            }
        }
        
        return { 
            width: Math.round(width), 
            height: Math.round(height) 
        };
    }

    /**
     * 生成压缩后的文件名
     * @private
     */
    _getCompressedFileName(originalName) {
        const extension = originalName.split('.').pop();
        const baseName = originalName.replace(`.${extension}`, '');
        return `${baseName}_compressed.jpg`;
    }

    /**
     * 获取压缩信息用于UI显示
     * @param {File} originalFile - 原始文件
     * @param {File} compressedFile - 压缩后文件
     * @returns {object} - 压缩信息
     */
    getCompressionInfo(originalFile, compressedFile) {
        const originalSize = (originalFile.size / 1024).toFixed(2);
        const compressedSize = (compressedFile.size / 1024).toFixed(2);
        const compressionRatio = ((1 - compressedFile.size / originalFile.size) * 100).toFixed(1);
        
        return {
            originalSize: `${originalSize}KB`,
            compressedSize: `${compressedSize}KB`,
            compressionRatio: `${compressionRatio}%`,
            isCompressed: compressedFile.size < originalFile.size
        };
    }
}

// 导出单例实例
export const imageCompressor = new ImageCompressor();