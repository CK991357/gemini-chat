// src/static/js/agent/deepresearch/OutputParser.js - 健壮性修复版

export class AgentOutputParser {
    parse(text) {
        if (typeof text !== 'string') {
            text = ''; // 防止传入非字符串
        }
        text = text.trim();

        // 优先寻找“最终答案”
        const finalAnswerMatch = text.match(/最终答案\s*:\s*([\s\S]*)/i);
        if (finalAnswerMatch && finalAnswerMatch[1]) {
            // 🎯 关键修复：在捕获的字符串上调用 .trim()
            return {
                type: 'final_answer',
                answer: finalAnswerMatch[1].trim()
            };
        }

        // 寻找Action的JSON代码块
        const actionMatch = text.match(/(?:```json\s*)?(\{[\s\S]*\})(?:\s*```)?/);
        if (actionMatch && actionMatch[1]) {
            try {
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
            }
        }
        
        console.warn('[OutputParser] 无法解析出有效的行动，将触发自我纠正。');
        return {
            type: 'error',
            log: '无法从LLM响应中解析出有效的工具调用JSON或最终答案。'
        };
    }

    _cleanupJsonString(str) {
        // 移除尾随逗号
        return str.replace(/,(?=\s*[}\]])/g, '');
    }
}