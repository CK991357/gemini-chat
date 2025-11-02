// src/static/js/agent/handlers/LearningHandler.js

export class LearningHandler {
    constructor(skillManager) {
        this.skillManager = skillManager;
        this.name = 'LearningHandler';
    }

    async on_tool_end(event) {
        const { tool_name, result, step_index } = event.data;
        
        if (result && result.success !== undefined) {
            this.skillManager.recordToolExecution(
                tool_name,
                result.parameters || {},
                result.success,
                result
            );
        }
    }

    async on_error(event) {
        const { context, step_index } = event.data;
        
        // 🎯 从结构化事件中提取错误信息
        if (context && context.toolName) {
            this.skillManager.recordToolExecution(
                context.toolName,
                context.parameters || {},
                false,
                null,
                event.data.error
            );
        }
    }

    async on_learning_update(event) {
        const { tool_name, success, execution_time } = event.data;
        console.log(`📊 学习更新: ${tool_name}, 成功: ${success}, 耗时: ${execution_time}ms`);
    }

    // 🎯 新增：基于完整事件流的分析
    async on_workflow_end(event) {
        const { result } = event.data;
        
        // 可以在这里进行更复杂的分析
        // 比如：分析整个工作流的性能模式
        this.analyzeWorkflowPatterns(event.run_id, result);
    }

    analyzeWorkflowPatterns(runId, result) {
        // 实现工作流模式分析逻辑
        console.log(`🔍 分析工作流模式: ${runId}`, result.summary);
    }
}