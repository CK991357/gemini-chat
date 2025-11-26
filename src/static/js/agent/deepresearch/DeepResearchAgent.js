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
        
        // 🎯 精简版：只在关键环节使用Pro模型f
        this.proModelConfig = {
            primary: 'models/gemini-2.5-pro',  // Pro模型
            fallback: 'gemini-2.5-flash-preview-09-2025',      // 降级模型
            maxRetries: 1                      // 只重试一次
        };

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

    // 🎯 新增：Token 追踪方法
    _updateTokenUsage(usage) {
        if (!usage) return;
        
        this.metrics.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        this.metrics.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        this.metrics.tokenUsage.total_tokens += usage.total_tokens || 0;
        
        console.log(`[DeepResearchAgent] Token 使用更新:`, this.metrics.tokenUsage);
    }

    /**
     * 🎯 精简版：只在特定情况下降级
     */
    _shouldFallbackForPro(error) {
        const fallbackErrors = [
            'rate limit',
            'quota',
            'overload',
            'busy',
            'capacity',
            '429'
        ];
        
        const errorMsg = error.message.toLowerCase();
        return fallbackErrors.some(keyword => errorMsg.includes(keyword));
    }

    /**
     * 🎯 精简版：只在关键环节使用Pro模型降级
     */
    async _completeChatWithProFallback(messages, options = {}) {
        const { temperature = 0.3 } = options;
        
        try {
            console.log('[DeepResearchAgent] 🚀 关键环节使用Pro模型');
            
            const response = await this.chatApiHandler.completeChat({
                messages,
                model: this.proModelConfig.primary,
                temperature,
                ...options
            });
            
            // 检查响应是否有效
            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                console.log('[DeepResearchAgent] ✅ Pro模型调用成功');
                return response;
            } else {
                throw new Error('Pro模型返回空响应');
            }
            
        } catch (error) {
            console.warn(`[DeepResearchAgent] 🟡 Pro模型调用失败:`, error.message);
            
            // 🎯 只对特定错误降级（速率限制等）
            if (this._shouldFallbackForPro(error)) {
                console.log('[DeepResearchAgent] 🔄 降级到Flash模型继续...');
                
                const fallbackResponse = await this.chatApiHandler.completeChat({
                    messages,
                    model: this.proModelConfig.fallback,
                    temperature,
                    ...options
                });
                
                return fallbackResponse;
            } else {
                // 其他错误直接抛出
                throw error;
            }
        }
    }

    // 🔥🔥🔥 [新增方法] 智能上下文序列化器 🔥🔥🔥
    /**
     * 将 chatHistory 对象数组转换为 Planner 易于理解的纯文本脚本。
     * 关键点：过滤 Base64 图片以节省 Token，但保留"用户发了图"的语义。
     */
    _serializeContextMessages(messages) {
        // 兼容性修复：messages 可能不是数组（可能为对象或字符串），优先回退到 this.state.chatHistory
        let messagesSource = messages;
        if (!Array.isArray(messagesSource)) {
            if (this && this.state && Array.isArray(this.state.chatHistory) && this.state.chatHistory.length > 0) {
                messagesSource = this.state.chatHistory;
            } else if (messagesSource) {
                // 将单条消息（object 或 string）封装成数组以便后续处理
                messagesSource = [messagesSource];
            } else {
                return '';
            }
        }

        if (!messagesSource || messagesSource.length === 0) return '';

        // 取最近 6 条（排除当前触发消息）以保证上下文充足并节省 token
        const recentMessages = messagesSource.slice(0, -1).slice(-6);
        if (!recentMessages || recentMessages.length === 0) return '';

        let contextBuffer = [];
        contextBuffer.push("--- 对话历史开始 ---");

        recentMessages.forEach((msg) => {
            const roleLabel = (msg && msg.role === 'user') ? 'User' : 'Assistant';
            let textContent = '';

            const content = msg && msg.content ? msg.content : (typeof msg === 'string' ? msg : null);

            if (Array.isArray(content)) {
                content.forEach(part => {
                    if (part && part.type === 'text') {
                        textContent += part.text || '';
                    } else if (part && (part.type === 'image_url' || part.type === 'image_base64')) {
                        // 用占位符替代图片内容，保留语义
                        textContent += `[🖼️ Image Uploaded by User] `;
                    } else if (part && (part.type === 'file_url' || part.type === 'file')) {
                        textContent += `[📁 File Uploaded: ${part.name || 'document'}] `;
                    }
                });
            } else if (typeof content === 'string') {
                textContent = content;
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
${keyFindings.map((finding, index) => `- ${finding}`).join('\n')}

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
            // 🎯 只在这里使用Pro模型降级
            const response = await this._completeChatWithProFallback({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1, // 较低的温度以确保结构化输出
            });
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
    async _handleKnowledgeRetrieval(parsedAction, intermediateSteps, runId) {
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

                } catch (e) {
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
    async _executeToolWithKnowledge(toolName, parameters, thought, intermediateSteps, detectedMode, recordToolCall) {
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
        
        // 在循环结束后，报告生成前，确保所有来源都被正确传递：

        // 🎯 关键修复：确保所有来源都被收集和传递
        const allSourcesFromSteps = this.intermediateSteps.flatMap(step => step.sources || []);
        const combinedSources = [...allSources, ...allSourcesFromSteps];
        const uniqueSources = this._deduplicateSources(combinedSources);

        console.log(`[DeepResearchAgent] 🔍 来源统计:`, {
            allSourcesCount: allSources.length,
            stepsSourcesCount: allSourcesFromSteps.length,
            combinedCount: combinedSources.length,
            uniqueCount: uniqueSources.length
        });

        // 🎯 关键修复：无论是否有最终答案，都调用报告生成以确保信息整合
        let finalReport;
        if (finalAnswerFromIteration) {
            console.log('[DeepResearchAgent] 使用迭代中生成的答案作为报告基础，但会整合所有来源');
            // 仍然使用Agent生成的答案，但确保来源正确附加
            finalReport = finalAnswerFromIteration;
        } else {
            console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
            finalReport = await this._generateFinalReport(uiTopic, this.intermediateSteps, researchPlan, uniqueSources, detectedMode);
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
        (match, altText, imageId) => {
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
    async _generateFinalReport(topic, intermediateSteps, plan, sources, researchMode) {
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');

        // 1. 构建纯净的证据集合
        const evidenceCollection = this._buildEvidenceCollection(intermediateSteps, plan);
        
        // 2. 构建带编号的来源索引 (Source Index)
        const numberedSourcesText = sources.map((s, i) => {
            const dateStr = s.collectedAt ? ` (${s.collectedAt.split('T')[0]})` : '';
            // 限制描述长度，避免 Token 溢出
            const desc = s.description ? s.description.substring(0, 100).replace(/\n/g, ' ') + '...' : '无摘要';
            return `[${i + 1}] 《${s.title}》- ${desc}${dateStr}`;
        }).join('\n');

        let finalPrompt;
        const reportTemplate = getTemplateByResearchMode(researchMode);
        
        // 🎯 这里获取的就是包含了 "引用与论证规范" 的核心指令块
        let promptFragment = getTemplatePromptFragment(researchMode);
        
        // 🎯 【调试模式特别指令注入】
        if (researchMode === 'standard') {
            promptFragment += `
    \n\n🕵️‍♂️ **调试/审计模式核心指令 (System Audit Directives)**：

    **角色定义**：
    你此刻不再是内容创作者，你是**首席系统架构师**。你的任务是对本次 Agent 的执行链路进行**法医级的尸检分析 (Forensic Analysis)**。

    **必须审查的维度 (Mandatory Review Checklist)**：
    1.  **意图漂移 (Intent Drift)**：
        - Agent 在执行过程中是否跑题？初始规划是否真正覆盖了用户需求？
    2.  **工具滥用 (Tool Misuse)**：
        - 检查 \`tavily_search\`：关键词是否过于宽泛（如只搜了一个字）？是否进行了无意义的重复搜索？
        - 检查 \`crawl4ai\`：是否抓取了显而易见的无效页面（如登录页、验证码页）？
        - 检查 \`python_sandbox\`：是否在没有数据的情况下强行写代码？是否产生了 SyntaxError？
    3.  **数据一致性 (Data Integrity)**：
        - **幻觉检测**：Agent 在 "Thought" 中声称查到了数据，但在 "Observation" 中实际上是空的？如有，必须标记为 **[CRITICAL HALLUCINATION]**。
        - **压缩损耗**：指出哪些步骤的原始数据极长，但摘要过短，导致了潜在的关键信息丢失。
    4.  **Token 效益 (Token Economics)**：
        - 标记出 **[LOW ROI]**（低投入产出比）的步骤：消耗了大量 Token 但未提供新信息的步骤。

    **输出风格要求**：
    - 保持**冷酷、客观、技术化**。
    - 不要试图为 Agent 辩解。
    - 对于严重的逻辑断层，请直接使用 **❌** 符号标出。
    `;
        }

        // 🔥 动态模板构建逻辑
        if (reportTemplate.config.dynamic_structure) {
            console.log(`[DeepResearchAgent] 检测到动态报告模板 (${researchMode}模式)，构建学术级Prompt...`);
            
            finalPrompt = `
# 角色：首席研究分析师
# 任务：基于提供的证据和资料来源，撰写一份高质量、结构化、体现深度思考的学术级研究报告。

# 最终研究主题: "${topic}"

# 1. 研究计划 (纲领)
\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

# 2. 📚 资料来源索引 (Source Index)
**注意：以下编号对应你在正文中应引用的 [x] 标记。**
${numberedSourcesText}

# 3. 研究证据集合 (详细内容)
以下内容是从上述来源中提取的详细信息。请结合上面的来源索引进行语义化引用。
${evidenceCollection.keyFindings.map((finding, index) => `* 关键发现 ${index + 1}: ${finding}`).join('\n')}

## 详细证据:
${evidenceCollection.evidenceEntries.map(entry => `
### ${entry.subQuestion}
${entry.evidence}
${entry.keyFinding ? `**💡 本步关键发现:** ${entry.keyFinding}` : ''} 
`).join('\n\n')}

# 4. 你的报告撰写指令 (输出要求)
现在，请严格遵循以下元结构和要求，将上述研究证据整合成一份最终报告。

${promptFragment} 
// 👆 这里是 "引用协议" 的最佳位置，确保模型在处理数据前最后一次看到规则。

**🚫 绝对禁止:**
- 编造研究计划和证据集合中不存在的信息。
- 在报告中提及"思考"、"行动"、"工具调用"等研究过程细节。
- 手动生成"资料来源"章节。

**✅ 核心要求:**
- **自主生成标题:** 基于主题和核心发现，为报告创建一个精准的标题。
- **动态生成章节:** 将研究计划中的每一个 "sub_question" 直接转化为报告的一个核心章节标题。
- **内容填充:** 用对应研究步骤的详细证据数据来填充该章节。
- **引用来源:** 严格遵守上述【引用与论证规范】。

现在，请开始撰写这份基于纯净证据的最终研究报告。
`;
        } else {
            // 🎯 静态模板构建逻辑
            console.log(`[DeepResearchAgent] 使用静态报告模板 (${researchMode}模式)...`);
            
            const allObservations = evidenceCollection.evidenceEntries
                .map(entry => entry.evidence)
                .filter(evidence => evidence.length > 50)
                .join('\n\n');
            
            finalPrompt = `
你是一个专业的报告撰写专家。请基于以下收集到的信息，生成一份专业、结构完整的研究报告。

# 研究主题
${topic}

# 📚 资料来源索引 (必须引用)
${numberedSourcesText}

# 已收集的关键信息摘要
${allObservations.substring(0, 15000)}

${promptFragment} 
// 👆 同样，在静态模板中也放在数据之后，确保规则生效。
`;
        }

        console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
        
        try {
            // 🎯 只在这里使用Pro模型降级
            const reportResponse = await this._completeChatWithProFallback({
                messages: [{ role: 'user', content: finalPrompt }],
                temperature: 0.3,
            });
            this._updateTokenUsage(reportResponse.usage);
            
            let finalReport = reportResponse?.choices?.[0]?.message?.content ||
                this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
            
            console.log(`[DeepResearchAgent] 报告生成完成，模式: ${researchMode}`);
            return finalReport;
            
        } catch (error) {
            console.error('[DeepResearchAgent] 报告生成失败:', error);
            return this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
        }
    }

    // 🎯 新增：构建证据集合方法（供动态和静态模板共用）
    /**
     * @description 从中间步骤中提取纯净的证据数据，去除过程性噪音
     * @param {Array} intermediateSteps - 原始中间步骤
     * @param {Object} plan - 研究计划
     * @returns {Object} - 包含证据条目、关键发现等信息的证据集合
     */
    _buildEvidenceCollection(intermediateSteps, plan) {
        const evidenceEntries = [];
        const keyFindings = [];
        let totalLength = 0;

        intermediateSteps.forEach((step, index) => {
            // 🎯 过滤无效步骤
            if (!step.observation || 
                step.observation === '系统执行错误，继续研究' ||
                step.observation.includes('OutputParser解析失败') ||
                step.observation.includes('代码预检失败') ||
                step.observation.length < 10) {
                return;
            }

            // 🎯 清理观察结果中的过程性噪音
            let cleanEvidence = this._cleanObservation(step.observation);
            if (!cleanEvidence || cleanEvidence.length < 20) return;

            // 🎯 获取对应的子问题
            const subQuestion = plan.research_plan?.[index]?.sub_question || 
                               `研究步骤 ${index + 1}`;

            // 🎯 构建证据条目
            const evidenceEntry = {
                stepIndex: index + 1,
                subQuestion: subQuestion,
                evidence: cleanEvidence,
                keyFinding: step.key_finding,
                tool: step.action?.tool_name,
                originalLength: step.observation.length,
                cleanedLength: cleanEvidence.length
            };

            evidenceEntries.push(evidenceEntry);
            totalLength += cleanEvidence.length;

            // 🎯 收集关键发现
            if (step.key_finding && 
                step.key_finding !== '未能提取关键发现。' && 
                step.key_finding !== '关键发现提取异常。') {
                keyFindings.push(step.key_finding);
            }
        });

        return {
            evidenceEntries,
            keyFindings: [...new Set(keyFindings)], // 去重
            totalLength,
            totalSteps: intermediateSteps.length,
            validEvidenceSteps: evidenceEntries.length
        };
    }

    // 🎯 新增：观察结果清理方法
    /**
     * @description 清理观察结果中的过程性噪音和冗余信息
     * @param {string} observation - 原始观察结果
     * @returns {string} - 清理后的纯净证据
     */
    _cleanObservation(observation) {
        if (!observation || typeof observation !== 'string') {
            return '';
        }

        let cleaned = observation;

        // 🎯 移除摘要头部信息（如果存在）
        const summaryHeaders = [
            /## 📋 [^\n]+ 内容摘要\s*\*\*原始长度\*\*: [^\n]+\s*\*\*摘要长度\*\*: [^\n]+\s*\*\*压缩率\*\*: [^\n]+\s*/,
            /## ⚠️ [^\n]+ 内容降级处理\s*\*\*原因\*\*: [^\n]+\s*\*\*原始长度\*\*: [^\n]+\s*\*\*降级方案\*\*: [^\n]+\s*/
        ];
        
        summaryHeaders.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        // 🎯 移除工具特定的过程性描述
        const processPatterns = [
            /【来源\s*\d+】[^】]*?(?:https?:\/\/[^\s)]+)?\s*/g, // 来源标记
            /工具执行(?:成功|失败)[^\n]*\n/gi,
            /正在为[^\n]+生成智能摘要[^\n]*\n/gi,
            /智能摘要完成[^\n]*\n/gi,
            /原始长度[^\n]*压缩率[^\n]*\n/gi,
            /## [^\n]* (?:内容摘要|内容降级处理)[^\n]*\n/gi
        ];

        processPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        // 🎯 移除冗余的说明文本
        const redundantTexts = [
            '摘要基于',
            '因摘要服务不可用',
            '已使用降级方案',
            '工具调用',
            '思考:',
            '行动:',
            '观察:',
            '---\n*摘要基于',
            '---\n*因摘要服务不可用'
        ];

        redundantTexts.forEach(text => {
            const regex = new RegExp(text + '[^\n]*\n?', 'gi');
            cleaned = cleaned.replace(regex, '');
        });

        // 🎯 清理多余的换行和空白
        cleaned = cleaned
            .replace(/\n{3,}/g, '\n\n') // 多个换行合并为两个
            .replace(/^\s+|\s+$/g, '')   // 去除首尾空白
            .trim();

        return cleaned;
    }

    // ✨ 新增：强化资料来源提取
    _extractSourcesFromIntermediateSteps(intermediateSteps) {
        const sources = new Map(); // 使用Map避免重复来源
        
        intermediateSteps.forEach(step => {
            if (step.observation && typeof step.observation === 'string') {
                // 从tavily_search结果中提取来源
                if (step.action.tool_name === 'tavily_search' && step.observation.includes('【来源')) {
                    const sourceMatches = step.observation.match(/【来源\s*\d+】[^】]*?https?:\/\/[^\s)]+/g);
                    if (sourceMatches) {
                        sourceMatches.forEach(source => {
                            const urlMatch = source.match(/(https?:\/\/[^\s)]+)/);
                            if (urlMatch) {
                                const url = urlMatch[1];
                                const titleMatch = source.match(/【来源\s*\d+】([^】]*?)(?=http|$)/);
                                const title = titleMatch ? titleMatch[1].trim() : '未知标题';
                                
                                if (!sources.has(url)) {
                                    sources.set(url, {
                                        title: title,
                                        url: url,
                                        used_in_report: false
                                    });
                                }
                            }
                        });
                    }
                }
                
                // 从crawl4ai结果中提取来源
                if (step.action.tool_name === 'crawl4ai' && step.action.parameters && step.action.parameters.url) {
                    const url = step.action.parameters.url;
                    if (!sources.has(url)) {
                        sources.set(url, {
                            title: `爬取页面: ${new URL(url).hostname}`,
                            url: url,
                            used_in_report: false
                        });
                    }
                }
            }
        });
        
        return Array.from(sources.values());
    }

    // ✨ 新增：来源去重
    _deduplicateSources(sources) {
        const seen = new Set();
        return sources.filter(source => {
            const key = source.url;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // ✨ 新增：关键词提取
    _extractKeywords(topic, observations) {
        // 简单的关键词提取逻辑
        const words = (topic + ' ' + observations).split(/\s+/)
            .filter(word => word.length > 2)
            .map(word => word.toLowerCase());
        
        const keywordCounts = words.reduce((acc, word) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
        }, {});
        
        return Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term, count]) => ({ term, count }));
    }

    // 🎯 核心重构：构建报告提示词 - 使用单一来源原则
    _buildReportPrompt(topic, plan, observations, researchMode) {
        // 🎯 DRY原则优化：从 ReportTemplates.js 动态获取配置
        const template = getTemplateByResearchMode(researchMode);
        
        // 如果找不到模板，提供安全的回退
        if (!template) {
            console.warn(`[DeepResearchAgent] 未能为 researchMode "${researchMode}" 找到报告模板，将使用标准降级报告。`);
            return this._generateFallbackReport(topic, [{observation: observations}], [], researchMode);
        }
        
        const config = template.config;

        return `
你是一个专业的报告撰写专家。请基于以下收集到的信息，生成一份专业、结构完整的研究报告。

# 研究主题
${topic}

# 已收集的关键信息摘要
${observations.substring(0, 4000)} ${observations.length > 4000 ? '...（内容过长已截断）' : ''}

# 报告要求 (${template.name})

1.  **格式**: 必须是完整的 Markdown 格式。
2.  **结构**: 严格按照以下结构组织内容：
${config.structure.map(section => `    - ${section}`).join('\n')}
3.  **字数**: 报告总字数应在 ${config.wordCount} 左右。
4.  **风格**: ${config.style}
5.  **核心要求**: ${config.requirements}

6.  **【至关重要】引用来源的强制性学术准则 (Mandatory Citation Guideline)**

    *   **核心规则 (The Rule):** 你报告中的**每一个**关键数据、观点或结论，都**必须**在陈述该信息的段落末尾，清晰地注明其来源。这是一个衡量报告专业性与可信度的核心标准，**必须严格遵守**。

    *   **原则与目的 (The Why):** 你的每一份报告都必须体现出学术的严谨性。清晰的引用能让读者追溯信息的源头，是验证内容准确性的唯一途径，也是一份专业报告的基石。

    *   **格式与位置 (The How):**
        *   **引用内容**: 直接在行文中自然地引用来源的**完整标题**。
        *   **引用位置**: 在包含引用信息的**段落结尾处**。

    *   **格式示例 (The Examples):**
        *   **🚫 错误示例**: \`"...这个结论很重要。[来源: 网站A]"\` (格式错误且不够自然)
        *   **✅ 正确示例**: \`"...这一观点在论文《Fundamentals of Physical AI》中得到了详细阐述。"\`
        *   **✅ 正确示例**: \`"...根据《A Comprehensive Survey on Embodied AI》的分类，我们可以将其分为三类..."\`

---
**🛑 重要指令 🛑**
-   **绝对不要**在报告的任何部分（包括标题和章节名）提及或包含 "步骤"、"研究计划" 或任何相关的编号 (例如 "(步骤 1)")。
-   报告内容应流畅、连贯，直接呈现最终的研究成果，而不是研究过程的复述。
-   不要包含 "资料来源" 章节，我们会自动添加。
---

现在，请生成最终的研究报告：`;
    }

    _generateFallbackReport(topic, intermediateSteps, sources, researchMode) {
        // 降级报告生成逻辑
        const observations = intermediateSteps
            .filter(step => step.success !== false && (step.observation && step.observation.length > 50 || step.key_finding)) // 只保留成功的、有意义的观察或关键发现
            .map(step => {
                // 优先使用关键发现作为标题，否则使用工具名称
                const title = step.key_finding && step.key_finding !== '未能提取关键发现。' ?
                    `### ✅ 关键发现: ${step.key_finding}` :
                    `### 🔍 来自步骤 ${step.action.tool_name} 的发现`;
                
                // 截断详细观察结果
                const content = step.observation ?
                    step.observation.substring(0, 500) + (step.observation.length > 500 ? '...' : '') :
                    '无详细观察结果。';
                
                return `${title}\n\n${content}`;
            })
            .join('\n\n---\n\n');
            
        let report = `# ${topic}\n\n## ❗ 报告生成失败通知\n\n**研究模式**: ${researchMode}\n\n由于系统在最后一步整合报告时遇到问题，未能生成完整的结构化报告。以下是研究过程中收集到的关键信息摘要，供您参考。\n\n---\n\n${observations}\n\n## 总结\n基于收集的信息整理完成。`;
            
        return report;
    }

/**
 * 🎯 [最终完美版] 自适应参考文献生成器 (Adaptive IEEE Citation Generator)
 */
async _generateSourcesSection(sources, plan) {
    if (!sources || sources.length === 0) {
        return '\n\n## 📚 参考文献 (References)\n\n*本次研究未引用外部公开资料。*';
    }

    let output = '\n\n## 📚 参考文献 (References)\n\n';
    output += '> *注：本报告基于以下权威数据源生成，引用已通过语义匹配算法验证。*\n\n';

    // 🛠️ 智能元数据提取器
    const extractSmartMeta = (source) => {
        let title = (source.title || 'Untitled Document').trim();
        const url = source.url || '';
        
        // 1. 尝试提取作者
        let author = source.authors || source.author || '';
        if (Array.isArray(author)) author = author.join(', ');
        
        // 2. 尝试提取发布者/网站名
        let publisher = 'Unknown Source';
        if (url) {
            try {
                const hostname = new URL(url).hostname.replace('www.', '');
                publisher = hostname.charAt(0).toUpperCase() + hostname.slice(1);
            } catch (_e) {
                // 保持 Unknown Source
            }
        }

        // 3. 尝试提取日期
        let dateStr = '';
        if (source.publish_date) {
            dateStr = source.publish_date.split('T')[0]; 
        } else {
            const yearMatch = (title + ' ' + (source.description || '')).match(/(19|20)\d{2}/);
            if (yearMatch) dateStr = yearMatch[0];
        }

        // 4. 智能类型判断
        let type = 'web';
        if ((url && url.toLowerCase().endsWith('.pdf')) || (author && author.length > 0 && dateStr.length >= 4)) {
            type = 'academic';
        } else if (dateStr.length > 4) {
            type = 'news';
        }
        
        return { title, url, author, publisher, date: dateStr, type };
    };

    // 📝 列表生成
    sources.forEach((source, idx) => {
        const meta = extractSmartMeta(source);
        const index = idx + 1;
        const accessDate = new Date().toISOString().split('T')[0];
        let citation = '';

        if (meta.type === 'academic' && meta.author) {
            citation = `**[${index}]** ${meta.author}, "${meta.title}"`;
            if (meta.date) citation += `, ${meta.date.substring(0, 4)}`;
        } else if (meta.type === 'news') {
            citation = `**[${index}]** "${meta.title}," *${meta.publisher}*`;
            if (meta.date) citation += `, ${meta.date}`;
        } else {
            citation = `**[${index}]** "${meta.title}," *${meta.publisher}*`;
            if (meta.date) citation += `, ${meta.date}`;
        }

        citation += `. [Online].\n   Available: ${meta.url} (Accessed: ${accessDate})`;
        output += `${citation}\n\n`;
    });

    return output;
}

/**
 * 🎯 [最终版] 智能混合来源过滤器
 */
_filterUsedSources(sources, reportContent) {
    if (!sources || sources.length === 0) return [];
    if (!reportContent) return sources;
    
    console.log(`[SourceFilter] 启动智能匹配，候选来源: ${sources.length} 个`);
    const usedSources = new Set();
    const reportLower = reportContent.toLowerCase();

    // 轨道 1: 显式索引提取
    const citationRegex = /\[\s*(\d+)\s*\]/g;
    let match;
    while ((match = citationRegex.exec(reportContent)) !== null) {
        const index = parseInt(match[1], 10) - 1;
        if (index >= 0 && index < sources.length) {
            usedSources.add(sources[index]);
        }
    }

    // 轨道 2: 语义实体匹配
    sources.forEach(source => {
        if (usedSources.has(source)) return;
        
        const score = this._calculateSemanticMatchScore(source, reportLower);
        if (score >= 0.35) {
            usedSources.add(source);
        }
    });

    // 轨道 3: 智能降级
    const finalSources = Array.from(usedSources);
    finalSources.sort((a, b) => sources.indexOf(a) - sources.indexOf(b));

    if (finalSources.length === 0 && sources.length > 0) {
        console.warn('[SourceFilter] ⚠️ 未检测到明确引用，触发全量保留策略。');
        return sources;
    }

    console.log(`[SourceFilter] 匹配完成: ${sources.length} -> ${finalSources.length} 个有效来源`);
    return finalSources;
}

/**
 * 🎯 [核心算法] 计算语义匹配分数
 */
_calculateSemanticMatchScore(source, reportLower) {
    let score = 0;
    const title = source.title || '';
    const url = source.url || '';
    
    // 1. 标题分词匹配
    if (title) {
        const titleLower = title.toLowerCase();
        const stopWords = new Set([
            '的', '了', '和', '是', '在', '关于', '研究', '报告', '分析', '数据',
            'the', 'and', 'of', 'in', 'to', 'for', 'report', 'analysis', 'data'
        ]);
        
        const tokens = titleLower.split(/[^\w\u4e00-\u9fa5]+/)
            .filter(t => t.length >= 2 && !stopWords.has(t));
        
        if (tokens.length > 0) {
            let matchCount = 0;
            tokens.forEach(token => {
                if (reportLower.includes(token)) matchCount++;
            });
            
            score += (matchCount / tokens.length) * 0.8;
            
            const cleanTitleStart = titleLower.substring(0, 10);
            if (reportLower.includes(cleanTitleStart)) score = 1.0;
        }
    }
    
    // 2. 域名匹配
    if (url) {
        try {
            const hostname = new URL(url).hostname;
            const domainParts = hostname.split('.');
            const coreDomain = domainParts.find(p => p.length > 3 && !['www','com','org','gov','cn','net','edu'].includes(p));
            
            if (coreDomain && reportLower.includes(coreDomain)) {
                score += 0.3;
            }
        } catch (e) {}
    }
    
    return Math.min(score, 1.0);
}

    // ✨ 新增：信息增益计算
    _calculateInformationGain(newObservation, history) {
        const previousText = history.map(h => h.observation).join(' ');
        const newText = newObservation;
        
        // 简单基于新词出现的计算（可升级为更复杂的NLP方法）
        const previousWords = new Set(previousText.split(/\s+/));
        const newWords = newText.split(/\s+/).filter(word => word.length > 2);
        
        const novelWords = newWords.filter(word => !previousWords.has(word));
        return novelWords.length / Math.max(newWords.length, 1);
    }

    // ✨ 新增：计划完成度计算
    _calculatePlanCompletion(plan, history) {
        if (!plan || !history || history.length === 0) return 0;
        
        const completedSteps = plan.research_plan.filter(step => 
            this._isStepEvidenceInHistory(step, history)
        ).length;
        
        return completedSteps / plan.research_plan.length;
    }

    _isStepEvidenceInHistory(step, history) {
        const stepKeywords = step.sub_question.toLowerCase().split(/\s+/);
        const historyText = history.map(h => `${h.action.thought || ''} ${h.observation || ''}`).join(' ').toLowerCase();
        
        return stepKeywords.some(keyword => 
            historyText.includes(keyword) && keyword.length > 3
        );
    }

    /**
     * 🎯 智能摘要方法 - 带有工具特定策略和优雅降级
     * ✅✅✅ 核心修复：为不同工具设置不同的摘要策略 ✅✅✅
     */
    async _smartSummarizeObservation(mainTopic, observation, researchMode, toolName) {
        // ✅✅✅ --- 核心修复：为不同工具设置不同的摘要策略 --- ✅✅✅
        
        // 输入验证
        if (!observation || typeof observation !== 'string') {
            console.warn(`[DeepResearchAgent] 无效的观察结果，工具: ${toolName}`);
            return observation || '无观察结果';
        }

        const originalLength = observation.length;
        console.log(`[DeepResearchAgent] 开始处理工具 "${toolName}" 的输出，长度: ${originalLength} 字符`);

        // 🎯 搜索工具的结果本身就是摘要，不应再被摘要
        const noSummarizeTools = ['tavily_search']; 
        const summarizationThresholds = {
            'crawl4ai': 15000,  // 🎯 从2000提高到5000，降低压缩率
            'firecrawl': 15000,
            'default': 10000
        };

        // 🎯 对于搜索工具，跳过摘要直接返回原始结果
        if (noSummarizeTools.includes(toolName)) {
            console.log(`[DeepResearchAgent] 工具 "${toolName}" 跳过摘要，直接使用原始输出。`);
            
            // 统一的硬截断保护
            const hardLimit = 20000; 
            if (originalLength > hardLimit) {
                console.log(`[DeepResearchAgent] 内容超过硬截断限制 ${hardLimit}，进行安全截断`);
                return observation.substring(0, hardLimit) + "\n[...内容过长已安全截断]";
            }
            return observation;
        }

        const threshold = summarizationThresholds[toolName] || summarizationThresholds.default;
        
        // 🎯 修正逻辑：只有超过阈值才触发摘要
        if (originalLength <= threshold) {
            console.log(`[DeepResearchAgent] 工具 "${toolName}" 内容长度 ${originalLength} ≤ 阈值 ${threshold}，直接返回`);
            return observation;
        }
        
        // 🎯 增强：对包含表格的数据特别处理
        if (this._containsStructuredData(observation)) {
            console.log(`[DeepResearchAgent] 检测到结构化数据，优先保留表格内容`);
            const structuredContent = this._extractAndPreserveStructuredData(observation);
            
            // 🎯 优化：如果提取的结构化内容本身不长，且原始内容超过阈值，则直接返回结构化内容
            if (structuredContent.length < threshold * 0.8 && structuredContent.length > 100) {
                console.log(`[DeepResearchAgent] 结构化内容 (${structuredContent.length} 字符) 足够短，直接返回`);
                return `## 📋 ${toolName} 结构化数据（已优化保留）\n\n${structuredContent}`;
            }
            // 如果结构化内容仍然很长，则继续走智能摘要流程，但使用结构化内容作为输入
            if (structuredContent.length > threshold) {
                console.log(`[DeepResearchAgent] 结构化内容 (${structuredContent.length} 字符) 仍过长，将对结构化内容进行摘要`);
                observation = structuredContent; // 使用结构化内容替换原始内容进行摘要
            }
        }

        console.log(`[DeepResearchAgent] 工具 "${toolName}" 内容过长 (${originalLength} > ${threshold})，启动智能摘要...`);
        
        // 🎯 添加Agent模式专用延迟，降低请求频率
        if (researchMode && researchMode !== 'standard') {
            console.log(`[DeepResearchAgent] 研究模式 "${researchMode}" 添加500ms延迟`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 通知UI摘要开始
        await this.callbackManager.invokeEvent('agent:thinking', { 
            detail: { 
                content: `正在为 ${toolName} 生成智能摘要...`, 
                type: 'summarize', 
                agentType: 'deep_research' 
            } 
        });

        // 🎯 优化摘要提示词，要求保留更多技术细节
        const summarizerPrompt = `你是一个专业的技术信息分析师。基于"主要研究主题"，从以下原始文本中提取最关键和相关的信息，创建一个详细的技术摘要。

**严格的摘要要求**：
1. 📊 **数据绝对保留**: 必须保留原文中出现的所有统计数据、年份、数值、单位（如“万人”、“亿元”）。这是最高优先级！
2. 📉 **表格重构**: 如果原文包含表格数据，请将其转换为 Markdown 表格格式保留。
3. 🔧 **保留技术规格**：模型名称、参数数量、上下文长度、技术特性
4. 💡 **保持核心结论**：研究发现、比较结果、优势劣势分析
5. 🎯 **准确性优先**：专业术语、专有名词必须准确无误
6. 📝 **长度控制**：控制在800-1200字之间，确保信息完整性

**绝对禁止**：
- 删除或模糊化具体的数字和技术参数
- 丢失关键的技术比较和性能数据
- 改变原始的技术术语和专有名词

---
主要研究主题: "${mainTopic}"
---
原始文本 (前15000字符):
${observation.substring(0, 15000)}
${observation.length > 15000 ? `\n[... 原始内容共 ${observation.length} 字符，此处显示前15000字符 ...]` : ''}
---

请生成详细的技术摘要（必须包含所有关键细节和数字）:`;

        try {
            const startTime = Date.now();
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: summarizerPrompt }],
                model: 'gemini-2.0-flash-exp-summarizer',
                stream: false,
            });

            const executionTime = Date.now() - startTime;
            const choice = response && response.choices && response.choices[0];
            const summary = choice && choice.message && choice.message.content ? 
                choice.message.content.trim() : '❌ 摘要生成失败';

            // 🎯 计算并记录压缩率
            const compressionRatio = summary !== '❌ 摘要生成失败' ? 
                (1 - (summary.length / originalLength)).toFixed(3) : 1;
            
            console.log(`[DeepResearchAgent] ✅ 智能摘要完成`, {
                tool: toolName,
                originalLength,
                summaryLength: summary.length,
                compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
                executionTime: `${executionTime}ms`,
                researchMode
            });
            
            // 🎯 提供详细的结构化上下文信息
            if (summary === '❌ 摘要生成失败') {
                throw new Error('摘要模型返回空内容');
            }
            
            return `## 📋 ${toolName} 内容摘要\n**原始长度**: ${originalLength} 字符 | **摘要长度**: ${summary.length} 字符 | **压缩率**: ${(compressionRatio * 100).toFixed(1)}%\n\n${summary}\n\n---\n*摘要基于 ${toolName} 工具返回的原始内容生成*`;

        } catch (error) {
            console.error(`[DeepResearchAgent] ❌ 摘要子代理调用失败:`, {
                tool: toolName,
                error: error.message,
                originalLength
            });
            
            // 🎯 增强的优雅降级策略
            let fallbackSolution;
            
            if (error.message.includes('429') || error.message.includes('速率限制')) {
                // 速率限制：使用智能截断
                fallbackSolution = this._intelligentTruncate(observation, threshold * 1.2);
                console.log(`[DeepResearchAgent] 🟡 速率限制，使用智能截断降级`);
            } else if (error.message.includes('超时') || error.message.includes('timeout')) {
                // 超时错误：直接截断
                fallbackSolution = observation.substring(0, threshold) + `\n\n[... 内容过长，摘要超时，已截断前 ${threshold} 字符 ...]`;
                console.log(`[DeepResearchAgent] 🟡 超时错误，使用直接截断降级`);
            } else {
                // 其他错误：使用扩展截断阈值
                const fallbackThreshold = Math.min(threshold * 1.5, 20000);
                fallbackSolution = originalLength > fallbackThreshold ?
                    this._intelligentTruncate(observation, fallbackThreshold) :
                    observation;
                console.log(`[DeepResearchAgent] 🟡 其他错误，使用扩展截断降级，阈值: ${fallbackThreshold}`);
            }
            
            return `## ⚠️ ${toolName} 内容降级处理\n**原因**: ${error.message}\n**原始长度**: ${originalLength} 字符\n**降级方案**: ${fallbackSolution === observation ? '保持原始内容' : '智能截断'}\n\n${fallbackSolution}\n\n---\n*因摘要服务不可用，已使用降级方案显示内容*`;
        }
    }

    /**
     * 🎯 智能截断方法
     * 在指定长度附近寻找合适的截断点（段落边界）
     */
    _intelligentTruncate(text, maxLength) {
        if (text.length <= maxLength) return text;
        
        // 在maxLength附近寻找段落边界
        const searchWindow = Math.min(500, text.length - maxLength);
        const searchArea = text.substring(maxLength - 100, maxLength + searchWindow);
        
        // 优先在段落边界截断
        const lastParagraph = searchArea.lastIndexOf('\n\n');
        if (lastParagraph !== -1) {
            return text.substring(0, maxLength - 100 + lastParagraph) + "\n\n[...]";
        }
        
        // 其次在句子边界截断
        const lastSentence = searchArea.lastIndexOf('. ');
        if (lastSentence !== -1 && lastSentence > 50) {
            return text.substring(0, maxLength - 100 + lastSentence + 1) + ".. [...]";
        }
        
        // 最后在单词边界截断
        const lastSpace = searchArea.lastIndexOf(' ');
        if (lastSpace !== -1) {
            return text.substring(0, maxLength - 100 + lastSpace) + " [...]";
        }
        
        // 实在找不到合适的边界，直接截断
        return text.substring(0, maxLength) + "...";
    }

    /**
     * 🎯 新增：结构化数据检测
     */
    _containsStructuredData(text) {
        const structuredPatterns = [
            /\|.*\|.*\|/, // Markdown表格
            /<table[^>]*>.*?<\/table>/is, // HTML表格
            /\b(模型|名称|定位|特点|上下文|输出)\b.*\n.*-{3,}/, // 中文表格特征
            /\b(Model|Name|Positioning|Features|Context|Output)\b.*\n.*-{3,}/ // 英文表格特征
        ];
        
        return structuredPatterns.some(pattern => pattern.test(text));
    }

    /**
     * 🎯 新增：提取并保留结构化数据
     */
    _extractAndPreserveStructuredData(text) {
        let preservedContent = '';
        
        // 提取Markdown表格
        const markdownTables = text.match(/(\|[^\n]+\|\r?\n)((?:\|?:?-+)+\|?\r?\n)((?:\|[^\n]+\|\r?\n?)+)/g);
        if (markdownTables) {
            preservedContent += '## 提取的Markdown表格数据\n\n' + markdownTables.join('\n\n') + '\n\n';
        }
        
        // 提取类似表格的结构化文本
        const structuredSections = text.split(/\n## |\n# |\n### /).filter(section => {
            // 检查每个部分是否包含结构化特征
            return this._containsStructuredData(section);
        });
        
        if (structuredSections.length > 0) {
            preservedContent += '## 关键结构化信息\n\n' + structuredSections.join('\n\n') + '\n\n';
        }
        
        // 如果没找到结构化数据，返回原始文本的前面部分
        if (!preservedContent) {
            // 降级：返回原始文本的前5000字符
            return text.substring(0, Math.min(5000, text.length));
        }
        
        return preservedContent;
    }

    // =============================================
    // 阶段3：质量评估层 - 基于"唯一事实来源"
    // =============================================

    // 核心：时效性质量评估系统
    _generateTemporalQualityReport(researchPlan, intermediateSteps, topic, researchMode) {
        const currentDate = new Date().toISOString().split('T')[0];
        
        // 🎯 唯一事实来源：模型自主评估结果
        const modelAssessedSensitivity = researchPlan.temporal_awareness?.overall_sensitivity || '未知';
        
        // 🎯 系统程序化评估（仅用于对比分析）
        const systemAssessedSensitivity = this._assessTemporalSensitivity(topic, researchMode);
        
        // 分析计划层面的时效性意识
        const planAnalysis = this._analyzePlanTemporalAwareness(researchPlan);
        
        // 分析执行层面的时效性行为  
        const executionAnalysis = this._analyzeExecutionTemporalBehavior(intermediateSteps, researchPlan);
        
        // 综合评估（基于模型自主评估的一致性）
        const overallScore = this._calculateTemporalScore(planAnalysis, executionAnalysis, modelAssessedSensitivity);

        return {
            // 元数据
            assessment_date: currentDate,
            topic: topic,
            research_mode: researchMode,
            
            // 🎯 核心：模型自主评估结果（唯一事实来源）
            model_assessment: {
                overall_sensitivity: modelAssessedSensitivity,
                step_sensitivities: researchPlan.research_plan.map(step => ({
                    step: step.step,
                    sensitivity: step.temporal_sensitivity,
                    sub_question: step.sub_question
                }))
            },
            
            // 系统程序化评估（用于对比分析）
            system_assessment: {
                overall_sensitivity: systemAssessedSensitivity,
                is_consistent: modelAssessedSensitivity === systemAssessedSensitivity,
                consistency_note: this._getConsistencyNote(modelAssessedSensitivity, systemAssessedSensitivity)
            },
            
            // 质量分析
            quality_metrics: {
                overall_temporal_score: overallScore,
                plan_quality: planAnalysis,
                execution_quality: executionAnalysis,
                quality_rating: this._getQualityRating(overallScore)
            },
            
            // 改进建议
            improvement_recommendations: this._getImprovementRecommendations(
                planAnalysis, 
                executionAnalysis, 
                overallScore,
                modelAssessedSensitivity,
                systemAssessedSensitivity
            ),
            
            // 执行总结
            summary: this._generateTemporalSummary(planAnalysis, executionAnalysis, overallScore, modelAssessedSensitivity)
        };
    }

    // 系统程序化评估方法
    _assessTemporalSensitivity(topic, researchMode) {
        const currentYear = new Date().getFullYear().toString();
        const currentYearMinus1 = (new Date().getFullYear() - 1).toString();
        
        // 高敏感度关键词
        const highSensitivityKeywords = [
            '最新', '当前', '现状', '趋势', '发展', '前景', '202', currentYear, currentYearMinus1,
            '版本', '更新', '发布', 'AI', '人工智能', '模型', '技术', '市场', '政策', '法规'
        ];
        
        // 低敏感度关键词
        const lowSensitivityKeywords = [
            '历史', '起源', '发展史', '经典', '理论', '基础', '概念', '定义', '原理'
        ];
        
        const topicLower = topic.toLowerCase();
        
        // 检查高敏感度关键词
        const hasHighSensitivity = highSensitivityKeywords.some(keyword => 
            topicLower.includes(keyword.toLowerCase())
        );
        
        // 检查低敏感度关键词
        const hasLowSensitivity = lowSensitivityKeywords.some(keyword => 
            topicLower.includes(keyword.toLowerCase())
        );
        
        // 基于研究模式的调整
        const modeSensitivity = {
            'deep': '高',
            'academic': '中', 
            'business': '高',
            'technical': '高',
            'cutting_edge': '高',
            'standard': '中'
        };
        
        if (hasHighSensitivity) return '高';
        if (hasLowSensitivity) return '低';
        
        return modeSensitivity[researchMode] || '中';
    }

    // 分析计划层面的时效性意识
    _analyzePlanTemporalAwareness(researchPlan) {
        const steps = researchPlan.research_plan;
        const totalSteps = steps.length;
        
        // 统计敏感度分布
        const sensitivityCount = { '高': 0, '中': 0, '低': 0 };
        let stepsWithTemporalQueries = 0;
        let totalTemporalQueries = 0;
        
        steps.forEach(step => {
            sensitivityCount[step.temporal_sensitivity] = (sensitivityCount[step.temporal_sensitivity] || 0) + 1;
            
            // 检查步骤是否包含时效性查询建议
            const hasTemporalQuery = step.initial_queries?.some(query => 
                query.includes('最新') || query.includes('202') || query.includes('版本')
            );
            
            if (hasTemporalQuery) {
                stepsWithTemporalQueries++;
                totalTemporalQueries += step.initial_queries.filter(q =>
                    q.includes('最新') || q.includes('202') || q.includes('版本')
                ).length;
            }
        });
        
        return {
            total_steps: totalSteps,
            sensitivity_distribution: sensitivityCount,
            high_sensitivity_ratio: sensitivityCount['高'] / totalSteps,
            temporal_coverage: stepsWithTemporalQueries / totalSteps,
            avg_temporal_queries_per_step: stepsWithTemporalQueries > 0 ? 
                (totalTemporalQueries / stepsWithTemporalQueries) : 0,
            plan_quality: this._ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps)
        };
    }

    // 分析执行层面的时效性行为
    _analyzeExecutionTemporalBehavior(intermediateSteps, researchPlan) {
        const currentYear = new Date().getFullYear().toString();
        const totalActions = intermediateSteps.length;
        
        let temporalAwareActions = 0;
        let temporalKeywordUsage = 0;
        let versionVerificationAttempts = 0;
        let officialSourceAccess = 0;
        
        // 构建步骤敏感度映射
        const stepSensitivityMap = {};
        researchPlan.research_plan.forEach(step => {
            stepSensitivityMap[step.step] = step.temporal_sensitivity;
        });
        
        intermediateSteps.forEach(step => {
            const stepSensitivity = stepSensitivityMap[step.step] || '中';
            let isTemporalAware = false;
            
            if (step.action?.tool_name === 'tavily_search') {
                const query = step.action.parameters?.query || '';
                
                // 检查是否使用时序性关键词
                const usedTemporalKeyword = query.includes('最新') || 
                                          query.includes(currentYear) || 
                                          query.includes('版本');
                
                if (usedTemporalKeyword) {
                    temporalKeywordUsage++;
                    isTemporalAware = true;
                }
                
                // 检查版本验证尝试
                if (query.includes('版本') || query.includes('v') || query.match(/\d+\.\d+/)) {
                    versionVerificationAttempts++;
                    isTemporalAware = true;
                }
            }
            
            // 检查crawl4ai是否用于获取官方信息
            if (step.action?.tool_name === 'crawl4ai') {
                const url = step.action.parameters?.url || '';
                const isOfficialSource = url.includes('github.com') || 
                                       url.includes('official') || 
                                       url.includes('website');
                
                if (isOfficialSource) {
                    officialSourceAccess++;
                    isTemporalAware = true;
                }
            }
            
            if (isTemporalAware) {
                temporalAwareActions++;
            }
        });
        
        return {
            total_actions: totalActions,
            temporal_aware_actions: temporalAwareActions,
            temporal_action_ratio: totalActions > 0 ? (temporalAwareActions / totalActions) : 0,
            temporal_keyword_usage: temporalKeywordUsage,
            version_verification_attempts: versionVerificationAttempts,
            official_source_access: officialSourceAccess,
            execution_quality: this._rateExecutionQuality(temporalAwareActions, totalActions, temporalKeywordUsage)
        };
    }

    // 综合评分（基于模型自主评估）
    _calculateTemporalScore(planAnalysis, executionAnalysis, modelAssessedSensitivity) {
        // 计划质量权重
        const planScore = planAnalysis.temporal_coverage * 0.3 + 
                         planAnalysis.high_sensitivity_ratio * 0.2;
        
        // 执行质量权重
        const executionScore = executionAnalysis.temporal_action_ratio * 0.4 +
                             (executionAnalysis.temporal_keyword_usage > 0 ? 0.1 : 0);
        
        let baseScore = planScore + executionScore;
        
        // 🎯 基于模型评估调整分数
        if (modelAssessedSensitivity === '高' && executionAnalysis.temporal_action_ratio < 0.5) {
            baseScore *= 0.7; // 高敏感主题但执行不足，严重扣分
        } else if (modelAssessedSensitivity === '低' && executionAnalysis.temporal_action_ratio > 0.7) {
            baseScore *= 0.9; // 低敏感主题但过度关注时效性，轻微扣分
        }
        
        return Math.min(baseScore, 1.0);
    }

    // 计划质量评级
    _ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps) {
        const highSensitivityRatio = sensitivityCount['高'] / totalSteps;
        const temporalCoverage = stepsWithTemporalQueries / totalSteps;
        
        if (highSensitivityRatio > 0.5 && temporalCoverage > 0.6) return '优秀';
        if (highSensitivityRatio > 0.3 && temporalCoverage > 0.4) return '良好';
        if (highSensitivityRatio > 0.2 && temporalCoverage > 0.2) return '一般';
        return '待改进';
    }

    // 执行质量评级
    _rateExecutionQuality(temporalAwareActions, totalActions, temporalKeywordUsage) {
        const temporalActionRatio = totalActions > 0 ? (temporalAwareActions / totalActions) : 0;
        
        if (temporalActionRatio > 0.6 && temporalKeywordUsage > 0) return '优秀';
        if (temporalActionRatio > 0.4 && temporalKeywordUsage > 0) return '良好';
        if (temporalActionRatio > 0.2) return '一般';
        return '待改进';
    }

    // 一致性说明
    _getConsistencyNote(modelSensitivity, systemSensitivity) {
        if (modelSensitivity === systemSensitivity) {
            return '模型评估与系统评估一致，判断准确';
        } else if (modelSensitivity === '高' && systemSensitivity === '低') {
            return '模型评估比系统更严格，可能过度关注时效性';
        } else if (modelSensitivity === '低' && systemSensitivity === '高') {
            return '模型评估比系统更宽松，可能低估时效性需求';
        } else {
            return '模型与系统评估存在差异，需要人工复核';
        }
    }

    // 质量评级
    _getQualityRating(score) {
        if (score >= 0.8) return { level: '优秀', emoji: '✅', description: '时效性管理卓越' };
        if (score >= 0.6) return { level: '良好', emoji: '⚠️', description: '时效性管理良好' };
        if (score >= 0.4) return { level: '一般', emoji: '🔶', description: '时效性管理一般' };
        return { level: '待改进', emoji: '❌', description: '时效性管理需要改进' };
    }

    // 改进建议
    _getImprovementRecommendations(planAnalysis, executionAnalysis, overallScore, modelSensitivity, systemSensitivity) {
        const recommendations = [];
        
        // 基于模型评估的建议
        if (modelSensitivity === '高' && executionAnalysis.temporal_action_ratio < 0.5) {
            recommendations.push('对于高敏感度主题，建议在执行中更多关注信息时效性验证');
        }
        
        if (modelSensitivity === '低' && executionAnalysis.temporal_action_ratio > 0.7) {
            recommendations.push('对于低敏感度主题，当前对时效性的关注可能过度，建议更专注于准确性');
        }
        
        // 基于执行质量的建议
        if (executionAnalysis.temporal_keyword_usage === 0 && modelSensitivity === '高') {
            recommendations.push('高敏感度主题中未使用时序性搜索关键词，建议在搜索中更多使用"最新"、"2025"等关键词');
        }
        
        if (executionAnalysis.official_source_access === 0 && modelSensitivity === '高') {
            recommendations.push('高敏感度主题中未访问官方来源，建议直接访问官网获取准确版本信息');
        }
        
        // 基于计划质量的建议
        if (planAnalysis.temporal_coverage < 0.3) {
            recommendations.push('研究计划中对时效性的考虑不足，建议在规划阶段更多关注信息时效性');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('当前时效性管理策略适当，模型判断与执行一致');
        }
        
        return recommendations;
    }

    // 生成总结
    _generateTemporalSummary(planAnalysis, executionAnalysis, overallScore, modelSensitivity) {
        const rating = this._getQualityRating(overallScore);
        const coveragePercent = (planAnalysis.temporal_coverage * 100).toFixed(0);
        const actionPercent = (executionAnalysis.temporal_action_ratio * 100).toFixed(0);
        const scorePercent = (overallScore * 100).toFixed(0);
        
        return `${rating.emoji} 时效性管理${rating.level} | 模型评估:${modelSensitivity} | 计划覆盖:${coveragePercent}% | 执行验证:${actionPercent}% | 综合得分:${scorePercent}分`;
    }
    // 确保 _recordTemporalPerformance 方法存在于 DeepResearchAgent.js 中
    _recordTemporalPerformance(performanceData) {
        if (!performanceData) return;
        try {
            const analyticsData = {
                timestamp: new Date().toISOString(),
                topic: performanceData.topic,
                research_mode: performanceData.research_mode,
                model_assessed_sensitivity: performanceData.model_assessment.overall_sensitivity,
                system_assessed_sensitivity: performanceData.system_assessment.overall_sensitivity,
                consistency: performanceData.system_assessment.is_consistent,
                overall_score: performanceData.quality_metrics.overall_temporal_score,
                quality_rating: performanceData.quality_metrics.quality_rating.level,
                plan_coverage: performanceData.quality_metrics.plan_quality.temporal_coverage,
                execution_ratio: performanceData.quality_metrics.execution_quality.temporal_action_ratio
            };
            console.log('[TemporalAnalytics] 记录时效性性能:', analyticsData);
        } catch (error) {
            console.warn('[TemporalAnalytics] 记录性能数据失败:', error);
        }
    }

    /**
     * 🎯 占位符：从文本中提取表格
     */
    _extractTablesFromText(text) {
        // 简单的Markdown表格提取逻辑占位符
        const tableMatches = text.match(/\|.*\|.*\n\|[-: ]+\|[-: ]+\|.*\n(\|.*\|.*)+/g) || [];
        return tableMatches.map(t => `### 提取表格\n${t}`);
    }

    /**
     * 🎯 占位符：从文本中提取列表
     */
    _extractListsFromText(text) {
        // 简单的Markdown列表提取逻辑占位符
        const listMatches = text.match(/(\n\s*[-*+]\s+.*)+/g) || [];
        return listMatches.map(l => `### 提取列表\n${l.trim()}`);
    }

    /**
     * 智能数据存储方法
     */
    _storeRawData(stepIndex, rawData, metadata = {}) {
        const dataKey = `step_${stepIndex}`;
        
        let processedData = rawData;
        if (rawData.length > 10000) {
            processedData = this._extractStructuredData(rawData, metadata);
        }
        
        this.dataBus.set(dataKey, {
            rawData: processedData,
            metadata: {
                ...metadata,
                originalLength: rawData.length,
                processedLength: processedData.length,
                timestamp: Date.now()
            }
        });
        
        this._cleanupDataBus();
        
        console.log(`[DataBus] 存储数据 ${dataKey}: ${rawData.length} -> ${processedData.length} 字符`);
    }

    /**
     * 🎯 新增：智能数据提取
     */
    /**
     * 智能数据提取
     */
    _extractStructuredData(rawData, metadata) {
        // 针对网页内容特别优化
        if (metadata.contentType === 'webpage') {
            // 提取表格、列表等结构化数据
            const tables = this._extractTablesFromText(rawData);
            const lists = this._extractListsFromText(rawData);
            
            if (tables.length > 0 || lists.length > 0) {
                return `## 关键结构化数据\n\n${tables.join('\n\n')}\n\n${lists.join('\n\n')}`;
            }
        }
        
        // 通用情况：保留前8000字符 + 后2000字符
        if (rawData.length > 10000) {
            return rawData.substring(0, 8000) +
                   '\n\n[...内容截断...]\n\n' +
                   rawData.substring(rawData.length - 2000);
        }
        
        return rawData;
    }

    /**
     * 🎯 [最终版] 数据总线清理
     */
    _cleanupDataBus() {
        // 1. 获取所有 'step_X' 格式的键
        const stepKeys = Array.from(this.dataBus.keys())
                              .filter(key => key.startsWith('step_'));

        // 2. 如果需要清理
        if (stepKeys.length > this.dataRetentionPolicy.retentionSteps) {
            // 3. 按照数字大小对键进行排序（'step_1', 'step_10', 'step_2' -> 'step_1', 'step_2', 'step_10'）
            stepKeys.sort((a, b) => {
                const numA = parseInt(a.split('_')[1], 10);
                const numB = parseInt(b.split('_')[1], 10);
                return numA - numB;
            });

            // 4. 确定要删除的旧键
            const keysToDelete = stepKeys.slice(0, stepKeys.length - this.dataRetentionPolicy.retentionSteps);
            
            // 5. 执行删除
            keysToDelete.forEach(key => {
                this.dataBus.delete(key);
                console.log(`[DataBus] 🧹 清理过期数据: ${key}`);
            });
        }
    }
    
    /**
     * 🚑 [优化版] 代码急诊室：基于 LLM 的自动修复
     * 包含重试机制 (Max Retries: 2)
     */
    async _repairCodeWithLLM(brokenCode, errorType) {
        console.log('[DeepResearchAgent] 🚑 启动代码急诊室 (Auto-Repair)...');
        
        const contextData = this.currentResearchContext || "无上下文数据";
        const maxRetries = 2; // 最大重试次数
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const isRetry = attempt > 0;
            if (isRetry) {
                console.warn(`[DeepResearchAgent] 🚑 修复尝试 ${attempt}/${maxRetries} 失败，正在重试...`);
            }

            const prompt = `
# 角色：Python 代码修复专家

# 紧急任务
检测到以下代码存在 **${errorType}**。
请根据【任务背景】中的数据，修复代码中的空赋值或语法错误。

# 任务背景 (用户原始请求 - 包含数据)
${contextData}

# 损坏的代码
\`\`\`python
${brokenCode}
\`\`\`

# 修复要求
1. **数据填充 (关键)**: 
   - 仔细阅读【任务背景】，找到年份、数值等具体数据。
   - 将这些数据**完整、准确地硬编码**到代码的变量中 (例如 \`years = [2020, 2021...]\`)。
   - **绝对禁止**再次生成空赋值 (如 \`x =\`)。
2. **语法修正**: 确保所有括号、引号闭合，import 完整。
3. **输出格式**: 只输出修复后的 Python 代码，不要 Markdown 标记，不要解释。
${isRetry ? "\n# 特别注意：上一次修复失败了，请务必仔细检查数据是否完整填入！" : ""}
`;

            try {
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'gemini-2.5-flash-preview-09-2025', // 坚持使用主模型
                    temperature: 0.1 // 稍微提高一点点温度，避免死板，但保持低值
                });

                // ✅ 语法修正：正确访问 choices 数组
                let fixedCode = response.choices[0].message.content;
                
                // 清理 Markdown
                fixedCode = fixedCode.replace(/```python/g, '').replace(/```/g, '').trim();
                
                // 验证：修复后的代码不应该再包含空赋值
                // 也不应该包含 "..." 这种懒惰写法
                if (/^\s*[a-zA-Z_]\w*\s*=\s*(?:\s*(?:#.*)?$)/m.test(fixedCode) || fixedCode.includes("...")) {
                    console.warn('[DeepResearchAgent] 🚑 修复后的代码仍不符合要求。');
                    continue; // 进入下一次重试
                }

                console.log(`[DeepResearchAgent] ✅ 急诊修复成功 (尝试 ${attempt + 1})，代码长度:`, fixedCode.length);
                return fixedCode;

            } catch (error) {
                console.error(`[DeepResearchAgent] 🚑 修复尝试 ${attempt + 1} 发生异常:`, error);
                // 继续下一次循环
            }
        }

        console.error('[DeepResearchAgent] 🚑 急诊室宣告抢救无效 (达到最大重试次数)。');
        return null;
    }

    /**
     * Python错误智能诊断
     */
    async _diagnosePythonError(errorOutput, parameters) {
        // 默认诊断
        let diagnosis = "Python 执行报错。";
        let suggestion = "请检查代码逻辑，确保变量已定义且库已正确导入。";

        // 1. 语法错误
        if (errorOutput.includes("SyntaxError")) {
            diagnosis = "语法错误 (SyntaxError)。";
            suggestion = "请检查括号 `()`、引号 `'` `\"` 是否成对闭合，以及是否遗漏了冒号 `:`。**注意：在 Python 字符串内部使用引号时，必须使用转义字符 `\\` (例如 `\\\"`)。**";
        }
        // 2. 缩进错误
        else if (errorOutput.includes("IndentationError")) {
            diagnosis = "缩进错误 (IndentationError)。";
            suggestion = "Python 对缩进非常敏感。请确保代码块的缩进一致（推荐使用 4 个空格），不要混用 Tab 和空格。";
        }
        // 3. 模块缺失
        else if (errorOutput.includes("ModuleNotFoundError")) {
            diagnosis = "模块缺失 (ModuleNotFoundError)。";
            suggestion = "沙箱环境只支持标准库和 pandas, matplotlib, numpy, scipy, sklearn, statsmodels。请勿导入其他第三方库。";
        }
        // 4. 变量未定义 (非常常见)
        else if (errorOutput.includes("NameError")) {
            diagnosis = "变量未定义 (NameError)。";
            suggestion = "请检查变量名是否拼写正确，或者是否在使用变量前忘记了定义它。";
        }
        // 5. 类型错误
        else if (errorOutput.includes("TypeError")) {
            diagnosis = "类型错误 (TypeError)。";
            suggestion = "请检查操作数的数据类型是否兼容（例如，不能直接将字符串和数字相加，除非先转换）。";
        }

        return {
            errorType: 'python_execution_error', // 保持结构一致性
            analysis: diagnosis,
            suggestedFix: suggestion
        };
    }
}
