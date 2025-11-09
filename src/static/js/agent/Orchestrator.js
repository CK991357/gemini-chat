// src/static/js/agent/Orchestrator.js - 聚焦重构版

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
     * 🎯 关键路由逻辑: 开关 + 关键词双重检查
     */
    async handleUserRequest(userMessage, files = [], context = {}) {
        await this.ensureInitialized();

        // 1. 检查总开关是否打开且系统已初始化
        if (!this.isEnabled || !this._isInitialized) {
            return { enhanced: false, type: 'standard_fallback' };
        }

        // 2. 检查是否包含关键词以触发Agent
        if (this._shouldUseDeepResearch(userMessage)) {
            console.log('[Orchestrator] 检测到关键词，启动DeepResearch Agent...');
            return await this._handleWithDeepResearch(userMessage, context);
        }

        // 3. 否则，明确回退到标准模式
        console.log('[Orchestrator] 未检测到Agent触发词，回退到标准模式。');
        return { enhanced: false, type: 'standard_fallback' };
    }

    /**
     * 🎯 触发条件：总开关打开 + Agent可用 + 包含关键词
     */
    _shouldUseDeepResearch(userMessage) {
        const triggerKeyword = '深度研究';
        return this.deepResearchAgent && userMessage.trim().toLowerCase().includes(triggerKeyword);
    }

    async _handleWithDeepResearch(userMessage, context) {
        try {
            // 从用户消息中移除触发词，得到纯粹的研究主题
            const topic = userMessage.replace(/深度研究/gi, '').trim();

            // 🎯 获取研究工具的定义（名称+描述），交给LLM去选择
            const availableToolDefinitions = (await this.skillManager.baseSkillManager.getAllSkills())
                .filter(skill => this.researchTools.includes(skill.tool_name));

            const researchRequest = {
                topic: topic || userMessage, // 如果移除关键词后为空，则使用原消息
                availableTools: availableToolDefinitions
            };

            const researchResult = await this.deepResearchAgent.conductResearch(researchRequest);

            return {
                enhanced: true,
                type: 'research_result',
                content: researchResult.report,
                success: researchResult.success,
                iterations: researchResult.iterations,
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
            on_tool_end: (e) => window.dispatchEvent(new CustomEvent('agent:thinking', { detail: { content: `工具执行完成。结果: ${e.data.output.substring(0, 100)}...`, type: 'result', agentType: 'deep_research' } })),
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