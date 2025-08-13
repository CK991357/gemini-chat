import { Logger } from '../utils/logger.js';

/**
 * @class APIHandler
 * @description 所有 API 处理器的基类，提供通用的 fetch 功能和错误处理。
 */
export class APIHandler {
    /**
     * APIHandler 构造函数。
     * @param {string} apiKey - 用于 API 请求的密钥。
     */
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * 设置或更新 API Key。
     * @param {string} apiKey - 新的 API 密钥。
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * 封装的 fetch 方法，用于发送 API 请求。
     * 此方法会自动附加认证头，并处理常见的网络错误。
     * @param {string} endpoint - API 端点路径，例如 '/api/chat/completions'。
     * @param {object} options - fetch 请求的标准选项对象 (例如 method, body, headers)。
     * @returns {Promise<Response>} - 返回原始的 Response 对象，以便调用者可以根据需要处理（例如，读取JSON或流）。
     * @throws {Error} 如果 API Key 未设置或请求失败，则抛出错误。
     * @protected
     */
    async _fetch(endpoint, options = {}) {
        if (!this.apiKey) {
            const errorMessage = 'API Key is not set.';
            Logger.error(errorMessage);
            throw new Error(errorMessage);
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        };

        Logger.info(`Sending API request to ${endpoint}`, { body: config.body });
        const response = await fetch(endpoint, config);

        if (!response.ok) {
            // 尝试解析JSON错误体，如果失败则提供通用错误信息
            const errorData = await response.json().catch(() => ({ 
                error: { message: `Request failed with status ${response.status} and invalid JSON response.` } 
            }));
            const errorMessage = `API Error: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`;
            Logger.error(errorMessage, errorData);
            throw new Error(errorMessage);
        }

        return response;
    }
}