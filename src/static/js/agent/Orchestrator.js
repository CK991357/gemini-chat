// src/static/js/agent/Orchestrator.js

/**
 * @class Orchestrator
 * @description 智能路由器 + 组装工厂：在现有系统基础上新增Agent能力，100%向后兼容
 */

// 🎯 导入Agent核心组件
import { AgentExecutor } from './core/AgentExecutor.js';
import { AgentLogic } from './core/AgentLogic.js';
import { AgentOutputParser } from './core/OutputParser.js';

// 🎯 导入工作流组件
import { WorkflowEngine } from './WorkflowEngine.js';
import { WorkflowUI } from './WorkflowUI.js';

// 🎯 导入工具系统
import { ToolFactory } from './tools/ToolImplementations.js';

// 🎯 导入现有组件（确保向后兼容）
import { getSkillsRegistry } from '../tool-spec-system/generated-skills.js';
import { mcpToolsMap } from '../tools_mcp/tool-definitions.js';
import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';

// 🎯 导入向后兼容系统
import { ObservationUtils } from './utils/ObservationUtils.js';

export class Orchestrator {
    constructor(chatApiHandler, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.config = config;
        
        console.log('[Orchestrator] 创建智能路由器实例（等待开关触发）...');
        
        // 🎯 关键修改：标记初始化状态
        this._isInitialized = false;
        this._initState = 'created'; // created -> initializing -> initialized -> failed
        this._initializationPromise = null;
        this._pendingInitWaiters = [];
        
        // 🎯 基础状态 - 开关控制
        this.isEnabled = config.enabled !== false;
        this.currentWorkflow = null;
        this.currentContext = null;
        
        // 🎯 轻量级初始化 - 只设置基础结构
        this.callbackManager = new CallbackManager();
        this.skillManager = null; // 延迟初始化
        this.workflowEngine = null; // 延迟初始化
        this.agentSystem = null; // 延迟初始化
        this.tools = {}; // 延迟初始化
        
        console.log('[Orchestrator] 实例创建完成（等待开关触发初始化）');
    }

    /**
     * 🎯 新增：真正的初始化方法（开关触发调用）
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
                
                // 🎯 2. 初始化工作流引擎
                console.log('[Orchestrator] 初始化工作流引擎...');
                this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
                
                // 🎯 3. 初始化工作流UI
                console.log('[Orchestrator] 初始化工作流UI...');
                this.workflowUI = new WorkflowUI(this.config.containerId);
                
                // 🎯 4. 初始化工具系统
                console.log('[Orchestrator] 初始化工具系统...');
                this.tools = await this._initializeTools();
                
                // 🎯 5. 初始化Agent系统
                console.log('[Orchestrator] 初始化Agent系统...');
                this.agentSystem = this._initializeAgentSystem();
                
                // 🎯 6. 设置处理器和事件监听
                this.setupHandlers();
                this.setupEventListeners();
                
                this._initState = 'initialized';
                this._isInitialized = true;
                
                const initTime = Date.now() - initStartTime;
                console.log(`[Orchestrator] 按需初始化完成 (${initTime}ms)`, {
                    toolsCount: Object.keys(this.tools).length,
                    agentSystem: this.agentSystem ? '已启用' : '未启用'
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
        
        // ... 原有的智能路由逻辑保持不变
        return await this._handleUserRequestInternal(userMessage, files, context);
    }

    /**
     * 🎯 原有的 handleUserRequest 逻辑移到这里
     */
    async _handleUserRequestInternal(userMessage, files = [], context = {}) {
        // 🎯 新增：知识库优先检测
        if (await this._isKnowledgeBaseQuestion(userMessage)) {
            console.log('[Orchestrator] 检测到知识库问题，使用标准回复');
            return { enhanced: false, type: 'knowledge_base' };
        }
        
        this.currentContext = context;
        
        // 快速过滤：对于非常短的问候或简单单词，避免触发工具或Agent模式
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
        if (this.agentSystem?.fallbackMode) {
            console.log('[Orchestrator] 使用降级模式处理请求');
            return { enhanced: false, type: 'standard_fallback' };
        }

        try {
            console.log(`[Orchestrator] 处理用户请求: "${userMessage.substring(0, 100)}..."`);
            
            // 🎯 任务分析
            const taskAnalysis = await this.workflowEngine.analyzeTask(userMessage, {
                availableTools: context.availableTools || [],
                userMessage: userMessage
            });

            // 🎯 技能匹配
            const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, context);

            console.log(`[Orchestrator] 路由分析完成:`, {
                complexity: taskAnalysis.complexity,
                score: taskAnalysis.score,
                workflowType: taskAnalysis.workflowType,
                matchedSkills: matchedSkills.length,
                availableTools: context.availableTools?.length || 'all'
            });

            // 🎯 智能路由决策
            if (taskAnalysis.complexity === 'high' && taskAnalysis.workflowType) {
                // 🎯 复杂工作流 - 重用现有稳定系统
                console.log(`[Orchestrator] 路由决策 → 工作流模式: ${taskAnalysis.workflowType}`);
                return await this._handleWithWorkflow(userMessage, taskAnalysis, files, context);
            } else if (this._shouldUseAgent(userMessage, taskAnalysis, matchedSkills)) {
                // 🎯 Agent模式 - 新增能力
                console.log(`[Orchestrator] 路由决策 → Agent模式`);
                return await this._handleWithAgent(userMessage, context, matchedSkills);
            } else if (matchedSkills && matchedSkills.length > 0) {
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
     * 🎯 初始化工具系统（组装工厂模式）
     */
    async _initializeTools() {
        try {
            const skills = getSkillsRegistry();
            const toolDefinitions = {};
            
            // 🎯 从skill系统获取工具定义
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
            
            // 🎯 使用工厂创建所有工具实例
            const tools = ToolFactory.createTools(toolDefinitions, this.chatApiHandler);
            
            console.log(`[Orchestrator] 工具系统组装完成，可用工具: ${Object.keys(tools).join(', ')}`);
            return tools;
            
        } catch (error) {
            console.error('[Orchestrator] 工具系统初始化失败:', error);
            return {};
        }
    }

    /**
     * 🎯 初始化Agent系统
     */
    _initializeAgentSystem() {
        try {
            // 🎯 检查工具是否可用
            if (Object.keys(this.tools).length === 0) {
                console.warn('[Orchestrator] 无可用工具，跳过Agent系统初始化');
                return null;
            }
            
            const outputParser = new AgentOutputParser();
            const agentLogic = new AgentLogic(this.chatApiHandler, this.tools, outputParser);
            
            const agentExecutor = new AgentExecutor(
                agentLogic,
                this.tools,
                this.callbackManager,
                {
                    // 🎯 优化配置
                    maxIterations: this.config.maxIterations || 5, // 减少默认迭代次数
                    earlyStoppingMethod: 'smart', // 智能停止
                    maxThinkTimeout: 60000 // 减少超时时间
                }
            );
            
            return {
                executor: agentExecutor,
                logic: agentLogic,
                tools: this.tools,
                isAvailable: true
            };
        } catch (error) {
            console.error('[Orchestrator] Agent系统初始化失败:', error);
            return {
                isAvailable: false,
                error: error.message
            };
        }
    }

    /**
     * 🎯 新增：进入降级模式
     */
    async _enterFallbackMode(error) {
        console.warn('[Orchestrator] 进入降级模式，Agent功能受限');
        
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
        
        // 🎯 标记Agent系统不可用
        this.agentSystem = {
            isAvailable: false,
            error: error.message,
            fallbackMode: true
        };
        
        this._isInitialized = true; // 标记为已初始化（降级模式）
        console.log('[Orchestrator] 降级模式初始化完成');
    }

    /**
     * 🎯 新增：创建降级工具集
     */
    _createFallbackTools() {
        // 🎯 降级模式下只提供最基础的工具，例如一个简单的搜索工具
        console.log('[Orchestrator] 创建降级工具集：仅提供基础功能');
        
        // 考虑到当前文件没有导入 BaseTool，为避免引入新的依赖，我们暂时返回空对象。
        // 实际应用中，如果需要降级工具，应在此处创建并返回。
        return {};
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
     * 🎯 设置Agent事件处理器 - 转发AgentExecutor事件到显示面板
     */
    _setupAgentEventHandlers() {
        // 监听AgentExecutor触发的事件，并转发到window供AgentThinkingDisplay捕获
        this.callbackManager.addHandler({
            on_agent_start: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_started', {
                    detail: eventData
                }));
            },
            on_agent_iteration_start: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:iteration_update', {
                    detail: eventData
                }));
            },
            on_agent_thinking: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:thinking', {
                    detail: eventData
                }));
            },
            on_tool_start: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:step_added', {
                    detail: {
                        step: {
                            type: 'action',
                            description: `执行工具: ${eventData.name}`,
                            tool: eventData.name,
                            parameters: eventData.data?.parameters,
                            timestamp: Date.now()
                        }
                    }
                }));
            },
            on_tool_end: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:step_completed', {
                    detail: {
                        result: eventData.data?.result
                    }
                }));
            },
            on_agent_end: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_completed', {
                    detail: {
                        result: eventData.data
                    }
                }));
            },
            on_agent_iteration_error: (eventData) => {
                window.dispatchEvent(new CustomEvent('agent:session_error', {
                    detail: {
                        error: eventData.data?.error
                    }
                }));
            }
        });
        
        console.log('✅ Agent事件处理器已注册');
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

    /**
     * 🎯 判断是否应该使用Agent处理
     */
    _shouldUseAgent(userMessage, taskAnalysis, matchedSkills) {
        // 🎯 检查Agent系统是否可用
        if (!this.agentSystem || !this.agentSystem.isAvailable) {
            console.log('[Orchestrator] Agent系统不可用，跳过Agent模式');
            return false;
        }

        // 🎯 基于匹配技能数量决策
        if (matchedSkills && matchedSkills.length >= 2) {
            console.log(`[Orchestrator] 匹配到${matchedSkills.length}个技能，启用Agent模式`);
            return true;
        }

        // 🎯 基于任务复杂度决策
        if (taskAnalysis.complexity === 'medium' || taskAnalysis.score >= 2) {
            console.log('[Orchestrator] 中等复杂度任务，启用Agent模式');
            return true;
        }

        // 🎯 基于关键词决策
        const agentKeywords = [
            '分析', '比较', '研究', '调查', '评估', '总结', '步骤', '首先', '然后', '接着',
            '多步', '分步', '流程', '第一步', '第二步', '分阶段', '分任务',
            'analyze', 'compare', 'research', 'investigate', 'evaluate', 'step by step',
            'multiple steps', 'firstly', 'then', 'next', 'workflow'
        ];
        
        const lowerMessage = userMessage.toLowerCase();
        const hasComplexIntent = agentKeywords.some(keyword => lowerMessage.includes(keyword));
        
        if (hasComplexIntent) {
            console.log(`[Orchestrator] 检测到复杂意图关键词，启用Agent模式`);
            return true;
        }

        return false;
    }

    /**
     * 🎯 使用Agent处理复杂任务（新增能力）
     */
    async _handleWithAgent(userMessage, context, matchedSkills) {
        if (!this.agentSystem || !this.agentSystem.isAvailable) {
            console.log('[Orchestrator] Agent系统不可用，回退到单工具模式');
            return await this._handleWithSingleTool(userMessage, context, matchedSkills);
        }

        try {
            console.log(`[Orchestrator] 启动Agent处理复杂任务...`);
            
            const result = await this.agentSystem.executor.invoke({
                userMessage,
                context: {
                    ...context,
                    availableTools: Object.keys(this.tools)
                }
            });

            // 🎯 格式化Agent结果
            return this._formatAgentResult(result);
            
        } catch (error) {
            console.error('[Orchestrator] Agent执行失败:', error);
            
            // 🎯 Agent失败时优雅降级到单工具模式
            console.log('[Orchestrator] Agent失败，降级到单工具模式');
            return await this._handleWithSingleTool(userMessage, context, matchedSkills);
        }
    }

    /**
     * 🎯 格式化Agent结果
     */
    _formatAgentResult(agentResult) {
        if (!agentResult.success) {
            return {
                enhanced: true,
                type: 'agent_error',
                content: agentResult.output,
                success: false,
                agentRunId: agentResult.agentRunId,
                fallback: true // 允许降级
            };
        }

        let content = agentResult.output;
        
        // 🎯 添加执行摘要（如果有多步执行）
        if (agentResult.intermediateSteps && agentResult.intermediateSteps.length > 0) {
            const successfulSteps = agentResult.intermediateSteps.filter(step => 
                !ObservationUtils.isErrorResult(step.observation)
            ).length;
            const failedSteps = agentResult.intermediateSteps.filter(step => 
                ObservationUtils.isErrorResult(step.observation)
            ).length;
            
            content += `\n\n---\n**🤖 智能代理执行摘要**\n`;
            content += `共执行 ${agentResult.iterations} 轮思考，完成 ${successfulSteps} 个成功步骤${failedSteps > 0 ? `，${failedSteps} 个失败步骤` : ''}：\n`;
            
            agentResult.intermediateSteps.forEach((step, index) => {
                const isError = ObservationUtils.isErrorResult(step.observation);
                const status = isError ? '❌' : '✅';
                content += `\n${index + 1}. ${step.action.tool_name} ${status}`;
                
                // 添加简要结果预览（成功步骤）
                if (!isError) {
                    const previewText = ObservationUtils.getOutputText(step.observation) || '';
                    if (previewText.trim()) {
                        const preview = previewText.substring(0, 80);
                        content += ` - ${preview}${previewText.length > 80 ? '...' : ''}`;
                    }
                }
            });
        }

        return {
            enhanced: true,
            type: 'agent_result',
            content: content,
            success: agentResult.success,
            agentRunId: agentResult.agentRunId,
            intermediateSteps: agentResult.intermediateSteps,
            isMultiStep: agentResult.intermediateSteps && agentResult.intermediateSteps.length > 0,
            iterations: agentResult.iterations
        };
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
                    
                    // 🎯 构建合理的默认输入
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
     * 🎯 构建默认工具输入
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
            
            // 🎯 显示工作流UI
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
     * 🎯 工作流执行（完全向后兼容）- 保持您现有的方法
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

    // 🎯 保持所有现有的辅助方法
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
     * 🎯 获取系统状态（包含Agent信息）
     */
    getStatus() {
        const baseStatus = {
            enabled: this.isEnabled,
            initialized: this._isInitialized,
            initState: this._initState,
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

        // 🎯 添加Agent系统状态
        if (this.agentSystem) {
            baseStatus.agentSystem = {
                isAvailable: this.agentSystem.isAvailable,
                tools: Object.keys(this.tools),
                executor: this.agentSystem.executor?.getStatus?.(),
                logic: this.agentSystem.logic?.getStatus?.(),
                error: this.agentSystem.error,
                fallbackMode: this.agentSystem.fallbackMode || false
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
        
        // 🎯 重新初始化Agent系统以包含新工具
        if (this.agentSystem) {
            this.agentSystem = this._initializeAgentSystem();
        }
    }

    /**
     * 🎯 清理资源
     */
    destroy() {
        this.currentWorkflow = null;
        this.currentContext = null;
        
        if (this.agentSystem) {
            this.agentSystem.executor = null;
            this.agentSystem.logic = null;
        }
        
        this.callbackManager.clearCurrentRun();
        
        console.log('[Orchestrator] 资源清理完成');
    }
}