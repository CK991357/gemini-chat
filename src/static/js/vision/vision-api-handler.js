// src/static/js/vision/vision-api-handler.js
// 专门负责根据不同的 Vision 模型类型（Gemini 或 GLM）来构建正确的 API 请求体。

import { CONFIG } from '../config/config.js';
import { Logger } from '../utils/logger.js';

/**
 * @class VisionApiHandler
 * @description Handles the construction of API request bodies for different Vision models.
 */
export class VisionApiHandler {
    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Builds the request body for a Gemini Vision API call.
     * @param {object} params - Parameters for the Gemini Vision request.
     * @param {Array<object>} params.chatHistory - The current chat history.
     * @param {string} params.modelName - The name of the Gemini Vision model.
     * @param {string} params.systemPrompt - The system prompt for the model.
     * @param {Array<object>} params.attachments - Array of attachment objects (e.g., images).
     * @returns {object} The formatted request body for Gemini Vision.
     */
    buildGeminiVisionRequestBody({ chatHistory, modelName, systemPrompt, attachments }) {
        Logger.info('构建 Gemini Vision 请求体...');

        const messages = [];

        // 添加系统提示词
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        // 添加历史消息
        chatHistory.forEach(msg => {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        });

        // 添加附件（图像）
        attachments.forEach(attachment => {
            if (attachment.type === 'image' && attachment.data) {
                messages.push({
                    role: 'user', // 图像通常作为用户消息的一部分
                    parts: [
                        {
                            inlineData: {
                                mimeType: attachment.mimeType,
                                data: attachment.data // Base64 编码的图像数据
                            }
                        }
                    ]
                });
            }
        });

        return {
            model: modelName,
            messages: messages,
            stream: true,
            // Gemini Vision API 可能需要其他特定参数，例如 generationConfig, safetySettings
            // 这些可以从 CONFIG 中获取或作为参数传入
            generationConfig: CONFIG.API.GEMINI_VISION_GENERATION_CONFIG || {},
            safetySettings: CONFIG.API.GEMINI_VISION_SAFETY_SETTINGS || []
        };
    }

    /**
     * Builds the request body for a GLM Vision API call.
     * @param {object} params - Parameters for the GLM Vision request.
     * @param {Array<object>} params.chatHistory - The current chat history.
     * @param {string} params.modelName - The name of the GLM Vision model.
     * @param {string} params.systemPrompt - The system prompt for the model.
     * @param {Array<object>} params.attachments - Array of attachment objects (e.g., images).
     * @returns {object} The formatted request body for the generic Vision model.
     */
    buildGenericVisionRequestBody({ chatHistory, modelName, systemPrompt, attachments }) {
        Logger.info(`构建通用 Vision 请求体 for model: ${modelName}...`);

        const messages = [];

        // 添加系统提示词
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        // 添加历史消息
        chatHistory.forEach(msg => {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        });

        // 添加附件（图像）
        attachments.forEach(attachment => {
            if (attachment.type === 'image' && attachment.data) {
                // 通用处理：将图像作为用户消息的一部分，使用 image_url 格式
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: '请分析以下图片：' }, // 图像前的描述
                        { type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } }
                    ]
                });
            }
        });

        return {
            model: modelName,
            messages: messages,
            stream: true,
            // 其他通用 Vision API 参数
        };
    }
}