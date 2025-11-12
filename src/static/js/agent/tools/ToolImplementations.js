// src/static/js/agent/tools/ToolImplementations.js - 最终修复版

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 DeepResearch专用工具适配器 - 完全适配7种研究模式
 */
class DeepResearchToolAdapter {
    /**
     * 获取研究模式特定的参数配置
     */
    static getModeSpecificParameters(researchMode, toolName) {
        const modeConfigs = {
            // 🧠 深度研究模式
            deep: {
                tavily_search: {
                    max_results: 15,
                    search_depth: 'advanced',
                    include_raw_content: true,
                    include_answer: false
                },
                firecrawl: {
                    parameters: {
                        word_count_threshold: 10,
                        only_main_content: false,
                        include_links: true
                    }
                },
                crawl4ai: {
                    parameters: {
                        word_count_threshold: 10,
                        only_main_content: false,
                        include_links: true
                    }
                },
                python_sandbox: {
                    timeout: 120,
                    allow_network: true
                }
            },
            
            // 💼 行业分析模式
            business: {
                tavily_search: {
                    max_results: 12,
                    search_depth: 'advanced',
                    include_domains: ['bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com'],
                    exclude_domains: ['wikipedia.org']
                },
                firecrawl: {
                    parameters: {
                        only_main_content: true,
                        include_tables: true
                    }
                }
            },
            
            // 📚 学术论文模式
            academic: {
                tavily_search: {
                    max_results: 10,
                    search_depth: 'advanced',
                    include_domains: ['arxiv.org', 'researchgate.net', 'springer.com', 'ieee.org'],
                    include_answer: false
                },
                firecrawl: {
                    parameters: {
                        format: 'markdown',
                        include_math: true,
                        include_code: true
                    }
                }
            },
            
            // 💻 技术实现模式
            technical: {
                tavily_search: {
                    max_results: 8,
                    include_domains: ['github.com', 'stackoverflow.com', 'docs.python.org'],
                    exclude_domains: ['wikipedia.org']
                },
                python_sandbox: {
                    timeout: 180,
                    allow_network: true
                }
            },
            
            // 🚀 前沿技术模式
            cutting_edge: {
                tavily_search: {
                    max_results: 12,
                    search_depth: 'advanced',
                    include_raw_content: true,
                    include_answer: false
                },
                firecrawl: {
                    parameters: {
                        word_count_threshold: 5,
                        only_main_content: false
                    }
                }
            },
            
            // 🛍️ 奢侈品导购模式
            shopping_guide: {
                tavily_search: {
                    max_results: 8,
                    include_domains: ['vogue.com', 'harrods.com', 'farfetch.com', 'luxury.com'],
                    exclude_domains: ['wikipedia.org']
                },
                firecrawl: {
                    parameters: {
                        only_main_content: true,
                        include_images: false
                    }
                }
            },
            
            // 📋 标准模式
            standard: {
                tavily_search: {
                    max_results: 6,
                    search_depth: 'basic'
                },
                firecrawl: {
                    parameters: {
                        only_main_content: true
                    }
                }
            }
        };

        return modeConfigs[researchMode]?.[toolName] || {};
    }

    /**
     * DeepResearch模式专用参数适配 - 完全适配7种模式
     */
    static normalizeParametersForDeepResearch(toolName, rawParameters, researchMode = 'deep') {
        console.log(`[DeepResearchAdapter] ${researchMode}模式参数适配: ${toolName}`);
        
        if (!rawParameters) rawParameters = {};
        
        const parameters = { ...rawParameters };
        const modeSpecific = this.getModeSpecificParameters(researchMode, toolName);
        
        switch (toolName) {
            case 'tavily_search': {
                // ✨✨✨ 最终 Bug 修复 ✨✨✨
                let finalQuery = '';
                if (parameters.query && typeof parameters.query === 'string') {
                    finalQuery = parameters.query;
                } else if (Array.isArray(parameters.queries) && parameters.queries.length > 0) {
                    console.log("[DeepResearchAdapter] 检测到 'queries' 数组，合并为单一查询。");
                    finalQuery = parameters.queries.join(' ');
                    delete parameters.queries;
                }
                // 如果上面两种情况都没匹配，但存在一个非空的 'queries' 字符串，也尝试使用它
                else if (parameters.queries && typeof parameters.queries === 'string' && parameters.queries.trim() !== '') {
                     finalQuery = parameters.queries;
                     delete parameters.queries;
                }

                return {
                    ...parameters,
                    query: finalQuery, // 确保 'query' 字段是正确的字符串
                    max_results: modeSpecific.max_results || 12,
                    include_raw_content: modeSpecific.include_raw_content !== false,
                    search_depth: modeSpecific.search_depth || 'advanced',
                    include_answer: modeSpecific.include_answer || false,
                    include_images: false,
                    include_domains: modeSpecific.include_domains,
                    exclude_domains: modeSpecific.exclude_domains
                };
            }
                
            case 'firecrawl':
            case 'crawl4ai': {
                if (parameters.url) {
                    // ✅✅✅ --- 核心修复：构建正确的双重嵌套结构 --- ✅✅✅
                    // 参照非 Agent 模式下成功的日志，我们必须生成一个包含 `mode` 和 嵌套 `parameters` 的对象。
                    const finalParams = {
                        mode: parameters.mode || 'scrape', // 优先使用 Agent 提供的 mode，否则默认为 scrape
                        parameters: {
                            url: parameters.url,
                            // 合并模式特定的默认值
                            format: modeSpecific.parameters?.format || 'markdown',
                            word_count_threshold: modeSpecific.parameters?.word_count_threshold || 20,
                            exclude_external_links: modeSpecific.parameters?.exclude_external_links !== false, // 默认为 true
                            include_links: modeSpecific.parameters?.include_links !== false, // 默认为 true
                            wait_for: 2000
                        }
                    };

                    // 如果 Agent 传入了更复杂的嵌套 parameters，也进行合并
                    if (parameters.parameters) {
                        finalParams.parameters = { ...finalParams.parameters, ...parameters.parameters };
                    }
                    
                    return finalParams;
                }
                break;
            }
                
            case 'python_sandbox': {
                const baseConfig = {
                    timeout: modeSpecific.timeout || 90,
                    allow_network: modeSpecific.allow_network !== false,
                    ...parameters
                };
                
                if (parameters.parameters && parameters.parameters.code) {
                    return { ...baseConfig, ...parameters.parameters };
                }
                if (parameters.code) {
                    return { ...baseConfig, code: parameters.code };
                }
                break;
            }
                
            case 'glm4v_analyze_image': {
                return {
                    image_url: parameters.image_url,
                    prompt: parameters.prompt || '请详细分析这张图片的内容、特征和潜在含义',
                    detail: parameters.detail || 'high',
                    ...parameters
                };
            }
                
            case 'stockfish_analyzer': {
                return {
                    fen: parameters.fen,
                    depth: parameters.depth || 18,
                    ...parameters
                };
            }
        }
        
        return { ...parameters, ...modeSpecific };
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
            case 'crawl4ai': {
                if (parameters.url && !parameters.parameters && !parameters.mode) {
                    return { mode: 'scrape', parameters: { url: parameters.url } };
                }
                break;
            }
            case 'tavily_search': {
                // ✨✨✨ 标准模式也修复查询参数处理 ✨✨✨
                if (parameters.query && typeof parameters.query === 'object') {
                    return { query: parameters.query.query || JSON.stringify(parameters.query) };
                } else if (Array.isArray(parameters.queries) && parameters.queries.length > 0) {
                    console.log("[ToolAdapter] 标准模式检测到 'queries' 数组，合并为单一查询。");
                    return { query: parameters.queries.join(' ') };
                } else if (parameters.queries && typeof parameters.queries === 'string' && parameters.queries.trim() !== '') {
                    return { query: parameters.queries };
                }
                break;
            }
        }
        
        return parameters;
    }
    
    /**
     * 🎯 统一参数适配器 - 明确区分模式
     */
    static normalizeParameters(toolName, rawParameters, mode = 'standard', researchMode = 'deep') {
        console.log(`[ToolAdapter] 模式识别: ${mode} - 研究模式: ${researchMode} - 工具: ${toolName}`);
        
        if (mode === 'deep_research') {
            return this.normalizeParametersForDeepResearch(toolName, rawParameters, researchMode);
        }
        return this.normalizeParametersForStandard(toolName, rawParameters);
    }
    
    /**
     * DeepResearch模式专用响应处理 - 适配7种模式
     */
    static normalizeResponseForDeepResearch(toolName, rawResponse, researchMode = 'deep') {
        console.log(`[DeepResearchAdapter] ${researchMode}模式响应处理: ${toolName}`);
        
        if (!rawResponse) {
            return { 
                success: false, 
                output: '工具返回空响应', 
                sources: [], 
                isError: true, 
                mode: 'deep_research',
                researchMode: researchMode
            };
        }
        
        let success = rawResponse.success !== false;
        let output = '';
        let sources = [];
        
        // 使用正确的路径访问后端返回的原始数据
        const dataFromProxy = rawResponse.rawResult?.data || rawResponse.output || rawResponse;

        switch (toolName) {
            case 'tavily_search': {
                if (dataFromProxy && Array.isArray(dataFromProxy.results)) {
                    const searchResults = dataFromProxy.results;
                    
                    sources = searchResults.map(res => ({
                        title: res.title || '无标题',
                        url: res.url || '#',
                        description: res.content ? res.content.substring(0, 150) + '...' : '',
                        relevance: res.score || 0,
                        source_type: 'search_result'
                    }));

                    output = this.formatSearchResultsForMode(searchResults, researchMode);
                    success = true;
                } else if (dataFromProxy && dataFromProxy.answer) {
                    output = dataFromProxy.answer;
                    success = true;
                }
                break;
            }
                
            case 'firecrawl':
            case 'crawl4ai': {
                if (dataFromProxy && (dataFromProxy.content || dataFromProxy.markdown)) {
                    const content = dataFromProxy.content || dataFromProxy.markdown;
                    output = this.formatWebContentForMode(dataFromProxy, researchMode);
                    
                    if (dataFromProxy.url) {
                        sources.push({
                            title: dataFromProxy.title || dataFromProxy.url,
                            url: dataFromProxy.url,
                            description: content.substring(0, 150) + '...',
                            source_type: 'web_page'
                        });
                    }
                    success = true;
                } else if (dataFromProxy && typeof dataFromProxy === 'object') {
                    output = `📊 **结构化数据**:\n${JSON.stringify(dataFromProxy, null, 2)}`;
                    success = true;
                }
                break;
            }
                
            case 'python_sandbox': {
                if (dataFromProxy && dataFromProxy.stdout) {
                    output = this.formatCodeOutputForMode(dataFromProxy, researchMode);
                    success = true;
                } else if (dataFromProxy && dataFromProxy.result) {
                    output = `📋 **执行结果**: ${dataFromProxy.result}`;
                    success = true;
                } else if (dataFromProxy && typeof dataFromProxy === 'string') {
                    output = dataFromProxy;
                    success = true;
                }
                break;
            }
                
            case 'glm4v_analyze_image': {
                if (dataFromProxy && dataFromProxy.analysis) {
                    output = `🖼️ **图片分析结果** (${researchMode}模式):\n\n${dataFromProxy.analysis}`;
                    success = true;
                } else if (dataFromProxy && typeof dataFromProxy === 'string') {
                    output = dataFromProxy;
                    success = true;
                }
                break;
            }
                
            case 'stockfish_analyzer': {
                if (dataFromProxy && dataFromProxy.analysis) {
                    output = `♟️ **棋局分析结果**:\n\n${dataFromProxy.analysis}`;
                    success = true;
                }
                break;
            }
                
            default: {
                if (typeof dataFromProxy === 'string') {
                    output = dataFromProxy;
                } else if (dataFromProxy && typeof dataFromProxy === 'object') {
                    output = JSON.stringify(dataFromProxy, null, 2);
                } else {
                    output = String(dataFromProxy);
                }
                break;
            }
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
            researchMode: researchMode,
            researchMetadata: {
                tool: toolName,
                timestamp: Date.now(),
                contentLength: output?.length || 0,
                sourceCount: sources.length,
                structuredData: this._extractResearchData(toolName, rawResponse, researchMode),
                analysisSuggestions: this._generateResearchSuggestions(toolName, output, researchMode)
            }
        };
    }
    
    /**
     * 根据研究模式格式化搜索结果
     */
    static formatSearchResultsForMode(searchResults, researchMode) {
        const modeFormatters = {
            deep: (results) => `🔍 **深度研究搜索结果** (${results.length}个权威来源)\n\n` +
                results.map((res, index) =>
                    `[深度来源 ${index + 1}] ${res.title}\n` +
                    `🔗 ${res.url}\n` +
                    `📝 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            business: (results) => `📈 **行业分析数据** (${results.length}个商业来源)\n\n` +
                results.map((res, index) =>
                    `[商业来源 ${index + 1}] ${res.title}\n` +
                    `🏢 ${res.url}\n` +
                    `💼 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            academic: (results) => `📚 **学术研究文献** (${results.length}个学术来源)\n\n` +
                results.map((res, index) =>
                    `[学术来源 ${index + 1}] ${res.title}\n` +
                    `🎓 ${res.url}\n` +
                    `📖 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            technical: (results) => `💻 **技术文档资源** (${results.length}个技术来源)\n\n` +
                results.map((res, index) =>
                    `[技术来源 ${index + 1}] ${res.title}\n` +
                    `⚙️ ${res.url}\n` +
                    `📋 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            cutting_edge: (results) => `🚀 **前沿技术资讯** (${results.length}个前沿来源)\n\n` +
                results.map((res, index) =>
                    `[前沿来源 ${index + 1}] ${res.title}\n` +
                    `🌟 ${res.url}\n` +
                    `💡 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            shopping_guide: (results) => `🛍️ **奢侈品导购信息** (${results.length}个购物来源)\n\n` +
                results.map((res, index) =>
                    `[导购来源 ${index + 1}] ${res.title}\n` +
                    `🛒 ${res.url}\n` +
                    `📦 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            standard: (results) => `🔍 **标准搜索结果** (${results.length}个来源)\n\n` +
                results.map((res, index) =>
                    `[来源 ${index + 1}] ${res.title}\n` +
                    `🔗 ${res.url}\n` +
                    `📝 ${res.content || '无内容摘要'}`
                ).join('\n\n-----------------\n\n')
        };
        
        const formatter = modeFormatters[researchMode] || modeFormatters.standard;
        return formatter(searchResults);
    }
    
    /**
     * 根据研究模式格式化网页内容
     */
    static formatWebContentForMode(webData, researchMode) {
        const content = webData.content || webData.markdown || '';
        const title = webData.title || '无标题';
        const url = webData.url || '未知';
        
        const modePrefixes = {
            deep: '📚 深度研究网页内容',
            business: '🏢 行业分析网页内容', 
            academic: '🎓 学术文献网页内容',
            technical: '⚙️ 技术文档网页内容',
            cutting_edge: '🚀 前沿技术网页内容',
            shopping_guide: '🛍️ 商品信息网页内容',
            standard: '📄 标准网页内容'
        };
        
        const prefix = modePrefixes[researchMode] || modePrefixes.standard;
        
        return `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n**内容**:\n${content.substring(0, 2000)}...`;
    }
    
    /**
     * 根据研究模式格式化代码输出
     */
    static formatCodeOutputForMode(codeData, researchMode) {
        const modeTitles = {
            deep: '深度研究代码分析',
            business: '商业数据分析',
            academic: '学术研究计算',
            technical: '技术实现验证',
            cutting_edge: '前沿技术实验',
            shopping_guide: '价格数据分析',
            standard: '代码执行结果'
        };
        
        const title = modeTitles[researchMode] || modeTitles.standard;
        
        return `🐍 **${title}**\n\n${codeData.stdout}`;
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
    static normalizeResponse(toolName, rawResponse, mode = 'standard', researchMode = 'deep') {
        if (mode === 'deep_research') {
            return this.normalizeResponseForDeepResearch(toolName, rawResponse, researchMode);
        }
        return this.normalizeResponseForStandard(toolName, rawResponse);
    }
    
    /**
     * 🎯 为DeepResearch提取结构化数据
     */
    static _extractResearchData(toolName, rawResponse, researchMode) {
        const dataFromProxy = rawResponse.rawResult?.data || rawResponse.output || {};

        const baseData = {
            researchMode: researchMode,
            tool: toolName,
            timestamp: Date.now()
        };

        switch (toolName) {
            case 'tavily_search': {
                if (Array.isArray(dataFromProxy.results)) {
                    const searchResults = dataFromProxy.results;
                    return {
                        ...baseData,
                        resultCount: searchResults.length,
                        sources: searchResults.map(item => ({
                            title: item.title,
                            url: item.url,
                            contentLength: item.content?.length || 0,
                            hasAnswer: !!item.answer,
                            relevance: item.score || 0
                        })),
                        averageRelevance: searchResults.reduce((sum, item) => sum + (item.score || 0), 0) / (searchResults.length || 1)
                    };
                }
                break;
            }
                
            case 'crawl4ai':
            case 'firecrawl': {
                return {
                    ...baseData,
                    hasContent: !!dataFromProxy.content,
                    contentLength: dataFromProxy.content?.length || 0,
                    title: dataFromProxy.title,
                    url: dataFromProxy.url,
                    wordCount: dataFromProxy.content?.split(/\s+/).length || 0
                };
            }
                
            case 'python_sandbox': {
                return {
                    ...baseData,
                    hasOutput: !!(dataFromProxy.stdout || dataFromProxy.result),
                    outputLength: (dataFromProxy.stdout || '').length,
                    hasError: !!dataFromProxy.stderr,
                    executionTime: dataFromProxy.execution_time
                };
            }
                
            case 'glm4v_analyze_image': {
                return {
                    ...baseData,
                    hasAnalysis: !!dataFromProxy.analysis,
                    analysisLength: dataFromProxy.analysis?.length || 0
                };
            }
        }
        
        return baseData;
    }
    
    /**
     * 🎯 为DeepResearch生成分析建议 - 适配7种模式
     */
    static _generateResearchSuggestions(toolName, result, researchMode) {
        const modeSuggestions = {
            deep: [
                '请进行多维度深度分析',
                '验证信息的权威性和可信度',
                '识别潜在偏见和局限性',
                '提出创新性的见解'
            ],
            business: [
                '分析市场趋势和竞争格局',
                '评估商业机会和风险',
                '考虑宏观经济因素的影响',
                '提供战略建议'
            ],
            academic: [
                '验证研究方法的科学性',
                '分析数据的可靠性和有效性',
                '评估理论的贡献和局限性',
                '提出进一步研究方向'
            ],
            technical: [
                '评估技术方案的可行性',
                '分析性能和扩展性',
                '考虑安全性和稳定性',
                '提供最佳实践建议'
            ],
            cutting_edge: [
                '分析技术的创新性',
                '评估发展潜力和应用前景',
                '考虑技术成熟度',
                '预测未来发展趋势'
            ],
            shopping_guide: [
                '分析产品与用户需求的匹配度',
                '评估性价比和价值',
                '考虑使用场景和体验',
                '提供个性化购买建议'
            ],
            standard: [
                '总结关键信息',
                '提供实用建议',
                '考虑多角度分析'
            ]
        };

        const baseSuggestions = modeSuggestions[researchMode] || modeSuggestions.standard;
        const toolSpecific = [];

        switch (toolName) {
            case 'tavily_search': {
                toolSpecific.push('分析搜索结果的相关性和可信度');
                toolSpecific.push('提取关键信息并识别模式');
                toolSpecific.push('评估信息来源的权威性');
                break;
            }
            case 'crawl4ai':
            case 'firecrawl': {
                if (result && result.length > 1000) {
                    toolSpecific.push('内容较长，建议进行关键信息提取');
                }
                toolSpecific.push('分析内容结构和主要观点');
                toolSpecific.push('识别作者立场和内容偏见');
                break;
            }
            case 'python_sandbox': {
                toolSpecific.push('分析代码执行结果的数据模式');
                toolSpecific.push('验证计算结果的准确性');
                break;
            }
            case 'glm4v_analyze_image': {
                toolSpecific.push('分析图片的视觉特征');
                toolSpecific.push('解读图片的潜在含义');
                break;
            }
        }

        return [...baseSuggestions, ...toolSpecific];
    }
}

/**
 * @class ProxiedTool
 * @description 通用代理工具实现，支持7种研究模式完全适配
 */
class ProxiedTool extends BaseTool {
    /**
     * 🎯 智能超时策略：根据工具类型和研究模式设置合理的超时时间
     */
    _getToolTimeout(toolName, mode = 'standard', researchMode = 'deep') {
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
        
        // 🎯 研究模式允许更长的超时时间
        if (mode === 'deep_research') {
            const modeMultipliers = {
                deep: 1.8,
                business: 1.5,
                academic: 1.6,
                technical: 2.0,
                cutting_edge: 1.7,
                shopping_guide: 1.4,
                standard: 1.3
            };
            
            const multiplier = modeMultipliers[researchMode] || 1.5;
            return Math.min(baseTimeout * multiplier, 180000); // 最大3分钟
        }
        
        return baseTimeout;
    }

    async invoke(input, context = {}) {
        const startTime = Date.now();
        
        // 🎯 关键：从 context 中获取模式和研究模式
        const mode = context.mode || 'standard';
        const researchMode = context.researchMode || 'deep';
        const timeoutMs = this._getToolTimeout(this.name, mode, researchMode);
        
        console.log(`[ProxiedTool] ${mode.toUpperCase()}模式调用工具: ${this.name} (研究模式: ${researchMode})`, this.sanitizeToolInput(input));
        
        try {
            // 🎯 修复：使用 const 而不是 let，因为这些变量不会被重新赋值
            const normalizedInput = DeepResearchToolAdapter.normalizeParameters(
                this.name, input, mode, researchMode
            );
            console.log(`[ProxiedTool] 适配后参数:`, this.sanitizeToolInput(normalizedInput));
            
            // 🎯 统一的工具调用
            const toolPromise = this.chatApiHandler.callTool(this.name, normalizedInput);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
            });
            
            const rawResult = await Promise.race([toolPromise, timeoutPromise]);
            
            // 🎯 统一响应处理
            const normalizedResult = DeepResearchToolAdapter.normalizeResponse(
                this.name, rawResult, mode, researchMode
            );
            
            const executionTime = Date.now() - startTime;
            
            console.log(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用完成: ${this.name}`, {
                success: normalizedResult.success,
                researchMode: researchMode,
                outputLength: normalizedResult.output?.length || 0,
                sourceCount: normalizedResult.sources?.length || 0,
                executionTime
            });
            
            return {
                ...normalizedResult,
                executionTime,
                researchContext: {
                    mode: mode,
                    researchMode: researchMode,
                    tool: this.name
                }
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
                mode: mode,
                researchMode: researchMode,
                researchContext: {
                    mode: mode,
                    researchMode: researchMode,
                    tool: this.name,
                    error: true
                }
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
    
    /**
     * 🎯 新增：获取工具对研究模式的支持情况
     */
    static getToolSupportForResearchModes() {
        return {
            'tavily_search': ['deep', 'business', 'academic', 'technical', 'cutting_edge', 'shopping_guide', 'standard'],
            'firecrawl': ['deep', 'business', 'academic', 'technical', 'cutting_edge', 'shopping_guide', 'standard'],
            'crawl4ai': ['deep', 'business', 'academic', 'technical', 'cutting_edge', 'shopping_guide', 'standard'],
            'python_sandbox': ['deep', 'academic', 'technical', 'cutting_edge', 'standard'],
            'glm4v_analyze_image': ['deep', 'academic', 'technical', 'cutting_edge', 'shopping_guide', 'standard'],
            'stockfish_analyzer': ['deep', 'academic', 'standard'],
            'mcp_tool_catalog': ['deep', 'business', 'academic', 'technical', 'cutting_edge', 'standard']
        };
    }
}