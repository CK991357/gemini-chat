// src/static/js/agent/deepresearch/OutputParser.js - 最终优化版 v3.2

// 🎯 JSON解析性能监控类
class JsonParseMetrics {
    constructor() {
        this.metrics = {
            totalAttempts: 0,
            rawFirstSuccess: 0,    // Raw First 策略成功
            repairSuccess: 0,      // 修复后成功
            failures: 0,
            toolSpecificStats: {}
        };
    }
    
    recordAttempt(toolName, success, method) {
        this.metrics.totalAttempts++;
        if (success) {
            if (method === 'raw_first') this.metrics.rawFirstSuccess++;
            else this.metrics.repairSuccess++;
        } else {
            this.metrics.failures++;
        }
        
        if (!this.metrics.toolSpecificStats[toolName]) {
            this.metrics.toolSpecificStats[toolName] = { attempts: 0, successes: 0 };
        }
        this.metrics.toolSpecificStats[toolName].attempts++;
        if (success) this.metrics.toolSpecificStats[toolName].successes++;
        
        console.log(`[OutputParser] ${toolName}: ${success ? '✅' : '❌'} (${method})`);
    }
    
    getReport() {
        const successRate = ((this.metrics.rawFirstSuccess + this.metrics.repairSuccess) / this.metrics.totalAttempts * 100).toFixed(1);
        const rawFirstRate = (this.metrics.rawFirstSuccess / this.metrics.totalAttempts * 100).toFixed(1);
        
        return {
            ...this.metrics,
            successRate: `${successRate}%`,
            rawFirstRate: `${rawFirstRate}%`
        };
    }
}

export class AgentOutputParser {
    constructor() {
        this.metrics = new JsonParseMetrics();
    }

    parse(text) {
        if (typeof text !== 'string') {
            text = String(text || '');
        }

        console.log('[OutputParser] 开始解析，文本长度:', text.length);
        
        // 0. 格式清理：处理模型输出中常见的重复标记和格式错误
        const cleanedText = this._cleanFormatting(text);
        if (cleanedText !== text) {
            console.log('[OutputParser] 已执行格式清理');
        }
        
        // 1. 基础清理：仅移除 Markdown 粗体干扰和规范化冒号
        let preprocessedText = cleanedText.trim()
            .replace(/\*\*\s*(思考|行动|行动输入|最终答案)\s*\*\*/g, '$1')
            .replace(/(思考|行动|行动输入|最终答案)\s*:/g, '$1: ');

        // 2. 优先级 1: 最终答案检测
        const finalAnswerMatch = preprocessedText.match(/最终答案\s*:\s*([\s\S]+)/i);
        if (finalAnswerMatch && finalAnswerMatch[1].trim().length > 50) {
            console.log('[OutputParser] ✅ 检测到最终答案标签');
            this.metrics.recordAttempt('final_answer', true, 'final_answer_tag');
            return {
                type: 'final_answer',
                answer: finalAnswerMatch[1].trim(),
                thought: (preprocessedText.split(/最终答案\s*:/i)[0] || '').replace(/思考\s*:/i, '').trim()
            };
        }

        // 3. 优先级 2: 工具调用解析
        if (/行动\s*:/i.test(preprocessedText)) {
            console.log('[OutputParser] 检测到行动指令，尝试工具解析');
            const toolCallResult = this._parseAsToolCall(preprocessedText);
            if (toolCallResult && toolCallResult.type === 'tool_call') {
                return toolCallResult;
            }
        }
        
        // 4. 优先级 3: 报告结构检测
        if (this._isLikelyFinalReport(preprocessedText)) {
            console.log('[OutputParser] 🎯 检测到报告结构');
            this.metrics.recordAttempt('final_answer', true, 'structure_detection');
            return {
                type: 'final_answer',
                answer: preprocessedText,
                thought: '检测到完整的报告结构'
            };
        }

        // 5. 最后尝试：如果以上都失败，再尝试一次工具解析作为兜底
        console.log('[OutputParser] 所有解析失败，最后尝试工具解析兜底');
        const lastAttempt = this._parseAsToolCall(preprocessedText);
        if (lastAttempt && lastAttempt.type === 'tool_call') {
            return lastAttempt;
        }

        // 6. 解析失败
        const errorMsg = `无法解析出有效的行动或最终答案。请确保输出格式正确。`;
        console.warn('[OutputParser] ❌ 解析彻底失败:', errorMsg);
        this.metrics.recordAttempt('unknown', false, 'all_failed');
        throw new Error(errorMsg);
    }

    /**
     * 🎯 核心方法：格式清理 (容错增强)
     * 在解析前增加文本清理步骤，处理重复标记等非致命格式错误。
     */
    _cleanFormatting(text) {
        let cleaned = text;
        
        // 1. 移除重复的"行动:"标记
        const duplicateActionPattern = /行动:\s*\n\s*行动:/g;
        if (duplicateActionPattern.test(cleaned)) {
            console.warn('[OutputParser] 🛠️ 检测到重复的"行动:"标记，正在清理...');
            cleaned = cleaned.replace(duplicateActionPattern, '行动:');
        }
        
        // 2. 移除重复的"行动输入:"标记
        const duplicateInputPattern = /行动输入:\s*\n\s*行动输入:/g;
        if (duplicateInputPattern.test(cleaned)) {
            console.warn('[OutputParser] 🛠️ 检测到重复的"行动输入:"标记，正在清理...');
            cleaned = cleaned.replace(duplicateInputPattern, '行动输入:');
        }
        
        // 3. 确保"行动:"和"行动输入:"之间有换行
        // 匹配 '行动: tool_name 行动输入:' 并插入换行
        const actionToInputPattern = /行动:\s*([^\n]+)\s*行动输入:/g;
        cleaned = cleaned.replace(actionToInputPattern, '行动: $1\n行动输入:');
        
        // 4. 移除多余的空白行
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        return cleaned;
    }

    _parseAsToolCall(text) {
        console.log('[OutputParser] 开始工具调用解析');

        try {
            // 1. 提取思考过程
            let thought = '';
            const thoughtMatch = text.match(/思考\s*:\s*([\s\S]*?)(?=行动\s*:|行动输入\s*:|最终答案\s*:|$)/i);
            if (thoughtMatch && thoughtMatch[1]) {
                thought = thoughtMatch[1].trim();
                console.log('[OutputParser] 提取思考内容:', thought.substring(0, 100) + (thought.length > 100 ? '...' : ''));
            }

            // 2. 提取工具名
            const actionMatch = text.match(/行动\s*:\s*([a-zA-Z0-9_]+)/i);
            if (!actionMatch) {
                console.warn('[OutputParser] 找到"行动:"但未找到工具名');
                return null;
            }
            const tool_name = actionMatch[1].trim();
            console.log(`[OutputParser] 找到工具名: ${tool_name}`);

            // 3. 🎯 核心：使用 Raw First 策略解析参数
            const paramResult = this._extractAndParseJSON(text, tool_name);
            
            if (paramResult.success) {
                console.log(`[OutputParser] ✅ ${tool_name} 参数解析成功 (${paramResult.method})`);
                this.metrics.recordAttempt(tool_name, true, paramResult.method);
                
                // 针对 python_sandbox 的参数结构归一化
                let finalParameters = paramResult.parameters;
                if (tool_name === 'python_sandbox') {
                    finalParameters = this._normalizePythonParams(finalParameters);
                }

                return {
                    type: 'tool_call',
                    tool_name: tool_name,
                    parameters: finalParameters,
                    thought: thought,
                    thought_length: thought.length
                };
            } else {
                console.warn(`[OutputParser] ❌ 无法解析工具 ${tool_name} 的参数`);
                this.metrics.recordAttempt(tool_name, false, 'failed');
                return null;
            }

        } catch (e) {
            console.error('[OutputParser] 💥 工具调用解析异常:', e);
            return {
                type: 'error',
                error: e.message,
                thought: text.substring(0, 500)
            };
        }
    }

    /**
     * 🎯 核心方法：JSON 提取与解析 (Raw First 策略)
     * 优先信任原始文本，不乱改代码内容
     */
    _extractAndParseJSON(text, toolName) {
        // 定位 "行动输入:"
        const inputMarker = text.match(/行动输入\s*:/i);
        if (!inputMarker) {
            console.log('[OutputParser] ❌ 未找到"行动输入:"关键字');
            return { success: false };
        }

        const startIndex = inputMarker.index + inputMarker[0].length;
        const substring = text.substring(startIndex).trim();

        // --- 策略 A: 原样直接提取 (Raw First) ---
        // 寻找第一个 { 和最后一个 }
        const firstBrace = substring.indexOf('{');
        const lastBrace = substring.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            const rawJson = substring.substring(firstBrace, lastBrace + 1);
            console.log(`[OutputParser] 🔍 Raw First 提取JSON (${rawJson.length}字符):`, rawJson.substring(0, 100) + '...');
            
            try {
                // 🎯 关键：直接解析，不做任何修改（保护Python代码）
                const params = JSON.parse(rawJson);
                console.log(`[OutputParser] ✅ Raw First 解析成功: ${toolName}`);
                return { success: true, parameters: params, method: 'raw_first' };
            } catch (e) {
                console.log('[OutputParser] Raw First 解析失败，尝试修复:', e.message);
            }
        } else {
            console.log('[OutputParser] ❌ 无法找到有效的JSON边界');
            return { success: false };
        }

        // --- 策略 B: 最小化修复 (Minimal Repair) ---
        try {
            let repairJson = substring.substring(firstBrace, lastBrace + 1);
            console.log(`[OutputParser] 🔧 开始最小化修复 (${repairJson.length}字符)`);
            
            // 1. 修复 Markdown 代码块包裹
            repairJson = repairJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            
            // 2. 修复 Python 布尔值/空值 (LLM 常见错误)
            repairJson = repairJson
                .replace(/:\s*True\b/g, ': true')
                .replace(/:\s*False\b/g, ': false')
                .replace(/:\s*None\b/g, ': null');

            // 3. 修复尾随逗号
            repairJson = repairJson.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

            // 4. 修复键名缺少引号（仅针对简单键名）
            repairJson = repairJson.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');

            const params = JSON.parse(repairJson);
            console.log(`[OutputParser] ✅ 最小化修复成功: ${toolName}`);
            return { success: true, parameters: params, method: 'minimal_repair' };

        } catch (e) {
            console.warn('[OutputParser] ❌ 最小化修复失败:', e.message);
        }

        // --- 策略 C: 针对 Python 代码的特殊救援 (Code Rescue) ---
        if (toolName === 'python_sandbox') {
            console.log('[OutputParser] 🐍 Python Sandbox 启动代码救援');
            const extractedCode = this._extractPythonCodeBlock(text);
            if (extractedCode) {
                console.log('[OutputParser] ✅ 代码救援成功，提取代码长度:', extractedCode.length);
                return { 
                    success: true, 
                    parameters: { code: extractedCode }, 
                    method: 'code_rescue' 
                };
            }
        }

        return { success: false };
    }

    /**
     * 针对 python_sandbox 的参数结构归一化
     */
    _normalizePythonParams(params) {
        // 情况 1: { code: "..." } - 标准格式
        if (params.code) {
            return params;
        }
        
        // 情况 2: { parameters: { code: "..." } } - 嵌套格式
        if (params.parameters && params.parameters.code) {
            return params.parameters;
        }
        
        // 情况 3: 直接代码字符串
        if (typeof params === 'string') {
            return { code: params };
        }

        // 情况 4: 其他未知格式，原样返回
        console.warn('[OutputParser] Python Sandbox 参数格式未知，原样返回:', params);
        return params;
    }

    /**
     * 最后的手段：如果 JSON 完全损坏，尝试正则提取代码块
     */
    _extractPythonCodeBlock(text) {
        // 匹配 ```python ... ``` 或 ``` ... ```
        const codeBlockMatch = text.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
            return codeBlockMatch[1].trim();
        }
        return null;
    }

    /**
     * 智能判断是否为报告
     */
    _isLikelyFinalReport(text) {
        if (!text || text.length < 300) return false;
        
        // 检查报告结构特征
        const hasMultipleHeadings = (text.match(/^#+\s+.+$/gm) || []).length >= 2;
        const hasStructuredContent = text.includes('##') || text.includes('###');
        const hasTableStructure = text.includes('|') && text.includes('---');
        const hasConclusionKeywords = /(总结|结论|报告|对比|分析|建议)/.test(text);
        
        // 检查是否包含工具调用格式
        const hasToolCallFormat = /行动\s*:\s*\w+/i.test(text) && 
                                /行动输入\s*:\s*\{/i.test(text);
        
        // 综合判断：有结构化内容且没有工具调用格式
        return (hasMultipleHeadings || hasStructuredContent) && 
               !hasToolCallFormat &&
               (hasTableStructure || hasConclusionKeywords);
    }

    /**
     * 推断最终答案（兜底逻辑）
     */
    _inferFinalAnswer(fullText, thought) {
        try {
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

    /**
     * 判断是否应该是最终答案
     */
    _shouldBeFinalAnswer(thought, fullText) {
        if (!thought) return false;
        
        const completionIndicators = [
            '完成', '足够', '最终', '总结', '结论', '报告', '撰写最终',
            '所有计划步骤已完成', '关键问题都已得到充分回答'
        ];
        
        const hasCompletionIndicator = completionIndicators.some(indicator => 
            thought.toLowerCase().includes(indicator.toLowerCase())
        );
        
        // 检查是否有报告结构
        const hasReportStructure = /^#\s+.+\n##\s+.+/m.test(fullText);
        
        return hasCompletionIndicator || hasReportStructure;
    }

    // 🎯 获取解析指标报告
    getMetricsReport() {
        return this.metrics.getReport();
    }

    // 🎯 重置指标
    resetMetrics() {
        this.metrics = new JsonParseMetrics();
    }
}