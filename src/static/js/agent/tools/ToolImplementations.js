// src/static/js/agent/tools/ToolImplementations.js
import { Logger } from '../../utils/logger.js';

/**
 * 🎯 深度研究专用工具实现
 * 只保留三个核心工具：tavily_search, crawl4ai, python_sandbox
 * 其他工具在标准模式中仍然可用，但深度研究Agent只使用这三个
 */

export class ToolImplementations {
    constructor(chatApiHandler) {
        this.chatApiHandler = chatApiHandler;
        this.tools = {};
        this.initializeTools();
    }

    initializeTools() {
        console.log('🎯 初始化深度研究专用工具...');
        
        // 🎯 只初始化三个研究核心工具
        this.tools = {
            tavily_search: this._createTavilySearchTool(),
            crawl4ai: this._createCrawl4AITool(),
            python_sandbox: this._createPythonSandboxTool()
        };

        console.log('✅ 深度研究工具初始化完成:', Object.keys(this.tools));
    }

    /**
     * 🎯 Tavily 搜索工具 - 深度研究优化版
     */
    _createTavilySearchTool() {
        return {
            name: 'tavily_search',
            description: '专业的网络搜索工具，用于获取最新、最相关的信息。支持深度搜索和结果过滤。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索查询，应包含具体的关键词和上下文'
                    },
                    max_results: {
                        type: 'number',
                        description: '返回的最大结果数量 (默认: 10，最大: 20)',
                        default: 10
                    },
                    include_raw_content: {
                        type: 'boolean',
                        description: '是否包含原始内容（用于深度分析）',
                        default: true
                    },
                    search_depth: {
                        type: 'string',
                        description: '搜索深度: basic | advanced',
                        enum: ['basic', 'advanced'],
                        default: 'advanced'
                    }
                },
                required: ['query']
            },
            invoke: async (params) => {
                try {
                    const {
                        query,
                        max_results = 10,
                        include_raw_content = true,
                        search_depth = 'advanced'
                    } = params;

                    Logger.info(`[Tavily] 执行搜索: "${query}"`, params);

                    // 🎯 参数验证和优化
                    if (!query || query.trim().length === 0) {
                        throw new Error('搜索查询不能为空');
                    }

                    if (max_results > 20) {
                        Logger.warn(`[Tavily] 最大结果数 ${max_results} 超过限制，使用 20`);
                        max_results = 20;
                    }

                    // 🎯 优化搜索查询
                    const optimizedQuery = this._optimizeSearchQuery(query);
                    
                    const searchParams = {
                        query: optimizedQuery,
                        max_results: Math.min(max_results, 20),
                        include_raw_content,
                        search_depth
                    };

                    Logger.info(`[Tavily] 优化后搜索参数:`, searchParams);

                    // 🎯 通过统一的工具调用接口
                    const result = await this.chatApiHandler.callTool('tavily_search', searchParams);

                    if (!result.success) {
                        throw new Error(result.output || '搜索执行失败');
                    }

                    // 🎯 结果后处理
                    const processedResults = this._processSearchResults(result.rawResult || result.output);
                    
                    Logger.info(`[Tavily] 搜索完成，获得 ${processedResults.results?.length || 0} 个结果`);
                    
                    return {
                        success: true,
                        query: optimizedQuery,
                        ...processedResults
                    };

                } catch (error) {
                    Logger.error('[Tavily] 搜索失败:', error);
                    return {
                        success: false,
                        error: error.message,
                        query: params.query
                    };
                }
            }
        };
    }

    /**
     * 🎯 爬虫工具 - 深度研究优化版
     */
    _createCrawl4AITool() {
        return {
            name: 'crawl4ai',
            description: '智能网页爬取工具，可以提取网页的主要内容、文章、代码等。支持动态内容加载。',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '要爬取的网页URL'
                    },
                    extraction_strategy: {
                        type: 'string',
                        description: '内容提取策略',
                        enum: ['markdown', 'readable', 'raw'],
                        default: 'markdown'
                    },
                    include_links: {
                        type: 'boolean',
                        description: '是否包含链接',
                        default: true
                    },
                    word_count_threshold: {
                        type: 'number',
                        description: '内容长度阈值，超过此值将进行智能压缩',
                        default: 3000
                    }
                },
                required: ['url']
            },
            invoke: async (params) => {
                try {
                    const {
                        url,
                        extraction_strategy = 'markdown',
                        include_links = true,
                        word_count_threshold = 3000
                    } = params;

                    Logger.info(`[Crawl4AI] 开始爬取: ${url}`);

                    // 🎯 URL验证和清理
                    const cleanedUrl = this._cleanUrl(url);
                    if (!cleanedUrl) {
                        throw new Error('无效的URL');
                    }

                    const crawlParams = {
                        url: cleanedUrl,
                        extraction_strategy,
                        include_links,
                        word_count_threshold
                    };

                    const result = await this.chatApiHandler.callTool('crawl4ai', crawlParams);

                    if (!result.success) {
                        throw new Error(result.output || '爬取失败');
                    }

                    // 🎯 内容后处理
                    const processedContent = this._processCrawledContent(
                        result.rawResult || result.output, 
                        word_count_threshold
                    );

                    Logger.info(`[Crawl4AI] 爬取完成，内容长度: ${processedContent.content_length} 字符`);

                    return {
                        success: true,
                        url: cleanedUrl,
                        ...processedContent
                    };

                } catch (error) {
                    Logger.error('[Crawl4AI] 爬取失败:', error);
                    return {
                        success: false,
                        error: error.message,
                        url: params.url
                    };
                }
            }
        };
    }

    /**
     * 🎯 Python沙盒工具 - 深度研究优化版
     */
    _createPythonSandboxTool() {
        return {
            name: 'python_sandbox',
            description: '安全的Python代码执行环境，用于数据分析、计算、图表生成等研究任务。',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: '要执行的Python代码'
                    },
                    timeout: {
                        type: 'number',
                        description: '执行超时时间（秒）',
                        default: 30
                    },
                    libraries: {
                        type: 'array',
                        description: '需要导入的库',
                        items: {
                            type: 'string'
                        },
                        default: ['pandas', 'numpy', 'matplotlib', 'seaborn']
                    }
                },
                required: ['code']
            },
            invoke: async (params) => {
                try {
                    const {
                        code,
                        timeout = 30,
                        libraries = ['pandas', 'numpy', 'matplotlib', 'seaborn']
                    } = params;

                    Logger.info(`[PythonSandbox] 执行代码，长度: ${code.length} 字符`);

                    // 🎯 代码安全检查
                    const safeCode = this._validatePythonCode(code);
                    if (!safeCode.isSafe) {
                        throw new Error(`代码安全检查失败: ${safeCode.reason}`);
                    }

                    const pythonParams = {
                        code: safeCode.code,
                        timeout: Math.min(timeout, 60), // 最大60秒
                        libraries: this._filterAllowedLibraries(libraries)
                    };

                    const result = await this.chatApiHandler.callTool('python_sandbox', pythonParams);

                    if (!result.success) {
                        throw new Error(result.output || '代码执行失败');
                    }

                    // 🎯 执行结果处理
                    const processedResult = this._processPythonResult(result.rawResult || result.output);

                    Logger.info(`[PythonSandbox] 代码执行完成`);

                    return {
                        success: true,
                        execution_time: processedResult.execution_time,
                        ...processedResult
                    };

                } catch (error) {
                    Logger.error('[PythonSandbox] 执行失败:', error);
                    return {
                        success: false,
                        error: error.message,
                        code_preview: params.code.substring(0, 100) + '...'
                    };
                }
            }
        };
    }

    /**
     * 🎯 工具方法：优化搜索查询
     */
    _optimizeSearchQuery(originalQuery) {
        let query = originalQuery.trim();
        
        // 移除多余的标点
        query = query.replace(/[.,;!?]+$/, '');
        
        // 确保查询有足够的特异性
        const words = query.split(/\s+/).filter(word => word.length > 1);
        if (words.length < 2) {
            // 如果查询太短，添加研究相关后缀
            query += ' 研究 分析 最新';
        }
        
        // 限制查询长度
        if (query.length > 200) {
            query = query.substring(0, 200);
            Logger.warn(`[Tavily] 查询过长，已截断: ${query}`);
        }
        
        return query;
    }

    /**
     * 🎯 工具方法：处理搜索结果
     */
    _processSearchResults(rawResults) {
        try {
            if (!rawResults) {
                return { results: [], total_count: 0 };
            }

            let results = [];
            
            // 🎯 处理不同的结果格式
            if (Array.isArray(rawResults)) {
                results = rawResults;
            } else if (rawResults.results && Array.isArray(rawResults.results)) {
                results = rawResults.results;
            } else if (rawResults.answer) {
                // 如果是直接答案格式
                results = [{
                    title: '直接答案',
                    content: rawResults.answer,
                    url: '',
                    score: 1.0
                }];
            }

            // 🎯 结果去重和排序
            const uniqueResults = this._deduplicateResults(results);
            const sortedResults = uniqueResults.sort((a, b) => (b.score || 0) - (a.score || 0));

            // 🎯 内容压缩和清理
            const processedResults = sortedResults.map((result, index) => ({
                id: `result_${index + 1}`,
                title: result.title || '无标题',
                url: result.url || '',
                content: this._compressContent(result.content || result.raw_content || '', 500),
                full_content: result.content || result.raw_content || '',
                score: result.score || 0.5,
                published_date: result.published_date || null,
                source: result.source || '未知来源'
            }));

            return {
                results: processedResults,
                total_count: processedResults.length,
                search_time: rawResults.search_time || Date.now()
            };

        } catch (error) {
            Logger.error('[ToolImplementations] 搜索结果处理失败:', error);
            return {
                results: [],
                total_count: 0,
                processing_error: error.message
            };
        }
    }

    /**
     * 🎯 工具方法：搜索结果去重
     */
    _deduplicateResults(results) {
        const seenUrls = new Set();
        const seenContent = new Set();
        const uniqueResults = [];

        for (const result of results) {
            const url = result.url || '';
            const content = result.content || result.raw_content || '';
            
            // 🎯 基于URL和内容相似度的去重
            const contentHash = this._generateContentHash(content.substring(0, 200));
            
            if (!url || (!seenUrls.has(url) && !seenContent.has(contentHash))) {
                seenUrls.add(url);
                seenContent.add(contentHash);
                uniqueResults.push(result);
            }
        }

        Logger.info(`[ToolImplementations] 去重: ${results.length} -> ${uniqueResults.length}`);
        return uniqueResults;
    }

    /**
     * 🎯 工具方法：内容压缩
     */
    _compressContent(content, maxLength = 500) {
        if (!content || content.length <= maxLength) {
            return content || '';
        }

        // 🎯 智能压缩：保留开头和关键信息
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        
        if (sentences.length <= 3) {
            return content.substring(0, maxLength) + '...';
        }

        // 取第一句、中间一句和最后一句
        const compressed = [
            sentences[0],
            sentences[Math.floor(sentences.length / 2)],
            sentences[sentences.length - 1]
        ].join('. ') + '.';

        return compressed.length > maxLength ? 
            compressed.substring(0, maxLength) + '...' : compressed;
    }

    /**
     * 🎯 工具方法：URL清理
     */
    _cleanUrl(url) {
        try {
            const cleaned = url.trim();
            if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
                return 'https://' + cleaned;
            }
            return cleaned;
        } catch (error) {
            Logger.error('[ToolImplementations] URL清理失败:', error);
            return null;
        }
    }

    /**
     * 🎯 工具方法：处理爬取内容
     */
    _processCrawledContent(rawContent, wordThreshold = 3000) {
        try {
            let content = '';
            let title = '';
            let wordCount = 0;

            // 🎯 处理不同的内容格式
            if (typeof rawContent === 'string') {
                content = rawContent;
            } else if (rawContent.content) {
                content = rawContent.content;
                title = rawContent.title || '';
            } else if (rawContent.markdown) {
                content = rawContent.markdown;
                title = rawContent.title || '';
            }

            // 🎯 计算字数
            wordCount = content.split(/\s+/).length;

            // 🎯 内容压缩（如果超过阈值）
            let compressedContent = content;
            let compression_ratio = 1.0;
            
            if (wordCount > wordThreshold) {
                compressedContent = this._compressContent(content, 2000);
                compression_ratio = compressedContent.length / content.length;
                Logger.info(`[ToolImplementations] 内容压缩: ${wordCount} -> ${compressedContent.split(/\s+/).length} 词 (${(compression_ratio * 100).toFixed(1)}%)`);
            }

            // 🎯 提取关键信息
            const keyPoints = this._extractKeyPoints(content, 5);

            return {
                content: compressedContent,
                original_content_length: content.length,
                content_length: compressedContent.length,
                word_count: wordCount,
                compression_ratio,
                title: title || this._extractTitle(content),
                key_points: keyPoints,
                has_compressed: compression_ratio < 0.8
            };

        } catch (error) {
            Logger.error('[ToolImplementations] 爬取内容处理失败:', error);
            return {
                content: '内容处理失败: ' + error.message,
                content_length: 0,
                word_count: 0,
                compression_ratio: 1.0,
                title: '处理失败',
                key_points: [],
                has_compressed: false
            };
        }
    }

    /**
     * 🎯 工具方法：提取标题
     */
    _extractTitle(content) {
        if (!content) return '无标题';
        
        // 尝试从内容中提取标题
        const lines = content.split('\n').filter(line => line.trim().length > 10);
        if (lines.length > 0) {
            return lines[0].substring(0, 100);
        }
        
        return '无标题';
    }

    /**
     * 🎯 工具方法：提取关键点
     */
    _extractKeyPoints(content, maxPoints = 5) {
        if (!content) return [];
        
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        return sentences.slice(0, maxPoints).map(s => s.trim());
    }

    /**
     * 🎯 工具方法：Python代码验证
     */
    _validatePythonCode(code) {
        const forbiddenPatterns = [
            /__import__/,
            /eval\(/,
            /exec\(/,
            /compile\(/,
            /open\([^)]*[wax]+/,
            /import\s+os/,
            /import\s+sys/,
            /import\s+subprocess/,
            /import\s+shutil/,
            /import\s+socket/,
            /\.connect\(/,
            /requests\.(get|post|put|delete)/,
            /urllib\.request/,
            /input\(/
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(code)) {
                return {
                    isSafe: false,
                    reason: `检测到不安全代码模式: ${pattern}`
                };
            }
        }

        // 🎯 代码长度限制
        if (code.length > 5000) {
            return {
                isSafe: false,
                reason: '代码过长（超过5000字符）'
            };
        }

        return {
            isSafe: true,
            code: code
        };
    }

    /**
     * 🎯 工具方法：过滤允许的Python库
     */
    _filterAllowedLibraries(requestedLibraries) {
        const allowedLibraries = [
            'pandas', 'numpy', 'matplotlib', 'seaborn', 'plotly',
            'scipy', 'sklearn', 'statistics', 'math', 'json',
            'datetime', 're', 'collections', 'itertools'
        ];

        return requestedLibraries.filter(lib => 
            allowedLibraries.includes(lib.toLowerCase())
        );
    }

    /**
     * 🎯 工具方法：处理Python执行结果
     */
    _processPythonResult(rawResult) {
        try {
            let stdout = '';
            let stderr = '';
            let execution_time = 0;

            // 🎯 处理不同的结果格式
            if (typeof rawResult === 'string') {
                stdout = rawResult;
            } else if (rawResult.stdout) {
                stdout = rawResult.stdout;
                stderr = rawResult.stderr || '';
                execution_time = rawResult.execution_time || 0;
            } else if (rawResult.output) {
                stdout = rawResult.output;
            }

            // 🎯 检测图表输出
            const hasChart = stdout.includes('matplotlib') || 
                           stdout.includes('seaborn') || 
                           stdout.includes('plotly');

            // 🎯 检测数据分析输出
            const hasDataAnalysis = stdout.includes('pandas') || 
                                  stdout.includes('DataFrame') || 
                                  stdout.includes('describe()');

            return {
                stdout: this._truncateLongOutput(stdout, 2000),
                stderr: stderr,
                execution_time,
                has_chart: hasChart,
                has_data_analysis: hasDataAnalysis,
                output_type: this._detectOutputType(stdout)
            };

        } catch (error) {
            Logger.error('[ToolImplementations] Python结果处理失败:', error);
            return {
                stdout: '结果处理失败: ' + error.message,
                stderr: '',
                execution_time: 0,
                has_chart: false,
                has_data_analysis: false,
                output_type: 'error'
            };
        }
    }

    /**
     * 🎯 工具方法：截断长输出
     */
    _truncateLongOutput(output, maxLength = 2000) {
        if (!output || output.length <= maxLength) {
            return output || '';
        }
        
        return output.substring(0, maxLength) + `\n... [输出已截断，共 ${output.length} 字符]`;
    }

    /**
     * 🎯 工具方法：检测输出类型
     */
    _detectOutputType(output) {
        if (!output) return 'empty';
        
        if (output.includes('Figure') || output.includes('plot')) {
            return 'chart';
        } else if (output.includes('DataFrame') || output.includes('describe()')) {
            return 'data_analysis';
        } else if (output.includes('http') || output.includes('www.')) {
            return 'urls';
        } else if (output.length > 500) {
            return 'long_text';
        } else {
            return 'text';
        }
    }

    /**
     * 🎯 工具方法：生成内容哈希（用于去重）
     */
    _generateContentHash(content) {
        // 简单的哈希函数，用于内容去重
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * 🎯 获取所有工具声明（用于模型调用）
     */
    getToolDeclarations() {
        return Object.values(this.tools).map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    /**
     * 🎯 获取工具实例
     */
    getToolInstance(toolName) {
        return this.tools[toolName];
    }

    /**
     * 🎯 检查工具是否存在
     */
    hasTool(toolName) {
        return !!this.tools[toolName];
    }

    /**
     * 🎯 获取所有可用工具名称
     */
    getAvailableTools() {
        return Object.keys(this.tools);
    }

    /**
     * 🎯 深度研究专用工具列表
     */
    getResearchTools() {
        return {
            tavily_search: this.tools.tavily_search,
            crawl4ai: this.tools.crawl4ai,
            python_sandbox: this.tools.python_sandbox
        };
    }
}

export default ToolImplementations;