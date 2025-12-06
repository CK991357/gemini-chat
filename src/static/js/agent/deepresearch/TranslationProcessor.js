// src/static/js/agent/deepresearch/TranslationProcessor.js
// 🎯 网站翻译专用处理器 - 最终优化版（支持分块翻译）

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
        
        // 🎯 模型配置
        this.model = config.model || 'gemini-2.5-flash-preview-09-2025';
        this.temperature = {
            translation: 0.1,      // 低温翻译，保证准确性
            proofreading: 0.2,     // 稍高精修，允许必要润色
            structure: 0.1         // 结构化提取要准确
        };
        
        // 🎯 抓取配置（scrape模式优化）
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
                bypass_cache: true
            }
        };
        
        // 🎯 翻译分块配置
        this.chunkConfig = {
            maxCharsPerChunk: 15000,       // 每个分块最大字符数
            maxTokensEstimate: 7000,       // 估计的token限制
            minParagraphsPerChunk: 1,      // 每个分块最少段落数
            maxParagraphsPerChunk: 30,     // 每个分块最多段落数
            overlapParagraphs: 1           // 分块重叠段落数（保持上下文连贯）
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
            enableProofreading = true,
            userInstruction = ''
        } = request;
        
        this.currentUrl = url;
        this.runId = this.callbackManager.generateRunId();
        
        console.log(`[TranslationProcessor] 🚀 开始翻译: ${url}`);
        
        try {
            // 🎯 触发开始事件
            await this._fireStartEvent(url);
            
            // 🎯 执行固定流程
            const result = await this._executeFixedPipeline({
                url,
                targetLanguage,
                enableProofreading,
                userInstruction
            });
            
            // 🎯 生成最终报告
            const finalReport = this._generatePublishableReport(result);
            
            // 🎯 触发完成事件
            await this._fireCompleteEvent(result, finalReport);
            
            return {
                success: true,
                runId: this.runId,
                url,
                report: finalReport,
                metadata: result.metadata,
                stats: result.stats
            };
            
        } catch (error) {
            console.error('[TranslationProcessor] ❌ 处理失败:', error);
            return this._handleFailure(error);
        }
    }
    
    /**
     * 🎯 固定流程：4步法
     */
    async _executeFixedPipeline(params) {
        const { url, targetLanguage, enableProofreading, userInstruction } = params;
        
        // 🎯 步骤1：高级抓取
        const scrapedData = await this._step1_advancedScrape(url);
        
        // 🎯 步骤2：智能翻译（支持分块）
        const translationResult = await this._step2_smartTranslation(scrapedData, targetLanguage, userInstruction);
        
        // 🎯 步骤3：校对精修
        let finalTranslation = translationResult;
        if (enableProofreading) {
            finalTranslation = await this._step3_proofreading(translationResult, targetLanguage);
        }
        
        // 🎯 步骤4：质量验证
        const validation = await this._step4_qualityValidation(finalTranslation);
        
        return {
            url,
            scrapedData,
            translationResult,
            finalTranslation,
            validation,
            metadata: this._buildMetadata(scrapedData, finalTranslation),
            stats: this._calculateStats(scrapedData, finalTranslation)
        };
    }
    
    // ============================================
    // 🎯 步骤1：高级抓取（scrape模式）
    // ============================================
    
    async _step1_advancedScrape(url) {
        await this._recordStep('scrape_start', { url });
        
        const tool = this.tools['crawl4ai'];
        if (!tool) throw new Error('crawl4ai工具不可用');
        
        // 🎯 配置抓取参数
        this.scrapeConfig.parameters.url = url;
        
        try {
            const result = await tool.invoke(this.scrapeConfig, {
                mode: 'website_translation',
                researchMode: 'scrape_only'
            });
            
            if (!result.success) {
                throw new Error(`抓取失败: ${result.output || '未知错误'}`);
            }
            
            // 🎯 解析返回数据
            let scrapedData;
            try {
                scrapedData = JSON.parse(result.output);
            } catch (e) {
                scrapedData = { content: result.output };
            }
            
            await this._recordStep('scrape_complete', {
                length: scrapedData.content?.length || 0,
                hasHtml: !!scrapedData.cleaned_html,
                hasTables: scrapedData.content?.includes('<table') || false
            });
            
            return scrapedData;
            
        } catch (error) {
            throw new Error(`网站抓取失败: ${error.message}`);
        }
    }
    
    // ============================================
    // 🎯 步骤2：智能翻译（支持分块）
    // ============================================
    
    async _step2_smartTranslation(scrapedData, targetLanguage, userInstruction = '') {
        await this._recordStep('translation_start', { targetLanguage });
        
        try {
            // 🎯 从抓取数据中提取关键信息
            console.log('[TranslationProcessor] 开始提取关键内容...');
            const { title, paragraphs, tables, images, codeBlocks } = this._extractKeyContent(scrapedData);
            
            console.log(`[TranslationProcessor] 提取结果:`, {
                titleLength: title.length,
                paragraphsCount: paragraphs.length,
                tablesCount: tables.length,
                imagesCount: images.length,
                codeBlocksCount: codeBlocks.length
            });
            
            // 🎯 智能分块：检查内容长度，决定是否分块
            const totalChars = paragraphs.reduce((sum, p) => sum + p.content.length, 0);
            const totalTokensEstimate = Math.ceil(totalChars / 2); // 粗略估计：1个汉字≈2个token
            
            console.log(`[TranslationProcessor] 内容统计: ${totalChars}字符, 约${totalTokensEstimate}token`);
            
            let translationResult;
            
            if (totalTokensEstimate > this.chunkConfig.maxTokensEstimate && paragraphs.length > 5) {
                // 🎯 内容过长，启用分块翻译
                console.log(`[TranslationProcessor] 内容过长，启用分块翻译机制`);
                translationResult = await this._chunkedTranslation({
                    title,
                    paragraphs,
                    tables,
                    images,
                    codeBlocks,
                    targetLanguage,
                    userInstruction
                });
            } else {
                // 🎯 单次翻译
                console.log(`[TranslationProcessor] 内容适中，单次翻译`);
                translationResult = await this._singleTranslation({
                    title,
                    paragraphs,
                    tables,
                    images,
                    codeBlocks,
                    targetLanguage,
                    userInstruction
                });
            }
            
            await this._recordStep('translation_complete', {
                titleTranslated: !!translationResult.title?.translated,
                paragraphs: translationResult.paragraphs?.length || 0,
                tables: translationResult.tables?.length || 0,
                chunksUsed: translationResult.metadata?.chunks_used || 1
            });
            
            return translationResult;
            
        } catch (error) {
            console.error('[TranslationProcessor] ❌ 翻译失败:', error);
            console.error('[TranslationProcessor] 错误堆栈:', error.stack);
            throw new Error(`翻译失败: ${error.message}`);
        }
    }
    
    /**
     * 🎯 单次翻译（短内容）
     */
    async _singleTranslation(data) {
        const { title, paragraphs, tables, images, codeBlocks, targetLanguage, userInstruction } = data;
        
        // 🎯 构建翻译提示词
        const translationPrompt = this._buildTranslationPrompt({
            title,
            paragraphs,
            tables,
            images,
            codeBlocks,
            targetLanguage,
            userInstruction,
            isFirstChunk: true,
            chunkIndex: 0,
            totalChunks: 1
        });
        
        console.log(`[TranslationProcessor] 提示词长度: ${translationPrompt.length} 字符`);
        
        // 🎯 调用翻译API
        const response = await this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: translationPrompt }],
            model: this.model,
            temperature: this.temperature.translation
        });
        
        const contentStr = response?.choices?.[0]?.message?.content;
        if (!contentStr) throw new Error('翻译返回为空');
        
        // 🎯 解析翻译结果
        let translationResult = this._parseTranslationResponse(contentStr);
        
        // 🎯 构建完整结果
        return this._buildTranslationResult(translationResult, {
            title,
            paragraphs,
            tables,
            images,
            codeBlocks,
            targetLanguage,
            chunksUsed: 1
        });
    }
    
    /**
     * 🎯 分块翻译（长内容）
     */
    async _chunkedTranslation(data) {
        const { title, paragraphs, tables, images, codeBlocks, targetLanguage, userInstruction } = data;
        
        // 🎯 智能分块
        const chunks = this._createIntelligentChunks(paragraphs);
        console.log(`[TranslationProcessor] 分割为 ${chunks.length} 个分块进行翻译`);
        
        const allTranslatedParagraphs = [];
        let translatedTitle = title;
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirstChunk = i === 0;
            
            console.log(`[TranslationProcessor] 处理分块 ${i + 1}/${chunks.length} (${chunk.paragraphs.length} 段，${chunk.charCount} 字符)`);
            
            try {
                // 🎯 构建当前分块的提示词
                const chunkPrompt = this._buildTranslationPrompt({
                    title: isFirstChunk ? title : null,
                    paragraphs: chunk.paragraphs,
                    tables: isFirstChunk ? tables : [],
                    images: isFirstChunk ? images : [],
                    codeBlocks: isFirstChunk ? codeBlocks : [],
                    targetLanguage,
                    userInstruction,
                    isFirstChunk,
                    chunkIndex: i,
                    totalChunks: chunks.length
                });
                
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: chunkPrompt }],
                    model: this.model,
                    temperature: this.temperature.translation
                });
                
                const contentStr = response?.choices?.[0]?.message?.content;
                if (!contentStr) {
                    throw new Error(`分块 ${i + 1} 翻译返回为空`);
                }
                
                const chunkResult = this._parseTranslationResponse(contentStr);
                
                // 🎯 如果是第一块，获取标题翻译
                if (isFirstChunk && chunkResult.translated_title) {
                    translatedTitle = chunkResult.translated_title;
                }
                
                // 🎯 合并翻译的段落，并调整索引为原始索引
                const translatedWithIndices = chunkResult.paragraphs.map(p => ({
                    ...p,
                    index: chunk.startIndex + p.index // 将块内索引转换为全局索引
                }));
                
                allTranslatedParagraphs.push(...translatedWithIndices);
                
                console.log(`[TranslationProcessor] ✅ 分块 ${i + 1}/${chunks.length} 完成`);
                
            } catch (error) {
                console.error(`[TranslationProcessor] ❌ 分块 ${i + 1} 翻译失败:`, error);
                
                // 🎯 降级方案：保留原文
                const fallbackParagraphs = chunk.paragraphs.map(p => ({
                    original: p.content,
                    translated: p.content,
                    index: p.index,
                    is_fallback: true,
                    fallback_reason: error.message
                }));
                
                allTranslatedParagraphs.push(...fallbackParagraphs);
            }
            
            // 🎯 添加延迟避免速率限制
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // 🎯 按原始索引排序并去重
        const sortedParagraphs = this._deduplicateAndSortParagraphs(allTranslatedParagraphs);
        
        // 🎯 构建完整结果
        return this._buildTranslationResult({
            translated_title: translatedTitle,
            paragraphs: sortedParagraphs
        }, {
            title,
            paragraphs,
            tables,
            images,
            codeBlocks,
            targetLanguage,
            chunksUsed: chunks.length
        });
    }
    
    /**
     * 🎯 智能分块算法
     */
    _createIntelligentChunks(paragraphs) {
        const chunks = [];
        let currentChunk = [];
        let currentCharCount = 0;
        let startIndex = 0;
        
        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];
            const paragraphChars = paragraph.content.length;
            
            // 🎯 检查是否需要创建新分块
            const shouldCreateNewChunk = 
                // 超过字符限制且当前分块已有内容
                (currentCharCount + paragraphChars > this.chunkConfig.maxCharsPerChunk && currentChunk.length > 0) ||
                // 超过段落数限制
                (currentChunk.length >= this.chunkConfig.maxParagraphsPerChunk);
            
            if (shouldCreateNewChunk) {
                chunks.push({
                    paragraphs: currentChunk,
                    content: currentChunk.map(p => p.content).join('\n\n'),
                    startIndex: startIndex,
                    charCount: currentCharCount,
                    paragraphCount: currentChunk.length
                });
                
                // 🎯 重叠段落：将最后几个段落保留到下一个分块
                const overlap = Math.min(this.chunkConfig.overlapParagraphs, currentChunk.length - 1);
                currentChunk = overlap > 0 ? currentChunk.slice(-overlap) : [];
                currentCharCount = currentChunk.reduce((sum, p) => sum + p.content.length, 0);
                startIndex = i - (currentChunk.length);
            }
            
            currentChunk.push(paragraph);
            currentCharCount += paragraphChars;
        }
        
        // 添加最后一个分块
        if (currentChunk.length > 0) {
            chunks.push({
                paragraphs: currentChunk,
                content: currentChunk.map(p => p.content).join('\n\n'),
                startIndex: startIndex,
                charCount: currentCharCount,
                paragraphCount: currentChunk.length
            });
        }
        
        return chunks;
    }
    
    /**
     * 🎯 构建翻译提示词（支持分块）
     */
    _buildTranslationPrompt(data) {
        const { 
            title, 
            paragraphs, 
            tables, 
            images, 
            codeBlocks, 
            targetLanguage, 
            userInstruction,
            isFirstChunk,
            chunkIndex,
            totalChunks 
        } = data;
        
        const chunkInfo = totalChunks > 1 ? 
            `（分块 ${chunkIndex + 1}/${totalChunks}）` : '';
        
        return `# 🎯 网站内容翻译任务${chunkInfo}
 
## 📋 核心要求
你是一位专业的翻译专家。请将以下网站内容**准确、完整、忠实地**翻译成${targetLanguage}。
 
## 🚫 绝对禁止
1. 不要添加任何个人观点、评论或分析
2. 不要修改原文的事实信息
3. 不要遗漏任何段落或数据
4. 不要美化或简化原文
5. **绝对不要翻译或修改 [CODE_BLOCK_N] 占位符**
 
${userInstruction ? `## 📝 用户特别要求
${userInstruction}

` : ''}

## 🌐 原文内容
 
${isFirstChunk ? `### 1. 标题
${title}
 
### 2. 表格数据（共 ${tables.length} 个）
${tables.slice(0, 3).map((table, i) => `
表格 ${i+1}: ${table.title || '未命名'}
${table.markdown ? table.markdown.substring(0, 500) + '...' : '无内容'}
`).join('\n')}
 
### 3. 图片描述（共 ${images.length} 张）
${images.slice(0, 5).map((img, i) => `图片 ${i+1}: ${img.alt || '无描述'}`).join('\n')}
 
### 4. 代码块列表（共 ${codeBlocks.length} 个）
${codeBlocks.slice(0, 3).map(block => `- ${block.id} (${block.language}): ${block.content.substring(0, 100)}...`).join('\n')}
 
---
` : ''}

### 🎯 当前翻译内容块 (共 ${paragraphs.length} 段)
${paragraphs.map(p => p.content).join('\n\n')}
 
## 📤 输出格式
你必须以 **有效的 JSON 格式** 返回，并且只能包含 JSON 对象！不要包含任何其他文本或解释。

格式必须严格遵循以下 JSON 结构：
{
  ${isFirstChunk ? `"translated_title": "翻译后的标题",` : ''}
  "paragraphs": [
    {
      "original": "原文段落",
      "translated": "翻译段落",
      "index": 0 // 🎯 必须保留段落在当前分块中的相对索引（从0开始）
    }
  ],
  "metadata": {
    "translated_at": "${new Date().toISOString()}",
    "target_language": "${targetLanguage}",
    "translation_model": "${this.model}",
    "temperature": ${this.temperature.translation}${totalChunks > 1 ? `,
    "chunk": ${chunkIndex + 1},
    "total_chunks": ${totalChunks}` : ''}
  }
}
 
## 💡 翻译要点
1. **准确性优先**：技术术语、数字、日期必须准确
2. **保持结构**：段落和表格结构保持不变
3. **自然流畅**：中文表达要符合阅读习惯
4. **术语一致**：同一术语全文保持一致
5. **专有名词**：人名、地名、品牌名等保持原文或使用通用译名
 
现在，请开始翻译，并以有效的 JSON 格式返回：`;
    }
    
    /**
     * 🎯 解析翻译响应
     */
    _parseTranslationResponse(contentStr) {
        try {
            // 🎯 首先尝试直接解析
            return JSON.parse(contentStr);
        } catch (e) {
            console.warn('[TranslationProcessor] 直接JSON解析失败，尝试提取JSON');
            
            // 🎯 尝试从文本中提取JSON
            const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    console.error('[TranslationProcessor] JSON提取解析失败:', e2);
                    console.error('[TranslationProcessor] 原始内容:', contentStr.substring(0, 500));
                }
            }
            
            // 🎯 尝试修复常见的JSON格式错误
            try {
                const cleaned = contentStr
                    .replace(/,\s*([\]}])/g, '$1') // 移除尾部逗号
                    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":') // 确保键被引号包围
                    .replace(/:\s*'([^']*)'/g, ': "$1"') // 单引号转双引号
                    .replace(/:\s*`([^`]*)`/g, ': "$1"') // 反引号转双引号
                    .replace(/\\'/g, "'") // 转义单引号
                    .replace(/\\"/g, '"') // 转义双引号
                    .replace(/\n/g, '\\n'); // 转义换行符
                
                return JSON.parse(cleaned);
            } catch (e3) {
                console.error('[TranslationProcessor] JSON修复失败:', e3);
                throw new Error('翻译结果格式错误，无法解析为JSON');
            }
        }
    }
    
    /**
     * 🎯 构建完整翻译结果
     */
    _buildTranslationResult(chunkResult, context) {
        const { title, paragraphs, tables, images, codeBlocks, targetLanguage, chunksUsed } = context;
        
        // 🎯 处理表格翻译
        const translatedTables = tables.map((table, index) => ({
            title: table.title || `表格 ${index + 1}`,
            original: table.markdown || '',
            translated: table.markdown || '', // 表格暂时保留原文，后续可优化
            markdown: table.markdown,
            rows: table.rows || []
        }));
        
        // 🎯 处理图片翻译
        const translatedImages = images.map((img, index) => ({
            src: img.src,
            alt: img.alt,
            original_alt: img.alt,
            translated_alt: img.alt, // 图片描述暂时保留原文
            index: index
        }));
        
        return {
            title: {
                original: title,
                translated: chunkResult.translated_title || title
            },
            paragraphs: chunkResult.paragraphs || [],
            tables: translatedTables,
            images: translatedImages,
            codeBlocks: codeBlocks,
            metadata: {
                translated_at: new Date().toISOString(),
                target_language: targetLanguage,
                translation_model: this.model,
                temperature: this.temperature.translation,
                chunks_used: chunksUsed || 1,
                original_paragraphs: paragraphs.length,
                translated_paragraphs: chunkResult.paragraphs?.length || 0
            }
        };
    }
    
    /**
     * 🎯 去重并排序段落
     */
    _deduplicateAndSortParagraphs(paragraphs) {
        // 按索引排序
        const sorted = paragraphs.sort((a, b) => a.index - b.index);
        
        // 去重（基于索引）
        const uniqueMap = new Map();
        sorted.forEach(p => {
            if (!uniqueMap.has(p.index) || !p.is_fallback) {
                uniqueMap.set(p.index, p);
            }
        });
        
        return Array.from(uniqueMap.values());
    }
    
    // ============================================
    // 🎯 步骤3：校对精修
    // ============================================
    
    async _step3_proofreading(translationResult, targetLanguage) {
        await this._recordStep('proofreading_start', {});
        
        try {
            // 🎯 检查内容长度，决定是否分块校对
            const totalChars = translationResult.paragraphs.reduce((sum, p) => 
                sum + (p.translated || '').length, 0);
            
            let proofreadResult;
            
            if (totalChars > this.chunkConfig.maxCharsPerChunk / 2) {
                // 🎯 内容较长，分块校对
                console.log(`[TranslationProcessor] 内容较长(${totalChars}字符)，启用分块校对`);
                proofreadResult = await this._chunkedProofreading(translationResult, targetLanguage);
            } else {
                // 🎯 单次校对
                proofreadResult = await this._singleProofreading(translationResult, targetLanguage);
            }
            
            // 🎯 应用校对修改
            const finalResult = this._applyProofreadCorrections(translationResult, proofreadResult);
            
            await this._recordStep('proofreading_complete', {
                corrections: proofreadResult.corrections?.length || 0,
                overall_quality: proofreadResult.overall_quality || 'unknown'
            });
            
            return finalResult;
            
        } catch (error) {
            console.warn('[TranslationProcessor] ⚠️ 校对失败，使用原始翻译:', error);
            return translationResult;
        }
    }
    
    /**
     * 🎯 单次校对
     */
    async _singleProofreading(translationResult, targetLanguage) {
        const proofreadPrompt = this._buildProofreadPrompt(translationResult, targetLanguage, {
            isFirstChunk: true,
            chunkIndex: 0,
            totalChunks: 1
        });
        
        const response = await this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: proofreadPrompt }],
            model: this.model,
            temperature: this.temperature.proofreading
        });
        
        const contentStr = response?.choices?.[0]?.message?.content;
        if (!contentStr) {
            throw new Error('校对返回为空');
        }
        
        return this._parseTranslationResponse(contentStr);
    }
    
    /**
     * 🎯 分块校对
     */
    async _chunkedProofreading(translationResult, targetLanguage) {
        const paragraphs = translationResult.paragraphs;
        const chunks = this._createIntelligentChunks(paragraphs.map((p, i) => ({
            content: `原文: ${p.original}\n翻译: ${p.translated}`,
            index: i
        })));
        
        const allCorrections = [];
        let overallQuality = '良好';
        let summary = '';
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkParagraphs = chunk.paragraphs.map(p => translationResult.paragraphs[p.index]);
            
            try {
                const chunkPrompt = this._buildProofreadPrompt({
                    ...translationResult,
                    paragraphs: chunkParagraphs
                }, targetLanguage, {
                    isFirstChunk: i === 0,
                    chunkIndex: i,
                    totalChunks: chunks.length
                });
                
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: chunkPrompt }],
                    model: this.model,
                    temperature: this.temperature.proofreading
                });
                
                const contentStr = response?.choices?.[0]?.message?.content;
                if (!contentStr) continue;
                
                const chunkResult = this._parseTranslationResponse(contentStr);
                
                // 🎯 合并校对结果
                if (chunkResult.corrections) {
                    // 调整索引为全局索引
                    const adjustedCorrections = chunkResult.corrections.map(c => ({
                        ...c,
                        index: chunk.startIndex + c.index
                    }));
                    allCorrections.push(...adjustedCorrections);
                }
                
                if (i === 0) {
                    overallQuality = chunkResult.overall_quality || overallQuality;
                    summary = chunkResult.summary || summary;
                }
                
                console.log(`[TranslationProcessor] ✅ 校对分块 ${i + 1}/${chunks.length} 完成`);
                
            } catch (error) {
                console.warn(`[TranslationProcessor] ⚠️ 校对分块 ${i + 1} 失败:`, error);
            }
            
            // 添加延迟
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        
        return {
            overall_quality: overallQuality,
            corrections: allCorrections,
            summary: summary || `共发现 ${allCorrections.length} 处需要修改`
        };
    }
    
    /**
     * 🎯 构建校对提示词
     */
    _buildProofreadPrompt(translationResult, targetLanguage, chunkInfo = {}) {
        const { title, paragraphs, tables } = translationResult;
        const { isFirstChunk = true, chunkIndex = 0, totalChunks = 1 } = chunkInfo;
        
        const chunkInfoText = totalChunks > 1 ? 
            `（校对分块 ${chunkIndex + 1}/${totalChunks}）` : '';
        
        return `# 🎯 翻译校对与精修任务${chunkInfoText}
 
## 📋 角色设定
你是一位经验丰富的翻译校对专家，专门检查翻译质量。
 
## 🎯 校对重点
请检查以下翻译内容，重点关注：
1. **准确性**：翻译是否准确传达了原文意思
2. **流畅性**：中文表达是否自然流畅
3. **一致性**：术语是否前后一致
4. **专业性**：专业内容翻译是否准确
 
## 🌐 目标语言: ${targetLanguage}
 
## 📝 待校对内容
 
${isFirstChunk && title ? `### 1. 标题翻译
原文: "${title.original}"
翻译: "${title.translated}"
 
---
` : ''}

### 🎯 当前校对内容块 (共 ${paragraphs.length} 段)
${paragraphs.map((p, i) => `
**段落索引**: ${p.index}
**原文**: ${p.original}
**翻译**: ${p.translated}
`).join('\n---\n')}
 
## 📤 输出格式
你必须以 **有效的 JSON 格式** 返回，并且只能包含 JSON 对象！

格式必须严格遵循以下 JSON 结构：
{
  ${isFirstChunk && title ? `"suggested_title_correction": "如果标题需要修改，请提供新标题",` : ''}
  "overall_quality": "优秀/良好/需改进",
  "corrections": [
    {
      "type": "paragraph",
      "index": 0, // 🎯 必须使用段落的原始索引
      "original_translation": "原翻译",
      "suggested_correction": "建议修改",
      "reason": "修改理由"
    }
  ],
  "summary": "总体评价",
  "terminology_check": true/false,
  "fluency_score": 0-10
}
 
## 💡 校对原则
1. 只修改确实有问题的部分
2. 保持原翻译的风格和结构
3. 优先保证准确性，其次流畅性
4. 标记专业术语是否一致
 
现在，请开始校对，并以有效的 JSON 格式返回：`;
    }
    
    /**
     * 🎯 应用校对修改
     */
    _applyProofreadCorrections(original, proofread) {
        const corrected = JSON.parse(JSON.stringify(original));
        
        // 🎯 应用标题修改
        if (proofread.suggested_title_correction) {
            corrected.title.translated = proofread.suggested_title_correction;
            corrected.title.proofread = true;
            corrected.title.correction_reason = '校对修改';
        }
        
        // 🎯 应用段落修改
        if (proofread.corrections && Array.isArray(proofread.corrections)) {
            proofread.corrections.forEach(correction => {
                if (correction.type === 'paragraph' && correction.index !== undefined) {
                    const idx = corrected.paragraphs.findIndex(p => p.index === correction.index);
                    if (idx !== -1) {
                        corrected.paragraphs[idx].translated = correction.suggested_correction;
                        corrected.paragraphs[idx].proofread = true;
                        corrected.paragraphs[idx].correction_reason = correction.reason;
                        corrected.paragraphs[idx].original_correction = correction.original_translation;
                    }
                }
            });
        }
        
        // 🎯 标记元数据
        corrected.metadata = corrected.metadata || {};
        corrected.metadata.proofread = {
            at: new Date().toISOString(),
            overall_quality: proofread.overall_quality || '未知',
            corrections_count: proofread.corrections?.length || 0,
            summary: proofread.summary || ''
        };
        
        return corrected;
    }
    
    // ============================================
    // 🎯 步骤4：质量验证
    // ============================================
    
    async _step4_qualityValidation(translationResult) {
        await this._recordStep('validation_start', {});
        
        const validation = {
            passed: true,
            issues: [],
            scores: {},
            checked_at: new Date().toISOString()
        };
        
        // 🎯 基础检查
        if (!translationResult.title?.translated) {
            validation.issues.push({ type: 'missing_title', severity: 'high' });
            validation.passed = false;
        }
        
        if (!translationResult.paragraphs || translationResult.paragraphs.length === 0) {
            validation.issues.push({ type: 'no_content', severity: 'critical' });
            validation.passed = false;
        }
        
        // 🎯 检查空翻译
        const emptyTranslations = translationResult.paragraphs?.filter(p =>
            !p.translated || p.translated.trim().length === 0
        ).length || 0;
        
        if (emptyTranslations > 0) {
            validation.issues.push({ 
                type: 'empty_translations', 
                severity: 'medium',
                count: emptyTranslations 
            });
        }
        
        // 🎯 检查降级段落
        const fallbackParagraphs = translationResult.paragraphs?.filter(p => p.is_fallback).length || 0;
        if (fallbackParagraphs > 0) {
            validation.issues.push({
                type: 'fallback_paragraphs',
                severity: 'low',
                count: fallbackParagraphs
            });
        }
        
        // 🎯 质量评分
        validation.scores = {
            completeness: this._calculateCompletenessScore(translationResult),
            consistency: this._calculateConsistencyScore(translationResult),
            accuracy: this._estimateAccuracyScore(translationResult),
            coverage: this._calculateCoverageScore(translationResult)
        };
        
        await this._recordStep('validation_complete', {
            passed: validation.passed,
            issues: validation.issues.length,
            scores: validation.scores
        });
        
        return validation;
    }
    
    // ============================================
    // 🎯 生成可发布报告
    // ============================================
    
    _generatePublishableReport(result) {
        const { scrapedData, finalTranslation, validation, metadata } = result;
        
        // 🎯 代码块映射表
        const codeBlockMap = scrapedData.codeBlocks?.reduce((map, block) => {
            map[block.id] = block;
            return map;
        }, {}) || {};
        
        let report = `# 🌐 网站内容翻译报告\n\n`;
        
        // 🎯 1. 报告头
        report += `## 📋 报告信息\n`;
        report += `| 项目 | 内容 |\n|------|------|\n`;
        report += `| **来源网址** | ${this.currentUrl} |\n`;
        report += `| **原文标题** | ${finalTranslation.title.original} |\n`;
        report += `| **翻译标题** | ${finalTranslation.title.translated} |\n`;
        report += `| **翻译时间** | ${new Date().toISOString()} |\n`;
        report += `| **目标语言** | 中文 |\n`;
        report += `| **翻译模型** | ${this.model} |\n`;
        report += `| **校对状态** | ${finalTranslation.metadata?.proofread ? '✅ 已校对' : '⚠️ 未校对'} |\n`;
        report += `| **分块数量** | ${finalTranslation.metadata?.chunks_used || 1} |\n\n`;
        
        // 🎯 2. 内容概览
        report += `## 📊 内容概览\n`;
        report += `- **原文段落**: ${finalTranslation.metadata?.original_paragraphs || 0} 段\n`;
        report += `- **翻译段落**: ${finalTranslation.metadata?.translated_paragraphs || 0} 段\n`;
        report += `- **表格数量**: ${finalTranslation.tables?.length || 0} 个\n`;
        report += `- **图片数量**: ${finalTranslation.images?.length || 0} 张\n`;
        report += `- **代码块数量**: ${scrapedData.codeBlocks?.length || 0} 个\n`;
        report += `- **降级段落**: ${finalTranslation.paragraphs?.filter(p => p.is_fallback).length || 0} 段\n\n`;
        
        // 🎯 3. 质量评估
        report += `## ✅ 质量评估\n`;
        if (validation.scores) {
            report += `| 评估维度 | 得分 (0-10) | 评价 |\n|----------|-------------|------|\n`;
            report += `| **完整性** | ${validation.scores.completeness.toFixed(1)} | ${this._getScoreDescription(validation.scores.completeness)} |\n`;
            report += `| **一致性** | ${validation.scores.consistency.toFixed(1)} | ${this._getScoreDescription(validation.scores.consistency)} |\n`;
            report += `| **准确性** | ${validation.scores.accuracy.toFixed(1)} | ${this._getScoreDescription(validation.scores.accuracy)} |\n`;
            report += `| **覆盖率** | ${validation.scores.coverage.toFixed(1)} | ${this._getScoreDescription(validation.scores.coverage)} |\n`;
        }
        report += `\n`;
        
        // 🎯 4. 标题翻译
        report += `## 🏷️ 标题翻译\n`;
        report += `### 原文\n> ${finalTranslation.title.original}\n\n`;
        report += `### 翻译\n> ${finalTranslation.title.translated}\n\n`;
        
        if (finalTranslation.title.proofread) {
            report += `*✅ 已校对${finalTranslation.title.correction_reason ? ` (${finalTranslation.title.correction_reason})` : ''}*\n\n`;
        }
        
        // 🎯 5. 主要内容翻译
        report += `## 📝 主要内容\n\n`;
        
        const paragraphs = finalTranslation.paragraphs || [];
        for (let i = 0; i < paragraphs.length; i += 5) {
            const group = paragraphs.slice(i, i + 5);
            report += `### 第 ${i + 1}-${Math.min(i + 5, paragraphs.length)} 段\n\n`;
            
            group.forEach((para, idx) => {
                const absoluteIdx = i + idx + 1;
                report += `#### 段落 ${absoluteIdx}\n`;
                
                // 🎯 替换代码块占位符
                let translatedContent = para.translated || '';
                let originalContent = para.original || '';
                
                if (codeBlockMap) {
                    Object.values(codeBlockMap).forEach(block => {
                        const placeholder = `[${block.id}]`;
                        const codeBlockMarkdown = `\n\`\`\`${block.language}\n${block.content}\n\`\`\`\n`;
                        
                        translatedContent = translatedContent.replace(placeholder, codeBlockMarkdown);
                        originalContent = originalContent.replace(placeholder, codeBlockMarkdown);
                    });
                }
                
                report += `**原文**\n\n${originalContent}\n\n`;
                report += `**翻译**\n\n${translatedContent}\n\n`;
                
                // 标记信息
                if (para.is_fallback) {
                    report += `*⚠️ 降级处理（使用原文）${para.fallback_reason ? `: ${para.fallback_reason}` : ''}*\n\n`;
                } else if (para.proofread) {
                    report += `*✅ 已校对${para.correction_reason ? ` (${para.correction_reason})` : ''}*\n\n`;
                }
                
                report += `---\n\n`;
            });
        }
        
        // 🎯 6. 表格数据
        if (finalTranslation.tables?.length > 0) {
            report += `## 📊 表格数据\n\n`;
            
            finalTranslation.tables.forEach((table, index) => {
                report += `### 表格 ${index + 1}: ${table.title || '未命名'}\n\n`;
                
                if (table.markdown) {
                    // Markdown表格
                    report += table.markdown + '\n\n';
                } else if (table.original) {
                    // 纯文本表格
                    report += `\`\`\`\n${table.original}\n\`\`\`\n\n`;
                }
            });
        }
        
        // 🎯 7. 图片信息
        if (finalTranslation.images?.length > 0) {
            report += `## 🖼️ 图片引用\n\n`;
            report += `> 注：以下为网页中的图片引用信息\n\n`;
            
            finalTranslation.images.slice(0, 10).forEach((img, index) => {
                report += `#### 图片 ${index + 1}\n`;
                report += `- **图片地址**: ${img.src}\n`;
                report += `- **原文描述**: ${img.original_alt || '无描述'}\n`;
                report += `- **翻译描述**: ${img.translated_alt || img.original_alt || '无描述'}\n`;
                report += `\n`;
            });
            
            if (finalTranslation.images.length > 10) {
                report += `*... 还有 ${finalTranslation.images.length - 10} 张图片未列出*\n\n`;
            }
        }
        
        // 🎯 8. 代码块附录
        if (scrapedData.codeBlocks?.length > 0) {
            report += `## 💻 代码块附录 (Code Blocks Appendix)\n\n`;
            report += `> 注：以下代码块已在主要内容中以占位符形式保留，此处为原始代码清单。\n\n`;
            
            scrapedData.codeBlocks.forEach((block, index) => {
                report += `### ${block.id} (${block.language})\n\n`;
                report += `\`\`\`${block.language}\n${block.content}\n\`\`\`\n\n`;
            });
        }
        
        // 🎯 9. 处理说明
        report += `## ⚙️ 处理说明\n\n`;
        report += `1. **抓取工具**: crawl4ai (scrape模式)\n`;
        report += `2. **翻译流程**: 翻译 (T=${this.temperature.translation}) → 校对 (T=${this.temperature.proofreading})\n`;
        report += `3. **模型信息**: ${this.model}\n`;
        report += `4. **分块策略**: ${finalTranslation.metadata?.chunks_used || 1} 个分块\n`;
        report += `5. **字符统计**: ${metadata.totalCharacters || '未统计'} 字符\n\n`;
        
        // 🎯 10. 免责声明
        report += `## ⚠️ 免责声明\n\n`;
        report += `1. 本报告仅为原文内容的忠实翻译\n`;
        report += `2. 翻译力求准确，但可能存在细微误差\n`;
        report += `3. 如原文有更新，本报告内容可能过时\n`;
        report += `4. 重要决策请以原始来源为准\n\n`;
        
        return report;
    }
    
    // ============================================
    // 🎯 辅助方法
    // ============================================
    
    /**
     * 🎯 提取关键内容
     */
    _extractKeyContent(scrapedData) {
        const html = scrapedData.cleaned_html || scrapedData.content || '';
        
        const codeBlocks = this._extractCodeBlocks(html);
        const paragraphs = this._extractMainContent(html, codeBlocks);
        
        return {
            title: this._extractTitle(html),
            paragraphs: paragraphs,
            tables: this._extractTables(html),
            images: this._extractImages(html),
            codeBlocks: codeBlocks
        };
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
        
        return '未找到标题';
    }
    
    /**
     * 🎯 提取主要内容
     */
    _extractMainContent(html, codeBlocks) {
        let tempHtml = html;
        
        // 1. 用占位符替换代码块
        codeBlocks.forEach(block => {
            const escapedContent = block.content.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`<pre[^>]*>[\\s\\S]*?${escapedContent}[\\s\\S]*?</pre>`, 'i');
            tempHtml = tempHtml.replace(regex, `\n\n[${block.id}]\n\n`);
        });
        
        // 2. 清理HTML标签
        let text = tempHtml.replace(/<[^>]+>/g, '\n');
        text = text.replace(/\n+/g, '\n').trim();
        
        // 3. 过滤短行和无关内容
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => {
                const lineLength = line.length;
                return lineLength > 15 && // 降低长度要求
                    !line.startsWith('http') &&
                    !line.match(/^[0-9\s]*$/) &&
                    !line.includes('@') &&
                    !line.includes('Copyright') &&
                    !line.toLowerCase().includes('skip to') &&
                    !line.toLowerCase().includes('jump to') &&
                    !line.toLowerCase().includes('menu') &&
                    !line.toLowerCase().includes('navigation');
            });
        
        // 4. 合并相邻短行
        const mergedLines = [];
        let currentLine = '';
        
        for (const line of lines) {
            if (line.length < 60 && currentLine.length < 150) {
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
        
        // 5. 返回段落数组
        return mergedLines.map((content, index) => ({ content, index }));
    }
    
    /**
     * 🎯 提取表格
     */
    _extractTables(html) {
        const tables = [];
        const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
        let match;
        let count = 0;
        
        while ((match = tableRegex.exec(html)) !== null) {
            count++;
            const tableHtml = match[0];
            
            // 提取标题
            const captionMatch = tableHtml.match(/<caption[^>]*>([^<]+)<\/caption>/i);
            const title = captionMatch ? captionMatch[1].trim() : `表格 ${count}`;
            
            // 转换为Markdown表格
            const markdownTable = this._htmlTableToMarkdown(tableHtml);
            
            if (markdownTable) {
                tables.push({
                    title,
                    rows: this._extractTableRows(tableHtml),
                    markdown: markdownTable
                });
            }
        }
        
        return tables;
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
     * 🎯 提取图片
     */
    _extractImages(html) {
        const images = [];
        const imgRegex = /<img[^>]+>/gi;
        const altRegex = /alt=["']([^"']*)["']/i;
        const srcRegex = /src=["']([^"']*)["']/i;
        
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            const imgTag = match[0];
            const srcMatch = imgTag.match(srcRegex);
            if (!srcMatch) continue;
            
            const altMatch = imgTag.match(altRegex);
            
            images.push({
                src: srcMatch[1],
                alt: altMatch ? altMatch[1] : ''
            });
        }
        
        return images;
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
                content: codeContent.substring(0, 5000) // 限制长度
            });
        }
        
        return codeBlocks;
    }
    
    /**
     * 🎯 计算完整性分数
     */
    _calculateCompletenessScore(translation) {
        let score = 10;
        
        // 检查必要字段
        if (!translation.title?.translated) score -= 3;
        if (!translation.paragraphs || translation.paragraphs.length === 0) score -= 4;
        
        // 检查是否有空翻译
        const emptyTranslations = translation.paragraphs?.filter(p =>
            !p.translated || p.translated.trim().length === 0
        ).length || 0;
        
        if (emptyTranslations > 0) {
            score -= (emptyTranslations / translation.paragraphs.length) * 3;
        }
        
        return Math.max(0, Math.min(10, score));
    }
    
    /**
     * 🎯 计算一致性分数
     */
    _calculateConsistencyScore(translation) {
        // 简单实现：检查术语一致性
        const termMap = new Map();
        const paragraphs = translation.paragraphs || [];
        
        // 提取可能的术语（大写单词、专业词汇等）
        paragraphs.forEach(p => {
            const terms = p.translated?.match(/[A-Z][a-z]+|[A-Z]+/g) || [];
            terms.forEach(term => {
                termMap.set(term, (termMap.get(term) || 0) + 1);
            });
        });
        
        // 计算术语出现频率的一致性
        const termCounts = Array.from(termMap.values());
        if (termCounts.length === 0) return 8.0;
        
        const avg = termCounts.reduce((a, b) => a + b, 0) / termCounts.length;
        const variance = termCounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / termCounts.length;
        
        // 方差越小，一致性越好
        const consistency = Math.max(0, 10 - variance);
        return Math.min(10, consistency);
    }
    
    /**
     * 🎯 估计准确性分数
     */
    _estimateAccuracyScore(translation) {
        // 基于校对结果估计
        if (translation.metadata?.proofread) {
            switch (translation.metadata.proofread.overall_quality) {
                case '优秀': return 9.5;
                case '良好': return 8.0;
                case '需改进': return 6.0;
                default: return 7.5;
            }
        }
        
        // 基于降级段落比例
        const fallbackRatio = (translation.paragraphs?.filter(p => p.is_fallback).length || 0) / 
                            Math.max(translation.paragraphs?.length || 1, 1);
        
        return Math.max(5, 10 - (fallbackRatio * 5));
    }
    
    /**
     * 🎯 计算覆盖率分数
     */
    _calculateCoverageScore(translation) {
        const totalParagraphs = translation.metadata?.original_paragraphs || 0;
        const translatedParagraphs = translation.metadata?.translated_paragraphs || 0;
        
        if (totalParagraphs === 0) return 0;
        
        const coverage = (translatedParagraphs / totalParagraphs) * 10;
        return Math.min(10, coverage);
    }
    
    /**
     * 🎯 获取分数描述
     */
    _getScoreDescription(score) {
        if (score >= 9) return '优秀';
        if (score >= 7) return '良好';
        if (score >= 5) return '一般';
        return '需改进';
    }
    
    /**
     * 🎯 构建元数据
     */
    _buildMetadata(scrapedData, translation) {
        return {
            url: this.currentUrl,
            scrapedAt: new Date().toISOString(),
            translatedAt: translation.metadata?.translated_at,
            totalCharacters: translation.paragraphs?.reduce((sum, p) => sum + (p.translated || '').length, 0) || 0,
            processingSteps: this.processingSteps.length,
            model: this.model,
            temperatures: this.temperature,
            chunksUsed: translation.metadata?.chunks_used || 1
        };
    }
    
    /**
     * 🎯 计算统计信息
     */
    _calculateStats(scrapedData, translation) {
        const originalLength = scrapedData.content?.length || 0;
        const translatedLength = translation.paragraphs?.reduce((sum, p) => sum + (p.translated || '').length, 0) || 0;
        
        return {
            originalLength,
            translatedLength,
            translationRatio: translatedLength / Math.max(originalLength, 1),
            paragraphs: translation.paragraphs?.length || 0,
            tables: translation.tables?.length || 0,
            images: translation.images?.length || 0,
            codeBlocks: scrapedData.codeBlocks?.length || 0,
            fallbackParagraphs: translation.paragraphs?.filter(p => p.is_fallback).length || 0,
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
            'scrape_start': 10,
            'scrape_complete': 30,
            'translation_start': 40,
            'translation_complete': 60,
            'proofreading_start': 65,
            'proofreading_complete': 85,
            'validation_start': 90,
            'validation_complete': 100
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
    async _fireCompleteEvent(result, report) {
        await this.callbackManager.invokeEvent('on_translation_complete', {
            run_id: this.runId,
            data: {
                url: this.currentUrl,
                report,
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
        const fallbackReport = `# 🌐 网站翻译失败报告

## ❌ 错误信息
- **目标URL**: ${this.currentUrl}
- **错误类型**: ${error.name || '处理错误'}
- **错误信息**: ${error.message}
- **发生时间**: ${new Date().toISOString()}

## 📝 处理记录
${this.processingSteps.map((step, i) => `${i+1}. ${step.step} (${step.timestamp})`).join('\n')}

## 🔧 建议措施
1. **检查URL可访问性**
2. **尝试缩短内容长度**
3. **联系技术支持**

> 系统在处理过程中遇到错误，无法完成翻译任务。`;
        
        await this.callbackManager.invokeEvent('on_translation_error', {
            run_id: this.runId,
            data: {
                url: this.currentUrl,
                error: error.message,
                report: fallbackReport,
                success: false
            }
        });
        
        return {
            success: false,
            runId: this.runId,
            url: this.currentUrl,
            error: error.message,
            report: fallbackReport
        };
    }
    
    /**
     * 🎯 批量处理接口
     */
    async batchTranslate(urls, options = {}) {
        console.log(`[TranslationProcessor] 🚀 批量翻译 ${urls.length} 个网站`);
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`[${i+1}/${urls.length}] 处理: ${url}`);
            
            try {
                const result = await this.processWebsite({
                    url,
                    ...options
                });
                
                results.push(result);
                
                // 添加延迟避免被封
                if (i < urls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                errors.push({ url, error: error.message });
                console.error(`[TranslationProcessor] ❌ 处理失败 ${url}:`, error);
            }
        }
        
        return {
            total: urls.length,
            success: results.length,
            failed: errors.length,
            results,
            errors
        };
    }
}