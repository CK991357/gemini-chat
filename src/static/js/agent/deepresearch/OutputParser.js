// src/static/js/agent/deepresearch/OutputParser.js - 增强稳健版本

export class AgentOutputParser {
    parse(text) {
        if (typeof text !== 'string') {
            text = String(text || '');
        }
        text = text.trim();

        console.log('[OutputParser] 原始文本长度:', text.length);

        // 🎯 增强：智能检测完整报告并直接返回
        if (this._isLikelyFinalReport(text)) {
            console.log('[OutputParser] 🎯 检测到完整报告结构，直接作为最终答案');
            return {
                type: 'final_answer',
                answer: text,
                thought: '检测到完整的报告结构，直接作为最终答案输出',
                thought_length: 0
            };
        }

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

            // ✨ 新增：增强的宽松解析降级
            console.log('[OutputParser] 严格解析失败，尝试增强宽松解析...');
            const enhancedLenientResult = this._enhancedLenientParse(text);
            if (enhancedLenientResult.success) {
                console.log('[OutputParser] ✅ 增强宽松解析成功');
                return {
                    type: 'tool_call',
                    tool_name: enhancedLenientResult.tool_name,
                    parameters: enhancedLenientResult.parameters,
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

    // 🎯 完全重写的稳健解析方法
    _parseToolCallFormat(text) {
        console.log('[OutputParser] 🔍 开始稳健解析工具调用格式...');
        
        try {
            const preprocessedText = this._enhancedPreprocessText(text);
            console.log('[OutputParser] 预处理后文本长度:', preprocessedText.length);

            // 1. 提取工具名
            const actionLineMatch = preprocessedText.match(/行动\s*:\s*([a-zA-Z0-9_]+)/i);
            if (!actionLineMatch) {
                console.log('[OutputParser] ❌ 未找到"行动:"行');
                return { success: false };
            }
            const tool_name = actionLineMatch[1].trim();
            console.log(`[OutputParser] 🔍 找到工具名: ${tool_name}`);

            // 2. 🎯 核心修复：使用精确的JSON边界检测
            const inputKeyword = '行动输入:';
            const inputIndex = preprocessedText.indexOf(inputKeyword);
            if (inputIndex === -1) {
                console.log('[OutputParser] ❌ 未找到"行动输入:"关键字');
                return { success: false };
            }

            // 在"行动输入:"后查找第一个 '{'
            const jsonStartIndex = preprocessedText.indexOf('{', inputIndex);
            if (jsonStartIndex === -1) {
                console.log('[OutputParser] ❌ 在"行动输入:"后未找到JSON起始括号"{"');
                return { success: false };
            }

            // 3. 🎯 使用括号计数法精确提取完整JSON对象
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            let jsonEndIndex = -1;

            // 从第一个 '{' 开始扫描
            for (let i = jsonStartIndex; i < preprocessedText.length; i++) {
                const char = preprocessedText[i];
                
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                
                if (char === '"' && !escapeNext) {
                    inString = !inString;
                    continue;
                }
                
                if (!inString) {
                    if (char === '{') {
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        
                        if (braceCount === 0) {
                            jsonEndIndex = i;
                            break;
                        }
                    }
                }
            }

            if (jsonEndIndex === -1) {
                console.log('[OutputParser] ❌ JSON括号不匹配，无法找到完整的JSON对象');
                
                // 🎯 优雅降级：尝试查找最后一个 '}' 
                const lastBraceIndex = preprocessedText.lastIndexOf('}');
                if (lastBraceIndex > jsonStartIndex) {
                    console.log('[OutputParser] 🟡 使用最后一个右括号作为降级方案');
                    jsonEndIndex = lastBraceIndex;
                } else {
                    return { success: false };
                }
            }

            // 4. 提取JSON字符串
            let parametersJson = preprocessedText.substring(jsonStartIndex, jsonEndIndex + 1);
            console.log(`[OutputParser] 🔍 提取的原始JSON (${parametersJson.length}字符):`, parametersJson.substring(0, 200) + '...');

            // 5. 清理和验证JSON
            parametersJson = this._enhancedCleanJsonString(parametersJson);
            
            try {
                const parameters = JSON.parse(parametersJson);
                console.log(`[OutputParser] ✅ 工具调用解析成功: ${tool_name}`, {
                    parametersKeys: Object.keys(parameters),
                    parametersPreview: JSON.stringify(parameters).substring(0, 100)
                });
                
                return { 
                    success: true, 
                    tool_name, 
                    parameters 
                };
                
            } catch (jsonError) {
                console.warn('[OutputParser] ❌ JSON解析失败:', jsonError.message);
                
                // 🎯 深度修复尝试
                const repairedJson = this._deepJsonRepair(parametersJson);
                if (repairedJson) {
                    try {
                        const parameters = JSON.parse(repairedJson);
                        console.log(`[OutputParser] ✅ 深度修复成功: ${tool_name}`);
                        return { success: true, tool_name, parameters };
                    } catch (repairedError) {
                        console.warn('[OutputParser] ❌ 深度修复也失败:', repairedError.message);
                    }
                }
                
                return { success: false };
            }
            
        } catch (error) {
            console.error('[OutputParser] 💥 解析过程中发生严重错误:', error);
            return { success: false };
        }
    }

    // 🎯 新增：智能报告检测方法
    _isLikelyFinalReport(text) {
        if (!text || text.length < 300) return false;
        
        // 检查报告结构特征
        const hasMultipleHeadings = (text.match(/^#+\s+.+$/gm) || []).length >= 2;
        const hasStructuredContent = text.includes('##') || text.includes('###');
        const hasTableStructure = text.includes('|') && text.includes('---');
        const hasConclusionKeywords = /(总结|结论|报告|对比|分析|建议)/.test(text);
        
        // 检查是否包含工具调用格式（如果有则不是最终报告）
        const hasToolCallFormat = /行动\s*:\s*\w+/i.test(text) && 
                                /行动输入\s*:\s*\{/i.test(text);
        
        // 综合判断：有结构化内容且没有工具调用格式
        return (hasMultipleHeadings || hasStructuredContent) && 
               !hasToolCallFormat &&
               (hasTableStructure || hasConclusionKeywords);
    }

    // ✨ 新增：增强的文本预处理方法
    _enhancedPreprocessText(text) {
        let processed = text;
        
        // 1. 移除Markdown代码块标记（如果有）
        processed = processed.replace(/```(?:json)?/g, '');
        
        // 2. 移除所有星号（Markdown格式干扰）
        processed = processed.replace(/\*/g, '');
        
        // 3. 移除零宽度空格和其他不可见字符
        processed = processed.replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // 4. 标准化空白字符：将多个连续空白字符替换为单个空格，但保留换行符
        processed = processed.replace(/[ \t]+/g, ' ');
        
        // 5. 处理引号：将智能引号转换为标准引号
        processed = processed.replace(/[\u201C\u201D]/g, '"');
        
        // 6. 移除行首行尾的空白
        processed = processed.trim();
        
        // 7. 确保中英文冒号统一（将英文冒号替换为中文冒号）
        processed = processed.replace(/行动\s*:/g, '行动:').replace(/行动输入\s*:/g, '行动输入:');
        
        console.log('[OutputParser] 增强文本预处理完成，长度:', processed.length);
        return processed;
    }

    // ✨ 新增：增强的JSON清理方法 - 专门处理代码块
    _enhancedCleanJsonString(str) {
        let cleaned = str;
        
        // 1. 修复常见的JSON格式问题
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3'); // 确保键被引号包围
        
        // 2. 处理字符串值中的转义字符
        cleaned = cleaned.replace(/\\n/g, '\\\\n')  // 保留代码中的换行符
                        .replace(/\\t/g, '\\\\t')  // 保留代码中的制表符
                        .replace(/\\"/g, '\\\\"'); // 正确处理转义引号
        
        // 3. 修复尾随逗号（JSON不允许尾随逗号）
        cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        
        // 4. 处理多行字符串值 - 将换行符转换为转义序列
        cleaned = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
            // 在JSON字符串值中，将换行符转换为\n转义序列
            return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        });
        
        // 5. 移除JSON外的任何文本
        const jsonMatch = cleaned.match(/^(\{[\s\S]*\})$/s);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
        }
        
        console.log('[OutputParser] JSON清理完成，长度:', cleaned.length);
        return cleaned.trim();
    }

    // ✨ 新增：增强的宽松解析方法 - 专门处理复杂代码块
    _enhancedLenientParse(text) {
        console.log('[OutputParser] 执行增强宽松解析...');
        
        try {
            // 1. 提取工具名 - 更灵活的正则
            const toolMatch = text.match(/行动\s*:\s*(tavily_search|crawl4ai|python_sandbox|glm4v_analyze_image|stockfish_analyzer|firecrawl)/i);
            if (!toolMatch || !toolMatch[1]) {
                console.log('[OutputParser] 增强宽松解析: 未找到工具名');
                return { success: false };
            }
            const tool_name = toolMatch[1];

            // 2. 增强的参数提取 - 处理复杂的代码块
            const inputMatch = text.match(/行动输入\s*:\s*(\{[\s\S]*?\})(?=\s*(?:思考|行动|最终答案)|$)/i);
            if (!inputMatch || !inputMatch[1]) {
                console.log('[OutputParser] 增强宽松解析: 未找到行动输入');
                return { success: false };
            }

            let jsonStr = inputMatch[1];
            
            // 3. 增强的JSON修复
            jsonStr = this._repairComplexJson(jsonStr);
            
            try {
                const parameters = JSON.parse(jsonStr);
                console.log('[OutputParser] 增强宽松解析成功:', tool_name);
                return { success: true, tool_name, parameters };
            } catch (jsonError) {
                console.warn('[OutputParser] 增强宽松解析JSON失败，尝试深度修复:', jsonError.message);
                
                // 深度修复尝试
                const repairedJson = this._deepJsonRepair(jsonStr);
                if (repairedJson) {
                    try {
                        const parameters = JSON.parse(repairedJson);
                        console.log('[OutputParser] ✅ 深度修复成功');
                        return { success: true, tool_name, parameters };
                    } catch (e) {
                        console.warn('[OutputParser] 深度修复失败:', e.message);
                    }
                }
            }
            
            return { success: false };
            
        } catch (e) {
            console.warn('[OutputParser] 增强宽松解析异常:', e.message);
            return { success: false };
        }
    }

    // ✨ 新增：复杂JSON修复方法
    _repairComplexJson(jsonStr) {
        let repaired = jsonStr;
        
        try {
            // 尝试直接解析，如果成功则无需修复
            JSON.parse(repaired);
            return repaired;
        } catch (e) {
            console.log('[OutputParser] 需要修复JSON:', e.message);
        }
        
        // 1. 修复未闭合的括号
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        
        if (openBraces > closeBraces) {
            repaired += '}'.repeat(openBraces - closeBraces);
        }
        
        // 2. 修复字符串中的转义问题
        repaired = repaired.replace(/(?<!\\)"/g, '\\"'); // 转义未转义的双引号
        
        // 3. 修复尾随逗号
        repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        
        // 4. 修复代码块中的特殊字符
        repaired = repaired.replace(/"code"\s*:\s*"([\s\S]*?)"/g, (match, codeContent) => {
            // 对代码内容进行转义处理
            const escapedCode = codeContent
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\t/g, '\\t')
                .replace(/\r/g, '\\r');
            return `"code": "${escapedCode}"`;
        });
        
        return repaired;
    }

    // ✨ 新增：深度JSON修复方法
    _deepJsonRepair(jsonStr) {
        try {
            // 尝试使用更激进的方法修复
            let repaired = jsonStr;
            
            // 1. 确保整个字符串被大括号包围
            if (!repaired.trim().startsWith('{')) {
                repaired = '{' + repaired;
            }
            if (!repaired.trim().endsWith('}')) {
                repaired = repaired + '}';
            }
            
            // 2. 修复键值对格式
            repaired = repaired.replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
            
            // 3. 修复字符串值
            let inString = false;
            let result = '';
            
            for (let i = 0; i < repaired.length; i++) {
                const char = repaired[i];
                
                if (char === '"' && (i === 0 || repaired[i-1] !== '\\')) {
                    inString = !inString;
                }
                
                if (!inString && char === '\n') {
                    result += '\\n';
                } else if (!inString && char === '\t') {
                    result += '\\t';
                } else {
                    result += char;
                }
            }
            
            repaired = result;
            
            // 4. 最终验证
            JSON.parse(repaired);
            return repaired;
            
        } catch (e) {
            console.warn('[OutputParser] 深度JSON修复失败:', e.message);
            return null;
        }
    }

    // ✨ 保留原有的宽松解析方法作为备用
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
                const parameters = JSON.parse(this._enhancedCleanJsonString(jsonStr));
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