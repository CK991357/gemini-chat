// src/static/js/agent/deepresearch/services/StateManager.js
// 🎯 共享状态管理器 - 统一管理各模块间的共享状态

export class StateManager {
    /**
     * 🎯 状态管理器构造函数
     * @param {Object} config - 配置参数
     */
    constructor(config = {}) {
        // 🎯 核心共享状态
        this.dataBus = new Map(); // step_index -> {rawData, metadata, contentType}
        this.generatedImages = new Map(); // imageId -> imageData
        this.intermediateSteps = []; // 研究步骤历史
        this.visitedURLs = new Map(); // url -> {count, lastVisited, stepIndex}
        
        // 🎯 运行状态
        this.runId = null;
        this.imageCounter = 0;
        this.currentSessionId = `session_${Date.now()}`;
        this.currentResearchContext = "";
        
        // 🎯 性能指标
        this.metrics = {
            toolUsage: { 
                tavily_search: 0, 
                crawl4ai: 0, 
                python_sandbox: 0 
            },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { 
                prompt_tokens: 0, 
                completion_tokens: 0, 
                total_tokens: 0 
            }
        };
        
        // 🎯 配置
        this.dataRetentionPolicy = {
            maxRawDataSize: config.maxRawDataSize || 250000,
            retentionSteps: config.retentionSteps || 100
        };
        
        this.urlSimilarityThreshold = config.urlSimilarityThreshold || 0.85;
        this.maxRevisitCount = config.maxRevisitCount || 2;
        this.maxIterations = config.maxIterations || 8;
        
        console.log('[StateManager] ✅ 状态管理器初始化完成');
    }
    
    // ============================================================
    // 🎯 数据总线操作
    // ============================================================
    
    /**
     * 🎯 存储数据到数据总线
     */
    storeInDataBus(stepIndex, rawData, metadata = {}, toolSources = []) {
        const dataKey = `step_${stepIndex}`;
        
        let processedData = rawData;
        
        // 存储工具返回的原始来源信息
        const sourcesInfo = toolSources.map(source => ({
            title: source.title || '无标题',
            url: source.url || '#',
            description: source.description || '',
            collectedAt: new Date().toISOString(),
            stepIndex: stepIndex,
            sourceIndex: null
        }));
        
        // 特别处理结构化数据
        if (metadata.contentType === 'structured_data') {
            try {
                const parsedData = JSON.parse(rawData);
                const summary = {
                    dataType: metadata.dataType || 'unknown',
                    fieldCount: Object.keys(parsedData).length,
                    sample: {},
                    size: rawData.length
                };
                
                Object.entries(parsedData)
                    .slice(0, 3)
                    .forEach(([key, value]) => {
                        summary.sample[key] = typeof value === 'string'
                            ? value.substring(0, 100)
                            : typeof value;
                    });
                
                processedData = JSON.stringify(summary, null, 2);
                
            } catch (e) {
                // 如果不是JSON，使用原有逻辑
                if (rawData.length > 10000) {
                    processedData = this._extractStructuredData(rawData, metadata);
                }
            }
        } else {
            if (rawData.length > 10000) {
                processedData = this._extractStructuredData(rawData, metadata);
            }
        }
        
        this.dataBus.set(dataKey, {
            rawData: processedData,
            originalData: rawData,
            metadata: {
                ...metadata,
                originalLength: rawData.length,
                processedLength: processedData.length,
                timestamp: Date.now(),
                toolSources: sourcesInfo,
                sourceCount: sourcesInfo.length
            }
        });
        
        this._cleanupDataBus();
        console.log(`[StateManager] 📦 存储数据到 ${dataKey}: ${rawData.length} -> ${processedData.length} 字符`);
    }
    
    /**
     * 🎯 从数据总线检索数据
     */
    retrieveFromDataBus() {
        if (this.dataBus.size === 0) return '';
        
        let summary = `\n\n## 🚌 智能数据总线 (Data Bus) 缓存\n\n`;
        summary += `**系统提示**: 你在历史步骤中收集到的完整、未截断的原始数据已缓存于此。请在需要时引用。\n\n`;
        
        const sortedData = Array.from(this.dataBus.entries())
            .map(([key, data]) => ({ key, data }))
            .sort((a, b) => new Date(b.data.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());
        
        for (const { key, data } of sortedData) {
            const { rawData, metadata } = data;
            const stepIndex = key.split('_');
            const contentType = metadata.contentType || '未知';
            const toolName = metadata.toolName || '未知工具';
            const dataType = metadata.dataType || '文本';
            
            const preview = rawData.substring(0, 200).replace(/\n/g, ' ').trim();
            
            summary += `### 📦 ${key} (步骤 ${stepIndex} - ${toolName})\n`;
            summary += `- **类型**: ${dataType} (${contentType})\n`;
            summary += `- **大小**: ${metadata.size} 字符\n`;
            summary += `- **预览**: \`${preview}...\`\n`;
            summary += `- **引用方式**: 在你的思考中，你可以引用 \`DataBus:${key}\` 来表明你正在使用这份完整数据进行分析。\n\n`;
        }
        
        summary += `--- Data Bus 结束 ---\n\n`;
        return summary;
    }
    
    /**
     * 🎯 清理数据总线
     */
    _cleanupDataBus() {
        const stepKeys = Array.from(this.dataBus.keys())
                              .filter(key => key.startsWith('step_'));
        
        if (stepKeys.length > this.dataRetentionPolicy.retentionSteps) {
            stepKeys.sort((a, b) => {
                const numA = parseInt(a.split('_')[1], 10);
                const numB = parseInt(b.split('_')[1], 10);
                return numA - numB;
            });
            
            const keysToDelete = stepKeys.slice(0, stepKeys.length - this.dataRetentionPolicy.retentionSteps);
            
            keysToDelete.forEach(key => {
                this.dataBus.delete(key);
                console.log(`[StateManager] 🧹 清理过期数据: ${key}`);
            });
        }
    }
    
    /**
     * 🎯 提取结构化数据
     */
    _extractStructuredData(rawData, metadata) {
        if (metadata.contentType === 'webpage') {
            const tables = this._extractTablesFromText(rawData);
            const lists = this._extractListsFromText(rawData);
            
            if (tables.length > 0 || lists.length > 0) {
                return `## 关键结构化数据\n\n${tables.join('\n\n')}\n\n${lists.join('\n\n')}`;
            }
        }
        
        if (rawData.length > 10000) {
            return rawData.substring(0, 8000) +
                   '\n\n[...内容截断...]\n\n' +
                   rawData.substring(rawData.length - 2000);
        }
        
        return rawData;
    }
    
    /**
     * 🎯 从文本中提取表格
     */
    _extractTablesFromText(text) {
        const tableMatches = text.match(/\|.*\|.*\n\|[-: ]+\|[-: ]+\|.*\n(\|.*\|.*)+/g) || [];
        return tableMatches.map(t => `### 提取表格\n${t}`);
    }
    
    /**
     * 🎯 从文本中提取列表
     */
    _extractListsFromText(text) {
        const listMatches = text.match(/(\n\s*[-*+]\s+.*)+/g) || [];
        return listMatches.map(l => `### 提取列表\n${l.trim()}`);
    }
    
    // ============================================================
    // 🎯 图像管理
    // ============================================================
    
    /**
     * 🎯 存储生成的图像
     */
    storeGeneratedImage(imageId, imageData) {
        this.generatedImages.set(imageId, imageData);
        console.log(`[StateManager] 🖼️ 存储图像: ${imageId}`);
    }
    
    /**
     * 🎯 获取所有图像
     */
    getGeneratedImages() {
        return this.generatedImages;
    }
    
    /**
     * 🎯 清除图像缓存
     */
    clearImages() {
        this.generatedImages.clear();
        this.imageCounter = 0;
        console.log('[StateManager] 🖼️ 图像缓存已清除');
    }
    
    // ============================================================
    // 🎯 URL 管理
    // ============================================================
    
    /**
     * 🎯 记录URL访问
     */
    recordURLVisit(url, stepIndex) {
        if (!this.visitedURLs.has(url)) {
            this.visitedURLs.set(url, {
                count: 1,
                lastVisited: Date.now(),
                stepIndex: stepIndex
            });
        } else {
            const data = this.visitedURLs.get(url);
            data.count++;
            data.lastVisited = Date.now();
        }
        
        console.log(`[StateManager] 🔗 记录URL访问: ${url} (第${stepIndex}步)`);
    }
    
    /**
     * 🎯 获取URL访问记录
     */
    getURLVisitCount(url) {
        const data = this.visitedURLs.get(url);
        return data ? data.count : 0;
    }
    
    /**
     * 🎯 清除URL记录
     */
    clearURLHistory() {
        this.visitedURLs.clear();
        console.log('[StateManager] 🔗 URL访问记录已清除');
    }
    
    // ============================================================
    // 🎯 研究状态管理
    // ============================================================
    
    /**
     * 🎯 开始新的研究运行
     */
    startNewRun(runId, topic) {
        this.runId = runId;
        this.currentResearchContext = topic;
        this.clearURLHistory();
        this.clearImages();
        this.intermediateSteps = [];
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        
        console.log(`[StateManager] 🚀 开始新研究运行: ${runId}, 主题: ${topic}`);
    }
    
    /**
     * 🎯 记录中间步骤
     */
    recordIntermediateStep(step) {
        this.intermediateSteps.push(step);
        console.log(`[StateManager] 📝 记录步骤 ${this.intermediateSteps.length}: ${step.action?.tool_name || 'unknown'}`);
    }
    
    /**
     * 🎯 获取最后一步
     */
    getLastStep() {
        return this.intermediateSteps.length > 0 
            ? this.intermediateSteps[this.intermediateSteps.length - 1] 
            : null;
    }
    
    /**
     * 🎯 更新性能指标
     */
    updateMetrics(updates) {
        if (updates.toolUsage) {
            Object.keys(updates.toolUsage).forEach(tool => {
                this.metrics.toolUsage[tool] = (this.metrics.toolUsage[tool] || 0) + updates.toolUsage[tool];
            });
        }
        
        if (updates.tokenUsage) {
            this.metrics.tokenUsage.prompt_tokens += updates.tokenUsage.prompt_tokens || 0;
            this.metrics.tokenUsage.completion_tokens += updates.tokenUsage.completion_tokens || 0;
            this.metrics.tokenUsage.total_tokens += updates.tokenUsage.total_tokens || 0;
        }
        
        if (updates.informationGain) {
            this.metrics.informationGain.push(updates.informationGain);
        }
        
        if (updates.planCompletion !== undefined) {
            this.metrics.planCompletion = updates.planCompletion;
        }
        
        console.log('[StateManager] 📊 性能指标已更新');
    }
    
    /**
     * 🎯 获取完整状态快照
     */
    getStateSnapshot() {
        return {
            runId: this.runId,
            dataBusSize: this.dataBus.size,
            generatedImagesCount: this.generatedImages.size,
            intermediateStepsCount: this.intermediateSteps.length,
            visitedURLsCount: this.visitedURLs.size,
            metrics: this.metrics,
            currentResearchContext: this.currentResearchContext,
            currentSessionId: this.currentSessionId
        };
    }
    
    /**
     * 🎯 重置所有状态（用于测试或错误恢复）
     */
    resetAllState() {
        this.dataBus.clear();
        this.generatedImages.clear();
        this.intermediateSteps = [];
        this.visitedURLs.clear();
        this.runId = null;
        this.imageCounter = 0;
        this.currentSessionId = `session_${Date.now()}`;
        this.currentResearchContext = "";
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        
        console.log('[StateManager] 🔄 所有状态已重置');
    }
}