// src/static/js/agent/tools/ToolImplementations.js

import { BaseTool } from './BaseTool.js';

/**
 * @class ProxiedTool
 * @description 通用代理工具实现，处理所有通过MCP代理的工具
 */
class ProxiedTool extends BaseTool {
    /**
     * 🎯 智能超时策略：根据工具类型设置合理的超时时间
     */
    _getToolTimeout(toolName) {
        const timeouts = {
            'python_sandbox': 60000,    // 代码执行需要更长时间
            'tavily_search': 15000,     // 搜索应该较快
            'firecrawl': 30000,         // 网页抓取中等
            'crawl4ai': 45000,          // 深度爬取需要时间
            'stockfish_analyzer': 25000, // 棋局分析中等
            'glm4v_analyze_image': 20000, // 图像分析中等
            'mcp_tool_catalog': 10000,  // 工具目录查询应该很快
            'default': 20000            // 默认20秒
        };
        return timeouts[toolName] || timeouts.default;
    }

    async invoke(input, runManager) {
        const startTime = Date.now();
        const timeoutMs = this._getToolTimeout(this.name);
        
        try {
            console.log(`[ProxiedTool] 调用工具: ${this.name} (超时: ${timeoutMs}ms)`, this.sanitizeToolInput(input));
            
            // 🎯 智能超时机制
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
            });
            
            const toolPromise = this.chatApiHandler.callTool(this.name, input);
            
            // 🎯 竞争执行和超时
            const result = await Promise.race([toolPromise, timeoutPromise]);
            
            const executionTime = Date.now() - startTime;
            
            // 🎯 记录性能指标
            console.log(`[ProxiedTool] 工具执行成功: ${this.name} (${executionTime}ms)`);
            
            // 🎯 统一返回格式
            const output = result.output || result.content || `${this.name} 执行成功`;
            
            return {
                success: true,
                output: output,
                rawResult: result,
                executionTime: executionTime
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`[ProxiedTool] 工具调用失败: ${this.name} (${executionTime}ms)`, error);
            
            // 🎯 区分不同类型的错误
            let errorMessage = error.message;
            if (error.message.includes('timeout') || error.message.includes('超时')) {
                errorMessage = `工具"${this.name}"执行超时 (${timeoutMs}ms)`;
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = `网络错误: 无法连接到工具"${this.name}"`;
            } else if (error.message.includes('404') || error.message.includes('not found')) {
                errorMessage = `工具"${this.name}"服务不可用`;
            }
            
            return {
                success: false,
                output: `工具"${this.name}"执行失败: ${errorMessage}`,
                error: errorMessage,
                isError: true,
                executionTime: executionTime
            };
        }
    }

    /**
     * 🎯 清理工具输入，避免日志过大
     */
    sanitizeToolInput(input) {
        const sanitized = { ...input };
        
        // 清理大文本字段
        if (sanitized.code && sanitized.code.length > 200) {
            sanitized.code = sanitized.code.substring(0, 200) + '...';
        }
        if (sanitized.prompt && sanitized.prompt.length > 100) {
            sanitized.prompt = sanitized.prompt.substring(0, 100) + '...';
        }
        if (sanitized.query && sanitized.query.length > 100) {
            sanitized.query = sanitized.query.substring(0, 100) + '...';
        }
        
        // 清理敏感或过长的URL
        if (sanitized.url && sanitized.url.length > 150) {
            sanitized.url = sanitized.url.substring(0, 150) + '...';
        }
        if (sanitized.image_url && sanitized.image_url.length > 150) {
            sanitized.image_url = sanitized.image_url.substring(0, 150) + '...';
        }
        
        return sanitized;
    }
}

// 🎯 为每个通过MCP代理的工具创建具体实现
export class PythonSandboxTool extends ProxiedTool {}
export class TavilySearchTool extends ProxiedTool {}
export class FirecrawlTool extends ProxiedTool {}
export class StockfishAnalyzerTool extends ProxiedTool {}
export class Crawl4AITool extends ProxiedTool {}
export class Glm4vAnalyzeImageTool extends ProxiedTool {}
export class McpToolCatalogTool extends ProxiedTool {}

/**
 * 🎯 工具工厂：便于动态创建工具实例
 */
export class ToolFactory {
    static createTool(toolName, chatApiHandler, metadata) {
        const toolClasses = {
            'python_sandbox': PythonSandboxTool,
            'tavily_search': TavilySearchTool,
            'firecrawl': FirecrawlTool,
            'stockfish_analyzer': StockfishAnalyzerTool,
            'crawl4ai': Crawl4AITool,
            'glm4v_analyze_image': Glm4vAnalyzeImageTool,
            'mcp_tool_catalog': McpToolCatalogTool
        };
        
        const ToolClass = toolClasses[toolName];
        if (!ToolClass) {
            throw new Error(`未知的工具类型: ${toolName}`);
        }
        
        const toolInstance = new ToolClass(chatApiHandler);
        return toolInstance.configure(metadata);
    }
    
    /**
     * 🎯 批量创建工具
     */
    static createTools(toolDefinitions, chatApiHandler) {
        const tools = {};
        
        for (const [toolName, metadata] of Object.entries(toolDefinitions)) {
            try {
                tools[toolName] = this.createTool(toolName, chatApiHandler, metadata);
            } catch (error) {
                console.warn(`[ToolFactory] 创建工具 ${toolName} 失败:`, error);
            }
        }
        
        return tools;
    }
}