import { createMiddleware } from "langchain"; // 🆕 修正：使用正确的导入路径

export class LangChainMiddlewareAdapter {
  constructor(callbackManager, workflowUI) {
    this.callbackManager = callbackManager;
    this.workflowUI = workflowUI;
    this.customMiddlewareFactories = [];
    
    // 初始化内置中间件
    this.initializeBuiltInMiddlewares();
  }

  initializeBuiltInMiddlewares() {
    this.builtInMiddlewares = [
      this.createLoggingMiddleware(),
      this.createProgressTrackingMiddleware(),
      this.createErrorHandlingMiddleware()
    ];
  }

  // 🎯 创建日志记录中间件
  createLoggingMiddleware() {
    return createMiddleware({
      name: "LoggingMiddleware",
      beforeModel: (state) => {
        console.log(`[LangChain] 准备调用模型，消息数量: ${state.messages?.length || 0}`);
        this.callbackManager.onAIStart(state.messages?.[state.messages.length - 1]?.content || '');
        return;
      },
      afterModel: (state) => {
        const lastMessage = state.messages?.[state.messages.length - 1];
        console.log(`[LangChain] 模型调用完成，响应长度: ${lastMessage?.content?.length || 0}`);
        this.callbackManager.onAIEnd(lastMessage?.content || '');
        return;
      },
      wrapToolCall: (request, handler) => {
        const toolName = request.toolCall.name;
        const args = request.toolCall.args;
        
        console.log(`[LangChain] 执行工具: ${toolName}`, args);
        this.callbackManager.onToolStart(toolName, args);
        
        try {
          const result = handler(request);
          console.log(`[LangChain] 工具执行成功: ${toolName}`);
          this.callbackManager.onToolEnd(toolName, result, 0, { success: true });
          return result;
        } catch (error) {
          console.error(`[LangChain] 工具执行失败: ${toolName}`, error);
          this.callbackManager.onToolEnd(toolName, error.message, 0, { success: false });
          throw error;
        }
      }
    });
  }

  // 🎯 创建进度跟踪中间件
  createProgressTrackingMiddleware() {
    return createMiddleware({
      name: "ProgressTrackingMiddleware",
      beforeModel: (state) => {
        if (this.workflowUI && this.workflowUI.isWorkflowActive()) {
          this.workflowUI.updateStep(0, 'running', {
            success: false,
            output: "LangChain代理推理中..."
          });
        }
        return;
      },
      afterModel: (state) => {
        const lastMessage = state.messages?.[state.messages.length - 1];
        if (lastMessage?.tool_calls?.length > 0) {
          const toolNames = lastMessage.tool_calls.map(tc => tc.name).join(', ');
          if (this.workflowUI && this.workflowUI.isWorkflowActive()) {
            this.workflowUI.updateStep(0, 'running', {
              success: false,
              output: `调用工具: ${toolNames}`
            });
          }
        }
        return;
      }
    });
  }

  // 🎯 创建错误处理中间件
  createErrorHandlingMiddleware() {
    return createMiddleware({
      name: "ErrorHandlingMiddleware",
      wrapModelCall: async (request, handler) => {
        try {
          return await handler(request);
        } catch (error) {
          console.error('[LangChain] 模型调用错误:', error);
          this.callbackManager.onError(error, null, {
            source: 'langchain_model',
            errorType: 'model_call_error'
          });
          throw error;
        }
      },
      wrapToolCall: async (request, handler) => {
        try {
          return await handler(request);
        } catch (error) {
          console.error(`[LangChain] 工具调用错误: ${request.toolCall.name}`, error);
          this.callbackManager.onError(error, null, {
            source: 'langchain_tool',
            toolName: request.toolCall.name,
            arguments: request.toolCall.args
          });
          
          // 返回错误信息而不是抛出，让代理可以继续
          return `工具执行错误: ${error.message}`;
        }
      }
    });
  }

  // 🎯 获取所有中间件
  getAllMiddlewares() {
    return [...this.builtInMiddlewares, ...this.customMiddlewareFactories.map(factory => factory())];
  }

  // 🎯 添加自定义中间件
  addCustomMiddleware(middlewareFactory) {
    this.customMiddlewareFactories.push(middlewareFactory);
    console.log(`[LangChain] 添加自定义中间件，总数: ${this.customMiddlewareFactories.length}`);
  }

  // 🎯 创建自定义中间件的辅助方法
  createCustomMiddleware(name, hooks = {}) {
    return createMiddleware({
      name,
      ...hooks
    });
  }

  // 🎯 清除自定义中间件
  clearCustomMiddlewares() {
    this.customMiddlewareFactories = [];
    console.log('[LangChain] 已清除所有自定义中间件');
  }
}