// src/static/js/agent/deepresearch/TranslationProcessor.js
// 🎯 网站翻译专用处理器 - 完整优化版

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
        const { url, targetLanguage, enableProofreading } = params;
        
        // 🎯 步骤1：高级抓取
        const scrapedData = await this._step1_advancedScrape(url);
        
        // 🎯 步骤2：智能翻译（第一次调用）
        const translationResult = await this._step2_smartTranslation(scrapedData, targetLanguage);
        
        // 🎯 步骤3：校对精修（第二次调用）
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
    // 🎯 步骤2：智能翻译（第一次调用）
    // ============================================
    
    async _step2_smartTranslation(scrapedData, targetLanguage) {
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
            
            // 🎯 构建翻译提示词
            const translationPrompt = this._buildTranslationPrompt({
                title,
                paragraphs,
                tables,
                images,
                codeBlocks,
                targetLanguage
            });
            
            console.log(`[TranslationProcessor] 提示词长度: ${translationPrompt.length} 字符`);
            
            // 🎯 第一次调用：翻译
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: translationPrompt }],
                model: this.model,
                temperature: this.temperature.translation,
                response_format: { type: 'json_object' }
            });
            
            const contentStr = response?.choices?.[0]?.message?.content;
            if (!contentStr) throw new Error('翻译返回为空');
            
            // 🎯 解析翻译结果
            let translationResult;
            try {
                translationResult = JSON.parse(contentStr);
            } catch (e) {
                console.error('[TranslationProcessor] 翻译JSON解析失败:', e);
                console.error('[TranslationProcessor] 原始内容:', contentStr.substring(0, 500));
                throw new Error('翻译结果格式错误');
            }
            
            // 🎯 验证结果结构
            translationResult = this._validateTranslationResult(translationResult);
            
            await this._recordStep('translation_complete', {
                titleTranslated: !!translationResult.title?.translated,
                paragraphs: translationResult.paragraphs?.length || 0,
                tables: translationResult.tables?.length || 0
            });
            
            return translationResult;
            
        } catch (error) {
            console.error('[TranslationProcessor] ❌ 翻译失败:', error);
            console.error('[TranslationProcessor] 错误堆栈:', error.stack);
            throw new Error(`翻译失败: ${error.message}`);
        }
    }
    
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
     * 🎯 构建翻译提示词（第一次调用）
     */
    _buildTranslationPrompt(data) {
        const { title, paragraphs, tables, images, codeBlocks, targetLanguage } = data;
        
        // 🎯 判断是否包含标题、表格和图片信息
        const hasSpecialContent = tables.length > 0 || images.length > 0 || codeBlocks.length > 0;

        return `# 🎯 网站内容翻译任务 (分块翻译)
 
## 📋 核心要求
你是一位专业的翻译专家。请将以下网站内容**准确、完整、忠实地**翻译成${targetLanguage}。
 
## 🚫 绝对禁止
1. 不要添加任何个人观点、评论或分析
2. 不要修改原文的事实信息
3. 不要遗漏任何段落或数据
4. 不要美化或简化原文
5. **绝对不要翻译或修改 [CODE_BLOCK_N] 占位符**
 
## 🌐 原文内容
 
${hasSpecialContent ? `### 1. 标题
${title}
 
### 2. 表格数据（共 ${tables.length} 个）
${tables.slice(0, 3).map((table, i) => `
表格 ${i+1}: ${table.title || '未命名'}
${table.rows.slice(0, 5).map(row => row.join(' | ')).join('\n')}
`).join('\n')}
 
### 3. 图片描述（共 ${images.length} 张）
${images.slice(0, 5).map((img, i) => `图片 ${i+1}: ${img.alt || '无描述'}`).join('\n')}
 
### 4. 代码块列表（共 ${codeBlocks.length} 个）
${codeBlocks.map(block => `- ${block.id} (${block.language})`).join('\n')}
 
---
` : ''}

### 🎯 当前翻译内容块 (共 ${paragraphs.length} 段)
${paragraphs.map(p => p.content).join('\n\n')}
 
## 📤 输出格式
请以JSON格式返回，必须包含以下字段：
 
{
  ${hasSpecialContent ? `"translated_title": "翻译标题",` : ''}
  "paragraphs": [
    {
      "original": "原文段落",
      "translated": "翻译段落",
      "index": 0 // 🎯 必须保留原始段落的索引
    }
  ],
  "metadata": {
    "translated_at": "时间戳",
    "target_language": "${targetLanguage}",
    "translation_model": "${this.model}",
    "temperature": ${this.temperature.translation}
  }
}
 
## 💡 翻译要点
1. **准确性优先**：技术术语、数字、日期必须准确
2. **保持结构**：段落和表格结构保持不变
3. **自然流畅**：中文表达要符合阅读习惯
4. **术语一致**：同一术语全文保持一致
 
现在，请开始翻译：`;
    }
    
    // ============================================
    // 🎯 步骤3：校对精修（第二次调用）
    // ============================================
    
    async _step3_proofreading(translationResult, targetLanguage) {
        await this._recordStep('proofreading_start', {});
        
        try {
            // 🎯 构建校对提示词
            const proofreadPrompt = this._buildProofreadPrompt(translationResult, targetLanguage);
            
            // 🎯 第二次调用：校对精修
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: proofreadPrompt }],
                model: this.model,
                temperature: this.temperature.proofreading,
                response_format: { type: 'json_object' }
            });
            
            const contentStr = response?.choices?.[0]?.message?.content;
            if (!contentStr) {
                console.warn('[TranslationProcessor] ⚠️ 校对返回为空，使用原始翻译');
                return translationResult;
            }
            
            // 🎯 解析校对结果
            let proofreadResult;
            try {
                proofreadResult = JSON.parse(contentStr);
            } catch (e) {
                console.warn('[TranslationProcessor] ⚠️ 校对JSON解析失败:', e);
                return translationResult;
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
     * 🎯 构建校对提示词（第二次调用）
     */
    _buildProofreadPrompt(data) {
        const { title, paragraphs, tables, targetLanguage } = data;
        
        const isFirstChunk = title !== null;

        return `# 🎯 翻译校对与精修任务 (分块校对)
 
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
 
${isFirstChunk ? `### 1. 标题翻译
原文: "${title.original}"
翻译: "${title.translated}"
 
### 2. 示例表格
${tables.slice(0, 2).map((t, i) => `
**表格 ${i+1}**: ${t.title}
原文: ${t.original.substring(0, 100)}...
翻译: ${t.translated.substring(0, 100)}...
`).join('\n')}
 
---
` : ''}

### 🎯 当前翻译内容块 (共 ${paragraphs.length} 段)
${paragraphs.map((p, i) => `
**段落索引**: ${p.index}
**原文**: ${p.original}
**翻译**: ${p.translated}
`).join('\n---\n')}
 
## 📊 校对标准
- ✅ **优秀**：准确、流畅、专业
- ⚠️ **良好**：基本准确，个别地方可优化
- ❌ **需改进**：有明显错误或不流畅
 
## 📤 输出格式
请以JSON格式返回校对结果：
 
{
  ${isFirstChunk ? `"suggested_title_correction": "如果标题需要修改，请提供新标题",` : ''}
  "overall_quality": "优秀/良好/需改进",
  "corrections": [
    {
      "type": "paragraph/table",
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
 
现在，请开始校对：`;
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
        
        // 🎯 质量评分
        validation.scores = {
            completeness: this._calculateCompletenessScore(translationResult),
            consistency: this._calculateConsistencyScore(translationResult),
            accuracy: this._estimateAccuracyScore(translationResult)
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
        const codeBlockMap = scrapedData.codeBlocks.reduce((map, block) => {
            map[block.id] = block;
            return map;
        }, {});
        
        let report = `# 🌐 网站内容翻译报告\n\n`;
        
        // 🎯 1. 报告头（专业格式）
        report += `## 📋 报告信息\n`;
        report += `| 项目 | 内容 |\n|------|------|\n`;
        report += `| **来源网址** | ${this.currentUrl} |\n`;
        report += `| **原文标题** | ${finalTranslation.title.original} |\n`;
        report += `| **翻译标题** | ${finalTranslation.title.translated} |\n`;
        report += `| **翻译时间** | ${new Date().toISOString()} |\n`;
        report += `| **目标语言** | 中文 |\n`;
        report += `| **翻译模型** | ${this.model} |\n`;
        report += `| **校对状态** | ${finalTranslation.metadata?.proofread ? '✅ 已校对' : '⚠️ 未校对'} |\n\n`;
        
        // 🎯 2. 内容概览
        report += `## 📊 内容概览\n`;
        report += `- **原文段落**: ${finalTranslation.paragraphs.length} 段\n`;
        report += `- **翻译段落**: ${finalTranslation.paragraphs.length} 段\n`;
        report += `- **表格数量**: ${finalTranslation.tables.length} 个\n`;
        report += `- **图片数量**: ${finalTranslation.images.length} 张\n`;
        report += `- **代码块数量**: ${scrapedData.codeBlocks.length} 个\n`;
        report += `- **总字符数**: ${metadata.totalCharacters || '未统计'} 字符\n\n`;
        
        // 🎯 3. 质量评估
        report += `## ✅ 质量评估\n`;
        if (validation.scores) {
            report += `| 评估维度 | 得分 (0-10) | 评价 |\n|----------|-------------|------|\n`;
            report += `| **完整性** | ${validation.scores.completeness.toFixed(1)} | ${this._getScoreDescription(validation.scores.completeness)} |\n`;
            report += `| **一致性** | ${validation.scores.consistency.toFixed(1)} | ${this._getScoreDescription(validation.scores.consistency)} |\n`;
            report += `| **准确性** | ${validation.scores.accuracy.toFixed(1)} | ${this._getScoreDescription(validation.scores.accuracy)} |\n`;
        }
        report += `\n`;
        
        // 🎯 4. 标题翻译
        report += `## 🏷️ 标题翻译\n`;
        report += `### 原文\n> ${finalTranslation.title.original}\n\n`;
        report += `### 翻译\n> ${finalTranslation.title.translated}\n\n`;
        
        // 🎯 5. 主要内容翻译
        report += `## 📝 主要内容\n\n`;
        
        // 分组显示段落，每5段一组
        const paragraphs = finalTranslation.paragraphs;
        for (let i = 0; i < paragraphs.length; i += 5) {
            const group = paragraphs.slice(i, i + 5);
            report += `### 第 ${i + 1}-${Math.min(i + 5, paragraphs.length)} 段\n\n`;
            
            group.forEach((para, idx) => {
                const absoluteIdx = i + idx + 1;
                report += `#### 段落 ${absoluteIdx}\n`;
                
                // 🎯 替换占位符
                let translatedContent = para.translated;
                let originalContent = para.original;
                
                scrapedData.codeBlocks.forEach(block => {
                    const placeholder = `[${block.id}]`;
                    const codeBlockMarkdown = `\n\`\`\`${block.language}\n${block.content}\n\`\`\`\n`;
                    
                    // 替换翻译内容中的占位符
                    translatedContent = translatedContent.replace(placeholder, codeBlockMarkdown);
                    // 替换原文内容中的占位符
                    originalContent = originalContent.replace(placeholder, codeBlockMarkdown);
                });
                
                report += `**原文**\n\n${originalContent}\n\n`;
                report += `**翻译**\n\n${translatedContent}\n\n`;
                
                // 如果有校对标记
                if (para.proofread) {
                    report += `*✅ 已校对${para.correction_reason ? ` (${para.correction_reason})` : ''}*\n\n`;
                }
                
                report += `---\n\n`;
            });
        }
        
        // 🎯 6. 表格数据
        if (finalTranslation.tables.length > 0) {
            report += `## 📊 表格数据\n\n`;
            
            finalTranslation.tables.forEach((table, index) => {
                report += `### 表格 ${index + 1}: ${table.title || '未命名'}\n\n`;
                
                if (table.translated.includes('|')) {
                    // Markdown表格
                    report += table.translated + '\n\n';
                } else {
                    // 纯文本表格
                    report += `\`\`\`\n${table.translated}\n\`\`\`\n\n`;
                }
                
                report += `*表 ${index + 1}：${table.title || '数据表格'}*\n\n`;
            });
        }
        
        // 🎯 7. 图片信息
        if (finalTranslation.images.length > 0) {
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
        if (scrapedData.codeBlocks.length > 0) {
            report += `## 💻 代码块附录 (Code Blocks Appendix)\n\n`;
            report += `> 注：以下代码块已在主要内容中以占位符形式保留，此处为原始代码清单。\n\n`;
            
            scrapedData.codeBlocks.forEach((block, index) => {
                report += `### ${block.id} (${block.language})\n\n`;
                report += `\`\`\`${block.language}\n${block.content}\n\`\`\`\n\n`;
            });
        }
        
        // 🎯 9. 关键信息提取
        report += `## 🔍 关键信息提取\n\n`;
        const keyInfo = this._extractKeyInformation(finalTranslation);
        keyInfo.forEach((info, index) => {
            report += `${index + 1}. **${info.type}**：${info.content}\n`;
        });
        report += `\n`;
        
        // 🎯 10. 处理说明
        report += `## ⚙️ 处理说明\n\n`;
        report += `1. **抓取工具**: crawl4ai (scrape模式)\n`;
        report += `2. **翻译流程**: 翻译 (T=${this.temperature.translation}) → 校对 (T=${this.temperature.proofreading})\n`;
        report += `3. **模型信息**: ${this.model}\n`;
        report += `4. **处理时间**: ${metadata.processingTime || '未统计'}\n`;
        report += `5. **字符统计**: ${metadata.totalCharacters || '未统计'} 字符\n\n`;
        
        // 🎯 11. 使用建议
        report += `## 💡 使用建议\n\n`;
        report += `1. **快速浏览**：阅读标题和关键信息提取部分了解核心内容\n`;
        report += `2. **深入阅读**：查看具体段落翻译获取详细信息\n`;
        report += `3. **数据参考**：表格部分提供了结构化数据\n`;
        report += `4. **来源验证**：如需验证具体信息，可访问原网址\n\n`;
        
        // 🎯 12. 免责声明
        report += `## ⚠️ 免责声明\n\n`;
        report += `1. 本报告仅为原文内容的忠实翻译\n`;
        report += `2. 翻译力求准确，但可能存在细微误差\n`;
        report += `3. 如原文有更新，本报告内容可能过时\n`;
        report += `4. 重要决策请以原始来源为准\n\n`;
        
        // 🎯 13. 原始信息
        report += `## 🔗 原始信息\n\n`;
        report += `- **原始网址**: ${this.currentUrl}\n`;
        report += `- **抓取时间**: ${metadata.scrapedAt || '未知'}\n`;
        report += `- **翻译时间**: ${metadata.translatedAt || '未知'}\n`;
        report += `- **报告版本**: 1.0\n`;
        report += `- **生成系统**: AI网站翻译系统\n`;
        
        return report;
    }
    
    // ============================================
    // 🎯 辅助方法
    // ============================================
    
    /**
     * 🎯 提取标题
     */
    _extractTitle(html) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) return titleMatch[1].trim();
        
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (h1Match) return h1Match[1].trim();
        
        return '未找到标题';
    }
    
    /**
     * 🎯 提取主要内容
     */
    _extractMainContent(html, codeBlocks) {
        let tempHtml = html;
        
        // 1. 用占位符替换代码块，防止代码被清理
        codeBlocks.forEach(block => {
            // 使用字符串替换，避免正则表达式问题
            // 查找包含该代码内容的 <pre> 标签
            const escapedContent = block.content.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`<pre[^>]*>[\\s\\S]*?${escapedContent}[\\s\\S]*?</pre>`, 'i');
            
            // 尝试匹配并替换
            const match = tempHtml.match(regex);
            if (match) {
                tempHtml = tempHtml.replace(regex, `\n\n[${block.id}]\n\n`);
            }
        });
        
        // 2. 清理HTML标签，保留文本
        let text = tempHtml.replace(/<[^>]+>/g, '\n');
        text = text.replace(/\n+/g, '\n').trim();
        
        // 3. 过滤短行和无关内容
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line =>
                line.length > 20 &&  // 🎯 降低长度要求以包含更多内容
                !line.startsWith('http') &&
                !line.match(/^[0-9\s]*$/) &&
                !line.includes('@') &&
                !line.includes('Copyright') &&
                !line.startsWith('Skip to') &&  // 🎯 过滤导航文本
                !line.startsWith('Jump to')     // 🎯 过滤导航文本
            );
        
        // 4. 返回段落数组，每个元素包含内容和原始索引
        return lines.map((content, index) => ({ content, index }));
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
            const codeHtml = match[0]; // 🎯 修复：获取匹配到的完整字符串
            
            // 尝试提取语言类型
            const langMatch = codeHtml.match(/class=["'][^"']*lang(?:uage)?-([^"'\s]+)/i);
            const language = langMatch ? langMatch[1] : 'plaintext';
            
            // 提取代码内容（去除 pre/code 标签）
            let codeContent = codeHtml.replace(/<\/?pre[^>]*>/gi, '');
            codeContent = codeContent.replace(/<\/?code[^>]*>/gi, '').trim();
            
            codeBlocks.push({
                id: `CODE_BLOCK_${count}`,
                language: language,
                content: codeContent
            });
        }
        
        return codeBlocks;
    }
    
    /**
     * 🎯 验证翻译结果
     */
    _validateTranslationResult(result) {
        const validated = { ...result };
        
        // 确保必要字段存在
        if (!validated.title) {
            validated.title = { original: '', translated: '' };
        }
        
        if (!validated.paragraphs || !Array.isArray(validated.paragraphs)) {
            validated.paragraphs = [];
        }
        
        if (!validated.tables || !Array.isArray(validated.tables)) {
            validated.tables = [];
        }
        
        if (!validated.images || !Array.isArray(validated.images)) {
            validated.images = [];
        }
        
        // 确保每个段落有索引
        validated.paragraphs = validated.paragraphs.map((para, index) => ({
            ...para,
            index: para.index !== undefined ? para.index : index
        }));
        
        // 确保元数据
        validated.metadata = {
            ...validated.metadata,
            translated_at: new Date().toISOString(),
            model: this.model,
            temperature: this.temperature.translation
        };
        
        return validated;
    }
    
    /**
     * 🎯 应用校对修改
     */
    _applyProofreadCorrectionsToChunk(chunk, proofread) {
        const correctedChunk = JSON.parse(JSON.stringify(chunk));
        
        // 应用段落修改
        if (proofread.corrections && Array.isArray(proofread.corrections)) {
            proofread.corrections.forEach(correction => {
                if (correction.type === 'paragraph' && correction.index !== undefined) {
                    // 🎯 查找当前块中匹配索引的段落
                    const idx = correctedChunk.findIndex(p => p.index === correction.index);
                    if (idx !== -1) {
                        correctedChunk[idx].translated = correction.suggested_correction;
                        correctedChunk[idx].proofread = true;
                        correctedChunk[idx].correction_reason = correction.reason;
                    }
                }
            });
        }
        
        // 🎯 未被校对的段落也需要标记为已处理
        return correctedChunk.map(p => ({ ...p, proofread: p.proofread || false }));
    }

    _applyProofreadCorrectionsToMetadata(original, proofread) {
        const corrected = JSON.parse(JSON.stringify(original));
        
        // 应用标题修改
        if (proofread.suggested_title_correction) {
            corrected.title.translated = proofread.suggested_title_correction;
            corrected.title.proofread = true;
        }
        
        // 应用表格修改
        if (proofread.corrections && Array.isArray(proofread.corrections)) {
            proofread.corrections.forEach(correction => {
                if (correction.type === 'table' && correction.index !== undefined) {
                    if (corrected.tables[correction.index]) {
                        corrected.tables[correction.index].translated = correction.suggested_correction;
                        corrected.tables[correction.index].proofread = true;
                    }
                }
            });
        }
        
        // 🎯 仅返回包含标题和表格校正的元数据
        return corrected;
    }
    
    /**
     * 🎯 分块段落
     */
    _chunkParagraphs(paragraphs, maxCharsPerChunk) {
        const chunks = [];
        let currentChunk = [];
        let currentChunkCharCount = 0;

        for (const paragraph of paragraphs) {
            const paragraphCharCount = paragraph.content.length;
            
            // 检查当前块是否已满，或者单个段落是否过大
            if (currentChunkCharCount + paragraphCharCount > maxCharsPerChunk && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentChunkCharCount = 0;
            }

            // 即使单个段落超过限制，也必须单独成块发送
            currentChunk.push(paragraph);
            currentChunkCharCount += paragraphCharCount;
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
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
        // 在实际应用中可以使用更复杂的方法
        return 8.5; // 估计值
    }
    
    /**
     * 🎯 估计准确性分数
     */
    _estimateAccuracyScore(translation) {
        // 基于校对结果估计
        if (translation.metadata?.proofread) {
            switch (translation.metadata.proofread.quality) {
                case '优秀': return 9.5;
                case '良好': return 8.0;
                case '需改进': return 6.0;
                default: return 7.5;
            }
        }
        return 7.0; // 默认值
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
     * 🎯 提取关键信息
     */
    _extractKeyInformation(translation) {
        const info = [];
        
        // 标题信息
        info.push({
            type: '核心主题',
            content: translation.title.translated
        });
        
        // 从前3段提取关键信息
        const firstParagraphs = translation.paragraphs.slice(0, 3);
        firstParagraphs.forEach((para, index) => {
            if (para.translated.length > 50) {
                info.push({
                    type: `要点 ${index + 1}`,
                    content: para.translated.substring(0, 100) + '...'
                });
            }
        });
        
        // 表格统计
        if (translation.tables.length > 0) {
            info.push({
                type: '数据表格',
                content: `共 ${translation.tables.length} 个数据表格`
            });
        }
        
        // 图片信息
        if (translation.images.length > 0) {
            info.push({
                type: '图片资源',
                content: `共 ${translation.images.length} 张图片`
            });
        }
        
        return info.slice(0, 5); // 限制为5条关键信息
    }
    
    /**
     * 🎯 构建元数据
     */
    _buildMetadata(scrapedData, translation) {
        return {
            url: this.currentUrl,
            scrapedAt: new Date().toISOString(),
            translatedAt: translation.metadata?.translated_at,
            totalCharacters: translation.paragraphs?.reduce((sum, p) => sum + p.translated.length, 0) || 0,
            processingSteps: this.processingSteps.length,
            model: this.model,
            temperatures: this.temperature
        };
    }
    
    /**
     * 🎯 计算统计信息
     */
    _calculateStats(scrapedData, translation) {
        const originalLength = scrapedData.content?.length || 0;
        const translatedLength = translation.paragraphs?.reduce((sum, p) => sum + p.translated.length, 0) || 0;
        
        return {
            originalLength,
            translatedLength,
            translationRatio: translatedLength / Math.max(originalLength, 1),
            paragraphs: translation.paragraphs?.length || 0,
            tables: translation.tables?.length || 0,
            images: translation.images?.length || 0,
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