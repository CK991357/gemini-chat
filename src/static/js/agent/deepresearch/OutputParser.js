// src/static/js/agent/deepresearch/OutputParser.js - 健壮性修复版

export class AgentOutputParser {
    
    /**
     * 🎯 关键修复：使用更健壮的正则表达式和解析逻辑
     */
    parse(text) {
        text = text.trim();

        // 优先寻找“最终答案”
        const finalAnswerMatch = text.match(/最终答案\s*:\s*([\s\S]*)/i);
        if (finalAnswerMatch && finalAnswerMatch) {
            return {
                type: 'final_answer',
                answer: finalAnswerMatch.trim()
            };
        }

        // 🎯 关键修复：寻找被代码块包裹或直接暴露的JSON
        // 这个正则表达式可以匹配 ```json ... ``` 或者直接的 {...}
        const actionMatch = text.match(/(?:```json\s*)?(\{[\s\S]*\})(?:\s*```)?/);

        if (actionMatch && actionMatch) {
            try {
                // 清理并解析JSON
                const jsonString = this._cleanupJsonString(actionMatch);
                const actionJson = JSON.parse(jsonString);

                if (actionJson.tool_name && actionJson.parameters) {
                    console.log("[OutputParser] 成功解析出工具调用:", actionJson);
                    return {
                        type: 'tool_call',
                        tool_name: actionJson.tool_name,
                        parameters: actionJson.parameters
                    };
                }
            } catch (e) {
                console.error('[OutputParser] JSON解析失败:', e, "原始字符串:", actionMatch);
            }
        }
        
        // 如果以上都失败，则认为模型仍在思考或格式错误
        console.warn('[OutputParser] 无法解析出有效的行动，将触发自我纠正。');
        return {
            type: 'error',
            log: '无法从LLM响应中解析出有效的工具调用JSON或最终答案。'
        };
    }

    /**
     * 清理LLM可能生成的不规范JSON字符串，例如尾随逗号
     */
    _cleanupJsonString(str) {
        return str.replace(/,(?=\s*[}\]])/g, '');
    }
}