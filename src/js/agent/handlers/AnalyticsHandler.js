// src/static/js/agent/handlers/AnalyticsHandler.js

export class AnalyticsHandler {
    constructor() {
        this.name = 'AnalyticsHandler';
        this.metrics = {
            workflow_starts: 0,
            tool_executions: 0,
            ai_calls: 0,
            errors: 0
        };
    }

    async on_workflow_start(event) {
        this.metrics.workflow_starts++;
        this.trackEvent('workflow_start', event);
    }

    async on_tool_start(event) {
        this.metrics.tool_executions++;
        this.trackEvent('tool_execution', event);
    }

    async on_ai_start(event) {
        this.metrics.ai_calls++;
        this.trackEvent('ai_call', event);
    }

    async on_error(event) {
        this.metrics.errors++;
        this.trackEvent('error', event);
    }

    async on_workflow_end(event) {
        const { result } = event.data;
        this.trackEvent('workflow_complete', {
            ...event,
            data: {
                ...event.data,
                success_rate: result.summary?.successRate,
                total_time: result.summary?.totalExecutionTime
            }
        });
    }

    trackEvent(eventType, event) {
        // 🎯 这里可以集成到分析服务（如Google Analytics, Mixpanel等）
        const analyticsData = {
            event_type: eventType,
            run_id: event.run_id,
            timestamp: event.timestamp,
            name: event.name,
            metadata: event.metadata
        };

        console.log(`📈 Analytics: ${eventType}`, analyticsData);
        
        // 示例：发送到分析端点
        // this.sendToAnalytics(analyticsData);
    }

    getMetrics() {
        return { ...this.metrics };
    }

    resetMetrics() {
        this.metrics = {
            workflow_starts: 0,
            tool_executions: 0,
            ai_calls: 0,
            errors: 0
        };
    }
}