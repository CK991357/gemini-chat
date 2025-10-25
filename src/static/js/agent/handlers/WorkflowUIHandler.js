// src/static/js/agent/handlers/WorkflowUIHandler.js

export class WorkflowUIHandler {
    constructor(workflowUI) {
        this.workflowUI = workflowUI;
        this.name = 'WorkflowUIHandler';
    }

    // 🎯 通用事件处理器 - 处理所有事件
    async onEvent(event) {
        // 可以在这里添加通用的事件处理逻辑
        // 比如：所有事件都记录到调试面板
    }

    async on_workflow_start(event) {
        const { workflow } = event.data;
        this.workflowUI.showWorkflow(workflow);
    }

    async on_step_start(event) {
        const { step_index } = event.data;
        this.workflowUI.updateStep(step_index, 'running');
    }

    async on_step_end(event) {
        const { step_index, result } = event.data;
        const status = result.success ? 'success' : 'failed';
        this.workflowUI.updateStep(step_index, status, result);
    }

    async on_tool_start(event) {
        const { tool_name, step_index } = event.data;
        this.workflowUI.updateStepOutput(step_index, `🛠️ 开始执行工具: ${tool_name}`);
    }

    async on_tool_end(event) {
        const { tool_name, step_index, result } = event.data;
        const status = result?.success ? '✅' : '❌';
        this.workflowUI.updateStepOutput(step_index, `${status} 工具执行完成: ${tool_name}`);
    }

    async on_ai_start(event) {
        const { step_index } = event.data;
        this.workflowUI.updateStepOutput(step_index, `🤔 AI思考中...`);
    }

    async on_ai_stream(event) {
        const { chunk, step_index, chunk_type } = event.data;
        
        // 🎯 根据内容类型进行不同显示
        if (chunk_type === 'reasoning') {
            this.workflowUI.appendStepOutput(step_index, `🧠 ${chunk}`);
        } else {
            this.workflowUI.appendStepOutput(step_index, chunk);
        }
    }

    async on_ai_end(event) {
        const { step_index } = event.data;
        this.workflowUI.updateStepOutput(step_index, `💡 AI思考完成`);
    }

    async on_workflow_end(event) {
        const { workflow, result } = event.data;
        this.workflowUI.showCompletion(result);
    }

    async on_error(event) {
        const { step_index, error } = event.data;
        this.workflowUI.updateStepOutput(step_index, `❌ 错误: ${error.message}`);
    }

    async on_chain_start(event) {
        const { chain_type } = event.data;
        console.log(`🔗 链式执行开始: ${chain_type}`);
    }

    async on_agent_action(event) {
        const { action, step_index } = event.data;
        this.workflowUI.updateStepOutput(step_index, `🎯 代理动作: ${action.type}`);
    }
}