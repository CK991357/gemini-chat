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
        let currentParts = []; // 用于累积当前角色的 parts

        // 预处理 chatHistory，将 systemPrompt 和 attachments 整合进去
        const processedChatHistory = [];

        // 1. 添加系统提示词作为第一个用户消息的文本部分
        if (systemPrompt) {
            processedChatHistory.push({
                role: 'user',
                content: systemPrompt
            });
        }

        // 2. 添加原始聊天历史
        processedChatHistory.push(...chatHistory);

        // 3. 添加附件作为最后一个用户消息的 inlineData 部分
        if (attachments && attachments.length > 0) {
            // 找到最后一个用户消息，或者创建一个新的用户消息
            let lastUserMessage = processedChatHistory.findLast(msg => msg.role === 'user');
            if (!lastUserMessage) {
                lastUserMessage = { role: 'user', content: '' };
                processedChatHistory.push(lastUserMessage);
            }

            // 确保 content 是字符串，以便后续处理
            if (typeof lastUserMessage.content !== 'string') {
                lastUserMessage.content = '';
            }

            attachments.forEach(attachment => {
                if (attachment.type === 'image' && attachment.data) {
                    // 将图像数据添加到最后一个用户消息的 content 中，以便统一处理
                    // 这里我们暂时将图像信息作为特殊标记添加到 content 字符串中，
                    // 稍后在构建 messages 数组时再转换为 inlineData
                    lastUserMessage.content += ` [IMAGE_ATTACHMENT_PLACEHOLDER:${attachment.mimeType}:${attachment.data}]`;
                }
            });
        }


        processedChatHistory.forEach(msg => {
            if (msg.role === 'user') {
                // 如果是用户消息，累积其 parts
                if (currentParts.length > 0 && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                    // 如果前一条是 assistant 消息，且当前有累积的 userParts，则先将累积的 userParts 推入
                    messages.push({
                        role: 'user',
                        parts: currentParts
                    });
                    currentParts = []; // 重置
                }

                if (msg.content) {
                    // 检查是否有图像占位符
                    const imagePlaceholderRegex = / \[IMAGE_ATTACHMENT_PLACEHOLDER:(.*?):(.*?)]/g;
                    let lastIndex = 0;
                    let match;

                    while ((match = imagePlaceholderRegex.exec(msg.content)) !== null) {
                        const textBefore = msg.content.substring(lastIndex, match.index).trim();
                        if (textBefore) {
                            currentParts.push({ type: 'text', text: textBefore });
                        }
                        currentParts.push({
                            inlineData: {
                                mimeType: match,
                                data: match
                            },
                            type: 'image_data'
                        });
                        lastIndex = imagePlaceholderRegex.lastIndex;
                    }
                    const remainingText = msg.content.substring(lastIndex).trim();
                    if (remainingText) {
                        currentParts.push({ type: 'text', text: remainingText });
                    }
                } else if (msg.parts) {
                    // 如果消息本身已经有 parts 字段（例如工具调用后的用户消息）
                    currentParts.push(...msg.parts);
                }

            } else if (msg.role === 'assistant' || msg.role === 'tool') {
                // 如果是 assistant 或 tool 消息，先将累积的 userParts 推入（如果存在）
                if (currentParts.length > 0) {
                    messages.push({
                        role: 'user',
                        parts: currentParts
                    });
                    currentParts = []; // 重置
                }

                // 然后添加 assistant 或 tool 消息
                if (msg.content) {
                    messages.push({
                        role: msg.role,
                        parts: [{ type: 'text', text: msg.content }]
                    });
                } else if (msg.parts) {
                    messages.push({
                        role: msg.role,
                        parts: msg.parts
                    });
                }
            }
        });

        // 处理循环结束后可能剩余的 userParts
        if (currentParts.length > 0) {
            messages.push({
                role: 'user',
                parts: currentParts
            });
        }

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