// src/static/js/agent/deepresearch/OutputParser.js - 增强健壮性版本

export class AgentOutputParser {
    parse(text) {
        if (typeof text !== 'string') {
            text = String(text || '');
        }
        text = text.trim();

        console.log('[OutputParser] 原始文本:', text.substring(0, 300) + '...');

        try {
            // 🎯 1. 提取思考过程 (Thought) - 增强模式匹配
            let thought = '';
            const thoughtPatterns = [
                /思考\s*:\s*([\s\S]*?)(?=行动\s*:|最终答案\s*:|$)/i,
                /Thought\s*:\s*([\s\S]*?)(?=Action\s*:|Final Answer\s*:|$)/i,
                /思考\s*：\s*([\s\S]*?)(?=行动\s*：|最终答案\s*：|$)/i
            ];
            
            for (const pattern of thoughtPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    thought = match[1].trim();
                    break;
                }
            }

            // 🎯 2. 增强版最终答案检测 - 多模式匹配
            const finalAnswerPatterns = [
                /最终答案\s*:\s*([\s\S]*)/i,
                /Final Answer\s*:\s*([\s\S]*)/i,
                /最终报告\s*:\s*([\s\S]*)/i,
                /研究报告\s*:\s*([\s\S]*)/i,
                /最终结论\s*:\s*([\s\S]*)/i,
                /#+\s*最终答案\s*\n([\s\S]*)/i,
                /#+\s*Final Answer\s*\n([\s\S]*)/i
            ];

            for (const pattern of finalAnswerPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    const answer = match[1].trim();
                    console.log('[OutputParser] 检测到最终答案，长度:', answer.length);
                    return {
                        type: 'final_answer',
                        answer: answer,
                        thought: thought
                    };
                }
            }

            // 🎯 3. 增强版JSON提取 - 支持多种代码块格式
            const jsonPatterns = [
                /```(?:json)?\s*([\s\S]*?)\s*```/, // 匹配 ```json ... ``` 和 ``` ... ```
                /行动:\s*(\{[\s\S]*\})/i,              // 从 "行动:" 后面直接捕获 { ... }
                /Action:\s*(\{[\s\S]*\})/i,
                /\{[\s\S]*?\}(?=\s*$|\s*思考|\s*行动|\s*最终答案)/  // 纯JSON对象，避免贪婪匹配
            ];

            for (const pattern of jsonPatterns) {
                const match = text.match(pattern);
                if (match) {
                    const jsonString = match[1] || match[2] || match[3] || match[0];
                    try {
                        const cleanedJson = this._cleanupJsonString(jsonString);
                        console.log('[OutputParser] 尝试解析JSON:', cleanedJson.substring(0, 200));
                        
                        const actionJson = JSON.parse(cleanedJson);

                        if (actionJson.tool_name && actionJson.parameters) {
                            console.log("[OutputParser] 成功解析工具调用:", actionJson.tool_name);
                            return {
                                type: 'tool_call',
                                tool_name: actionJson.tool_name,
                                parameters: actionJson.parameters,
                                thought: thought
                            };
                        } else {
                            console.warn('[OutputParser] JSON缺少必要字段:', actionJson);
                            throw new Error(`JSON缺少必要字段: tool_name 或 parameters。实际内容: ${JSON.stringify(actionJson)}`);
                        }
                    } catch (e) {
                        console.warn('[OutputParser] JSON解析失败:', e.message, '原始字符串:', jsonString.substring(0, 100));
                        // 继续尝试其他模式
                    }
                }
            }

            // 🎯 4. 智能推断：如果思考表明任务完成，则返回最终答案
            if (thought) {
                const completionIndicators = [
                    '完成', '足够', '最终', '总结', '结论', '报告',
                    'complete', 'enough', 'final', 'summary', 'conclusion', 'report'
                ];
                
                const hasCompletionIndicator = completionIndicators.some(indicator => 
                    thought.toLowerCase().includes(indicator.toLowerCase())
                );

                if (hasCompletionIndicator) {
                    // 提取思考后的所有内容作为最终答案
                    const thoughtEndIndex = text.indexOf(thought) + thought.length;
                    const remainingText = text.substring(thoughtEndIndex).trim();
                    
                    if (remainingText) {
                        console.log('[OutputParser] 从思考中推断出最终答案');
                        return {
                            type: 'final_answer',
                            answer: remainingText,
                            thought: thought
                        };
                    }
                }
            }

            // 🎯 5. 如果都找不到，提供详细的错误信息
            const errorMsg = '无法解析出有效的行动JSON或最终答案。';
            console.warn('[OutputParser] 解析失败:', errorMsg, "文本开头:", text.substring(0, 200));
            
            throw new Error(`${errorMsg} 请确保输出格式为：思考: ... 行动: {...} 或 最终答案: ...`);

        } catch (e) {
            console.error('[OutputParser] 解析失败:', e.message);
            return {
                type: 'error',
                log: e.message,
                thought: text.substring(0, 500) // 返回部分原始文本作为思考
            };
        }
    }

    _cleanupJsonString(str) {
        // 移除多行注释 /* ... */
        let cleaned = str.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 移除单行注释 // ...
        cleaned = cleaned.replace(/\/\/[^\n\r]*/g, '');
        
        // 移除尾随逗号 (更安全的版本)
        cleaned = cleaned.replace(/,\s*(?=[}\]])/g, '');
        
        // 关键修复：不再全局替换单引号，避免破坏字符串内容。
        // 专注于结构性修复，让 JSON.parse 处理内容。
        
        return cleaned.trim();
    }
}