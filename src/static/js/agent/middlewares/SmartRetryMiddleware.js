// src/static/js/agent/middlewares/SmartRetryMiddleware.js

/**
 * @class SmartRetryMiddleware
 * @description 智能重试中间件 - 根据错误类型和工具特性进行智能重试
 */
export class SmartRetryMiddleware {
    constructor(config = {}) {
        this.name = 'SmartRetryMiddleware';
        
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000, // 1秒基础延迟
            maxDelay: config.maxDelay || 10000,  // 10秒最大延迟
            retryableErrors: config.retryableErrors || [
                'network', 'timeout', 'rate_limit', 'server_error', 'temporary'
            ],
            toolSpecificConfig: config.toolSpecificConfig || {
                'tavily_search': { maxRetries: 2, baseDelay: 2000 },
                'firecrawl': { maxRetries: 3, baseDelay: 3000 },
                'crawl4ai': { maxRetries: 2, baseDelay: 5000 }
            }
        };
        
        this.retryStats = new Map();
    }

    async wrapToolCall(request, next) {
        const toolName = request.toolName;
        const toolConfig = this.config.toolSpecificConfig[toolName] || this.config;
        
        let lastError;
        
        for (let attempt = 1; attempt <= toolConfig.maxRetries; attempt++) {
            try {
                const result = await next(request);
                
                // 🎯 记录成功统计
                this._recordSuccess(toolName);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // 🎯 检查是否应该重试
                if (!this._shouldRetry(error, attempt, toolConfig)) {
                    this._recordFailure(toolName, error.message, false); // 不可重试失败
                    throw error;
                }
                
                // 🎯 计算延迟时间（指数退避）
                const delay = this._calculateDelay(attempt, toolConfig);
                console.warn(`🔄 [SmartRetry] ${toolName} 第 ${attempt} 次尝试失败，${delay}ms后重试:`, error.message);
                
                // 🎯 等待延迟
                await this._sleep(delay);
            }
        }
        
        // 🎯 所有重试都失败
        this._recordFailure(toolName, lastError.message, true); // 可重试但最终失败
        throw lastError;
    }

    async wrapLLMCall(request, next) {
        // 🎯 LLM调用通常不需要重试，因为错误通常是持久的
        // 但可以处理速率限制等临时错误
        try {
            return await next(request);
        } catch (error) {
            // 🎯 只对速率限制错误进行重试
            if (this._isRateLimitError(error) && this.config.maxRetries > 0) {
                console.warn(`🧠 [SmartRetry] LLM速率限制，等待重试...`);
                await this._sleep(5000); // 5秒后重试
                return await next(request);
            }
            throw error;
        }
    }

    // 🎯 判断是否应该重试
    _shouldRetry(error, attempt, toolConfig) {
        // 超过最大重试次数
        if (attempt >= toolConfig.maxRetries) {
            return false;
        }
        
        const errorMessage = error.message.toLowerCase();
        
        // 🎯 网络相关错误 - 应该重试
        if (errorMessage.includes('network') || 
            errorMessage.includes('timeout') ||
            errorMessage.includes('socket') ||
            errorMessage.includes('connection')) {
            return true;
        }
        
        // 🎯 速率限制错误 - 应该重试
        if (errorMessage.includes('rate') || 
            errorMessage.includes('limit') ||
            errorMessage.includes('quota') ||
            errorMessage.includes('429')) {
            return true;
        }
        
        // 🎯 服务器错误 - 应该重试
        if (errorMessage.includes('server') || 
            errorMessage.includes('5xx') ||
            errorMessage.includes('503') ||
            errorMessage.includes('502')) {
            return true;
        }
        
        // 🎯 工具特定的临时错误
        if (errorMessage.includes('temporary') ||
            errorMessage.includes('busy') ||
            errorMessage.includes('try again')) {
            return true;
        }
        
        // 🎯 解析错误、验证错误等通常不应该重试
        return false;
    }

    // 🎯 计算延迟时间（指数退避 + 随机抖动）
    _calculateDelay(attempt, toolConfig) {
        const baseDelay = toolConfig.baseDelay || this.config.baseDelay;
        const maxDelay = toolConfig.maxDelay || this.config.maxDelay;
        
        // 指数退避：2^(attempt-1) * baseDelay
        const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;
        
        // 添加随机抖动（±20%）
        const jitter = exponentialDelay * 0.2 * Math.random();
        const delayWithJitter = exponentialDelay + (Math.random() > 0.5 ? jitter : -jitter);
        
        // 限制最大延迟
        return Math.min(delayWithJitter, maxDelay);
    }

    // 🎯 睡眠函数
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 🎯 判断是否为速率限制错误
    _isRateLimitError(error) {
        const message = error.message.toLowerCase();
        return message.includes('rate') || 
               message.includes('limit') || 
               message.includes('429') ||
               message.includes('quota');
    }

    // 🎯 记录成功统计
    _recordSuccess(toolName) {
        if (!this.retryStats.has(toolName)) {
            this.retryStats.set(toolName, {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                retriedCalls: 0,
                totalRetries: 0
            });
        }
        
        const stats = this.retryStats.get(toolName);
        stats.totalCalls++;
        stats.successfulCalls++;
    }

    // 🎯 记录失败统计
    _recordFailure(toolName, error, wasRetried) {
        if (!this.retryStats.has(toolName)) {
            this.retryStats.set(toolName, {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                retriedCalls: 0,
                totalRetries: 0
            });
        }
        
        const stats = this.retryStats.get(toolName);
        stats.totalCalls++;
        stats.failedCalls++;
        
        if (wasRetried) {
            stats.retriedCalls++;
            stats.totalRetries += this.config.maxRetries;
        }
    }

    // 🎯 获取重试统计报告
    getRetryStats() {
        const report = {
            timestamp: new Date().toISOString(),
            tools: {},
            summary: {
                totalTools: this.retryStats.size,
                totalCalls: 0,
                totalRetries: 0,
                retryRate: 0
            }
        };

        for (const [toolName, stats] of this.retryStats.entries()) {
            report.tools[toolName] = { ...stats };
            report.summary.totalCalls += stats.totalCalls;
            report.summary.totalRetries += stats.totalRetries;
            
            // 计算重试率
            report.tools[toolName].retryRate = stats.totalCalls > 0 ? 
                (stats.retriedCalls / stats.totalCalls) * 100 : 0;
        }

        report.summary.retryRate = report.summary.totalCalls > 0 ? 
            (Object.values(report.tools).reduce((sum, t) => sum + t.retriedCalls, 0) / report.summary.totalCalls) * 100 : 0;

        return report;
    }

    // 🎯 更新配置
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️ [SmartRetry] 配置已更新:', this.config);
    }

    // 🎯 获取中间件状态
    getStatus() {
        return {
            name: this.name,
            config: this.config,
            trackedTools: Array.from(this.retryStats.keys()),
            totalRetryStats: this.getRetryStats().summary
        };
    }
}