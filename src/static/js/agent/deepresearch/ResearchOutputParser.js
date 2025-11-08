// src/static/js/agent/specialized/ResearchOutputParser.js
export class ResearchOutputParser {
    parse(response) {
        const cleanedText = response.trim();
        
        // 研究Agent使用简化的输出解析
        // 主要识别工具调用和最终报告
        
        if (cleanedText.includes('Final Answer:') || cleanedText.includes('最终答案:')) {
            const finalMatch = cleanedText.match(/(Final Answer:|最终答案:)([\s\S]*)/);
            return {
                type: 'final_answer',
                answer: finalMatch ? finalMatch[2].trim() : cleanedText
            };
        }
        
        // 工具调用识别
        const toolMatch = cleanedText.match(/Action:\s*(\w+).*?Action Input:\s*(\{.*?\})/s);
        if (toolMatch) {
            try {
                const parameters = JSON.parse(toolMatch[2]);
                return {
                    type: 'tool_call', 
                    tool_name: toolMatch[1],
                    parameters: parameters
                };
            } catch (e) {
                console.warn('工具参数解析失败:', e);
            }
        }
        
        // 默认继续思考
        return {
            type: 'continue_thinking',
            log: cleanedText.substring(0, 500)
        };
    }
}