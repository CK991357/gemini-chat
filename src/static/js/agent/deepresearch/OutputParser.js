// src/static/js/agent/deepresearch/OutputParser.js - 健壮性修复版

export class AgentOutputParser {
    
    /**
     * 🎯 关键修复：使用更健壮的正则表达式和解析逻辑
     */
    parse(text) {
        text = text.trim();

        // 尝试寻找 Final Answer
        const finalAnswerMatch = text.match(/最终答案\s*:\s*([\s\S]*)/i);
        if (finalAnswerMatch && finalAnswerMatch[1]) {
            return {
                type: 'final_answer',
                answer: finalAnswerMatch[1].trim()
            };
        }

        // 🎯 关键修复：寻找被代码块包裹或直接暴露的JSON
        // 正则表达式解释:
        // (```json\s*)? : 可选的 ```json 开头
        // (\{[\s\S]*\})  : 捕获从 { 开始到与之匹配的 } 结束的所有内容
        // \s*```?       : 可选的结尾 ```
        const actionMatch = text.match(/(?:```json\s*)?(\{[\s\S]*\})(?:\s*```)?/);

        if (actionMatch && actionMatch[1]) {
            try {
                // 尝试清理和解析提取到的JSON字符串
                const jsonString = this._cleanupJsonString(actionMatch[1]);
                const actionJson = JSON.parse(jsonString);

                if (actionJson.tool_name && actionJson.parameters) {
                    return {
                        type: 'tool_call',
                        tool_name: actionJson.tool_name,
                        parameters: actionJson.parameters
                    };
                }
            } catch (e) {
                console.error('[OutputParser] JSON解析失败:', e, "原始字符串:", actionMatch[1]);
                // 如果解析失败，继续走下面的逻辑
            }
        }
        
        // 降级方案：如果上面的逻辑都失败了
        console.warn('[OutputParser] 无法解析出有效的行动，将默认继续。');
        return {
            type: 'continue', // 表示需要继续，但没有明确行动
            log: '无法从LLM响应中解析出有效的工具调用或最终答案。'
        };
    }

    /**
     * 清理LLM可能生成的不规范JSON字符串
     */
    _cleanupJsonString(str) {
        // 移除尾随逗号 (trailing commas)
        return str.replace(/,(?=\s*[}\]])/g, '');
    }
}