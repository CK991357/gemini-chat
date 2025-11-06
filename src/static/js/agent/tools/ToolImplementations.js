// src/static/js/agent/tools/ToolImplementations.js

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 统一工具参数适配器 - 支持模式分离
 */
class UnifiedToolAdapter {
    /**
     * Agent模式专用参数适配
     */
    static normalizeParametersForAgent(toolName, rawParameters) {
        console.log(`[ToolAdapter] Agent模式参数适配: ${toolName}`);
        
        if (!rawParameters) return {};
        
        const parameters = { ...rawParameters };
        
        // 🎯 Agent模式使用更激进的参数包装策略
        switch (toolName) {
            case 'firecrawl':
            case 'crawl4ai':
                // Agent模式下强制包装嵌套结构
                if (parameters.url) {
                    return {
                        mode: parameters.mode || 'scrape',
                        parameters: {
                            url: parameters.url,
                            format: 'markdown', // Agent模式默认使用markdown
                            word_count_threshold: 30, // 更宽松的内容阈值
                            exclude_external_links: false, // 允许外部链接获取更多上下文
                            ...parameters // 保留其他参数
                        }
                    };
                }
                break;
                
            case 'tavily_search':
                // Agent模式下获取更多结果
                return {
                    query: parameters.query,
                    max_results: 10, // 更多结果供Agent分析
                    include_raw_content: true, // 包含原始内容
                    search_depth: 'advanced' // 更深入的搜索
                };
                
            case 'python_sandbox':
                // Agent模式下优化代码执行参数
                if (parameters.parameters && parameters.parameters.code) {
                    return parameters.parameters;
                }
                // 为Agent提供更好的默认代码模板
                if (parameters.code) {
                    return {
                        code: parameters.code,
                        timeout: 60 // Agent模式允许更长的执行时间
                    };
                }
                break;
                
            case 'stockfish_analyzer':
                // Agent模式下使用更深入的分析
                if (parameters.fen && parameters.mode) {
                    return {
                        fen: parameters.fen,
                        mode: parameters.mode,
                        depth: parameters.depth || 20, // 更深的分析
                        movetime: parameters.movetime || 5000 // 更长的思考时间
                    };
                }
                break;
                
            case 'glm4v_analyze_image':
                // Agent模式下提供更详细的提示词
                if (parameters.image_url && parameters.prompt) {
                    return {
                        model: parameters.model || 'glm-4v',
                        image_url: parameters.image_url,
                        prompt: `请详细分析这张图片，提供全面的描述和洞察：${parameters.prompt}`,
                        max_tokens: 2000 // 更长的响应
                    };
                }
                break;
                
            default:
                // 其他工具保持Agent优化
                break;
        }
        
        return parameters;
    }
    
    /**
     * 标准模式参数适配（最小化处理）
     */
    static normalizeParametersForStandard(toolName, rawParameters) {
        console.log(`[ToolAdapter] 标准模式参数适配: ${toolName}`);
        
        if (!rawParameters) return {};
        
        const parameters = { ...rawParameters };
        
        // 🎯 标准模式只做最基本的参数修复
        switch (toolName) {
            case 'firecrawl':
            case 'crawl4ai':
                // 标准模式：只在明显需要时包装参数
                if (parameters.url && !parameters.parameters && !parameters.mode) {
                    return {
                        mode: 'scrape',
                        parameters: {
                            url: parameters.url
                        }
                    };
                }
                break;
                
            case 'tavily_search':
                // 标准模式：修复明显错误的查询参数
                if (parameters.query && typeof parameters.query === 'object') {
                    return {
                        query: parameters.query.query || JSON.stringify(parameters.query)
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
     * 🎯 统一参数适配器
     */
    static normalizeParameters(toolName, rawParameters, isAgentMode = false) {
        if (isAgentMode) {
            return this.normalizeParametersForAgent(toolName, rawParameters);
        }
        return this.normalizeParametersForStandard(toolName, rawParameters);
    }
    
    /**
     * Agent模式专用响应处理
     */
    static normalizeResponseForAgent(toolName, rawResponse) {
        console.log(`[ToolAdapter] Agent模式响应处理: ${toolName}`);
        
        if (!rawResponse) {
            return {
                success: false,
                output: '工具返回空响应',
                isError: true
            };
        }
        
        // 🎯 Agent模式需要更结构化的响应数据
        let success = rawResponse.success !== false;
        let output = '';
        let data = rawResponse.data || rawResponse.result || rawResponse;
        
        // 🎯 Agent模式专用响应处理
        switch (toolName) {
            case 'tavily_search':
                if (data && Array.isArray(data)) {
                    // Agent模式：更详细的搜索结果格式化
                    output = `🔍 搜索到 ${data.length} 个相关结果：\n\n` + 
                        data.map((item, index) => 
                            `${index + 1}. **${item.title || '无标题'}**\n` +
                            `   📍 来源: ${item.url || '未知'}\n` +
                            `   📝 ${item.content?.substring(0, 200)}...`
                        ).join('\n\n');
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                } else if (rawResponse.answer) {
                    output = `🤖 **智能答案**: ${rawResponse.answer}\n\n` +
                            `📚 **相关搜索结果**:\n${JSON.stringify(data, null, 2)}`;
                    success = true;
                }
                break;
                
            case 'firecrawl':
            case 'crawl4ai':
                if (data && data.content) {
                    output = `📄 **网页内容提取结果**\n\n` +
                            `**标题**: ${data.title || '无标题'}\n\n` +
                            `**内容**:\n${data.content}`;
                    success = true;
                } else if (data && data.markdown) {
                    output = data.markdown;
                    success = true;
                } else if (data && data.data) {
                    output = typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = `📊 **结构化数据**:\n${JSON.stringify(data, null, 2)}`;
                    success = true;
                }
                break;
                
            case 'python_sandbox':
                if (data && data.stdout) {
                    output = `🐍 **代码执行结果**\n\n${data.stdout}`;
                    success = true;
                } else if (data && data.result) {
                    output = `📋 **执行结果**: ${data.result}`;
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
                    output = `♟️ **棋局分析结果**\n\n` +
                            `🏆 **最佳着法**: ${data.best_move}\n` +
                            `📊 **评估分数**: ${data.score || 'N/A'}\n` +
                            `⏱️ **思考深度**: ${data.depth || 'N/A'}`;
                    success = true;
                } else if (data && data.top_moves) {
                    output = `🏆 **顶级着法分析**:\n\n` +
                            data.top_moves.map((move, index) => 
                                `${index + 1}. ${move.move} (评分: ${move.score})`
                            ).join('\n');
                    success = true;
                } else if (data && data.evaluation) {
                    output = `📈 **局面评估**: ${data.evaluation}`;
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                }
                break;
                
            case 'glm4v_analyze_image':
                if (data && data.choices && data.choices[0] && data.choices[0].message) {
                    output = `🖼️ **图像分析结果**\n\n${data.choices[0].message.content}`;
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
                    output = `🛠️ **可用工具目录** (共 ${data.length} 个工具)\n\n` +
                            data.map(tool => 
                                `• **${tool.function?.name || '未知工具'}**: ${tool.function?.description || '无描述'}`
                            ).join('\n');
                    success = true;
                } else if (data && typeof data === 'object') {
                    output = JSON.stringify(data, null, 2);
                    success = true;
                }
                break;
                
            default:
                // 🎯 Agent模式通用响应处理
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
            output = `❌ **工具执行错误**: ${rawResponse.error}`;
        }
        
        // 🎯 确保有输出
        if (success && !output) {
            output = `✅ ${toolName} 执行成功`;
        }
        
        // 🎯 为Agent添加结构化元数据
        return {
            success,
            output: output || '工具执行完成',
            rawResponse,
            isError: !success,
            agentMetadata: {
                tool: toolName,
                timestamp: Date.now(),
                structuredData: this._extractStructuredData(toolName, rawResponse),
                suggestions: this._generateAgentSuggestions(toolName, output)
            }
        };
    }
    
    /**
     * 标准模式响应处理（最小化处理）
     */
    static normalizeResponseForStandard(toolName, rawResponse) {
        console.log(`[ToolAdapter] 标准模式响应处理: ${toolName}`);
        
        if (!rawResponse) {
            return {
                success: false,
                output: '工具返回空响应'
            };
        }
        
        // 🎯 标准模式：保持最简响应格式
        let success = rawResponse.success !== false;
        let output = '';
        
        if (rawResponse.output !== undefined && rawResponse.output !== null) {
            output = rawResponse.output;
        } else if (rawResponse.data !== undefined && rawResponse.data !== null) {
            output = typeof rawResponse.data === 'string' ? rawResponse.data : JSON.stringify(rawResponse.data);
        } else if (rawResponse !== null && rawResponse !== undefined) {
            output = String(rawResponse);
        }
        
        // 错误处理
        if (rawResponse.error) {
            success = false;
            output = rawResponse.error;
        }
        
        // 确保有输出
        if (success && !output) {
            output = `${toolName} 执行成功`;
        }
        
        return {
            success,
            output: output || '工具执行完成',
            rawResponse
        };
    }
    
    /**
     * 🎯 统一响应处理
     */
    static normalizeResponse(toolName, rawResponse, isAgentMode = false) {
        if (isAgentMode) {
            return this.normalizeResponseForAgent(toolName, rawResponse);
        }
        return this.normalizeResponseForStandard(toolName, rawResponse);
    }
    
    /**
     * 🎯 为Agent生成执行建议
     */
    static _generateAgentSuggestions(toolName, result) {
        if (!result) return [];
        
        const suggestions = [];
        
        switch (toolName) {
            case 'crawl4ai':
            case 'firecrawl':
                if (result && result.length > 1000) {
                    suggestions.push('内容较长，建议进行总结提取关键信息');
                }
                if (result.includes('错误') || result.includes('error') || result.includes('失败')) {
                    suggestions.push('检测到可能的错误信息，建议检查URL或尝试其他网站');
                }
                break;
                
            case 'tavily_search':
                suggestions.push('请分析搜索结果并提取最相关的信息');
                if (result && result.includes('个相关结果') && parseInt(result.match(/\d+/)?.[0]) > 5) {
                    suggestions.push('搜索结果较多，建议筛选最相关的前几个结果');
                }
                break;
                
            case 'python_sandbox':
                if (result.includes('error') || result.includes('Error') || result.includes('异常')) {
                    suggestions.push('代码执行出现错误，请检查代码逻辑或输入参数');
                }
                if (result.includes('警告') || result.includes('warning')) {
                    suggestions.push('代码执行有警告信息，建议优化代码');
                }
                break;
                
            case 'stockfish_analyzer':
                suggestions.push('请根据分析结果给出棋局建议或下一步策略');
                break;
                
            case 'glm4v_analyze_image':
                suggestions.push('请根据图像分析结果提供详细的描述和洞察');
                break;
        }
        
        return suggestions;
    }
    
    /**
     * 🎯 提取结构化数据供Agent使用
     */
    static _extractStructuredData(toolName, rawResponse) {
        // 根据工具类型提取结构化数据
        switch (toolName) {
            case 'tavily_search':
                if (rawResponse.data && Array.isArray(rawResponse.data)) {
                    return {
                        resultCount: rawResponse.data.length,
                        titles: rawResponse.data.map(item => item.title).filter(Boolean),
                        sources: rawResponse.data.map(item => item.url).filter(Boolean),
                        hasAnswer: !!rawResponse.answer
                    };
                }
                break;
                
            case 'crawl4ai':
            case 'firecrawl':
                if (rawResponse.data) {
                    return {
                        hasContent: !!rawResponse.data.content,
                        contentLength: rawResponse.data.content?.length || 0,
                        title: rawResponse.data.title || '无标题',
                        hasMarkdown: !!rawResponse.data.markdown
                    };
                }
                break;
                
            case 'python_sandbox':
                return {
                    hasOutput: !!(rawResponse.stdout || rawResponse.result),
                    hasError: !!rawResponse.stderr,
                    outputLength: (rawResponse.stdout || '').length
                };
                
            case 'stockfish_analyzer':
                if (rawResponse.data) {
                    return {
                        bestMove: rawResponse.data.best_move,
                        evaluation: rawResponse.data.evaluation,
                        hasTopMoves: !!(rawResponse.data.top_moves && rawResponse.data.top_moves.length > 0)
                    };
                }
                break;
        }
        
        return null;
    }
}

/**
 * @class ProxiedTool
 * @description 通用代理工具实现，支持普通模式和Agent模式完全分离
 */
class ProxiedTool extends BaseTool {
    /**
     * 🎯 智能超时策略：根据工具类型和模式设置合理的超时时间
     */
    _getToolTimeout(toolName, isAgentMode = false) {
        const baseTimeouts = {
            'python_sandbox': 60000,    // 代码执行需要更长时间
            'tavily_search': 20000,     // 搜索应该较快
            'firecrawl': 45000,         // 网页抓取中等
            'crawl4ai': 45000,          // 深度爬取需要时间
            'stockfish_analyzer': 30000, // 棋局分析中等
            'glm4v_analyze_image': 25000, // 图像分析中等
            'mcp_tool_catalog': 10000,  // 工具目录查询应该很快
            'default': 30000            // 默认30秒
        };
        
        const baseTimeout = baseTimeouts[toolName] || baseTimeouts.default;
        
        // 🎯 Agent模式允许更长的超时时间
        if (isAgentMode) {
            return Math.min(baseTimeout * 1.5, 120000); // 最多2分钟
        }
        
        return baseTimeout;
    }

    async invoke(input, runManager) {
        const startTime = Date.now();
        
        // 🎯 关键：识别调用模式
        const isAgentMode = !!runManager;
        const mode = isAgentMode ? 'agent' : 'standard';
        const timeoutMs = this._getToolTimeout(this.name, isAgentMode);
        
        console.log(`[ProxiedTool] ${mode.toUpperCase()}模式调用工具: ${this.name} (超时: ${timeoutMs}ms)`, this.sanitizeToolInput(input));
        
        try {
            let normalizedInput, rawResult, normalizedResult;
            
            // 🎯 统一参数适配
            normalizedInput = UnifiedToolAdapter.normalizeParameters(this.name, input, isAgentMode);
            console.log(`[ProxiedTool] 适配后参数:`, this.sanitizeToolInput(normalizedInput));
            
            if (isAgentMode) {
                // 🎯 Agent模式：使用竞争超时机制
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
                });
                
                const toolPromise = this.chatApiHandler.callTool(this.name, normalizedInput);
                rawResult = await Promise.race([toolPromise, timeoutPromise]);
                
            } else {
                // 🎯 普通模式：使用简化的超时机制
                rawResult = await this._callToolWithSimpleTimeout(this.name, normalizedInput, timeoutMs);
            }
            
            // 🎯 统一响应处理
            normalizedResult = UnifiedToolAdapter.normalizeResponse(this.name, rawResult, isAgentMode);
            
            const executionTime = Date.now() - startTime;
            
            console.log(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用完成: ${this.name}`, {
                success: normalizedResult.success,
                outputLength: normalizedResult.output?.length || 0,
                executionTime
            });
            
            return {
                ...normalizedResult,
                executionTime,
                mode: mode // 标记调用模式
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            console.error(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用失败: ${this.name} (${executionTime}ms)`, error);
            
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
                executionTime,
                mode: mode
            };
        }
    }
    
    /**
     * 🎯 普通模式专用：简化的工具调用
     */
    async _callToolWithSimpleTimeout(toolName, input, timeoutMs) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`工具"${toolName}"调用超时 (${timeoutMs}ms)`));
            }, timeoutMs);
            
            try {
                const result = await this.chatApiHandler.callTool(toolName, input);
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
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