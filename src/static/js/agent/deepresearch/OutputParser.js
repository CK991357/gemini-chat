// src/static/js/agent/deepresearch/OutputParser.js - 五层防御性解析增强版

// 🎯 新增：JSON解析性能监控类
class JsonParseMetrics {
    constructor() {
        this.metrics = {
            totalAttempts: 0,
            firstTrySuccess: 0,
            fallbackUsed: 0,
            deepRepairUsed: 0,
            failures: 0,
            toolSpecificStats: {}
        };
    }
    
    recordAttempt(toolName, success, method, repairLevel = 0) {
        this.metrics.totalAttempts++;
        
        if (success) {
            if (repairLevel === 0) this.metrics.firstTrySuccess++;
            if (repairLevel === 1) this.metrics.fallbackUsed++;
            if (repairLevel >= 2) this.metrics.deepRepairUsed++;
        } else {
            this.metrics.failures++;
        }
        
        // 工具特定统计
        if (!this.metrics.toolSpecificStats[toolName]) {
            this.metrics.toolSpecificStats[toolName] = { attempts: 0, successes: 0 };
        }
        this.metrics.toolSpecificStats[toolName].attempts++;
        if (success) this.metrics.toolSpecificStats[toolName].successes++;
        
        console.log(`[JsonParseMetrics] ${toolName}: ${success ? '✅' : '❌'} (方法: ${method}, 修复级别: ${repairLevel})`);
    }
    
    getSuccessRate() {
        const successful = this.metrics.totalAttempts - this.metrics.failures;
        return (successful / this.metrics.totalAttempts) * 100;
    }
    
    getReport() {
        return {
            ...this.metrics,
            successRate: this.getSuccessRate(),
            firstTrySuccessRate: (this.metrics.firstTrySuccess / this.metrics.totalAttempts) * 100
        };
    }
}

export class AgentOutputParser {
    constructor() {
        this.metrics = new JsonParseMetrics();
    }

    parse(text) {
        this.metrics.totalAttempts++;
        
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
                    this.metrics.recordAttempt('final_answer', true, 'final_answer_match', 0);
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
                this.metrics.recordAttempt(toolCallResult.tool_name, true, 'strict_parse', 0);
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
                this.metrics.recordAttempt(enhancedLenientResult.tool_name, true, 'enhanced_lenient', 1);
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
                    this.metrics.recordAttempt('inferred_final', true, 'inference', 0);
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
            this.metrics.recordAttempt('unknown', false, 'all_failed', 0);
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

    // 🎯 完全重写的稳健解析方法 - 五层防御性解析
    _parseToolCallFormat(text) {
        console.log('[OutputParser] 🔍 开始智能JSON边界检测...');
        
        try {
            const preprocessedText = this._enhancedPreprocessText(text);
            console.log('[OutputParser] 预处理后文本长度:', preprocessedText.length);

            // 1. 提取工具名（增强正则）
            const actionLineMatch = preprocessedText.match(/行动\s*:\s*([a-zA-Z0-9_]+)/i);
            if (!actionLineMatch) {
                console.log('[OutputParser] ❌ 未找到"行动:"行');
                return { success: false };
            }
            const tool_name = actionLineMatch[1].trim();
            console.log(`[OutputParser] 🔍 找到工具名: ${tool_name}`);

            // 2. 🎯 增强的JSON边界检测
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

            // 3. 🎯 增强的括号计数法（处理嵌套和字符串）
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            let jsonEndIndex = -1;
            let inCodeBlock = false; // 新增：代码块状态

            for (let i = jsonStartIndex; i < preprocessedText.length; i++) {
                const char = preprocessedText[i];
                const prevChar = i > 0 ? preprocessedText[i-1] : '';
                const nextChar = i < preprocessedText.length - 1 ? preprocessedText[i+1] : '';
                
                // 处理转义字符
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                
                // 处理字符串边界
                if (char === '"' && !escapeNext) {
                    // 检查是否是代码块标记
                    if (prevChar === ' ' && nextChar === ' ') {
                        // 可能是独立的引号，不改变字符串状态
                    } else {
                        inString = !inString;
                    }
                    continue;
                }
                
                // 不在字符串中时处理括号
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

            // 4. 🎯 多重降级策略
            if (jsonEndIndex === -1) {
                console.log('[OutputParser] 🟡 JSON括号不匹配，启动降级策略');
                
                // 降级策略1：查找最后一个 '}'
                const lastBraceIndex = preprocessedText.lastIndexOf('}');
                if (lastBraceIndex > jsonStartIndex) {
                    console.log('[OutputParser] 🟡 使用最后一个右括号作为降级方案');
                    jsonEndIndex = lastBraceIndex;
                } 
                // 降级策略2：查找下一个"行动"或"最终答案"
                else {
                    const nextActionIndex = preprocessedText.indexOf('行动:', jsonStartIndex);
                    const nextFinalAnswerIndex = preprocessedText.indexOf('最终答案:', jsonStartIndex);
                    const nextMarkerIndex = Math.min(
                        nextActionIndex !== -1 ? nextActionIndex : Infinity,
                        nextFinalAnswerIndex !== -1 ? nextFinalAnswerIndex : Infinity
                    );
                    
                    if (nextMarkerIndex !== Infinity && nextMarkerIndex > jsonStartIndex) {
                        console.log('[OutputParser] 🟡 使用下一个标记作为边界');
                        jsonEndIndex = nextMarkerIndex - 1;
                    } else {
                        console.log('[OutputParser] ❌ 所有降级策略失败');
                        return { success: false };
                    }
                }
            }

            // 5. 提取并清理JSON字符串
            let parametersJson = preprocessedText.substring(jsonStartIndex, jsonEndIndex + 1);
            console.log(`[OutputParser] 🔍 提取的原始JSON (${parametersJson.length}字符):`, parametersJson.substring(0, 200) + '...');

            // 应用多层清理
            parametersJson = this._enhancedCleanJsonString(parametersJson);
            parametersJson = this._fixCommonJsonErrors(parametersJson);

            try {
                // 如果工具是 python_sandbox，使用更安全的解析策略
                if (tool_name === 'python_sandbox') {
                    // 🎯 特殊处理：保护 code 参数免受过度清理
                    const codeRegex = /"code"\s*:\s*"((?:\\.|[^"\\])*)"/;
                    const codeMatch = parametersJson.match(codeRegex);

                    if (codeMatch && codeMatch[1]) {
                        // 1. 提取原始代码内容 (已转义)
                        let codeContent = codeMatch[1];
                        
                        // 2. 清理JSON的其余部分
                        // 注意：用一个安全的占位符替换代码，以解析其他参数
                        const otherParamsJson = parametersJson.replace(codeRegex, '"code": "PLACEHOLDER"');
                        const otherParams = JSON.parse(this._fixCommonJsonErrors(otherParamsJson));

                        // 3. 将未被破坏的代码重新组合回去
                        const parameters = { ...otherParams, code: codeContent };
                        
                        console.log(`[OutputParser] ✅ Python Sandbox安全解析成功`);
                        return { success: true, tool_name, parameters };
                    }
                }

                // 对于其他工具，继续进行常规解析
                const parameters = JSON.parse(parametersJson);
                console.log(`[OutputParser] ✅ 智能解析成功: ${tool_name}`, {
                    parametersKeys: Object.keys(parameters),
                    parametersPreview: JSON.stringify(parameters).substring(0, 100)
                });
                
                return {
                    success: true,
                    tool_name,
                    parameters
                };

            } catch (jsonError) {
                console.warn('[OutputParser] ❌ 主解析失败，启动深度修复:', jsonError.message);
                return this._executeDeepRepairStrategy(parametersJson, tool_name, text);
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

    // ✨ 增强的文本预处理方法 - 第一层防御
    _enhancedPreprocessText(text) {
        let processed = text;
        
        console.log('[OutputParser] 开始文本预处理，原始长度:', text.length);
        
        // 1. 统一换行符
        processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 2. 处理Agent特定输出格式问题
        // 修复行动输入格式不一致
        processed = processed.replace(/行动\s*输入\s*:\s*\{/g, '行动输入: {');
        processed = processed.replace(/行动\s*:\s*(\w+)/g, '行动: $1');
        
        // 3. 处理代码块中的JSON特殊字符
        // 保护代码块中的换行符和引号
        processed = processed.replace(/```json\n?([\s\S]*?)\n?```/g, (match, code) => {
            // 对代码块内的JSON进行保护性处理
            const protectedCode = code
                .replace(/\n/g, '\\\\n')  // 保护换行符
                .replace(/\t/g, '\\\\t')  // 保护制表符
                .replace(/"/g, '\\"')     // 转义引号
                .replace(/'/g, "\\'");    // 转义单引号
            return `"${protectedCode}"`;
        });
        
        // 4. 修复常见的格式错误
        // 修复缺少逗号的情况
        processed = processed.replace(/([}\]"'])\s*"/g, '$1, "');
        // 修复多余的逗号
        processed = processed.replace(/,\s*([}\]])/g, '$1');
        
        // 5. 处理多行字符串值
        // 将多行字符串转换为单行（但保留\n）
        processed = processed.replace(/\"([^\"]*?)\n+([^\"]*?)\"/g, '"$1\\n$2"');
        
        // 6. 统一空白字符处理（保留原有逻辑）
        processed = processed.replace(/[ \t]+/g, ' ');
        processed = processed.replace(/[\u200B-\u200D\uFEFF]/g, '');
        processed = processed.replace(/行动\s*:/g, '行动:').replace(/行动输入\s*:/g, '行动输入:');
        
        // 7. 智能引号修复
        processed = processed.replace(/[\u201C\u201D]/g, '"');
        processed = processed.replace(/[`]/g, '"');
        
        // 8. 移除Markdown代码块标记但保护内容
        processed = processed.replace(/```(?:json)?/g, '');
        
        console.log('[OutputParser] 增强预处理完成，新长度:', processed.length);
        return processed.trim();
    }

    // ✨ 新增：常见JSON错误自动修复 - 第三层防御
    _fixCommonJsonErrors(jsonStr) {
        let fixed = jsonStr;
        
        console.log('[OutputParser] 开始修复常见JSON错误...');
        
        try {
            // 尝试直接解析，如果成功则无需修复
            JSON.parse(fixed);
            console.log('[OutputParser] JSON无需修复，直接通过');
            return fixed;
        } catch (e) {
            console.log('[OutputParser] 需要修复JSON错误:', e.message);
        }
        
        // 1. 修复键名缺少引号
        // 匹配: { key: value } -> { "key": value }
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
        
        // 2. 修复字符串值中的未转义字符
        fixed = fixed.replace(/("([^"\\]*(\\.[^"\\]*)*)")/g, (match, fullString) => {
            // 对字符串内的内容进行转义处理
            let innerContent = fullString.slice(1, -1); // 去掉外层的引号
            innerContent = innerContent
                .replace(/\n/g, '\\n')
                .replace(/\t/g, '\\t')
                .replace(/\r/g, '\\r')
                .replace(/\f/g, '\\f')
                .replace(/"/g, '\\"')
                .replace(/\\'/g, "'") // 单引号不需要转义
                .replace(/\\\\/g, '\\'); // 保留单个反斜杠
                
            return `"${innerContent}"`;
        });
        
        // 3. 修复尾随逗号
        fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        
        // 4. 修复注释（移除JavaScript风格的注释）
        fixed = fixed.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        
        // 5. 修复布尔值和null
        fixed = fixed.replace(/:(\s*)true(\s*[},])/g, ':$1true$2');
        fixed = fixed.replace(/:(\s*)false(\s*[},])/g, ':$1false$2');
        fixed = fixed.replace(/:(\s*)null(\s*[},])/g, ':$1null$2');
        
        // 6. 确保大括号匹配
        const openBraces = (fixed.match(/{/g) || []).length;
        const closeBraces = (fixed.match(/}/g) || []).length;
        
        if (openBraces > closeBraces) {
            fixed += '}'.repeat(openBraces - closeBraces);
            console.log(`[OutputParser] 修复括号不匹配: 添加了${openBraces - closeBraces}个}`);
        }
        
        console.log('[OutputParser] 常见错误修复完成');
        return fixed;
    }

    // ✨ 新增：深度修复策略 - 第四层防御
    _executeDeepRepairStrategy(originalJson, tool_name, fullText) {
        console.log('[OutputParser] 执行深度修复策略...');
        
        const strategies = [
            this._strategyMinimalRepair.bind(this),
            this._strategyCodeBlockExtraction.bind(this),
            this._strategyPatternBasedRepair.bind(this),
            this._strategyContextAwareRepair.bind(this)
        ];
        
        for (let i = 0; i < strategies.length; i++) {
            console.log(`[OutputParser] 尝试修复策略 ${i + 1}...`);
            const result = strategies[i](originalJson, tool_name, fullText);
            
            if (result.success) {
                console.log(`[OutputParser] ✅ 策略 ${i + 1} 修复成功`);
                return result;
            }
        }
        
        console.log('[OutputParser] ❌ 所有深度修复策略失败');
        return { success: false };
    }

    // 策略1：最小化修复
    _strategyMinimalRepair(jsonStr, tool_name) {
        try {
            // 尝试添加缺失的大括号
            let repaired = jsonStr.trim();
            if (!repaired.startsWith('{')) repaired = '{' + repaired;
            if (!repaired.endsWith('}')) repaired = repaired + '}';
            
            const parameters = JSON.parse(repaired);
            return { success: true, tool_name, parameters };
        } catch (e) {
            return { success: false };
        }
    }

    // 策略2：代码块提取修复（专门处理python_sandbox）
    _strategyCodeBlockExtraction(jsonStr, tool_name, fullText) {
        if (tool_name !== 'python_sandbox') return { success: false };
        
        try {
            // 从完整文本中提取代码部分
            const codeMatch = fullText.match(/\"code\"\s*:\s*\"([\s\S]*?)\"(?=\s*[},])/);
            if (codeMatch) {
                let codeContent = codeMatch[1];
                
                // 处理转义字符
                codeContent = codeContent
                    .replace(/\\\\n/g, '\n')
                    .replace(/\\\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                
                const parameters = { code: codeContent };
                return { success: true, tool_name, parameters };
            }
        } catch (e) {
            console.warn('[OutputParser] 代码块提取失败:', e.message);
        }
        
        return { success: false };
    }

    // 策略3：基于模式的修复
    _strategyPatternBasedRepair(jsonStr, tool_name) {
        try {
            // 基于工具模式进行修复
            let repaired = jsonStr;
            
            // 针对不同工具的特定修复模式
            switch(tool_name) {
                case 'tavily_search':
                    // 修复搜索查询参数
                    repaired = repaired.replace(/"query"\s*:\s*([^,}]+)/g, '"query": "$1"');
                    break;
                case 'crawl4ai':
                    // 修复URL参数
                    repaired = repaired.replace(/"url"\s*:\s*([^,}]+)/g, '"url": "$1"');
                    break;
                case 'python_sandbox':
                    // 修复代码参数
                    repaired = repaired.replace(/"code"\s*:\s*"([^"]*)"/g, (match, code) => {
                        const escapedCode = code.replace(/\n/g, '\\n').replace(/"/g, '\\"');
                        return `"code": "${escapedCode}"`;
                    });
                    break;
            }
            
            const parameters = JSON.parse(repaired);
            return { success: true, tool_name, parameters };
        } catch (e) {
            return { success: false };
        }
    }

    // 策略4：上下文感知修复
    _strategyContextAwareRepair(jsonStr, tool_name, fullText) {
        try {
            // 基于完整上下文的修复
            let repaired = jsonStr;
            
            // 提取思考部分来推断参数
            const thoughtMatch = fullText.match(/思考\s*:\s*([\s\S]*?)(?=行动\s*:|行动输入\s*:|最终答案\s*:|$)/i);
            if (thoughtMatch) {
                const thought = thoughtMatch[1].toLowerCase();
                
                // 基于思考内容推断缺失的参数
                if (tool_name === 'tavily_search' && thought.includes('搜索')) {
                    const searchTermMatch = thought.match(/搜索\s*(.+?)(?=\s|$)/);
                    if (searchTermMatch && !repaired.includes('"query"')) {
                        repaired = repaired.replace(/{/, `{"query": "${searchTermMatch[1]}"`);
                    }
                }
            }
            
            const parameters = JSON.parse(repaired);
            return { success: true, tool_name, parameters };
        } catch (e) {
            return { success: false };
        }
    }

    // ✨ 增强的JSON清理方法 - 专门处理代码块
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

    // 🎯 新增：获取解析指标报告
    getMetricsReport() {
        return this.metrics.getReport();
    }

    // 🎯 新增：重置指标
    resetMetrics() {
        this.metrics = new JsonParseMetrics();
    }
}