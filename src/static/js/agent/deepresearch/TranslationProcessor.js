// src/static/js/agent/deepresearch/TranslationProcessor.js
// 🎯 网站翻译专用处理器 - 两次调用优化版

// 导入OutputParser
import { AgentOutputParser } from './OutputParser.js';

export class TranslationProcessor {
    constructor({
        chatApiHandler,
        tools,
        callbackManager,
        skillManager,
        config = {}
    }) {
        this.chatApiHandler = chatApiHandler;
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.skillManager = skillManager;
        
        // 🎯 初始化OutputParser用于健壮的JSON解析
        this.outputParser = new AgentOutputParser();
        
        // 🎯 模型配置
        this.model = config.model || 'gemini-2.5-flash-preview-09-2025';
        this.temperature = {
            translation: 0.1,      // 低温翻译，保证准确性
            formatting: 0.2        // 稍高温格式化和审查
        };
        
        // 🎯 抓取配置
        this.scrapeConfig = {
            mode: 'scrape',
            parameters: {
                url: '',
                include_raw_html: true,
                extract_tables: true,
                extract_images_alt: true,
                include_links: true,
                include_images: true,
                timeout: 30000,
                max_retries: 2,
                wait_for: 1000,
                js_render: false,
                bypass_cache: true,
                word_count_threshold: 5
            }
        };
        
        // 🎯 翻译分块配置
        this.chunkConfig = {
            maxCharsPerChunk: 15000,
            maxTokensEstimate: 7000,
            minParagraphsPerChunk: 1,
            maxParagraphsPerChunk: 30
        };
        
        // 🎯 处理状态
        this.runId = null;
        this.currentUrl = null;
        this.processingSteps = [];
        
        console.log('[TranslationProcessor] ✅ 初始化完成，模型:', this.model);
    }
    
    /**
     * 🎯 主入口：处理网站翻译
     */
    async processWebsite(request) {
        const {
            url,
            targetLanguage = 'zh-CN',
            userInstruction = ''
        } = request;
        
        this.currentUrl = url;
        this.runId = this.callbackManager.generateRunId();
        
        console.log(`[TranslationProcessor] 🚀 开始翻译: ${url}`);
        
        try {
            // 🎯 触发开始事件
            await this._fireStartEvent(url);
            
            // 🎯 执行两次调用流程
            const result = await this._executeTwoPassPipeline({
                url,
                targetLanguage,
                userInstruction
            });
            
            // 🎯 触发完成事件
            await this._fireCompleteEvent(result);
            
            return {
                success: true,
                runId: this.runId,
                url,
                content: result.finalContent,
                metadata: result.metadata,
                stats: result.stats
            };
            
        } catch (error) {
            console.error('[TranslationProcessor] ❌ 处理失败:', error);
            return this._handleFailure(error);
        }
    }
    
    /**
     * 🎯 两次调用流程
     */
    async _executeTwoPassPipeline(params) {
        const { url, targetLanguage, userInstruction } = params;
        
        console.log('[TranslationProcessor] 🎯 第1次调用：抓取和结构分析');
        
        // 🎯 步骤1：抓取并分析网页结构
        const structureAnalysis = await this._step1_analyzeStructure(url);
        
        console.log('[TranslationProcessor] 🎯 第2次调用：翻译和格式化');
        
        // 🎯 步骤2：结构化翻译和格式化
        const finalContent = await this._step2_translateAndFormat(structureAnalysis, targetLanguage, userInstruction);
        
        return {
            url,
            structureAnalysis,
            finalContent,
            metadata: this._buildMetadata(structureAnalysis),
            stats: this._calculateStats(structureAnalysis, finalContent)
        };
    }
    
    // ============================================
    // 🎯 步骤1：分析网页结构
    // ============================================
    
    async _step1_analyzeStructure(url) {
        await this._recordStep('analysis_start', { url });
        
        const tool = this.tools['crawl4ai'];
        if (!tool) throw new Error('crawl4ai工具不可用');
        
        // 🎯 使用 crawl4ai 抓取网页
        this.scrapeConfig.parameters.url = url;
        
        try {
            const result = await tool.invoke(this.scrapeConfig, {
                mode: 'website_translation',
                researchMode: 'structure_analysis'
            });
            
            if (!result.success) {
                throw new Error(`抓取失败: ${result.error || result.output || '未知错误'}`);
            }
            
            // 🎯 解析返回数据
            let scrapedData;
            try {
                scrapedData = JSON.parse(result.output);
            } catch (e) {
                scrapedData = { content: result.output };
            }
            
            // 🎯 获取完整HTML内容
            const htmlContent = scrapedData.cleaned_html || scrapedData.content || '';
            
            // 🎯 提取结构化信息
            const structure = this._extractPageStructure(htmlContent);
            
            await this._recordStep('analysis_complete', {
                titleLength: structure.title.length,
                paragraphs: structure.paragraphs.length,
                images: structure.images.length,
                tables: structure.tables.length,
                codeBlocks: structure.codeBlocks.length
            });
            
            return {
                url,
                html: htmlContent,
                ...structure,
                rawData: scrapedData
            };
            
        } catch (error) {
            throw new Error(`网页结构分析失败: ${error.message}`);
        }
    }
    
    /**
     * 🎯 提取网页结构
     */
    _extractPageStructure(html) {
        if (!html) {
            return {
                title: '',
                paragraphs: [],
                images: [],
                tables: [],
                codeBlocks: [],
                structure: []
            };
        }
        
        // 1. 提取标题
        const title = this._extractTitle(html);
        
        // 2. 提取图片
        const images = this._extractImagesWithContext(html);
        
        // 3. 提取表格
        const tables = this._extractTablesWithContext(html);
        
        // 4. 提取代码块
        const codeBlocks = this._extractCodeBlocks(html);
        
        // 5. 提取段落并插入占位符
        const { paragraphs, structure } = this._extractParagraphsWithPlaceholders(
            html, 
            images, 
            tables, 
            codeBlocks
        );
        
        return {
            title,
            paragraphs,
            images,
            tables,
            codeBlocks,
            structure
        };
    }
    
    /**
     * 🎯 提取带占位符的段落
     */
    _extractParagraphsWithPlaceholders(html, images, tables, codeBlocks) {
        // 创建占位符映射
        let processedHtml = html;
        const structure = [];
        const paragraphs = [];
        let paragraphIndex = 0;
        
        // 1. 用占位符替换代码块
        codeBlocks.forEach((block, index) => {
            const placeholder = `[CODE_BLOCK_${index + 1}]`;
            const escapedContent = block.content.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`<pre[^>]*>[\\s\\S]*?${escapedContent}[\\s\\S]*?</pre>`, 'i');
            processedHtml = processedHtml.replace(regex, placeholder);
            
            structure.push({
                type: 'code',
                index: index,
                placeholder: placeholder,
                data: block
            });
        });
        
        // 2. 用占位符替换图片
        images.forEach((img, index) => {
            const placeholder = `[IMAGE_${index + 1}]`;
            const imgTag = `<img[^>]+src=["']${this._escapeRegExp(img.src)}["'][^>]*>`;
            const regex = new RegExp(imgTag, 'i');
            processedHtml = processedHtml.replace(regex, placeholder);
            
            structure.push({
                type: 'image',
                index: index,
                placeholder: placeholder,
                data: img
            });
        });
        
        // 3. 用占位符替换表格
        tables.forEach((table, index) => {
            const placeholder = `[TABLE_${index + 1}]`;
            const tableHtml = table.html.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(tableHtml, 'i');
            processedHtml = processedHtml.replace(regex, placeholder);
            
            structure.push({
                type: 'table',
                index: index,
                placeholder: placeholder,
                data: table
            });
        });
        
        // 4. 清理HTML标签，提取段落
        let text = processedHtml.replace(/<[^>]+>/g, '\n');
        text = text.replace(/\n+/g, '\n').trim();
        
        // 5. 按行分割，过滤无用内容
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => {
                const lineLength = line.length;
                return lineLength > 15 &&
                    !line.startsWith('http') &&
                    !line.match(/^[0-9\s]*$/) &&
                    !line.includes('@') &&
                    !line.toLowerCase().includes('skip to') &&
                    !line.toLowerCase().includes('jump to') &&
                    !line.toLowerCase().includes('menu') &&
                    !line.toLowerCase().includes('navigation');
            });
        
        // 6. 合并相邻短行
        const mergedLines = [];
        let currentLine = '';
        
        for (const line of lines) {
            // 检查是否是占位符
            if (line.match(/\[(CODE_BLOCK|IMAGE|TABLE)_\d+\]/)) {
                if (currentLine) {
                    mergedLines.push(currentLine);
                    currentLine = '';
                }
                mergedLines.push(line);
            } else if (line.length < 80 && currentLine.length < 200) {
                currentLine = currentLine ? `${currentLine} ${line}` : line;
            } else {
                if (currentLine) {
                    mergedLines.push(currentLine);
                }
                currentLine = line;
            }
        }
        
        if (currentLine) {
            mergedLines.push(currentLine);
        }
        
        // 7. 构建段落数组
        mergedLines.forEach((content, index) => {
            paragraphs.push({
                content,
                index: paragraphIndex++,
                hasPlaceholder: content.match(/\[(CODE_BLOCK|IMAGE|TABLE)_\d+\]/) !== null
            });
        });
        
        return { paragraphs, structure };
    }
    
    /**
     * 🎯 转义正则表达式特殊字符
     */
    _escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // ============================================
    // 🎯 步骤2：翻译和格式化
    // ============================================
    
    async _step2_translateAndFormat(structureAnalysis, targetLanguage, userInstruction) {
        await this._recordStep('translation_start', { targetLanguage });
        
        try {
            const { title, paragraphs, structure } = structureAnalysis;
            
            console.log('[TranslationProcessor] 开始翻译和格式化...');
            
            // 🎯 检查是否需要分块
            const totalChars = paragraphs.reduce((sum, p) => sum + p.content.length, 0);
            const totalTokensEstimate = Math.ceil(totalChars / 2);
            
            console.log(`[TranslationProcessor] 内容统计: ${totalChars}字符, 约${totalTokensEstimate}token`);
            
            let translatedContent;
            
            if (totalTokensEstimate > this.chunkConfig.maxTokensEstimate && paragraphs.length > 5) {
                // 🎯 分块翻译
                translatedContent = await this._chunkedTranslationWithFormatting({
                    title,
                    paragraphs,
                    structure,
                    targetLanguage,
                    userInstruction
                });
            } else {
                // 🎯 单次完整翻译
                translatedContent = await this._singleTranslationWithFormatting({
                    title,
                    paragraphs,
                    structure,
                    targetLanguage,
                    userInstruction
                });
            }
            
            await this._recordStep('translation_complete', {
                contentLength: translatedContent.length
            });
            
            return translatedContent;
            
        } catch (error) {
            console.error('[TranslationProcessor] ❌ 翻译格式化失败:', error);
            throw new Error(`翻译格式化失败: ${error.message}`);
        }
    }
    
    /**
     * 🎯 单次完整翻译（带格式化）
     */
    async _singleTranslationWithFormatting(data) {
        const { title, paragraphs, structure, targetLanguage, userInstruction } = data;
        
        // 🎯 构建完整的结构化内容
        const fullContent = this._buildStructuredContent(title, paragraphs, structure);
        
        const prompt = this._buildFormattingPrompt({
            title,
            fullContent,
            structure,
            targetLanguage,
            userInstruction
        });
        
        console.log(`[TranslationProcessor] 格式化提示词长度: ${prompt.length} 字符`);
        
        // 🎯 调用翻译API
        const response = await this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: prompt }],
            model: this.model,
            temperature: this.temperature.formatting
        });
        
        const contentStr = response?.choices?.[0]?.message?.content;
        if (!contentStr) throw new Error('翻译返回为空');
        
        // 🎯 清理和验证结果
        const cleanedContent = this._cleanTranslationResult(contentStr);
        
        console.log(`[TranslationProcessor] ✅ 翻译格式化完成，长度: ${cleanedContent.length} 字符`);
        
        return cleanedContent;
    }
    
    /**
     * 🎯 分块翻译（带格式化）
     */
    async _chunkedTranslationWithFormatting(data) {
        const { title, paragraphs, structure, targetLanguage, userInstruction } = data;
        
        // 🎯 智能分块（保持占位符完整）
        const chunks = this._createStructureAwareChunks(paragraphs);
        console.log(`[TranslationProcessor] 分割为 ${chunks.length} 个分块进行翻译`);
        
        let translatedTitle = title;
        const allTranslatedParagraphs = [];
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirstChunk = i === 0;
            
            console.log(`[TranslationProcessor] 处理分块 ${i + 1}/${chunks.length}`);
            
            try {
                // 🎯 构建当前分块的结构化内容
                const chunkStructure = this._filterStructureForChunk(structure, chunk);
                const chunkContent = this._buildStructuredContent(
                    isFirstChunk ? title : null,
                    chunk.paragraphs,
                    chunkStructure
                );
                
                const prompt = this._buildFormattingPrompt({
                    title: isFirstChunk ? title : null,
                    fullContent: chunkContent,
                    structure: chunkStructure,
                    targetLanguage,
                    userInstruction,
                    isChunked: true,
                    chunkIndex: i,
                    totalChunks: chunks.length
                });
                
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: prompt }],
                    model: this.model,
                    temperature: this.temperature.formatting
                });
                
                const contentStr = response?.choices?.[0]?.message?.content;
                if (!contentStr) {
                    throw new Error(`分块 ${i + 1} 翻译返回为空`);
                }
                
                // 🎯 解析返回内容
                const chunkResult = this._parseChunkResult(contentStr);
                
                // 🎯 保存标题（如果是第一块）
                if (isFirstChunk && chunkResult.title) {
                    translatedTitle = chunkResult.title;
                }
                
                // 🎯 合并翻译的段落
                if (chunkResult.paragraphs && Array.isArray(chunkResult.paragraphs)) {
                    const translatedWithIndices = chunkResult.paragraphs.map(p => ({
                        ...p,
                        index: chunk.startIndex + p.index
                    }));
                    allTranslatedParagraphs.push(...translatedWithIndices);
                }
                
                console.log(`[TranslationProcessor] ✅ 分块 ${i + 1}/${chunks.length} 完成`);
                
            } catch (error) {
                console.error(`[TranslationProcessor] ❌ 分块 ${i + 1} 翻译失败:`, error.message);
                
                // 🎯 降级方案：保留原文
                const fallbackParagraphs = chunk.paragraphs.map(p => ({
                    original: p.content,
                    translated: p.content,
                    index: p.index,
                    is_fallback: true
                }));
                allTranslatedParagraphs.push(...fallbackParagraphs);
            }
            
            // 🎯 添加延迟
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // 🎯 排序和合并
        const sortedParagraphs = allTranslatedParagraphs.sort((a, b) => a.index - b.index);
        
        // 🎯 重建完整内容
        const finalContent = this._reconstructFinalContent(
            translatedTitle,
            sortedParagraphs,
            structure
        );
        
        console.log(`[TranslationProcessor] 分块翻译完成，总长度: ${finalContent.length} 字符`);
        
        return finalContent;
    }
    
    /**
     * 🎯 构建结构化内容
     */
    _buildStructuredContent(title, paragraphs, structure) {
        let content = '';
        
        if (title) {
            content += `# 标题\n${title}\n\n`;
        }
        
        content += `## 正文内容\n\n`;
        
        // 按段落添加，如果有占位符则标记
        paragraphs.forEach((para, index) => {
            content += `段落 ${index}:\n${para.content}\n\n`;
        });
        
        if (structure && structure.length > 0) {
            content += `## 页面结构元素\n\n`;
            
            structure.forEach(item => {
                if (item.type === 'image') {
                    content += `图片 ${item.index + 1}: [${item.data.alt || '图片'}](${item.data.src})\n`;
                } else if (item.type === 'table') {
                    content += `表格 ${item.index + 1}: ${item.data.title || '未命名表格'}\n`;
                } else if (item.type === 'code') {
                    content += `代码块 ${item.index + 1} (${item.data.language}):\n\`\`\`${item.data.language}\n${item.data.content.substring(0, 200)}...\n\`\`\`\n`;
                }
            });
        }
        
        return content;
    }
    
    /**
     * 🎯 构建格式化提示词
     */
    _buildFormattingPrompt(data) {
        const { 
            title, 
            fullContent, 
            structure, 
            targetLanguage, 
            userInstruction,
            isChunked = false,
            chunkIndex = 0,
            totalChunks = 1
        } = data;
        
        const chunkInfo = isChunked ? `（第 ${chunkIndex + 1} 部分，共 ${totalChunks} 部分）` : '';
        
        return `# 🎯 网页翻译与格式化任务${chunkInfo}

## 📋 任务说明
你是一位专业的网站翻译专家。请将以下结构化网页内容翻译成${targetLanguage}，并输出格式良好的完整文档。

## 🌐 目标语言: ${targetLanguage}

## 📝 原文结构
${fullContent}

${userInstruction ? `## 📝 用户特别要求
${userInstruction}

` : ''}

## 🚫 绝对禁止
1. 不要添加任何个人观点、评论或分析
2. 不要修改原文的事实信息
3. 不要遗漏任何内容
4. 保持原文的结构和格式

## 📤 输出要求
请输出完整的翻译文档，包含以下部分：

1. **标题翻译**（如果提供）
2. **正文内容**：将段落翻译成中文，保持原有的段落结构
3. **图片处理**：将图片占位符 [IMAGE_N] 转换为 Markdown 格式：![图片描述](图片URL)
4. **表格处理**：将表格占位符 [TABLE_N] 转换为格式良好的 Markdown 表格
5. **代码块**：保持代码块原样，仅翻译注释（如果有）
6. **格式**：使用恰当的 Markdown 格式（标题、列表、加粗等）

## 💡 重要规则
- 图片描述：尽量保持原描述，若无描述可写"相关图片"
- 表格：如果原文有表格标题，请保留
- 代码块：绝对不要翻译代码内容，只翻译注释
- 链接：保持原链接不变

## 📋 可用元素信息
${structure && structure.length > 0 ? structure.map(item => {
    if (item.type === 'image') {
        return `- 图片 ${item.index + 1}: URL=${item.data.src}, 描述="${item.data.alt || '无描述'}"`;
    } else if (item.type === 'table') {
        return `- 表格 ${item.index + 1}: 标题="${item.data.title || '未命名'}"`;
    } else if (item.type === 'code') {
        return `- 代码块 ${item.index + 1}: 语言=${item.data.language}, 长度=${item.data.content.length}字符`;
    }
    return '';
}).filter(Boolean).join('\n') : '无特殊元素'}

现在，请开始翻译并格式化：`;
    }
    
    // ============================================
    // 🎯 辅助方法
    // ============================================
    
    /**
     * 🎯 清理翻译结果
     */
    _cleanTranslationResult(content) {
        // 移除可能的多余标记
        let cleaned = content.trim();
        
        // 移除JSON标记（如果有）
        cleaned = cleaned.replace(/^```(json|markdown)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/i, '');
        
        // 移除多余的空行
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        return cleaned;
    }
    
    /**
     * 🎯 智能分块（保持结构）
     */
    _createStructureAwareChunks(paragraphs) {
        const chunks = [];
        let currentChunk = [];
        let currentCharCount = 0;
        let startIndex = 0;
        
        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];
            const paragraphChars = paragraph.content.length;
            
            // 检查是否需要创建新分块
            const shouldCreateNewChunk = 
                (currentCharCount + paragraphChars > this.chunkConfig.maxCharsPerChunk && currentChunk.length > 0) ||
                (currentChunk.length >= this.chunkConfig.maxParagraphsPerChunk);
            
            if (shouldCreateNewChunk) {
                chunks.push({
                    paragraphs: currentChunk,
                    startIndex: startIndex,
                    charCount: currentCharCount
                });
                
                currentChunk = [];
                currentCharCount = 0;
                startIndex = i;
            }
            
            currentChunk.push(paragraph);
            currentCharCount += paragraphChars;
        }
        
        // 添加最后一个分块
        if (currentChunk.length > 0) {
            chunks.push({
                paragraphs: currentChunk,
                startIndex: startIndex,
                charCount: currentCharCount
            });
        }
        
        return chunks;
    }
    
    /**
     * 🎯 为分块过滤结构元素
     */
    _filterStructureForChunk(structure, chunk) {
        if (!structure || !chunk) return [];
        
        // 收集分块中的所有占位符
        const chunkPlaceholders = new Set();
        chunk.paragraphs.forEach(p => {
            const matches = p.content.match(/\[(IMAGE|TABLE|CODE_BLOCK)_\d+\]/g);
            if (matches) {
                matches.forEach(match => chunkPlaceholders.add(match));
            }
        });
        
        // 过滤相关的结构元素
        return structure.filter(item => 
            chunkPlaceholders.has(item.placeholder)
        );
    }
    
    /**
     * 🎯 解析分块结果
     */
    _parseChunkResult(contentStr) {
        try {
            const cleaned = contentStr.trim();
            
            // 尝试解析为JSON
            try {
                const data = JSON.parse(cleaned);
                return data;
            } catch (e) {
                // 如果不是JSON，尝试提取结构
                const lines = cleaned.split('\n');
                let title = null;
                const paragraphs = [];
                let currentParagraph = null;
                
                lines.forEach(line => {
                    line = line.trim();
                    if (!line) return;
                    
                    // 提取标题
                    if (line.startsWith('# ')) {
                        title = line.substring(2).trim();
                    }
                    // 提取段落
                    else if (line.match(/^段落\s+\d+:/)) {
                        if (currentParagraph) {
                            paragraphs.push(currentParagraph);
                        }
                        const match = line.match(/^段落\s+(\d+):/);
                        currentParagraph = {
                            index: parseInt(match[1]),
                            original: '',
                            translated: line.substring(match[0].length).trim()
                        };
                    }
                    // 继续段落
                    else if (currentParagraph) {
                        currentParagraph.translated += '\n' + line;
                    }
                });
                
                if (currentParagraph) {
                    paragraphs.push(currentParagraph);
                }
                
                return { title, paragraphs };
            }
        } catch (error) {
            console.warn('[TranslationProcessor] 分块结果解析失败:', error);
            return { title: null, paragraphs: [] };
        }
    }
    
    /**
     * 🎯 重建最终内容
     */
    _reconstructFinalContent(title, translatedParagraphs, structure) {
        let finalContent = '';
        
        // 添加标题
        if (title) {
            finalContent += `# ${title}\n\n`;
        }
        
        // 按段落顺序添加
        translatedParagraphs.forEach(para => {
            let content = para.translated || para.original;
            
            // 替换占位符
            if (structure) {
                structure.forEach(item => {
                    if (content.includes(item.placeholder)) {
                        if (item.type === 'image') {
                            const replacement = `![${item.data.alt || '图片'}](${item.data.src})`;
                            content = content.replace(item.placeholder, replacement);
                        } else if (item.type === 'table') {
                            const replacement = this._formatTableForOutput(item.data);
                            content = content.replace(item.placeholder, replacement);
                        } else if (item.type === 'code') {
                            const replacement = `\`\`\`${item.data.language}\n${item.data.content}\n\`\`\``;
                            content = content.replace(item.placeholder, replacement);
                        }
                    }
                });
            }
            
            finalContent += `${content}\n\n`;
        });
        
        return finalContent;
    }
    
    /**
     * 🎯 格式化表格输出
     */
    _formatTableForOutput(table) {
        let output = `### ${table.title || '表格'}\n\n`;
        
        if (table.markdown) {
            output += table.markdown;
        } else if (table.rows && table.rows.length > 0) {
            output += '| ' + table.rows[0].join(' | ') + ' |\n';
            output += '| ' + table.rows[0].map(() => '---').join(' | ') + ' |\n';
            
            for (let i = 1; i < table.rows.length; i++) {
                output += '| ' + table.rows[i].join(' | ') + ' |\n';
            }
        } else {
            output += '*(表格内容)*\n';
        }
        
        return output;
    }
    
    /**
     * 🎯 提取标题
     */
    _extractTitle(html) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) return titleMatch[1].trim();
        
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (h1Match) return h1Match[1].trim();
        
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogTitleMatch) return ogTitleMatch[1].trim();
        
        return '';
    }
    
    /**
     * 🎯 提取带上下文的图片
     */
    _extractImagesWithContext(html) {
        const images = [];
        const imgRegex = /<img[^>]+>/gi;
        
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            const imgTag = match[0];
            const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
            const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
            const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
            
            images.push({
                src: srcMatch ? srcMatch[1] : '',
                alt: altMatch ? altMatch[1] : (titleMatch ? titleMatch[1] : ''),
                title: titleMatch ? titleMatch[1] : '',
                position: match.index
            });
        }
        
        return images;
    }
    
    /**
     * 🎯 提取带上下文的表格
     */
    _extractTablesWithContext(html) {
        const tables = [];
        const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
        
        let match;
        while ((match = tableRegex.exec(html)) !== null) {
            const tableHtml = match[0];
            
            // 提取标题
            const captionMatch = tableHtml.match(/<caption[^>]*>([^<]+)<\/caption>/i);
            const title = captionMatch ? captionMatch[1].trim() : '';
            
            // 提取行数据
            const rows = this._extractTableRows(tableHtml);
            
            // 转换为Markdown
            const markdownTable = this._htmlTableToMarkdown(tableHtml);
            
            tables.push({
                title,
                html: tableHtml,
                markdown: markdownTable,
                rows: rows,
                position: match.index
            });
        }
        
        return tables;
    }
    
    /**
     * 🎯 提取代码块
     */
    _extractCodeBlocks(html) {
        const codeBlocks = [];
        const codeRegex = /<pre[^>]*>[\s\S]*?<\/pre>/gi;
        let match;
        let count = 0;
        
        while ((match = codeRegex.exec(html)) !== null) {
            count++;
            const codeHtml = match[0];
            
            // 尝试提取语言类型
            const langMatch = codeHtml.match(/class=["'][^"']*lang(?:uage)?-([^"'\s]+)/i);
            const language = langMatch ? langMatch[1] : 'plaintext';
            
            // 提取代码内容
            let codeContent = codeHtml.replace(/<\/?pre[^>]*>/gi, '');
            codeContent = codeContent.replace(/<\/?code[^>]*>/gi, '').trim();
            
            codeBlocks.push({
                id: `CODE_BLOCK_${count}`,
                language: language,
                content: codeContent.substring(0, 5000),
                html: codeHtml,
                position: match.index
            });
        }
        
        return codeBlocks;
    }
    
    /**
     * 🎯 HTML表格转Markdown
     */
    _htmlTableToMarkdown(html) {
        const rows = this._extractTableRows(html);
        if (rows.length === 0) return null;
        
        let markdown = '';
        
        // 表头
        if (rows[0]) {
            markdown += `| ${rows[0].join(' | ')} |\n`;
            markdown += `| ${rows[0].map(() => '---').join(' | ')} |\n`;
        }
        
        // 数据行
        for (let i = 1; i < rows.length; i++) {
            markdown += `| ${rows[i].join(' | ')} |\n`;
        }
        
        return markdown;
    }
    
    /**
     * 🎯 提取表格行
     */
    _extractTableRows(html) {
        const rows = [];
        const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
        let rowMatch;
        
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const cells = [];
            const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
            let cellMatch;
            
            while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
                const cellText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
                cells.push(cellText);
            }
            
            if (cells.length > 0) {
                rows.push(cells);
            }
        }
        
        return rows;
    }
    
    /**
     * 🎯 构建元数据
     */
    _buildMetadata(structureAnalysis) {
        return {
            url: this.currentUrl,
            processedAt: new Date().toISOString(),
            title: structureAnalysis.title,
            paragraphs: structureAnalysis.paragraphs.length,
            images: structureAnalysis.images.length,
            tables: structureAnalysis.tables.length,
            codeBlocks: structureAnalysis.codeBlocks.length,
            model: this.model,
            temperature: this.temperature
        };
    }
    
    /**
     * 🎯 计算统计信息
     */
    _calculateStats(structureAnalysis, finalContent) {
        return {
            originalParagraphs: structureAnalysis.paragraphs.length,
            imagesCount: structureAnalysis.images.length,
            tablesCount: structureAnalysis.tables.length,
            codeBlocksCount: structureAnalysis.codeBlocks.length,
            finalContentLength: finalContent.length,
            processingTime: this._calculateProcessingTime()
        };
    }
    
    /**
     * 🎯 计算处理时间
     */
    _calculateProcessingTime() {
        if (this.processingSteps.length < 2) return '未知';
        
        const start = new Date(this.processingSteps[0].timestamp);
        const end = new Date(this.processingSteps[this.processingSteps.length - 1].timestamp);
        const seconds = (end - start) / 1000;
        
        if (seconds < 60) return `${seconds.toFixed(1)}秒`;
        return `${Math.floor(seconds / 60)}分${Math.floor(seconds % 60)}秒`;
    }
    
    /**
     * 🎯 记录处理步骤
     */
    async _recordStep(step, data) {
        const stepRecord = {
            step,
            timestamp: new Date().toISOString(),
            data
        };
        
        this.processingSteps.push(stepRecord);
        
        // 发送进度事件
        const progressMap = {
            'analysis_start': 20,
            'analysis_complete': 40,
            'translation_start': 50,
            'translation_complete': 90
        };
        
        await this.callbackManager.invokeEvent('on_translation_progress', {
            run_id: this.runId,
            data: {
                step,
                progress: progressMap[step] || 0,
                ...data
            }
        });
    }
    
    /**
     * 🎯 触发开始事件
     */
    async _fireStartEvent(url) {
        await this.callbackManager.invokeEvent('on_translation_start', {
            run_id: this.runId,
            data: {
                url,
                startTime: new Date().toISOString(),
                model: this.model
            }
        });
    }
    
    /**
     * 🎯 触发完成事件
     */
    async _fireCompleteEvent(result) {
        await this.callbackManager.invokeEvent('on_translation_complete', {
            run_id: this.runId,
            data: {
                url: this.currentUrl,
                content: result.finalContent,
                stats: result.stats,
                success: true,
                processingTime: result.stats.processingTime
            }
        });
    }
    
    /**
     * 🎯 处理失败
     */
    async _handleFailure(error) {
        const fallbackContent = `# 网站翻译失败

## ❌ 错误信息
- **目标URL**: ${this.currentUrl}
- **错误类型**: ${error.name || '处理错误'}
- **错误信息**: ${error.message}
- **发生时间**: ${new Date().toISOString()}

> 系统在处理过程中遇到错误，无法完成翻译任务。`;
        
        await this.callbackManager.invokeEvent('on_translation_error', {
            run_id: this.runId,
            data: {
                url: this.currentUrl,
                error: error.message,
                content: fallbackContent,
                success: false
            }
        });
        
        return {
            success: false,
            runId: this.runId,
            url: this.currentUrl,
            error: error.message,
            content: fallbackContent
        };
    }
}