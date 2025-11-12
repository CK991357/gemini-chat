// src/static/js/agent/tools/ToolImplementations.js - 最终修复版

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 DeepResearch专用工具适配器 - 完全修复参数结构问题
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
                crawl4ai: {
                    scrape: {
                        word_count_threshold: 10,
                        only_main_content: false,
                        include_links: true,
                        format: 'markdown'
                    },
                    deep_crawl: {
                        max_pages: 20,
                        max_depth: 3,
                        strategy: 'bfs'
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
                crawl4ai: {
                    scrape: {
                        only_main_content: true,
                        include_tables: true,
                        format: 'markdown'
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
                crawl4ai: {
                    scrape: {
                        format: 'markdown',
                        include_math: true,
                        include_code: true,
                        word_count_threshold: 5
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
                crawl4ai: {
                    scrape: {
                        include_code: true,
                        include_links: true,
                        format: 'markdown'
                    }
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
                crawl4ai: {
                    scrape: {
                        word_count_threshold: 5,
                        only_main_content: false,
                        format: 'markdown'
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
                crawl4ai: {
                    scrape: {
                        only_main_content: true,
                        include_images: false,
                        format: 'markdown'
                    }
                }
            },
            
            // 📋 标准模式
            standard: {
                tavily_search: {
                    max_results: 6,
                    search_depth: 'basic'
                },
                crawl4ai: {
                    scrape: {
                        only_main_content: true,
                        format: 'markdown'
                    }
                }
            }
        };

        return modeConfigs[researchMode]?.[toolName] || {};
    }

    /**
     * DeepResearch模式专用参数适配 - 完全修复参数结构问题
     */
    static normalizeParametersForDeepResearch(toolName, rawParameters, researchMode = 'deep') {
        console.log(`[DeepResearchAdapter] ${researchMode}模式参数适配: ${toolName}`, rawParameters);
        
        if (!rawParameters) rawParameters = {};
        
        const parameters = { ...rawParameters };
        const modeSpecific = this.getModeSpecificParameters(researchMode, toolName);
        
        switch (toolName) {
            case 'tavily_search': {
                // ✅✅✅ 核心修复：正确处理查询参数 ✅✅✅
                let finalQuery = '';
                if (parameters.query && typeof parameters.query === 'string') {
                    finalQuery = parameters.query;
                } else if (Array.isArray(parameters.queries) && parameters.queries.length > 0) {
                    console.log("[DeepResearchAdapter] 检测到 'queries' 数组，合并为单一查询。");
                    finalQuery = parameters.queries.join(' ');
                    delete parameters.queries;
                } else if (parameters.queries && typeof parameters.queries === 'string' && parameters.queries.trim() !== '') {
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
                
            case 'crawl4ai': {
                // ✅✅✅ 核心修复：完全重建 crawl4ai 参数结构 ✅✅✅
                console.log(`[DeepResearchAdapter] 处理 crawl4ai 参数:`, parameters);
                
                // 检查是否已经有正确的嵌套结构
                if (parameters.mode && parameters.parameters) {
                    console.log(`[DeepResearchAdapter] 使用现有的嵌套参数结构`);
                    // 合并模式特定的配置
                    const modeConfig = modeSpecific[parameters.mode] || {};
                    return {
                        ...parameters,
                        parameters: {
                            ...parameters.parameters,
                            ...modeConfig
                        }
                    };
                }
                
                // 构建正确的参数结构
                const mode = parameters.mode || 'scrape';
                const modeConfig = modeSpecific[mode] || {};
                
                // 提取基础参数
                const baseParams = { ...parameters };
                delete baseParams.mode; // 移除重复的mode字段
                
                const finalParams = {
                    mode: mode,
                    parameters: {
                        ...baseParams,
                        ...modeConfig,
                        // 确保必要参数存在
                        url: parameters.url || parameters.parameters?.url,
                        format: parameters.format || parameters.parameters?.format || 'markdown'
                    }
                };

                console.log(`[DeepResearchAdapter] 构建的最终参数:`, finalParams);
                return finalParams;
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
                return baseConfig;
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

            case 'firecrawl': {
                // ✅✅✅ 修复：为可能传入但未启用的工具提供降级处理
                console.warn(`[DeepResearchAdapter] 工具 'firecrawl' 在Agent模式下可能不可用，提供兼容参数`);
                if (parameters.url && !parameters.parameters && !parameters.mode) {
                    return { mode: 'scrape', parameters: { url: parameters.url } };
                }
                return parameters;
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
            case 'crawl4ai': {
                if (parameters.url && !parameters.parameters && !parameters.mode) {
                    return { mode: 'scrape', parameters: { url: parameters.url } };
                }
                break;
            }
            case 'tavily_search': {
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
     * DeepResearch模式专用响应处理 - 完全修复空内容处理
     */
    static normalizeResponseForDeepResearch(toolName, rawResponse, researchMode = 'deep') {
        console.log(`[DeepResearchAdapter] ${researchMode}模式响应处理: ${toolName}`);
        
        // ✅✅✅ 核心修复：正确处理空响应和错误
        // 关键：处理工具调用失败或返回完全空数据的情况，防止Agent因缺少Observation而卡住。
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

        // ✅✅✅ 核心修复：优先处理错误情况
        if (rawResponse.error) {
            success = false;
            output = `❌ **工具执行错误**: ${rawResponse.error}`;
        } else {
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
                    } else if (success) {
                        output = `[工具信息]: 搜索执行成功，但没有返回任何结果。`;
                    }
                    break;
                }
                    
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
                        // 处理结构化数据
                        if (Object.keys(dataFromProxy).length > 0) {
                            output = `📊 **结构化数据**:\n${JSON.stringify(dataFromProxy, null, 2)}`;
                            success = true;
                        } else if (success) {
                            output = `[工具信息]: 页面抓取成功，但未能提取到有效的主要内容。这可能意味着页面是空的、需要登录、是 404 页面或内容是动态加载的。`;
                        }
                    } else if (success) {
                        output = `[工具信息]: 页面抓取成功，但未能提取到有效的主要内容。`;
                    }
                    break;
                }

                case 'firecrawl': {
                    // ✅✅✅ 修复：为可能传入但未启用的工具提供降级响应
                    console.warn(`[DeepResearchAdapter] 工具 'firecrawl' 在Agent模式下可能不可用，提供降级响应`);
                    if (success && !output) {
                        output = `[工具信息]: firecrawl 工具在当前Agent模式下不可用，建议使用 crawl4ai 替代。`;
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
                    } else if (success) {
                        output = `[工具信息]: Python代码执行成功，但没有输出结果。`;
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
                    } else if (success) {
                        output = `[工具信息]: 图片分析完成，但未返回分析结果。`;
                    }
                    break;
                }
                    
                case 'stockfish_analyzer': {
                    if (dataFromProxy && dataFromProxy.analysis) {
                        output = `♟️ **棋局分析结果**:\n\n${dataFromProxy.analysis}`;
                        success = true;
                    } else if (success) {
                        output = `[工具信息]: 棋局分析完成，但未返回分析结果。`;
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
        }
        
        // ✅✅✅ 最终保障：确保output不为空
        // 关键：处理工具成功执行但未返回任何内容的边缘情况，防止Agent陷入死循环。
        if (success && !output) {
            output = `[工具信息]: ${toolName} 执行成功，但没有返回文本输出。`;
        }
        
        return {
            success,
            output: output,
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
        if (!searchResults || searchResults.length === 0) {
            return `🔍 **${this.getResearchModeName(researchMode)}搜索结果**: 未找到相关结果`;
        }

        const modeFormatters = {
            deep: (results) => `🔍 **深度研究搜索结果** (${results.length}个权威来源)\n\n` +
                results.map((res, index) =>
                    `[深度来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🔗 ${res.url || '无链接'}\n` +
                    `📝 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            business: (results) => `📈 **行业分析数据** (${results.length}个商业来源)\n\n` +
                results.map((res, index) =>
                    `[商业来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🏢 ${res.url || '无链接'}\n` +
                    `💼 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            academic: (results) => `📚 **学术研究文献** (${results.length}个学术来源)\n\n` +
                results.map((res, index) =>
                    `[学术来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🎓 ${res.url || '无链接'}\n` +
                    `📖 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            technical: (results) => `💻 **技术文档资源** (${results.length}个技术来源)\n\n` +
                results.map((res, index) =>
                    `[技术来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `⚙️ ${res.url || '无链接'}\n` +
                    `📋 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            cutting_edge: (results) => `🚀 **前沿技术资讯** (${results.length}个前沿来源)\n\n` +
                results.map((res, index) =>
                    `[前沿来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🌟 ${res.url || '无链接'}\n` +
                    `💡 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            shopping_guide: (results) => `🛍️ **奢侈品导购信息** (${results.length}个购物来源)\n\n` +
                results.map((res, index) =>
                    `[导购来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🛒 ${res.url || '无链接'}\n` +
                    `📦 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n'),
                
            standard: (results) => `🔍 **标准搜索结果** (${results.length}个来源)\n\n` +
                results.map((res, index) =>
                    `[来源 ${index + 1}] ${res.title || '无标题'}\n` +
                    `🔗 ${res.url || '无链接'}\n` +
                    `📝 ${res.content ? res.content.substring(0, 200) + '...' : '无内容摘要'}`
                ).join('\n\n-----------------\n\n')
        };
        
        const formatter = modeFormatters[researchMode] || modeFormatters.standard;
        return formatter(searchResults);
    }

    /**
     * 获取研究模式的中文名称
     */
    static getResearchModeName(researchMode) {
        const modeNames = {
            deep: '深度研究',
            business: '行业分析',
            academic: '学术论文',
            technical: '技术实现',
            cutting_edge: '前沿技术',
            shopping_guide: '奢侈品导购',
            standard: '标准'
        };
        return modeNames[researchMode] || '标准';
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
        
        if (content.length > 0) {
            return `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n**内容**:\n${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}`;
        } else {
            return `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n**内容**: 页面内容为空或无法提取`;
        }
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
        
        return `🐍 **${title}**\n\n${codeData.stdout || '无输出'}`;
    }
    
    /**
     * 标准模式响应处理（保持原有逻辑）
     */
    static normalizeResponseForStandard(toolName, rawResponse) {
        console.log(`[ToolAdapter] 标准模式响应处理: ${toolName}`);
        
        // 关键：处理工具调用失败或返回完全空数据的情况，防止Agent因缺少Observation而卡住。
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
        
        // 关键：处理工具成功执行但未返回任何内容的边缘情况，确保Agent有Observation可以继续。
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
                
            case 'crawl4ai': {
                return {
                    ...baseData,
                    hasContent: !!(dataFromProxy.content || dataFromProxy.markdown),
                    contentLength: (dataFromProxy.content || dataFromProxy.markdown)?.length || 0,
                    title: dataFromProxy.title,
                    url: dataFromProxy.url,
                    wordCount: (dataFromProxy.content || dataFromProxy.markdown)?.split(/\s+/).length || 0
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
            case 'crawl4ai': {
                toolSpecific.push('分析内容结构和主要观点');
                toolSpecific.push('识别作者立场和内容偏见');
                toolSpecific.push('评估信息的时效性和相关性');
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
            'crawl4ai': 45000,
            'stockfish_analyzer': 30000,
            'glm4v_analyze_image': 25000,
            'mcp_tool_catalog': 10000,
            'firecrawl': 45000, // 即使不可用也提供配置
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
export class Crawl4AITool extends ProxiedTool {}
export class StockfishAnalyzerTool extends ProxiedTool {}
export class Glm4vAnalyzeImageTool extends ProxiedTool {}
export class McpToolCatalogTool extends ProxiedTool {}
export class FirecrawlTool extends ProxiedTool {} // 即使不可用也提供类定义

/**
 * 🎯 工具工厂：便于动态创建工具实例
 */
export class ToolFactory {
    static createTool(toolName, chatApiHandler, metadata) {
        const toolClasses = {
            'python_sandbox': PythonSandboxTool,
            'tavily_search': TavilySearchTool,
            'crawl4ai': Crawl4AITool,
            'stockfish_analyzer': StockfishAnalyzerTool,
            'glm4v_analyze_image': Glm4vAnalyzeImageTool,
            'mcp_tool_catalog': McpToolCatalogTool,
            'firecrawl': FirecrawlTool // 即使不可用也提供映射
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
            'crawl4ai': ['deep', 'business', 'academic', 'technical', 'cutting_edge', 'shopping_guide', 'standard'],
            'python_sandbox': ['deep', 'technical', 'academic', 'standard'],
            'glm4v_analyze_image': ['deep', 'technical', 'standard'],
            'stockfish_analyzer': ['deep', 'technical', 'standard'],
            'firecrawl': ['deep', 'business', 'academic', 'technical', 'standard']
        };
    }

    /**
     * 🎯 新增：检查工具在特定模式下是否可用
     */
    static isToolAvailableInMode(toolName, researchMode, availableTools = []) {
        // 首先检查工具是否在可用工具列表中
        if (!availableTools.includes(toolName)) {
            return false;
        }

        const supportMatrix = this.getToolSupportForResearchModes();
        const supportedModes = supportMatrix[toolName] || [];
        
        return supportedModes.includes(researchMode);
    }

    /**
     * 🎯 新增：为特定研究模式推荐工具
     */
    static recommendToolsForResearchMode(researchMode, availableTools = []) {
        const recommendations = {
            deep: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            business: ['tavily_search', 'crawl4ai'],
            academic: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            technical: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            cutting_edge: ['tavily_search', 'crawl4ai'],
            shopping_guide: ['tavily_search', 'crawl4ai'],
            standard: ['tavily_search', 'crawl4ai']
        };

        const recommended = recommendations[researchMode] || recommendations.standard;
        
        // 过滤掉不可用的工具
        return recommended.filter(tool => availableTools.includes(tool));
    }
}