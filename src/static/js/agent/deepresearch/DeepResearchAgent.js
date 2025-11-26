// src/static/js/agent/deepresearch/DeepResearchAgent.js - 修复版本

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';
// 🎯 核心修改：从 ReportTemplates.js 导入工具函数
import { getTemplateByResearchMode, getTemplatePromptFragment } from './ReportTemplates.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        
        // 🎯 图像生成追踪
        this.generatedImages = new Map(); // 用于存储 base64 数据
        this.imageCounter = 0;
        this.runId = null; // 用于隔离不同研究任务的图片
        
        // ✅ 接收来自 Orchestrator 的 skillManager 实例
        this.skillManager = config.skillManager;
        
        // 🎯 新增：智能数据总线
        this.dataBus = new Map(); // step_index -> {rawData, metadata, contentType}
        this.dataRetentionPolicy = {
            maxRawDataSize: 50000, // 最大原始数据大小
            retentionSteps: 3      // 保留最近3步的数据
        };

        // 🎯 联邦知识系统
        this.knowledgeSystem = {
            enabled: config.knowledgeRetrievalEnabled !== false,
            skillManager: config.skillManager,
            knowledgeCache: new Map(), // tool_name -> {content, timestamp}
            retrievalHistory: [] // 追踪知识使用情况
        };

        this.agentLogic = new AgentLogic(chatApiHandler);
        this.outputParser = new AgentOutputParser();

        // ✨ 性能追踪
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };

        // 🎯 新增：将 intermediateSteps 提升为类属性以支持状态注入
        this.intermediateSteps = [];

        console.log(`[DeepResearchAgent] 初始化完成，可用研究工具: ${Object.keys(tools).join(', ')}`);
    }

// 🎯 智能模型选择系统 - 核心方法组

/**
 * 获取不同任务的模型偏好配置
 */
_getModelPreferenceForTask(taskType) {
    const preferences = {
        'final_report_generation': {
            models: [
                { 
                    name: 'models/gemini-2.5-pro', 
                    label: 'Pro', 
                    priority: 1, 
                    fallbackOnError: true,
                    description: '高质量报告生成'
                },
                { 
                    name: 'gemini-2.5-flash-preview-09-2025', 
                    label: 'Flash', 
                    priority: 2, 
                    fallbackOnError: false,
                    description: '快速报告生成'
                }
            ],
            temperature: 0.3,
            maxRetries: 2
        },
        'outline_generation': {
            models: [
                { 
                    name: 'models/gemini-2.5-pro', 
                    label: 'Pro', 
                    priority: 1, 
                    fallbackOnError: true,
                    description: '深度大纲设计'
                },
                { 
                    name: 'gemini-2.5-flash-preview-09-2025', 
                    label: 'Flash', 
                    priority: 2, 
                    fallbackOnError: false,
                    description: '基础大纲设计'
                }
            ],
            temperature: 0.1,  // 更低的温度确保结构严谨
            maxRetries: 1
        },
        'planning': {
            models: [
                { 
                    name: 'gemini-2.5-flash-preview-09-2025', 
                    label: 'Flash', 
                    priority: 1, 
                    fallbackOnError: false,
                    description: '研究规划'
                }
            ],
            temperature: 0.1,
            maxRetries: 0
        },
        'thinking': {
            models: [
                { 
                    name: 'gemini-2.5-flash-preview-09-2025', 
                    label: 'Flash', 
                    priority: 1, 
                    fallbackOnError: false,
                    description: 'Agent思考'
                }
            ],
            temperature: 0.0,
            maxRetries: 0
        },
        'summarization': {
            models: [
                { 
                    name: 'gemini-2.0-flash-exp-summarizer', 
                    label: 'Flash-Summarizer', 
                    priority: 1, 
                    fallbackOnError: false,
                    description: '内容摘要'
                }
            ],
            temperature: 0.0,
            maxRetries: 0
        }
    };
    
    return preferences[taskType] || preferences['thinking'];
}

/**
 * 🚀 智能模型选择器 - Pro优先，带优雅降级
 */
async _completeChatWithModelFallback(messages, taskType = 'thinking', customTemperature = null) {
    const preference = this._getModelPreferenceForTask(taskType);
    const models = preference.models;
    const temperature = customTemperature !== null ? customTemperature : preference.temperature;
    const maxRetries = preference.maxRetries || 0;

    let lastError = null;
    let usedModel = null;
    let finalResponse = null;
    const _retryCount = 0;

    console.log(`[DeepResearchAgent] 🚀 开始${taskType}，模型策略: ${models.map(m => m.label).join(' → ')}`);

    // 按优先级排序模型
    const sortedModels = models.sort((a, b) => a.priority - b.priority);

    modelLoop: for (const model of sortedModels) {
        usedModel = model;
        
        // 为当前模型尝试重试
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const isRetry = attempt > 0;
            
            if (isRetry) {
                console.log(`[DeepResearchAgent] 🔄 ${taskType} 重试尝试 ${attempt}/${maxRetries} (${model.label})`);
                // 重试时增加等待时间
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.log(`[DeepResearchAgent] 尝试使用 ${model.label} 模型进行${taskType}`);
            }

            try {
                const startTime = Date.now();
                
                finalResponse = await this.chatApiHandler.completeChat({
                    messages: messages,
                    model: model.name,
                    temperature: temperature,
                });

                const executionTime = Date.now() - startTime;
                console.log(`[DeepResearchAgent] ✅ ${model.label} 模型${taskType}成功`, {
                    executionTime: `${executionTime}ms`,
                    model: model.name,
                    taskType,
                    attempt: isRetry ? attempt : '首次'
                });

                break modelLoop; // 成功则跳出所有循环

            } catch (error) {
                lastError = error;
                console.warn(`[DeepResearchAgent] 🟡 ${model.label} 模型${taskType}失败:`, {
                    model: model.name,
                    error: error.message,
                    taskType,
                    attempt: isRetry ? attempt : '首次'
                });

                // 🎯 智能错误分类与决策
                const shouldFallback = this._shouldFallbackToNextModel(error, model);
                
                if (!shouldFallback) {
                    console.log(`[DeepResearchAgent] 🔴 遇到不可回退错误，终止模型降级`);
                    throw error;
                }

                // 如果是最后一次重试尝试，检查是否要切换到下一个模型
                if (attempt >= maxRetries) {
                    // 检查是否还有备用模型
                    const currentIndex = sortedModels.indexOf(model);
                    if (currentIndex < sortedModels.length - 1 && model.fallbackOnError) {
                        console.log(`[DeepResearchAgent] 🔄 从 ${model.label} 降级到 ${sortedModels[currentIndex + 1].label}`);
                        continue modelLoop; // 继续下一个模型
                    } else {
                        // 没有更多模型或不允许fallback
                        console.log(`[DeepResearchAgent] 🔴 ${taskType} 所有模型和重试均失败`);
                        throw error;
                    }
                }
                
                // 否则继续重试当前模型
                console.log(`[DeepResearchAgent] 🔄 将在 ${attempt + 1} 秒后重试 ${model.label} 模型`);
            }
        }
    }

    if (!finalResponse) {
        console.error('[DeepResearchAgent] 🔴 所有模型均失败，抛出最后错误');
        throw lastError || new Error(`${taskType} 所有模型调用均失败`);
    }

    // 🎯 记录模型使用情况
    this._recordModelUsage(usedModel, finalResponse, taskType);
    
    return {
        response: finalResponse,
        modelUsed: usedModel
    };
}

/**
 * 🎯 错误分类与降级决策
 */
_shouldFallbackToNextModel(error, _currentModel) {
    const errorMessage = error.message?.toLowerCase() || '';
    
    // ✅ 可降级错误类型
    const fallbackErrors = [
        'rate limit',
        '429',
        'model not found',
        'model unavailable',
        'quota exceeded',
        'billing required',
        'overloaded',
        'temporarily unavailable',
        'timeout',
        'internal server error',
        'service unavailable'
    ];
    
    // ❌ 不可降级错误类型
    const criticalErrors = [
        'invalid argument',
        'permission denied',
        'authentication',
        'invalid api key',
        'bad request',
        'content policy violation'
    ];
    
    // 检查是否为可降级错误
    const isFallbackError = fallbackErrors.some(keyword => 
        errorMessage.includes(keyword)
    );
    
    const isCriticalError = criticalErrors.some(keyword =>
        errorMessage.includes(keyword)
    );
    
    if (isCriticalError) {
        console.warn(`[DeepResearchAgent] 🚫 遇到关键错误，禁止降级:`, errorMessage);
        return false;
    }
    
    return isFallbackError;
}

/**
 * 📊 记录模型使用情况
 */
_recordModelUsage(modelUsed, response, context) {
    const usage = response?.usage;
    if (!usage) {
        console.warn(`[DeepResearchAgent] 📊 模型 ${modelUsed.name} 调用成功但无使用量数据`);
        return;
    }
    
    console.log(`[DeepResearchAgent] 📊 记录模型使用情况:`, {
        model: modelUsed.name,
        model_label: modelUsed.label,
        context: context,
        tokens: usage.total_tokens,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens
    });
    
    // 🎯 累加 Token 到总统计
    this._updateTokenUsage(usage);
    
    // 🎯 发送模型使用事件（用于监控面板）
    if (this.callbackManager) {
        this.callbackManager.invokeEvent('on_model_used', {
            run_id: this.runId,
            data: {
                model: modelUsed.name,
                model_label: modelUsed.label,
                context: context,
                tokens: usage.total_tokens,
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                description: modelUsed.description
            }
        });
    }
}
    // 🎯 新增：Token 追踪方法
    _updateTokenUsage(usage) {
        if (!usage) return;
        
        this.metrics.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        this.metrics.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        this.metrics.tokenUsage.total_tokens += usage.total_tokens || 0;
        
        console.log(`[DeepResearchAgent] Token 使用更新:`, this.metrics.tokenUsage);
    }

    // 🔥🔥🔥 [新增方法] 智能上下文序列化器 🔥🔥🔥
    /**
     * 将 chatHistory 对象数组转换为 Planner 易于理解的纯文本脚本。
     * 关键点：过滤 Base64 图片以节省 Token，但保留"用户发了图"的语义。
     */
    _serializeContextMessages(messages) {
        if (!messages || messages.length === 0) return '';

        // 取最近 6 条（排除当前触发消息）以保证上下文充足并节省 token
        const recentMessages = messages.slice(0, -1).slice(-6);
        if (recentMessages.length === 0) return '';

        const contextBuffer = [];
        contextBuffer.push("--- 对话历史开始 ---");

        recentMessages.forEach((msg) => {
            const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
            let textContent = '';

            if (Array.isArray(msg.content)) {
                msg.content.forEach(part => {
                    if (part.type === 'text') {
                        textContent += part.text;
                    } else if (part.type === 'image_url' || part.type === 'image_base64') {
                        // 用占位符替代图片内容，保留语义
                        textContent += `[🖼️ Image Uploaded by User] `;
                    } else if (part.type === 'file_url' || part.type === 'file') {
                        textContent += `[📁 File Uploaded: ${part.name || 'document'}] `;
                    }
                });
            } else if (typeof msg.content === 'string') {
                textContent = msg.content;
            }

            // 防止单条历史消息过长
            if (textContent.length > 500) {
                textContent = textContent.substring(0, 500) + "...(content truncated)";
            }

            contextBuffer.push(`${roleLabel}: ${textContent}`);
        });

        contextBuffer.push("--- 对话历史结束 ---");
        return contextBuffer.join('\n');
    }

    // 🎯 新增：图像生成结果处理
    _handleGeneratedImage(imageData) {
        this.imageCounter++;
        const imageId = `agent_image_${this.imageCounter}`;
        
        // 1. 存储图像数据
        this.generatedImages.set(imageId, imageData);

        // 2. 触发一个专门的事件，让UI可以立即显示图片
        this.callbackManager.invokeEvent('on_image_generated', {
            run_id: this.runId, // 假设 runId 在 conductResearch 开始时设置
            data: {
                imageId: imageId,
                title: imageData.title,
                base64: imageData.image_base64
            }
        });

        // 3. 返回一个给Agent看的简洁确认信息
        return `[✅ 图像生成成功] 标题: "${imageData.title}". 在最终报告中，你可以使用占位符 ![${imageData.title}](placeholder:${imageId}) 来引用这张图片。`;
    }


    // 🎯 新增：报告大纲生成方法
    /**
     * @description 使用主模型，基于研究过程中的关键发现，生成一份高质量的报告大纲。
     * @param {string} topic - 核心研究主题
     * @param {string[]} keyFindings - 从各步骤中提炼出的关键发现列表
     * @param {string} researchMode - 当前的研究模式 (e.g., 'academic', 'business')
     * @returns {Promise<string>} - 返回Markdown格式的详细报告大纲
     */
    async _generateReportOutline(topic, keyFindings, researchMode) {
        console.log(`[DeepResearchAgent] 开始为模式 "${researchMode}" 生成报告大纲...`);

        // 动态调整大纲侧重点的指令
        const modeSpecificInstructions = {
            academic: "大纲应侧重于：文献综述、研究方法、核心论证、结论与未来展望。结构必须严谨。",
            business: "大纲应侧重于：市场背景、竞争格局、核心发现、商业影响、战略建议。必须有明确的商业洞察。",
            technical: "大纲应侧重于：问题定义、技术架构、实现细节、性能评估、最佳实践。必须包含技术深度。",
            deep: "大纲需要体现多维度、辩证的分析，包含问题解构、多角度论证、解决方案评估和创新性见解。",
            standard: "大纲应结构清晰，覆盖主题的核心方面，逻辑连贯，易于理解。"
        };

        const prompt = `
# 角色：你是一位顶级的报告架构师和内容策略师。

# 任务
你的任务是基于一个研究项目已经收集到的"关键信息发现"，为一份专业的最终报告设计一份逻辑严谨、结构完整、深度十足的报告大纲。

## 核心研究主题
${topic}

## 关键信息发现 (Key Findings)
${keyFindings.map((finding, _index) => `- ${finding}`).join('\n')}

## 大纲设计要求
1.  **逻辑性**: 大纲的章节顺序必须构成一个流畅且有说服力的叙事逻辑。
2.  **完整性**: 必须覆盖所有"关键信息发现"，并将它们合理地分配到各个章节。
3.  **深度**: 大纲不应只是简单地罗列要点，而应体现出分析的层次感。在每个章节下，用2-3个子要点来阐述该部分将要探讨的核心内容。
4.  **模式适配**: ${modeSpecificInstructions[researchMode] || modeSpecificInstructions.standard}
5.  **输出格式**: 必须严格使用Markdown格式，包含主标题、二级标题（##）和三级标题（###）。

## 示例输出格式
\`\`\`markdown
# [报告主标题]

## 1. 引言与背景
### 1.1 研究背景与问题定义
### 1.2 核心概念解析

## 2. 核心分析与发现
### 2.1 [关键发现A的深入分析]
### 2.2 [关键发现B与C的对比]

## 3. [根据模式调整的章节，如：商业影响或方法论]
### 3.1 ...

## 4. 结论与建议
### 4.1 核心结论总结
### 4.2 未来展望与建议
\`\`\`

现在，请生成这份高质量的Markdown报告大纲：`;

        try {
            const outlineResult = await this._completeChatWithModelFallback(
                [{ role: 'user', content: prompt }],
                'outline_generation',
                0.1
            );
            const response = outlineResult.response;
            const outline = response?.choices?.[0]?.message?.content || '### 错误：未能生成大纲';
            console.log(`[DeepResearchAgent] ✅ 报告大纲生成成功。`);
            return outline;
        } catch (error) {
            console.error('[DeepResearchAgent] ❌ 报告大纲生成失败:', error);
            // 降级方案：返回一个基于关键发现的简单列表
            return `# 报告大纲 (降级)\n\n## 核心发现\n${keyFindings.map(f => `- ${f}`).join('\n')}`;
        }
    }

    // 🎯 新增：关键发现生成方法
    /**
     * @description 从观察结果中提取最核心、最有价值的关键发现
     * @param {string} observation - 工具调用后的观察结果
     * @returns {Promise<string>} - 返回一句话的关键发现摘要
     */
    async _generateKeyFinding(observation) {
        try {
            const prompt = `从以下文本中，用一句话总结最核心、最有价值的信息发现。总结必须简明扼要。\n\n文本：\n${observation.substring(0, 2000)}`;
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.0-flash-exp-summarizer', // 使用快速模型
                temperature: 0.0,
            });
            return response?.choices?.[0]?.message?.content || '未能提取关键发现。';
        } catch (error) {
            console.warn('[DeepResearchAgent] 关键发现生成失败:', error);
            return '关键发现提取异常。';
        }
    }

    // ✅ 新增：在 DeepResearchAgent 类中添加 _handleKnowledgeRetrieval 方法
    async _handleKnowledgeRetrieval(parsedAction, intermediateSteps, _runId) {
        const { parameters, thought } = parsedAction;
        const { tool_name: targetTool, context } = parameters;
        
        console.log(`[DeepResearchAgent] 🧠 联邦知识检索请求: ${targetTool}`);
        let observation;
        let success = false;

        try {
            // 调用 EnhancedSkillManager 的核心方法
            const knowledgePackage = await this.skillManager.retrieveFederatedKnowledge(targetTool, { userQuery: context });

            if (knowledgePackage && knowledgePackage.content) {
                observation = knowledgePackage.content; // 直接使用完整的文档内容
                success = true;
                console.log(`[DeepResearchAgent] ✅ 联邦知识检索成功: ${targetTool}`);
            } else {
                observation = `## ❌ 知识检索失败\n\n无法找到工具 \`${targetTool}\` 的联邦知识文档。`;
            }
        } catch (error) {
            console.error(`[DeepResearchAgent] ❌ 联邦知识检索错误: ${targetTool}`, error);
            observation = `## ❌ 知识检索系统错误\n\n检索工具 \`${targetTool}\` 知识时发生错误: ${error.message}`;
        }

        intermediateSteps.push({
            action: {
                type: 'knowledge_retrieval',
                tool_name: 'retrieve_knowledge',
                parameters,
                thought
            },
            observation: observation,
            key_finding: `已加载 ${targetTool} 的操作指南`,
            success: success
        });
    }

    /**
     * 🎯 实际执行工具调用并处理结果
     * @param {string} toolName
     * @param {object} parameters
     * @param {string} detectedMode
     * @param {function} recordToolCall
     * @returns {Promise<{rawObservation: string, toolSources: Array, toolSuccess: boolean}>}
     */
    /**
     * 增强的工具执行方法
     */
// 🚀🚀🚀 [v2.2 核心升级] 具备完整智能分发中心的工具执行方法 🚀🚀🚀
    async _executeToolCall(toolName, parameters, detectedMode, recordToolCall) {

        // ============================================================
        // 🔥🔥🔥 虚拟专家接管系统 (优先级最高) 🔥🔥🔥
        // 必须在检查 this.tools 之前执行，因为它是不存在于 this.tools 中的虚拟工具
        // ============================================================
        if (toolName === 'code_generator') {
            console.log('[DeepResearchAgent] 👔 启动代码专家委托流程...');
            const { objective, data_context } = parameters;

            // 🟢 步骤 A: 从联邦知识库获取 python_sandbox 的完整技能包
            // 这会自动包含 SKILL.md 主内容以及 matplotlib_cookbook 等引用文件
            let knowledgeContext = "";
            if (this.skillManager) {
                console.log('[DeepResearchAgent] 正在从 SkillManager 获取专家知识...');
                // 尝试获取针对 "数据可视化" 上下文的知识
                const knowledgePackage = await this.skillManager.retrieveFederatedKnowledge(
                    'python_sandbox',
                    { userQuery: objective }
                );
                
                if (knowledgePackage && knowledgePackage.content) {
                    console.log('[DeepResearchAgent] 📚 已成功加载专家知识库');
                    knowledgeContext = knowledgePackage.content;
                }
            } else {
                console.warn('[DeepResearchAgent] ⚠️ SkillManager 未注入，专家模型将仅依赖通用知识。');
            }

            // 🟢 步骤 B: 构建专家 Prompt (融合知识库)
            const specialistPrompt = `
# 角色：高级 Python 数据专家

# 任务目标
${objective}

# 数据上下文 (必须严格遵守)
${JSON.stringify(data_context)}

# 📚 你的核心技能与规范 (Knowledge Base)
${knowledgeContext ? knowledgeContext : "未加载知识库，请遵循通用 Python 规范。"}

# ⚡ 补充强制执行协议 (Override Rules)
1. **数据硬编码**: 必须将【数据上下文】中的数据完整写入代码变量，**严禁空赋值**。
2. **中文支持 (关键)**:
   - 本环境**不包含** SimHei 或 Microsoft YaHei。
   - **必须**显式设置字体为文泉驿微米黑：
     \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']\`
   - 设置负号支持：\`plt.rcParams['axes.unicode_minus'] = False\`
3. **输出纯净**: 只输出 Python 代码，不要 Markdown 标记。
4. **必须调用 \`plt.show()\`**: 这是触发图像输出的唯一方式。
`;

            try {
                // 🟢 步骤 C: 呼叫专家模型 (独立上下文)
                // 这里就是您说的“同模型但不同窗口”
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: specialistPrompt }],
                    model: 'gemini-2.5-flash-preview-09-2025', 
                    temperature: 0.1 // 低温确保代码精准
                }, null);

                let generatedCode = response.choices[0].message.content;
                
                // 🔥 增强清理：只提取代码块（如果有的话），或者清理常见标记
                const codeBlockMatch = generatedCode.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
                if (codeBlockMatch) {
                    generatedCode = codeBlockMatch[1];
                } else {
                    // 如果没有代码块，尝试清理可能的前缀/后缀
                    generatedCode = generatedCode.replace(/```/g, '').trim();
                }

                console.log('[DeepResearchAgent] 👨‍💻 专家代码生成完毕，长度:', generatedCode.length);
                
                // 🟢 步骤 D: 自动转发给沙盒执行 (Auto-Forwarding)
                console.log('[DeepResearchAgent] 🔄 自动转接沙盒执行...');
                
                // 递归调用，真正执行 python_sandbox
                const sandboxResult = await this._executeToolCall(
                    'python_sandbox', 
                    { code: generatedCode }, 
                    detectedMode, 
                    recordToolCall
                );
                
                // 🟢 步骤 E: 包装结果反馈给经理
                let finalObservation;
                
                if (sandboxResult.toolSuccess) {
                    // 检查是否已经触发了图片/文件处理逻辑（即 rawObservation 已被替换为成功消息）
                    if (sandboxResult.rawObservation.includes('[✅ 图像生成成功]') || sandboxResult.rawObservation.includes('[✅ 文件生成成功]')) {
                        // 🔥 优化版：区分“重复操作”和“新任务”
                        finalObservation = `✅ **专家任务完美执行**\n\n${sandboxResult.rawObservation}\n\n**系统提示**：\n1. **当前**绘图/文件生成任务已圆满完成。\n2. 请勿**重复**执行完全相同的指令。\n3. **关键**：如果研究计划中还有**其他不同**的图表或数据需要处理，请**继续调用** code_generator；如果所有任务均已完成，请进入报告撰写阶段。`;
                    } else {
                        // 如果是成功但不是图片/文件（例如，纯文本输出或未被处理的JSON），则使用简洁的成功占位符
                        // 避免将原始JSON或大量纯文本抛给Manager
                        finalObservation = `✅ **专家任务执行成功**\n\n输出: [已成功执行代码，但未生成图片或文件。请根据代码逻辑判断是否有关键数据输出。]`;
                    }
                } else {
                    // 失败情况保持不变
                    finalObservation = `❌ **专家代码执行出错**\n\n错误信息: ${sandboxResult.rawObservation}`;
                }

                // 标记 code_generator 调用成功
                recordToolCall(toolName, parameters, true, "专家任务已完成");

                return {
                    rawObservation: finalObservation,
                    toolSources: sandboxResult.toolSources,
                    toolSuccess: sandboxResult.toolSuccess
                };

            } catch (error) {
                // ... 错误处理
                console.error('[DeepResearchAgent] ❌ 专家系统故障:', error);
                recordToolCall(toolName, parameters, false, `专家系统故障: ${error.message}`);
                return { rawObservation: `专家系统故障: ${error.message}`, toolSources: [], toolSuccess: false };
            }
        }

        const tool = this.tools[toolName];
        let rawObservation;
        let toolSources = [];
        let toolSuccess = false;

        if (!tool) {
            rawObservation = `错误: 工具 "${toolName}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
            console.error(`[DeepResearchAgent] ❌ 工具不存在: ${toolName}`);
            recordToolCall(toolName, parameters, false, rawObservation);
            return { rawObservation, toolSources, toolSuccess: false };
        }

        try {
            console.log(`[DeepResearchAgent] 调用工具: ${toolName}...`, parameters);

            // ============================================================
            // 🔥🔥🔥 核心修复：Python 代码客户端强制预检 (v2.7 - 无污染版) 🔥🔥🔥
            // ============================================================
            if (toolName === 'python_sandbox' && parameters.code) {
                const code = parameters.code;
                
                // 1. 检查空赋值 (最关键的检查)
                const emptyAssignmentRegex = /^\s*[a-zA-Z_]\w*\s*=\s*(?:\s*(?:#.*)?$)/m;
                const emptyMatches = code.match(emptyAssignmentRegex);
                
                if (emptyMatches) {
                    console.warn('[DeepResearchAgent] 🛑 拦截到空赋值，正在呼叫急诊室...');
                    
                    // 🔥 尝试自动修复 (Micro-Loop)
                    // 传入具体的错误描述
                    const fixedCode = await this._repairCodeWithLLM(code, "变量声明未赋值 (Empty Assignment)");
                    
                    if (fixedCode) {
                        console.log('[DeepResearchAgent] 🔄 使用急诊修复后的代码继续执行...');
                        
                        // 记录一个隐形的思考事件，方便调试但不打扰用户
                        // this.callbackManager.invokeEvent('on_agent_think_start', {
                        //    run_id: this.runId,
                        //    data: { system_msg: "系统自动修复了代码中的数据缺失..." }
                        // });

                        // 递归调用自己，使用修复后的代码，无缝继续流程
                        return await this._executeToolCall(
                            toolName,
                            { ...parameters, code: fixedCode },
                            detectedMode,
                            recordToolCall
                        );
                    }

                    // 🚑 如果急诊修复失败，才执行原来的报错返回逻辑
                    const errorMsg = `❌ **代码预检失败 (Preflight Check Failed)**\n\n` +
                        `**检测到空赋值**: \`${emptyMatches.trim()}\`\n` +
                        `**错误原因**: 变量声明后没有赋值数据\n` +
                        `**强制修正**: 请将用户提供的数据完整硬编码到代码中\n\n` +
                        `**请修改代码后重新提交**:\n` +
                        `**✅ 正确格式示例** (请替换为真实数据):\n` +
                        `\`\`\`python\n` +
                        `years = # 必须填入数据\n` +
                        `values =\n` +
                        `\`\`\``;
                    
                    recordToolCall(toolName, parameters, false, errorMsg);
                    return { rawObservation: errorMsg, toolSources: [], toolSuccess: false };
                }

                // 2. 状态注入逻辑 (保留原有逻辑)
                const stateInjectionPattern = /"\{\{LAST_OBSERVATION\}\}"/g;
                if (stateInjectionPattern.test(code)) {
                    console.log('[DeepResearchAgent] 🐍 检测到 Python 状态注入占位符。');
                    const lastStep = this.intermediateSteps[this.intermediateSteps.length - 1];
                    
                    if (lastStep && typeof lastStep.observation === 'string') {
                        const safelyEscapedData = JSON.stringify(lastStep.observation);
                        const innerData = safelyEscapedData.slice(1, -1);
                        parameters.code = code.replace(stateInjectionPattern, `"${innerData}"`);
                        console.log(`[DeepResearchAgent] ✅ 成功注入 ${lastStep.observation.length} 字符的数据。`);
                    } else {
                        console.warn('[DeepResearchAgent] ⚠️ 找不到上一步的观察结果来注入。');
                        parameters.code = code.replace(stateInjectionPattern, '""');
                    }
                }
            }
            // ============================================================
            // 🔥🔥🔥 预检结束 🔥🔥🔥
            // ============================================================

            // --- 调用工具 ---
            const toolResult = await tool.invoke(parameters, {
                mode: 'deep_research',
                researchMode: detectedMode
            });
            
            rawObservation = toolResult.output || JSON.stringify(toolResult);
            toolSuccess = toolResult.success !== false;

            // ================================================================
            // 🚀 全新的智能分发中心 (模仿 chat-api-handler.js)
            // ================================================================
            if (toolName === 'python_sandbox' && toolSuccess) {
                try {
                    // toolResult.output 是后端返回的 stdout 字符串
                    const outputData = JSON.parse(rawObservation);

                    if (outputData.type === 'image' && outputData.image_base64) {
                        // 🛡️ [优化引入]：增加数据完整性检查
                        if (outputData.image_base64.length > 100) {
                            console.log('[DeepResearchAgent] 🐍 检测到Python沙盒生成的图像，正在处理...');
                            // 调用图像处理方法，并将返回的简洁确认信息作为 Agent 的观察结果
                            rawObservation = this._handleGeneratedImage(outputData);
                        } else {
                            console.warn('[DeepResearchAgent] ⚠️ 收到图片数据但长度不足，跳过渲染。');
                            // 可以选择保留原始 JSON 或替换为错误提示，这里选择不做处理（即视为普通文本），避免中断流程
                        }

                    } else if (['excel', 'word', 'powerpoint', 'ppt', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                        // ... (文件下载逻辑保持不变) ...
                        console.log(`[DeepResearchAgent] 🐍 检测到Python沙盒生成的文件: ${outputData.type}`);
                        rawObservation = `[✅ 文件生成成功] 类型: "${outputData.type}", 标题: "${outputData.title}". 文件已准备就绪。`;
                        this.callbackManager.invokeEvent('on_file_generated', {
                            run_id: this.runId,
                            data: outputData
                        });
                    }
                    // 对于其他JSON类型（如ml_report），保持rawObservation为原始JSON字符串，让Agent自行解析

                } catch (_e) { /* 忽略非 JSON 输出错误 */
                    // 如果输出不是JSON，或者不是我们关心的特殊类型，则忽略，保持 rawObservation 为原始纯文本输出
                    console.log('[DeepResearchAgent] Python输出不是特殊JSON格式，作为纯文本处理。');
                }
            }

            // --- 错误诊断与来源提取 (保持不变) ---
            if (toolName === 'python_sandbox' && !toolSuccess) {
                console.log(`[DeepResearchAgent] Python执行失败，启动自动诊断...`);
                const diagnosis = await this._diagnosePythonError(rawObservation, parameters);
                if (diagnosis.suggestedFix) {
                    rawObservation += `\n\n## 🔧 自动诊断结果\n${diagnosis.analysis}\n\n**建议修复**: ${diagnosis.suggestedFix}`;
                }
            }
            if (toolResult.sources && Array.isArray(toolResult.sources)) {
                toolSources = toolResult.sources.map(source => ({
                    title: source.title || '无标题',
                    url: source.url || '#',
                    description: source.description || '',
                    collectedAt: new Date().toISOString(),
                    used_in_report: false
                }));
            }
            if (toolSuccess) {
                console.log(`[DeepResearchAgent] ✅ 工具执行成功`);
            } else {
                console.warn(`[DeepResearchAgent] ⚠️ 工具执行失败`);
            }
            
        } catch (error) {
            rawObservation = `错误: 工具 "${toolName}" 执行失败: ${error.message}`;
            console.error(`[DeepResearchAgent] ❌ 工具执行失败: ${toolName}`, error);
            toolSuccess = false;
        }

        recordToolCall(toolName, parameters, toolSuccess, rawObservation);
        return { rawObservation, toolSources, toolSuccess };
    }

    /**
     * 🎯 知识感知的工具执行
     */
    async _executeToolWithKnowledge(toolName, parameters, _thought, _intermediateSteps, detectedMode, recordToolCall) {
        // 🎯 检查是否有相关知识缓存
        const cachedKnowledge = this.knowledgeSystem.knowledgeCache.get(toolName);
        if (cachedKnowledge) {
            console.log(`[DeepResearchAgent] 🧠 工具执行带有知识上下文: ${toolName}`);
            // 可以在thought中引用知识指导
        }

        // 正常执行工具调用...
        return await this._executeToolCall(toolName, parameters, detectedMode, recordToolCall);
    }

    async conductResearch(researchRequest) {
        // ✨ 修复：直接从 Orchestrator 接收模式和清理后的主题
        // ✨✨✨ 核心修复：解构出 displayTopic、enrichedTopic 及 contextMessages ✨✨✨
        const { topic: enrichedTopic, displayTopic: cleanTopic, availableTools, researchMode, currentDate, contextMessages } = researchRequest;
        const runId = this.callbackManager.generateRunId();
        this.runId = runId; // 关键：为当前研究会话设置唯一ID
        this.generatedImages.clear(); // 关键：每次新研究开始时清空图片缓存
        
        // 原始 topic (enrichedTopic) 用于 Agent 内部逻辑
        const internalTopic = enrichedTopic.replace(/！\s*$/, '').trim();
        // displayTopic 用于 UI 显示
        const uiTopic = (cleanTopic || enrichedTopic).replace(/！\s*$/, '').trim();

        // ============================================================
        // 🔥🔥🔥 [核心新增] 全局挂载上下文数据 🔥🔥🔥
        // 这行代码至关重要！它让后续的"急诊医生"能看到原始数据
        // 优先使用 cleanTopic (用户原始输入)，因为它通常包含最原始的数据文本
        // ============================================================
        this.currentResearchContext = uiTopic;
        
        const detectedMode = researchMode || 'standard';
        
        // 🎯 存储当前研究模式，供知识检索系统使用
        this.currentResearchMode = detectedMode;

        console.log(`[DeepResearchAgent] 开始研究: "${uiTopic}"，接收到模式: ${detectedMode}`);
        // 🔥🔥🔥 [核心逻辑] 构建带记忆的上下文 Prompt
        const historyContextStr = this._serializeContextMessages(contextMessages);
        // Planner 可见的内部主题（包含历史上下文块）
        let internalTopicWithContext = enrichedTopic;
        if (historyContextStr) {
            internalTopicWithContext = `\n${enrichedTopic}\n\n<ContextMemory>\n以下是你与用户的近期对话历史（Context Memory）。\n请注意：用户当前的请求可能依赖于这些上下文（例如指代词"它"可能指代上文的图片或话题）。\n如果当前请求中包含指代词或缺乏具体主语，请务必从下文中推断：\n\n${historyContextStr}\n</ContextMemory>\n`;
            console.log(`[DeepResearchAgent] ✅ 已注入 ${historyContextStr.length} 字符的历史上下文。`);
        }
        
        // ✨✨✨ 核心修复：在 on_research_start 事件中使用 uiTopic ✨✨✨
        await this.callbackManager.invokeEvent('on_research_start', {
            run_id: runId,
            data: {
                topic: uiTopic, // <--- 使用干净的 topic
                availableTools: availableTools.map(t => t.name),
                researchMode: detectedMode,
                researchData: {
                    keywords: [], // 初始化空数组，后续更新
                    sources: [],
                    analyzedContent: [],
                    toolCalls: [],
                    metrics: this.metrics
                }
            }
        });

        // 🎯 修复：在研究过程中更新统计数据
        const updateResearchStats = (updates) => {
            this.callbackManager.invokeEvent('on_research_stats_updated', {
                run_id: runId,
                data: updates
            });
        };

        // 🎯 修复：记录工具调用
        const recordToolCall = (toolName, parameters, success, result) => {
            this.callbackManager.invokeEvent('on_tool_called', {
                run_id: runId,
                data: { toolName, parameters, success, result }
            });
        };

        // ✨ 阶段1：智能规划
        console.log(`[DeepResearchAgent] 阶段1：生成${detectedMode}研究计划...`);
        let researchPlan;
        try {
            // ✨✨✨ 核心修复：规划时使用完整的 internalTopic (enrichedTopic) ✨✨✨
            const planResult = await this.agentLogic.createInitialPlan(internalTopicWithContext, detectedMode, currentDate);
            researchPlan = planResult;
            this._updateTokenUsage(planResult.usage); // 🎯 新增
            
            // 🎯 优化：传递完整的研究计划对象和文本
            await this.callbackManager.invokeEvent('on_research_plan_generated', {
                run_id: runId,
                data: {
                    plan: researchPlan.research_plan,
                    plan_text: JSON.stringify(researchPlan, null, 2), // 🎯 新增：传递完整计划文本
                    plan_object: researchPlan, // 🎯 新增：传递完整对象
                    keywords: [], // 占位符，将在后续更新
                    estimated_iterations: researchPlan.estimated_iterations,
                    risk_assessment: researchPlan.risk_assessment,
                    research_mode: detectedMode,
                    temporal_awareness: researchPlan.temporal_awareness // 🎯 新增：传递时效性评估
                }
            });

            console.log(`[DeepResearchAgent] ${detectedMode}研究计划生成完成，预计${researchPlan.estimated_iterations}次迭代`);
        } catch (error) {
            console.error('[DeepResearchAgent] 研究计划生成失败，使用降级方案:', error);
            researchPlan = this.agentLogic._createFallbackPlan(internalTopic, detectedMode, currentDate);
        }

        // ✨ 阶段2：自适应执行
        // 🎯 核心修复：将 intermediateSteps 提升为类属性以支持状态注入
        this.intermediateSteps = []; // ✅ 确保每次新研究都清空历史
        let iterations = 0;
        let consecutiveNoGain = 0;
        
        // 🔥 核心修改：在deep模式下，提高终止的难度
        const noGainThreshold = (detectedMode === 'deep') ? 3 : 2;
        
        let allSources = [];
        let finalAnswerFromIteration = null;
        
        const totalSteps = researchPlan.research_plan.length; // 新增：总计划步骤数

        while (iterations < this.maxIterations && consecutiveNoGain < noGainThreshold && !finalAnswerFromIteration) {
            iterations++;
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            const planCompletion = this._calculatePlanCompletion(researchPlan, this.intermediateSteps); // 计算完成度
            
            await this.callbackManager.invokeEvent('on_research_progress', {
                run_id: runId,
                data: {
                    iteration: iterations,
                    total_iterations: this.maxIterations, // 统一命名
                    current_step: this.intermediateSteps.length, // 统一命名
                    total_steps: totalSteps, // 新增
                    plan_completion: planCompletion, // 新增
                    sources_collected: allSources.length, // 新增
                    metrics: this.metrics,
                    research_mode: detectedMode
                }
            });

            try {
                // 🎯 构建AgentLogic输入数据
                // ✨✨✨ 核心修复：将 internalTopic 和 uiTopic 都传递给 AgentLogic ✨✨✨
                const logicInput = {
                    topic: internalTopic,     // 供 LLM 使用的完整上下文 (enrichedTopic 经过清理)
                    displayTopic: uiTopic,      // 备用，以防需要 (cleanTopic 经过清理)
                    intermediateSteps: this.intermediateSteps,
                    availableTools,
                    researchPlan,
                    researchMode: detectedMode,
                    currentDate: new Date().toISOString() // 🎯 新增：传递当前日期
                };

                const agentDecision = await this.agentLogic.plan(logicInput, {
                    run_id: runId,
                    callbackManager: this.callbackManager
                });
                const agentDecisionText = agentDecision.responseText;
                this._updateTokenUsage(agentDecision.usage); // 🎯 新增

                console.log('[DeepResearchAgent] AgentLogic返回的原始决策文本:');
                console.log('--- 开始 ---');
                console.log(agentDecisionText);
                console.log('--- 结束 ---');

                const parsedAction = this.outputParser.parse(agentDecisionText);
                console.log('[DeepResearchAgent] OutputParser解析结果:', {
                    type: parsedAction.type,
                    tool_name: parsedAction.tool_name,
                    thought_length: parsedAction.thought?.length,
                    parameters: parsedAction.parameters
                });

                // 🎯 处理最终答案
                if (parsedAction.type === 'final_answer') {
                    console.log('[DeepResearchAgent] ✅ Agent在迭代中决定生成最终答案，保存答案并跳出循环');
                    finalAnswerFromIteration = parsedAction.answer;
                    break; // 跳出循环
                }

                // 🎯 处理报告大纲生成
                if (parsedAction.type === 'generate_outline' || parsedAction.tool_name === 'generate_outline') { // 增加对 tool_name 的判断以增强兼容性
                    console.log('[DeepResearchAgent] 📝 Agent已完成信息收集，正在生成报告大纲...');
                    
                    // 🎯 1. 调用您已经写好的大纲生成方法
                    const reportOutline = await this._generateReportOutline(
                        uiTopic, // 使用干净的主题
                        parsedAction.parameters.key_findings,
                        detectedMode // 传递当前的研究模式
                    );
                    
                    // 🎯 2. 将生成的大纲作为观察结果，送入下一次迭代，以指导Agent撰写最终报告
                    this.intermediateSteps.push({
                        action: {
                            tool_name: 'generate_outline',
                            parameters: parsedAction.parameters,
                            thought: parsedAction.thought
                        },
                        // 关键：构建一个对LLM友好的、指令清晰的观察结果
                        observation: `✅ 报告大纲已成功生成。你的下一步任务是基于这份大纲，填充详细内容，撰写最终的、完整的Markdown研究报告。\n\n---\n\n${reportOutline}`,
                        key_finding: `已生成包含${parsedAction.parameters.key_findings.length}个关键发现的报告大纲`,
                        success: true
                    });
                    
                    // 🎯 3. 结束本次迭代，立即进入下一轮思考
                    continue;
                }

                // 🎯 处理知识检索
                // ✅ 新增：处理知识检索动作
                if (parsedAction.type === 'knowledge_retrieval' || parsedAction.tool_name === 'retrieve_knowledge') {
                    console.log('[DeepResearchAgent] 🧠 Agent请求查阅工具文档...');
                    await this._handleKnowledgeRetrieval(parsedAction, this.intermediateSteps, runId);
                    continue; // 查阅文档后，直接进入下一轮迭代
                }

                // 🎯 处理工具调用
                if (parsedAction.type === 'tool_call') {
                    const { tool_name, parameters, thought } = parsedAction;
                    
                    // 拦截知识检索调用，以防万一
                    if (tool_name === 'retrieve_knowledge') {
                        await this._handleKnowledgeRetrieval(parsedAction, this.intermediateSteps, runId);
                        continue;
                    }

                    console.log(`[DeepResearchAgent] 🔧 执行工具调用: ${tool_name}`, parameters);
                    
                    await this.callbackManager.invokeEvent('on_tool_start', {
                        run_id: runId,
                        data: { tool_name, parameters, thought }
                    });

                    // 🎯 知识感知的工具执行
                    const { rawObservation, toolSources, toolSuccess } = await this._executeToolWithKnowledge(
                        tool_name,
                        parameters,
                        thought,
                        this.intermediateSteps,
                        detectedMode,
                        recordToolCall
                    );
                    
                    // 🎯 新增：将原始数据存储到数据总线
                    if (toolSuccess) {
                        this._storeRawData(this.intermediateSteps.length, rawObservation, {
                            toolName: tool_name,
                            contentType: tool_name === 'crawl4ai' ? 'webpage' : 'text'
                        });
                    }

                    // ✅✅✅ --- 核心修复：传入工具名称以应用不同的摘要策略 --- ✅✅✅
                    const summarizedObservation = await this._smartSummarizeObservation(internalTopic, rawObservation, detectedMode, tool_name);
                    
                    // ✨ 评估信息增益
                    const currentInfoGain = this._calculateInformationGain(summarizedObservation, this.intermediateSteps);
                    this.metrics.informationGain.push(currentInfoGain);
                    
                    if (currentInfoGain < 0.1) { // 信息增益阈值
                        consecutiveNoGain++;
                        console.log(`[DeepResearchAgent] 低信息增益 ${currentInfoGain.toFixed(2)}，连续${consecutiveNoGain}次`);
                    } else {
                        consecutiveNoGain = 0;
                    }

                    // 🎯 新增：生成关键发现摘要
                    const keyFinding = await this._generateKeyFinding(summarizedObservation);
                    
                    // 保存完整的步骤信息
                    this.intermediateSteps.push({
                        action: {
                            type: 'tool_call',
                            tool_name: tool_name,
                            parameters: parameters,
                            thought: thought || `执行工具 ${tool_name} 来获取更多信息。`
                        },
                        observation: summarizedObservation,
                        key_finding: keyFinding, // 🎯 新增：存储关键发现
                        sources: toolSources,
                        success: toolSuccess // ✅ 新增：记录工具执行状态
                    });
                    
                    // 🎯 合并到总来源列表
                    allSources = [...allSources, ...toolSources];
                    
                    // 在收集到新来源时更新统计
                    updateResearchStats({
                        sources: allSources,
                        // ✨ 核心修复：传递过滤后的数组本身，而不是它的长度
                        toolCalls: this.intermediateSteps.filter(step => step.action.type === 'tool_call')
                    });
                    
                    await this.callbackManager.invokeEvent('on_tool_end', {
                        run_id: runId,
                        data: {
                            tool_name,
                            output: summarizedObservation,
                            sources_found: toolSources.length, // 统一命名为 sources_found
                            success: toolSuccess, // 新增：工具执行状态
                            information_gain: currentInfoGain
                        }
                    });

                    // ✨ 智能提前终止：基于计划完成度
                    const completionRate = this._calculatePlanCompletion(researchPlan, this.intermediateSteps);
                    this.metrics.planCompletion = completionRate;
                    
                    if (completionRate > 0.8 && consecutiveNoGain >= 1) {
                        console.log(`[DeepResearchAgent] 计划完成度${completionRate}%，提前终止`);
                        break;
                    }
                
                } else {
                    // 🎯 处理解析错误
                    console.warn('[DeepResearchAgent] ⚠️ 输出解析失败，触发自我纠正');
                    const observation = `格式错误: ${parsedAction.error || '无法解析响应'}。请严格遵循指令格式：思考: ... 行动: {...} 或 最终答案: ...`;
                    
                    this.intermediateSteps.push({ 
                        action: { 
                            tool_name: 'self_correction', 
                            parameters: {},
                            thought: parsedAction.thought || agentDecisionText.substring(0, 500),
                            type: 'error'
                        }, 
                        observation,
                        key_finding: '输出解析失败，需要重新规划' // 🎯 新增关键发现
                    });
                    
                    await this.callbackManager.invokeEvent('on_research_progress', {
                        run_id: runId,
                        data: { 
                            iteration: iterations, 
                            total: this.maxIterations,
                            warning: '输出解析失败，已触发自我纠正',
                            error: parsedAction.error
                        }
                    });
                }

            } catch (error) {
                // 🎯 简化错误处理：完全信任ChatApiHandler的重试机制
                console.error(`[DeepResearchAgent] 迭代 ${iterations} 失败:`, error);
                
                // 增强错误处理
                let thoughtText = `在第 ${iterations} 次迭代中遇到错误，尝试继续。错误: ${error.message}`;
                let observationText = '系统执行错误，将尝试在下一步骤中恢复。';

                // 检查是否为速率限制错误
                if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
                    thoughtText = `在第 ${iterations} 次迭代中遭遇API速率限制。这通常是由于请求过于频繁。我将暂停当前操作，并在下一步中调整策略，而不是重复之前的操作。`;
                    observationText = '错误: API速率限制。无法完成上一步操作。';
                    // 遭遇速率限制时，强制增加"无增益"计数，以加速跳出无效循环
                    consecutiveNoGain++;
                }

                this.intermediateSteps.push({
                    action: {
                        tool_name: 'internal_error',
                        parameters: {},
                        thought: thoughtText, // 使用新的思考文本
                        type: 'error'
                    },
                    observation: observationText, // 使用新的观察文本
                    key_finding: `迭代 ${iterations} 遇到错误: ${error.message}`, // 🎯 新增关键发现
                    success: false // ✅ 新增：明确标记为失败
                });
                
                // 增加连续无增益计数，避免在连续错误中死循环
                consecutiveNoGain++;
            }
        }

        // 在每次迭代结束时更新统计
        updateResearchStats({
            iterations: iterations,
            metrics: this.metrics // 🎯 确保包含 tokenUsage
        });
        
        // ✨ 阶段3：统一的报告生成
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');

        // 提取所有观察结果用于关键词分析
        const allObservationsForKeywords = this.intermediateSteps.map(s => s.observation).join(' ');
        const keywords = this._extractKeywords(uiTopic, allObservationsForKeywords);
        
        // 更新关键词统计
        updateResearchStats({ keywords });
        
        // 在报告生成前增强来源信息
        const allSourcesFromSteps = this.intermediateSteps.flatMap(step => step.sources || []);
        const combinedSources = [...allSources, ...allSourcesFromSteps];
        const uniqueSources = this._deduplicateSources(combinedSources);

        console.log(`[DeepResearchAgent] 来源完整性检查:`, {
            totalSources: allSources.length,
            uniqueSources: uniqueSources.length,
            stepsWithSources: this.intermediateSteps.filter(s => s.sources && s.sources.length > 0).length
        });

        // 来源质量评估
        const qualitySources = this._assessSourceQuality(uniqueSources);
        console.log(`[DeepResearchAgent] 来源质量评估: ${qualitySources.length}/${uniqueSources.length} 个高质量来源`);

        // 来源信息增强
        const enhancedSources = this._enhanceSourceInformation(qualitySources);

        // 传递增强后的来源信息给报告生成
        let finalReport;
        if (finalAnswerFromIteration) {
            console.log('[DeepResearchAgent] 使用迭代中生成的答案作为报告基础，但会整合所有来源');
            finalReport = finalAnswerFromIteration;
        } else {
            console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
            finalReport = await this._generateFinalReport(
                uiTopic, 
                this.intermediateSteps, 
                researchPlan, 
                enhancedSources,  // 使用增强后的来源
                detectedMode
            );
        }

// ===========================================================================
// 🚀 最终报告后处理流水线 (Post-Processing Pipeline)
// ===========================================================================

// 1. 智能来源分析 (Source Analysis - On Full Report)
// 优先在完整报告上进行统计，确保即使模型只在末尾列出引用也能被捕获
console.log('[DeepResearchAgent] 正在基于完整报告进行来源分析...');
const filteredSources = this._filterUsedSources(uniqueSources, finalReport);
console.log(`[DeepResearchAgent] 资料来源过滤完成: ${uniqueSources.length} → ${filteredSources.length}`);

// 2. 清理幻觉章节 (Cleaning)
// 截断模型自行生成的“资料来源”部分，防止与系统生成的重复或格式不统一
const sourceKeywords = ["资料来源", "参考文献", "Sources", "References", "参考资料清单"];
let cleanedReport = finalReport;

for (const keyword of sourceKeywords) {
    const regex = new RegExp(`(##|###)\\s*${keyword}`, "i");
    const match = cleanedReport.match(regex);
    if (match) {
        console.warn(`[DeepResearchAgent] ⚠️ 检测到模型自行生成的“${keyword}”章节，正在执行自动清理...`);
        cleanedReport = cleanedReport.substring(0, match.index);
        break;
    }
}
cleanedReport = cleanedReport.trim();

// 3. 兜底图片渲染 (Fallback Image Rendering)
// 将未被引用的图片强制追加到报告正文末尾（在清理之后，确保不被切掉）
if (this.generatedImages.size > 0) {
    console.log(`[DeepResearchAgent] 开始检查图片引用完整性，共 ${this.generatedImages.size} 张图片...`);
    
    this.generatedImages.forEach((imageData, imageId) => {
        const placeholder = `placeholder:${imageId}`;
        const base64Snippet = imageData.image_base64.substring(0, 50);
        
        // 检查是否已存在（包括占位符或Base64）
        if (!cleanedReport.includes(placeholder) && !cleanedReport.includes(base64Snippet)) {
            console.warn(`[DeepResearchAgent] ⚠️ 发现“遗失”的图片 ${imageId}，强制追加占位符。`);
            cleanedReport += `\n\n### 📊 附图：${imageData.title}\n![${imageData.title}](${placeholder})`;
        }
    });
}

// 4. Base64 统一替换 (Base64 Replacement)
// 将所有占位符（含正文中的和兜底追加的）替换为真实图片数据
if (this.generatedImages.size > 0) {
    console.log(`[DeepResearchAgent] 开始执行最终渲染 (Base64替换)...`);
    cleanedReport = cleanedReport.replace(
        /!\[(.*?)\]\(placeholder:(.*?)\)/g,
        (_match, altText, imageId) => {
            const imageData = this.generatedImages.get(imageId.trim());
            if (imageData) {
                return `![${altText}](data:image/png;base64,${imageData.image_base64})`;
            }
            return `*[图像 "${altText}" 加载失败]*`;
        }
    );
}

// 5. 附加真实来源列表 (Append Verified Sources)
// 使用第 1 步计算出的精准列表
cleanedReport += await this._generateSourcesSection(filteredSources, researchPlan);

console.log(`[DeepResearchAgent] 最终报告构建完成。`);

        // =================================================================
        // 🔥🔥 核心修改点：在这里插入阶段4的逻辑 🔥🔥
        // =================================================================

        console.log('[DeepResearchAgent] 阶段4：生成时效性质量评估报告...');

        // 🎯 4.1. 调用质量评估方法
        const temporalQualityReport = this._generateTemporalQualityReport(
            researchPlan,
            this.intermediateSteps,
            uiTopic, // 使用干净的 topic
            detectedMode
        );
        
        // 🎯 4.2. 构建最终的、包含质量报告的 result 对象
        const result = {
            success: true,
            topic: uiTopic,
            report: cleanedReport, // <--- 使用 cleanedReport
            iterations,
            intermediateSteps: this.intermediateSteps,
            sources: filteredSources,
            metrics: this.metrics,
            plan_completion: this._calculatePlanCompletion(researchPlan, this.intermediateSteps),
            research_mode: detectedMode,
            temporal_quality: temporalQualityReport // 包含完整时效性质量报告
        };
        
        // 🎯 4.3. 调用性能记录方法
        this._recordTemporalPerformance(temporalQualityReport);
        
        // 🎯 4.4. 发送包含完整结果的 on_research_end 事件
        await this.callbackManager.invokeEvent('on_research_end', {
            run_id: runId,
            data: result // 🎯 优化：直接传递完整的 result 对象
        });
        
        // 🎯 4.5. 返回最终结果
        return result;
    }

    // ✨ 最终报告生成 - 【学术引用增强版】
    async _generateFinalReport(topic, intermediateSteps, plan, enhancedSources, researchMode) {
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');

        // 🎯 修复：构建更丰富的信息上下文
        const evidenceCollection = this._buildEvidenceCollection(intermediateSteps, plan);
        // 🎯 新增：为Pro模型提供更完整的研究过程上下文
        const researchContext = this._buildResearchContext(intermediateSteps, plan);
        // 🎯 增强：构建更详细的来源索引
        const numberedSourcesText = enhancedSources.map((s, i) => {
            const dateStr = s.collectedAt ? ` (${s.collectedAt.split('T')[0]})` : '';
            const desc = s.contextSnippet || s.description || '无摘要';
            const relevance = s.relevanceScore ? ` [相关性: ${s.relevanceScore.toFixed(2)}]` : '';
            return `[${s.enhancedIndex}] 《${s.title}》- ${desc}${dateStr}${relevance}`;
        }).join('\n');

        let finalPrompt;
        const reportTemplate = getTemplateByResearchMode(researchMode);
        let promptFragment = getTemplatePromptFragment(researchMode);

        // 🎯 修改：在最终提示词中包含研究上下文
        finalPrompt = `
# 角色：首席研究分析师
# 任务：基于提供的完整研究证据和高质量资料来源，撰写深度研究报告

# 最终研究主题: "${topic}"

# 1. 研究计划与执行上下文
${researchContext}

# 2. 📚 高质量资料来源索引 (共${enhancedSources.length}个)
${numberedSourcesText}

# 3. 详细研究证据集合
## 核心研究发现
${evidenceCollection.keyFindings.map((finding, index) => `- ${finding}`).join('\n')}

## 分步骤详细证据
${evidenceCollection.evidenceEntries.map(entry => `\n### 步骤 ${entry.stepIndex}: ${entry.subQuestion}\n**工具**: ${entry.tool} | **成功率**: ${entry.success !== false ? '成功' : '失败'} | **信息增益**: ${entry.informationGain?.toFixed(2) || 'N/A'}\n\n${entry.evidence}\n\n${entry.keyFinding ? `**💡 本步关键发现:** ${entry.keyFinding}` : ''}\n${entry.sources && entry.sources.length > 0 ? `**📖 本步来源:** ${entry.sources.map(s => `[${s.enhancedIndex}]`).join(', ')}` : ''}` ).join('\n\n')}

# 4. 报告撰写指令
${promptFragment}

**🚫 绝对禁止忽略已提供的证据和来源**
**✅ 必须充分利用所有高质量来源进行深度分析**

现在，请基于上述完整的研究证据生成最终报告：`;

        // ...后续模型调用与异常处理逻辑保持不变...
        try {
            const reportResult = await this._completeChatWithModelFallback(
                [{ role: 'user', content: finalPrompt }],
                'final_report_generation',
                0.3
            );
            const reportResponse = reportResult.response;
            this._updateTokenUsage(reportResponse.usage);
            const finalReport = reportResponse?.choices?.[0]?.message?.content ||
                this._generateFallbackReport(topic, intermediateSteps, enhancedSources, researchMode);
            console.log(`[DeepResearchAgent] 报告生成完成，模式: ${researchMode}`);
            return finalReport;
        } catch (error) {
            console.error('[DeepResearchAgent] 报告生成失败:', error);
            return this._generateFallbackReport(topic, intermediateSteps, enhancedSources, researchMode);
        }
    }

    // 🎯 新增：构建研究过程上下文
    _buildResearchContext(intermediateSteps, plan) {
        let context = '';
        if (plan && plan.research_plan) {
            context += `研究计划概览：\n`;
            context += plan.research_plan.map((step, idx) => `步骤${idx + 1}: ${step.sub_question}`).join('\n');
            context += '\n';
        }
        context += `执行过程摘要：\n`;
        context += intermediateSteps.map((step, idx) => {
            const tool = step.action?.tool_name || '未知工具';
            const status = step.success !== false ? '成功' : '失败';
            const finding = step.key_finding ? `关键发现: ${step.key_finding}` : '';
            return `步骤${idx + 1}: 工具=${tool}, 状态=${status}, ${finding}`;
        }).join('\n');
        return context;
    }
}
