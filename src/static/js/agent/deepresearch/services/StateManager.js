// src/static/js/agent/deepresearch/services/StateManager.js
// 🎯 共享状态管理器 - 统一管理各模块间的共享状态

// 🎯 共享状态管理器 - 统一管理各模块间的共享状态
export class StateManager {
    // 单例实例
    static _instance = null;

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
        this.componentStates = new Map(); // 组件状态注册表
        
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

    /**
     * 🎯 获取状态管理器实例（单例模式）
     * @returns {StateManager} 状态管理器实例
     */
    static getInstance(config) {
        if (!StateManager._instance) {
            StateManager._instance = new StateManager(config);
        }
        return StateManager._instance;
    }
    
    // ============================================================
    // 🎯 新增：统一状态同步API
    // ============================================================
    
    /**
     * 🎯 注册组件状态同步（主入口）
     * @param {string} componentName - 组件名称
     * @param {Object} initialState - 初始状态
     */
    registerComponent(componentName, initialState = {}) {
        this.componentStates.set(componentName, {
            ...initialState,
            lastSync: Date.now(),
            version: 0
        });
        console.log(`[StateManager] 📝 注册组件: ${componentName}`);
    }
    
    /**
     * 🎯 更新组件状态（带版本控制）
     * @param {string} componentName - 组件名称
     * @param {Object} updates - 状态更新
     */
    updateComponentState(componentName, updates) {
        if (!this.componentStates.has(componentName)) {
            this.registerComponent(componentName, updates);
            return;
        }
        
        const currentState = this.componentStates.get(componentName);
        this.componentStates.set(componentName, {
            ...currentState,
            ...updates,
            version: (currentState.version || 0) + 1,
            lastSync: Date.now()
        });
        
        // 如果更新了图片相关状态，同步到主状态
        if (updates.generatedImages) {
            this._syncImagesFromComponent(componentName, updates.generatedImages);
        }
        
        console.log(`[StateManager] 🔄 更新组件状态: ${componentName} v${this.componentStates.get(componentName).version}`);
    }
    
    /**
     * 🎯 同步图片数据（从组件到主状态）
     * @param {string} componentName - 来源组件
     * @param {Map} componentImages - 组件图片数据
     */
    _syncImagesFromComponent(componentName, componentImages) {
        if (!componentImages || !(componentImages instanceof Map)) {
            return;
        }
        
        let changed = false;
        for (const [imageId, imageData] of componentImages) {
            if (!this.generatedImages.has(imageId)) {
                this.generatedImages.set(imageId, imageData);
                changed = true;
                console.log(`[StateManager] 🖼️ 同步图片: ${imageId} <- ${componentName}`);
            }
        }
        
        if (changed) {
            this.imageCounter = this.generatedImages.size;
            console.log(`[StateManager] 📊 图片计数更新: ${this.imageCounter}`);
        }
    }
    
    /**
     * 🎯 获取统一状态快照（供报告生成使用）
     * @returns {Object} 统一状态快照
     */
    getUnifiedState() {
        return {
            // 核心状态
            dataBus: this.dataBus,
            generatedImages: this.generatedImages,
            intermediateSteps: this.intermediateSteps,
            visitedURLs: this.visitedURLs,
            
            // 运行状态
            runId: this.runId,
            imageCounter: this.imageCounter,
            currentResearchContext: this.currentResearchContext,
            
            // 性能指标
            metrics: this.metrics,
            
            // 组件状态版本（调试用）
            componentVersions: Array.from(this.componentStates.entries()).map(([name, state]) => ({
                name,
                version: state.version || 0,
                lastSync: state.lastSync
            }))
        };
    }
    
    /**
     * 🎯 验证状态一致性
     * @returns {boolean} 状态是否一致
     */
    validateStateConsistency() {
        const issues = [];
        
        // 检查图片计数一致性
        const actualImageCount = this.generatedImages.size;
        if (this.imageCounter !== actualImageCount) {
            issues.push(`图片计数不一致: counter=${this.imageCounter}, actual=${actualImageCount}`);
        }
        
        // 检查组件状态同步
        const staleComponents = Array.from(this.componentStates.entries())
            .filter(([name, state]) => Date.now() - state.lastSync > 300000) // 5分钟未同步
            .map(([name]) => name);
        
        if (staleComponents.length > 0) {
            issues.push(`组件状态过时: ${staleComponents.join(', ')}`);
        }
        
        if (issues.length === 0) {
            console.log('[StateManager] ✅ 状态一致性验证通过');
            return true;
        } else {
            console.warn('[StateManager] ⚠️ 状态一致性问题:', issues);
            return false;
        }
    }
    
    // ============================================================
    // 🎯 增强现有方法
    // ============================================================
    
    /**
     * 🎯 通知组件图片更新
     * @param {string} imageId - 图像ID
     * @param {string} sourceComponent - 来源组件
     */
    _notifyImageUpdate(imageId, sourceComponent) {
        // 可以扩展为事件系统，目前只记录日志
        console.log(`[StateManager] 📢 图片更新通知: ${imageId} 由 ${sourceComponent} 添加`);
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
            stepIndex: stepIndex, // 标记属于哪个步骤
            sourceIndex: null // 后续会分配唯一索引
        }));
        
        // 特别处理结构化数据
        if (metadata.contentType === 'structured_data') {
            try {
                // 如果是JSON字符串，尝试解析并提取关键信息
                const parsedData = JSON.parse(rawData);
                const summary = {
                    dataType: metadata.dataType || 'unknown',
                    fieldCount: Object.keys(parsedData).length,
                    sample: {},
                    size: rawData.length
                };
                
                // 提取前3个字段作为示例
                Object.entries(parsedData)
                    .slice(0, 3)
                    .forEach(([key, value]) => {
                        summary.sample[key] = typeof value === 'string'
                            ? value.substring(0, 100)
                            : typeof value;
                    });
                
                processedData = JSON.stringify(summary, null, 2);
                console.log(`[DataBus] 📊 存储结构化数据摘要: ${summary.dataType}, ${summary.fieldCount} 字段`);
                
            } catch (e) {
                // 如果不是JSON，使用原有逻辑
                if (rawData.length > 10000) {
                    processedData = this._extractStructuredData(rawData, metadata);
                }
            }
        } else {
            // 原有逻辑
            if (rawData.length > 10000) {
                processedData = this._extractStructuredData(rawData, metadata);
            }
        }
        
        this.dataBus.set(dataKey, {
            rawData: processedData,
            originalData: rawData, // 🔥 新增：保存原始数据
            metadata: {
                ...metadata,
                originalLength: rawData.length,
                processedLength: processedData.length,
                timestamp: Date.now(),
                toolSources: sourcesInfo, // 🆕 存储原始来源
                sourceCount: sourcesInfo.length
            }
        });
        
        this._cleanupDataBus();
        console.log(`[DataBus] 存储数据 ${dataKey}: ${rawData.length} -> ${processedData.length} 字符，包含 ${sourcesInfo.length} 个来源`);
    }
    
    /**
     * 🎯 从数据总线检索数据
     */
    retrieveFromDataBus() {
        if (this.dataBus.size === 0) {
            return '';
        }

        let summary = `\n\n## 🚌 智能数据总线 (Data Bus) 缓存\n\n`;
        summary += `**系统提示**: 你在历史步骤中收集到的完整、未截断的原始数据（如长网页内容、大JSON）已缓存于此。请在需要时引用。\n\n`;

        // 按照时间戳降序排序，确保 Agent 看到最新的数据
        const sortedData = Array.from(this.dataBus.entries())
            .map(([key, data]) => ({ key, data }))
            .sort((a, b) => new Date(b.data.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());

        for (const { key, data } of sortedData) {
            const { rawData, metadata } = data;
            const stepNum = key.split('_')[1] || '?';
            const contentType = metadata.contentType || '未知';
            const toolName = metadata.toolName || '未知工具';
            const dataType = metadata.dataType || '文本';
            const size = metadata.originalLength || rawData.length;
            
            // 提取前 200 字符作为预览
            const preview = rawData.substring(0, 200).replace(/\n/g, ' ').trim();

            summary += `### 📦 ${key} (步骤 ${stepNum} - ${toolName})\n`;
            summary += `- **类型**: ${dataType} (${contentType})\n`;
            summary += `- **大小**: ${size} 字符\n`;
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
        // 1. 获取所有 'step_X' 格式的键
        const stepKeys = Array.from(this.dataBus.keys())
                              .filter(key => key.startsWith('step_'));

        // 2. 如果需要清理
        if (stepKeys.length > this.dataRetentionPolicy.retentionSteps) {
            // 3. 按照数字大小对键进行排序（'step_1', 'step_10', 'step_2' -> 'step_1', 'step_2', 'step_10'）
            stepKeys.sort((a, b) => {
                const numA = parseInt(a.split('_')[1], 10);
                const numB = parseInt(b.split('_')[1], 10);
                return numA - numB;
            });

            // 4. 确定要删除的旧键
            const keysToDelete = stepKeys.slice(0, stepKeys.length - this.dataRetentionPolicy.retentionSteps);
            
            // 5. 执行删除
            keysToDelete.forEach(key => {
                this.dataBus.delete(key);
                console.log(`[DataBus] 🧹 清理过期数据: ${key}`);
            });
        }
    }
    
    /**
     * 🎯 提取结构化数据
     */
    _extractStructuredData(rawData, metadata) {
        // 针对网页内容特别优化
        if (metadata.contentType === 'webpage') {
            // 提取表格、列表等结构化数据
            const tables = this._extractTablesFromText(rawData);
            const lists = this._extractListsFromText(rawData);
            
            if (tables.length > 0 || lists.length > 0) {
                return `## 关键结构化数据\n\n${tables.join('\n\n')}\n\n${lists.join('\n\n')}`;
            }
        }
        
        // 通用情况：保留前8000字符 + 后2000字符
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
        // 简单的Markdown表格提取逻辑占位符
        const tableMatches = text.match(/\|.*\|.*\n\|[-: ]+\|[-: ]+\|.*\n(\|.*\|.*)+/g) || [];
        return tableMatches.map(t => `### 提取表格\n${t}`);
    }
    
    /**
     * 🎯 从文本中提取列表
     */
    _extractListsFromText(text) {
        // 简单的Markdown列表提取逻辑占位符
        const listMatches = text.match(/(\n\s*[-*+]\s+.*)+/g) || [];
        return listMatches.map(l => `### 提取列表\n${l.trim()}`);
    }
    
    // ============================================================
    // 🎯 图像管理
    // ============================================================
    
    /**
     * 🎯 增强：存储生成的图像（统一入口）
     * @param {string} imageId - 图像ID
     * @param {Object} imageData - 图像数据
     * @param {string} sourceComponent - 来源组件
     */
    storeGeneratedImage(imageId, imageData, sourceComponent = 'unknown') {
        this.generatedImages.set(imageId, {
            ...imageData,
            metadata: {
                ...(imageData.metadata || {}),
                sourceComponent,
                storedAt: Date.now(),
                storedInStateManager: true
            }
        });
        this.imageCounter = this.generatedImages.size;
        
        // 通知所有已注册的组件
        this._notifyImageUpdate(imageId, sourceComponent);
        
        console.log(`[StateManager] 🖼️ 统一存储图像: ${imageId} (来自 ${sourceComponent}), 总计: ${this.imageCounter}`);
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
     * 🎯 增强：开始新的研究运行
     * @param {string} runId - 运行ID
     * @param {string} topic - 研究主题
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
        
        // 重置组件状态
        this.componentStates.clear();
        
        console.log(`[StateManager] 🚀 开始新研究运行: ${runId}, 主题: ${topic.substring(0, 100)}...`);
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
     * 🎯 获取完整状态快照（兼容旧接口）
     * @deprecated 使用 getUnifiedState() 替代
     */
    getStateSnapshot() {
        const unified = this.getUnifiedState();
        return {
            runId: this.runId,
            dataBusSize: this.dataBus.size,
            generatedImagesCount: this.generatedImages.size,
            intermediateStepsCount: this.intermediateSteps.length,
            visitedURLsCount: this.visitedURLs.size,
            metrics: this.metrics,
            currentResearchContext: this.currentResearchContext,
            currentSessionId: this.currentSessionId,
            // 添加组件状态信息到旧接口
            componentCount: this.componentStates.size
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
        this.componentStates.clear();
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