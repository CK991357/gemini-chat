// src/static/js/agent/Orchestrator.js

/**
 * @class Orchestrator
 * @description 智能路由器 + 组装工厂：在现有系统基础上新增Agent能力，100%向后兼容
 */

// 🎯 导入Agent核心组件
import { AgentExecutor } from './core/AgentExecutor.js';
import { AgentLogic } from './core/AgentLogic.js';
import { AgentOutputParser } from './core/OutputParser.js';

// 🎯 导入工具系统
import { ToolFactory } from './tools/ToolImplementations.js';

// 🎯 导入现有组件（确保向后兼容）
import { getSkillsRegistry } from '../tool-spec-system/generated-skills.js';
import { mcpToolsMap } from '../tools_mcp/tool-definitions.js';
import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';

// 🎯 导入向后兼容系统

export class Orchestrator {
    constructor(chatApiHandler, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.config = config;
        
        console.log('[Orchestrator] 初始化智能路由器...');
        
        // 🎯 修复1：确保基础组件先初始化
        this.callbackManager = new CallbackManager();
        this.skillManager = new EnhancedSkillManager();
        
        // 🎯 修复2：标记初始化状态
        this._isInitialized = false;
        this._initializationError = null;
        
        // 🎯 等待技能管理器就绪后再继续
        this.tools = {}; // 确保在降级模式下 Object.keys(this.tools) 不会抛出错误
        this.initializationPromise = this._initializeWithDependencies();
        
        this.isEnabled = config.enabled !== false;
        this.currentWorkflow = null;
        this.currentContext = null;
        
        console.log('[Orchestrator] 初始化启动完成');
    }

    /**
     * 🎯 异步初始化所有组件，等待依赖项就绪
     */
    // 🔧 更安全的实现
    async _initializeWithDependencies() {
        try {
            // 🎯 修复3：添加超时保护
            const initTimeout = 10000; // 10秒超时
            const initPromise = (async () => {
                await this.skillManager.waitUntilReady();
                // 🎯 继续初始化其他组件...
                await this._initializeRemainingComponents();
            })();
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('技能管理器初始化超时')), initTimeout);
            });

            await Promise.race([initPromise, timeoutPromise]);
            this._isInitialized = true;
            
            console.log('[Orchestrator] 所有组件初始化成功');
            return true;
            
        } catch (error) {
            // 🎯 修复4：关键修复 - 超时后优雅降级
            console.error('[Orchestrator] 组件初始化失败:', error);
            this._initializationError = error;
            
            // 🎯 进入降级模式，确保基础功能可用
            await this._enterFallbackMode(error);
            return false;
        }
    }

    /**
     * 🎯 初始化工具系统（组装工厂模式）
     */
    /**
     * 🎯 新增：初始化剩余组件
     */
    async _initializeRemainingComponents() {
        // 初始化工作流引擎
        this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
        
        // 初始化工作流UI
        this.workflowUI = new WorkflowUI(this.config.containerId);
        
        // 初始化工具系统
        this.tools = this._initializeTools();
        
        // 初始化Agent系统
        this.agentSystem = this._initializeAgentSystem();
        
        // 设置处理器
        this.setupHandlers();
        this.setupEventListeners();
        
        console.log('[Orchestrator] 所有组件初始化完成', {
            agentSystem: this.agentSystem ? '已启用' : '未启用',
            toolsCount: Object.keys(this.tools).length,
            enabled: this.isEnabled
        });
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
    _initializeTools() {
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
                    maxIterations: this.config.maxIterations || 8,
                    earlyStoppingMethod: 'force'
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

    setupHandlers() {
        try {
            // 🎯 导入中间件
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

            // 🎯 保持现有的处理器注册逻辑
            // 例如：this.callbackManager.addHandler(new WorkflowUIHandler(this.workflowUI));
            console.log('[Orchestrator] 处理器设置完成');

        } catch (error) {
            console.error('❌ 中间件注册失败:', error);
        }
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
     * 🎯 核心：智能路由用户请求（100%向后兼容）
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        // 🎯 修复5：确保初始化完成
        if (!this._isInitialized) {
            await this.initializationPromise;
        }
        
        this.currentContext = context;
        
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
            
            // 🎯 任务分析（重用现有系统）
            const taskAnalysis = await this.workflowEngine.analyzeTask(userMessage, {
                availableTools: context.availableTools || [],
                userMessage: userMessage
            });

            // 🎯 技能匹配（重用现有系统）
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
            const successfulSteps = agentResult.intermediateSteps.filter(step => !step.observation.isError).length;
            const failedSteps = agentResult.intermediateSteps.filter(step => step.observation.isError).length;
            
            content += `\n\n---\n**🤖 智能代理执行摘要**\n`;
            content += `共执行 ${agentResult.iterations} 轮思考，完成 ${successfulSteps} 个成功步骤${failedSteps > 0 ? `，${failedSteps} 个失败步骤` : ''}：\n`;
            
            agentResult.intermediateSteps.forEach((step, index) => {
                const status = step.observation.isError ? '❌' : '✅';
                content += `\n${index + 1}. ${step.action.tool_name} ${status}`;
                
                // 添加简要结果预览（成功步骤）
                if (!step.observation.isError && step.observation.output) {
                    const preview = step.observation.output.substring(0, 80);
                    if (preview.length > 0) {
                        content += ` - ${preview}${step.observation.output.length > 80 ? '...' : ''}`;
                    }
                }
            });
        }

        return {
            enhanced: true,
            type: 'agent_result',
            content: content,
            success: true,
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
                error: this.agentSystem.error
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