// src/static/js/agent/deepresearch/DeepResearchAgent.js - 修复版本

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';
// 🎯 核心修改：从 ReportTemplates.js 导入工具函数
import { getTemplateByResearchMode, getTemplatePromptFragment } from './ReportTemplates.js';
// 🎯 新增：导入 DataMiningEngine
import { DataMiningEngine } from './DataMiningEngine.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        
        // 🎯 新增：智能URL去重系统
        this.visitedURLs = new Map(); // url -> {count: 访问次数, lastVisited: 最后访问时间, stepIndex: 访问步骤}
        this.urlSimilarityThreshold = 0.85; // URL相似度阈值
        this.maxRevisitCount = 2; // 同一URL最大重访次数
        
        // 🆕 新增：解析错误重试追踪
        this.parserRetryAttempt = 0; // 追踪解析重试次数（最大为 1）
        this.lastParserError = null; // 存储上次解析失败的错误对象
        this.lastDecisionText = null; // 存储上次模型输出的原始文本
        
        // 🎯 图像生成追踪
        this.generatedImages = new Map(); // 用于存储 base64 数据
        this.imageCounter = 0;
        this.runId = null; // 用于隔离不同研究任务的图片
        
        // ✅ 接收来自 Orchestrator 的 skillManager 实例
        this.skillManager = config.skillManager;
        
        // 🎯 新增：注入状态跟踪
        this.injectedTools = new Set(); // 本次研究已注入的工具
        this.knowledgeStrategy = 'smart'; // smart, minimal, reference
        this.currentSessionId = `session_${Date.now()}`; // 🎯 新增：会话ID
        
        // 🎯 新增：智能数据总线
        this.dataBus = new Map(); // step_index -> {rawData, metadata, contentType}
        this.dataRetentionPolicy = {
            maxRawDataSize: 250000, // 最大原始数据大小
            retentionSteps: 100    // 保留最近100步的数据，确保在报告生成前不会被清理
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

        // 🎯 新增：初始化 DataMiningEngine
        this.dataMiningEngine = null;
        if (config.dataMiningConfig !== undefined) {
            this.dataMiningEngine = new DataMiningEngine(config.dataMiningConfig);
            console.log('[DeepResearchAgent] DataMiningEngine 初始化完成');
        }

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

    // 🎯 生成格式修正提示词
    /**
     * 🎯 生成格式修正提示词
     */
    _generateCorrectionPrompt(originalText, errorMessage) {
        const errorSnippet = originalText.substring(0, 500);
        
        // 🆕 新增：特定错误指导
        let specificGuidance = '';
        if (errorMessage.includes('Expected \',\' or \'}\'')) {
            specificGuidance = `
**常见错误示例**：
❌ 错误: \`"query": "search term" AND "another"\`
✅ 正确: \`"query": "search term AND another"\`

**解决方法**：确保整个查询字符串在一对引号内
            `;
        }

        return `
## 🚨 紧急格式修正指令 (URGENT FORMAT CORRECTION)
**系统检测到你上次的输出存在致命的格式错误，导致解析失败。**

**错误类型**: JSON 语法错误 (Parser Error)
**错误信息**: ${errorMessage}
**上次输出片段**:
\`\`\`
${errorSnippet}
\`\`\`

${specificGuidance}

**强制修正要求**:
1.  **必须**严格遵循正确的 JSON 语法。
2.  **特别注意**: 在 JSON 字符串中，请勿使用未被引号包裹的关键字（如 \`AND\`）。
3.  **请重新生成**完整的"思考"和"行动"/"最终答案"块，并确保 JSON 参数是有效的。
`;
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

        let contextBuffer = [];
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

    // 🔥🔥🔥 [新增方法] 智能数据总线检索 🔥🔥🔥
    /**
     * @description 从数据总线中检索数据，并生成一个对 Agent 友好的摘要。
     * @returns {string} - 包含数据总线内容的 Markdown 摘要
     */
    _retrieveDataFromBus() {
        if (this.dataBus.size === 0) {
            return '';
        }

        let summary = `\n\n## 🚌 智能数据总线 (Data Bus) 缓存\n\n`;
        summary += `**系统提示**: 你在历史步骤中收集到的完整、未截断的原始数据（如长网页内容、大JSON）已缓存于此。请在需要时引用。\n\n`;

        // 按照时间戳降序排序，确保 Agent 看到最新的数据
        const sortedData = Array.from(this.dataBus.entries())
            .map(([key, data]) => ({ key, data }))
            .sort((a, b) => new Date(b.data.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());

        for (const { key, data } of sortedData) {
            const { rawData, metadata } = data;
            const stepIndex = key.split('_');
            const contentType = metadata.contentType || '未知';
            const toolName = metadata.toolName || '未知工具';
            const dataType = metadata.dataType || '文本';
            
            // 提取前 200 字符作为预览
            const preview = rawData.substring(0, 200).replace(/\n/g, ' ').trim();

            summary += `### 📦 ${key} (步骤 ${stepIndex} - ${toolName})\n`;
            summary += `- **类型**: ${dataType} (${contentType})\n`;
            summary += `- **大小**: ${metadata.size} 字符\n`;
            summary += `- **预览**: \`${preview}...\`\n`;
            summary += `- **引用方式**: 在你的思考中，你可以引用 \`DataBus:${key}\` 来表明你正在使用这份完整数据进行分析。\n\n`;
        }

        summary += `--- Data Bus 结束 ---\n\n`;
        return summary;
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
            standard: "大纲应结构清晰，覆盖主题的核心方面，逻辑连贯，易于理解。",
            data_mining: "大纲应侧重于：数据收集概况、数据质量评估、结构化数据呈现、数据对比分析、数据可视化建议。必须以数据表格为核心。"
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
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: this.reportModel || 'deepseek-reasoner', // 🔥 使用用户选择的模型
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
     * 🛠️ 自动修复crawl4ai参数格式
     */
    _autoFixCrawl4aiParams(originalParams, errorMsg) {
        console.log('[DeepResearchAgent] 🛠️ 执行crawl4ai参数自动修复');
        
        try {
            // 深度克隆参数，避免副作用
            const params = JSON.parse(JSON.stringify(originalParams));
            let fixed = false;
            
            // 修复1：模式名映射
            if (params.mode === 'batch_scrape') {
                params.mode = 'batch_crawl';
                console.log('[DeepResearchAgent] 🔄 修复模式名: batch_scrape -> batch_crawl');
                fixed = true;
            }
            
            // 修复2：扁平化嵌套参数
            if (params.parameters && params.parameters.urls) {
                console.log('[DeepResearchAgent] 📦 扁平化嵌套参数');
                const urls = params.parameters.urls;
                delete params.parameters;
                params.urls = urls;
                fixed = true;
            }
            
            // 修复3：确保参数结构正确
            if (params.mode === 'batch_crawl' && !params.parameters) {
                // 转换为后端期望的双层嵌套
                const urls = params.urls || [];
                delete params.urls;
                params.parameters = { urls };
                fixed = true;
            }
            
            if (fixed) {
                console.log('[DeepResearchAgent] ✅ 参数修复完成:', params);
                return params;
            }
            
            return null;
        } catch (error) {
            console.error('[DeepResearchAgent] ❌ 参数修复失败:', error);
            return null;
        }
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
1. **核心导入**: 必须在代码开头**强制导入**以下库：\`import json\`, \`import pandas as pd\`, \`import matplotlib.pyplot as plt\`, \`import numpy as np\`。
2. **数据硬编码**: 必须将【数据上下文】中的数据完整写入代码变量，**严禁空赋值**。
3. **中文支持 (关键)**:
   - 本环境**不包含** SimHei 或 Microsoft YaHei。
   - **必须**显式设置字体为文泉驿微米黑：
     \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']\`
   - 设置负号支持：\`plt.rcParams['axes.unicode_minus'] = False\`
4. **输出纯净**: 只输出 Python 代码，不要 Markdown 标记。
5. **必须调用 \`plt.show()\`**: 这是触发图像输出的唯一方式。
`;

            try {
                // 🟢 步骤 C: 呼叫专家模型 (独立上下文)
                // 这里就是您说的"同模型但不同窗口"
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
                    // 检查输出类型并相应处理
                    try {
                        // 尝试解析输出，看是否是JSON
                        const outputData = JSON.parse(sandboxResult.rawObservation);

                        if (outputData.type === 'image' && outputData.image_base64) {
                            // 图像处理逻辑不变
                            finalObservation = this._handleGeneratedImage(outputData);

                        } else if (['excel', 'word', 'powerpoint', 'ppt', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                            // 文件处理逻辑不变
                            finalObservation = `[✅ 文件生成成功] 类型: "${outputData.type}", 标题: "${outputData.title}". 文件已准备就绪。`;
                            this.callbackManager.invokeEvent('on_file_generated', {
                                run_id: this.runId,
                                data: outputData
                            });

                        } else if (outputData.type === 'ml_report' || outputData.type === 'data_extraction') {
                            // 🎯 保留原有特殊类型的处理逻辑，但增强数据总线存储
                            console.log(`[DeepResearchAgent] 📊 检测到${outputData.type}类型输出，保留完整数据`);
            
                            // 格式化输出以便Agent理解（保留原有逻辑）
                            let formattedData = '';
                            if (outputData.title) formattedData += `## ${outputData.title}\n\n`;
                            if (outputData.summary) formattedData += `### 摘要\n${outputData.summary}\n\n`;
                            if (outputData.tables && Array.isArray(outputData.tables)) {
                                formattedData += `### 提取的表格数据\n`;
                                outputData.tables.forEach((table, idx) => {
                                    formattedData += `#### 表格 ${idx + 1}: ${table.title || '未命名'}\n`;
                                    formattedData += `${table.content}\n\n`;
                                });
                            }
                            if (outputData.metrics) {
                                formattedData += `### 性能指标\n`;
                                Object.entries(outputData.metrics).forEach(([key, value]) => {
                                    formattedData += `- ${key}: ${value}\n`;
                                });
                            }
            
                            // 🎯 新增：同时保存原始数据到数据总线
                            const jsonStr = sandboxResult.rawObservation; // 原始JSON字符串
                            this._storeRawData(this.intermediateSteps.length + 1, jsonStr, {
                                toolName: 'code_generator',
                                contentType: 'structured_data',
                                dataType: outputData.type,
                                hasSpecialFormatting: true
                            }, sandboxResult.toolSources); // 🎯 传递工具来源
            
                            // 使用格式化后的内容作为观察结果
                            finalObservation = `✅ **数据提取成功**\n\n${formattedData}\n\n**提示**：完整结构化数据已保存到数据总线 (DataBus:step_${this.intermediateSteps.length + 1})`;
            
                        } else {
                            // 🔥 核心修复：对于所有其他成功的JSON输出，统一视为结构化数据
                            console.log(`[DeepResearchAgent] 📦 检测到结构化数据输出，类型: ${outputData.type || 'generic_data'}`);
            
                            const jsonStr = sandboxResult.rawObservation; // 使用原始的 JSON 字符串
                            const outputType = outputData.type || 'generic_data';
                            const keyCount = Object.keys(outputData).length;
                            
                            // 1. 强制保存到数据总线，并标记为结构化数据
                            this._storeRawData(this.intermediateSteps.length + 1, jsonStr, {
                                toolName: 'code_generator',
                                contentType: 'structured_data',
                                dataType: outputType
                            }, sandboxResult.toolSources); // 🎯 传递工具来源
            
                            // 2. 生成 Agent 友好的观察结果
                            let finalObservationContent;
                            if (jsonStr.length > 3000) {
                                // 如果太大，只显示摘要和引用方式
                                const sampleData = Object.entries(outputData)
                                    .slice(0, 3)
                                    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 100) : typeof v}`)
                                    .join('\n');
            
                                finalObservationContent = `✅ **专家任务执行成功 (结构化数据)**\n\n**数据类型**: ${outputType}\n**数据字段**: ${keyCount} 个\n**示例**:\n${sampleData}\n\n⚠️ 完整数据已保存到数据总线 (DataBus:step_${this.intermediateSteps.length + 1})，请在报告生成时引用。`;
                            } else {
                                // 如果数据量适中，直接显示 JSON
                                finalObservationContent = `✅ **专家任务执行成功 (结构化数据)**\n\n**数据类型**: ${outputType}\n\n**提取的数据**:\n\`\`\`json\n${jsonStr}\n\`\`\``;
                            }
                            
                            finalObservation = finalObservationContent;
                        }
                    } catch (e) {
                        // 如果输出不是JSON，或者解析失败
                        console.log('[DeepResearchAgent] Python输出不是JSON格式，作为纯文本处理');

                        // 检查是否已经是成功消息（避免重复包装）
                        if (sandboxResult.rawObservation.includes('[✅ 图像生成成功]') ||
                            sandboxResult.rawObservation.includes('[✅ 文件生成成功]')) {
                            finalObservation = sandboxResult.rawObservation;
                        } else {
                            // 对于纯文本输出，如果包含结构化信息，尝试格式化
                            const textOutput = sandboxResult.rawObservation;

                            // 检测是否包含表格或结构化数据
                            const hasTable = textOutput.includes('|') && textOutput.includes('---');
                            const hasJsonStructure = textOutput.includes('{') && textOutput.includes('}');

                            if (hasTable || hasJsonStructure) {
                                // 包含结构化数据，保留完整内容但添加标记
                                finalObservation = `✅ **专家任务执行成功 (包含结构化数据)**\n\n${textOutput}`;
                            } else if (textOutput.length > 500) {
                                // 长文本截断
                                finalObservation = `✅ **专家任务执行成功**\n\n输出 (已截断):\n${textOutput.substring(0, 500)}...\n\n*完整输出: ${textOutput.length} 字符*`;
                            } else {
                                // 短文本直接显示
                                finalObservation = `✅ **专家任务执行成功**\n\n输出:\n${textOutput}`;
                            }
                        }
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
            // 🎯 新增：URL去重检查（针对crawl4ai）
            // ============================================================
            if (toolName === 'crawl4ai' && parameters.url) {
                const url = parameters.url;
                
                // 检查是否访问过相似URL，并获取已访问的相似URL
                const visitedUrl = this._checkURLDuplicate(url);
                
                if (visitedUrl) {
                    console.log(`[DeepResearchAgent] 🛑 拦截到重复/相似URL: ${url} (相似于: ${visitedUrl})`);
                    
                    // 🎯 抛出自定义错误，利用 Agent 的解析错误重试机制实现"零迭代浪费"
                    const cachedStep = this._findCachedObservationForURL(visitedUrl);
                    const cachedObservation = cachedStep ? cachedStep.observation : '无缓存数据';
                    
                    // 记录工具调用为失败，但附带修正信息
                    recordToolCall(toolName, parameters, false, `重复URL拦截: ${url}`);
                    
                    // 抛出错误，让主循环捕获并注入修正提示
                    throw new Error(`[DUPLICATE_URL_ERROR] URL "${url}" 与已访问的 "${visitedUrl}" 高度相似。请立即更换 URL 或转向下一个子问题。缓存内容摘要: ${cachedObservation.substring(0, 200)}...`);
                }
                
                // 记录本次访问（如果不是重复，且是第一次访问）
                if (!this.visitedURLs.has(url)) {
                    this.visitedURLs.set(url, {
                        count: 1,
                        lastVisited: Date.now(),
                        stepIndex: this.intermediateSteps.length
                    });
                }
            }
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

                // 2. 客户端导入预检 (Client-side Import Pre-check)
                const missingImports = this._validatePythonImports(code);
                
                if (missingImports.length > 0) {
                    console.warn(`[DeepResearchAgent] 🛠️ 预检检测到缺失导入: ${missingImports.join(', ')}，自动修复...`);
                    
                    // 自动添加缺失的导入
                    const importStatements = missingImports.join('\n'); // 直接拼接完整的导入语句
                    parameters.code = `${importStatements}\n\n${code}`;
                    
                    console.log('[DeepResearchAgent] ✅ 客户端预检修复完成。');
                }

                // 3. 状态注入逻辑 (保留原有逻辑)
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

            // 🎯 降级识别：检查 crawl4ai 是否降级运行
            if (toolName === 'crawl4ai' && toolSuccess) {
                // 检查是否包含降级信息
                if (rawObservation.includes('pdf_skipped') || rawObservation.includes('内存优化')) {
                    console.log('[DeepResearchAgent] 📝 检测到 crawl4ai 工具降级运行，但核心内容已获取');
                    // 不标记为失败，Agent可以继续
                }
            }

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
            
            // 🔥 新增：crawl4ai参数错误自动修复
            if (toolName === 'crawl4ai' && error.message.includes('Missing required parameter')) {
                console.log('[DeepResearchAgent] 🛠️ 检测到crawl4ai参数格式错误，尝试自动修复...');
                
                try {
                    // 尝试自动修复参数
                    const fixedParams = this._autoFixCrawl4aiParams(parameters, error.message);
                    if (fixedParams) {
                        console.log('[DeepResearchAgent] 🔄 使用修复后的参数重试');
                        
                        // 递归调用，使用修复后的参数
                        return await this._executeToolCall(
                            toolName,
                            fixedParams,
                            detectedMode,
                            recordToolCall
                        );
                    }
                } catch (fixError) {
                    console.warn('[DeepResearchAgent] ⚠️ 自动修复失败:', fixError);
                }
            }
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

        // 🎯 新增：检查是否有相关数据可复用
        // 检查条件：数据总线有数据 且 thought 包含 '提取' 或 '数据'
        if (this.dataBus.size > 0 && (thought.includes('提取') || thought.includes('数据'))) {
            console.log('[DeepResearchAgent] 🔍 检查数据总线中的相关数据...');
            
            // 查找最近的数据
            const recentData = Array.from(this.dataBus.entries())
                .filter(([key, data]) => data.metadata.contentType === 'structured_data')
                .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());
            
            if (recentData.length > 0) {
                const [key, data] = recentData;
                console.log(`[DeepResearchAgent] ✅ 找到可用数据: ${key}, 类型: ${data.metadata.dataType}`);
                
                // 在thought中提示有可用数据
                thought = `注意：系统已缓存了相关结构化数据（${data.metadata.dataType}），请考虑利用这些数据。\n\n${thought}`;
            }
        }

        // 正常执行工具调用...
        const result = await this._executeToolCall(toolName, parameters, detectedMode, recordToolCall);
        
        // 🎯 核心修改：返回更新后的 thought
        return { ...result, updatedThought: thought };
    }

    async conductResearch(researchRequest) {
        // ✨ 修复：直接从 Orchestrator 接收模式和清理后的主题
        // ✨✨✨ 核心修复：解构出 displayTopic、enrichedTopic 及 contextMessages ✨✨✨
        const {
            topic: enrichedTopic,
            displayTopic: cleanTopic,
            originalUserInstruction, // 🎯 接收
            availableTools,
            researchMode,
            currentDate,
            contextMessages,
            reportModel // 🔥 新增：接收用户选择的报告模型
        } = researchRequest;
        
        this.reportModel = reportModel; // 🔥 存储为类属性
        
        const runId = this.callbackManager.generateRunId();
        this.runId = runId; // 关键：为当前研究会话设置唯一ID
        this.generatedImages.clear(); // 关键：每次新研究开始时清空图片缓存
        
        // 🎯 核心新增：重置知识注入状态
        this.resetInjectionState();
        
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
            // 🎯 核心修复：确保plan包含研究模式，供完成度计算使用
            if (!researchPlan.research_mode) {
                    researchPlan.research_mode = detectedMode;
}
            // 同时确保plan.research_plan存在（兼容不同命名）
            if (!researchPlan.research_plan && researchPlan.researchPlan) {
                    researchPlan.research_plan = researchPlan.researchPlan;
            }
            console.log(`[DeepResearchAgent] ✅ 智能规划完成，已生成${detectedMode}研究计划。`);      
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
        
        // 🆕 新增：解析错误控制变量
        let parserErrorOccurred = false;
        this.parserRetryAttempt = 0;
        this.lastParserError = null;
        this.lastDecisionText = null;
        
        // 🔥 核心修改：在数据挖掘模式下，使用DataMiningEngine的完成条件检查
        const isDataMiningMode = detectedMode === 'data_mining';
        let noGainThreshold;
        
        if (isDataMiningMode && this.dataMiningEngine) {
            // 使用数据挖掘引擎的配置
            const config = this.dataMiningEngine.config;
            noGainThreshold = config.noGainThreshold || 1;
            console.log(`[DeepResearchAgent] 数据挖掘模式，使用专用完成条件检查，noGainThreshold: ${noGainThreshold}`);
        } else {
            // 其他模式使用原有逻辑
            noGainThreshold = (detectedMode === 'deep') ? 3 : 2;
        }
        
        let allSources = [];
        let finalAnswerFromIteration = null;
        
        const totalSteps = researchPlan.research_plan.length; // 新增：总计划步骤数

        while (iterations < this.maxIterations && consecutiveNoGain < noGainThreshold && !finalAnswerFromIteration) {
            
            if (!parserErrorOccurred) { // 只有在没有解析错误时才增加迭代计数
                iterations++;
            }
            parserErrorOccurred = false; // 重置标志
            
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            const planCompletion = this._calculatePlanCompletion(researchPlan, this.intermediateSteps); // 计算完成度
            
            // 🎯 数据挖掘模式：使用专用完成条件检查
            let shouldTerminate = false;
            if (isDataMiningMode && this.dataMiningEngine) {
                shouldTerminate = this.dataMiningEngine.checkDataMiningCompletion(
                    this.intermediateSteps,
                    allSources,
                    iterations
                );
                
                if (shouldTerminate) {
                    console.log(`[DeepResearchAgent] 数据挖掘完成条件满足，提前终止迭代`);
                    break;
                }
            }
            
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
                    currentDate: new Date().toISOString(), // 🎯 新增：传递当前日期
                    dataBus: this.dataBus // 🎯 核心新增：传递数据总线
                };
                
                // 🆕 核心修改：如果上次是解析错误，注入修正提示
                if (this.parserRetryAttempt > 0 && this.lastParserError && this.lastDecisionText) {
                    const correctionPrompt = this._generateCorrectionPrompt(
                        this.lastDecisionText,
                        this.lastParserError.message
                    );
                    // 注入到 topic 中，确保 LLM 看到
                    logicInput.topic = `${correctionPrompt}\n\n${logicInput.topic}`;
                    console.log('[DeepResearchAgent] 🔄 注入格式修正提示，进行重试...');
                }

                const agentDecision = await this.agentLogic.plan(logicInput, {
                    run_id: runId,
                    callbackManager: this.callbackManager
                });
                const agentDecisionText = agentDecision.responseText;
                this.lastDecisionText = agentDecisionText; // 🆕 保存原始输出
                this._updateTokenUsage(agentDecision.usage); // 🎯 新增

                console.log('[DeepResearchAgent] AgentLogic返回的原始决策文本:');
                console.log('--- 开始 ---');
                console.log(agentDecisionText);
                console.log('--- 结束 ---');

                const parsedAction = this.outputParser.parse(agentDecisionText);
                this.parserRetryAttempt = 0; // ✅ 成功解析，重置计数
                this.lastParserError = null; // ✅ 成功解析，重置错误
                
                console.log('[DeepResearchAgent] OutputParser解析结果:', {
                    type: parsedAction.type,
                    tool_name: parsedAction.tool_name,
                    thought_length: parsedAction.thought?.length,
                    parameters: parsedAction.parameters
                });

                // 🎯 处理最终答案
                if (parsedAction.type === 'final_answer') {
                const completionRate = this._calculatePlanCompletion(researchPlan, this.intermediateSteps);
                    console.log(`[DeepResearchAgent] 📊 研究完成度评估：${(completionRate * 100).toFixed(1)}%`);
                    console.log(`[DeepResearchAgent] 📊 DataBus数据量：${this.dataBus.size} 个条目`);
                    console.log(`[DeepResearchAgent] 🚀 资料已充足，将由 ${this.reportModel} 模型生成最终报告`);
                    console.log(`[DeepResearchAgent] 🔄 结束研究循环（${iterations}/${this.maxIterations}轮）`);
    
                // 🚨 关键修改：不保存 finalAnswerFromIteration，让它保持为 null
                // 🚨 这样就会自然进入 else 分支，调用 _generateFinalReport
    
                // 可选：记录Agent的思考（仅供调试）
                if (parsedAction.thought) {
                    console.log(`[DeepResearchAgent] 🤖 Agent思考摘要：${parsedAction.thought.substring(0, 100)}...`);
                }
    
                break; // 跳出循环，进入统一报告流程
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
                    const { rawObservation, toolSources, toolSuccess, updatedThought } = await this._executeToolWithKnowledge(
                        tool_name,
                        parameters,
                        thought,
                        this.intermediateSteps,
                        detectedMode,
                        recordToolCall
                    );
                    
                    // 🎯 新增：将原始数据存储到数据总线（传递工具来源）
                    if (toolSuccess) {
                        // 统一 DataBus 存储索引为 1-based (与 code_generator 一致)
                        this._storeRawData(this.intermediateSteps.length + 1, rawObservation, {
                            toolName: tool_name,
                            contentType: tool_name === 'crawl4ai' ? 'webpage' : 'text'
                        }, toolSources); // 🔥 新增：传递工具来源
                    }

                    // ✅✅✅ --- 核心修复：传入工具名称以应用不同的摘要策略 --- ✅✅✅
                    const summarizedObservation = await this._smartSummarizeObservation(internalTopic, rawObservation, detectedMode, tool_name);
                    
                    // ✨ 评估信息增益 - 使用新的多维度计算方法
                    const currentInfoGain = this._calculateInformationGain(summarizedObservation, this.intermediateSteps);
                    this.metrics.informationGain.push(currentInfoGain);
                    
                    if (currentInfoGain < 0.07) { // 信息增益阈值
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
                            // 🎯 核心修复：使用从 _executeToolWithKnowledge 返回的 updatedThought
                            thought: updatedThought || thought || `执行工具 ${tool_name} 来获取更多信息。`
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
                    
                    if (completionRate > 0.9 && consecutiveNoGain >= 1) {
                        console.log(`[DeepResearchAgent] 计划完成度${completionRate}%，提前终止`);
                        break;
                    }
                
                }

            } catch (error) {
                // 🎯 捕获解析错误 (OutputParser.parse 抛出的错误)
                if (this._isParserError(error)) {
                    this.lastParserError = error; // 🆕 保存错误对象
                    
                    // 🎯 新增：重复URL错误修正提示
                    if (error.message.includes('[DUPLICATE_URL_ERROR]')) {
                        const correctionPrompt = `
## 🚨 紧急修正指令 (URGENT CORRECTION)
**系统检测到你上次的行动尝试抓取一个重复或高度相似的 URL。**
**错误信息**: ${error.message}

**强制修正要求**:
1.  **必须**立即更换为**新的、未访问过的** URL。
2.  **或者**，如果所有相关 URL 都已访问，请立即采取 \`final_answer\` 或 \`generate_outline\` 行动，或转向研究计划中的**下一个子问题**。
3.  **请重新生成**完整的"思考"和"行动"/"最终答案"块，并确保行动是有效的。
`;
                        // 注入修正提示，并强制重试
                        this.lastDecisionText = correctionPrompt; // 伪造上次输出，用于生成修正提示
                        parserErrorOccurred = true; // 设置标志，防止下次循环增加 iterations
                        this.parserRetryAttempt = 1; // 强制进入修正流程
                        console.warn(`[DeepResearchAgent] ⚠️ 拦截到重复URL，触发 L1 智能重定向`);
                        continue; // 跳过当前迭代的其余逻辑，进入下一次循环（不增加 iterations）
                    }
                    
                    // 原始的解析错误重试逻辑
                    if (this.parserRetryAttempt < 1) { // 允许一次重试
                        parserErrorOccurred = true; // 设置标志，防止下次循环增加 iterations
                        this.parserRetryAttempt++;
                        console.warn(`[DeepResearchAgent] ⚠️ 致命解析错误，触发 L1 智能重试 (${this.parserRetryAttempt}/1)`);
                        continue; // 跳过当前迭代的其余逻辑，进入下一次循环（不增加 iterations）
                    }
                    
                    // 达到最大重试次数，降级为内部错误处理
                    console.error('[DeepResearchAgent] ❌ 致命解析错误，重试失败，降级为内部错误');
                }
                
                // 🎯 原始的全局错误处理逻辑 (包括速率限制和降级处理)
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
                if (!parserErrorOccurred) {
                    consecutiveNoGain++;
                }
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
            
            // 🎯 数据挖掘模式：使用专用报告生成
            if (isDataMiningMode && this.dataMiningEngine) {
                console.log('[DeepResearchAgent] 使用DataMiningEngine生成数据挖掘报告');
                
                // 获取数据挖掘提示词片段
                const dataMiningTemplate = getTemplateByResearchMode('data_mining');
                const promptFragment = getTemplatePromptFragment('data_mining');

                // 🔧 修复：调试日志，确认配置一致性
                console.log('[DeepResearchAgent] 数据挖掘引擎配置:', {
                minDataTables: this.dataMiningEngine.config.minDataTables,
                maxIterations: this.dataMiningEngine.config.maxIterations,
                qualityThreshold: this.dataMiningEngine.config.dataQualityThreshold
              });
              
                // 构建数据挖掘专用提示词
                const dataMiningPrompt = this.dataMiningEngine.buildDataMiningPrompt(
                    uiTopic,
                    this.intermediateSteps,
                    researchPlan,
                    uniqueSources,
                    originalUserInstruction,
                    dataMiningTemplate, // ✅ 传递模板，不是 null
                    promptFragment,
                    this.dataBus  // 🔥 新增：传递 dataBus
                );
                
                try {
                    const reportResponse = await this.chatApiHandler.completeChat({
                        messages: [{ role: 'user', content: dataMiningPrompt }],
                        model: this.reportModel || 'deepseek-reasoner',
                        temperature: 0.1, // 低温确保数据准确性
                    });
                    
                    finalReport = reportResponse?.choices?.[0]?.message?.content ||
                        this.dataMiningEngine.generateDataTablesFallback(this.intermediateSteps, uniqueSources);
                    
                    console.log('[DeepResearchAgent] ✅ 数据挖掘报告生成成功');
                } catch (error) {
                    console.error('[DeepResearchAgent] ❌ 数据挖掘报告生成失败:', error);
                    finalReport = this.dataMiningEngine.generateDataTablesFallback(this.intermediateSteps, uniqueSources);
                }
            } else {
                // 其他模式使用原有报告生成
                finalReport = await this._generateFinalReport(uiTopic, this.intermediateSteps, researchPlan, uniqueSources, detectedMode, originalUserInstruction);
            }
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
// 截断模型自行生成的"资料来源"部分，防止与系统生成的重复或格式不统一
const sourceKeywords = ["资料来源", "参考文献", "Sources", "References", "参考资料清单"];
let cleanedReport = finalReport;

for (const keyword of sourceKeywords) {
    const regex = new RegExp(`(##|###)\\s*${keyword}`, "i");
    const match = cleanedReport.match(regex);
    if (match) {
        console.warn(`[DeepResearchAgent] ⚠️ 检测到模型自行生成的"${keyword}"章节，正在执行自动清理...`);
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
            console.warn(`[DeepResearchAgent] ⚠️ 发现"遗失"的图片 ${imageId}，强制追加占位符。`);
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

// ===========================================================================
// 🆕 新增：6. 完全独立的文中引用映射表 (Independent Citation Mapping Table)
// 目标：直接从报告中提取引用标记，从 uniqueSources 中找到对应来源
// 与参考文献完全独立，不进行任何筛选或交叉引用
// ===========================================================================

console.log('[DeepResearchAgent] 构建独立文中引用映射表...');

// 🚀 调用基于 uniqueSources 的文中引用映射系统
const independentCitationSection = await this._generateIndependentCitationMapping(cleanedReport, uniqueSources);

if (independentCitationSection) {
    cleanedReport += independentCitationSection;
    console.log('[DeepResearchAgent] ✅ 独立文中引用映射表已附加');
} else {
    console.log('[DeepResearchAgent] ℹ️ 未检测到文中引用，跳过映射表生成');
}

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
            temporal_quality: temporalQualityReport, // 包含完整时效性质量报告
            model: this.reportModel // 🎯 修复：添加实际使用的模型名称
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
    async _generateFinalReport(topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction) {
        console.log('[DeepResearchAgent] ==================== 报告生成阶段开始 ====================');
        console.log(`[DeepResearchAgent] 🎯 报告生成配置:`);
        console.log(`  • 主题: ${topic}`);
        console.log(`  • 研究模式: ${researchMode}`);
        console.log(`  • 写作模型: ${this.reportModel || 'deepseek-reasoner'}`);
        console.log(`  • 来源数量: ${sources.length}`);
        console.log(`  • 证据步骤: ${intermediateSteps.length}`);
        console.log(`  • 原始指令长度: ${originalUserInstruction?.length || 0}`);
        console.log(`[DeepResearchAgent] 📊 中间步骤概览:`);
    
    intermediateSteps.forEach((step, index) => {
        if (step.action?.tool_name) {
            console.log(`  步骤 ${index + 1}: ${step.action.tool_name} - ${step.key_finding?.substring(0, 50) || '无关键发现'}`);
        }
    });

        // 1. 构建纯净的证据集合
        const evidenceCollection = this._buildEvidenceCollection(intermediateSteps, plan, researchMode);
        
        console.log('[DeepResearchAgent] 📦 数据准备完成:');
        console.log(`  • 有效证据: ${evidenceCollection.validEvidenceSteps}个`);
        console.log(`  • 关键发现: ${evidenceCollection.keyFindings.length}个`);
        console.log(`  • 总长度: ${evidenceCollection.totalLength}字符`);

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
            console.log(`  • 模板: 动态结构 (${researchMode}模式)`);
            console.log(`  • 要求: ${reportTemplate.config.requirements.substring(0, 100)}...`);
            
            finalPrompt = `
# 🚫 绝对禁止开场白协议
**禁止生成任何形式的"好的，遵命"、"作为一名专业的"等确认语句**
**必须直接从报告标题开始输出纯净内容**

# 角色：首席研究分析师

## 🔥 最高优先级指令：引用标记 🔥
**你必须使用 [数字] 格式在文中标注引用，否则报告无效！**

### 📍 引用规则：
1. **每使用一个来源的信息**，就必须在句子末尾标注对应编号
2. **格式**：必须使用方括号包裹数字，如 [1]、[2]、[3]
3. **位置**：放在句子末尾，句号之前
4. **多个引用**：用逗号分隔，如 [1, 2, 3]

### ✅ 通用示例（正确的格式）：
- 研究表明，这一趋势将在未来三年内持续增长 [1]。
- 根据多个来源的分析，该技术具有显著优势 [2, 3, 5]。
- 数据对比显示，新方法比传统方法效率提升了约40% [4, 7]。

### ❌ 错误格式（禁止使用）：
- 研究表明[1]这一趋势...
- 来源1显示...
- 根据ref2...
- [1号来源]认为...

**记住：引用标记必须在句子末尾，方括号内只能是数字！**

# 任务：基于提供的证据和资料来源，撰写一份高质量、结构化、体现深度思考的学术级研究报告。

# 最终研究主题: "${topic}"

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何结构、提纲或格式要求。**
\`\`\`
${originalUserInstruction}
\`\`\`

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
${entry.hasStructuredData ? `\n\n**🗃️ 本步骤包含结构化数据，必须用表格呈现**\n${entry.structuredData}` : ''}
${entry.keyFinding ? `\n**💡 本步关键发现:** ${entry.keyFinding}` : ''}
`).join('\n\n')}

# 4. 你的报告撰写指令 (输出要求)
现在，请严格遵循以下元结构和要求，将上述研究证据整合成一份最终报告。
${promptFragment}


**🚫 绝对禁止:**
- 编造研究计划和证据集合中不存在的信息。
- 在报告中提及"思考"、"行动"、"工具调用"等研究过程细节。
- 手动生成"资料来源"章节。

**✅ 核心要求:**
- **自主生成标题:** 基于主题和核心发现，为报告创建一个精准的标题。
- **章节结构 (最高指示):**
  - **如果**【原始用户指令】中包含明确的"Outline"或"提纲"，**必须**使用该提纲中的**精确文字**作为报告的章节标题（## 和 ###）。
  - **否则**（用户未指定提纲），则将研究计划中的每一个 "sub_question" 直接转化为报告的一个核心章节标题。
- **内容填充:** 用对应研究步骤的详细证据数据来填充该章节。
- **引用来源 (强制)**: **必须**严格使用 **[x]** 编号格式引用【资料来源索引】中的来源。
- **结构化数据优先:** 如果证据包含结构化数据，优先以表格形式呈现。
- **纯净内容**：从报告标题开始输出纯净内容，不包含任何确认语句。

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

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何结构、提纲或格式要求。**
\`\`\`
${originalUserInstruction}
\`\`\`

# 📚 资料来源索引 (必须引用)
${numberedSourcesText}

# 已收集的关键信息摘要
${allObservations.substring(0, 15000)}

${promptFragment}


# 🎯 最终输出要求 (用户强制协议)
1. **直接开始**：从报告标题开始输出纯净内容
2. **严格结构**：如果用户在提示词中已给定提纲，则完全遵循用户指令中的章节结构
3. **纯净内容**：只包含报告正文，不包含任何确认语句
4. **学术引用**：严格按照引用规范标注来源
5. **结构化数据优先:** 如果证据包含结构化数据，优先以表格形式呈现。

# 现在立即开始报告正文：
`;
        }
        
        // 🎯 位置4：在这里插入日志 - 在 finalPrompt 变量已经赋值之后
        console.log('[DeepResearchAgent] 📤 给写作模型的指令摘要:');
        const lines = finalPrompt.split('\n');
        // 只打印重要的指令部分
        const importantLines = lines.filter(line => 
            line.includes('# ') || 
            line.includes('要求') || 
            line.includes('必须') ||
            line.includes('禁止')
        ).slice(0, 10); // 限制数量

        importantLines.forEach(line => {
            console.log(`  ${line}`);
        });

        console.log(`[DeepResearchAgent] 📏 提示词长度: ${finalPrompt.length}字符 (~${Math.ceil(finalPrompt.length/4)} tokens)`);
        
        console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
        
        // 🚀 新增：基础重试机制
        const maxRetries = 2;
        const retryDelay = 2000; // 2秒延迟

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const reportResponse = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: finalPrompt }],
                    model: this.reportModel || 'deepseek-reasoner', // 🔥 使用用户选择的模型
                    temperature: 0.3,
                });
                // 🎯 位置6：收到响应后 - 在这里插入
                console.log(`[DeepResearchAgent] 📥 收到写作模型响应 (尝试${attempt + 1}):`);
        
                if (reportResponse?.usage) {
                    console.log(`  • Token消耗: ${reportResponse.usage.total_tokens}`);
                    console.log(`  • 上行: ${reportResponse.usage.prompt_tokens}`);
                    console.log(`  • 下行: ${reportResponse.usage.completion_tokens}`);
                }
                this._updateTokenUsage(reportResponse.usage);

                let finalReport = reportResponse?.choices?.[0]?.message?.content ||
                    this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
                // 🎯 继续分析报告内容
                console.log(`[DeepResearchAgent] 📄 生成的报告:`);
                console.log(`  • 长度: ${finalReport.length}字符`);
                // 简单分析报告结构
                const sections = (finalReport.match(/^#{2,3}\s+.+/gm) || []).length;
                const citations = (finalReport.match(/\[\d+\]/g) || []).length;
        
                console.log(`  • 章节数: ${sections}`);
                console.log(`  • 引用数: ${citations}`);
                console.log(`[DeepResearchAgent] ✅ 报告生成成功 (尝试 ${attempt + 1}/${maxRetries + 1})，模式: ${researchMode}`);
                return finalReport;

            } catch (error) {
                console.error(`[DeepResearchAgent] ❌ 报告生成失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error && error.message ? error.message : error);

                // 如果是最后一次尝试，使用降级方案
                if (attempt === maxRetries) {
                    console.error('[DeepResearchAgent] 🚨 所有重试尝试均失败，使用降级报告');
                    return this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
                }

                // 等待后重试
                console.log(`[DeepResearchAgent] ⏳ 等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    // 🎯 【优化版】构建证据集合方法 - 全面利用DataBus原始数据
/**
 * @description 从中间步骤和DataBus中提取最佳证据数据，完整呈现给最终写作模型
 * @param {Array} intermediateSteps - 原始中间步骤
 * @param {Object} plan - 研究计划
 * @param {string} researchMode - 当前研究模式（新增参数）
 * @returns {Object} - 增强的证据集合
 */
_buildEvidenceCollection(intermediateSteps, plan, researchMode = 'standard') {
    const evidenceEntries = [];
    const keyFindings = [];
    let totalLength = 0;
    let dataUtilizationStats = { originalChars: 0, evidenceChars: 0, stepsWithDataBus: 0 };

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

        // 🎯 【核心优化】智能数据选择策略
        const dataBusKey = `step_${index + 1}`;
        const dataBusEntry = this.dataBus.get(dataBusKey);
        let finalEvidence = cleanEvidence;
        let structuredData = null;
        let dataSourceType = 'step_observation'; // 默认使用步骤观察结果
    
        console.log(`[EvidenceCollection] 步骤${index+1}: 检查DataBus键 "${dataBusKey}"`);
    
        if (dataBusEntry && dataBusEntry.originalData) {
            const originalData = dataBusEntry.originalData;
            const contentType = dataBusEntry.metadata?.contentType || 'unknown';
            const toolName = dataBusEntry.metadata?.toolName || step.action?.tool_name;
        
            console.log(`[EvidenceCollection] DataBus条目:`, {
                hasOriginalData: true,
                contentType,
                toolName,
                originalLength: originalData.length,
                observationLength: step.observation.length
            });
        
            dataUtilizationStats.originalChars += originalData.length;
            dataUtilizationStats.stepsWithDataBus++;
        
            // 🎯 智能数据策略选择
            const dataStrategy = this._selectDataStrategy(
                contentType,
                originalData.length,
                researchMode,
                toolName,
                step.success
            );
        
            console.log(`[EvidenceCollection] 数据策略: ${dataStrategy} (${contentType}, ${originalData.length} chars)`);
        
            switch(dataStrategy) {
                case 'full_original':
                    // 🔥 直接使用完整原始数据（适合中等长度、关键信息）
                    if (originalData.length < 15000) {
                        finalEvidence = this._cleanObservation(originalData);
                        dataSourceType = 'data_bus_full';
                        
                        // 🎯 新增：如果是结构化数据，添加智能处理
                        if (this._isStructuredData(originalData)) {
                            const enhancedStructure = this._enhanceStructuredData(originalData, true);
                            if (enhancedStructure) {
                                structuredData = enhancedStructure.structuredData;
                                if (enhancedStructure.enhancedEvidence) {
                                    finalEvidence = enhancedStructure.enhancedEvidence;
                                }
                                dataSourceType = 'data_bus_full_enhanced';
                            }
                        }
                    } else {
                        // 过长数据使用增强摘要
                        finalEvidence = this._createEnhancedSummary(
                            originalData,
                            cleanEvidence,
                            { toolName, contentType }
                        );
                        dataSourceType = 'data_bus_enhanced';
                    }
                    break;
                
                case 'enhanced_summary':
                    // 🔥 创建增强摘要（添加原始数据关键信息）
                    finalEvidence = this._createEnhancedSummary(
                        originalData,
                        cleanEvidence,
                        { toolName, contentType }
                    );
                    dataSourceType = 'data_bus_enhanced';
                    break;
                
                case 'structured_only':
                    // 🎯 【核心修改】增强的结构化数据处理
                    if (this._isStructuredData(originalData)) {
                        const enhancedStructure = this._enhanceStructuredData(originalData, false);
                        if (enhancedStructure) {
                            finalEvidence = enhancedStructure.enhancedEvidence || cleanEvidence;
                            structuredData = enhancedStructure.structuredData;
                            dataSourceType = 'data_bus_structured_enhanced';
                        } else {
                            // 降级处理
                            finalEvidence = this._cleanObservation(originalData);
                            dataSourceType = 'data_bus_fallback';
                        }
                    }
                    break;
                
                case 'hybrid':
                    // 🔥 混合模式：保留摘要，添加关键数据片段
                    finalEvidence = this._createHybridEvidence(
                        originalData,
                        cleanEvidence,
                        { toolName, contentType }
                    );
                    dataSourceType = 'data_bus_hybrid';
                    break;
                
                default:
                    // 使用原始观察结果
                    finalEvidence = cleanEvidence;
                    dataSourceType = 'step_observation';
            }
        } else if (dataBusEntry) {
            console.log(`[EvidenceCollection] DataBus条目无originalData，使用processedData`);
            // 如果没有originalData，但至少有processedData
            const processedData = dataBusEntry.rawData;
            if (processedData && processedData.length > cleanEvidence.length * 1.5) {
                // 如果DataBus中的处理数据比摘要长很多，使用它
                finalEvidence = this._cleanObservation(processedData);
                dataSourceType = 'data_bus_processed';
            }
        }
    
        // 🎯 如果最终证据还是原始摘要且很短，尝试从DataBus提取关键信息补充
        if (finalEvidence === cleanEvidence && cleanEvidence.length < 500 && dataBusEntry?.originalData) {
            const criticalData = this._extractCriticalData(dataBusEntry.originalData, 2);
            if (criticalData) {
                finalEvidence += `\n\n📈 **补充关键信息**：\n${criticalData}`;
                dataSourceType = 'data_bus_supplemented';
            }
        }
    
        // 🎯 【修改】移除压缩逻辑，完全信任现代大模型的上下文窗口
        // 不进行压缩，仅优化格式呈现
        finalEvidence = this._optimizePresentation(finalEvidence, researchMode);
    
        dataUtilizationStats.evidenceChars += finalEvidence.length;
    
        // 🎯 提取年份信息（仅用于排序，不用于质量判定）
        const year = this._extractYear(finalEvidence);

        // 🎯 构建增强的证据条目
        const evidenceEntry = {
            stepIndex: index + 1,
            subQuestion: subQuestion,
            evidence: finalEvidence,
            structuredData: structuredData,
            hasStructuredData: !!structuredData,
            keyFinding: step.key_finding,
            tool: step.action?.tool_name,
            originalLength: step.observation.length,
            enhancedLength: finalEvidence.length,
            dataSourceType: dataSourceType,
            dataBusKey: dataBusEntry ? dataBusKey : null,
            // 🎯 仅保留年份用于排序
            year: year
        };

        evidenceEntries.push(evidenceEntry);
        totalLength += finalEvidence.length;

        // 🎯 收集关键发现
        if (step.key_finding &&
            step.key_finding !== '未能提取关键发现。' &&
            step.key_finding !== '关键发现提取异常。') {
            keyFindings.push(step.key_finding);
        }
    });

    // 🎯 【最终优化】排序逻辑：按研究步骤顺序排序
    // 保持研究逻辑连贯性，便于模型对应章节
    evidenceEntries.sort((a, b) => a.stepIndex - b.stepIndex);
    // 🎯 可选：在控制台输出排序信息
    console.log(`[EvidenceCollection] 证据已按步骤顺序排序: 步骤 ${evidenceEntries[0]?.stepIndex} → 步骤 ${evidenceEntries[evidenceEntries.length-1]?.stepIndex}`);

    // 🎯 数据利用率统计
    const utilizationRate = dataUtilizationStats.originalChars > 0 ? 
        (dataUtilizationStats.evidenceChars / dataUtilizationStats.originalChars) : 0;

    console.log(`[EvidenceCollection] 数据利用率统计:`, {
        stepsWithDataBus: dataUtilizationStats.stepsWithDataBus,
        originalChars: dataUtilizationStats.originalChars,
        evidenceChars: dataUtilizationStats.evidenceChars,
        utilizationRate: `${(utilizationRate * 100).toFixed(1)}%`,
        avgEnhancement: evidenceEntries.length > 0 ? 
            (totalLength / evidenceEntries.map(e => e.originalLength).reduce((a, b) => a + b, 1)).toFixed(2) : 'N/A',
        totalEvidenceChars: totalLength,
        estimatedTokens: Math.ceil(totalLength / 3), // 粗略估算token数
        researchMode: researchMode,
        // 🎯 新增：上下文窗口使用情况
        contextWindowUsage: `${(Math.ceil(totalLength / 3) / 128000 * 100).toFixed(2)}% of 128K`,
        recommendation: totalLength < 100000 ? '✅ 内容长度在安全范围内' : '⚠️ 内容较长，但仍在128K窗口内'
    });

    return {
        evidenceEntries,
        keyFindings: [...new Set(keyFindings)],
        totalLength,
        totalSteps: intermediateSteps.length,
        validEvidenceSteps: evidenceEntries.length,
        hasStructuredData: evidenceEntries.some(e => e.hasStructuredData),
        // 🆕 新增：数据利用统计
        dataUtilization: {
            stepsWithDataBus: dataUtilizationStats.stepsWithDataBus,
            utilizationRate,
            evidenceEnhancementRatio: evidenceEntries.length > 0 ? 
                totalLength / evidenceEntries.map(e => e.originalLength).reduce((a, b) => a + b, 1) : 1
        },
        // 🎯 新增：上下文窗口信息
        contextWindowInfo: {
            totalTokens: Math.ceil(totalLength / 3),
            windowSize: 128000,
            usagePercentage: (Math.ceil(totalLength / 3) / 128000 * 100).toFixed(2)
        }
    };
}

// 🎯 新增：增强结构化数据处理（核心方法）
/**
 * @description 对结构化数据进行智能增强处理
 * @param {string} originalData - 原始数据
 * @param {boolean} isFullOriginal - 是否来自full_original策略
 * @returns {Object|null} - 增强的结构化数据对象
 */
_enhanceStructuredData(originalData, isFullOriginal = false) {
    try {
        const parsedData = JSON.parse(originalData);
        
        // 🎯 情况1：JSON数组（如数据表）
        if (Array.isArray(parsedData) && parsedData.length > 0) {
            // 1. 转换为主表格
            const table = this._jsonToMarkdownTable(parsedData);
            
            // 2. 添加数组元数据
            const metaInfo = this._generateArrayMetadata(parsedData);
            
            // 3. 构建增强的证据
            let enhancedEvidence = `${metaInfo}\n${table}`;
            
            // 4. 添加原始JSON预览
            if (originalData.length < 5000 || isFullOriginal) {
                enhancedEvidence += `\n\n🔍 **完整数据结构**:\n\`\`\`json\n${originalData}\n\`\`\``;
            } else {
                const jsonPreview = originalData.substring(0, 2000) + 
                    `\n... (完整数据 ${originalData.length} 字符)`;
                enhancedEvidence += `\n\n🔍 **数据结构预览**:\n\`\`\`json\n${jsonPreview}\n\`\`\``;
            }
            
            return {
                structuredData: table,
                enhancedEvidence: enhancedEvidence,
                dataType: 'array',
                itemCount: parsedData.length
            };
        } 
        // 🎯 情况2：复杂JSON对象（如报告、配置）
        else if (typeof parsedData === 'object' && parsedData !== null) {
            // 1. 提取关键字段表格
            const keyFields = this._extractKeyFields(parsedData, 10);
            const keyValueTable = this._objectToKeyValueTable(parsedData, keyFields);
            
            // 2. 生成对象摘要
            const objectSummary = this._generateObjectSummary(parsedData);
            
            // 3. 构建增强的证据
            let enhancedEvidence = `${objectSummary}\n${keyValueTable}`;
            
            // 4. 保留原始JSON
            if (originalData.length < 8000 || isFullOriginal) {
                enhancedEvidence += `\n\n🔍 **完整JSON**:\n\`\`\`json\n${originalData}\n\`\`\``;
            } else {
                const smartPreview = this._createSmartJsonPreview(originalData, parsedData);
                enhancedEvidence += `\n\n🔍 **JSON智能预览**:\n\`\`\`json\n${smartPreview}\n\`\`\``;
            }
            
            return {
                structuredData: keyValueTable,
                enhancedEvidence: enhancedEvidence,
                dataType: 'object',
                fieldCount: Object.keys(parsedData).length
            };
        }
        // 🎯 情况3：简单值
        else {
            return {
                structuredData: null,
                enhancedEvidence: `📋 **简单数据**: ${JSON.stringify(parsedData, null, 2)}`,
                dataType: 'simple'
            };
        }
        
    } catch (e) {
        console.warn(`[增强结构化] JSON解析失败，尝试非JSON结构化提取:`, e.message);
        
        // 🎯 降级：尝试提取非JSON结构化数据
        const extractedStructure = this._extractNonJsonStructuredData(originalData);
        if (extractedStructure) {
            return {
                structuredData: extractedStructure,
                enhancedEvidence: `📊 **提取的结构化内容**:\n${extractedStructure}`,
                dataType: 'non_json'
            };
        }
        
        return null;
    }
}

// 🎯 新增：生成数组元数据
_generateArrayMetadata(parsedArray) {
    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
        return '';
    }
    
    const itemCount = parsedArray.length;
    const sampleItem = parsedArray[0];
    const fieldCount = Object.keys(sampleItem).length;
    const fieldNames = Object.keys(sampleItem).join(', ');
    
    // 计算数值字段统计
    let numericStats = '';
    const numericFields = Object.keys(sampleItem).filter(key => {
        const value = sampleItem[key];
        return typeof value === 'number' && !isNaN(value);
    });
    
    if (numericFields.length > 0) {
        numericStats = `\n📈 **数值字段**: ${numericFields.join(', ')}`;
    }
    
    return `📊 **数据统计**：
• **记录数**: ${itemCount} 条
• **字段数**: ${fieldCount} 个
• **字段名**: ${fieldNames}
${numericStats}`;
}

// 🎯 新增：提取关键字段
_extractKeyFields(obj, maxFields = 10) {
    if (typeof obj !== 'object' || obj === null) return [];
    
    const allKeys = Object.keys(obj);
    
    // 优先选择重要字段
    const priorityKeywords = ['name', 'title', 'value', 'data', 'result', 'score', 
                             'accuracy', 'performance', 'summary', 'conclusion'];
    
    // 评分每个字段
    const scoredKeys = allKeys.map(key => {
        let score = 0;
        
        // 关键词匹配
        if (priorityKeywords.includes(key.toLowerCase())) score += 3;
        
        // 字段值类型
        const value = obj[key];
        if (typeof value === 'number') score += 2;
        if (typeof value === 'string' && value.length > 0) score += 1;
        if (Array.isArray(value)) score += 1;
        if (typeof value === 'object' && value !== null) score -= 1; // 嵌套对象降低优先级
        
        // 字段名长度（适中最好）
        if (key.length >= 3 && key.length <= 20) score += 1;
        
        return { key, score };
    });
    
    // 按分数排序并选择
    return scoredKeys
        .sort((a, b) => b.score - a.score)
        .slice(0, maxFields)
        .map(item => item.key);
}

// 🎯 新增：对象转键值对表格
_objectToKeyValueTable(obj, fields) {
    if (!fields || fields.length === 0) {
        fields = Object.keys(obj).slice(0, 15); // 限制数量
    }
    
    let table = `| 字段 | 值 | 类型 |\n|---|---|---|\n`;
    
    fields.forEach(key => {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            let displayValue;
            let valueType = typeof value;
            
            // 智能格式化显示值
            if (value === null) {
                displayValue = 'null';
            } else if (value === undefined) {
                displayValue = 'undefined';
            } else if (Array.isArray(value)) {
                displayValue = `数组[${value.length}]`;
                valueType = 'array';
            } else if (typeof value === 'object') {
                displayValue = `对象{${Object.keys(value).length}个字段}`;
                valueType = 'object';
            } else if (typeof value === 'string') {
                // 字符串截断
                displayValue = value.length > 50 ? 
                    value.substring(0, 50) + '...' : value;
                displayValue = displayValue.replace(/\n/g, ' ');
            } else if (typeof value === 'number') {
                // 数字格式化
                displayValue = value.toLocaleString();
            } else {
                displayValue = String(value);
            }
            
            table += `| ${key} | ${displayValue} | ${valueType} |\n`;
        }
    });
    
    return `\n## 📋 关键字段详情\n\n${table}\n`;
}

// 🎯 新增：生成对象摘要
_generateObjectSummary(obj) {
    if (typeof obj !== 'object' || obj === null) return '';
    
    const keys = Object.keys(obj);
    const totalFields = keys.length;
    
    // 统计字段类型
    const typeStats = {};
    keys.forEach(key => {
        const value = obj[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        typeStats[type] = (typeStats[type] || 0) + 1;
    });
    
    // 提取关键信息
    let summary = `**对象结构分析**:\n`;
    summary += `• **总字段数**: ${totalFields}\n`;
    
    Object.entries(typeStats).forEach(([type, count]) => {
        summary += `• **${type}类型**: ${count} 个\n`;
    });
    
    // 特别标注重要字段
    const importantFields = ['type', 'title', 'name', 'result', 'conclusion', 'summary'];
    const foundImportant = keys.filter(key => 
        importantFields.includes(key.toLowerCase())
    );
    
    if (foundImportant.length > 0) {
        summary += `\n**关键字段**: ${foundImportant.join(', ')}\n`;
        
        // 显示关键字段的值
        foundImportant.forEach(key => {
            const value = obj[key];
            if (value !== undefined && value !== null) {
                const displayValue = typeof value === 'string' ? 
                    (value.length > 100 ? value.substring(0, 100) + '...' : value) :
                    JSON.stringify(value);
                summary += `  - **${key}**: ${displayValue}\n`;
            }
        });
    }
    
    return summary;
}

// 🎯 新增：创建智能JSON预览
_createSmartJsonPreview(jsonString, parsedData) {
    if (jsonString.length <= 3000) {
        return jsonString; // 短数据完整显示
    }
    
    // 智能截取策略
    let preview = '';
    
    // 1. 开头部分（前800字符）
    preview += jsonString.substring(0, 800);
    
    // 2. 寻找并添加关键部分
    if (typeof parsedData === 'object') {
        // 尝试提取关键字段的内容
        const keyFields = this._extractKeyFields(parsedData, 5);
        keyFields.forEach(field => {
            if (parsedData[field] && typeof parsedData[field] === 'string') {
                const fieldValue = String(parsedData[field]);
                const fieldJson = `"${field}": "${fieldValue.substring(0, 100)}"`;
                if (!preview.includes(fieldJson)) {
                    preview += `\n  ${fieldJson},`;
                }
            }
        });
    }
    
    // 3. 结尾部分（后500字符）
    preview += `\n  ...\n`;
    preview += jsonString.substring(jsonString.length - 500);
    
    // 4. 添加统计信息
    preview += `\n\n// 📊 JSON统计: 总${jsonString.length}字符，已显示${preview.length}字符`;
    
    return preview;
}

// 🎯 新增：提取非JSON结构化数据
_extractNonJsonStructuredData(text) {
    if (!text || typeof text !== 'string') return null;
    
    const extracted = [];
    
    // 1. 提取Markdown表格
    const mdTables = text.match(/\|[^\n]+\|[^\n]*\|\n\|[-: ]+\|[-: ]+\|\n(\|[^\n]+\|[^\n]*\|\n?)+/g);
    if (mdTables) {
        extracted.push(...mdTables.slice(0, 3).map((table, i) => 
            `### Markdown表格 ${i+1}\n${table}`
        ));
    }
    
    // 2. 提取列表
    const lists = text.match(/(?:^|\n)(?:\s*[-*+]\s+.*|\s*\d+\.\s+.*)(?:\n\s*(?:[-*+]|\d+\.)\s+.*)*/gm);
    if (lists) {
        const significantLists = lists.filter(list => 
            list.split('\n').length >= 3 && list.length > 50
        ).slice(0, 2);
        
        if (significantLists.length > 0) {
            extracted.push(...significantLists.map((list, i) => 
                `### 列表 ${i+1}\n${list}`
            ));
        }
    }
    
    // 3. 提取代码块
    const codeBlocks = text.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
        extracted.push(...codeBlocks.slice(0, 2).map((code, i) => 
            `### 代码块 ${i+1}\n${code}`
        ));
    }
    
    if (extracted.length === 0) return null;
    
    return `\n## 📋 提取的结构化内容\n\n${extracted.join('\n\n')}\n`;
}

// 🎯 新增：优化呈现方法（仅格式优化，不压缩内容）
/**
 * @description 优化证据呈现格式，不压缩内容，仅进行格式整理
 * @param {string} evidence - 原始证据文本
 * @param {string} researchMode - 研究模式
 * @returns {string} - 优化格式后的证据文本
 */
_optimizePresentation(evidence, researchMode) {
    if (!evidence || typeof evidence !== 'string') {
        return evidence || '';
    }
    
    let optimized = evidence;
    
    // 🎯 1. 标准化格式（不丢失任何信息）
    const formatOptimizations = [
        // 标准化空行（3个以上→2个，提高可读性但不丢失信息）
        [/\n{3,}/g, '\n\n'],
        [/\r\n{3,}/g, '\n\n'],
        
        // 修复常见的Markdown格式问题
        [/\*\*(.+?)\*\*\s*\*\*(.+?)\*\*/g, '**$1 $2**'], // 合并相邻加粗
        [/\n\s*\n(\s*[-*+]\s)/g, '\n$1'], // 修复列表前的过多空行
        [/(#{1,6})\s{2,}(.+)/g, '$1 $2'], // 修复标题后的多余空格
    ];
    
    formatOptimizations.forEach(([pattern, replacement]) => {
        optimized = optimized.replace(pattern, replacement);
    });
    
    // 🎯 2. 保护结构化数据完整性
    // 确保表格不被格式优化破坏
    const tableRegex = /\|[^\n]+\|[^\n]*\|\n\|[-: ]+\|[-: ]+\|\n(\|[^\n]+\|[^\n]*\|\n?)+/g;
    const tables = optimized.match(tableRegex) || [];
    
    // 对每个表格进行检查和修复
    tables.forEach(table => {
        const rows = table.split('\n').filter(row => row.trim());
        if (rows.length >= 3) { // 至少表头、分隔线、一行数据
            // 确保表格格式正确
            const fixedTable = rows.join('\n');
            // 用修复后的表格替换原表格
            optimized = optimized.replace(table, fixedTable);
        }
    });
    
    // 🎯 3. 添加信息性标记（仅用于调试和理解，不影响内容）
    const length = optimized.length;
    const lineCount = (optimized.match(/\n/g) || []).length + 1;
    const tableCount = (optimized.match(/\|[^\n]+\|/g) || []).length > 0 ? 
        (optimized.match(/\|[^\n]+\|\n\|[-: ]+\|/g) || []).length : 0;
    
    // 仅对较长内容添加统计信息
    if (length > 5000) {
        const statsInfo = `\n\n---\n📊 **本段证据统计**：共${length}字符，${lineCount}行`;
        if (tableCount > 0) {
            statsInfo += `，包含${tableCount}个数据表格`;
        }
        optimized += statsInfo;
    }
    
    console.log(`[EvidenceOptimize] 格式优化完成: ${evidence.length} → ${optimized.length} 字符 (${researchMode}模式)`);
    
    return optimized;
}

// 🎯 新增：智能数据策略选择方法
/**
 * @description 根据数据类型、长度和研究模式选择最佳数据使用策略
 * 目标：为最终写作模型选择最合适的数据呈现形式
 */
_selectDataStrategy(contentType, dataLength, researchMode, toolName, stepSuccess) {
    if (!stepSuccess) return 'step_observation'; // 失败步骤不使用DataBus

    // 🔥 根据不同研究模式设置策略权重
    const modeWeights = {
        'academic': { full: 0.7, enhanced: 0.9, structured: 0.8, hybrid: 0.6 },
        'business': { full: 0.4, enhanced: 0.8, structured: 0.7, hybrid: 0.9 },
        'technical': { full: 0.8, enhanced: 0.7, structured: 0.9, hybrid: 0.5 },
        'deep': { full: 0.9, enhanced: 0.8, structured: 0.7, hybrid: 0.6 },
        'standard': { full: 0.3, enhanced: 0.6, structured: 0.5, hybrid: 0.7 },
        'data_mining': { full: 0.2, enhanced: 0.4, structured: 1.0, hybrid: 0.3 }
    };

    const weights = modeWeights[researchMode] || modeWeights.standard;

    // 🔥 根据工具类型调整策略
    const toolStrategies = {
        'tavily_search': { prefer: 'enhanced_summary', avoid: 'full_original' },
        'crawl4ai': { prefer: 'hybrid', avoid: 'full_original' },
        'python_sandbox': { prefer: 'structured_only', avoid: null },
        'code_generator': { prefer: 'structured_only', avoid: null },
        'firecrawl': { prefer: 'enhanced_summary', avoid: 'full_original' }
    };

    const toolStrategy = toolStrategies[toolName] || { prefer: 'enhanced_summary', avoid: null };

    // 🔥 根据数据长度决定可行性
    let viableStrategies = [];

    if (dataLength < 15000) {
        // 短数据：所有策略都可用
        viableStrategies = ['full_original', 'enhanced_summary', 'structured_only', 'hybrid'];
    } else if (dataLength < 30000) {
        // 中等数据：避免完整原始（除非必要）
        viableStrategies = ['enhanced_summary', 'structured_only', 'hybrid'];
    } else {
        // 长数据：只使用增强摘要或结构化提取
        viableStrategies = ['enhanced_summary', 'structured_only'];
    }

    // 🔥 移除工具不建议的策略
    if (toolStrategy.avoid && viableStrategies.includes(toolStrategy.avoid)) {
        viableStrategies = viableStrategies.filter(s => s !== toolStrategy.avoid);
    }

    // 🔥 优先考虑工具偏好的策略
    if (viableStrategies.includes(toolStrategy.prefer)) {
        return toolStrategy.prefer;
    }

    // 🔥 根据研究模式权重选择
    let bestStrategy = 'enhanced_summary'; // 默认
    let bestScore = 0;

    viableStrategies.forEach(strategy => {
        const strategyKey = strategy.split('_')[0]; // 映射到权重键
        const score = weights[strategyKey] || 0.5;
    
        // 🔥 根据内容类型微调
        let typeBonus = 0;
        if (contentType === 'structured_data' && strategy.includes('structured')) {
            typeBonus = 0.3;
        } else if (contentType === 'webpage' && strategy.includes('hybrid')) {
            typeBonus = 0.2;
        }
    
        const totalScore = score + typeBonus;
        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestStrategy = strategy;
        }
    });

    return bestStrategy;
}

// 🎯 新增：创建增强摘要
/**
 * @description 基于原始数据创建增强版摘要，不压缩内容
 */
_createEnhancedSummary(originalData, baseSummary, metadata = {}) {
    const { toolName, contentType } = metadata;

    // 1. 保留基础摘要的结构
    let enhanced = baseSummary;

    // 2. 从原始数据提取关键补充信息（最多3点）
    const criticalPoints = this._extractCriticalData(originalData, 3);

    if (criticalPoints) {
        enhanced += `\n\n📊 **补充关键数据** (基于${originalData.length.toLocaleString()}字符原始数据):\n${criticalPoints}`;
    }

    // 3. 添加数据来源和质量标记
    enhanced += `\n\n📝 **数据来源**: ${toolName || '未知工具'} (${contentType || '原始数据'})`;
    enhanced += `\n🔍 **数据完整性**: ${this._assessDataCompleteness(originalData)}`;

    // 4. 如果原始数据中有明显的关键信息缺失于摘要，特别标注
    const missingKeyInfo = this._detectMissingKeyInfo(originalData, baseSummary);
    if (missingKeyInfo) {
        enhanced += `\n⚠️ **注意**: 原始数据包含以下关键信息未在上方摘要中体现:\n${missingKeyInfo}`;
    }

    // 5. 添加原始数据长度信息（供最终模型参考）
    enhanced += `\n\n📏 **原始数据规模**: ${originalData.length.toLocaleString()} 字符`;
    
    return enhanced;
}

// 🎯 新增：创建混合证据
/**
 * @description 创建原始数据和摘要的混合证据，完整呈现
 */
_createHybridEvidence(originalData, baseSummary, metadata = {}) {
    // 1. 先展示摘要
    let hybrid = `## 📋 摘要总结\n${baseSummary}`;

    // 2. 添加原始数据的关键部分（提取精华）
    const keySections = this._extractKeySections(originalData, 2); // 提取2个关键部分

    if (keySections.length > 0) {
        hybrid += `\n\n## 🔍 原始数据关键部分\n`;
        keySections.forEach((section, idx) => {
            hybrid += `\n### 关键部分 ${idx + 1}\n${section}\n`;
        });
    }

    // 3. 添加数据统计
    hybrid += `\n---\n📊 **数据统计**: 原始数据共 ${originalData.length.toLocaleString()} 字符，已提取 ${keySections.reduce((acc, s) => acc + s.length, 0).toLocaleString()} 字符关键内容`;

    return hybrid;
}

// 🎯 新增：提取关键数据
/**
 * @description 从原始数据中提取最关键的信息点，作为补充
 */
_extractCriticalData(originalData, maxPoints = 3) {
    if (!originalData || typeof originalData !== 'string') return null;

    const text = originalData.substring(0, 5000); // 只处理前5000字符提高效率

    // 模式匹配：提取数字、百分比、年份、关键术语
    const patterns = [
        // 数字相关
        /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g, // 大数字
        /\b\d+\.\d+%/g, // 百分比
        /\b(?:20|19)\d{2}\b/g, // 年份
    
        // 关键短语
        /\b(?:最高|最低|最大|最小|平均|总计|累计|增长|下降|提升|降低)\b[\u4e00-\u9fa5\d\.%]+/g,
        /\b(?:关键|重要|核心|主要|显著|突出)\b[\u4e00-\u9fa5]+/g,
    
        // 表格数据特征
        /\|[^\n]+\|[^\n]+\|/g, // 简单表格行
    ];

    const matches = new Set();

    patterns.forEach(pattern => {
        const found = text.match(pattern) || [];
        found.forEach(match => {
            if (match.length > 5 && match.length < 200) { // 合理长度范围
                matches.add(match.trim());
            }
        });
    });

    // 转换为数组并限制数量
    const criticalPoints = Array.from(matches).slice(0, maxPoints);

    if (criticalPoints.length === 0) return null;

    return criticalPoints.map(point => `• ${point}`).join('\n');
}

// 🎯 新增：评估数据完整性
_assessDataCompleteness(data) {
    if (!data || typeof data !== 'string') return '未知';

    const length = data.length;

    if (length > 5000) return '完整';
    if (length > 2000) return '较完整';
    if (length > 500) return '基本完整';
    if (length > 100) return '简要';
     return '极简';
}

// 🎯 新增：检测缺失关键信息
_detectMissingKeyInfo(originalData, summary) {
    // 简单实现：检查原始数据中的数字是否在摘要中提及
    const originalNumbers = new Set((originalData.match(/\b\d+(?:\.\d+)?\b/g) || []).slice(0, 10));
    const summaryNumbers = new Set((summary.match(/\b\d+(?:\.\d+)?\b/g) || []));

    const missingNumbers = Array.from(originalNumbers).filter(num => !summaryNumbers.has(num));

    if (missingNumbers.length > 0) {
        return `数字数据: ${missingNumbers.slice(0, 3).join(', ')}${missingNumbers.length > 3 ? '...' : ''}`;
    }

    return null;
}

// 🎯 新增：提取关键部分
_extractKeySections(data, maxSections = 2) {
    const sections = [];
    const lines = data.split('\n').filter(line => line.trim().length > 0);

    // 寻找包含关键信息的段落
    const keyIndicators = ['##', '###', '**', '关键', '重要', '核心', '数据', '结果', '结论', '发现'];

    for (let i = 0; i < lines.length && sections.length < maxSections; i++) {
        const line = lines[i];
    
        // 检查是否包含关键指示词
        const hasKeyIndicator = keyIndicators.some(indicator => line.includes(indicator));
        const hasNumbers = /\b\d+(?:\.\d+)?\b/.test(line);
    
        if ((hasKeyIndicator || hasNumbers) && line.length > 20) {
            // 提取该段落（当前行及后续2行）
            const section = lines.slice(i, Math.min(i + 3, lines.length)).join('\n');
            if (section.length > 50 && section.length < 500) {
                sections.push(section);
                i += 2; // 跳过已提取的部分
            }
        }
    }

    return sections;
}

// 🎯 新增：上下文窗口使用情况检查（仅用于调试）
_checkContextWindowUsage(evidenceCollection) {
    const totalTokens = evidenceCollection.contextWindowInfo.totalTokens;
    const windowSize = evidenceCollection.contextWindowInfo.windowSize;
    const usagePercentage = evidenceCollection.contextWindowInfo.usagePercentage;
    
    console.log(`[ContextWindow] 使用情况: ${totalTokens} tokens / ${windowSize} (${usagePercentage}%)`);
    
    if (parseFloat(usagePercentage) > 80) {
        console.warn(`[ContextWindow] ⚠️ 警告：上下文窗口使用率超过80%，可能影响模型性能`);
    } else if (parseFloat(usagePercentage) > 60) {
        console.log(`[ContextWindow] ℹ️ 提示：上下文窗口使用率${usagePercentage}%，在安全范围内`);
    } else {
        console.log(`[ContextWindow] ✅ 良好：上下文窗口使用率${usagePercentage}%，完全安全`);
    }
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
    // 🆕 新增：JSON转Markdown表格
    _jsonToMarkdownTable(jsonData) {
        if (!Array.isArray(jsonData) || jsonData.length === 0) {
            return null;
        }

        // 确保处理的是数组中的对象
        const firstRow = jsonData.find(row => typeof row === 'object' && row !== null);
        if (!firstRow) return null;

        const headers = Object.keys(firstRow);
        let table = `| ${headers.join(' | ')} |\n`;
        table += `| ${headers.map(() => '---').join(' | ')} |\n`;
        
        jsonData.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                // 确保值是字符串，并处理 undefined/null
                return value === undefined || value === null ? 'N/A' : 
                       typeof value === 'string' ? value.replace(/\|/g, '\\|') : JSON.stringify(value);
            });
            table += `| ${values.join(' | ')} |\n`;
        });
        
        return `\n## 📊 结构化数据表格\n\n${table}\n\n`;
    }


    // 🆕 新增：健壮的结构化数据检测
    _isStructuredData(content) {
        if (!content) return false;
        const trimmed = content.trim();
        
        // 检查JSON格式
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
            (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                JSON.parse(trimmed);
                return true;
            } catch {
                return false;
            }
        }
        
        // 检查Markdown表格
        if (trimmed.includes('|') && trimmed.includes('---')) {
            const lines = trimmed.split('\n');
            const tableLines = lines.filter(line => line.includes('|'));
            // 至少需要 3 行：表头、分隔线、数据行
            return tableLines.length >= 3;
        }
        
        return false;
    }

    // 🆕 新增：JSON对象转Markdown表格
    _objectToMarkdownTable(obj) {
        const keys = Object.keys(obj);
        if (keys.length === 0) return null;
        
        let table = `| 字段 | 值 |\n|---|---|\n`;
        keys.forEach(key => {
            const value = obj[key];
            const displayValue = value === undefined || value === null ? 'N/A' :
                                typeof value === 'string' ? value.replace(/\|/g, '\\|') : JSON.stringify(value);
            table += `| ${key} | ${displayValue} |\n`;
        });
        
        return `\n## 📊 结构化数据表格\n\n${table}\n\n`;
    }
    // 🆕 新增：时效性分析工具
    _extractYear(observation) {
        // 匹配 20XX 年份
        const yearMatches = observation.match(/(20\d{2})/g);
        if (!yearMatches) return null;

        // 返回最大的年份（即最新的年份）
        return Math.max(...yearMatches.map(y => parseInt(y, 10)));
    }

    _isCurrentYearData(observation) {
        const currentYear = new Date().getFullYear();
        const year = this._extractYear(observation);
        return year === currentYear;
    }

    _analyzeTemporalContent(observation) {
        const currentYear = new Date().getFullYear();
        const year = this._extractYear(observation);

        if (year === currentYear) return 1.0; // 当前年，最高优先级
        if (year === currentYear - 1) return 0.8; // 去年，高优先级
        if (year >= 2020) return 0.5; // 近五年，中优先级
        return 0.1; // 默认低优先级
    }

    // ✨ 改进版：多维度信息增益计算（保持向后兼容）
    _calculateInformationGain(newObservation, history, config) {
        // 🎯 参数兼容处理
        const useConfig = typeof config === 'object' ? config : {
            useNovelty: true,
            useStructure: true,
            useEntity: false,  // 默认关闭，技术研究时手动开启
            useLengthRatio: true,
            decayFactor: 0.95 // 默认衰减因子
        };
        
        // 1. 基础参数验证
        const previousText = history.map(h => h.observation || '').join(' ');
        const newText = newObservation || '';
        
        // 短文本保护
        if (!newText || newText.length < 50) {
            return 0.1; // 基础增益，鼓励继续探索
        }
        
        let totalScore = 0;
        let activeDimensions = 0;
        
        // 2. 词汇新颖性（核心维度，权重40%）
        if (useConfig.useNovelty !== false) {
            const noveltyScore = this._calculateNoveltyScore(newText, previousText);
            totalScore += noveltyScore * 0.4;
            activeDimensions++;
        }
        
        // 3. 结构多样性（权重30%）
        if (useConfig.useStructure !== false) {
            const structureScore = this._calculateStructureScore(newText);
            totalScore += structureScore * 0.3;
            activeDimensions++;
        }
        
        // 4. 长度比率（权重20%）
        if (useConfig.useLengthRatio !== false) {
            const lengthScore = this._calculateLengthScore(newText, previousText);
            totalScore += lengthScore * 0.2;
            activeDimensions++;
        }
        
        // 5. 技术实体（可选，权重10%）
        if (useConfig.useEntity === true) {
            const entityScore = this._calculateEntityScore(newText, previousText);
            totalScore += entityScore * 0.1;
            activeDimensions++;
        }
        
        // 避免除零
        if (activeDimensions === 0) {
            return 0.1;
        }
        
        // 6. 加权平均
        const rawScore = totalScore / activeDimensions;
        
        // 7. 历史衰减（防止无限迭代）
        const decayFactor = useConfig.decayFactor || 0.9;
        const decay = Math.pow(decayFactor, Math.max(0, history.length - 3)); // 从第4步开始衰减
        const finalScore = rawScore * decay;
        
        // 8. 返回[0,1]范围内的值
        return Math.max(0.05, Math.min(0.95, finalScore));
    }

    // ✨ 新增：词汇新颖性计算（私有方法）
    _calculateNoveltyScore(newText, previousText) {
        // 简化的分词和过滤
        const tokenize = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
                .split(/\s+/)
                .filter(word => {
                    if (word.length < 2) return false;
                    if (/^\d+$/.test(word)) return false;
                    // 常见停用词（可根据需求扩展）
                    const stopWords = ['the', 'and', 'for', 'are', 'with', 'this', 'that', 
                                      '是', '的', '了', '在', '和', '与', '或'];
                    return !stopWords.includes(word);
                });
        };
        
        const previousWords = new Set(tokenize(previousText));
        const newWords = tokenize(newText);
        
        if (newWords.length === 0) return 0.1;
        
        // 新词比例
        const novelWords = newWords.filter(word => !previousWords.has(word));
        const basicNovelty = novelWords.length / newWords.length;
        
        return Math.max(0.1, Math.min(0.9, basicNovelty));
    }

    // ✨ 新增：结构多样性计算
    _calculateStructureScore(newText) {
        // 检测结构化内容
        let features = 0;
        const maxFeatures = 6;
        
        if (/\`\`\`[\s\S]*?\`\`\`/.test(newText)) features++; // 代码块
        if (/\|[\s\S]*?\|/.test(newText)) features++;         // 表格
        if (/^\s*[\-\*\+]\s|\d+\.\s/.test(newText)) features++; // 列表
        if (/^>\s/.test(newText)) features++;                 // 引用块
        if (/^#{1,3}\s/.test(newText)) features++;            // 标题
        if ((newText.match(/\n\s*\n/g) || []).length >= 3) features++; // 多段落
        
        return Math.min(features / maxFeatures, 1);
    }

    // ✨ 新增：长度比率计算
    _calculateLengthScore(newText, previousText) {
        if (previousText.length === 0) return 0.5; // 没有历史时中等增益
        
        const ratio = newText.length / previousText.length;
        // 归一化：ratio=1得0.5分，ratio=2得1分，ratio=0.5得0分
        const normalized = Math.max(0, Math.min(1, (ratio - 0.5) * 1.0));
        return normalized;
    }

    // ✨ 新增：技术实体检测（技术研究场景优化）
    _calculateEntityScore(newText, previousText) {
        // 技术术语模式
        const patterns = [
            /\b[A-Z]{2,}\b/g,           // 大写缩写（CUDA, GPU, API）
            /\b[\w\-]+(?:\.\d+)+\b/g,   // 版本号（13.1, TensorFlow-2.0）
            /\b(?:SDK|IDE|IR|SIMD|TPU|HPC)\b/gi // 技术缩写
        ];
        
        const extractEntities = (text) => {
            const entities = new Set();
            patterns.forEach(pattern => {
                const matches = text.match(pattern) || [];
                matches.forEach(match => entities.add(match.toLowerCase()));
            });
            return entities;
        };
        
        const newEntities = extractEntities(newText);
        const previousEntities = extractEntities(previousText);
        
        if (newEntities.size === 0) return 0;
        
        const novelEntities = Array.from(newEntities).filter(e => !previousEntities.has(e));
        return novelEntities.length / newEntities.size;
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
2.  **结构**: 严格按照以下结构组织内容:
${config.structure.map(section => `    - ${section}`).join('\n')}
3.  **字数**: 报告总字数应在 ${config.wordCount} 左右。
4.  **风格**: ${config.style}
5.  **核心要求**: ${config.requirements}

6.  **【至关重要】引用来源的强制性学术准则 (Mandatory Citation Guideline)**

    *   **核心规则 (The Rule):** 你报告中的**每一个**关键数据、观点或结论，都**必须**在陈述该信息的段落末尾，清晰地注明其来源的**编号**。这是一个衡量报告专业性与可信度的核心标准，**必须严格遵守**。

    *   **原则与目的 (The Why):** 你的每一份报告都必须体现出学术的严谨性。清晰的编号引用能让读者追溯信息的源头，是验证内容准确性的唯一途径，也是一份专业报告的基石。

    *   **格式与位置 (The How)**:
        *   **引用内容**: 必须使用方括号和编号，例如 \`[1]\` 或 \`[2, 3]\`。
        *   **引用位置**: 在包含引用信息的**句子或段落结尾处**。

    *   **格式示例 (The Examples)**:
        *   **🚫 错误示例**: \`"...这个结论很重要。来源: 网站A"\` (格式错误且不够自然)
        *   **✅ 正确示例**: \`"...这一观点在最新的研究中得到了详细阐述 [1]。"\`
        *   **✅ 正确示例**: \`"...根据分类，我们可以将其分为三类 [2, 3]。"\`

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

        citation += `. [Online].\n   Available: ${meta.url}`;
        output += `${citation}\n\n`;
    });

    return output;
}

// ===========================================================================
// 🆕 完全独立的文中引用提取系统 (基于 uniqueSources)
// 直接从报告中提取引用标记，从 uniqueSources 中找到对应来源
// 与参考文献完全独立，不进行任何筛选或交叉引用
// ===========================================================================

/**
 * 🆕 完全独立的文中引用提取系统
 * 基于模型实际看到的 uniqueSources 列表
 * 直接从报告中提取引用标记，从 uniqueSources 中找到对应来源
 * 与参考文献完全独立，不进行任何筛选或交叉引用
 */
async _generateIndependentCitationMapping(reportContent, uniqueSources) {
    if (!reportContent || typeof reportContent !== 'string' || !uniqueSources || uniqueSources.length === 0) {
        console.log('[CitationMapping] 报告内容或来源为空，跳过引用映射');
        return '';
    }
    
    console.log(`[CitationMapping] 🚀 启动独立文中引用提取系统，基于 ${uniqueSources.length} 个uniqueSources`);
    
    // 1. 提取所有引用标记
    const citationMarkers = this._extractCitationMarkers(reportContent);
    if (citationMarkers.length === 0) {
        console.log('[CitationMapping] 未找到引用标记');
        return '';
    }
    
    console.log(`[CitationMapping] 提取到 ${citationMarkers.length} 个引用标记`);
    
    // 2. 处理引用：去重、排序、验证
    const processedCitations = this._processCitations(citationMarkers, uniqueSources);
    if (processedCitations.length === 0) {
        console.log('[CitationMapping] 无有效引用');
        return '';
    }
    
    console.log(`[CitationMapping] 有效引用：${processedCitations.length} 个`);
    
    // 3. 生成引用板块
    return this._generateCitationSection(processedCitations, uniqueSources);
}

/**
 * 🆕 提取报告中所有引用标记
 */
_extractCitationMarkers(reportContent) {
    const markers = [];
    
    // 🎯 先找到参考文献部分的位置，只提取之前的正文
    let mainContent = reportContent;
    const refKeywords = ["参考文献", "References", "📚 参考文献"];
    
    for (const keyword of refKeywords) {
        const refIndex = reportContent.indexOf(keyword);
        if (refIndex !== -1) {
            mainContent = reportContent.substring(0, refIndex);
            console.log(`[CitationMapping] 检测到"${keyword}"，只提取前 ${mainContent.length} 字符的正文`);
            break;
        }
    }
    
    // 支持多种格式
    const patterns = [
        { regex: /\[(\d+)\]/g, type: 'single' },
        { regex: /\[(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[来源\s*(\d+)\]/g, type: 'source' },
        // 🆕 新增以下格式支持
        { regex: /\[(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },  // 中文逗号 [4，19]
        { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },  // 中文逗号三个数字 [4，19，25]
        { regex: /\[(\d+),(\d+)\]/g, type: 'multi' },  // 无空格英文逗号 [4,19]
        { regex: /\[(\d+)[，](\d+)\]/g, type: 'multi' },  // 无空格中文逗号 [4，19]
        // 🆕 新增4个数字的模式
        { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+),(\d+),(\d+),(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+)[，](\d+)[，](\d+)[，](\d+)\]/g, type: 'multi' },
        // 🆕 新增5个数字的模式
        { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+),(\d+),(\d+),(\d+),(\d+)\]/g, type: 'multi' },
        { regex: /\[(\d+)[，](\d+)[，](\d+)[，](\d+)[，](\d+)\]/g, type: 'multi' },
    ];
    
    patterns.forEach(({ regex, type }) => {
        let match;
        while ((match = regex.exec(mainContent)) !== null) {
            const indices = [];
            
            if (type === 'single' || type === 'source') {
                indices.push(parseInt(match[1], 10));
            } else if (type === 'multi') {
                for (let i = 1; i < match.length; i++) {
                    const num = parseInt(match[i], 10);
                    if (!isNaN(num)) indices.push(num);
                }
            }
            
            if (indices.length > 0) {
                markers.push({
                    indices,
                    text: match[0],
                    position: match.index,
                    type
                });
            }
        }
    });
    
    // 按出现位置排序
    markers.sort((a, b) => a.position - b.position);
    return markers;
}

/**
 * 🆕 处理引用：去重、排序、验证
 */
_processCitations(citationMarkers, uniqueSources) {
    const seen = new Set();
    const result = [];
    let warningCount = 0;
    
    citationMarkers.forEach(marker => {
        marker.indices.forEach(index => {
            // 去重
            if (seen.has(index)) return;
            
            // 验证范围
            if (index < 1 || index > uniqueSources.length) {
                console.warn(`[CitationMapping] 引用[${index}]超出范围(1-${uniqueSources.length})`);
                warningCount++;
                return;
            }
            
            // 获取来源
            const source = uniqueSources[index - 1];
            if (!source) {
                console.warn(`[CitationMapping] 无法找到来源[${index}]`);
                return;
            }
            
            seen.add(index);
            result.push({
                index,
                source,
                position: marker.position
            });
        });
    });
    
    if (warningCount > 0) {
        console.warn(`[CitationMapping] 共发现 ${warningCount} 个超出范围的引用`);
    }
    
    // 按出现位置排序（已排序）
    return result;
}

/**
 * 🆕 生成独立的文中引用板块
 */
_generateCitationSection(processedCitations, uniqueSources) {
    if (processedCitations.length === 0) {
        return '';
    }
    
    let section = '\n\n## 🔗 文中引用对应来源 (Citation-Indexed References)\n\n';
    section += '> *注：本部分仅列出报告中实际引用的来源，按照文中出现的顺序排列。*\n';
    section += '> *与参考文献章节完全独立，不进行任何筛选或交叉引用。*\n\n';
    
    // 生成引用条目
    processedCitations.forEach(citation => {
        const { index, source } = citation;
        
        let entry = `**[${index}]** `;
        
        // 标题
        if (source.title && source.title !== '无标题') {
            entry += `"${source.title}"`;
        } else {
            entry += `来源 ${index}`;
        }
        
        // URL信息
        if (source.url && source.url !== '#') {
            try {
                const hostname = new URL(source.url).hostname.replace('www.', '');
                entry += ` - ${hostname}`;
            } catch {
                entry += ` - 外部链接`;
            }
        }
        
        // 完整链接
        if (source.url && source.url !== '#') {
            entry += `\n   🔗 ${source.url}`;
        }
        
        section += `${entry}\n\n`;
    });
    
    // 统计信息
    section += `---\n📊 **引用统计**：\n`;
    section += `• 文中引用 ${processedCitations.length} 个独立来源\n`;
    section += `• 模型共看到 ${uniqueSources.length} 个去重来源\n`;
    
    return section;
}

/**
 * 🎯 [最终版] 智能混合来源过滤器
 */
_filterUsedSources(sources, reportContent) {
  if (!sources || sources.length === 0) return [];
  if (!reportContent) return sources.slice(0, 8); // 🎯 默认返回前8个
  
  console.log(`[SourceFilter] 启动智能匹配，候选来源: ${sources.length} 个`);
  
  // 🎯 轨道 0: 基础保留策略 (最少保留6个)
  const baseKeepCount = 6;
  const usedSources = new Set();
  
  // 轨道 1: 显式引用提取 (放宽匹配规则)
  const citationPatterns = [
    /【来源\s*(\d+)】/g,
    /\[(\d+)\]/g,
    /来源\s*(\d+)/g,
    /ref\s*(\d+)/gi
  ];
  
  citationPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(reportContent)) !== null) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < sources.length) {
        usedSources.add(sources[index]);
      }
    }
  });

  // 轨道 2: 关键词匹配 (降低阈值)
  const reportLower = reportContent.toLowerCase();
  sources.forEach(source => {
    if (usedSources.has(source)) return;
    
    const title = (source.title || '').toLowerCase();
    const url = source.url || '';
    
    // 🎯 放宽匹配条件
    let score = 0;
    
    // 检查标题关键词是否在报告中
    if (title) {
      const keywords = title.split(/[^\w\u4e00-\u9fa5]+/)
        .filter(word => word.length >= 3);
      
      keywords.forEach(keyword => {
        if (reportLower.includes(keyword)) score += 0.2;
      });
      
      // 检查完整标题（部分匹配）
      if (title.length > 10) {
        const titleFragments = [
          title.substring(0, 15),
          title.substring(Math.max(0, title.length - 15))
        ];
        
        titleFragments.forEach(fragment => {
          if (reportLower.includes(fragment)) score += 0.5;
        });
      }
    }
    
    // 🎯 降低阈值从0.35到0.25
    if (score >= 0.25) {
      usedSources.add(source);
    }
  });

  // 轨道 3: 确保最小数量
  let finalSources = Array.from(usedSources);
  
  if (finalSources.length < baseKeepCount) {
    console.log(`[SourceFilter] 匹配来源不足(${finalSources.length})，补充至${baseKeepCount}个`);
    
    // 按相关性补充来源
    const remainingSources = sources.filter(s => !usedSources.has(s));
    const additionalCount = Math.min(
      baseKeepCount - finalSources.length,
      remainingSources.length
    );
    
    // 优先补充来源质量高的（如权威域名）
    const highQualitySources = remainingSources.filter(s => {
      const url = s.url || '';
      return url.includes('.gov') || 
             url.includes('.edu') || 
             url.includes('reuters') || 
             url.includes('bloomberg');
    });
    
    const sourcesToAdd = [
      ...highQualitySources.slice(0, additionalCount),
      ...remainingSources.slice(0, additionalCount - highQualitySources.length)
    ];
    
    finalSources.push(...sourcesToAdd);
  }

  // 限制最大数量（避免过多）
  finalSources = finalSources.slice(0, 20);
  
  console.log(`[SourceFilter] 匹配完成: ${sources.length} -> ${finalSources.length} 个有效来源`);
  return finalSources;
}

// ============================================================================
// 🎯 智能计划完成度计算系统（与主文件完全兼容版本）
// ============================================================================

/**
 * ✨ 智能计划完成度计算（与主文件兼容版）
 * 结合关键词匹配和语义相似度的混合算法
 */
_calculatePlanCompletion(plan, history) {
    if (!plan || !history || history.length === 0) return 0;
    
    const totalSteps = plan.research_plan?.length || 0;
    if (totalSteps === 0) return 0;
    
    // 🎯 核心修复：从plan中获取研究模式，兼容现有调用
    const researchMode = plan.research_mode || (plan.researchPlan?.research_mode) || 'standard';
    
    console.log(`[PlanCompletion] 开始计算完成度，计划步骤: ${totalSteps}，历史步骤: ${history.length}，模式: ${researchMode}`);
    
    let matchedSteps = 0;
    
    plan.research_plan.forEach((planStep, index) => {
        // 🎯 核心：双引擎匹配策略
        const keywordScore = this._calculateKeywordMatchScore(planStep, history, index, plan);
        const semanticScore = this._calculateSemanticSimilarity(planStep, history, index);
        
        // 🎯 智能融合：取两者较高值（避免单一算法偏差）
        const finalScore = Math.max(keywordScore, semanticScore);
        
        // 🎯 自适应阈值：根据研究模式调整
        const threshold = this._getAdaptiveThreshold(researchMode);
        
        if (finalScore >= threshold) {
            matchedSteps++;
            console.log(`[PlanCompletion] ✅ 步骤 ${index+1} 匹配成功: 关键词=${(keywordScore*100).toFixed(1)}%，语义=${(semanticScore*100).toFixed(1)}%，综合=${(finalScore*100).toFixed(1)}%`);
        } else {
            console.log(`[PlanCompletion] ❌ 步骤 ${index+1} 匹配失败: 关键词=${(keywordScore*100).toFixed(1)}%，语义=${(semanticScore*100).toFixed(1)}%，综合=${(finalScore*100).toFixed(1)}% < ${threshold*100}%`);
        }
        
        // 🎯 调试信息：显示计划步骤内容
        const stepPreview = planStep.sub_question?.length > 40 
            ? planStep.sub_question.substring(0, 40) + "..."
            : planStep.sub_question || '无问题描述';
        console.log(`[PlanCompletion]   步骤内容: "${stepPreview}"`);
    });
    
    const completion = totalSteps > 0 ? matchedSteps / totalSteps : 0;
    console.log(`[PlanCompletion] 🎯 总完成度: ${matchedSteps}/${totalSteps} = ${(completion*100).toFixed(1)}%`);
    
    // 🎯 确保返回值在0-1之间
    return Math.max(0, Math.min(1, completion));
}

/**
 * 🎯 关键词匹配分数（精准算法）
 * 基于关键词的精确匹配，适合技术术语
 * 🔥 核心修复：保持与现有系统的参数兼容性
 */
_calculateKeywordMatchScore(planStep, history, stepIndex, plan) {
    if (!planStep || !planStep.sub_question) return 0;
    
    const questionText = (planStep.sub_question || '').toLowerCase();
    
    // 🎯 智能分词：同时处理中英文混合文本
    const keywords = this._smartTokenize(questionText);
    if (keywords.length === 0) return 0;
    
    // 🎯 获取相关历史（每个计划步骤对应2-3个历史步骤）
    const relevantHistory = this._getRelevantHistoryForStep(history, stepIndex, plan);
    const historyText = relevantHistory.map(h => 
        `${h.action?.thought || ''} ${h.observation || ''} ${h.key_finding || ''}`
    ).join(' ').toLowerCase();
    
    // 🎯 计算匹配的关键词数量
    let foundCount = 0;
    keywords.forEach(keyword => {
        // 使用包含匹配（允许部分匹配，更灵活）
        if (historyText.includes(keyword)) {
            foundCount++;
        }
    });
    
    // 🎯 返回匹配比例
    return keywords.length > 0 ? foundCount / keywords.length : 0;
}

/**
 * 🎯 语义相似度计算（模糊算法）
 * 基于词袋模型的Jaccard相似度，适合语义匹配
 * 🔥 核心修复：保持参数一致性，支持原系统调用
 */
_calculateSemanticSimilarity(planStep, history, stepIndex) {
    if (!planStep || !planStep.sub_question) return 0;
    
    const questionText = (planStep.sub_question || '').toLowerCase();
    
    // 🎯 获取相关历史（最近3步）
    const relevantHistory = history.slice(-3);
    const historyText = relevantHistory.map(h => 
        `${h.action?.thought || ''} ${h.observation || ''}`
    ).join(' ').toLowerCase();
    
    // 🎯 智能分词
    const questionWords = this._smartTokenize(questionText);
    const historyWords = this._smartTokenize(historyText);
    
    if (questionWords.length === 0 || historyWords.length === 0) return 0;
    
    // 🎯 计算Jaccard相似度（交集/并集）
    const questionSet = new Set(questionWords);
    const historySet = new Set(historyWords);
    
    let intersection = 0;
    for (const word of questionSet) {
        if (historySet.has(word)) intersection++;
    }
    
    const union = questionSet.size + historySet.size - intersection;
    
    return union > 0 ? intersection / union : 0;
}

/**
 * 🎯 智能分词（中英文通用）
 * 统一处理中英文混合文本，无需区分语言
 * 🔥 核心修复：增强健壮性，防止空值错误
 */
_smartTokenize(text) {
    if (!text || typeof text !== 'string') return [];
    
    // 🎯 清理文本：保留中文字符、英文字母、数字
    const cleaned = text
        .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')  // 移除非中英文字符
        .replace(/\s+/g, ' ')                    // 合并多个空格
        .trim();
    
    if (!cleaned) return [];
    
    // 🎯 按非字母数字和非中文分割（统一分词）
    const tokens = cleaned
        .split(/[^\w\u4e00-\u9fa5]+/)
        .filter(token => {
            // 过滤条件
            const trimmed = token.trim();
            
            // 1. 长度至少为2
            if (trimmed.length < 2) return false;
            
            // 2. 过滤常见停用词（最小集合）
            const stopWords = new Set([
                // 中文停用词
                '的', '了', '在', '和', '与', '或', '是', '有', '为', '对',
                '从', '以', '就', '但', '而', '则', '却', '虽', '既',
                '如何', '什么', '为什么', '怎样', '怎么', '哪些',
                
                // 英文停用词
                'the', 'and', 'for', 'are', 'with', 'this', 'that',
                'how', 'what', 'why', 'which', 'when', 'where'
            ]);
            
            if (stopWords.has(trimmed.toLowerCase())) return false;
            
            return true;
        })
        .map(token => token.toLowerCase());
    
    return tokens;
}

/**
 * 🎯 获取步骤相关历史（智能映射）
 * 将计划步骤映射到对应的历史步骤
 * 🔥 核心修复：保持与现有系统兼容，支持不同的plan结构
 */
_getRelevantHistoryForStep(history, stepIndex, plan) {
    if (!history || history.length === 0) return [];
    
    // 🎯 策略1：平均分配（每个计划步骤对应2-3个历史步骤）
    // 兼容不同的plan结构
    const planSteps = plan?.research_plan?.length || plan?.researchPlan?.length || 1;
    const stepsPerPlan = Math.ceil(history.length / planSteps);
    
    const startIndex = Math.max(0, stepIndex * stepsPerPlan);
    const endIndex = Math.min(history.length, startIndex + Math.max(3, stepsPerPlan));
    
    // 🎯 策略2：最近优先（取最近3步）
    const recentHistory = history.slice(-3);
    
    // 🎯 智能选择：如果历史步骤多，使用平均分配；否则使用最近优先
    if (history.length >= 6) {
        return history.slice(startIndex, endIndex);
    } else {
        return recentHistory;
    }
}

/**
 * 🎯 自适应阈值（根据研究模式调整）
 * 根据不同的研究模式设置不同的匹配阈值
 */
_getAdaptiveThreshold(researchMode) {
    // 🎯 默认阈值
    let threshold = 0.4; // 40%匹配度
    
    // 🎯 根据研究模式调整
    const modeThresholds = {
        'deep': 0.35,       // 深度模式降低要求（允许更深入探索）
        'academic': 0.45,   // 学术模式提高要求
        'business': 0.4,    // 商业模式标准要求
        'technical': 0.4,   // 技术模式标准要求  
        'data_mining': 0.3, // 数据挖掘模式最低要求
        'standard': 0.4     // 标准模式标准要求
    };
    
    return modeThresholds[researchMode] || threshold;
}

/**
 * 🎯 兼容原系统的 _isStepEvidenceInHistory 方法
 * 🔥 核心修复：保持与原系统完全兼容的调用方式
 */
_isStepEvidenceInHistory(step, history, plan) {
    // 🎯 兼容性修复：支持原系统的2参数调用
    if (arguments.length === 2) {
        // 原系统调用方式：isStepEvidenceInHistory(step, history)
        // 使用默认plan结构
        const defaultPlan = { research_mode: 'standard' };
        const keywordScore = this._calculateKeywordMatchScore(step, history, 0, defaultPlan);
        const semanticScore = this._calculateSemanticSimilarity(step, history, 0);
        const finalScore = Math.max(keywordScore, semanticScore);
        
        return finalScore >= this._getAdaptiveThreshold('standard');
    }
    
    // 🎯 新系统调用方式：isStepEvidenceInHistory(step, history, plan)
    const keywordScore = this._calculateKeywordMatchScore(step, history, 0, plan);
    const semanticScore = this._calculateSemanticSimilarity(step, history, 0);
    const finalScore = Math.max(keywordScore, semanticScore);
    
    // 🎯 使用自适应阈值
    const researchMode = plan?.research_mode || 'standard';
    return finalScore >= this._getAdaptiveThreshold(researchMode);
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
1. 📊 **数据绝对保留**: 必须保留原文中出现的所有统计数据、年份、数值、单位（如"万人"、"亿元"）。这是最高优先级！
2. 📉 **表格重构**: 如果原文包含表格数据，请将其转换为 Markdown 表格格式保留。
3. 🔧 **保留技术规格**：模型名称、参数数量、上下文长度、技术特性
4. 💡 **保持核心结论**：研究发现、比较结果、优势劣势分析
5. 🎯 **准确性优先**：专业术语、专有名词必须准确无误
6. 📝 **长度控制**：控制在1500-2000字之间，确保信息完整性

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
            'standard': '中',
            'data_mining': '高' // 数据挖掘模式通常需要最新数据
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
     * 🔥 修改：添加工具来源信息的存储
     */
    _storeRawData(stepIndex, rawData, metadata = {}, toolSources = []) {
        const dataKey = `step_${stepIndex}`;
        
        let processedData = rawData;
        
        // 存储工具返回的原始来源信息
        const sourcesInfo = toolSources.map(source => ({
            title: source.title || '无标题',
            url: source.url || '#',
            description: source.description || '',
            collectedAt: new Date().toISOString(),
            stepIndex: stepIndex, // 标记属于哪个步骤
            sourceIndex: null // 后续会分配唯一索引
        }));
        
        // 特别处理结构化数据
        if (metadata.contentType === 'structured_data') {
            try {
                // 如果是JSON字符串，尝试解析并提取关键信息
                const parsedData = JSON.parse(rawData);
                const summary = {
                    dataType: metadata.dataType || 'unknown',
                    fieldCount: Object.keys(parsedData).length,
                    sample: {},
                    size: rawData.length
                };
                
                // 提取前3个字段作为示例
                Object.entries(parsedData)
                    .slice(0, 3)
                    .forEach(([key, value]) => {
                        summary.sample[key] = typeof value === 'string'
                            ? value.substring(0, 100)
                            : typeof value;
                    });
                
                processedData = JSON.stringify(summary, null, 2);
                console.log(`[DataBus] 📊 存储结构化数据摘要: ${summary.dataType}, ${summary.fieldCount} 字段`);
                
            } catch (e) {
                // 如果不是JSON，使用原有逻辑
                if (rawData.length > 10000) {
                    processedData = this._extractStructuredData(rawData, metadata);
                }
            }
        } else {
            // 原有逻辑
            if (rawData.length > 10000) {
                processedData = this._extractStructuredData(rawData, metadata);
            }
        }
        
        this.dataBus.set(dataKey, {
            rawData: processedData,
            originalData: rawData, // 🔥 新增：保存原始数据
            metadata: {
                ...metadata,
                originalLength: rawData.length,
                processedLength: processedData.length,
                timestamp: Date.now(),
                toolSources: sourcesInfo, // 🆕 存储原始来源
                sourceCount: sourcesInfo.length
            }
        });
        
        this._cleanupDataBus();
        console.log(`[DataBus] 存储数据 ${dataKey}: ${rawData.length} -> ${processedData.length} 字符，包含 ${sourcesInfo.length} 个来源`);
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
     * 🎯 客户端 Python 导入预检
     */
    _validatePythonImports(code) {
        // 🎯 强制检查的四个核心导入（完整的导入语句）
        const mandatoryImports = [
            'import json',
            'import pandas as pd',
            'import matplotlib.pyplot as plt',
            'import numpy as np'
        ];
        
        let missingImports = [];
        const codeLower = code.toLowerCase();
        
        mandatoryImports.forEach(fullImportStatement => {
            // 检查代码中是否包含完整的导入语句
            if (!codeLower.includes(fullImportStatement.toLowerCase())) {
                // 🎯 简化逻辑：只要代码中没有完整的强制导入语句，就认为缺失
                // 这样可以确保即使 LLM 忘记了，系统也会自动补全
                missingImports.push(fullImportStatement);
            }
        });
        
        // 使用 Set 去重并返回完整的导入语句
        return [...new Set(missingImports)];
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
     * 🎯 辅助方法：判断是否为致命解析错误
     */
    _isParserError(error) {
        if (!error || !error.message) return false;
        
        // 🎯 关键字列表：涵盖 OutputParser 抛出的自定义错误和 JSON.parse 抛出的标准错误
        const parserKeywords = [
            '无法解析出有效的行动或最终答案',
            'Expected \',\' or \'}\' after property value',
            'Unexpected token',
            'JSON格式错误',
            '解析失败',
            'Invalid JSON',
            'SyntaxError',
            '[DUPLICATE_URL_ERROR]' // 🎯 新增：识别重复URL错误
        ];
        
        const message = error.message || '';
        return parserKeywords.some(keyword => message.includes(keyword));
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

    /**
     * 🎯 【核心优化】按需知识注入
     */
    async injectKnowledgeAsNeeded(toolName, context, step) {
        const { mode = 'deep' } = context;
        
        console.log(`[DeepResearchAgent] 🔍 检查知识注入: ${toolName}, 步骤: ${step}, 模式: ${mode}`);
        
        // 🎯 1. 检查是否已经注入过
        if (this.injectedTools.has(toolName)) {
            console.log(`[DeepResearchAgent] 🔄 工具 ${toolName} 已注入过，使用引用模式`);
            return this.getKnowledgeReference(toolName, context);
        }
        
        // 🎯 2. 根据步骤和模式决定压缩级别
        let compression = 'smart';
        let maxChars = 15000;
        
        if (step === 0) {
            // 第一步：完整（压缩后）指南
            compression = 'smart';
            maxChars = 20000;
        } else if (step <= 2) {
            // 前几步：摘要版
            compression = 'smart';
            maxChars = 8000;
        } else {
            // 后续步骤：最小化或引用
            if (mode === 'deep') {
                compression = 'minimal';
                maxChars = 5000;
            } else {
                compression = 'reference';
                maxChars = 2000;
            }
        }
        
        // 🎯 3. 从EnhancedSkillManager获取知识（带压缩）
        const knowledge = await this.skillManager.retrieveFederatedKnowledge(
            toolName,
            context,
            {
                compression,
                maxChars,
                iteration: step,
                sessionId: this.currentSessionId
            }
        );
        
        // 🎯 4. 记录已注入的工具
        if (knowledge && knowledge.content) {
            this.injectedTools.add(toolName);
            console.log(`[DeepResearchAgent] ✅ 注入知识: ${toolName} (${knowledge.content.length} chars)`);
        }
        
        return knowledge ? knowledge.content : '';
    }

    /**
     * 🎯 获取知识引用（已注入过的情况）
     */
    getKnowledgeReference(toolName, context) {
        // 🎯 关键：调用 EnhancedSkillManager 的 getKnowledgeReference 方法
        const knowledgePackage = this.skillManager.getKnowledgeReference(toolName, context);
        
        if (knowledgePackage && knowledgePackage.content) {
            return knowledgePackage.content;
        }
        
        // 降级到本地生成引用
        return `## 工具提示: ${toolName}\n\n` +
               `**注意**: 该工具的详细操作指南已在之前步骤中提供。\n` +
               `**当前步骤关键点**: 请根据任务需求合理使用 ${toolName} 工具。\n\n` +
               `*如需查看完整指南，请参考之前步骤的详细说明。*`;
    }

    /**
     * 🎯 判断是否需要注入知识
     */
    shouldInjectKnowledge(toolName, step) {
        // 简单策略：每个工具只在第一次使用时注入详细知识
        if (!this.injectedTools.has(toolName)) {
            return true;
        }
        
        // 如果是复杂工具（如python_sandbox）且在关键步骤，可以再次提示
        if (toolName === 'python_sandbox' && (step === 3 || step === 5)) {
            return true;
        }
        
        return false;
    }

    /**
     * 🎯 重置注入状态（每次新研究开始时）
     */
// 🎯 新增：Levenshtein距离计算
_levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

// 🎯 新增：字符串相似度算法（基于Levenshtein距离）
_calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this._levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / parseFloat(longer.length);
}

// 🎯 新增：URL相似度计算
_calculateURLSimilarity(url1, url2) {
    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);
        
        // 1. 相同域名和路径 = 相同URL
        if (u1.hostname === u2.hostname && u1.pathname === u2.pathname) {
            return 1.0;
        }
        
        // 2. 计算路径相似度
        const path1 = u1.pathname.toLowerCase();
        const path2 = u2.pathname.toLowerCase();
        const similarity = this._calculateStringSimilarity(path1, path2);
        
        return similarity;
    } catch (e) {
        // URL解析失败，退回到字符串相似度
        return this._calculateStringSimilarity(url1, url2);
    }
}

// 🎯 新增：查找缓存的观察结果
_findCachedObservationForURL(url) {
    // 查找最近的包含该URL的步骤
    for (let i = this.intermediateSteps.length - 1; i >= 0; i--) {
        const step = this.intermediateSteps[i];
        // 关键：检查 action.parameters.url 是否与目标 URL 严格相等
        if (step.action.tool_name === 'crawl4ai' && 
            step.action.parameters.url === url) {
            return step;
        }
    }
    return null;
}

// 🎯 新增：检查URL重复 (返回相似的已访问URL或 null)
_checkURLDuplicate(url) {
    for (const [visitedUrl, data] of this.visitedURLs.entries()) {
        const similarity = this._calculateURLSimilarity(url, visitedUrl);
        
        // 相似度超过阈值
        if (similarity >= this.urlSimilarityThreshold) {
            // 检查是否超过最大重访次数
            if (data.count >= this.maxRevisitCount) {
                // 达到最大重访次数，返回已访问的 URL，用于检索缓存
                return visitedUrl; 
            }
            
            // 相似但未达到最大重访次数，更新计数并允许本次访问
            data.count++;
            data.lastVisited = Date.now();
            return null; // 允许访问，不视为重复
        }
    }
    return null; // 没有相似或重复的 URL
}
    resetInjectionState() {
        this.injectedTools.clear();
        this.currentSessionId = `session_${Date.now()}`;
        console.log(`[DeepResearchAgent] 🔄 知识注入状态已重置，新会话ID: ${this.currentSessionId}`);
    }
}