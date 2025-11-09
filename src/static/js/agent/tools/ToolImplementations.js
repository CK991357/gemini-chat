// src/static/js/agent/tools/ToolImplementations.js

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 DeepResearch专用工具适配器 - 完全隔离标准模式和Agent模式
 */
class DeepResearchToolAdapter {
    /**
     * DeepResearch模式专用参数适配
     */
    static normalizeParametersForDeepResearch(toolName, rawParameters) {
        console.log(`[DeepResearchAdapter] 深度研究模式参数适配: ${toolName}`);
        
        if (!rawParameters) return {};
        
        const parameters = { ...rawParameters };
        
        switch (toolName) {
            case 'tavily_search':
                return {
                    query: parameters.query,
                    max_results: 12,
                    include_raw_content: true,
                    search_depth: 'advanced',
                    include_answer: false,
                    include_images: false
                };
                
            case 'firecrawl':
            case 'crawl4ai':
                if (parameters.url) {
                    return {
                        mode: 'scrape',
                        parameters: {
                            url: parameters.url,
                            format: 'markdown',
                            word_count_threshold: 20,
                            exclude_external_links: false,
                            include_links: true,
                            wait_for: 2000,
                            only_main_content: false
                        }
                    };
                }
                break;
                
            case 'python_sandbox':
                if (parameters.parameters && parameters.parameters.code) {
                    return parameters.parameters;
                }
                if (parameters.code) {
                    return {
                        code: parameters.code,
                        timeout: 90,
                        allow_network: true
                    };
                }
                break;
        }
        
        return parameters;
    }
    
    /**
     * 标准模式参数适配（保持原有逻辑）
     */
    static normalizeParametersForStandard(toolName, rawParameters) {
        console.log(`[ToolAdapter] 标准模式参数适配: ${toolName}`);
        
        if (!rawParameters) return {};
        
        const parameters = { ...rawParameters };
        
        switch (toolName) {
            case 'firecrawl':
            case 'crawl4ai':
                if (parameters.url && !parameters.parameters && !parameters.mode) {
                    return { mode: 'scrape', parameters: { url: parameters.url } };
                }
                break;
            case 'tavily_search':
                if (parameters.query && typeof parameters.query === 'object') {
                    return { query: parameters.query.query || JSON.stringify(parameters.query) };
                }
                break;
        }
        
        return parameters;
    }
    
    /**
     * 🎯 统一参数适配器 - 明确区分模式
     */
    static normalizeParameters(toolName, rawParameters, mode = 'standard') {
        console.log(`[ToolAdapter] 模式识别: ${mode} - 工具: ${toolName}`);
        if (mode === 'deep_research') {
            return this.normalizeParametersForDeepResearch(toolName, rawParameters);
        }
        return this.normalizeParametersForStandard(toolName, rawParameters);
    }
    
    /**
     * DeepResearch模式专用响应处理
     */
    static normalizeResponseForDeepResearch(toolName, rawResponse) {
        console.log(`[DeepResearchAdapter] 深度研究模式响应处理: ${toolName}`);
        
        if (!rawResponse) {
            return { success: false, output: '工具返回空响应', sources: [], isError: true, mode: 'deep_research' };
        }
        
        let success = rawResponse.success !== false;
        let output = '';
        let sources = [];
        
        // ✨✨✨ 终极修复 #1: 使用正确的路径访问后端返回的原始数据 ✨✨✨
        const dataFromProxy = rawResponse.rawResult?.data || rawResponse.output || rawResponse;

        switch (toolName) {
            case 'tavily_search':
                // ✨✨✨ 终极修复 #2: 检查 dataFromProxy.results ✨✨✨
                if (dataFromProxy && Array.isArray(dataFromProxy.results)) {
                    const searchResults = dataFromProxy.results;
                    
                    sources = searchResults.map(res => ({
                        title: res.title || '无标题',
                        url: res.url || '#',
                        description: res.content ? res.content.substring(0, 150) + '...' : ''
                    }));

                    output = `🔍 **深度研究搜索结果** (${searchResults.length}个来源)\n\n` +
                        searchResults.map((res, index) =>
                            `[来源 ${index + 1}] 标题: ${res.title}\n` +
                            `网址: ${res.url}\n` +
                            `内容摘要: ${res.content}`
                        ).join('\n\n-----------------\n\n');
                    
                    success = true;
                } else if (dataFromProxy && dataFromProxy.answer) {
                    output = dataFromProxy.answer;
                    success = true;
                }
                break;
                
            case 'firecrawl':
            case 'crawl4ai':
                if (dataFromProxy && (dataFromProxy.content || dataFromProxy.markdown)) {
                    const content = dataFromProxy.content || dataFromProxy.markdown;
                    output = `📄 **网页内容提取完成**\n\n**标题**: ${dataFromProxy.title || '无标题'}\n**URL**: ${dataFromProxy.url || '未知'}\n**内容**:\n${content.substring(0, 2000)}...`;
                    
                    if (dataFromProxy.url) {
                        sources.push({
                            title: dataFromProxy.title || dataFromProxy.url,
                            url: dataFromProxy.url,
                            description: content.substring(0, 150) + '...'
                        });
                    }
                    success = true;
                } else if (dataFromProxy && typeof dataFromProxy === 'object') {
                    output = `📊 **结构化数据**:\n${JSON.stringify(dataFromProxy, null, 2)}`;
                    success = true;
                }
                break;
                
            case 'python_sandbox':
                 if (dataFromProxy && dataFromProxy.stdout) {
                    output = `🐍 **代码执行结果**\n\n${dataFromProxy.stdout}`;
                    success = true;
                } else if (dataFromProxy && dataFromProxy.result) {
                    output = `📋 **执行结果**: ${dataFromProxy.result}`;
                    success = true;
                } else if (dataFromProxy && typeof dataFromProxy === 'string') {
                    output = dataFromProxy;
                    success = true;
                }
                break;
                
            default:
                if (typeof dataFromProxy === 'string') {
                    output = dataFromProxy;
                } else if (dataFromProxy && typeof dataFromProxy === 'object') {
                    output = JSON.stringify(dataFromProxy, null, 2);
                } else {
                    output = String(dataFromProxy);
                }
                break;
        }
        
        if (rawResponse.error) {
            success = false;
            output = `❌ **工具执行错误**: ${rawResponse.error}`;
        }
        
        if (success && !output) {
            output = `✅ ${toolName} 执行成功`;
        }
        
        return {
            success,
            output: output || '工具执行完成',
            sources: sources,
            rawResponse,
            isError: !success,
            mode: 'deep_research',
            researchMetadata: {
                tool: toolName,
                timestamp: Date.now(),
                contentLength: output?.length || 0,
                structuredData: this._extractResearchData(toolName, rawResponse),
                analysisSuggestions: this._generateResearchSuggestions(toolName, output)
            }
        };
    }
    
    /**
     * 标准模式响应处理（保持原有逻辑）
     */
    static normalizeResponseForStandard(toolName, rawResponse) {
        console.log(`[ToolAdapter] 标准模式响应处理: ${toolName}`);
        
        if (!rawResponse) {
            return { success: false, output: '工具返回空响应', mode: 'standard' };
        }
        
        let success = rawResponse.success !== false;
        let output = '';
        
        if (rawResponse.output !== undefined && rawResponse.output !== null) {
            output = rawResponse.output;
        } else if (rawResponse.data !== undefined && rawResponse.data !== null) {
            output = typeof rawResponse.data === 'string' ? rawResponse.data : JSON.stringify(rawResponse.data);
        } else if (rawResponse !== null && rawResponse !== undefined) {
            output = String(rawResponse);
        }
        
        if (rawResponse.error) {
            success = false;
            output = rawResponse.error;
        }
        
        if (success && !output) {
            output = `${toolName} 执行成功`;
        }
        
        return { success, output: output || '工具执行完成', rawResponse, mode: 'standard' };
    }
    
    /**
     * 🎯 统一响应处理 - 明确模式区分
     */
    static normalizeResponse(toolName, rawResponse, mode = 'standard') {
        if (mode === 'deep_research') {
            return this.normalizeResponseForDeepResearch(toolName, rawResponse);
        }
        return this.normalizeResponseForStandard(toolName, rawResponse);
    }
    
    /**
     * 🎯 为DeepResearch提取结构化数据
     */
    static _extractResearchData(toolName, rawResponse) {
        // ✨✨✨ 终极修复 #3: 使用正确的路径访问数据 ✨✨✨
        const dataFromProxy = rawResponse.rawResult?.data || rawResponse.output || {};

        switch (toolName) {
            case 'tavily_search':
                if (Array.isArray(dataFromProxy.results)) {
                    const searchResults = dataFromProxy.results;
                    return {
                        resultCount: searchResults.length,
                        sources: searchResults.map(item => ({
                            title: item.title,
                            url: item.url,
                            contentLength: item.content?.length || 0,
                            hasAnswer: !!item.answer
                        })),
                        averageRelevance: searchResults.reduce((sum, item) => sum + (item.score || 0), 0) / (searchResults.length || 1)
                    };
                }
                break;
                
            case 'crawl4ai':
            case 'firecrawl':
                return {
                    hasContent: !!dataFromProxy.content,
                    contentLength: dataFromProxy.content?.length || 0,
                    title: dataFromProxy.title,
                    url: dataFromProxy.url,
                    wordCount: dataFromProxy.content?.split(/\s+/).length || 0
                };
                
            case 'python_sandbox':
                return {
                    hasOutput: !!(dataFromProxy.stdout || dataFromProxy.result),
                    outputLength: (dataFromProxy.stdout || '').length,
                    hasError: !!dataFromProxy.stderr
                };
        }
        
        return null;
    }
    
    /**
     * 🎯 为DeepResearch生成分析建议
     */
    static _generateResearchSuggestions(toolName, result) {
        const suggestions = [];
        
        switch (toolName) {
            case 'tavily_search':
                suggestions.push('请分析搜索结果的相关性和可信度');
                suggestions.push('提取关键信息并识别模式');
                suggestions.push('评估信息来源的权威性');
                break;
            case 'crawl4ai':
            case 'firecrawl':
                if (result && result.length > 1000) {
                    suggestions.push('内容较长，建议进行关键信息提取');
                }
                suggestions.push('分析内容结构和主要观点');
                suggestions.push('识别作者立场和内容偏见');
                break;
            case 'python_sandbox':
                suggestions.push('分析代码执行结果的数据模式');
                suggestions.push('验证计算结果的准确性');
                break;
        }
        
        return suggestions;
    }
}

/**
 * @class ProxiedTool
 * @description 通用代理工具实现，支持标准模式和DeepResearch模式完全隔离
 */
class ProxiedTool extends BaseTool {
    /**
     * 🎯 智能超时策略：根据工具类型和模式设置合理的超时时间
     */
    _getToolTimeout(toolName, mode = 'standard') {
        const baseTimeouts = {
            'python_sandbox': 60000,
            'tavily_search': 20000,
            'firecrawl': 45000,
            'crawl4ai': 45000,
            'stockfish_analyzer': 30000,
            'glm4v_analyze_image': 25000,
            'mcp_tool_catalog': 10000,
            'default': 30000
        };
        
        const baseTimeout = baseTimeouts[toolName] || baseTimeouts.default;
        
        // 🎯 DeepResearch模式允许更长的超时时间
        if (mode === 'deep_research') {
            return Math.min(baseTimeout * 1.5, 120000);
        }
        
        return baseTimeout;
    }

    async invoke(input, context = {}) {
        const startTime = Date.now();
        
        // 🎯 关键：从 context 中获取模式，如果没有则默认为 'standard'
        const mode = context.mode || 'standard';
        const timeoutMs = this._getToolTimeout(this.name, mode);
        
        console.log(`[ProxiedTool] ${mode.toUpperCase()}模式调用工具: ${this.name}...`, this.sanitizeToolInput(input));
        
        try {
            let normalizedInput, rawResult, normalizedResult;
            
            // 🎯 统一参数适配
            normalizedInput = DeepResearchToolAdapter.normalizeParameters(this.name, input, mode);
            console.log(`[ProxiedTool] 适配后参数:`, this.sanitizeToolInput(normalizedInput));
            
            // 🎯 统一的工具调用（两种模式使用相同的底层调用）
            const toolPromise = this.chatApiHandler.callTool(this.name, normalizedInput);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
            });
            
            rawResult = await Promise.race([toolPromise, timeoutPromise]);
            
            // 🎯 统一响应处理
            normalizedResult = DeepResearchToolAdapter.normalizeResponse(this.name, rawResult, mode);
            
            const executionTime = Date.now() - startTime;
            
            console.log(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用完成: ${this.name}`, {
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
            console.error(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用失败: ${this.name} (${executionTime}ms)`, error);
            
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
                mode: context.mode || 'standard'
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
        
        if (sanitized.code && sanitized.code.length > 200) {
            sanitized.code = sanitized.code.substring(0, 200) + '...';
        }
        if (sanitized.prompt && sanitized.prompt.length > 100) {
            sanitized.prompt = sanitized.prompt.substring(0, 100) + '...';
        }
        if (sanitized.query && sanitized.query.length > 100) {
            sanitized.query = sanitized.query.substring(0, 100) + '...';
        }
        
        if (sanitized.url && sanitized.url.length > 150) {
            sanitized.url = sanitized.url.substring(0, 150) + '...';
        }
        if (sanitized.image_url && sanitized.image_url.length > 150) {
            sanitized.image_url = sanitized.image_url.substring(0, 150) + '...';
        }
        
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