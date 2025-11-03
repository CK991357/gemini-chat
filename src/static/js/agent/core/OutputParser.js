// src/static/js/agent/core/OutputParser.js

/**
 * @class AgentOutputParser
 * @description 解析LLM响应，决定下一步行动（ReAct格式）
 */
export class AgentOutputParser {
    /**
     * 🎯 解析LLM响应
     */
    parse(text) {
        const cleanedText = text.trim();
        console.log(`[OutputParser] 解析响应: ${cleanedText.substring(0, 200)}...`);

        // 🎯 检查最终答案
        const finalAnswerMatch = cleanedText.match(/Final Answer:\s*(.*)/is);
        if (finalAnswerMatch) {
            const finalAnswer = finalAnswerMatch[1].trim();
            return {
                type: 'final_answer',
                answer: finalAnswer,
                log: cleanedText
            };
        }

        // 🎯 解析工具调用（ReAct格式）
        const actionMatch = cleanedText.match(/Action:\s*(?<tool>[\w_-]+)\s*\nAction Input:\s*(?<toolInput>\{.*?\})/s);
        if (actionMatch?.groups) {
            try {
                const toolInput = JSON.parse(actionMatch.groups.toolInput.trim());
                return {
                    type: 'tool_call',
                    tool_name: actionMatch.groups.tool.trim(),
                    parameters: toolInput,
                    log: cleanedText
                };
            } catch (parseError) {
                console.error(`[OutputParser] 解析Action Input失败:`, parseError);
                throw new Error(`解析Action Input的JSON格式失败: "${actionMatch.groups.toolInput}"`);
            }
        }

        // 🎯 无法解析，抛出错误让Agent有机会重试
        throw new Error(`无法从LLM输出中解析有效的Action或Final Answer: "${cleanedText.substring(0, 100)}..."`);
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