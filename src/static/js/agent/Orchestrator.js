// src/static/js/agent/Orchestrator.js - 完整修改版

/**
 * @class Orchestrator
 * @description 智能路由器 + 组装工厂：专用DeepResearch Agent模式，100%向后兼容
 */

// 🎯 导入专用Agent核心组件（使用正确的deepresearch路径）
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
        this.agentMode = 'deep_research'; // 🆕 专用模式标识
        
        // 🎯 轻量级初始化 - 只设置基础结构
        this.callbackManager = new CallbackManager();
        this.skillManager = null; // 延迟初始化
        this.workflowEngine = null; // 延迟初始化
        this.deepResearchAgent = null; // 🆕 替换通用agentSystem
        this.tools = {}; // 延迟初始化
        
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
                
                // 🎯 5. 🆕 初始化专用DeepResearch Agent（替换通用Agent）
                console.log('[Orchestrator] 初始化专用DeepResearch Agent...');
                this.deepResearchAgent = this._initializeDeepResearchAgent();
                
                // 🎯 6. 设置处理器和事件监听
                this.setupHandlers();
                this.setupEventListeners();
                
                this._initState = 'initialized';
                this._isInitialized = true;
                
                const initTime = Date.now() - initStartTime;
                console.log(`[Orchestrator] 专用研究模式初始化完成 (${initTime}ms)`, {
                    toolsCount: Object.keys(this.tools).length,
                    agentMode: this.agentMode,
                    researchAgent: this.deepResearchAgent ? '已启用' : '未启用'
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
     * 🎯 新增：初始化专用DeepResearch Agent
     */
    _initializeDeepResearchAgent() {
        try {
            // 🎯 检查工具是否可用
            if (Object.keys(this.tools).length === 0) {
                console.warn('[Orchestrator] 无可用工具，跳过专用研究Agent初始化');
                return null;
            }
            
            // 🎯 创建专用研究Agent实例
            const researchAgent = new DeepResearchAgent(
                this.chatApiHandler,
                this.tools,
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
     * 🎯 修改：确保初始化的公共方法（保持不变）
     */
    async ensureInitialized() {
        if (this._initState === 'initialized') return true;
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
        // 🎯 第一步：知识库优先检测（保持不变）
        if (await this._isKnowledgeBaseQuestion(userMessage)) {
            console.log('[Orchestrator] 检测到知识库问题，使用标准回复');
            return { enhanced: false, type: 'knowledge_base' };
        }
        
        this.currentContext = context;
        
        // 🎯 第二步：快速过滤短消息（保持不变）
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
            
            // 🎯 任务分析（保持不变）
            const taskAnalysis = await this.workflowEngine.analyzeTask(userMessage, {
                availableTools: context.availableTools || [],
                userMessage: userMessage
            });

            // 🎯 技能匹配（保持不变）
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, context);

            console.log(`[Orchestrator] 路由分析完成:`, {
                complexity: taskAnalysis.complexity,
                score: taskAnalysis.score,
                workflowType: taskAnalysis.workflowType,
                matchedSkills: matchedSkills.length,
                availableTools: context.availableTools?.length || 'all'
            });

            // 🎯 智能路由决策（简化：只有研究模式和标准模式）
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
     * 🎯 新增：深度研究意图检测
     */
    _shouldUseDeepResearch(userMessage) {
        // 🎯 检查研究Agent是否可用
        if (!this.deepResearchAgent) {
            console.log('[Orchestrator] 深度研究Agent不可用，跳过研究模式');
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
            shouldUseResearch
        });

        return shouldUseResearch;
    }

    /**
     * 🎯 新增：专用研究模式处理
     */
    async _handleWithDeepResearch(userMessage, context) {
        if (!this.deepResearchAgent) {
            console.log('[Orchestrator] 深度研究Agent不可用，回退到单工具模式');
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, context);
            return await this._handleWithSingleTool(userMessage, context, matchedSkills);
        }

        try {
            console.log(`[Orchestrator] 启动专用深度研究处理...`);
            
            // 🎯 构建研究请求
            const researchRequest = {
                topic: userMessage,
                requirements: context.requirements || '',
                language: context.language || 'zh-CN',
                depth: this._determineResearchDepth(userMessage),
                focus: this._extractResearchFocus(userMessage)
            };

            // 🎯 执行深度研究
            const researchResult = await this.deepResearchAgent.conductResearch(researchRequest);

            // 🎯 格式化研究结果
            return this._formatResearchResult(researchResult);
            
        } catch (error) {
            console.error('[Orchestrator] 深度研究执行失败:', error);
            
            // 🎯 研究失败时优雅降级到单工具模式
            console.log('[Orchestrator] 研究失败，降级到单工具模式');
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, context);
            return await this._handleWithSingleTool(userMessage, context, matchedSkills);
        }
    }

    /**
     * 🎯 新增：确定研究深度
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
     * 🎯 新增：提取研究重点
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
     * 🎯 新增：格式化研究结果
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
     * 🎯 修改：进入降级模式
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
        
        // 🎯 标记研究Agent不可用
        this.deepResearchAgent = null;
        
        this._isInitialized = true; // 标记为已初始化（降级模式）
        console.log('[Orchestrator] 降级模式初始化完成');
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
                const tool = this.tools[bestSkill.toolName];
                
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
        const knowledgeBasePatterns = [
            /^(hi|hello|hey|你好|嗨|您好|早安|晚上好)/i,
            /^(你是谁|你是什么|你能做什么)/,
            /^(爱因斯坦|特斯拉|牛顿|物理|数学|科学)/i,
            /^(什么是|什么是|告诉我关于|解释一下)/,
            /^(你的能力|你能帮我|你有什么功能)/
        ];
        
        const isSimpleQuestion = knowledgeBasePatterns.some(pattern => 
            pattern.test(userMessage.trim())
        );
        
        const isShortMessage = userMessage.trim().length < 20;
        
        const toolKeywords = ['搜索', '爬取', '分析', '执行', '代码', 'python', '搜索', 'crawl'];
        const hasToolIntent = toolKeywords.some(keyword => 
            userMessage.toLowerCase().includes(keyword.toLowerCase())
        );
        
        return (isSimpleQuestion || isShortMessage) && !hasToolIntent;
    }

    /**
     * 🎯 工作流处理（完全向后兼容）- 保持您现有的方法
     */
    async _handleWithWorkflow(userMessage, taskAnalysis, files, context) {
        try {
            this.currentWorkflow = await this.workflowEngine.createWorkflow(userMessage, {
                ...context,
                files,
                taskAnalysis,
                callbackManager: this.callbackManager
            });
            
            if (!this.currentWorkflow) {
                console.log('[Orchestrator] 工作流创建失败，回退到标准模式');
                return { enhanced: false, type: 'standard_fallback' };
            }
            
            this.workflowUI.showWorkflow(this.currentWorkflow);
            
            return { 
                enhanced: true, 
                type: 'workflow_pending',
                workflow: this.currentWorkflow
            };
            
        } catch (error) {
            console.error('[Orchestrator] 工作流创建失败:', error);
            return { enhanced: false, type: 'standard_fallback' };
        }
    }

    /**
     * 🎯 工作流执行（完全向后兼容）
     */
    async startWorkflowExecution() {
        if (!this.currentWorkflow) {
            return { enhanced: false, type: 'error', content: '没有正在执行的工作流' };
        }
        
        try {
            const workflowStream = this.workflowEngine.stream(this.currentWorkflow, {
                apiHandler: this.chatApiHandler,
                apiKey: this.currentContext?.apiKey,
                model: this.currentContext?.model,
                stepOutputs: {},
                isCancelled: () => false
            });
            
            let finalResult = null;
            
            for await (const event of workflowStream) {
                await this.callbackManager.invokeEvent(event.event, {
                    name: event.name,
                    run_id: event.run_id,
                    data: event.data,
                    metadata: event.metadata
                });
                
                if (event.event === 'on_workflow_end') {
                    finalResult = event.data.result;
                }
            }
            
            return this._formatWorkflowResult(finalResult);
            
        } catch (error) {
            console.error('[Orchestrator] 工作流执行失败:', error);
            return this._formatErrorResult(error);
        }
    }

    // 🎯 保留所有现有的格式化方法
    _formatWorkflowResult(workflowResult) {
        if (!workflowResult) {
            return {
                type: 'error',
                success: false,
                content: '工作流执行无结果',
                enhanced: true
            };
        }

        return {
            type: 'workflow_result',
            success: workflowResult.success,
            content: this._extractWorkflowOutput(workflowResult),
            workflow: workflowResult.workflowName,
            steps: workflowResult.steps?.length || 0,
            enhanced: true,
            summary: workflowResult.summary
        };
    }

    _formatErrorResult(error) {
        return {
            type: 'error', 
            success: false,
            content: `处理失败: ${error.message}`,
            enhanced: true
        };
    }

    _extractWorkflowOutput(workflowResult) {
        if (!workflowResult.success) {
            return '工作流执行失败';
        }

        const successfulSteps = workflowResult.steps?.filter(step => step?.success) || [];
        if (successfulSteps.length === 0) return '工作流执行无成功步骤';

        const lastSuccessfulStep = successfulSteps[successfulSteps.length - 1];
        return lastSuccessfulStep.output || '工作流执行完成';
    }

    _skipWorkflow() {
        this.workflowUI.hide();
        return { 
            skipped: true,
            enhanced: true,
            type: 'workflow_skipped'
        };
    }

    _emitWorkflowResult(result) {
        const event = new CustomEvent('workflow:result', { detail: result });
        window.dispatchEvent(event);
    }

    /**
     * 🎯 修改：获取系统状态（包含专用研究Agent信息）
     */
    getStatus() {
        const baseStatus = {
            enabled: this.isEnabled,
            initialized: this._isInitialized,
            initState: this._initState,
            agentMode: this.agentMode, // 🆕 专用模式标识
            currentWorkflow: this.currentWorkflow ? {
                name: this.currentWorkflow.name,
                steps: this.currentWorkflow.steps.length
            } : null,
            tools: {
                count: Object.keys(this.tools).length,
                available: Object.keys(this.tools)
            },
            callbackManager: this.callbackManager.getStatus()
        };

        // 🎯 修改：只包含专用研究Agent状态
        if (this.deepResearchAgent) {
            baseStatus.deepResearchAgent = {
                isAvailable: true,
                mode: 'specialized',
                status: this.deepResearchAgent.getStatus(),
                tools: Object.keys(this.tools)
            };
        }

        return baseStatus;
    }

    /**
     * 🎯 启用/禁用系统（保持不变）
     */
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

    /**
     * 🎯 动态注册工具（保持不变）
     */
    registerTool(toolInstance) {
        if (this.tools[toolInstance.name]) {
            console.warn(`[Orchestrator] 工具 ${toolInstance.name} 已存在，跳过注册`);
            return;
        }
        
        this.tools[toolInstance.name] = toolInstance;
        console.log(`[Orchestrator] 注册新工具: ${toolInstance.name}`);
    }

    /**
     * 🎯 清理资源（保持不变）
     */
    destroy() {
        this.currentWorkflow = null;
        this.currentContext = null;
        
        if (this.deepResearchAgent) {
            this.deepResearchAgent = null;
        }
        
        this.callbackManager.clearCurrentRun();
        
        console.log('[Orchestrator] 资源清理完成');
    }

    // 🎯 保留所有现有的设置方法
    setupHandlers() {
        try {
            this._setupResearchEventHandlers(); // 🆕 专用研究事件处理器
            
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
     * 🎯 新增：专用研究事件处理器
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
}