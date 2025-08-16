/**
 * @fileoverview 模块，用于处理与Qwen模型的MCP（模型上下文协议）交互。
 * 负责协调模型、外部工具（如Tavily搜索）和UI之间的通信。
 * 最终修复：移除对外部SDK的依赖，使用原生fetch实现MCP客户端逻辑。
 */

/**
 * QwenMcpClient 类
 * @class
 * @description 管理与Qwen模型的工具调用流程。
 */
export class QwenMcpClient {
    /**
     * 构造函数
     * @param {object} options - 配置选项。
     * @param {string} options.tavilyServerUrl - Tavily MCP服务器的URL。
     * @param {object} options.callbacks - 用于与UI通信的回调函数。
     */
    constructor({ tavilyServerUrl, callbacks }) {
        this.tavilyServerUrl = tavilyServerUrl;
        this.callbacks = callbacks;
        // 初始化时不再需要复杂的McpClient实例
        console.log('QwenMcpClient initialized for server:', this.tavilyServerUrl);
    }

    /**
     * 初始化MCP客户端 (现在是一个空操作，为了保持接口一致性)
     * @returns {Promise<void>}
     */
    async initialize() {
        // 不需要执行任何操作，因为我们直接使用fetch
        return Promise.resolve();
    }

    /**
     * 发送消息并处理完整的MCP流程
     * @async
     * @param {object} requestBody - 发送给模型的初始请求体。
     * @returns {Promise<void>}
     */
    async sendMessage(requestBody) {
           // 修复后的MCP流程
           // 流程概述:
           // 1. 将用户问题和工具定义发送到主后端 (`/chat`)，让模型决定是否调用工具。
           // 2. 如果模型决定调用工具，主后端会返回一个 `tool_code` 类型的响应。
           // 3. 解析 `tool_code`，构造一个符合MCP规范的请求体。
           // 4. 将此规范的请求体发送到Tavily MCP Worker (`this.tavilyServerUrl`)。
           // 5. 接收工具的执行结果。
           // 6. 将工具结果连同上下文一起发回主后端，让模型生成最终答案。
           // 7. 显示最终答案。
   
           let finalContent = '';
           let currentAIMessageElement = null;
           let toolCallInfo = null;
   
           try {
               // --- 步骤 1 & 2: 调用模型并等待工具调用指令 ---
               const initialResponse = await fetch('/chat', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({
                       ...requestBody,
                       stream: true // 确保启用流式响应
                   })
               });
   
               if (!initialResponse.ok) {
                   throw new Error(`Initial model call failed! status: ${initialResponse.status}`);
               }
   
               // 处理来自主后端的流式响应
               const reader = initialResponse.body.getReader();
               const decoder = new TextDecoder();
               let buffer = '';
   
               while (true) {
                   const { done, value } = await reader.read();
                   if (done) break;
   
                   buffer += decoder.decode(value, { stream: true });
                   const lines = buffer.split('\n');
                   buffer = lines.pop();
   
                   for (const line of lines) {
                       if (line.trim().startsWith('data:')) {
                           const dataStr = line.substring(5).trim();
                           if (dataStr === '[DONE]') break;
                           
                           try {
                               const chunk = JSON.parse(dataStr);
                               if (chunk.tool_code) {
                                   // 收到工具调用指令
                                   // 修复1：后端适配器返回的 tool_code 已经是 JSON 对象，无需再次解析
                                   const toolCode = chunk.tool_code;
                                   // 修复2：直接使用 toolCode 对象，其结构为 { tool_name, tool_params }
                                   // 并将其适配到前端期望的 { tool_name, parameters } 结构
                                   toolCallInfo = {
                                       tool_name: toolCode.tool_name,
                                       parameters: toolCode.tool_params
                                   };
                                   console.log("Model requested tool call:", toolCallInfo);
                                   if (this.callbacks.onToolStart) {
                                       currentAIMessageElement = this.callbacks.onToolStart(toolCallInfo);
                                   }
                                   // 停止读取初始响应流，因为我们现在需要调用工具
                                   break;
                               } else if (chunk.text) {
                                   // 如果模型没有调用工具，直接输出文本
                                   if (!currentAIMessageElement) {
                                       currentAIMessageElement = this.callbacks.createAIMessageElement();
                                   }
                                   finalContent += chunk.text;
                                   if (this.callbacks.onUpdateContent) {
                                       this.callbacks.onUpdateContent(currentAIMessageElement, finalContent);
                                   }
                               }
                           } catch (e) {
                               console.warn('Failed to parse JSON chunk from main backend:', dataStr, e);
                           }
                       }
                   }
                   if (toolCallInfo) break; // 如果已收到工具调用，则跳出while循环
               }
               
               // --- 步骤 3 & 4 & 5: 如果需要，执行工具调用 ---
               if (toolCallInfo) {
                   const { tool_name, parameters } = toolCallInfo;
   
                   // 构造符合MCP规范的请求体
                   const mcpRequestBody = {
                       type: "tool_use",
                       tool_name: tool_name.split('::')[1], // 从 "tavily::search" 中提取 "search"
                       arguments: parameters
                   };
   
                   console.log("Sending to MCP Worker:", mcpRequestBody);
   
                   const toolResponse = await fetch(this.tavilyServerUrl, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify(mcpRequestBody)
                   });
   
                   if (!toolResponse.ok) {
                       throw new Error(`Tool execution failed! status: ${toolResponse.status}`);
                   }
   
                   const toolResult = await toolResponse.json();
                   console.log("Received tool result:", toolResult);
                   
                   if (this.callbacks.onToolEnd && currentAIMessageElement) {
                       this.callbacks.onToolEnd(currentAIMessageElement, toolResult);
                   }
   
                   // TODO: 步骤 6 & 7 - 将工具结果发回模型以获得最终答案
                   // 这是一个简化的实现，我们暂时只显示工具结果
                   finalContent = `Tool Result:\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\``;
                   if (this.callbacks.onUpdateContent) {
                       this.callbacks.onUpdateContent(currentAIMessageElement, finalContent);
                   }
               }
   
               if (this.callbacks.onComplete) {
                   this.callbacks.onComplete(finalContent);
               }
   
           } catch (error) {
               console.error('MCP chat flow failed:', error);
               if (this.callbacks.onError) {
                   this.callbacks.onError('MCP 聊天流程失败: ' + error.message);
               }
           }
       }
}