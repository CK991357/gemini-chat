// src/static/js/agent/deepresearch/OutputParser.js - 最终修复版

export class AgentOutputParser {
    parse(text) {
        if (typeof text !== 'string') {
            text = String(text || '');
        }
        text = text.trim();

        console.log('[OutputParser] 原始文本:', text.substring(0, 300) + (text.length > 300 ? '...' : ''));

        try {
            // 🎯 1. 提取思考过程 - 精确匹配AgentLogic格式
            let thought = '';
            const thoughtMatch = text.match(/思考\s*:\s*([\s\S]*?)(?=行动\s*:|行动输入\s*:|最终答案\s*:|$)/i);
            if (thoughtMatch && thoughtMatch[1]) {
                thought = thoughtMatch[1].trim();
            }
            console.log('[OutputParser] 提取思考内容:', thought.substring(0, 200) + (thought.length > 200 ? '...' : ''));

            // 🎯 2. 最终答案检测 - 精确匹配AgentLogic格式
            const finalAnswerMatch = text.match(/最终答案\s*:\s*([\s\S]*)/i);
            if (finalAnswerMatch && finalAnswerMatch[1]) {
                const answer = finalAnswerMatch[1].trim();
                if (answer.length > 50) {
                    console.log('[OutputParser] ✅ 检测到最终答案，长度:', answer.length);
                    return {
                        type: 'final_answer',
                        answer: answer,
                        thought: thought,
                        thought_length: thought.length
                    };
                }
            }

            // 🎯 3. 核心解析：完全匹配AgentLogic的"行动: 工具名" + "行动输入: {json}"格式
            const toolCallResult = this._parseToolCallFormat(text);
            if (toolCallResult.success) {
                console.log("[OutputParser] ✅ 严格解析成功:", toolCallResult.tool_name);
                return {
                    type: 'tool_call',
                    tool_name: toolCallResult.tool_name,
                    parameters: toolCallResult.parameters,
                    thought: thought,
                    thought_length: thought.length
                };
            }

            // ✨ 新增：宽松解析降级
            console.log('[OutputParser] 严格解析失败，尝试宽松解析...');
            const lenientResult = this._lenientParse(text);
            if (lenientResult.success) {
                console.log('[OutputParser] ✅ 宽松解析成功');
                return {
                    type: 'tool_call',
                    tool_name: lenientResult.tool_name,
                    parameters: lenientResult.parameters,
                    thought: thought,
                    thought_length: thought.length
                };
            }

            // 🎯 4. 智能推断：如果思考表明任务完成，且有报告结构
            if (this._shouldBeFinalAnswer(thought, text)) {
                const inferredAnswer = this._inferFinalAnswer(text, thought);
                if (inferredAnswer) {
                    console.log('[OutputParser] 🤔 从思考中推断出最终答案，长度:', inferredAnswer.length);
                    return {
                        type: 'final_answer',
                        answer: inferredAnswer,
                        thought: thought,
                        thought_length: thought.length
                    };
                }
            }

            // 🎯 5. 精确的错误信息
            const errorMsg = `无法解析出有效的行动或最终答案。请确保输出格式为：
思考: ...
行动: 工具名
行动输入: {"参数": "值"}
或
最终答案: ...`;
            
            console.warn('[OutputParser] ❌ 解析失败:', errorMsg);
            throw new Error(errorMsg);

        } catch (e) {
            console.error('[OutputParser] 💥 解析过程中发生严重错误:', e.message);
            return {
                type: 'error',
                error: e.message,
                thought: text.substring(0, 500),
                thought_length: Math.min(text.length, 500)
            };
        }
    }

    // ✨ 核心方法：解析AgentLogic要求的格式 - 最终修复版
    _parseToolCallFormat(text) {
        try {
            console.log('[OutputParser] 🔍 开始解析工具调用格式...');
            
            // ✅✅✅ --- 核心修复 --- ✅✅✅
            // 使用更强大的文本预处理，移除所有可能的干扰字符
            const preprocessedText = this._preprocessText(text);
            console.log('[OutputParser] 预处理后文本:', preprocessedText.substring(0, 200) + '...');

            // 🎯 修复1：使用更灵活的正则表达式，移除单词边界限制
            const actionLineMatch = preprocessedText.match(/行动\s*:\s*([a-zA-Z0-9_]+)/i);
            if (!actionLineMatch) {
                console.log('[OutputParser] ❌ 未找到"行动:"行');
                return { success: false };
            }

            const tool_name = actionLineMatch[1].trim();
            console.log(`[OutputParser] 🔍 找到工具名: ${tool_name}`);
            
            // 🎯 修复2：使用更强大的JSON提取正则表达式
            const inputLineMatch = preprocessedText.match(/行动输入\s*:\s*(\{[\s\S]*?\})(?=\s*(?:思考|行动|最终答案)|$)/i);
            if (!inputLineMatch) {
                console.log('[OutputParser] ❌ 未找到"行动输入:"行或JSON格式不正确');
                return { success: false };
            }

            let parametersJson = inputLineMatch[1].trim();
            console.log(`[OutputParser] 🔍 找到参数JSON: ${parametersJson.substring(0, 100)}...`);
            
            // 清理JSON字符串
            parametersJson = this._cleanJsonString(parametersJson);
            
            const parameters = JSON.parse(parametersJson);
            
            console.log(`[OutputParser] ✅ 工具调用解析成功: ${tool_name}`, parameters);
            return { 
                success: true, 
                tool_name, 
                parameters 
            };
            
        } catch (e) {
            console.warn('[OutputParser] ❌ 工具调用解析失败:', e.message);
            return { success: false };
        }
    }

    // ✨ 新增：强大的文本预处理方法
    _preprocessText(text) {
        let processed = text;
        
        // 1. 移除所有星号（Markdown格式干扰）
        processed = processed.replace(/\*/g, '');
        
        // 2. 移除零宽度空格和其他不可见字符
        processed = processed.replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // 3. 标准化空白字符：将多个连续空白字符替换为单个空格
        processed = processed.replace(/\s+/g, ' ');
        
        // 4. 移除行首行尾的空白
        processed = processed.trim();
        
        // 5. 确保中英文冒号统一（将英文冒号替换为中文冒号）
        processed = processed.replace(/行动\s*:/g, '行动:').replace(/行动输入\s*:/g, '行动输入:');
        
        console.log('[OutputParser] 文本预处理完成，长度:', processed.length);
        return processed;
    }

    // ✨ 新增：强化JSON清理方法
    _cleanJsonString(str) {
        let cleaned = str;
        
        // 1. 移除尾随逗号（JSON不允许尾随逗号）
        cleaned = cleaned.replace(/,\s*}$/, '}');
        
        // 2. 修复可能的JSON格式问题
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3'); // 确保键被引号包围
        
        // 3. 移除JSON外的任何文本
        const jsonMatch = cleaned.match(/^(\{.*\})$/s);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
        }
        
        return cleaned.trim();
    }

    // ✨ 宽松解析方法 - 保持不变
    _lenientParse(text) {
        console.log('[OutputParser] 执行宽松解析...');
        
        // 1. 提取工具名
        const toolMatch = text.match(/行动\s*:\s*(tavily_search|crawl4ai|python_sandbox)/i);
        if (!toolMatch || !toolMatch[1]) {
            return { success: false };
        }
        const tool_name = toolMatch[1];

        // 2. 提取参数
        const inputMatch = text.match(/行动输入\s*:\s*({[\s\S]*?})/i);
        if (inputMatch && inputMatch[1]) {
            try {
                let jsonStr = inputMatch[1];
                // 修复不完整JSON
                if (!jsonStr.endsWith('}')) jsonStr += '}';
                const parameters = JSON.parse(this._cleanJsonString(jsonStr));
                return { success: true, tool_name, parameters };
            } catch (e) {
                console.warn('[OutputParser] 宽松解析JSON失败:', e.message);
            }
        }
        
        return { success: false };
    }

    // 🛠️ 判断是否应该是最终答案 - 保持不变
    _shouldBeFinalAnswer(thought, fullText) {
        if (!thought) return false;
        
        const completionIndicators = [
            '完成', '足够', '最终', '总结', '结论', '报告', '撰写最终',
            '所有计划步骤已完成', '关键问题都已得到充分回答'
        ];
        
        const hasCompletionIndicator = completionIndicators.some(indicator => 
            thought.toLowerCase().includes(indicator.toLowerCase())
        );
        
        // 检查是否有报告结构（匹配AgentLogic要求的格式）
        const hasReportStructure = /^#\s+.+\n##\s+.+/m.test(fullText);
        
        return hasCompletionIndicator || hasReportStructure;
    }

    // 🛠️ 推断最终答案 - 保持不变
    _inferFinalAnswer(fullText, thought) {
        try {
            // 如果思考后面直接跟着报告结构，提取整个报告
            const thoughtIndex = fullText.indexOf(thought);
            if (thoughtIndex === -1) return null;
            
            const remainingText = fullText.substring(thoughtIndex + thought.length).trim();
            
            // 清理可能的行动标签
            const cleanText = remainingText
                .replace(/^行动\s*:.*$/im, '')
                .replace(/^行动输入\s*:.*$/im, '')
                .trim();
                
            // 检查是否符合最终报告格式要求
            if (cleanText.length > 100 && /^#\s+/.test(cleanText) && cleanText.includes('##')) {
                return cleanText;
            }
            
            return null;
        } catch (e) {
            console.warn('[OutputParser] 推断最终答案失败:', e.message);
            return null;
        }
    }
}