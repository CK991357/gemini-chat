// src/static/js/agent/core/OutputParser.js

/**
 * @class AgentOutputParser
 * @description 解析LLM响应，决定下一步行动（ReAct格式）
 */
export class AgentOutputParser {
    /**
     * 🎯 解析LLM响应
     */
    parse(response) {
        const cleanedText = response.trim();
        console.log(`[OutputParser] 解析响应: ${cleanedText.substring(0, 200)}...`);

        // 🎯 增强解析：准确识别工具调用和最终答案
        const thoughtMatch = cleanedText.match(/Thought:\s*(.*?)(?=Action:|Final Answer:|$)/s);
        const actionMatch = cleanedText.match(/Action:\s*(\w+)/s);
        const actionInputMatch = cleanedText.match(/Action Input:\s*(\{.*?\})/s);
        const finalAnswerMatch = cleanedText.match(/Final Answer:\s*(.*)/s);
        
        let thought = thoughtMatch ? thoughtMatch[1].trim() : '';
        let action = actionMatch ? actionMatch[1].trim() : null;
        let actionInput = actionInputMatch ? this._safeParseJson(actionInputMatch[1]) : {};
        let finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : null;
        
        // 🎯 关键修复：检查是否包含工具调用意图
        const hasToolIntent = cleanedText.includes('Action:') || cleanedText.includes('工具调用');
        const hasFinalAnswer = cleanedText.includes('Final Answer:') || cleanedText.includes('最终答案');
        
        console.log('[OutputParser] 解析结果:', {
            thought: thought.substring(0, 100),
            action,
            hasActionInput: !!actionInput,
            finalAnswer: finalAnswer ? finalAnswer.substring(0, 100) : null,
            hasToolIntent,
            hasFinalAnswer
        });
        
        if (finalAnswer && hasFinalAnswer) {
            return {
                type: 'final_answer',
                answer: finalAnswer,
                log: thought || cleanedText
            };
        }
        
        if (action && hasToolIntent) {
            return {
                type: 'tool_call',
                tool_name: action,
                parameters: actionInput,
                log: thought || cleanedText
            };
        }
        
        // 🎯 安全兜底：如果没有明确指示，默认继续思考
        console.warn('[OutputParser] 无法明确解析响应，默认继续思考');
        return {
            type: 'continue_thinking',
            log: cleanedText.substring(0, 500)
        };
    }
    
    /**
     * 🎯 安全的JSON解析方法
     */
    _safeParseJson(jsonStr) {
        try {
            // 🎯 清理JSON字符串中的潜在问题
            let cleaned = jsonStr
                .replace(/(\w+):/g, '"$1":') // 确保键有引号
                .replace(/'/g, '"') // 单引号转双引号
                .replace(/,\s*}/g, '}') // 移除尾随逗号
                .replace(/,\s*]/g, ']');
                
            return JSON.parse(cleaned);
        } catch (error) {
            console.warn('[OutputParser] JSON解析失败，返回空对象:', error);
            return {};
        }
    }

    /**
     * 🎯 获取解析器状态
     */
    getStatus() {
        return {
            supportedFormats: ['react_format'],
            type: 'agent_output_parser'
        };
    }
}