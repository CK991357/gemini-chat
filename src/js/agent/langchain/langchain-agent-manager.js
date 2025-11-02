import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain"; // 🆕 修正：使用正确的导入路径
import { LangChainMiddlewareAdapter } from "./langchain-middleware-adapter.js"; // 🆕 新增导入
import { LangChainToolsAdapter } from "./langchain-tools-adapter.js";

export class LangChainAgentManager {
  constructor(apiHandler, callbackManager, workflowUI) { // 🆕 添加workflowUI参数
    this.apiHandler = apiHandler;
    this.callbackManager = callbackManager;
    this.workflowUI = workflowUI; // 🆕 保存workflowUI引用
    this.toolsAdapter = new LangChainToolsAdapter(apiHandler);
    this.agentCache = new Map();
    
    // 🆕 初始化Middleware适配器
    this.middlewareAdapter = new LangChainMiddlewareAdapter(callbackManager, workflowUI);
  }

  async execute(userMessage, context = {}) {
    try {
      // 触发开始事件
      await this.callbackManager.onWorkflowStart({
        name: "LangChain智能代理",
        steps: [{ name: "代理推理", toolName: "langchain_agent" }],
        type: "langchain_agent"
      });

      // 更新UI状态
      if (this.workflowUI) {
        this.workflowUI.showWorkflow({
          name: "智能代理处理中...",
          steps: [{ name: "LangChain代理分析", toolName: "langchain_agent" }],
          type: "langchain_agent"
        });
        this.workflowUI.updateStep(0, 'running', {
          success: false,
          output: "正在使用LangChain代理分析问题..."
        });
      }

      // 准备配置
      const modelConfig = {
        model: context.model || 'gpt-3.5-turbo',
        apiKey: context.apiKey,
        temperature: 0.1,
        maxTokens: 2000
      };

      // 智能选择工具
      const relevantTools = await this.selectRelevantTools(userMessage, context);
      
      // 🆕 创建包含Middleware的代理
      const agent = await this.createAgent(modelConfig, relevantTools, context);
      
      // 执行查询
      const result = await agent.invoke({
        input: userMessage,
        chat_history: context.chatHistory || [],
      });

      console.log(`[LangChain] 代理执行完成`, {
        outputLength: result.output?.length,
        steps: result.intermediateSteps?.length
      });

      // 更新UI状态为完成
      if (this.workflowUI) {
        this.workflowUI.updateStep(0, 'success', {
          success: true,
          output: "LangChain代理分析完成"
        });
      }

      // 触发结束事件
      await this.callbackManager.onWorkflowEnd(
        { name: "LangChain智能代理" },
        { 
          success: true, 
          output: result.output,
          summary: {
            totalSteps: result.intermediateSteps?.length || 0,
            successfulSteps: result.intermediateSteps?.length || 0,
            totalExecutionTime: 0
          }
        }
      );

      return {
        success: true,
        content: result.output,
        enhanced: true,
        agentType: 'langchain',
        toolCalls: result.intermediateSteps?.map(step => ({
          tool: step.action.tool,
          input: step.action.toolInput,
          output: step.observation,
          success: !step.observation.includes('Error:')
        })) || []
      };

    } catch (error) {
      console.error("[LangChain] 代理执行失败:", error);
      
      // 更新UI状态为失败
      if (this.workflowUI) {
        this.workflowUI.updateStep(0, 'failed', {
          success: false,
          error: error.message
        });
      }

      await this.callbackManager.onError(error, null, {
        source: 'langchain_agent',
        userQuery: userMessage
      });

      return {
        success: false,
        content: `LangChain代理处理失败: ${error.message}`,
        enhanced: true,
        agentType: 'langchain',
        error: error.message
      };
    }
  }

  async createAgent(modelConfig, tools, context) {
    const cacheKey = this.getCacheKey(modelConfig, tools);
    
    if (this.agentCache.has(cacheKey)) {
      console.log(`[LangChain] 使用缓存代理: ${cacheKey}`);
      return this.agentCache.get(cacheKey);
    }

    try {
      const model = new ChatOpenAI({
        modelName: modelConfig.model,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        openAIApiKey: modelConfig.apiKey,
        configuration: {
          baseURL: this.getModelBaseURL(modelConfig.model)
        }
      });

      // 🆕 获取所有中间件
      const middlewares = this.middlewareAdapter.getAllMiddlewares();

      // 🆕 修正：使用 createAgent 而不是 createReactAgent
      const agent = await createAgent({
        model: model,
        tools,
        prompt: this.createSystemPrompt(context, tools),
        middleware: middlewares // 🆕 注入中间件
      });

      this.agentCache.set(cacheKey, agent);
      console.log(`[LangChain] 创建新代理(带中间件): ${cacheKey}`);
      return agent;

    } catch (error) {
      console.error("创建LangChain代理失败:", error);
      throw error;
    }
  }

  // 🆕 新增：获取中间件状态信息
  getMiddlewareStatus() {
    const middlewares = this.middlewareAdapter.getAllMiddlewares();
    return {
      middlewareCount: middlewares.length,
      middlewareNames: middlewares.map(m => m.name),
      hasCustomMiddlewares: this.middlewareAdapter.customMiddlewareFactories?.length > 0
    };
  }

  // 🆕 新增：添加自定义中间件的方法
  addCustomMiddleware(middlewareFactory) {
    this.middlewareAdapter.addCustomMiddleware(middlewareFactory);
    this.clearCache(); // 清除缓存以应用新的中间件
  }

  async selectRelevantTools(userMessage, context) {
    // 🎯 重用EnhancedSkillManager进行智能工具选择
    if (context.skillManager) {
      try {
        const skillMatches = await context.skillManager.findOptimalSkill(userMessage, {
          availableTools: context.availableTools || [],
          category: context.category
        });
        return this.toolsAdapter.getToolsBySkillMatches(skillMatches);
      } catch (error) {
        console.warn("SkillManager匹配失败，使用默认工具:", error);
      }
    }

    // 降级：使用所有可用工具
    const allTools = this.toolsAdapter.createAllTools();
    if (context.availableTools?.length > 0) {
      return allTools.filter(tool => context.availableTools.includes(tool.name));
    }
    return allTools;
  }

  createSystemPrompt(context, tools) {
    const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
    
    return `
你是一个智能助手，可以访问各种工具来帮助用户解决问题。

可用工具：
${toolDescriptions}

指导原则：
1. 仔细分析用户问题，确定是否需要使用工具
2. 优先使用最合适的工具
3. 如果工具执行失败，尝试其他方法
4. 保持回答的准确性和实用性

请按照思考-行动-观察的循环来工作。
${context.systemPrompt || ''}
`;
  }

  getCacheKey(modelConfig, tools) {
    return `${modelConfig.model}_${tools.map(t => t.name).join(',')}`;
  }

  getModelBaseURL(modelName) {
    return modelName.includes('gemini') 
      ? "https://generativelanguage.googleapis.com/v1beta/openai/"
      : undefined;
  }

  clearCache() {
    this.agentCache.clear();
  }
}