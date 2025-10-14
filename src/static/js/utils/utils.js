/**
 * @fileoverview Utility functions for the application.
 */

/**
 * Converts a Blob to a JSON object.
 *
 * @param {Blob} blob - The Blob to convert.
 * @returns {Promise<Object>} A promise that resolves with the JSON object.
 * @throws {string} Throws an error if the Blob cannot be parsed to JSON.
 */
export function blobToJSON(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result) {
                const json = JSON.parse(reader.result);
                resolve(json);
            } else {
                reject('Failed to parse blob to JSON');
            }
        };
        reader.readAsText(blob);
    });
}

/**
 * Converts a base64 string to an ArrayBuffer.
 *
 * @param {string} base64 - The base64 string to convert.
 * @returns {ArrayBuffer} The ArrayBuffer.
 */
export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
} 
/**
 * 根据Base64数据、文件名和MIME类型触发浏览器下载。
 * @param {string} base64Data - Base64编码的文件内容。
 * @param {string} filename - 下载时显示的文件名。
 * @param {string} mimeType - 文件的MIME类型。
 */
export function downloadFromBase64(base64Data, filename, mimeType) {
    // 将Base64转换为二进制
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // 创建一个隐藏的下载链接并点击它
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}