// src/static/js/agent/Orchestrator.js - 多模式关键词触发版（增加使用指南功能）

import { getSkillsRegistry } from '../tool-spec-system/generated-skills.js';
import { mcpToolsMap } from '../tools_mcp/tool-definitions.js';
import { CallbackManager } from './CallbackManager.js';
import { DeepResearchAgent } from './deepresearch/DeepResearchAgent.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';
import { ToolFactory } from './tools/ToolImplementations.js';

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
        this._initializationPromise = (async () => {
            try {
                // 仅初始化Agent所需组件
                this.skillManager = new EnhancedSkillManager();
                await this.skillManager.waitUntilReady();
                this.tools = await this._initializeTools();
                this.researchToolsSet = this._initializeResearchTools();
                this.deepResearchAgent = this._initializeDeepResearchAgent();
                this.setupHandlers();
                
                this._initState = 'initialized';
                this._isInitialized = true;
                console.log(`[Orchestrator] 初始化完成。可用研究工具:`, Object.keys(this.researchToolsSet));
                return true;
            } catch (error) {
                console.error('[Orchestrator] 初始化失败:', error);
                this._initState = 'failed';
                this.isEnabled = false;
                return false;
            }
        })();
        return this._initializationPromise;
    }

    /**
     * 🎯 关键路由逻辑: 开关 + 多模式关键词双重检查
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        await this.ensureInitialized();

        // 1. 检查总开关是否打开且系统已初始化
        if (!this.isEnabled || !this._isInitialized) {
            return { enhanced: false, type: 'standard_fallback' };
        }

        // 2. ✨ 新增：检查是否是使用指南请求
        const guideDetection = this._detectUserGuideRequest(userMessage);
        if (guideDetection.shouldShow) {
            console.log('[Orchestrator] 检测到使用指南请求，返回使用指南');
            return {
                enhanced: true,
                type: 'user_guide',
                content: this._getUserGuideContent()
            };
        }

        // 3. ✨ 增强：使用新的多模式检测方法
        const researchDetection = this._detectAndExtractTopic(userMessage);

        if (researchDetection.shouldStart) {
            console.log(`[Orchestrator] 检测到关键词"${researchDetection.matchedKeyword}"，启动${researchDetection.mode}研究模式...`);
            return await this._handleWithDeepResearch(researchDetection.cleanTopic, context);
        }

        // 4. 否则，明确回退到标准模式
        console.log('[Orchestrator] 未检测到Agent触发词，回退到标准模式。');
        return { enhanced: false, type: 'standard_fallback' };
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

我们目前支持以下五种专业的研究模式，每种模式都有其独特的分析框架和报告格式：

| 模式关键词 | 研究模式 | 最佳应用场景 | 最终报告特点 |
|-----------|----------|-------------|-------------|
| **标准报告** | \`standard\` | 快速、全面地了解一个主题，获取关键信息和背景。 | 结构清晰、内容全面、字数适中（约800-1200字）的标准研究报告。 |
| **深度研究** | \`deep\` | 对复杂问题进行根本性的、多维度的解构与分析，并提出创新性解决方案。 | 极其深入、包含辩证思考和解决方案的专业咨询报告（约2500-3500字）。 |
| **学术论文** | \`academic\` | 对某个领域或问题进行符合学术规范的研究，侧重理论框架和文献综述。 | 结构严谨，包含摘要、文献综述、方法论等部分的学术风格论文（约2500-3500字）。 |
| **商业分析** | \`business\` | 从商业视角分析市场、竞争、机会与风险，并提出可行的战略建议。 | 聚焦商业价值，包含市场数据、竞争分析和战略路线图的商业报告（约1500-2500字）。 |
| **技术文档** | \`technical\` | 对某项技术进行深入剖析，包括其架构、实现、性能和最佳实践。 | 技术细节准确，包含架构设计、性能指标和实现方案的技术文档（约1800-2800字）。 |

## 💡 使用示例

您只需像平常聊天一样输入即可：

**示例1 (标准模式)**:
\`\`\`
摇滚红与黑的故事和主创 标准报告
\`\`\`

**示例2 (深度研究模式)**:
\`\`\`
人工智能对未来教育行业的影响 深度研究
\`\`\`

**示例3 (学术论文模式)**:
\`\`\`
机器学习在糖尿病视网膜病变诊断中的应用 学术论文
\`\`\`

**示例4 (商业分析模式)**:
\`\`\`
2025年全球电动汽车市场发展趋势 商业分析
\`\`\`

## ⚠️ 注意事项

- **关键词优先级**: 如果您输入了多个关键词（如"深度研究 商业分析"），系统会优先匹配更具体、更专业的模式（在此例中为"商业分析"）。
- **处理时间**: 深度研究通常需要2-5分钟，具体取决于主题复杂度和信息获取难度。
- **资料来源**: 所有报告都会自动附加资料来源，确保信息的可追溯性。

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
        // ✨ 关键词按特异性从高到低排序，确保更具体的模式被优先匹配
        const keywords = {
            '学术论文': 'academic', 
            '商业分析': 'business',
            '技术文档': 'technical',
            '深度研究': 'deep',
            '标准报告': 'standard'
        };

        const lowerMessage = userMessage.trim().toLowerCase();
        let matchedKeyword = '';
        let detectedMode = 'standard';

        // 遍历关键词，找到第一个匹配的
        for (const [keyword, mode] of Object.entries(keywords)) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                matchedKeyword = keyword;
                detectedMode = mode;
                break; // 找到第一个匹配就停止
            }
        }

        // 如果没有匹配到任何关键词
        if (!matchedKeyword) {
            return { 
                shouldStart: false,
                mode: 'standard',
                matchedKeyword: '',
                cleanTopic: userMessage
            };
        }

        // ✨ 清理话题：移除检测到的关键词
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
            originalTopic: userMessage,
            cleanTopic: cleanTopic || userMessage // 如果清理后为空，使用原消息
        };
    }

    /**
     * 🎯 增强：处理深度研究请求
     */
    async _handleWithDeepResearch(cleanTopic, context) {
        try {
            // 🎯 获取研究工具的定义（名称+描述），交给LLM去选择
            const availableToolDefinitions = (await this.skillManager.baseSkillManager.getAllSkills())
                .filter(skill => this.researchTools.includes(skill.tool_name));

            const researchRequest = {
                topic: cleanTopic,
                availableTools: availableToolDefinitions
            };

            const researchResult = await this.deepResearchAgent.conductResearch(researchRequest);

            console.log('[Orchestrator] DeepResearch 完成:', {
                success: researchResult.success,
                iterations: researchResult.iterations,
                reportLength: researchResult.report?.length,
                sourcesCount: researchResult.sources?.length || 0,
                researchMode: researchResult.research_mode
            });

            return {
                enhanced: true,
                type: 'research_result',
                content: researchResult.report,
                success: researchResult.success,
                iterations: researchResult.iterations,
                intermediateSteps: researchResult.intermediateSteps,
                sources: researchResult.sources,
                researchMode: researchResult.research_mode
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
    
    // --- 辅助函数 ---
    _initializeResearchTools() {
        const tools = {};
        this.researchTools.forEach(name => {
            if (this.tools[name]) tools[name] = this.tools[name];
        });
        return tools;
    }

    _initializeDeepResearchAgent() {
        if (Object.keys(this.researchToolsSet).length === 0) return null;
        return new DeepResearchAgent(this.chatApiHandler, this.researchToolsSet, this.callbackManager, { maxIterations: 8 });
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
        // 这些事件会由AgentThinkingDisplay.js监听来更新UI
        this.callbackManager.addHandler({
            on_research_start: (e) => window.dispatchEvent(new CustomEvent('agent:session_started', { detail: { ...e, agentType: 'deep_research' } })),
            on_research_progress: (e) => window.dispatchEvent(new CustomEvent('agent:iteration_update', { detail: { ...e, agentType: 'deep_research' } })),
            on_agent_think_start: (e) => window.dispatchEvent(new CustomEvent('agent:thinking', { detail: { content: '正在规划下一步...', type: 'thinking', agentType: 'deep_research' } })),
            on_tool_start: (e) => window.dispatchEvent(new CustomEvent('agent:thinking', { detail: { content: `正在执行工具: ${e.data.tool_name}`, type: 'action', agentType: 'deep_research' } })),
            on_tool_end: (e) => {
                const outputPreview = e.data.output || '';
                window.dispatchEvent(new CustomEvent('agent:thinking', {
                    detail: {
                        content: `工具执行完成。结果: ${outputPreview.substring(0, 100)}...`,
                        type: 'result',
                        agentType: 'deep_research'
                    }
                }));
            },
            on_research_end: (e) => window.dispatchEvent(new CustomEvent('agent:session_completed', { detail: { result: e.data, agentType: 'deep_research' } })),
        });
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Orchestrator] Agent模式已 ${enabled ? '启用' : '禁用'}`);
        if (enabled && !this._isInitialized) {
            this.ensureInitialized();
        }
    }
}