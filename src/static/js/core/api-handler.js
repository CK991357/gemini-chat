import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Provides a centralized handler for making HTTP API requests.
 * This class encapsulates fetch logic, including streaming and non-streaming JSON requests,
 * error handling, and authorization headers.
 */
export class HttpApiHandler {
    /**
     * 构造函数
     * @param {object} options - 配置选项.
     * @param {() => string} options.getApiKey - 一个函数，用于获取当前的API Key.
     */
    constructor({ getApiKey }) {
        this.getApiKey = getApiKey;
    }

    /**
     * 发起一个 HTTP 流式请求.
     * @param {string} url - 请求的 URL.
     * @param {object} body - 请求体 (会被序列化为 JSON).
     * @returns {Promise<ReadableStreamDefaultReader<Uint8Array>>} - 返回一个 Promise，解析为 ReadableStream 的 reader.
     * @throws {Error} 如果网络请求失败或服务器返回非成功状态码.
     */
    async fetchStream(url, body) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('API Key is not available.');
        }

        Logger.info(`[HttpApiHandler] Sending stream request to ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown server error' } }));
            Logger.error(`[HttpApiHandler] HTTP API request failed: ${response.status}`, errorData);
            throw new Error(`HTTP API request failed: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        return response.body.getReader();
    }

    /**
     * 发起一个标准的非流式 JSON 请求.
     * @param {string} url - 请求的 URL.
     * @param {object} body - 请求体 (会被序列化为 JSON).
     * @returns {Promise<object>} - 返回一个 Promise，解析为服务器返回的 JSON 对象.
     * @throws {Error} 如果网络请求失败或服务器返回非成功状态码.
     */
    async fetchJson(url, body) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('API Key is not available.');
        }

        Logger.info(`[HttpApiHandler] Sending JSON request to ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: 'Unknown server error' } }));
            Logger.error(`[HttpApiHandler] HTTP API request failed: ${response.status}`, errorData);
            throw new Error(`HTTP API request failed: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        return response.json();
    }
}