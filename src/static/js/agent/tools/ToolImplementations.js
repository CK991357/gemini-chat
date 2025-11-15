// src/static/js/agent/tools/ToolImplementations.js - 参数一致性修复最终版 + Python错误反馈修复

import { BaseTool } from './BaseTool.js';

/**
 * 🎯 DeepResearch专用工具适配器 - 修复参数一致性问题的最终版
 */
class DeepResearchToolAdapter {
    /**
     * 获取研究模式特定的参数配置 - 修复参数一致性问题
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
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        include_links: true,
                        format: 'markdown',
                        wait_for: 5000,
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
                    },
                    deep_crawl: {
                        max_pages: 20,
                        max_depth: 3,
                        strategy: 'bfs'
                    },
                    extract: {
                        extraction_type: 'llm',
                        format: 'markdown'
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
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        include_tables: true,
                        format: 'markdown',
                        wait_for: 3000,
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
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
                        wait_for: 4000,
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
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
                        format: 'markdown',
                        wait_for: 3000,
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
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
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        format: 'markdown',
                        wait_for: 3000,
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
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
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        include_images: false,
                        format: 'markdown',
                        wait_for: 3000,
                        exclude_external_links: false  // 🎯 修复：不禁用外部链接
                    }
                }
            },
            
            // 📋 标准模式 - 🎯 关键修复：与独立工具调用保持完全一致
            standard: {
                tavily_search: {
                    max_results: 6,
                    search_depth: 'basic'
                },
                crawl4ai: {
                    scrape: {
                        only_main_content: false,     // 🎯 关键修复：完全禁用内容过滤
                        format: 'markdown',
                        wait_for: 3000,
                        exclude_external_links: false // 🎯 修复：不禁用外部链接
                    },
                    deep_crawl: {
                        max_pages: 5,
                        max_depth: 1
                    },
                    extract: {
                        extraction_type: 'llm'
                    }
                }
            }
        };

        return modeConfigs[researchMode]?.[toolName] || {};
    }

    /**
     * DeepResearch模式专用参数适配 - 🎯 修复参数一致性问题的最终版
     */
    static normalizeParametersForDeepResearch(toolName, rawParameters, researchMode = 'deep') {
        console.log(`[DeepResearchAdapter] ${researchMode}模式参数适配: ${toolName}`, rawParameters);
        
        if (!rawParameters) rawParameters = {};
        
        const agentParams = { ...rawParameters };
        const modeSpecific = this.getModeSpecificParameters(researchMode, toolName);
        
        switch (toolName) {
            case 'tavily_search': {
                // ✅✅✅ 正确处理查询参数
                let finalQuery = '';
                if (agentParams.query && typeof agentParams.query === 'string') {
                    finalQuery = agentParams.query;
                } else if (Array.isArray(agentParams.queries) && agentParams.queries.length > 0) {
                    console.log("[DeepResearchAdapter] 检测到 'queries' 数组，合并为单一查询。");
                    finalQuery = agentParams.queries.join(' ');
                    delete agentParams.queries;
                } else if (agentParams.queries && typeof agentParams.queries === 'string' && agentParams.queries.trim() !== '') {
                    finalQuery = agentParams.queries;
                    delete agentParams.queries;
                }

                return {
                    ...agentParams,
                    query: finalQuery,
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
                console.log(`[DeepResearchAdapter] 开始重构 crawl4ai 参数:`, agentParams);

                // 🎯 1. 确定模式和基础配置
                const mode = agentParams.mode || 'scrape';
                const modeDefaultConfig = this.getModeSpecificParameters(researchMode, toolName)[mode] || {};

                // 🎯 2. 智能参数提取 - 兼容嵌套和非嵌套格式
                // 优先使用parameters对象，同时融合顶层参数作为兜底，以修复结构错误
                const paramsSource = (agentParams.parameters && typeof agentParams.parameters === 'object')
                    ? { ...agentParams, ...agentParams.parameters }
                    : agentParams;
                const innerParameters = {};

                // 🎯 3. 参数名校正与别名映射
                const paramMap = {
                    'url': ['url'], 'urls': ['urls'], 'format': ['format', 'output_format'],
                    'css_selector': ['css_selector', 'selector'], 'return_screenshot': ['return_screenshot', 'screenshot'],
                    'return_pdf': ['return_pdf', 'pdf'], 'schema_definition': ['schema_definition', 'schema'],
                    'extraction_type': ['extraction_type', 'extract_type'], 'prompt': ['prompt'],
                    'max_depth': ['max_depth', 'depth'], 'max_pages': ['max_pages', 'max_results', 'pages'],
                    'strategy': ['strategy'], 'keywords': ['keywords', 'search_terms'],
                    'stream': ['stream', 'streaming'], 'concurrent_limit': ['concurrent_limit', 'concurrency']
                };

                for (const [correctKey, aliases] of Object.entries(paramMap)) {
                    for (const alias of aliases) {
                        if (paramsSource[alias] !== undefined) {
                            innerParameters[correctKey] = paramsSource[alias];
                            console.log(`[DeepResearchAdapter] 参数校正/映射成功: '${alias}' -> '${correctKey}'`);
                            break;
                        }
                    }
                }

                // 🎯 4. 应用模式特定的默认配置（作为补充）
                for (const [key, value] of Object.entries(modeDefaultConfig)) {
                    if (innerParameters[key] === undefined) {
                        innerParameters[key] = value;
                    }
                }

                // 🎯 5. 模式特定参数的最终验证和兜底 (在应用默认值之后)
                switch (mode) {
                    case 'extract':
                        if (!innerParameters.schema_definition) {
                            console.warn(`[DeepResearchAdapter] 兜底：为 extract 模式补充默认的 schema_definition`);
                            innerParameters.schema_definition = { "title": "string", "content": "string", "metadata": "object" };
                        }
                        break;
                    case 'batch_crawl':
                        if (innerParameters.urls && !Array.isArray(innerParameters.urls)) {
                            console.warn(`[DeepResearchAdapter] 兜底：batch_crawl的urls参数不是数组，强制转换为数组`);
                            innerParameters.urls = [String(innerParameters.urls)];
                        }
                        break;
                }

                // 🎯 6. 构建并返回绝对正确的双层嵌套结构
                const finalParams = {
                    mode: mode,
                    parameters: innerParameters
                };

                console.log(`[DeepResearchAdapter] ✅ crawl4ai 参数重构完成，最终发送:`, {
                    mode: finalParams.mode,
                    parametersKeys: Object.keys(finalParams.parameters),
                    parametersPreview: JSON.stringify(finalParams.parameters).substring(0, 200) + '...'
                });
                
                return finalParams;
            }
                
            case 'python_sandbox': {
                const baseConfig = {
                    timeout: modeSpecific.timeout || 90,
                    allow_network: modeSpecific.allow_network !== false,
                    ...agentParams
                };
                
                // 🎯 核心修复：应用代码转义修复
                let finalCode = '';
                if (agentParams.parameters && agentParams.parameters.code) {
                    finalCode = this._fixPythonCodeEscaping(agentParams.parameters.code);
                    return { ...baseConfig, ...agentParams.parameters, code: finalCode };
                }
                if (agentParams.code) {
                    finalCode = this._fixPythonCodeEscaping(agentParams.code);
                    return { ...baseConfig, code: finalCode };
                }
                return baseConfig;
            }
                
            case 'glm4v_analyze_image': {
                return {
                    image_url: agentParams.image_url,
                    prompt: agentParams.prompt || '请详细分析这张图片的内容、特征和潜在含义',
                    detail: agentParams.detail || 'high',
                    ...agentParams
                };
            }
                
            case 'stockfish_analyzer': {
                return {
                    fen: agentParams.fen,
                    depth: agentParams.depth || 18,
                    ...agentParams
                };
            }

            case 'firecrawl': {
                console.warn(`[DeepResearchAdapter] 工具 'firecrawl' 在Agent模式下可能不可用，提供兼容参数`);
                if (agentParams.url && !agentParams.parameters && !agentParams.mode) {
                    return { mode: 'scrape', parameters: { url: agentParams.url } };
                }
                return agentParams;
            }
        }
        
        return { ...agentParams, ...modeSpecific };
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
                    // 🎯 关键修复：确保我们处理的是正确的对象
                    const crawlData = rawResponse.rawResult || dataFromProxy;
                    const calledParameters = rawResponse.rawParameters || {};
                    
                    console.log(`[DeepResearchAdapter] crawl4ai 已解析的响应数据:`, crawlData);
                    
                    // 🎯 增强错误检测：检查多种失败标志
                    const isError = rawResponse.error || 
                                   crawlData.success === false || 
                                   (crawlData.data && crawlData.data.success === false) ||
                                   (crawlData.status && crawlData.status >= 400);

                    if (isError) {
                        const errorDetails = this._diagnoseCrawl4AIError(rawResponse, calledParameters);
                        const prettyCalledParams = JSON.stringify(calledParameters, null, 2);

                        // 返回一个对Agent友好的、结构化的Markdown错误报告
                        return {
                            success: false,
                            output: `❌ **crawl4ai (模式: ${calledParameters.mode || 'unknown'}) 执行失败**\n\n` +
                                    `**诊断报告**:\n` +
                                    `*   **错误类型**: ${errorDetails.type}\n` +
                                    `*   **可能原因**: ${errorDetails.reason}\n\n` +
                                    `**下一步修复建议**:\n` +
                                    errorDetails.suggestions.map(s => `    - ${s}`).join('\n') +
                                    `\n\n**用于调试的调用参数**:\n\`\`\`json\n${prettyCalledParams}\n\`\`\``,
                            sources: [],
                            isError: true,
                            mode: 'deep_research',
                            researchMode: researchMode
                        };
                    }
                    
                    if (crawlData && typeof crawlData === 'object') {
                        const content = crawlData.content || crawlData.markdown;
                        const contentLength = content?.length || 0;
                        
                        const isDocumentationUrl = crawlData.url?.includes('/docs/') ||
                                                crawlData.url?.includes('/guide/') ||
                                                crawlData.url?.includes('docs.') ||
                                                crawlData.url?.includes('/documentation/');
                        
                        let isContentValid = false;

                        // 🎯 强制文档类URL通过检查，并解决内容提取问题
                        if (isDocumentationUrl) {
                            // 对于文档URL，即使内容是导航/样板文字，只要长度够长就认为成功
                            isContentValid = contentLength > 10; // 极度宽松
                            console.log(`[DeepResearchAdapter] 文档URL (${crawlData.url}) 检测到，内容检查强制: ${isContentValid}`);
                        } else {
                            // 对于其他页面，使用Zhipu优化的检查
                            isContentValid = this.isContentMeaningfulZhipu(content);
                        }
                        
                        if (isContentValid) {
                            output = this.formatWebContentForMode(crawlData, researchMode);
                            
                            if (crawlData.url) {
                                sources.push({
                                    title: crawlData.title || crawlData.url,
                                    url: crawlData.url,
                                    description: `抓取内容长度: ${contentLength} 字符`,
                                    source_type: 'web_page'
                                });
                            }
                            success = true;
                        } else {
                            output = `❌ **网页内容提取失败**: 页面抓取成功，但无法提取到有意义的正文内容。`;
                            success = false;
                        }
                    } else {
                        console.log(`[DeepResearchAdapter] 未提取到任何有效的抓取数据`);
                        output = `❌ **网页抓取失败**: 工具返回空数据或无法解析的响应。`;
                        success = false;
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
                    console.log(`[DeepResearchAdapter] 开始处理 python_sandbox 响应:`, dataFromProxy);

                    let finalOutput = null;
                    let finalError = null;
                    let success = false;

                    try {
                        // 🎯 关键修复：深度解析"俄罗斯套娃"式的嵌套JSON
                        let currentData = dataFromProxy;
                        
                        // 🔥🔥🔥【最终版深度解析循环】🔥🔥🔥
                        // 尝试最多3层解析，防止无限循环
                        for (let i = 0; i < 3; i++) {
                            if (currentData && typeof currentData.stdout === 'string' && currentData.stdout.trim().startsWith('{')) {
                                try {
                                    const parsed = JSON.parse(currentData.stdout);
                                    console.log(`[PythonOutput] 第${i+1}层解析成功:`, Object.keys(parsed));
                                    // 如果解析后的对象看起来像一个沙箱的输出，就继续深入
                                    if (parsed.stdout !== undefined || parsed.stderr !== undefined) {
                                        currentData = parsed;
                                        continue; // 继续下一轮循环，尝试解析更深层
                                    }
                                } catch (e) {
                                    // 如果某一层解析失败，就使用当前层的数据，不再深入
                                    console.warn(`[PythonOutput] 第${i+1}层解析失败，停止深入解析。`);
                                    break;
                                }
                            }
                            // 如果stdout不是一个JSON字符串，或已经没有更深层，则跳出循环
                            break;
                        }

                        // 🎯 从深度解析后的结果中正确提取输出和错误
                        finalOutput = currentData.stdout;
                        finalError = currentData.stderr;
                        
                        console.log(`[PythonOutput] 🔍 深度解析结果:`, {
                            stdoutLength: finalOutput?.length || 0,
                            stderrLength: finalError?.length || 0,
                            hasStderr: !!(finalError && finalError.trim()),
                            stderrPreview: finalError?.substring(0, 200) || '无'
                        });

                        // 🎯 严格的错误判断逻辑
                        if (finalError && finalError.trim()) {
                            console.log(`[PythonOutput] 🔴 确认Python执行失败，错误长度: ${finalError.length}`);
                            
                            const originalCode = rawResponse.rawParameters?.code || '';
                            const errorDetails = this._analyzePythonErrorDeeply(finalError);
                            output = this._buildPythonErrorReport(errorDetails, originalCode);
                            success = false; // 🚨 必须设为false！

                        } else if (finalOutput && finalOutput.trim()) {
                            const outputLower = finalOutput.toLowerCase();
                            if (outputLower.startsWith('error:') || outputLower.startsWith('错误：') || outputLower.includes('not found') || outputLower.includes('未找到')) {
                                console.log(`[PythonOutput] 🟡 检测到Python"静默失败"（逻辑错误），输出内容: ${finalOutput.substring(0, 100)}`);
                                output = `🐍 **Python代码逻辑失败** 🔴\n\n**原因**: 脚本执行成功，但返回了错误信息。\n\n**代码输出**: \n\`\`\`\n${finalOutput}\n\`\`\`\n\n**诊断建议**:\n1. 检查你的代码逻辑是否能在输入数据中找到完全匹配。\n2. 打印 \`input_data\` 的一部分来确认其内容和结构是否符合你的预期。\n3. 调整你的代码以适应实际的输入数据结构。`;
                                success = false;
                            } else {
                                console.log(`[PythonOutput] ✅ Python执行成功，输出长度: ${finalOutput.length}`);
                                output = this.formatCodeOutputForMode({ stdout: finalOutput }, researchMode);
                                success = true;
                            }
                        } else {
                            console.log(`[PythonOutput] ℹ️ Python执行完成，无输出`);
                            output = `[工具信息]: Python代码执行完成，无标准输出或错误内容。`;
                            success = true;
                        }

                    } catch (error) {
                        console.error(`[DeepResearchAdapter] python_sandbox 响应处理异常:`, error);
                        output = `❌ **Python响应处理时发生内部错误**: ${error.message}`;
                        success = false;
                    }
                    
                    const result = {
                        success: success,
                        output: output,
                        sources: [],
                        rawResponse,
                        isError: !success,
                        mode: 'deep_research',
                        researchMode: researchMode
                    };
                    
                    console.log(`[PythonOutput] 🎯 最终返回结果:`, {
                        success: result.success,
                        outputLength: result.output?.length,
                        isError: result.isError
                    });
                    
                    return result;
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
     * 🎯 检查内容是否真正有意义 - 原始严格版本（保留作为参考/默认）
     */
    static isContentMeaningful(content) {
        if (!content || typeof content !== 'string') return false;
        
        const trimmedContent = content.trim();
        // 适度放宽
        if (trimmedContent.length < 100) {
            console.log(`[ContentCheck-Original] 内容过短: ${trimmedContent.length} 字符`);
            return false;
        }
        
        // 检查是否只包含导航/页脚内容
        const meaninglessPatterns = [
            'skip to main content',
            'skip to content',
            'generated using AI',
            'may contain mistakes',
            'copyright',
            'all rights reserved',
            'privacy policy',
            'terms of service',
            'login',
            'sign up',
            'navigation',
            'menu'
        ];
        
        const lowerContent = trimmedContent.toLowerCase();
        const meaninglessCount = meaninglessPatterns.filter(pattern =>
            lowerContent.includes(pattern)
        ).length;
        
        // 如果包含太多无意义内容模式，则认为内容无效
        if (meaninglessCount > 3) {
            console.log(`[ContentCheck-Original] 检测到过多无意义内容模式: ${meaninglessCount}`);
            return false;
        }
        
        // 检查实际文本密度（排除HTML标签、链接等）
        const textOnly = trimmedContent.replace(/\[.*?\]\(.*?\)/g, '') // 移除markdown链接
                                     .replace(/<[^>]*>/g, '') // 移除HTML标签
                                     .replace(/\s+/g, ' ') // 合并空格
                                     .trim();
        
        if (textOnly.length < 50) { // 进一步放宽纯文本长度检查
            console.log(`[ContentCheck-Original] 纯文本内容过少: ${textOnly.length} 字符`);
            return false;
        }
        
        console.log(`[ContentCheck-Original] 内容有效: 总长度 ${trimmedContent.length}, 纯文本长度 ${textOnly.length}`);
        return true;
    }
    
    /**
     * 🎯 新增：针对智谱文档的宽松内容有效性检查
     *    - 解决 Agent 模式下抓取文档页面内容被误判为"无意义"而导致的重试循环。
     */
    static isContentMeaningfulZhipu(content) {
        if (!content || typeof content !== 'string') return false;
        
        const trimmedContent = content.trim();
        
        // 🎯 修复：只要内容长度大于50，我们就跳过所有严格的语义检查。
        if (trimmedContent.length > 50) {
            // 如果内容非常长，几乎肯定是有效内容，直接通过
            console.log(`[ContentCheck-Zhipu] 内容长度 ${trimmedContent.length} > 50，判定为有效`);
            return true;
        }
        
        // 🎯 如果内容较短，执行宽松的关键词检查
        if (trimmedContent.length < 10) {
            console.log(`[ContentCheck-Zhipu] 内容过短: ${trimmedContent.length} 字符，判定为无效`);
            return false;
        }

        // 🎯 关键词检查（用于极短内容）
        const zhipuKeywords = [
            'glm-4', 'glm-3', '智谱', 'bigmodel', '模型', '能力', '介绍'
        ];
        
        const hasZhipuContent = zhipuKeywords.some(keyword =>
            trimmedContent.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasZhipuContent) {
            console.log(`[ContentCheck-Zhipu] 检测到智谱相关内容，判定为有效`);
            return true;
        }
        
        // 最后回退到原始的宽松检查
        return this.isContentMeaningful(content);
    }
    
    /**
     * 🎯 核心修复：Python代码转义问题解决方案
     */
    static _fixPythonCodeEscaping(codeString) {
        if (!codeString || typeof codeString !== 'string') return codeString;
        
        const originalLength = codeString.length;
        console.log(`[CodeEscapingFix] 开始修复代码转义，原始长度: ${originalLength}`);
        
        // 创建修复映射表
        const escapeMap = {
            '\\\\n': '\n',    // 修复换行符
            '\\\\t': '\t',    // 修复制表符
            '\\\\r': '\r',    // 修复回车符
            '\\\\"': '"',     // 修复双引号
            "\\\\'": "'",     // 修复单引号
            '\\\\\\\\': '\\'  // 修复反斜杠
        };
        
        let fixedCode = codeString;
        let changesMade = false;
        
        // 应用所有转义修复
        Object.entries(escapeMap).forEach(([escaped, unescaped]) => {
            const original = fixedCode;
            // 使用 new RegExp(escaped, 'g') 来确保全局替换
            fixedCode = fixedCode.replace(new RegExp(escaped, 'g'), unescaped);
            if (original !== fixedCode) {
                changesMade = true;
                console.log(`[CodeEscapingFix] 修复了 ${escaped} -> ${unescaped}`);
            }
        });
        
        if (changesMade) {
            console.log(`[CodeEscapingFix] 修复完成: ${originalLength} -> ${fixedCode.length} 字符`);
            // 记录修改前后的代码片段用于调试
            console.log(`[CodeEscapingFix] 修改前片段: ${codeString.substring(0, 100)}...`);
            console.log(`[CodeEscapingFix] 修改后片段: ${fixedCode.substring(0, 100)}...`);
        } else {
            console.log(`[CodeEscapingFix] 无需修复，代码保持原样`);
        }
        
        return fixedCode;
    }
    
    /**
     * 🎯 深度分析Python错误信息
     */
    static _analyzePythonErrorDeeply(stderr) {
        const errorText = stderr.trim();
        console.log(`[ErrorAnalyzer] 开始分析错误:`, errorText.substring(0, 200));
        
        const analysis = {
            rawError: errorText,
            type: '未知错误',
            location: '未知位置',
            lineNumber: null,
            errorMessage: '',
            suggestions: []
        };

        const errorTypeMatch = errorText.match(/(\w+Error):/);
        if (errorTypeMatch) {
            analysis.type = errorTypeMatch[1];
        }

        const lineMatch = errorText.match(/line (\d+)/);
        if (lineMatch) {
            analysis.lineNumber = parseInt(lineMatch[1], 10);
            analysis.location = `第 ${analysis.lineNumber} 行`;
        }

        const lines = errorText.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            analysis.errorMessage = lines[lines.length - 1];
        }

        analysis.suggestions = this._getPythonErrorSuggestions(analysis.type, analysis.lineNumber);

        console.log(`[ErrorAnalyzer] 错误分析完成:`, analysis);
        return analysis;
    }

    /**
     * 🎯 根据错误类型提供修复建议
     */
    static _getPythonErrorSuggestions(errorType, lineNumber) {
        const suggestionsMap = {
            'IndentationError': [
                `检查第 ${lineNumber || '相关'} 行及其附近代码的缩进`,
                '确保使用一致的缩进（推荐4个空格），不要混用空格和Tab键'
            ],
            'SyntaxError': [
                `检查第 ${lineNumber || '相关'} 行附近的语法`,
                '确保所有括号 `()`, `[]`, `{}` 和引号 `"` `\'` 都已正确配对和闭合'
            ],
            'NameError': [
                `检查第 ${lineNumber || '相关'} 行使用的变量名或函数名，确认其在使用前已被定义`,
                '仔细检查拼写和大小写'
            ],
            'TypeError': [
                `检查第 ${lineNumber || '相关'} 行的数据类型和操作`,
                '确认操作符两边的数据类型是否兼容（例如，不能将字符串和数字相加）'
            ],
            'AttributeError': [
                `检查第 ${lineNumber || '相关'} 行的对象属性或方法调用`,
                '确认对象类型是否正确，以及它是否真的拥有该属性/方法'
            ],
            'IndexError': [
                `检查第 ${lineNumber || '相关'} 行的列表或字符串索引`,
                '确认索引值是否在有效范围内（0 到 长度-1）'
            ],
            'KeyError': [
                `检查第 ${lineNumber || '相关'} 行的字典键访问`,
                '确认字典中是否存在您尝试访问的键，检查键名拼写'
            ]
        };

        return suggestionsMap[errorType] || [
            '仔细阅读错误信息，理解其根本原因',
            '将复杂代码分解，逐一验证每个部分',
            '对照工具文档（SKILL.md）检查用法是否正确'
        ];
    }

    /**
     * 🎯 构建对LLM极其友好的Python错误报告
     */
    static _buildPythonErrorReport(errorDetails, originalCode = '') {
        const { type, location, errorMessage, suggestions, rawError } = errorDetails;
        
        let codeContext = '';
        if (originalCode && errorDetails.lineNumber) {
            const lines = originalCode.split('\n');
            const startLine = Math.max(0, errorDetails.lineNumber - 3);
            const endLine = Math.min(lines.length, errorDetails.lineNumber + 2);
            
            codeContext = '\n**相关代码上下文**:\n```python\n';
            for (let i = startLine; i < endLine; i++) {
                const marker = (i + 1 === errorDetails.lineNumber) ? '>>> ' : '    ';
                codeContext += `${marker}${i + 1}: ${lines[i]}\n`;
            }
            codeContext += '```\n';
        }

        return `🐍 **Python代码执行失败 - 需要您的专业诊断** 🔴

**错误摘要**：
- **错误类型**: \`${type}\`
- **错误位置**: ${location}
- **具体描述**: \`${errorMessage}\`

**🛠️ 您的诊断任务**：
请基于以上错误信息，在"思考"部分完成：
1.  **错误类型识别**：[明确指出错误类型]
2.  **错误原因分析**：[详细分析为什么会出现这个错误]
3.  **修复方案**：[清晰说明您将如何修正代码]

${codeContext}

**专业修复建议**：
${suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

**请严格按照此诊断-修正流程操作，并输出修正后的完整代码。**`;
    }
    
    /**
     * 🎯 crawl4ai 错误诊断（最终版）
     */
    static _diagnoseCrawl4AIError(rawResponse, calledParameters) {
        const errorText = (rawResponse.error || '').toString().toLowerCase();
        const status = rawResponse.rawResult?.status;
        const mode = calledParameters.mode || 'unknown';

        // 诊断1: 参数结构或名称错误 (最常见)
        if ((status === 500 || errorText.includes('500')) && mode === 'extract' && !calledParameters.parameters?.schema_definition) {
            return {
                type: '参数缺失/名称错误',
                reason: `调用'extract'模式时，必需的'schema_definition'参数缺失。Agent可能错误地使用了'schema'作为参数名，或者忘记提供。`,
                suggestions: [
                    '**修正参数名**: 确保使用 `schema_definition` 而不是 `schema`。',
                    '**检查参数结构**: 确认所有参数都正确嵌套在 `parameters` 对象内部。',
                    '**参考文档**: 严格按照 `SKILL.md` 中的 `extract` 模式模板重新构建调用。'
                ]
            };
        }

        // 诊断2: 通用服务器错误
        if (status === 500 || errorText.includes('500')) {
            return {
                type: '工具后端服务错误',
                reason: `crawl4ai 后端服务在处理请求时发生内部错误。可能原因包括目标URL无法访问、页面结构异常复杂或参数值无效。`,
                suggestions: [
                    '**验证URL**: 确认目标URL在浏览器中可以正常打开。',
                    '**简化任务**: 尝试使用更基础的 `scrape` 模式测试该URL是否可被抓取。',
                    '**检查参数值**: 确认 `max_pages`, `max_depth` 等参数的值是合理的数字。'
                ]
            };
        }

        // 诊断3: 超时错误
        if (errorText.includes('timeout') || errorText.includes('timed out')) {
            return {
                type: '请求超时',
                reason: `工具执行时间超过了设定的阈值。对于'deep_crawl'或'batch_crawl'模式，这通常意味着任务范围过大。`,
                suggestions: [
                    '**缩小范围**: 减少 `max_pages` 或 `max_depth` 的值。',
                    '**降低并发**: 减少 `concurrent_limit` 的值。',
                    '**分步执行**: 将大任务拆分成多个小任务分别执行。'
                ]
            };
        }

        // 诊断4: 网络连接错误
        if (errorText.includes('network') || errorText.includes('fetch') || errorText.includes('connection')) {
            return {
                type: '网络连接错误',
                reason: `无法连接到crawl4ai工具服务。可能是网络问题或服务暂时不可用。`,
                suggestions: [
                    '**检查网络**: 确认网络连接正常。',
                    '**稍后重试**: 等待一段时间后再次尝试。',
                    '**使用备用工具**: 考虑使用其他工具（如tavily_search）完成当前任务。'
                ]
            };
        }
        
        // 默认诊断
        return {
            type: '未知错误',
            reason: errorText || '未提供具体错误信息。',
            suggestions: [
                '**全面审查**: 请仔细检查完整的工具调用，包括 `mode` 和 `parameters` 对象中的所有键和值。',
                '**对照模板**: 将您的调用与 `SKILL.md` 中的精确调用模板进行逐一比对。'
            ]
        };
    }
    
    /**
     * 🎯 深度诊断Python输出问题
     */
    static _extractActualPythonOutput(rawResponse) {
        try {
            // 🎯 修复：使用正确的路径访问后端返回的原始数据
            const dataFromProxy = rawResponse.rawResult?.data || rawResponse.output || {};
            
            if (!dataFromProxy.stdout) {
                console.log(`[OutputDiagnostic] 没有stdout内容`);
                return null;
            }
            
            let content = dataFromProxy.stdout;
            console.log(`[OutputDiagnostic] 开始诊断Python输出，原始内容长度: ${content.length}`);
            
            // 尝试多层JSON解析
            for (let i = 0; i < 3; i++) {
                try {
                    const parsed = JSON.parse(content);
                    console.log(`[OutputDiagnostic] 第${i + 1}层解析成功:`, Object.keys(parsed));
                    
                    if (parsed.stdout && typeof parsed.stdout === 'string') {
                        content = parsed.stdout;
                        continue;
                    }
                    if (parsed.type === 'text' && parsed.stdout) {
                        content = parsed.stdout;
                        continue;
                    }
                    break;
                } catch (e) {
                    console.log(`[OutputDiagnostic] 第${i + 1}层解析失败，停止解析`);
                    break;
                }
            }
            
            // 验证是否为有效输出
            // 🎯 修复：更严格的验证条件
            const isValidOutput = content && 
                                content.length > 10 && 
                                !content.toLowerCase().includes('error') && 
                                !content.toLowerCase().includes('exception') &&
                                !content.includes('[工具信息]: Python代码执行完成，无输出内容。');
            
            if (isValidOutput) {
                console.log(`[OutputDiagnostic] ✅ 诊断成功，提取到有效输出: ${content.length}字符`);
                return content;
            }
            
            console.log(`[OutputDiagnostic] ❌ 诊断失败，输出无效`);
            return null;
        } catch (error) {
            console.error(`[OutputDiagnostic] 诊断失败:`, error);
            return null;
        }
    }

    /**
     * 🎯 增强输出验证
     */
    static _validatePythonOutput(output, rawResponse, researchMode = 'deep') {
        // 检查是否为默认的无输出消息
        if (output.includes('[工具信息]: Python代码执行完成，无输出内容。')) {
            console.log(`[OutputValidation] 检测到疑似错误输出，尝试深度提取`);
            const actualOutput = DeepResearchToolAdapter._extractActualPythonOutput(rawResponse);
            if (actualOutput) {
                console.log(`[OutputValidation] ✅ 验证成功，替换为实际输出`);
                // 🎯 修复：重新格式化提取到的实际输出
                return DeepResearchToolAdapter.formatCodeOutputForMode({ stdout: actualOutput }, researchMode);
            }
        }
        return output;
    }
    
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
    
    // 🎯 关键修复：无论内容长度如何都返回有效输出
    if (content && content.length > 0) {
        return `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n**内容长度**: ${content.length} 字符\n**内容**:\n${content}`;
    } else {
        // 🎯 即使没有content，也返回其他有用信息
        const availableFields = Object.keys(webData).filter(key =>
            webData[key] && key !== 'content' && key !== 'markdown'
        );
        
        return `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n**可用数据字段**: ${availableFields.join(', ')}\n**原始数据**:\n${JSON.stringify(webData, null, 2).substring(0, 1000)}${JSON.stringify(webData, null, 2).length > 1000 ? '...' : ''}`;
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
            
            let rawResult = await Promise.race([toolPromise, timeoutPromise]);
            
            // 🎯 关键修复：将 normalizedInput 附加到 rawResult 中，供错误处理使用
            if (rawResult && typeof rawResult === 'object') {
                rawResult.rawParameters = normalizedInput;
            } else {
                // 如果 rawResult 不是对象，创建一个包装对象
                rawResult = {
                    output: rawResult,
                    rawParameters: normalizedInput
                };
            }
            
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

export { DeepResearchToolAdapter, ProxiedTool };
