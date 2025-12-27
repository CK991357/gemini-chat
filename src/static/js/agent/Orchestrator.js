// src/static/js/agent/Orchestrator.js - 最终修复版

import { getSkillsRegistry } from '../tool-spec-system/generated-skills.js';
import { mcpToolsMap } from '../tools_mcp/tool-definitions.js';
import { CallbackManager } from './CallbackManager.js';
import { DeepResearchAgent } from './deepresearch/DeepResearchAgent.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';
import { ToolFactory } from './tools/ToolImplementations.js';
import { promptModelSelection } from './WorkflowUI.js';

export class Orchestrator {
    constructor(chatApiHandler, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.config = config;
        this._isInitialized = false;
        this._initState = 'created';
        this._initializationPromise = null;
        this.isEnabled = config.enabled !== false;

        this.agentMode = 'deep_research';
        this.deepResearchAgent = null;
        this.researchToolsSet = {};
        this.researchTools = ['tavily_search', 'crawl4ai', 'python_sandbox'];

        this.callbackManager = new CallbackManager();
        this.skillManager = null;
        this.tools = {};
        console.log('[Orchestrator] 实例已创建，等待开关触发初始化。');
    }

    async ensureInitialized() {
        if (this._initState === 'initialized') return true;
        if (this._initState === 'initializing') return this._initializationPromise;
        if (this.isEnabled) {
            return this._realInitialize();
        }
        return false;
    }

    async _realInitialize() {
        this._initState = 'initializing';
        console.log('[Orchestrator] 按需初始化...');
        
        try {
            this.skillManager = new EnhancedSkillManager();
            await this.skillManager.waitUntilReady();
            
            this.tools = await this._initializeTools();
            this.researchToolsSet = this._initializeResearchTools();
            this.deepResearchAgent = this._initializeDeepResearchAgent();
            this.setupHandlers();
            
            this._initState = 'initialized';
            this._isInitialized = true;
            console.log(`[Orchestrator] 初始化完成。可用研究工具:`, Object.keys(this.researchToolsSet));
            this._initializationPromise = Promise.resolve(true);
            return true;
        } catch (error) {
            console.error('[Orchestrator] 初始化失败:', error);
            this._initState = 'failed';
            this.isEnabled = false;
            this._initializationPromise = Promise.resolve(false);
            return false;
        }
    }

    /**
     * 🎯 关键路由逻辑: 开关 + 多模式关键词双重检查
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        await this.ensureInitialized();

        if (!this.isEnabled || !this._isInitialized) {
            return { enhanced: false, type: 'standard_fallback' };
        }

        const guideDetection = this._detectUserGuideRequest(userMessage);
        if (guideDetection.shouldShow) {
            console.log('[Orchestrator] 检测到使用指南请求，返回使用指南');
            return {
                enhanced: true,
                type: 'user_guide',
                content: this._getUserGuideContent()
            };
        }

        const researchDetection = this._detectAndExtractTopic(userMessage);

        if (researchDetection.shouldStart) {
            console.log(`[Orchestrator] 检测到关键词"${researchDetection.matchedKeyword}"，启动${researchDetection.mode}研究模式...`);
            return await this._handleWithDeepResearch(researchDetection.cleanTopic, researchDetection.originalTopic, context, researchDetection.mode);
        }

        console.log('[Orchestrator] 未检测到Agent触发词，回退到标准模式。');
        return { enhanced: false, type: 'standard_fallback' };
    }

    /**
     * 🎯 增强：处理深度研究请求 - 整合 Skill 系统
     */
    async _handleWithDeepResearch(cleanTopic, originalTopic, context, detectedMode) {
        try {
            // 🔥🔥🔥 [新增核心逻辑] 弹出模型选择对话框 🔥🔥🔥
            const reportModel = await promptModelSelection();
            console.log(`[Orchestrator] 用户已选择报告模型: ${reportModel}`);

            console.log('[Orchestrator] 正在为 Agent 查找相关技能...');
            
            // 🎯 核心优化：使用新的优化注入方法
            const { injectionContent, relevantSkills } = await this.generateOptimizedInjection(cleanTopic, detectedMode);

            let enrichedTopic = cleanTopic;

            if (injectionContent) {
                console.log(`[Orchestrator] ✅ 已生成优化技能注入内容 (${injectionContent.length} chars)`);
                
                enrichedTopic = `
## 📖 相关工具参考指南
${injectionContent}

---

## 🎯 核心研究任务
${cleanTopic}
`;
            } else {
                console.log('[Orchestrator] ✅ Agent使用自己的联邦知识库，不需要普通技能注入。');
            }

            // ✅ 修复：使用正确的路径调用 getAllSkills
            const availableToolDefinitions = (await this.skillManager.baseSkillManager.getAllSkills())
                .filter(skill => this.researchTools.includes(skill.tool_name));

            // 🔥 1. 准备初始上下文，获取当前日期
            const currentDate = new Date().toISOString().split('T')[0];

            // 🔥🔥🔥 [核心修改] 提取并传递 contextMessages 🔥🔥🔥
            // `context.messages` 由 `main.js` 的 `handleEnhancedHttpMessage` 传入
            const previousMessages = (context && context.messages) ? context.messages : [];

            // ✨✨✨ 核心修复：同时传递 cleanTopic 和 enrichedTopic ✨✨✨
            const researchRequest = {
                topic: enrichedTopic,           // 用于 Agent 思考的完整主题
                displayTopic: cleanTopic,       // 用于 UI 显示的原始主题
                originalUserInstruction: originalTopic, // 🎯 新增：传递原始用户指令
                availableTools: availableToolDefinitions,
                researchMode: detectedMode,
                currentDate: currentDate, // 🔥 2. 将当前日期添加到请求对象中

                // ✨ 新增：传递历史消息数组，供 Agent 使用历史上下文
                contextMessages: previousMessages,
                // 🔥🔥🔥 [新增] 传递用户选择的报告模型 🔥🔥🔥
                reportModel: reportModel
            };

            const researchResult = await this.deepResearchAgent.conductResearch(researchRequest);

            // 🔥 [最终方案] 占位符替换的“魔法”在这里发生
            if (researchResult.report && this.deepResearchAgent.generatedImages.size > 0) {
                const imageMap = this.deepResearchAgent.generatedImages;
                console.log(`[Orchestrator] 检测到 ${imageMap.size} 张图片，开始替换报告占位符...`);

                researchResult.report = researchResult.report.replace(
                    /!\[(.*?)\]\(placeholder:(.*?)\)/g,
                    (match, altText, imageId) => {
                        const imageData = imageMap.get(imageId.trim());
                        if (imageData) {
                            console.log(`[Orchestrator] 替换占位符: ${imageId}`);
                            return `![${altText}](data:image/png;base64,${imageData.image_base64})`;
                        }
                        return `*[图像 "${altText}" 加载失败]*`;
                    }
                );
            }

            console.log('[Orchestrator] DeepResearch 完成:', {
                success: researchResult.success,
                iterations: researchResult.iterations,
                reportLength: researchResult.report?.length,
                sourcesCount: researchResult.sources?.length || 0,
                researchMode: researchResult.research_mode
            });

            // 返回已经处理过的 researchResult
            return {
                enhanced: true,
                type: 'research_result',
                content: researchResult.report, // <-- 这里已经是包含 base64 图片的 markdown 了
                success: researchResult.success,
                iterations: researchResult.iterations,
                intermediateSteps: researchResult.intermediateSteps,
                sources: researchResult.sources,
                researchMode: researchResult.research_mode,
                temporal_quality: researchResult.temporal_quality,
                // 🔥 核心新增：将完整的用户原始消息返回，供上游保存到历史记录
                originalUserMessage: originalTopic,
                model: researchResult.model || reportModel  // 🎯 核心修复：添加模型信息
            };
        } catch (error) {
            console.error('[Orchestrator] DeepResearch Agent执行失败:', error);
            return { 
                enhanced: true, 
                type: 'research_error',
                content: `❌ 深度研究任务执行时发生错误: ${error.message}`,
                success: false
            };
        }
    }

    /**
     * 🎯 新增：使用指南请求检测
     */
    _detectUserGuideRequest(userMessage) {
        const guideKeywords = [
            '使用指南', '帮助', '怎么用', '使用方法', '使用说明',
            'user guide', 'help', 'usage guide', 'how to use'
        ];

        const lowerMessage = userMessage.trim().toLowerCase();
        
        for (const keyword of guideKeywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                return {
                    shouldShow: true,
                    matchedKeyword: keyword
                };
            }
        }

        return { shouldShow: false };
    }

    /**
     * 🎯 新增：获取使用指南内容
     */
    _getUserGuideContent() {
        return `# 🎯 高级研究代理使用指南

我们引入了全新的**高级研究代理 (Advanced Research Agent)** 模式。当您需要在普通问答之外，对一个主题进行深入、结构化的探索时，可以激活此功能。代理将模拟一名专业研究员，通过制定研究计划、执行多步工具调用（搜索、网页抓取等）、评估信息、动态调整策略，最终为您生成一份高质量、带资料来源的专业研究报告。

## 🚀 激活方式

激活高级研究代理非常简单，您只需要在您的研究主题后面，**附加一个模式关键词**即可。系统会自动识别并进入相应的研究模式。

**格式**: [您的研究主题] [模式关键词]

## 📊 研究模式对比

我们目前支持以下七种专业的研究模式：

| 模式关键词 | 研究模式 | 最佳应用场景 | 最终报告特点 |
|---|---|---|---|
| **调试模式** | \`standard\` | 根据任务对agent进行调试，生成调试报告。 | 结构清晰、内容全面、字数适中（约1200-1800字）的标准研究报告。 |
| **深度研究模式** | \`deep\` | 对复杂问题进行根本性的、多维度的解构与创新解决方案。 | 极其深入、包含辩证思考和解决方案的专业咨询报告（约2800-3500字）。 |
| **学术论文模式** | \`academic\` | 对已有学术论文的深度整理、验证与扩展分析。 | 严谨客观、验证导向的论文解析报告（约1800-2500字）。 |
| **行业分析模式** | \`business\` | 全面的行业现状扫描、竞争格局分析与发展趋势预测。 | 全景扫描、深度洞察的行业分析报告（约2200-3000字）。 |
| **技术实现模式** | \`technical\` | 技术需求的全套实现方案、代码示例与最佳实践。 | 技术准确、实践导向的实现文档（约2000-2800字）。 |
| **数据挖掘模式** | \`data_mining\` | 纯数据收集与整理 | 只包含原始数据表格，无任何AI观点 |

## 💡 使用示例

**调试模式示例**:
\`\`\`
任意驻主题 调试模式
\`\`\`

**深度研究模式示例**:
\`\`\`
人工智能对未来教育行业的影响 深度研究模式
\`\`\`

**学术论文模式示例**:
\`\`\`
分析《Attention Is All You Need》论文 学术论文模式
\`\`\`

**行业分析模式示例**:
\`\`\`
中国新能源汽车行业发展现状 行业分析模式
\`\`\`

**技术实现模式示例**:
\`\`\`
构建一个推荐系统 技术实现模式
\`\`\`

**数据挖掘模式**：
\`\`\`
2020-2024年人工智能论文发表数量 数据挖掘模式
\`\`\`

## ⚠️ 注意事项

- **关键词优先级**: 如果您输入了多个关键词（如"深度研究 商业分析"），系统会优先匹配更具体、更专业的模式（在此例中为"商业分析"）。
- **处理时间**: 深度研究通常需要2-5分钟，具体取决于主题复杂度和信息获取难度。
- **资料来源**: 所有报告都会自动附加资料来源，确保信息的可追溯性。
- **数据挖掘模式说明**: 该模式返回只呈现原始数据，不添加任何分析或评论，适合需要纯数据的场景。

## 🔍 研究过程

启动研究后，您将看到：
1. 📋 **研究计划** - 代理会制定详细的研究步骤
2. 🔄 **实时进度** - 显示当前迭代和工具使用情况  
3. 📊 **信息收集** - 自动从多个来源获取信息
4. 📝 **报告生成** - 基于收集的信息生成结构化报告

现在就开始体验智能研究代理的强大功能吧！只需在您的问题后加上模式关键词即可。`;
    }

    /**
     * 🎯 增强：多模式关键词检测与话题提取
     */
    _detectAndExtractTopic(userMessage) {
        const keywords = {
            '学术论文模式': 'academic',
            '行业分析模式': 'business',
            '技术实现模式': 'technical',
            '深度研究模式': 'deep',
            '调试模式': 'standard',
            '数据挖掘模式': 'data_mining'
        };

        const lowerMessage = userMessage.trim().toLowerCase();
        let matchedKeyword = '';
        let detectedMode = 'standard';

        for (const [keyword, mode] of Object.entries(keywords)) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                matchedKeyword = keyword;
                detectedMode = mode;
                break;
            }
        }

        if (!matchedKeyword) {
            return { 
                shouldStart: false,
                mode: 'standard',
                matchedKeyword: '',
                cleanTopic: userMessage
            };
        }

        const cleanTopic = userMessage.replace(new RegExp(matchedKeyword, 'gi'), '').trim();
        
        console.log(`[Orchestrator] 关键词检测结果:`, {
            original: userMessage,
            matchedKeyword,
            mode: detectedMode,
            cleanTopic
        });

        return {
            shouldStart: true,
            mode: detectedMode,
            matchedKeyword: matchedKeyword,
            originalTopic: userMessage, // 确保这里返回了完整的原始消息
            cleanTopic: cleanTopic || userMessage
        };
    }

    // --- 辅助函数 ---
    _initializeResearchTools() {
        const tools = {};
        this.researchTools.forEach(name => {
            if (this.tools[name]) tools[name] = this.tools[name];
        });
        return tools;
    }

    /**
     * 🎯 [核心修改] 初始化DeepResearchAgent时，注入skillManager依赖
     */
    _initializeDeepResearchAgent() {
        if (Object.keys(this.researchToolsSet).length === 0) return null;
        
        console.log('[Orchestrator] 正在初始化 DeepResearchAgent 并注入依赖...');

        return new DeepResearchAgent(
          this.chatApiHandler,
          this.researchToolsSet,
          this.callbackManager,
          {
            maxIterations: 8,
            // 🎯 关键：将 Orchestrator 持有的 skillManager 实例
            // 🎯 通过构造函数的 config 对象传递给 DeepResearchAgent。
            skillManager: this.skillManager
          }
        );
    }

    async _initializeTools() {
        try {
            const skills = getSkillsRegistry();
            const defs = {};
            for (const [_, skillData] of skills.entries()) {
                const toolName = skillData.metadata.tool_name;
                if (mcpToolsMap[toolName]) {
                    defs[toolName] = { name: toolName, description: skillData.metadata.description, schema: mcpToolsMap[toolName].function.parameters };
                }
            }
            return ToolFactory.createTools(defs, this.chatApiHandler);
        } catch (error) {
            console.error('[Orchestrator] 工具初始化失败:', error);
            return {};
        }
    }
    
    setupHandlers() {
        const forwardEvent = (eventName, newEventName) => {
            return (e) => window.dispatchEvent(new CustomEvent(newEventName, {
                detail: { data: e.data, result: e.data, agentType: 'deep_research' }
            }));
        };

        this.callbackManager.addHandler({
            'on_research_start': forwardEvent('on_research_start', 'research:start'),
            'on_research_plan_generated': forwardEvent('on_research_plan_generated', 'research:plan_generated'),
            'on_research_progress': forwardEvent('on_research_progress', 'research:progress_update'),
            'on_tool_start': forwardEvent('on_tool_start', 'research:tool_start'),
            'on_tool_end': forwardEvent('on_tool_end', 'research:tool_end'),
            'on_research_end': forwardEvent('on_research_end', 'research:end'),
            'on_research_stats_updated': forwardEvent('on_research_stats_updated', 'research:stats_updated'),
            'on_tool_called': forwardEvent('on_tool_called', 'research:tool_called'),
            'on_agent_think_start': (e) => window.dispatchEvent(new CustomEvent('agent:thinking', { detail: { content: '正在规划下一步...', type: 'thinking', agentType: 'deep_research' } })),
        });
        console.log('[Orchestrator] 最终版事件处理器已设置。');
    }

    /**
     * 🎯 优化版技能注入生成 - 为Agent模式完全跳过普通技能系统
     */
    async generateOptimizedInjection(userQuery, detectedMode) {
        console.log(`\n[Orchestrator] 🎯 AGENT管道启动`);
        console.log(`  模式: ${detectedMode}`);
        console.log(`  查询: ${userQuery.substring(0, 80)}...`);
        console.log(`  策略: Agent专用联邦知识库，按需自主检索`);
        
        // 🚀 直接返回空，让Agent使用自己的知识注入系统
        return { 
            injectionContent: '', 
            relevantSkills: [],
            skipReason: 'agent_dedicated_pipeline'
        };
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Orchestrator] Agent模式已 ${enabled ? '启用' : '禁用'}`);
        if (enabled && !this._isInitialized) {
            this.ensureInitialized();
        }
    }
}