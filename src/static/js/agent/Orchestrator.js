// src/static/js/agent/Orchestrator.js - 完整修改版

/**
 * @class Orchestrator
 * @description 智能路由器 + 组装工厂：专用DeepResearch Agent模式，100%向后兼容
 */

// 🎯 导入专用Agent核心组件
import { DeepResearchAgent } from './deepresearch/DeepResearchAgent.js';

// 🎯 保留工作流组件（向后兼容）
import { WorkflowEngine } from './WorkflowEngine.js';
import { WorkflowUI } from './WorkflowUI.js';

// 🎯 保留工具系统
import { ToolFactory } from './tools/ToolImplementations.js';

// 🎯 保留现有组件（确保向后兼容）
import { getSkillsRegistry } from '../tool-spec-system/generated-skills.js';
import { mcpToolsMap } from '../tools_mcp/tool-definitions.js';
import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';

export class Orchestrator {
    constructor(chatApiHandler, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.config = config;
        
        console.log('[Orchestrator] 创建专用研究路由器实例（等待开关触发）...');
        
        // 🎯 关键修改：标记初始化状态
        this._isInitialized = false;
        this._initState = 'created'; // created -> initializing -> initialized -> failed
        this._initializationPromise = null;
        this._pendingInitWaiters = [];
        
        // 🎯 基础状态 - 开关控制
        this.isEnabled = config.enabled !== false;
        this.currentWorkflow = null;
        this.currentContext = null;
        
        // 🎯 专用Agent模式标识
        this.agentMode = 'deep_research';
        
        // 🎯 研究工具配置
        this.researchTools = ['tavily_search', 'crawl4ai', 'python_sandbox'];
        this.researchToolPriorities = {
            'tavily_search': 10,    // 搜索工具最高优先级
            'crawl4ai': 9,          // 网页抓取次高
            'python_sandbox': 5     // 代码解释器较低优先级（仅用于数据分析）
        };
        
        // 🎯 轻量级初始化 - 只设置基础结构
        this.callbackManager = new CallbackManager();
        this.skillManager = null; // 延迟初始化
        this.workflowEngine = null; // 延迟初始化
        this.deepResearchAgent = null; // 🆕 替换通用agentSystem
        this.tools = {}; // 延迟初始化
        this.researchToolsSet = {}; // 🆕 专门的研究工具集
        
        console.log('[Orchestrator] 实例创建完成（等待开关触发初始化）');
    }

    /**
     * 🎯 修改：真正的初始化方法（专用研究Agent）
     */
    async _realInitialize() {
        if (this._initState === 'initialized') {
            console.log('[Orchestrator] 已初始化，跳过重复初始化');
            return true;
        }
        
        if (this._initState === 'initializing') {
            console.log('[Orchestrator] 正在初始化中，等待完成...');
            return this._initializationPromise;
        }
        
        this._initState = 'initializing';
        console.log('[Orchestrator] 开始按需初始化（专用研究模式）...');
        
        this._initializationPromise = (async () => {
            try {
                const initStartTime = Date.now();
                
                // 🎯 1. 初始化技能管理器（保持不变）
                console.log('[Orchestrator] 初始化技能管理器...');
                this.skillManager = new EnhancedSkillManager();
                await this.skillManager.waitUntilReady();
                
                // 🎯 2. 初始化工作流引擎（保持不变）
                console.log('[Orchestrator] 初始化工作流引擎...');
                this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
                
                // 🎯 3. 初始化工作流UI（保持不变）
                console.log('[Orchestrator] 初始化工作流UI...');
                this.workflowUI = new WorkflowUI(this.config.containerId);
                
                // 🎯 4. 初始化工具系统（保持不变）
                console.log('[Orchestrator] 初始化工具系统...');
                this.tools = await this._initializeTools();
                
                // 🎯 5. 🆕 初始化专用研究工具集
                console.log('[Orchestrator] 初始化专用研究工具集...');
                this.researchToolsSet = this._initializeResearchTools();
                
                // 🎯 6. 🆕 初始化专用DeepResearch Agent（使用研究工具集）
                console.log('[Orchestrator] 初始化专用DeepResearch Agent...');
                this.deepResearchAgent = this._initializeDeepResearchAgent();
                
                // 🎯 7. 设置处理器和事件监听
                this.setupHandlers();
                this.setupEventListeners();
                
                this._initState = 'initialized';
                this._isInitialized = true;
                
                const initTime = Date.now() - initStartTime;
                console.log(`[Orchestrator] 专用研究模式初始化完成 (${initTime}ms)`, {
                    allToolsCount: Object.keys(this.tools).length,
                    researchToolsCount: Object.keys(this.researchToolsSet).length,
                    researchTools: Object.keys(this.researchToolsSet),
                    agentMode: this.agentMode
                });
                
                this._notifyInitWaiters(null, true);
                return true;
                
            } catch (error) {
                console.error('[Orchestrator] 专用研究模式初始化失败:', error);
                this._initState = 'failed';
                
                // 🎯 进入降级模式
                await this._enterFallbackMode(error);
                this._notifyInitWaiters(error, false);
                throw error;
            }
        })();
        
        return this._initializationPromise;
    }

    /**
     * 🎯 新增：初始化专用研究工具集
     */
    _initializeResearchTools() {
        const researchTools = {};
        
        this.researchTools.forEach(toolName => {
            if (this.tools[toolName]) {
                researchTools[toolName] = this.tools[toolName];
                console.log(`[Orchestrator] 添加研究工具: ${toolName}`);
            } else {
                console.warn(`[Orchestrator] 研究工具 ${toolName} 不存在，跳过`);
            }
        });
        
        if (Object.keys(researchTools).length === 0) {
            console.warn('[Orchestrator] 无可用研究工具，研究模式将不可用');
        }
        
        return researchTools;
    }

    /**
     * 🎯 修改：初始化专用DeepResearch Agent
     */
    _initializeDeepResearchAgent() {
        try {
            // 🎯 检查研究工具是否可用
            if (Object.keys(this.researchToolsSet).length === 0) {
                console.warn('[Orchestrator] 无可用研究工具，跳过专用研究Agent初始化');
                return null;
            }
            
            // 🎯 创建专用研究Agent实例，传入研究工具集
            const researchAgent = new DeepResearchAgent(
                this.chatApiHandler,
                this.researchToolsSet, // 🆕 传入研究工具集而非所有工具
                this.callbackManager,
                {
                    maxIterations: this.config.maxIterations || 6,
                    researchConfig: {
                        enableCompression: true,
                        maxSources: 15,
                        analysisDepth: 'comprehensive',
                        language: 'zh-CN'
                    }
                }
            );
            
            console.log('[Orchestrator] 专用DeepResearch Agent初始化成功');
            return researchAgent;
            
        } catch (error) {
            console.error('[Orchestrator] 专用研究Agent初始化失败:', error);
            return null;
        }
    }

    /**
     * 🎯 修改：处理用户请求 - 专用研究模式路由
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        // 🎯 确保已初始化
        if (!this._isInitialized) {
            console.warn('[Orchestrator] 未初始化，无法处理请求');
            return { enhanced: false, type: 'not_initialized' };
        }
        
        // 🎯 专用研究模式处理
        return await this._handleUserRequestInternal(userMessage, files, context);
    }

    /**
     * 🎯 修改：核心请求处理逻辑 - 专用研究模式
     */
    async _handleUserRequestInternal(userMessage, files = [], context = {}) {
        // 🎯 第一步：知识库优先检测
        if (await this._isKnowledgeBaseQuestion(userMessage)) {
            console.log('[Orchestrator] 检测到知识库问题，使用标准回复');
            return { enhanced: false, type: 'knowledge_base' };
        }
        
        this.currentContext = context;
        
        // 🎯 第二步：快速过滤短消息
        try {
            const trimmed = (userMessage || '').trim();
            const greetingRegex = /^\s*(hi|hello|hey|你好|嗨|您好|早安|晚上好)([.!?\s]|$)/i;
            if (trimmed.length <= 4 || greetingRegex.test(trimmed)) {
                console.log('[Orchestrator] 检测到短消息或问候，回退到标准对话');
                return { enhanced: false, type: 'standard_fallback' };
            }
        } catch (_e) {
            // ignore and continue routing
        }
        
        // 🎯 第三步：开关状态检查
        if (!this.isEnabled) {
            return { enhanced: false, type: 'standard_fallback' };
        }

        // 🎯 第四步：专用研究模式检测
        if (this._shouldUseDeepResearch(userMessage)) {
            console.log('[Orchestrator] 检测到深度研究意图，启用专用研究模式');
            return await this._handleWithDeepResearch(userMessage, context);
        }

        // 🎯 第五步：标准工具模式（完全向后兼容）
        try {
            console.log(`[Orchestrator] 处理用户请求: "${userMessage.substring(0, 100)}..."`);
            
            // 🎯 使用所有可用工具进行标准模式
            const availableTools = context.availableTools || Object.keys(this.tools);
            
            // 🎯 任务分析
            const taskAnalysis = await this.workflowEngine.analyzeTask(userMessage, {
                availableTools: availableTools,
                userMessage: userMessage
            });

            // 🎯 技能匹配
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, {
                ...context,
                availableTools: availableTools
            });

            console.log(`[Orchestrator] 路由分析完成:`, {
                complexity: taskAnalysis.complexity,
                score: taskAnalysis.score,
                workflowType: taskAnalysis.workflowType,
                matchedSkills: matchedSkills.length,
                availableTools: availableTools.length
            });

            // 🎯 智能路由决策
            if (matchedSkills && matchedSkills.length > 0) {
                // 🎯 单工具模式 - 现有系统
                console.log(`[Orchestrator] 路由决策 → 单工具模式`);
                return await this._handleWithSingleTool(userMessage, context, matchedSkills);
            } else {
                // 🎯 简单对话 - 现有系统
                console.log(`[Orchestrator] 路由决策 → 标准对话`);
                return { enhanced: false, type: 'standard_fallback' };
            }
            
        } catch (error) {
            console.error('[Orchestrator] 请求处理失败:', error);
            return { 
                enhanced: false, 
                type: 'standard_fallback',
                error: error.message 
            };
        }
    }

    /**
     * 🎯 修改：深度研究意图检测
     */
    _shouldUseDeepResearch(userMessage) {
        // 🎯 检查研究Agent是否可用
        if (!this.deepResearchAgent) {
            console.log('[Orchestrator] 深度研究Agent不可用，跳过研究模式');
            return false;
        }

        // 🎯 检查研究工具是否可用
        if (Object.keys(this.researchToolsSet).length === 0) {
            console.log('[Orchestrator] 无可用研究工具，跳过研究模式');
            return false;
        }

        const researchKeywords = [
            // 中文研究关键词
            '深度研究', '深入研究', '详细调查', '全面分析', '系统研究',
            '深度分析', '调研报告', '研究一下', '深度了解', '详细研究',
            '写一份报告', '做个调研', '分析报告', '研究报告', '调查分析',
            // 英文研究关键词
            'deep research', 'comprehensive analysis', 'thorough investigation',
            'research report', 'detailed analysis', 'systematic study',
            'write a report', 'conduct research', 'investigate thoroughly'
        ];

        const lowerMessage = userMessage.toLowerCase();
        const hasResearchIntent = researchKeywords.some(keyword => 
            lowerMessage.includes(keyword.toLowerCase())
        );

        // 🎯 长度检测：较长的查询更可能是研究任务
        const isLongQuery = userMessage.trim().length > 50;

        // 🎯 复杂度检测：包含多个主题的查询
        const hasMultipleTopics = (userMessage.match(/[、，,;；]/g) || []).length >= 1;

        const shouldUseResearch = hasResearchIntent || (isLongQuery && hasMultipleTopics);

        console.log('[Orchestrator] 研究意图分析:', {
            message: userMessage.substring(0, 100),
            hasResearchIntent,
            isLongQuery,
            hasMultipleTopics,
            shouldUseResearch,
            availableResearchTools: Object.keys(this.researchToolsSet)
        });

        return shouldUseResearch;
    }

    /**
     * 🎯 修改：专用研究模式处理
     */
    async _handleWithDeepResearch(userMessage, context) {
        if (!this.deepResearchAgent) {
            console.log('[Orchestrator] 深度研究Agent不可用，回退到单工具模式');
            // 🎯 使用研究工具集进行回退
            const researchContext = {
                ...context,
                availableTools: Object.keys(this.researchToolsSet)
            };
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, researchContext);
            return await this._handleWithSingleTool(userMessage, researchContext, matchedSkills);
        }

        try {
            console.log(`[Orchestrator] 启动专用深度研究处理...`);
            
            // 🎯 构建研究请求
            const researchRequest = {
                topic: userMessage,
                requirements: context.requirements || '',
                language: context.language || 'zh-CN',
                depth: this._determineResearchDepth(userMessage),
                focus: this._extractResearchFocus(userMessage),
                // 🆕 传递研究工具集
                availableTools: Object.keys(this.researchToolsSet)
            };

            // 🎯 执行深度研究
            const researchResult = await this.deepResearchAgent.conductResearch(researchRequest);

            // 🎯 格式化研究结果
            return this._formatResearchResult(researchResult);
            
        } catch (error) {
            console.error('[Orchestrator] 深度研究执行失败:', error);
            
            // 🎯 研究失败时优雅降级到研究工具的单工具模式
            console.log('[Orchestrator] 研究失败，降级到研究工具模式');
            const researchContext = {
                ...context,
                availableTools: Object.keys(this.researchToolsSet)
            };
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, researchContext);
            return await this._handleWithSingleTool(userMessage, researchContext, matchedSkills);
        }
    }

    /**
     * 🎯 修改：获取系统状态（包含研究工具集信息）
     */
    getStatus() {
        const baseStatus = {
            enabled: this.isEnabled,
            initialized: this._isInitialized,
            initState: this._initState,
            agentMode: this.agentMode,
            currentWorkflow: this.currentWorkflow ? {
                name: this.currentWorkflow.name,
                steps: this.currentWorkflow.steps.length
            } : null,
            tools: {
                allToolsCount: Object.keys(this.tools).length,
                researchToolsCount: Object.keys(this.researchToolsSet).length,
                allTools: Object.keys(this.tools),
                researchTools: Object.keys(this.researchToolsSet)
            },
            callbackManager: this.callbackManager.getStatus()
        };

        // 🎯 修改：包含专用研究Agent状态
        if (this.deepResearchAgent) {
            baseStatus.deepResearchAgent = {
                isAvailable: true,
                mode: 'specialized',
                status: this.deepResearchAgent.getStatus(),
                tools: Object.keys(this.researchToolsSet) // 🆕 显示研究工具
            };
        }

        return baseStatus;
    }

    // 🎯 保留所有现有的辅助方法和兼容性方法
    // ============================================
    // 以下方法保持不变，确保100%向后兼容
    // ============================================

    /**
     * 🎯 初始化工具系统（保持不变）
     */
    async _initializeTools() {
        try {
            const skills = getSkillsRegistry();
            const toolDefinitions = {};
            
            for (const [skillName, skillData] of skills.entries()) {
                const toolName = skillData.metadata.tool_name;
                const toolSchema = mcpToolsMap[toolName]?.function?.parameters;
                
                if (!toolSchema) {
                    console.warn(`[Orchestrator] 跳过工具 ${toolName}：未在tool-definitions中找到schema`);
                    continue;
                }
                
                toolDefinitions[toolName] = {
                    name: toolName,
                    description: skillData.metadata.description,
                    schema: toolSchema
                };
            }
            
            const tools = ToolFactory.createTools(toolDefinitions, this.chatApiHandler);
            
            console.log(`[Orchestrator] 工具系统组装完成，可用工具: ${Object.keys(tools).join(', ')}`);
            return tools;
            
        } catch (error) {
            console.error('[Orchestrator] 工具系统初始化失败:', error);
            return {};
        }
    }

    /**
     * 🎯 单工具处理（完全向后兼容）
     */
    async _handleWithSingleTool(userMessage, context, matchedSkills) {
        try {
            if (matchedSkills && matchedSkills.length > 0) {
                const bestSkill = matchedSkills[0];
                // 🎯 修改：优先使用研究工具集，如果没有则使用所有工具
                const tool = this.researchToolsSet[bestSkill.toolName] || this.tools[bestSkill.toolName];
                
                if (tool) {
                    console.log(`[Orchestrator] 执行单工具: ${bestSkill.toolName}`);
                    
                    const defaultInput = this._buildDefaultToolInput(bestSkill.toolName, userMessage);
                    const result = await tool.invoke(defaultInput);
                    
                    return {
                        enhanced: true,
                        type: 'single_tool',
                        toolUsed: bestSkill.toolName,
                        content: result.output,
                        success: result.success,
                        isMultiStep: false
                    };
                }
            }
            
            return { enhanced: false, type: 'standard_fallback' };
            
        } catch (error) {
            console.error('[Orchestrator] 单工具执行失败:', error);
            return { 
                enhanced: false, 
                type: 'standard_fallback',
                error: error.message 
            };
        }
    }

    /**
     * 🎯 构建默认工具输入（保持不变）
     */
    _buildDefaultToolInput(toolName, userMessage) {
        const defaultInputs = {
            'python_sandbox': { code: `# ${userMessage}\nprint("执行用户请求")` },
            'tavily_search': { query: userMessage },
            'firecrawl': { 
                mode: 'scrape', 
                parameters: { url: userMessage.includes('http') ? userMessage : `https://example.com/search?q=${encodeURIComponent(userMessage)}` }
            },
            'stockfish_analyzer': { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', mode: 'evaluate_position' },
            'crawl4ai': { mode: 'scrape', parameters: { url: userMessage } },
            'glm4v_analyze_image': { 
                model: 'glm-4v-flash', 
                image_url: userMessage.match(/https?:\/\/[^\s]+/)?.[0] || 'https://example.com/image.jpg',
                prompt: '分析这张图片'
            }
        };
        
        return defaultInputs[toolName] || { input: userMessage };
    }

    /**
     * 🎯 知识库问题检测（保持不变）
     */
    async _isKnowledgeBaseQuestion(userMessage) {
        const trimmedMessage = userMessage.trim();
        
        // 🎯 真正的知识库问题模式（严格匹配）
        const knowledgeBasePatterns = [
            /^(hi|hello|hey|你好|嗨|您好|早安|晚上好)[\s.!?]*$/i, // 仅问候语
            /^(你是谁|你是什么|你能做什么|你有什么功能)[\s.?]*$/i, // 仅关于AI自身
            /^(help|帮助|救命|怎么用)[\s.?]*$/i, // 仅帮助请求
            /^(谢谢|thank you|thanks)[\s.!?]*$/i, // 仅感谢
            /^(bye|再见|拜拜)[\s.!?]*$/i // 仅告别
        ];
        
        const isSimpleQuestion = knowledgeBasePatterns.some(pattern =>
            pattern.test(trimmedMessage)
        );
        
        // 🎯 放宽短消息判断：只有非常短且没有具体内容的才算
        const isShortMessage = trimmedMessage.length < 10 &&
                              !trimmedMessage.includes('?') &&
                              !trimmedMessage.includes('？');
        
        // 🎯 工具意图检测：包含这些关键词的应该使用工具
        const toolKeywords = [
            '搜索', '查询', '查找', '搜一下', '查一下',
            '爬取', '抓取', '提取', '获取',
            '分析', '解析', '处理', '计算',
            '执行', '运行', '代码', '编程',
            'python', 'crawl', 'scrape', 'search',
            '报告', '研究', '调查', '调研'
        ];
        
        const hasToolIntent = toolKeywords.some(keyword =>
            trimmedMessage.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // 🎯 修复逻辑：只有是简单问题OR短消息，且没有工具意图，才认为是知识库问题
        const isKnowledgeBase = (isSimpleQuestion || isShortMessage) && !hasToolIntent;
        
        console.log('[Orchestrator] 知识库检测分析:', {
            message: trimmedMessage.substring(0, 50),
            isSimpleQuestion,
            isShortMessage,
            hasToolIntent,
            isKnowledgeBase
        });
        
        return isKnowledgeBase;
    }

    /**
     * 🎯 确定研究深度（保持不变）
     */
    _determineResearchDepth(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        if (lowerMessage.includes('深度') || lowerMessage.includes('详细') || 
            lowerMessage.includes('全面') || lowerMessage.includes('系统')) {
            return 'deep';
        }
        
        if (lowerMessage.includes('简要') || lowerMessage.includes('简单') || 
            lowerMessage.includes('快速')) {
            return 'quick';
        }
        
        return 'standard';
    }

    /**
     * 🎯 提取研究重点（保持不变）
     */
    _extractResearchFocus(userMessage) {
        const focusAreas = [];
        const lowerMessage = userMessage.toLowerCase();
        
        // 简单关键词匹配提取研究重点
        if (lowerMessage.includes('趋势') || lowerMessage.includes('发展')) {
            focusAreas.push('trends');
        }
        if (lowerMessage.includes('技术') || lowerMessage.includes('原理')) {
            focusAreas.push('technology');
        }
        if (lowerMessage.includes('应用') || lowerMessage.includes('场景')) {
            focusAreas.push('applications');
        }
        if (lowerMessage.includes('挑战') || lowerMessage.includes('问题')) {
            focusAreas.push('challenges');
        }
        if (lowerMessage.includes('未来') || lowerMessage.includes('前景')) {
            focusAreas.push('future');
        }
        
        return focusAreas.length > 0 ? focusAreas : ['comprehensive'];
    }

    /**
     * 🎯 格式化研究结果（保持不变）
     */
    _formatResearchResult(researchResult) {
        if (!researchResult.success) {
            return {
                enhanced: true,
                type: 'research_error',
                content: `🔍 深度研究失败: ${researchResult.report}`,
                success: false,
                researchRunId: researchResult.researchState?.sessionId,
                fallback: true // 允许降级
            };
        }

        let content = researchResult.report;
        
        // 🎯 添加研究执行摘要
        if (researchResult.researchState) {
            const duration = researchResult.duration;
            const phase = researchResult.researchState.phase;
            
            content += `\n\n---\n**🔍 深度研究执行摘要**\n`;
            content += `研究耗时: ${duration}ms | 完成阶段: ${phase}\n`;
            content += `研究模式: 专用深度研究Agent | 工具: 智能规划自主执行`;
        }

        return {
            enhanced: true,
            type: 'research_result',
            content: content,
            success: researchResult.success,
            researchRunId: researchResult.researchState?.sessionId,
            researchState: researchResult.researchState,
            isMultiStep: true,
            iterations: researchResult.researchState?.currentStep || 1
        };
    }

    /**
     * 🎯 进入降级模式（保持不变）
     */
    async _enterFallbackMode(error) {
        console.warn('[Orchestrator] 进入降级模式，专用研究功能受限');
        
        // 🎯 确保基础组件可用
        if (!this.workflowEngine) {
            this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
        }
        
        if (!this.workflowUI) {
            this.workflowUI = new WorkflowUI(this.config.containerId);
        }
        
        // 🎯 创建基础工具集
        if (Object.keys(this.tools).length === 0) {
            this.tools = this._createFallbackTools();
        }
        
        // 🎯 初始化研究工具集
        this.researchToolsSet = this._initializeResearchTools();
        
        // 🎯 标记研究Agent不可用
        this.deepResearchAgent = null;
        
        this._isInitialized = true; // 标记为已初始化（降级模式）
        console.log('[Orchestrator] 降级模式初始化完成');
    }

    // 🎯 保留所有现有的设置方法
    setupHandlers() {
        try {
            this._setupResearchEventHandlers();
            
            // 保留现有的中间件注册
            import('./middlewares/PerformanceMonitorMiddleware.js').then(module => {
                const PerformanceMonitorMiddleware = module.PerformanceMonitorMiddleware;
                this.callbackManager.addMiddleware(new PerformanceMonitorMiddleware());
                console.log('✅ 性能监控中间件已注册');
            }).catch(error => {
                console.warn('❌ 性能监控中间件加载失败:', error);
            });

            import('./middlewares/SmartRetryMiddleware.js').then(module => {
                const SmartRetryMiddleware = module.SmartRetryMiddleware;
                this.callbackManager.addMiddleware(new SmartRetryMiddleware({
                    maxRetries: 3,
                    baseDelay: 1000
                }));
                console.log('✅ 智能重试中间件已注册');
            }).catch(error => {
                console.warn('❌ 智能重试中间件加载失败:', error);
            });

            console.log('[Orchestrator] 专用研究处理器设置完成');

        } catch (error) {
            console.error('❌ 处理器注册失败:', error);
        }
    }

    /**
     * 🎯 专用研究事件处理器（保持不变）
     */
    _setupResearchEventHandlers() {
        this.callbackManager.addHandler({
            on_research_start: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_started', {
                    detail: {
                        ...eventData,
                        agentType: 'deep_research'
                    }
                }));
            },
            on_research_progress: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:iteration_update', {
                    detail: {
                        ...eventData,
                        agentType: 'deep_research'
                    }
                }));
            },
            on_research_phase_changed: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:thinking', {
                    detail: {
                        content: `研究阶段: ${eventData.data.phase}`,
                        type: 'research_phase',
                        agentType: 'deep_research'
                    }
                }));
            },
            on_research_end: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_completed', {
                    detail: {
                        result: eventData.data,
                        agentType: 'deep_research'
                    }
                }));
            }
        });
        
        console.log('✅ 专用研究事件处理器已注册');
    }

    setupEventListeners() {
        // 🎯 保持现有的工作流事件监听
        document.addEventListener('workflow:workflow-start', async () => {
            const result = await this.startWorkflowExecution();
            this._emitWorkflowResult(result);
        });
        
        document.addEventListener('workflow:workflow-skip', () => {
            const result = this._skipWorkflow();
            this._emitWorkflowResult(result);
        });

        console.log('[Orchestrator] 事件监听器设置完成');
    }

    /**
     * 🎯 新增：创建降级工具集
     */
    _createFallbackTools() {
        console.log('[Orchestrator] 创建降级工具集：仅提供基础功能');
        return {};
    }

    // 🎯 保留所有现有的兼容性方法
    ensureInitialized() {
        if (this._initState === 'initialized') return Promise.resolve(true);
        if (this._initState === 'initializing') {
            return new Promise((resolve, reject) => {
                this._pendingInitWaiters.push({ resolve, reject });
            });
        }
        
        // 🎯 关键修改：只有开关启用时才真正初始化
        if (this.isEnabled) {
            return this._realInitialize();
        } else {
            console.log('[Orchestrator] 开关未启用，跳过初始化');
            return false;
        }
    }

    _notifyInitWaiters(err, result) {
        for (const w of this._pendingInitWaiters) {
            try {
                if (err) w.reject(err);
                else w.resolve(result);
            } catch (e) {
                console.warn('[Orchestrator] notify waiter failed:', e);
            }
        }
        this._pendingInitWaiters = [];
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Orchestrator] ${enabled ? '启用' : '禁用'}专用研究路由`);
        
        if (enabled && !this._isInitialized) {
            console.log('[Orchestrator] 开关启用，触发初始化...');
            this.ensureInitialized().catch(error => {
                console.error('[Orchestrator] 开关触发初始化失败:', error);
            });
        }
    }

    registerTool(toolInstance) {
        if (this.tools[toolInstance.name]) {
            console.warn(`[Orchestrator] 工具 ${toolInstance.name} 已存在，跳过注册`);
            return;
        }
        
        this.tools[toolInstance.name] = toolInstance;
        console.log(`[Orchestrator] 注册新工具: ${toolInstance.name}`);
    }

    destroy() {
        this.currentWorkflow = null;
        this.currentContext = null;
        
        if (this.deepResearchAgent) {
            this.deepResearchAgent = null;
        }
        
        this.callbackManager.clearCurrentRun();
        
        console.log('[Orchestrator] 资源清理完成');
    }
}