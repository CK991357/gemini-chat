// src/static/js/agent/middlewares/PerformanceMonitorMiddleware.js

/**
 * @class PerformanceMonitorMiddleware
 * @description 性能监控中间件 - 收集工具和LLM调用的性能指标
 */
export class PerformanceMonitorMiddleware {
    constructor() {
        this.name = 'PerformanceMonitorMiddleware';
        this.metrics = {
            toolCalls: new Map(),
            llmCalls: new Map(),
            agentRuns: new Map()
        };
        
        // 🎯 定期清理旧数据（24小时）
        setInterval(() => this.cleanupOldData(), 24 * 60 * 60 * 1000);
    }

    async wrapToolCall(request, next) {
        const startTime = Date.now();
        const toolName = request.toolName;
        
        // 🎯 记录工具调用开始
        this._recordToolStart(toolName);
        
        try {
            const result = await next(request);
            const duration = Date.now() - startTime;
            
            // 🎯 记录成功调用
            this._recordToolSuccess(toolName, duration, result.success);
            
            console.log(`📊 [PerfMonitor] 工具调用: ${toolName} | 耗时: ${duration}ms | 成功: ${result.success}`);
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            // 🎯 记录失败调用
            this._recordToolFailure(toolName, duration, error.message);
            
            console.error(`📊 [PerfMonitor] 工具失败: ${toolName} | 耗时: ${duration}ms | 错误: ${error.message}`);
            throw error;
        }
    }

    async wrapLLMCall(request, next) {
        const startTime = Date.now();
        const model = request.model || 'unknown';
        
        try {
            const result = await next(request);
            const duration = Date.now() - startTime;
            
            // 🎯 记录LLM调用指标
            this._recordLLMCall(model, duration, true);
            
            console.log(`🧠 [PerfMonitor] LLM调用: ${model} | 耗时: ${duration}ms | 有响应: ${!!result.choices}`);
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            // 🎯 记录LLM失败
            this._recordLLMCall(model, duration, false);
            
            console.error(`🧠 [PerfMonitor] LLM失败: ${model} | 耗时: ${duration}ms | 错误: ${error.message}`);
            throw error;
        }
    }

    // 🎯 性能数据记录方法
    _recordToolStart(toolName) {
        if (!this.metrics.toolCalls.has(toolName)) {
            this.metrics.toolCalls.set(toolName, {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                totalDuration: 0,
                lastCalled: null,
                averageDuration: 0
            });
        }
    }

    _recordToolSuccess(toolName, duration, success) {
        const metrics = this.metrics.toolCalls.get(toolName);
        metrics.totalCalls++;
        metrics.totalDuration += duration;
        metrics.lastCalled = new Date().toISOString();
        
        if (success) {
            metrics.successfulCalls++;
        } else {
            metrics.failedCalls++;
        }
        
        metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
    }

    _recordToolFailure(toolName, duration, error) {
        const metrics = this.metrics.toolCalls.get(toolName);
        metrics.totalCalls++;
        metrics.failedCalls++;
        metrics.totalDuration += duration;
        metrics.lastCalled = new Date().toISOString();
        metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
    }

    _recordLLMCall(model, duration, success) {
        if (!this.metrics.llmCalls.has(model)) {
            this.metrics.llmCalls.set(model, {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                totalDuration: 0,
                averageDuration: 0
            });
        }
        
        const metrics = this.metrics.llmCalls.get(model);
        metrics.totalCalls++;
        metrics.totalDuration += duration;
        
        if (success) {
            metrics.successfulCalls++;
        } else {
            metrics.failedCalls++;
        }
        
        metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
    }

    // 🎯 数据清理
    cleanupOldData() {
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        // 清理工具调用数据（保留24小时内）
        for (const [toolName, metrics] of this.metrics.toolCalls.entries()) {
            if (metrics.lastCalled && new Date(metrics.lastCalled).getTime() < twentyFourHoursAgo) {
                this.metrics.toolCalls.delete(toolName);
            }
        }
        
        console.log('🧹 [PerfMonitor] 已清理24小时前的性能数据');
    }

    // 🎯 获取性能报告
    getPerformanceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            tools: {},
            llm: {},
            summary: {
                totalToolCalls: 0,
                totalLLMCalls: 0,
                overallSuccessRate: 0
            }
        };

        // 工具指标
        for (const [toolName, metrics] of this.metrics.toolCalls.entries()) {
            report.tools[toolName] = {
                ...metrics,
                successRate: metrics.totalCalls > 0 ? (metrics.successfulCalls / metrics.totalCalls) * 100 : 0
            };
            report.summary.totalToolCalls += metrics.totalCalls;
        }

        // LLM指标
        for (const [model, metrics] of this.metrics.llmCalls.entries()) {
            report.llm[model] = {
                ...metrics,
                successRate: metrics.totalCalls > 0 ? (metrics.successfulCalls / metrics.totalCalls) * 100 : 0
            };
            report.summary.totalLLMCalls += metrics.totalCalls;
        }

        // 总体成功率
        const totalCalls = report.summary.totalToolCalls + report.summary.totalLLMCalls;
        const totalSuccess = Object.values(report.tools).reduce((sum, t) => sum + t.successfulCalls, 0) +
                           Object.values(report.llm).reduce((sum, l) => sum + l.successfulCalls, 0);
        
        report.summary.overallSuccessRate = totalCalls > 0 ? (totalSuccess / totalCalls) * 100 : 0;

        return report;
    }

    // 🎯 重置指标
    resetMetrics() {
        this.metrics.toolCalls.clear();
        this.metrics.llmCalls.clear();
        this.metrics.agentRuns.clear();
        console.log('🔄 [PerfMonitor] 所有性能指标已重置');
    }

    // 🎯 获取中间件状态
    getStatus() {
        return {
            name: this.name,
            toolMetricsCount: this.metrics.toolCalls.size,
            llmMetricsCount: this.metrics.llmCalls.size,
            lastCleanup: new Date().toISOString()
        };
    }
}