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
                        word_count_threshold: 10, // 🎯 新增：匹配后端默认值
                        wait_for: 8000, // ⬆️ 增加到 8秒，应对慢速政府网站
                        exclude_external_links: false,  // 🎯 修复：不禁用外部链接
                        headers: { // 伪装 User-Agent
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        },
                        remove_selectors: [ // 移除覆盖层和弹窗，增强正文提取
                            'div[id*="modal"]',
                            'div[class*="modal"]',
                            'div[id*="overlay"]',
                            'div[class*="overlay"]',
                            'div[id*="popup"]',
                            'div[class*="popup"]'
                        ]
                    },
                    batch_crawl: {  // 🆕 添加batch_crawl配置
                        concurrent_limit: 3, // 并发限制
                        timeout_per_url: 15000 // 每个URL超时时间
                    },
                    deep_crawl: {
                        max_pages: 80, // ⬆️ 匹配后端内存升级后的新能力
                        max_depth: 3,
                        strategy: 'bfs'
                    },
                    extract: {
                        extraction_type: 'css', // 🎯 修复：强制使用 CSS 提取，避免调用后端不稳定的 LLM 提取
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
                    include_raw_content: true,
                    include_answer: false,
                    include_domains: ['bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com'],
                    exclude_domains: ['wikipedia.org']
                },
                crawl4ai: {
                    scrape: {
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        include_tables: true,
                        format: 'markdown',
                        word_count_threshold: 10, // 🎯 新增：匹配后端默认值
                        wait_for: 8000, // ⬆️ 增加到 8秒，应对慢速政府网站
                        exclude_external_links: false,  // 🎯 修复：不禁用外部链接
                        headers: { // 伪装 User-Agent
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        },
                        remove_selectors: [ // 移除覆盖层和弹窗，增强正文提取
                            'div[id*="modal"]',
                            'div[class*="modal"]',
                            'div[id*="overlay"]',
                            'div[class*="overlay"]',
                            'div[id*="popup"]',
                            'div[class*="popup"]'
                        ]
                    },
                    batch_crawl: {  // 🆕 添加batch_crawl配置
                        concurrent_limit: 3, // 并发限制
                        timeout_per_url: 15000 // 每个URL超时时间
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
                        word_count_threshold: 10, // 🎯 新增：匹配后端默认值
                        wait_for: 8000, // ⬆️ 增加到 8秒，应对慢速政府网站
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        exclude_external_links: false,  // 🎯 修复：不禁用外部链接
                        headers: { // 伪装 User-Agent
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        },
                        remove_selectors: [ // 移除覆盖层和弹窗，增强正文提取
                            'div[id*="modal"]',
                            'div[class*="modal"]',
                            'div[id*="overlay"]',
                            'div[class*="overlay"]',
                            'div[id*="popup"]',
                            'div[class*="popup"]'
                        ]
                    },
                    batch_crawl: {  // 🆕 添加batch_crawl配置
                        concurrent_limit: 3, // 并发限制
                        timeout_per_url: 15000 // 每个URL超时时间
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
                        word_count_threshold: 10, // 🎯 新增：匹配后端默认值
                        wait_for: 8000, // ⬆️ 增加到 8秒，应对慢速政府网站
                        only_main_content: false,  // 🎯 修复：禁用内容过滤
                        exclude_external_links: false,  // 🎯 修复：不禁用外部链接
                        headers: { // 伪装 User-Agent
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        },
                        remove_selectors: [ // 移除覆盖层和弹窗，增强正文提取
                            'div[id*="modal"]',
                            'div[class*="modal"]',
                            'div[id*="overlay"]',
                            'div[class*="overlay"]',
                            'div[id*="popup"]',
                            'div[class*="popup"]'
                        ]
                    },
                    batch_crawl: {  // 🆕 添加batch_crawl配置
                        concurrent_limit: 3, // 并发限制
                        timeout_per_url: 15000 // 每个URL超时时间
                    }
                },
                python_sandbox: {
                    timeout: 180,
                    allow_network: true
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
                        word_count_threshold: 10, // 🎯 新增：匹配后端默认值
                        wait_for: 8000, // ⬆️ 增加到 8秒，应对慢速政府网站
                        exclude_external_links: false, // 🎯 修复：不禁用外部链接
                        headers: { // 伪装 User-Agent
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        },
                        remove_selectors: [ // 移除覆盖层和弹窗，增强正文提取
                            'div[id*="modal"]',
                            'div[class*="modal"]',
                            'div[id*="overlay"]',
                            'div[class*="overlay"]',
                            'div[id*="popup"]',
                            'div[class*="popup"]'
                        ]
                    },
                    batch_crawl: {  // 🆕 添加batch_crawl配置
                        concurrent_limit: 3, // 并发限制
                        timeout_per_url: 15000 // 每个URL超时时间
                    },
                    deep_crawl: {
                        max_pages: 20, // ⬆️ 提升默认值
                        max_depth: 2 // ⬆️ 提升默认值
                    },
                    extract: {
                        extraction_type: 'css' // 🎯 修复：强制使用 CSS 提取
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
        
        // 🔥【核心修复】智能参数解包逻辑
        // 检查传入的参数是否是Agent错误生成的嵌套结构
        let unwrappedParams = rawParameters;
        if (unwrappedParams.tool_name && unwrappedParams.parameters && typeof unwrappedParams.parameters === 'object') {
            console.warn(`[DeepResearchAdapter] ⚠️ 检测到Agent生成的错误嵌套JSON结构，正在进行智能解包...`);
            // 如果是，我们只取内部的 parameters 对象作为真正的参数
            unwrappedParams = unwrappedParams.parameters;
        }
        // 🔥【修复结束】现在 unwrappedParams 已经是正确的参数对象了
        
        // 确保我们操作的是一个可修改的副本，以兼容后续的 delete 操作
        const agentParams = { ...unwrappedParams };
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
                console.log('[DeepResearchAdapter] 开始重构 crawl4ai 参数:', agentParams);
                
                // 🎯 1. 确定模式和基础配置
                let mode = agentParams.mode || 'scrape';
                
                // 🔥 关键修复：模式名映射
                if (mode === 'batch_scrape') {
                    mode = 'batch_crawl';
                    console.log('[DeepResearchAdapter] 🔄 映射模式: batch_scrape -> batch_crawl');
                }
                
                const modeDefaultConfig = this.getModeSpecificParameters(researchMode, toolName)[mode] || {};
                
                // 🎯 2. 智能参数提取 - 兼容多种格式
                // Agent可能生成三种格式：
                // 格式1: {mode: "batch_crawl", urls: [...]} ✅ (新标准)
                // 格式2: {mode: "batch_crawl", parameters: {urls: [...]}} ❌ (旧格式)
                // 格式3: {parameters: {mode: "batch_crawl", urls: [...]}} ❌ (错误嵌套)
                
                let rawParameters = { ...agentParams };
                
                // 🔥 关键修复：智能参数解包，处理双层和三层嵌套
                // 检查是否有嵌套的 parameters
                if (rawParameters.parameters && typeof rawParameters.parameters === 'object') {
                    let innerParams = rawParameters.parameters;
                    
                    // 检查是否为三层嵌套：{ mode: "...", parameters: { parameters: { ... } } }
                    if (innerParams.parameters && typeof innerParams.parameters === 'object') {
                        console.warn('[DeepResearchAdapter] ⚠️ 检测到三层嵌套参数，提取最内层');
                        // 合并中间层参数和最内层参数
                        rawParameters = { ...rawParameters, ...innerParams.parameters };
                        // 合并中间层其他参数（如 strategy, url 等）
                        for (const [key, value] of Object.entries(innerParams)) {
                            if (key !== 'parameters' && !(key in rawParameters)) {
                                rawParameters[key] = value;
                            }
                        }
                    } else {
                        // 双层嵌套：{ mode: "...", parameters: { ... } }
                        console.log('[DeepResearchAdapter] 📦 检测到双层嵌套参数，提取内部参数');
                        // 合并顶层参数和内部参数
                        rawParameters = { ...rawParameters, ...innerParams };
                    }
                    delete rawParameters.parameters; // 删除顶层多余的 parameters 键
                }
                
                // 🎯 3. 参数名校正
                const innerParameters = {};
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
                        if (rawParameters[alias] !== undefined) {
                            innerParameters[correctKey] = rawParameters[alias];
                            console.log(`[DeepResearchAdapter] 参数校正: '${alias}' -> '${correctKey}'`);
                            break;
                        }
                    }
                }
                
                // 🎯 4. 应用模式特定的默认配置
                for (const [key, value] of Object.entries(modeDefaultConfig)) {
                    if (innerParameters[key] === undefined) {
                        innerParameters[key] = value;
                    }
                }
                
                // 🎯 5. 模式特定参数验证
                switch (mode) {
                    case 'batch_crawl':
                        if (innerParameters.urls) {
                            // 确保urls是数组
                            if (!Array.isArray(innerParameters.urls)) {
                                innerParameters.urls = [String(innerParameters.urls)];
                            }
                            // 限制并发数（根据后端能力调整）
                            if (innerParameters.urls.length > 4) {
                                console.warn('[DeepResearchAdapter] ⚠️ 批量爬取URL数量过多，限制为前4个');
                                innerParameters.urls = innerParameters.urls.slice(0, 4);
                            }
                        } else {
                            console.error('[DeepResearchAdapter] ❌ batch_crawl模式缺少urls参数');
                        }
                        break;
                    case 'extract':
                        if (!innerParameters.schema_definition) {
                            console.warn('[DeepResearchAdapter] 为extract模式补充默认schema_definition');
                            innerParameters.schema_definition = {
                                "title": "string",
                                "content": "string",
                                "metadata": "object"
                            };
                        }
                        break;
                }
                
                // 🎯 6. 🔥 关键修复：构建后端期望的双层嵌套结构
                const finalParams = {
                    mode: mode,
                    parameters: innerParameters  // 内层参数对象
                };
                
                console.log('[DeepResearchAdapter] ✅ crawl4ai 参数重构完成:', {
                    mode: finalParams.mode,
                    parametersKeys: Object.keys(finalParams.parameters),
                    parametersPreview: JSON.stringify(finalParams.parameters).substring(0, 200) + '...'
                });
                
                return finalParams;
            }
                
            case 'python_sandbox': {
                const baseConfig = {
                    timeout: modeSpecific.timeout || 120,
                    allow_network: modeSpecific.allow_network !== false,
                    ...agentParams
                };
                
                let finalCode = '';
                
                // 🎯【核心修复】简化代码提取，直接透传
                if (agentParams.code) {
                    finalCode = agentParams.code;
                } else if (agentParams.parameters && agentParams.parameters.code) {
                    finalCode = agentParams.parameters.code;
                } else if (agentParams.parameters && typeof agentParams.parameters === 'string') {
                    // 处理字符串参数的情况
                    try {
                        const parsed = JSON.parse(agentParams.parameters);
                        finalCode = parsed.code || agentParams.parameters;
                    } catch (e) {
                        finalCode = agentParams.parameters;
                    }
                }

                // 🔥🔥🔥 [核心新增]：代码无害化清洗 🔥🔥🔥
                if (finalCode) {
                    finalCode = String(finalCode);
                    
                    // 1. 移除行尾的反斜杠 (Line Continuation Backslash)
                    // Python 解释器在 exec() 模式下，如果反斜杠后有空格，会报 SyntaxError
                    // 我们直接将 "反斜杠+换行" 替换为普通的 "换行"，依靠括号自动换行机制
                    finalCode = finalCode.replace(/\\\s*\n/g, '\n');
                    
                    // 2. 修复 f-string 中的引号转义问题 (此处仅做最安全的空白清洗)
                }

                if (finalCode) {
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
                    
                    // 🔥 关键修复：处理 batch_crawl 模式的 results 数组
                    const mode = calledParameters.mode || 'scrape';
                    
                    if (mode === 'batch_crawl' && crawlData.results && Array.isArray(crawlData.results)) {
                        console.log(`[DeepResearchAdapter] 处理 batch_crawl 结果，共 ${crawlData.results.length} 个页面`);
                        
                        let combinedContent = '';
                        let successfulCrawls = 0;
                        
                        for (let i = 0; i < crawlData.results.length; i++) {
                            const result = crawlData.results[i];
                            
                            // 检查单个结果是否成功且有内容
                            if (result && result.success !== false) {
                                const content = result.content || result.markdown;
                                
                                if (content && content.trim()) {
                                    // 🔥 关键：对于 batch_crawl，跳过内容有效性检查！
                                    // 我们信任后端返回的有效内容，直接聚合
                                    combinedContent += `## 页面 ${i+1}: ${result.title || result.url}\n\n`;
                                    combinedContent += `**URL**: ${result.url}\n\n`;
                                    combinedContent += content;
                                    combinedContent += '\n\n---\n\n';
                                    
                                    sources.push({
                                        title: result.title || result.url,
                                        url: result.url,
                                        description: `抓取内容长度: ${content.length} 字符`,
                                        source_type: 'web_page'
                                    });
                                    
                                    successfulCrawls++;
                                }
                            }
                        }
                        
                        if (successfulCrawls > 0) {
                            output = this.formatWebContentForMode({
                                content: combinedContent,
                                title: `批量抓取结果 (${successfulCrawls}/${crawlData.results.length} 成功)`,
                                url: '多个URL'
                            }, researchMode);
                            success = true;
                        } else {
                            output = `❌ **批量网页抓取失败**: 所有页面均未提取到有意义的正文内容。`;
                            success = false;
                        }
                        
                    } else if (crawlData && typeof crawlData === 'object') {
                        // 🔥 原逻辑：处理单个页面的抓取 (scrape, deep_crawl, extract)
                        const content = crawlData.content || crawlData.markdown;
                        const contentLength = content?.length || 0;
                        
                        const isDocumentationUrl = crawlData.url?.includes('/docs/') ||
                                                  crawlData.url?.includes('/guide/') ||
                                                  crawlData.url?.includes('docs.') ||
                                                  crawlData.url?.includes('/documentation/');
                        
                        let isContentValid = false;

                        // 🎯 强制文档类URL通过检查
                        if (isDocumentationUrl) {
                            // 对于文档URL，即使内容是导航/样板文字，只要长度够长就认为成功
                            isContentValid = contentLength > 10; // 极度宽松
                            console.log(`[DeepResearchAdapter] 文文档URL (${crawlData.url}) 检测到，内容检查强制: ${isContentValid}`);
                        } else {
                            // 对于其他页面，使用优化的检查
                            isContentValid = this.isContentMeaningfulRelaxed(content);
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
                    console.log(`[DeepResearchAdapter] 处理 python_sandbox 响应:`, dataFromProxy);

                    // 🎯【核心修复】直接使用后端原始数据
                    let parsedData = dataFromProxy;
                    if (typeof parsedData === 'string') {
                        try { 
                            parsedData = JSON.parse(parsedData); 
                        } catch (e) { 
                            // 如果不是JSON，保持原样
                        }
                    }

                    const finalStdout = parsedData.stdout || '';
                    const finalStderr = parsedData.stderr || '';
                    
                    // 🎯 优化判定逻辑：对 Warning 的容忍度
                    const stdoutStr = finalStdout.trim();
                    const hasImage = stdoutStr && (stdoutStr.includes('image_base64') || (typeof stdoutStr === 'string' && stdoutStr.includes('"type": "image"')));
                    
                    // 如果成功生成了图片，或者是 0 退出码，就认为成功，忽略 stderr 中的 Warning
                    const isSuccess = (!rawResponse.error && parsedData.exit_code === 0) || hasImage;
                    
                    // 只有在真的失败时（非0退出码 且 无图片），才把 stderr 当作错误
                    const hasError = !isSuccess && finalStderr.trim().length > 0;

                    let success = isSuccess;
                    let finalOutput = '';

                    if (hasError) {
                        // 错误处理
                        const errorDetails = this._analyzePythonErrorDeeply(finalStderr);
                        finalOutput = this._buildPythonErrorReport(errorDetails, rawResponse.rawParameters?.code || '');
                    } else {
                        // 成功处理
                        
                        // 🎯【核心修复】直接尝试JSON解析，不进行正则提取
                        let isStructuredData = false;
                        let tempOutput = ''; // 使用临时变量存储成功时的输出

                        // 🔥🔥🔥 新增：检查代码执行成功但无输出的情况 🔥🔥🔥
                        if (!stdoutStr) {
                            // 🎯 构造结构化错误报告，提示 Agent 修复代码
                            const errorDetails = {
                                type: 'ZeroOutputWarning',
                                location: '代码执行结束',
                                errorMessage: '代码执行成功 (Exit Code 0)，但标准输出 (stdout) 为空。',
                                suggestions: [
                                    '请检查您的代码逻辑，确保您使用了 `print()` 函数来输出结果。',
                                    '如果代码是用于生成文件（如图片、CSV），请确保您输出了包含文件路径或Base64数据的结构化JSON。',
                                    '请修正代码，并再次尝试。'
                                ]
                            };
                            finalOutput = this._buildPythonErrorReport(errorDetails, rawResponse.rawParameters?.code || '');
                            success = false; // 强制标记为失败，触发 Agent 修复
                            console.warn('[DeepResearchAdapter] ⚠️ Python代码执行成功但无输出，强制失败并提示修复。');
                        } else {
                            // 有输出时的正常处理流程
                            if (stdoutStr.startsWith('{') && stdoutStr.endsWith('}')) {
                                try {
                                    const jsonOutput = JSON.parse(stdoutStr);
                                    // 检查是否是我们支持的特殊类型
                                    if (jsonOutput.type && ['image', 'excel', 'word', 'pdf', 'ppt'].includes(jsonOutput.type)) {
                                        // ✅ 直接返回原始JSON字符串
                                        tempOutput = stdoutStr;
                                        isStructuredData = true;
                                    }
                                } catch (e) {
                                    // 解析失败，当作普通文本处理
                                    console.log('[DeepResearchAdapter] stdout 不是有效JSON，当作普通文本处理');
                                }
                            }

                            if (!isStructuredData) {
                                tempOutput = this.formatCodeOutputForMode({ stdout: stdoutStr }, researchMode);
                            }
                            
                            // 🔥 成功时将临时输出赋值给 finalOutput
                            finalOutput = tempOutput;
                        }
                    }

                    return {
                        success,
                        output: finalOutput, // <--- 修复：现在 finalOutput 包含了成功时的输出
                        stderr: finalStderr,
                        sources: [],
                        rawResponse: parsedData,
                        isError: !success,
                        mode: 'deep_research',
                        researchMode: researchMode,
                        exitCode: parsedData.exit_code
                    };
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
     * 🎯 新增：宽松内容有效性检查
     *    - 解决 Agent 模式下抓取文档页面内容被误判为"无意义"而导致的重试循环。
     */
    static isContentMeaningfulRelaxed(content) {
        if (!content || typeof content !== 'string') return false;
        
        const trimmedContent = content.trim();
        
        // 🔥 关键修复：大幅放宽检查条件
        // 1. 只要长度大于50字符就认为是有效内容
        if (trimmedContent.length > 50) {
            console.log(`[ContentCheck-Relaxed] 内容长度 ${trimmedContent.length} > 50，判定为有效`);
            return true;
        }
        
        // 2. 如果内容过短，直接判定为无效
        if (trimmedContent.length < 10) {
            console.log(`[ContentCheck-Relaxed] 内容过短: ${trimmedContent.length} 字符，判定为无效`);
            return false;
        }
        
        // 3. 检查是否有代码块或JSON结构
        const hasCode = trimmedContent.includes('```') ||
                       trimmedContent.includes('{') ||
                       trimmedContent.includes('[');
        
        if (hasCode) {
            console.log(`[ContentCheck-Relaxed] 检测到代码或JSON结构，判定为有效`);
            return true;
        }
        
        // 4. 对于激进保留策略，我们不再需要严格的 isContentMeaningful 检查，因为我们只移除垃圾
        // 只要通过了长度和代码检查，就认为是有效内容。
        return true;
    }

    /**
     * 🔥 激进内容净化器 - 只移除真正无用的部分
     */
    static AggressiveContentPreserver = class {
        /**
         * 激进内容净化：只移除导航、页脚、广告等无用内容
         */
        static aggressivelyPreserve(content) {
            if (!content || content.length < 20000) return content;
            
            const lines = content.split('\n');
            const preservedLines = [];
            
            // 定义真正需要移除的模式（高确定性无用）
            const uselessPatterns = [
                // 导航和页脚
                /^skip to (main )?content$/i,
                /^(navigation|menu|footer|header)$/i,
                /^back to top$/i,
                /^scroll (down|up)$/i,
                
                // 法律和版权
                /^copyright ©/i,
                /^all rights reserved$/i,
                /^privacy policy$/i,
                /^terms (of service|and conditions)$/i,
                /^cookie policy$/i,
                
                // 广告和弹窗
                /^advertisement$/i,
                /^sponsored content$/i,
                /^click here$/i,
                /^subscribe now$/i,
                /^sign up (for|to)/i,
                /^log in$/i,
                
                // 元信息和重复
                /^generated (by|using) AI$/i,
                /^this article may contain/,
                /^read more:/i,
                /^continue reading$/i,
                
                // 无意义的短行
                /^\s*$/, // 空行
                /^\s*\.\s*$/, // 只有一个点
                /^\s*\d+\s*$/, // 只有数字
            ];
            
            // 定义需要保留的模式（即使看起来像导航，但可能是重要内容）
            const preservePatterns = [
                /^table of contents$/i, // 目录可能有用
                /^\d+\.\s/, // 编号列表
                /^[IVX]+\.\s/, // 罗马数字列表
                /^appendix/i, // 附录
                /^references?/i, // 参考文献
                /^footnotes?/i, // 脚注
                /^data source/i, // 数据来源
            ];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // 跳过空行（但保留换行结构）
                if (line === '') {
                    // 最多保留连续2个空行，避免过多空白
                    const prevLine = preservedLines[preservedLines.length - 1];
                    const prevPrevLine = preservedLines[preservedLines.length - 2];
                    if (prevLine !== '' || prevPrevLine !== '') {
                        preservedLines.push('');
                    }
                    continue;
                }
                
                // 检查是否应该保留（即使匹配无用模式）
                let shouldPreserve = false;
                for (const pattern of preservePatterns) {
                    if (pattern.test(line)) {
                        shouldPreserve = true;
                        break;
                    }
                }
                
                if (shouldPreserve) {
                    preservedLines.push(lines[i]);
                    continue;
                }
                
                // 检查是否真正无用
                let isUseless = false;
                for (const pattern of uselessPatterns) {
                    if (pattern.test(line)) {
                        isUseless = true;
                        break;
                    }
                }
                
                if (!isUseless) {
                    preservedLines.push(lines[i]);
                }
            }
            
            // 移除开头和结尾的无用内容块
            let purified = preservedLines.join('\n');
            purified = this.trimUselessBlocks(purified);
            
            console.log(`[AggressivePreserve] 原始: ${content.length}字符 → 净化: ${purified.length}字符 (保留率: ${(purified.length/content.length*100).toFixed(1)}%)`);
            
            return purified;
        }
        
        /**
         * 移除开头和结尾的无用内容块
         */
        static trimUselessBlocks(content) {
            const paragraphs = content.split('\n\n');
            const meaningfulStartIndex = this.findMeaningfulStart(paragraphs);
            const meaningfulEndIndex = this.findMeaningfulEnd(paragraphs);
            
            if (meaningfulStartIndex > 0 || meaningfulEndIndex < paragraphs.length - 1) {
                const trimmed = paragraphs.slice(meaningfulStartIndex, meaningfulEndIndex + 1).join('\n\n');
                console.log(`[TrimBlocks] 移除 ${meaningfulStartIndex}个开头段落和 ${paragraphs.length - meaningfulEndIndex - 1}个结尾段落`);
                return trimmed;
            }
            
            return content;
        }
        
        /**
         * 找到内容真正开始的位置
         */
        static findMeaningfulStart(paragraphs) {
            for (let i = 0; i < Math.min(10, paragraphs.length); i++) {
                const para = paragraphs[i];
                const hasRealContent = this.hasRealContent(para);
                const isUselessIntro = /^(welcome to|about this site|home|site map)/i.test(para);
                
                if (hasRealContent && !isUselessIntro) {
                    return i;
                }
            }
            return 0;
        }
        
        /**
         * 找到内容真正结束的位置
         */
        static findMeaningfulEnd(paragraphs) {
            for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 10); i--) {
                const para = paragraphs[i];
                const hasRealContent = this.hasRealContent(para);
                const isUselessEnding = /^(copyright|privacy policy|terms of use|contact us)/i.test(para);
                
                if (hasRealContent && !isUselessEnding) {
                    return i;
                }
            }
            return paragraphs.length - 1;
        }
        
        /**
         * 判断段落是否有真实内容
         */
        static hasRealContent(paragraph) {
            if (!paragraph || paragraph.trim().length < 50) return false;
            
            // 包含以下任意一项即认为有真实内容
            const checks = [
                () => paragraph.match(/[.!?]\s*$/), // 有完整句子
                () => paragraph.split(/\s+/).length > 20, // 足够多的单词
                () => paragraph.match(/\d/), // 包含数字
                () => paragraph.match(/[A-Z][a-z]+/), // 包含大写开头的单词
                () => paragraph.match(/\b(?:the|and|for|with|that|this)\b/i), // 包含常见单词
                () => paragraph.includes(':') || paragraph.includes(' - '), // 包含说明性标点
            ];
            
            return checks.some(check => check());
        }
    }

    /**
     * 🎯 激进信息保留策略 - 保留率70-85%，只去掉真正垃圾
     */
    static preserveAggressively(content, researchMode = 'deep') {
        if (!content || content.length <= 20000) return content;
        
        // 1. 激进净化（只移除真正的垃圾）
        const purified = this.AggressiveContentPreserver.aggressivelyPreserve(content);
        
        // 2. 根据研究模式设置保留率
        const preservationRates = {
            deep: 0.85,       // 深度研究：保留85%
            academic: 0.80,   // 学术研究：保留80%
            technical: 0.75,  // 技术文档：保留75%
            business: 0.70,   // 商业分析：保留70%
            standard: 0.60    // 标准模式：保留60%
        };
        
        const targetRate = preservationRates[researchMode] || 0.75;
        const targetLength = Math.min(
            Math.floor(content.length * targetRate),
            40000 // 绝对上限40k
        );
        
        // 3. 如果净化后仍然超过目标长度，进行智能修剪
        if (purified.length > targetLength) {
            // 智能修剪：移除最不重要的部分，但保留所有数据
            const trimmed = this.intelligentlyTrim(purified, targetLength, researchMode);
            return trimmed;
        }
        
        return purified;
    }

    /**
     * 🧠 智能修剪：保留所有数据，修剪描述性内容
     */
    static intelligentlyTrim(content, targetLength, researchMode) {
        // 分离数据内容（数字、表格、代码）和描述性内容
        const { dataParts, descriptiveParts } = this.separateDataAndDescriptive(content);
        
        let result = '';
        let currentLength = 0;
        
        // 1. 优先保留所有数据部分（100%保留）
        for (const dataPart of dataParts) {
            result += dataPart + '\n\n';
            currentLength += dataPart.length + 2;
        }
        
        // 2. 如果还有空间，添加描述性内容
        const remainingForDescriptive = targetLength - currentLength;
        if (remainingForDescriptive > 1000) {
            // 从描述性内容中选择最重要的
            const selectedDescriptive = this.selectDescriptiveContent(
                descriptiveParts,
                remainingForDescriptive,
                researchMode
            );
            result = selectedDescriptive + '\n\n' + result; // 描述在前，数据在后
        }
        
        // 3. 如果仍然超长，压缩描述性内容（但数据部分不动）
        if (result.length > targetLength) {
            // 压缩描述性段落，但不压缩数据部分
            // 🎯 简化：由于我们已经做了智能选择，这里只做硬性截断并添加提示
            const descriptiveLength = result.length - currentLength;
            const trimAmount = result.length - targetLength;
            
            if (descriptiveLength > trimAmount) {
                // 尝试从描述性内容中移除多余部分
                const descriptiveContent = result.substring(0, descriptiveLength);
                const dataContent = result.substring(descriptiveLength);
                
                const trimmedDescriptive = descriptiveContent.substring(0, descriptiveLength - trimAmount - 200) +
                                           '\n\n... [描述性内容已压缩] ...\n\n';
                
                result = trimmedDescriptive + dataContent;
            } else {
                // 如果数据部分也超长，只能硬性截断
                result = result.substring(0, targetLength - 200) +
                         '\n\n... [内容已硬性截断以适应上下文限制] ...';
            }
        }
        
        console.log(`[IntelligentTrim] 数据部分: ${dataParts.length}段, 描述性部分: ${descriptiveParts.length}段`);
        console.log(`[IntelligentTrim] 最终长度: ${result.length}/${targetLength}字符`);
        
        return result;
    }

    /**
     * 📊 分离数据内容和描述性内容
     */
    static separateDataAndDescriptive(content) {
        const paragraphs = content.split('\n\n');
        const dataParts = [];
        const descriptiveParts = [];
        
        for (const para of paragraphs) {
            const isDataPart = this.isDataRichParagraph(para);
            
            if (isDataPart) {
                dataParts.push(para);
            } else {
                descriptiveParts.push(para);
            }
        }
        
        return { dataParts, descriptiveParts };
    }

    /**
     * 🔢 判断段落是否富含数据
     */
    static isDataRichParagraph(paragraph) {
        // 检查是否包含高价值数据
        const checks = [
            // 结构化数据
            () => paragraph.includes('```') || paragraph.startsWith('|'),
            // 数字密度高
            () => {
                const numbers = (paragraph.match(/\d+/g) || []).length;
                const words = paragraph.split(/\s+/).length;
                return words > 0 && (numbers / words) > 0.1; // 10%以上是数字
            },
            // 包含财务/科学数据
            () => paragraph.match(/\$[\d,.]+|\d+\.\d+%|\d+\s*(?:million|billion|thousand)/i),
            // 包含表格或列表数据
            () => paragraph.match(/^\s*(?:\d+\.|\*|\-)\s+/m),
            // 包含代码或公式
            () => paragraph.match(/function|class|def|import|\\\(|\\\[|\\begin\{/),
            // 包含引用或参考文献
            () => paragraph.match(/\[\d+\]|\([A-Za-z]+,?\s*\d{4}\)/),
        ];
        
        return checks.some(check => check());
    }

    /**
     * 📝 选择最重要的描述性内容
     */
    static selectDescriptiveContent(descriptiveParts, maxLength, researchMode) {
        // 给描述性段落评分
        const scored = descriptiveParts.map((para, index) => {
            let score = 0;
            
            // 位置分数（开头结尾更重要）
            const position = index / descriptiveParts.length;
            if (position < 0.2 || position > 0.8) score += 3;
            
            // 长度分数（中等长度最好）
            const len = para.length;
            if (len > 200 && len < 800) score += 2;
            
            // 结构分数（标题、列表等）
            if (para.match(/^#+\s/)) score += 4;
            if (para.match(/^\s*(?:•|\*|\-)\s+/m)) score += 2;
            
            // 连接词分数（表明逻辑关系）
            if (para.match(/\b(?:however|therefore|consequently|in conclusion|summary)\b/i)) score += 3;
            
            return { para, score };
        });
        
        // 按分数排序
        scored.sort((a, b) => b.score - a.score);
        
        // 选择直到达到长度限制
        let result = '';
        let currentLength = 0;
        
        for (const { para } of scored) {
            if (currentLength + para.length <= maxLength) {
                result += para + '\n\n';
                currentLength += para.length + 2;
            } else {
                // 尝试截取段落的一部分
                const remaining = maxLength - currentLength - 100;
                if (remaining > 200) {
                    // 找到句子的边界
                    const sentences = para.split(/[.!?]+/);
                    let extracted = '';
                    for (const sentence of sentences) {
                        if (extracted.length + sentence.length < remaining) {
                            extracted += sentence + '. ';
                        } else {
                            break;
                        }
                    }
                    if (extracted) {
                        result += extracted.trim() + '\n\n';
                        currentLength += extracted.length + 2;
                    }
                }
                break;
            }
        }
        
        return result;
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
            standard: '标准'
        };
        return modeNames[researchMode] || '标准';
    }
    
    /**
     * 根据研究模式格式化网页内容
     */
static formatWebContentForMode(webData, researchMode) {
    const rawContent = webData.content || webData.markdown || '';
    const title = webData.title || '无标题';
    const url = webData.url || '未知';
    
    const modePrefixes = {
        deep: '📚 深度研究网页内容',
        business: '🏢 行业分析网页内容',
        academic: '🎓 学术文献网页内容',
        technical: '⚙️ 技术文档网页内容',
        standard: '📄 标准网页内容'
    };
    
    const prefix = modePrefixes[researchMode] || modePrefixes.standard;
    
    // 🎯 激进保留策略：保留70-85%的内容，只去掉真正无用的
    const preservedContent = this.preserveAggressively(
        rawContent,
        researchMode
    );
    
    // 🔥 关键修复：对于 batch_crawl，显示不同的格式
    if (url === '多个URL' && title.includes('批量抓取结果')) {
        return `${prefix}:\n\n**${title}**\n${preservedContent}`;
    }
    
    // 简洁元信息 + 主要内容
    const metaInfo = `${prefix}:\n\n**标题**: ${title}\n**URL**: ${url}\n\n`;
    
    // 🎯 关键修复：无论内容长度如何都返回有效输出
    if (rawContent && rawContent.length > 0) {
        // 如果内容仍然太长（超过30k），添加说明
        if (preservedContent.length > 30000) {
            const rawLength = rawContent.length.toLocaleString();
            const preservedLength = preservedContent.length.toLocaleString();
            const preservationRate = (preservedContent.length/rawContent.length*100).toFixed(1);
            
            return metaInfo + preservedContent +
                   `\n\n📊 **内容说明**: 已激进保留${preservedLength}字符（原始${rawLength}字符），保留率${preservationRate}%。\n💡 **提示**: 后续如有需要，系统会自动进行LLM智能摘要。`;
        }
        
        return metaInfo + preservedContent;
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
 * 🎯 Tavily Search 智能重试器
 * 处理500错误、网络超时等可恢复故障
 */
class TavilySearchRetryManager {
    /**
     * 判断错误是否可重试
     */
    static isRetryableError(error) {
        if (!error || !error.message) return false;
        
        const errorText = error.message.toLowerCase();
        const errorDetails = error.rawResponse?.status || error.statusCode;
        
        // ✅ 可重试的错误类型
        const retryablePatterns = [
            '500', '502', '503', '504', '429', // 服务器错误和限流
            'timeout', 'timed out', '超时',
            'network', 'fetch failed', 'connection',
            'gateway', 'service unavailable',
            'too many requests', 'rate limit'
        ];
        
        // ✅ 不可重试的错误类型（参数错误、认证失败等）
        const nonRetryablePatterns = [
            '400', '401', '403', '404', // 客户端错误
            'invalid', 'missing', 'unauthorized',
            'bad request', 'not found',
            'schema', '参数'
        ];
        
        // 检查是否是不可重试的错误
        for (const pattern of nonRetryablePatterns) {
            if (errorText.includes(pattern) || String(errorDetails).includes(pattern)) {
                console.log(`[TavilyRetry] 不可重试错误: ${pattern}`);
                return false;
            }
        }
        
        // 检查是否是可重试的错误
        for (const pattern of retryablePatterns) {
            if (errorText.includes(pattern) || String(errorDetails).includes(pattern)) {
                console.log(`[TavilyRetry] 可重试错误: ${pattern}`);
                return true;
            }
        }
        
        // 默认情况下，服务器错误(5xx)可重试，客户端错误(4xx)不可重试
        if (errorDetails >= 500 && errorDetails < 600) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 计算重试延迟（指数退避 + 抖动）
     */
    static calculateRetryDelay(attempt, baseDelay = 1000, maxDelay = 10000) {
        // 尝试 1 (快速恢复) 使用固定延迟，尝试 2/3 使用指数退避
        if (attempt === 1) {
            const fixedDelay = 2000; // 2秒固定延迟
            console.log(`[TavilyRetry] 重试 ${attempt}: 延迟 ${fixedDelay}ms (固定延迟)`);
            return fixedDelay;
        }
        
        // 指数退避：2^(attempt-1) * baseDelay
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        
        // 添加随机抖动（±20%）
        const jitter = 1 + (Math.random() * 0.4 - 0.2); // 0.8 到 1.2
        const delay = Math.min(exponentialDelay * jitter, maxDelay);
        
        console.log(`[TavilyRetry] 重试 ${attempt}: 延迟 ${Math.round(delay)}ms (指数退避)`);
        return delay;
    }
    
    /**
     * 构建重试后的改进参数
     */
    static enhanceParametersForRetry(originalParams, attempt) {
        const enhanced = { ...originalParams };
        
        // 🎯 根据重试次数调整参数
        switch (attempt) {
            case 1: // 第一次重试 (快速恢复)
                // 保持原始参数，只进行延迟
                console.log(`[TavilyRetry] 尝试 1: 使用原始参数`);
                return originalParams;
                
            case 2: // 第二次重试 (智能降级)
                // 简化查询，移除可能的问题关键词
                if (enhanced.query) {
                    enhanced.query = enhanced.query
                        .replace(/[\[\]{}()]/g, ' ') // 移除括号
                        .replace(/\s+/g, ' ') // 合并空格
                        .trim();
                }
                // 减少结果数量，降低负载
                enhanced.max_results = Math.min(enhanced.max_results || 10, 6);
                enhanced.search_depth = enhanced.search_depth === 'advanced' ? 'basic' : enhanced.search_depth; // 降级搜索深度
                console.log(`[TavilyRetry] 尝试 2: 智能降级 (max_results: ${enhanced.max_results}, search_depth: ${enhanced.search_depth})`);
                return enhanced;
                
            default:
                // 保持原参数
                return originalParams;
        }
    }
    
    /**
     * 执行智能重试
     */
    static async retryWithStrategy(toolName, originalParams, invokeFunction, maxRetries = 2) {
        console.log(`[TavilyRetry] 开始重试策略: ${toolName}, 最大重试次数: ${maxRetries}`);
        
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 计算延迟
                const delay = this.calculateRetryDelay(attempt);
                await this.sleep(delay);
                
                // 根据重试次数改进参数
                const enhancedParams = this.enhanceParametersForRetry(originalParams, attempt);
                console.log(`[TavilyRetry] 重试 ${attempt}/${maxRetries}, 参数:`, enhancedParams);
                
                // 执行重试
                const result = await invokeFunction(enhancedParams);
                
                if (result.success) {
                    console.log(`[TavilyRetry] ✅ 重试 ${attempt} 成功`);
                    return {
                        ...result,
                        retryRecovered: true,
                        originalError: "已通过自动重试机制修复",
                        retryInfo: {
                            retried: true,
                            attemptCount: attempt,
                            originalFailed: true
                        }
                    };
                }
                
                // 如果重试仍然失败，记录错误
                lastError = result.error || new Error(`重试 ${attempt} 失败`);
                
            } catch (error) {
                lastError = error;
                console.warn(`[TavilyRetry] 重试 ${attempt} 异常:`, error.message);
            }
        }
        
        // 所有重试都失败
        console.error(`[TavilyRetry] ❌ 所有重试失败 (${maxRetries}次)`);
        const lastErrorMessage = lastError?.message || '无具体错误信息';
        throw new Error(`Tavily Search 重试失败 (${maxRetries}次尝试):
- 原始错误: ${lastErrorMessage}
- 尝试了: 原参数重试 + 简化参数重试
- 建议: 检查查询关键词或考虑其他搜索策略`);
    }
    
    /**
     * 睡眠函数
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
/**
 * 🎯 通用工具结果格式化函数
 * @param {object} result - 包含 success, data, error, warnings 的结果对象
 * @param {string} toolName - 工具名称
 * @param {string} researchMode - 研究模式
 * @returns {string} 格式化后的 Markdown 字符串
 */
const formatToolResult = (result, toolName, researchMode) => {
    const { success, data, error, warnings = [] } = result;
    
    let formatted = '';
    
    // 🎯 通用状态头
    if (success) {
        formatted += `🟢 **工具执行成功** (${toolName})\n\n`;
    } else {
        formatted += `🔴 **工具执行失败** (${toolName})\n\n`;
    }
    
    // 🎯 警告信息（如果有）
    if (warnings.length > 0) {
        formatted += `⚠️ **警告**：\n`;
        warnings.forEach(warning => {
            formatted += `- ${warning}\n`;
        });
        formatted += `\n`;
    }
    
    // 🎯 错误信息（如果有）
    if (error) {
        formatted += `❌ **错误**：${error}\n\n`;
    }
    
    // 🎯 数据内容
    if (data) {
        // 添加数据摘要
        const dataLength = typeof data === 'string' ? data.length : JSON.stringify(data).length;
        const dataType = typeof data === 'string' ? '文本' : '结构化数据';
        
        formatted += `📊 **数据摘要**：${dataType} (${dataLength}字符)\n`;
        
        // 根据工具类型添加数据预览
        if (toolName === 'tavily_search') {
            formatted += `🔍 搜索结果数量：${data.count || '未知'}\n`;
        } else if (toolName === 'crawl4ai') {
            formatted += `🕸️ 抓取页面：${data.pages || '未知'}个\n`;
        } else if (toolName === 'python_sandbox') {
            formatted += `💻 代码执行：${data.executed ? '完成' : '未完成'}\n`;
        }
        
        formatted += `\n---\n\n`;
        
        // 实际数据（适当截断）
        const isDataTool = toolName === 'crawl4ai' || toolName === 'tavily_search';
        let dataPreview;

        if (isDataTool) {
            // 🎯 修复：对于核心数据获取工具，不进行截断，确保完整内容进入数据总线
            dataPreview = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        } else {
            // 对于其他工具（如 python_sandbox），进行截断以节省 Agent 上下文
            dataPreview = typeof data === 'string'
                ? data.substring(0, 1000)
                : JSON.stringify(data, null, 2).substring(0, 1000);
        }
            
        formatted += `${dataPreview}`;
        
        if (!isDataTool && ((typeof data === 'string' && data.length > 1000) ||
            (typeof data !== 'string' && JSON.stringify(data).length > 1000))) {
            formatted += `\n\n... (内容已截断，完整长度 ${dataLength} 字符)`;
        }
    }
    
    return formatted;
};

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
            'tavily_search': 45000, // ⬆️ 从 20000 增加到 45000 (45秒)
            'crawl4ai': 90000, // 🎯 修复：匹配后端单次请求的 90 秒超时
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
            const invokeFunction = async (params) => {
                const toolPromise = this.chatApiHandler.callTool(this.name, params);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`工具"${this.name}"调用超时 (${timeoutMs}ms)`)), timeoutMs);
                });
                
                let rawResult = await Promise.race([toolPromise, timeoutPromise]);

                // 🎯 关键修复：将 normalizedInput 附加到 rawResult 中，供错误处理使用
                if (rawResult && typeof rawResult === 'object') {
                    rawResult.rawParameters = params || normalizedInput;
                } else {
                    // 如果 rawResult 不是对象，创建一个包装对象
                    rawResult = {
                        output: rawResult,
                        rawParameters: params || normalizedInput
                    };
                }

                // 🎯 统一响应处理
                return DeepResearchToolAdapter.normalizeResponse(
                    this.name, rawResult, mode, researchMode
                );
            };

            let result = await invokeFunction(normalizedInput);
            
            // 🔥🔥🔥 ====================================================
            // 🎯 Tavily Search 智能重试机制
            // ====================================================
            if (this.name === 'tavily_search' && !result.success && TavilySearchRetryManager.isRetryableError(result)) {
                console.warn(`[ProxiedTool] 🔄 Tavily Search 失败，启动智能重试...`);
                
                try {
                    const maxRetries = 2; // ⬇️ 减少到 2 次重试
                    result = await TavilySearchRetryManager.retryWithStrategy(
                        this.name,
                        normalizedInput,
                        invokeFunction,
                        maxRetries
                    );
                    
                    // 🎯 检查是否通过自动重试成功 (标记已在 retryWithStrategy 中完成)
                    if (result.success && result.retryRecovered) {
                        console.log(`[ProxiedTool] ✅ Tavily Search 通过自动重试恢复成功`);
                    }
                } catch (retryError) {
                    console.error(`[ProxiedTool] ❌ Tavily Search 自动重试失败:`, retryError);
                    // 保持原始错误结果
                }
            }
            // 🔥🔥🔥 ====================================================
            
            // ============================================================
            // 🔥🔥🔥 零迭代修复：Python 导入错误自动重试 (Zero-Iteration Fix)
            // ============================================================
            if (this.name === 'python_sandbox' && !result.success) {
                const errorOutput = result.output || '';
                const code = normalizedInput.code || '';
                const missingImport = this._checkMissingImport(errorOutput);

                if (missingImport && code) {
                    console.warn(`[ProxiedTool] 🐍 检测到缺失导入: ${missingImport}，启动零迭代修复...`);
                    const fixedCode = `import ${missingImport}\n${code}`;
                    
                    // 递归调用自己，进行工具内部重试
                    const retryResult = await this.invoke({ ...normalizedInput, code: fixedCode }, context);
                    
                    if (retryResult.success) {
                        console.log(`[ProxiedTool] ✅ 零迭代修复成功，返回重试结果。`);
                        // 🎯 关键：将重试结果作为最终结果返回
                        result = retryResult;
                    } else {
                        console.warn(`[ProxiedTool] ❌ 零迭代修复失败，返回原始错误。`);
                        // 修复失败，将错误信息包装得更清晰
                        result.output = `❌ **Python 导入自动修复失败**\n\n**尝试修复**: 自动添加 \`import ${missingImport}\`\n**原始错误**: ${errorOutput}`;
                    }
                }
            }
            // ============================================================
            // 🔥🔥🔥 零迭代修复结束
            // ============================================================

            const executionTime = Date.now() - startTime;

            console.log(`[ProxiedTool] ${mode.toUpperCase()}模式工具调用完成: ${this.name}`, {
                success: result.success,
                researchMode: researchMode,
                outputLength: result.output?.length || 0,
                sourceCount: result.sources?.length || 0,
                executionTime,
                retryRecovered: result.retryRecovered || false
            });

            // 🎯 最终格式化：使用通用格式化函数包装输出
            const finalOutput = formatToolResult({
                success: result.success,
                data: result.output, // 使用已格式化的 output 作为数据内容
                error: result.error,
                warnings: result.warnings || []
            }, this.name, researchMode);

            return {
                ...result,
                output: finalOutput, // 替换为最终格式化的输出
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

            const errorResult = {
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
            
            // 🎯 最终格式化：使用通用格式化函数包装错误输出
            errorResult.output = formatToolResult({
                success: errorResult.success,
                data: errorResult.output, // 错误信息作为数据内容
                error: errorResult.error,
                warnings: errorResult.warnings || []
            }, this.name, researchMode);

            return errorResult;
        }
    }

    /**
     * 🎯 检查 Python 错误输出中是否缺失了核心导入
     */
    _checkMissingImport(errorOutput) {
        if (!errorOutput || typeof errorOutput !== 'string') return null;

        const lowerError = errorOutput.toLowerCase();
        
        // 1. 检查 NameError: name 'json' is not defined
        if (lowerError.includes("nameerror") && lowerError.includes("'json' is not defined")) {
            return 'json';
        }
        // 2. 检查 NameError: name 'pd' is not defined (pandas)
        if (lowerError.includes("nameerror") && lowerError.includes("'pd' is not defined")) {
            return 'pandas as pd';
        }
        // 3. 检查 NameError: name 'plt' is not defined (matplotlib)
        if (lowerError.includes("nameerror") && lowerError.includes("'plt' is not defined")) {
            return 'matplotlib.pyplot as plt';
        }
        // 4. 检查 NameError: name 'np' is not defined (numpy)
        if (lowerError.includes("nameerror") && lowerError.includes("'np' is not defined")) {
            return 'numpy as np';
        }
        
        return null;
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
    /**
     * 🎯 硬件感知的工具可用性检查
     */
    static getHardwareAwareToolSupport(availableMemoryGB = 3.7) {
        const supportMatrix = {
            'tavily_search': { 
                always: true, 
                notes: '搜索服务，不受本地内存影响' 
            },
            'crawl4ai': { 
                always: true,
                limitations: {
                    pdf_export: availableMemoryGB < 4 ? '降级为文本' : '完整支持',
                    deep_crawl: availableMemoryGB < 4 ? '限制页面数' : '完整支持',
                    batch_crawl: availableMemoryGB < 4 ? '限制并发数' : '完整支持'
                }
            },
            'python_sandbox': { 
                always: true,
                notes: '代码执行，内存需求取决于代码复杂度'
            }
        };
        
        return supportMatrix;
    }

    static getToolSupportForResearchModes() {
        return {
            'tavily_search': ['deep', 'business', 'academic', 'technical', 'standard'],
            'crawl4ai': ['deep', 'business', 'academic', 'technical', 'standard'],
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
            business: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            academic: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            technical: ['tavily_search', 'crawl4ai', 'python_sandbox'],
            standard: ['tavily_search', 'crawl4ai', 'python_sandbox']
        };

        const recommended = recommendations[researchMode] || recommendations.standard;
        
        // 过滤掉不可用的工具
        return recommended.filter(tool => availableTools.includes(tool));
    }
}

export { DeepResearchToolAdapter, ProxiedTool };

