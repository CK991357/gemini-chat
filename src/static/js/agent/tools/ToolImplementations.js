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
            'tavily_search': 20000,     // 搜索应该较快
            'firecrawl': 45000,         // 网页抓取中等
            'crawl4ai': 45000,          // 深度爬取需要时间
            'stockfish_analyzer': 30000, // 棋局分析中等
            'glm4v_analyze_image': 25000, // 图像分析中等
            'mcp_tool_catalog': 10000,  // 工具目录查询应该很快
            'default': 30000            // 默认30秒
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
            
            console.log(`[ProxiedTool] 工具执行成功: ${this.name} (${executionTime}ms)`, {
                hasOutput: !!result.output,
                outputType: typeof result.output,
                outputLength: result.output?.length || 0,
                rawResultKeys: result ? Object.keys(result) : 'null'
            });
            
            // 🎯 关键修复：更智能的成功状态判断
            let success = true;
            let output = '';
            
            if (result && typeof result === 'object') {
                // 如果后端返回了明确的 success 字段，使用它
                if (typeof result.success === 'boolean') {
                    success = result.success;
                }
                // 如果有 output 字段，使用它
                if (result.output !== undefined && result.output !== null) {
                    output = result.output;
                    success = true;
                } else if (result.content !== undefined && result.content !== null) {
                    output = result.content;
                    success = true; // 有内容通常意味着成功
                } else if (result.title !== undefined || result.content !== undefined) {
                    // 🎯 修复：对于 crawl4ai 返回的 {title, content} 格式
                    output = JSON.stringify(result);
                    success = true;
                } else if (Object.keys(result).length > 0) {
                    // 🎯 修复：如果返回了任何有效数据，视为成功
                    output = JSON.stringify(result);
                    success = true;
                }
            } else if (typeof result === 'string' && result.length > 0) {
                output = result;
                success = true;
            } else if (result !== null && result !== undefined) {
                // 🎯 修复：任何非空非undefined的结果都视为成功
                output = String(result);
                success = true;
            }
            
            // 🎯 检查是否有错误信息
            if (result && result.error) {
                success = false;
                output = result.error;
            }
            
            // 如果没有任何输出但状态是成功，创建默认输出
            if (success && !output) {
                output = `${this.name} 执行成功`;
            }
            
            console.log(`[ProxiedTool] 最终解析结果:`, {
                success,
                outputLength: output.length,
                outputPreview: output.substring(0, 100) + (output.length > 100 ? '...' : '')
            });
            
            return {
                success: success,
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