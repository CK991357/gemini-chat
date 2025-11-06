// src/static/js/agent/tools/ToolImplementations.js

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 统一工具参数适配器
 */
class UnifiedToolAdapter {
    /**
     * 标准化工具参数结构
     */
    static normalizeParameters(toolName, rawParameters) {
        if (!rawParameters) return {};
        
        const parameters = { ...rawParameters };
        
        switch (toolName) {
            case 'firecrawl':
            case 'crawl4ai':
                // 🎯 修复：统一包装参数结构
                if (parameters.url && !parameters.parameters) {
                    console.log(`[ToolAdapter] 包装 ${toolName} 参数结构`);
                    return {
                        mode: parameters.mode || 'scrape',
                        parameters: {
                            url: parameters.url,
                            ...(parameters.format && { format: parameters.format }),
                            ...(parameters.max_pages && { max_pages: parameters.max_pages }),
                            ...(parameters.max_depth && { max_depth: parameters.max_depth }),
                            ...(parameters.strategy && { strategy: parameters.strategy })
                        }
                    };
                }
                break;
                
            case 'tavily_search':
                // 🎯 确保搜索参数正确
                if (parameters.query && typeof parameters.query === 'object') {
                    console.warn(`[ToolAdapter] 修复 tavily_search 查询参数`);
                    return {
                        query: parameters.query.query || JSON.stringify(parameters.query),
                        ...(parameters.search_depth && { search_depth: parameters.search_depth }),
                        ...(parameters.include_answer && { include_answer: parameters.include_answer })
                    };
                }
                break;
                
            case 'python_sandbox':
                // 🎯 确保代码参数正确
                if (parameters.parameters && parameters.parameters.code) {
                    console.log(`[ToolAdapter] 解包 python_sandbox 嵌套参数`);
                    return parameters.parameters;
                }
                break;
                
            case 'stockfish_analyzer':
                // 🎯 确保棋局分析参数正确
                if (parameters.fen && parameters.mode) {
                    return {
                        fen: parameters.fen,
                        mode: parameters.mode,
                        ...(parameters.depth && { depth: parameters.depth })
                    };
                }
                break;
                
            case 'glm4v_analyze_image':
                // 🎯 确保图像分析参数正确
                if (parameters.image_url && parameters.prompt) {
                    return {
                        model: parameters.model || 'glm-4v',
                        image_url: parameters.image_url,
                        prompt: parameters.prompt
                    };
                }
                break;
                
            default:
                // 其他工具保持原样
                break;
        }
        
        return parameters;
    }
    
    /**
     * 标准化工具响应
     */
    static normalizeResponse(toolName, rawResponse) {
        if (!rawResponse) {
            return {
                success: false,
                output: '工具返回空响应',
                isError: true
            };
        }
        
        // 🎯 统一成功状态判断
        let success = rawResponse.success !== false;
        let output = '';
        let data = rawResponse.data || rawResponse.result || rawResponse;
        
        // 🎯 工具特定的响应处理
        switch (toolName) {
            case 'tavily_search':
                if (data && Array.isArray(data)) {
                    // 格式化搜索结果
                    output = data.map(item => 
                        `• ${item.title || '无标题'}: ${item.content?.substring(0, 150)}...`
                    ).join('\n');
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                } else if (rawResponse.answer) {
                    output = `答案: ${rawResponse.answer}\n\n相关结果:\n${JSON.stringify(data, null, 2)}`;
                    success = true;
                }
                break;
                
            case 'firecrawl':
            case 'crawl4ai':
                if (data && data.content) {
                    output = data.content;
                    success = true;
                } else if (data && data.markdown) {
                    output = data.markdown;
                    success = true;
                } else if (data && data.data) {
                    output = typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
                    success = true;
                } else if (data && typeof data === 'object') {
                    // 🎯 处理包含 title 和 content 的对象
                    if (data.title || data.content) {
                        output = `标题: ${data.title || '无标题'}\n\n内容: ${data.content || '无内容'}`;
                        success = true;
                    } else {
                        output = JSON.stringify(data, null, 2);
                        success = true;
                    }
                }
                break;
                
            case 'python_sandbox':
                if (data && data.stdout) {
                    output = data.stdout;
                    success = true;
                } else if (data && data.result) {
                    output = data.result;
                    success = true;
                } else if (data && data.output) {
                    output = data.output;
                    success = true;
                } else if (data && typeof data === 'string') {
                    output = data;
                    success = true;
                }
                break;
                
            case 'stockfish_analyzer':
                if (data && data.best_move) {
                    output = `最佳着法: ${data.best_move}`;
                    success = true;
                } else if (data && data.top_moves) {
                    output = `顶级着法:\n${data.top_moves.map((move, index) => 
                        `${index + 1}. ${move.move} (评分: ${move.score})`
                    ).join('\n')}`;
                    success = true;
                } else if (data && data.evaluation) {
                    output = `局面评估: ${data.evaluation}`;
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                }
                break;
                
            case 'glm4v_analyze_image':
                if (data && data.choices && data.choices[0] && data.choices[0].message) {
                    output = data.choices[0].message.content;
                    success = true;
                } else if (data && data.content) {
                    output = data.content;
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                }
                break;
                
            case 'mcp_tool_catalog':
                if (data && Array.isArray(data)) {
                    output = `可用工具列表 (${data.length} 个):\n\n${data.map(tool => 
                        `• ${tool.function?.name || '未知工具'}: ${tool.function?.description || '无描述'}`
                    ).join('\n')}`;
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                }
                break;
                
            default:
                // 🎯 通用响应处理
                if (typeof data === 'string') {
                    output = data;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                } else {
                    output = String(data);
                }
                break;
        }
        
        // 🎯 错误处理
        if (rawResponse.error) {
            success = false;
            output = rawResponse.error;
        }
        
        // 🎯 确保有输出
        if (success && !output) {
            output = `${toolName} 执行成功`;
        }
        
        return {
            success,
            output: output || '工具执行完成',
            rawResponse,
            isError: !success
        };
    }
}

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
            
            // 🎯 统一参数适配
            const normalizedInput = UnifiedToolAdapter.normalizeParameters(this.name, input);
            console.log(`[ProxiedTool] 适配后参数:`, this.sanitizeToolInput(normalizedInput));
            
            // 🎯 智能超时机制
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
            });
            
            const toolPromise = this.chatApiHandler.callTool(this.name, normalizedInput);
            
            // 🎯 竞争执行和超时
            const rawResult = await Promise.race([toolPromise, timeoutPromise]);
            
            const executionTime = Date.now() - startTime;
            
            console.log(`[ProxiedTool] 原始响应:`, {
                tool: this.name,
                success: rawResult?.success,
                hasData: !!rawResult?.data,
                executionTime
            });
            
            // 🎯 统一响应处理 - 修复这里的关键问题
            const normalizedResult = UnifiedToolAdapter.normalizeResponse(this.name, rawResult);
            
            console.log(`[ProxiedTool] 最终结果:`, {
                tool: this.name,
                success: normalizedResult.success,
                outputLength: normalizedResult.output?.length || 0,
                executionTime
            });
            
            return {
                ...normalizedResult,
                executionTime
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
        if (!input || typeof input !== 'object') {
            return input;
        }
        
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
        
        // 清理嵌套参数
        if (sanitized.parameters && typeof sanitized.parameters === 'object') {
            sanitized.parameters = this.sanitizeToolInput(sanitized.parameters);
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