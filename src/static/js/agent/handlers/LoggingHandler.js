// src/static/js/agent/handlers/LoggingHandler.js

export class LoggingHandler {
    constructor() {
        this.name = 'LoggingHandler';
        this.logBuffer = [];
    }

    // 🎯 通用事件日志记录
    async onEvent(event) {
        this.logBuffer.push({
            timestamp: event.timestamp,
            event: event.event,
            name: event.name,
            run_id: event.run_id,
            data: this.sanitizeData(event.data)
        });

        // 保持缓冲区大小
        if (this.logBuffer.length > 1000) {
            this.logBuffer = this.logBuffer.slice(-500);
        }
    }

    async on_workflow_start(event) {
        const { workflow } = event.data;
        console.log(`🚀 工作流开始: ${workflow.name} (${workflow.steps.length} 步骤) [${event.run_id}]`);
    }

    async on_step_start(event) {
        const { step, step_index } = event.data;
        console.log(`📋 步骤 ${step_index + 1} 开始: ${step.name} [${event.run_id}]`);
    }

    async on_tool_start(event) {
        const { tool_name, input } = event.data;
        console.log(`🛠️ 工具调用: ${tool_name}`, input);
    }

    async on_ai_start(event) {
        const { step_index } = event.data;
        console.log(`🤔 AI思考开始 - 步骤 ${step_index + 1} [${event.run_id}]`);
    }

    async on_error(event) {
        const { error, step_index } = event.data;
        console.error(`❌ 错误 - 步骤 ${step_index + 1} [${event.run_id}]:`, error);
    }

    async on_workflow_end(event) {
        const { workflow, result } = event.data;
        console.log(`🏁 工作流结束: ${workflow.name} [${event.run_id}]`, result.summary);
    }

    // 🎯 辅助方法
    sanitizeData(data) {
        // 移除敏感信息或过大数据
        const sanitized = { ...data };
        if (sanitized.input && typeof sanitized.input === 'string' && sanitized.input.length > 200) {
            sanitized.input = sanitized.input.substring(0, 200) + '...';
        }
        return sanitized;
    }

    getLogsForRun(runId) {
        return this.logBuffer.filter(log => log.run_id === runId);
    }

    exportLogs() {
        return JSON.stringify(this.logBuffer, null, 2);
    }
}