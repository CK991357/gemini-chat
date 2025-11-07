// src/static/js/agent/Orchestrator.js

/**
 * @class Orchestrator
 * @description 智能路由器：标准模式 + 专用Agent模式（深度研究）
 */

// 🎯 导入专用Agent组件
import { DeepResearchAgent } from './specialized/DeepResearchAgent.js';
import { ResearchPanel } from './specialized/ResearchPanel.js';

// 🎯 导入工具系统 - 修复导入路径
import { ToolImplementations } from './tools/ToolImplementations.js';

// 🎯 导入现有组件
import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';

export class Orchestrator {
    constructor(chatApiHandler, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.config = config;
        
        console.log('[Orchestrator] 创建智能路由器实例（专用Agent模式）...');
        
        // 🎯 关键修改：标记初始化状态
        this._isInitialized = false;
        this._initState = 'created';
        this._initializationPromise = null;
        this._pendingInitWaiters = [];
        
        // 🎯 基础状态 - 开关控制
        this.isEnabled = config.enabled !== false;
        this.currentContext = null;
        
        // 🎯 Agent模式专用状态
        this.agentMode = 'disabled'; // disabled, deep_research
        this.selectedAgent = null;
        this.researchPanel = null;
        
        // 🎯 轻量级初始化
        this.callbackManager = new CallbackManager();
        this.skillManager = null;
        this.tools = {};
        
        console.log('[Orchestrator] 实例创建完成（等待开关触发初始化）');
    }

    /**
     * 🎯 真正的初始化方法（开关触发调用）
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
        console.log('[Orchestrator] 开始按需初始化（开关触发）...');
        
        this._initializationPromise = (async () => {
            try {
                const initStartTime = Date.now();
                
                // 🎯 1. 初始化技能管理器
                console.log('[Orchestrator] 初始化技能管理器...');
                this.skillManager = new EnhancedSkillManager();
                await this.skillManager.waitUntilReady();
                
                // 🎯 2. 初始化研究面板
                console.log('[Orchestrator] 初始化研究面板...');
                this.researchPanel = new ResearchPanel();
                
                // 🎯 3. 初始化工具系统 - 使用 ToolImplementations
                console.log('[Orchestrator] 初始化工具系统...');
                this.tools = await this._initializeTools();
                
                // 🎯 4. 设置处理器和事件监听
                this.setupHandlers();
                this.setupEventListeners();
                
                this._initState = 'initialized';
                this._isInitialized = true;
                
                const initTime = Date.now() - initStartTime;
                console.log(`[Orchestrator] 按需初始化完成 (${initTime}ms)`, {
                    toolsCount: Object.keys(this.tools).length,
                    agentMode: this.agentMode
                });
                
                this._notifyInitWaiters(null, true);
                return true;
                
            } catch (error) {
                console.error('[Orchestrator] 按需初始化失败:', error);
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
     * 🎯 修改：确保初始化的公共方法
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
     * 🎯 修改：处理用户请求 - 增加初始化检查
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        // 🎯 确保已初始化
        if (!this._isInitialized) {
            console.warn('[Orchestrator] 未初始化，无法处理请求');
            return { enhanced: false, type: 'not_initialized' };
        }
        
        // 🎯 保存当前上下文
        this.currentContext = context;
        
        return await this._handleUserRequestInternal(userMessage, files, context);
    }

    /**
     * 🎯 重构：简化路由决策逻辑
     */
    async _handleUserRequestInternal(userMessage, files = [], context = {}) {
        // 🎯 新增：知识库优先检测
        if (await this._isKnowledgeBaseQuestion(userMessage)) {
            console.log('[Orchestrator] 检测到知识库问题，使用标准回复');
            return { enhanced: false, type: 'knowledge_base' };
        }
        
        this.currentContext = context;
        
        // 🎯 快速过滤：对于非常短的问候或简单单词，避免触发工具或Agent模式
        try {
            const trimmed = (userMessage || '').trim();
            const greetingRegex = /^\s*(hi|hello|hey|你好|嗨|您好|早安|晚上好)([.!?\s]|$)/i;
            if (trimmed.length <= 4 || greetingRegex.test(trimmed)) {
                console.log('[Orchestrator] 检测到短消息或问候，回退到标准对话以避免误触发工具');
                return { enhanced: false, type: 'standard_fallback' };
            }
        } catch (_e) {
            // ignore and continue routing
        }
        
        // ✨ 如果开关关闭，直接返回标准回退
        if (!this.isEnabled) {
            return { enhanced: false, type: 'standard_fallback' };
        }

        // 🎯 如果初始化失败，直接使用标准模式
        if (this._initState === 'failed') {
            console.log('[Orchestrator] 使用降级模式处理请求');
            return { enhanced: false, type: 'standard_fallback' };
        }

        try {
            console.log(`[Orchestrator] 处理用户请求: "${userMessage.substring(0, 100)}..."`);
            
            // 🎯 简化：如果Agent模式开启，直接使用深度研究Agent
            if (this.agentMode === 'deep_research' && this.isEnabled) {
                console.log('[Orchestrator] 路由决策 → 深度研究Agent模式');
                return await this._handleWithDeepResearch(userMessage, context);
            }
            
            // 🎯 否则使用标准模式（完全独立）
            console.log('[Orchestrator] 路由决策 → 标准对话模式');
            return { enhanced: false, type: 'standard_fallback' };
            
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
     * 🎯 简化：使用深度研究Agent处理
     */
    async _handleWithDeepResearch(userMessage, context) {
        try {
            if (!this.selectedAgent) {
                // 显示研究面板，让用户确认参数
                this.researchPanel.show();
                if (userMessage) {
                    // 预填研究主题
                    const topicInput = document.getElementById('research-topic');
                    if (topicInput) topicInput.value = userMessage;
                }
                return { 
                    enhanced: true, 
                    type: 'research_pending',
                    message: '请在研究面板中确认参数'
                };
            }
            
            // 直接执行研究
            const result = await this.selectedAgent.conductResearch({
                topic: userMessage,
                requirements: context.requirements || '',
                language: context.language || 'zh-CN',
                depth: context.depth || 'standard',
                focus: context.focus || []
            });
            
            return this._formatResearchResult(result);
            
        } catch (error) {
            console.error('[Orchestrator] 深度研究处理失败:', error);
            // 优雅降级到标准模式
            return { 
                enhanced: false, 
                type: 'standard_fallback',
                error: `研究模式暂时不可用: ${error.message}` 
            };
        }
    }

    /**
     * 🎯 新增：设置Agent模式
     */
    setAgentMode(mode, agentType = null) {
        const previousMode = this.agentMode;
        this.agentMode = mode;
        
        console.log(`[Orchestrator] Agent模式变更: ${previousMode} → ${mode}`);
        
        if (mode === 'disabled') {
            this.selectedAgent = null;
        } else if (mode === 'deep_research') {
            this._initializeResearchAgent();
        }
        
        // 🎯 触发模式变更事件
        window.dispatchEvent(new CustomEvent('orchestrator:agent_mode_changed', {
            detail: {
                previousMode,
                currentMode: mode,
                agentType: agentType
            }
        }));
    }

    /**
     * 🎯 新增：初始化深度研究Agent
     */
    _initializeResearchAgent() {
        try {
            // 🎯 过滤工具：只保留研究相关工具
            const researchTools = this._filterResearchTools(this.tools);
            
            if (Object.keys(researchTools).length === 0) {
                console.warn('[Orchestrator] 无研究工具可用，无法初始化研究Agent');
                return;
            }
            
            this.selectedAgent = new DeepResearchAgent(
                this.chatApiHandler,
                researchTools,
                this.callbackManager,
                {
                    maxIterations: 8, // 🎯 研究任务需要更多思考
                    researchConfig: {
                        enableCompression: true,
                        enableDeduplication: true,
                        maxSources: 15, // 合理限制
                        analysisDepth: 'comprehensive',
                        outputLanguage: 'zh-CN', // 默认中文报告
                        includeExecutiveSummary: true
                    }
                }
            );
            
            console.log('[Orchestrator] 深度研究Agent初始化完成', {
                tools: Object.keys(researchTools),
                maxIterations: 8
            });
            
        } catch (error) {
            console.error('[Orchestrator] 研究Agent初始化失败:', error);
            this.selectedAgent = null;
        }
    }

    /**
     * 🎯 过滤研究工具
     */
    _filterResearchTools(allTools) {
        const researchTools = ['tavily_search', 'crawl4ai', 'python_sandbox'];
        const filtered = {};
        
        researchTools.forEach(toolName => {
            if (allTools[toolName]) {
                filtered[toolName] = allTools[toolName];
            }
        });
        
        console.log(`[Orchestrator] 研究工具过滤: ${Object.keys(allTools).length} → ${Object.keys(filtered).length}`);
        return filtered;
    }

    /**
     * 🎯 新增：开始研究执行（由研究面板调用）
     */
    async startResearchExecution(researchRequest) {
        if (!this.selectedAgent || this.agentMode !== 'deep_research') {
            throw new Error('研究Agent未就绪');
        }

        try {
            const researchResult = await this.selectedAgent.conductResearch(researchRequest);
            return this._formatResearchResult(researchResult);
            
        } catch (error) {
            console.error('[Orchestrator] 研究执行失败:', error);
            throw error;
        }
    }

    /**
     * 🎯 格式化研究结果
     */
    _formatResearchResult(researchResult) {
        if (!researchResult.success) {
            return {
                enhanced: true,
                type: 'research_error',
                content: researchResult.report || '研究执行失败',
                success: false,
                researchState: researchResult.researchState
            };
        }

        return {
            enhanced: true,
            type: 'research_result',
            content: researchResult.report,
            success: true,
            researchState: researchResult.researchState,
            duration: researchResult.duration,
            isMultiStep: true
        };
    }

    /**
     * 🎯 初始化工具系统 - 使用 ToolImplementations
     */
    async _initializeTools() {
        try {
            // 🎯 使用 ToolImplementations 类来创建工具实例
            const toolImplementations = new ToolImplementations(this.chatApiHandler);
            
            // 🎯 获取研究专用工具
            const researchTools = toolImplementations.getResearchTools();
            
            console.log(`[Orchestrator] 工具系统组装完成，可用工具: ${Object.keys(researchTools).join(', ')}`);
            return researchTools;
            
        } catch (error) {
            console.error('[Orchestrator] 工具系统初始化失败:', error);
            return {};
        }
    }

    /**
     * 🎯 新增：进入降级模式
     */
    async _enterFallbackMode(error) {
        console.warn('[Orchestrator] 进入降级模式，Agent功能受限');
        
        // 🎯 确保基础组件可用
        if (!this.researchPanel) {
            this.researchPanel = new ResearchPanel();
        }
        
        // 🎯 标记Agent系统不可用
        this.agentMode = 'disabled';
        this.selectedAgent = null;
        
        this._isInitialized = true; // 标记为已初始化（降级模式）
        console.log('[Orchestrator] 降级模式初始化完成');
    }

    /**
     * 🎯 新增：知识库问题检测
     */
    async _isKnowledgeBaseQuestion(userMessage) {
        const knowledgeBasePatterns = [
            // 基础问候和简单问题
            /^(hi|hello|hey|你好|嗨|您好|早安|晚上好)/i,
            /^(你是谁|你是什么|你能做什么)/,
            /^(爱因斯坦|特斯拉|牛顿|物理|数学|科学)/i,
            
            // 简单查询（不涉及复杂操作）
            /^(什么是|什么是|告诉我关于|解释一下)/,
            
            // 模型自身能力问题
            /^(你的能力|你能帮我|你有什么功能)/
        ];
        
        // 检查是否匹配知识库模式
        const isSimpleQuestion = knowledgeBasePatterns.some(pattern => 
            pattern.test(userMessage.trim())
        );
        
        // 检查消息长度（短消息通常是简单问题）
        const isShortMessage = userMessage.trim().length < 20;
        
        // 检查是否包含工具调用关键词
        const toolKeywords = ['搜索', '爬取', '分析', '执行', '代码', 'python', '搜索', 'crawl'];
        const hasToolIntent = toolKeywords.some(keyword => 
            userMessage.toLowerCase().includes(keyword.toLowerCase())
        );
        
        return (isSimpleQuestion || isShortMessage) && !hasToolIntent;
    }

    setupHandlers() {
        try {
            // 🎯 关键修复：注册事件处理器来转发Agent事件
            this._setupAgentEventHandlers();
            
            // 现有的中间件注册
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

            console.log('[Orchestrator] 处理器设置完成');

        } catch (error) {
            console.error('❌ 处理器注册失败:', error);
        }
    }

    /**
     * 🎯 设置Agent事件处理器 - 转发专用Agent事件到显示面板
     */
    _setupAgentEventHandlers() {
        // 监听专用Agent触发的事件，并转发到window供AgentThinkingDisplay捕获
        this.callbackManager.addHandler({
            on_research_phase_changed: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:research_phase_changed', {
                    detail: eventData
                }));
            },
            on_research_progress: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:research_progress', {
                    detail: eventData
                }));
            },
            // ✅ 确保其他必要的事件也被转发
            on_agent_start: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_started', {
                    detail: eventData
                }));
            },
            on_agent_end: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_completed', {
                    detail: eventData
                }));
            }
        });
        
        console.log('✅ 专用Agent事件处理器已注册');
    }

    setupEventListeners() {
        // 🎯 研究面板事件监听
        window.addEventListener('research:start_requested', async (event) => {
            try {
                const researchResult = await this.startResearchExecution(event.detail);
                // 🎯 在聊天界面显示研究结果
                window.dispatchEvent(new CustomEvent('chat:research_completed', {
                    detail: researchResult
                }));
            } catch (error) {
                console.error('[Orchestrator] 研究执行失败:', error);
                window.dispatchEvent(new CustomEvent('chat:research_error', {
                    detail: { error: error.message }
                }));
            }
        });

        console.log('[Orchestrator] 事件监听器设置完成');
    }

    /**
     * 🎯 获取系统状态（简化版）
     */
    getStatus() {
        const baseStatus = {
            enabled: this.isEnabled,
            initialized: this._isInitialized,
            initState: this._initState,
            agentMode: this.agentMode,
            tools: {
                count: Object.keys(this.tools).length,
                available: Object.keys(this.tools)
            },
            callbackManager: this.callbackManager.getStatus()
        };

        // 🎯 添加专用Agent状态
        if (this.selectedAgent) {
            baseStatus.selectedAgent = {
                type: this.agentMode,
                status: this.selectedAgent.getStatus ? this.selectedAgent.getStatus() : 'active'
            };
        }

        return baseStatus;
    }

    /**
     * 🎯 启用/禁用系统
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Orchestrator] ${enabled ? '启用' : '禁用'}智能路由`);
        
        // 🎯 如果启用且未初始化，触发初始化
        if (enabled && !this._isInitialized) {
            console.log('[Orchestrator] 开关启用，触发初始化...');
            this.ensureInitialized().catch(error => {
                console.error('[Orchestrator] 开关触发初始化失败:', error);
            });
        }
    }

    /**
     * 🎯 动态注册工具
     */
    registerTool(toolInstance) {
        if (this.tools[toolInstance.name]) {
            console.warn(`[Orchestrator] 工具 ${toolInstance.name} 已存在，跳过注册`);
            return;
        }
        
        this.tools[toolInstance.name] = toolInstance;
        console.log(`[Orchestrator] 注册新工具: ${toolInstance.name}`);
        
        // 🎯 如果当前有激活的Agent，重新初始化以包含新工具
        if (this.selectedAgent) {
            console.log(`[Orchestrator] 重新初始化${this.agentMode}以包含新工具`);
            if (this.agentMode === 'deep_research') {
                this._initializeResearchAgent();
            }
        }
    }

    /**
     * 🎯 清理资源
     */
    destroy() {
        this.currentContext = null;
        
        if (this.selectedAgent) {
            this.selectedAgent = null;
        }
        
        this.callbackManager.clearCurrentRun();
        
        console.log('[Orchestrator] 资源清理完成');
    }
}