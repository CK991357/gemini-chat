// src/static/js/agent/core/OutputParser.js

/**
 * @class AgentOutputParser
 * @description 研究专用响应解析器，优化用于深度研究任务
 */
export class AgentOutputParser {
    constructor() {
        this.researchMode = true;
        this.strictParsing = true;
    }

    /**
     * 🎯 研究专用解析方法
     */
    parse(response) {
        const cleanedText = response.trim();
        console.log(`[OutputParser] 解析研究响应: ${cleanedText.substring(0, 200)}...`);

        // 🎯 研究专用解析逻辑
        const thoughtMatch = cleanedText.match(/思考:\s*(.*?)(?=行动:|最终答案:|$)/s);
        const actionMatch = cleanedText.match(/行动:\s*([a-zA-Z_][a-zA-Z0-9_]*)/s);
        const actionInputMatch = cleanedText.match(/行动输入:\s*(\{.*?\})/s);
        const finalAnswerMatch = cleanedText.match(/最终答案:\s*(.*)/s);
        
        const thought = thoughtMatch ? thoughtMatch[1].trim() : '';
        const action = actionMatch ? actionMatch[1].trim() : null;
        const actionInput = actionInputMatch ? this._safeParseResearchJson(actionInputMatch[1]) : {};
        const finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : null;

        // 🎯 研究完成检测
        const hasFinalAnswer = this._detectFinalAnswer(cleanedText, finalAnswer);
        const hasToolCall = this._detectToolCall(cleanedText, action);

        console.log('[OutputParser] 研究解析结果:', {
            thoughtLength: thought.length,
            action,
            hasActionInput: !!actionInput && Object.keys(actionInput).length > 0,
            hasFinalAnswer,
            hasToolCall
        });

        // 🎯 最终答案优先级最高
        if (hasFinalAnswer && finalAnswer) {
            return {
                type: 'final_answer',
                answer: finalAnswer,
                log: thought || '研究完成，生成最终答案',
                confidence: this._assessAnswerConfidence(finalAnswer)
            };
        }
        
        // 🎯 有效的工具调用
        if (hasToolCall && action && this._isValidResearchAction(action, actionInput)) {
            return {
                type: 'tool_call',
                tool_name: action,
                parameters: actionInput,
                log: thought || `研究行动: ${action}`,
                researchIntent: this._extractResearchIntent(thought)
            };
        }
        
        // 🎯 继续研究（安全兜底）
        console.warn('[OutputParser] 无法明确解析研究响应，默认继续研究');
        return {
            type: 'continue_research',
            log: this._summarizeForContinuation(cleanedText),
            needsClarification: true
        };
    }
    
    /**
     * 🎯 检测最终答案
     */
    _detectFinalAnswer(text, extractedAnswer) {
        if (extractedAnswer) return true;
        
        const completionIndicators = [
            '最终答案', '最终报告', '研究完成', '综上所述',
            'final answer', 'final report', 'in conclusion',
            '总结', '结论', '报告完成'
        ];
        
        return completionIndicators.some(indicator => 
            text.includes(indicator)
        );
    }

    /**
     * 🎯 检测工具调用
     */
    _detectToolCall(text, extractedAction) {
        if (extractedAction) return true;
        
        const actionIndicators = [
            '行动:', '工具:', '调用:', '使用',
            'action:', 'tool:', 'call:', 'use'
        ];
        
        return actionIndicators.some(indicator => 
            text.includes(indicator)
        );
    }

    /**
     * 🎯 验证研究行动
     */
    _isValidResearchAction(action, parameters) {
        // 🎯 基础验证
        if (!action || typeof action !== 'string') {
            return false;
        }
        
        // 🎯 参数验证
        if (!parameters || typeof parameters !== 'object') {
            return false;
        }
        
        // 🎯 研究工具特定参数验证
        const toolValidations = {
            'tavily_search': (params) => params && typeof params.query === 'string' && params.query.length > 0,
            'crawl4ai': (params) => params && (params.url || params.content),
            'python_sandbox': (params) => params && params.code
        };
        
        const validation = toolValidations[action];
        return validation ? validation(parameters) : true;
    }

    /**
     * 🎯 安全的JSON解析（研究专用）
     */
    _safeParseResearchJson(jsonStr) {
        try {
            if (!jsonStr || typeof jsonStr !== 'string') {
                return {};
            }
            
            // 🎯 增强的JSON清理
            let cleaned = jsonStr
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // 确保键有引号
                .replace(/'/g, '"') // 单引号转双引号
                .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
                .replace(/(\w+)\s*:\s*([^",{}\[\]]+)(?=[,}])/g, '"$1":"$2"') // 处理未引用的字符串值
                .trim();
            
            // 🎯 确保大括号平衡
            const openBraces = (cleaned.match(/{/g) || []).length;
            const closeBraces = (cleaned.match(/}/g) || []).length;
            
            if (openBraces > closeBraces) {
                cleaned += '}'.repeat(openBraces - closeBraces);
            }
            
            const parsed = JSON.parse(cleaned);
            
            // 🎯 后处理：确保参数类型正确
            return this._normalizeResearchParameters(parsed);
            
        } catch (error) {
            console.warn('[OutputParser] 研究JSON解析失败:', error, '原始字符串:', jsonStr);
            
            // 🎯 降级解析：尝试提取关键值对
            return this._fallbackParse(jsonStr);
        }
    }

    /**
     * 🎯 标准化研究参数
     */
    _normalizeResearchParameters(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return {};
        }
        
        const normalized = { ...parameters };
        
        // 🎯 工具特定参数标准化
        if (normalized.query && typeof normalized.query === 'string') {
            normalized.query = normalized.query.trim();
        }
        
        if (normalized.url && typeof normalized.url === 'string') {
            // 🎯 确保URL格式正确
            if (!normalized.url.startsWith('http')) {
                normalized.url = `https://${normalized.url}`;
            }
        }
        
        if (normalized.code && typeof normalized.code === 'string') {
            // 🎯 清理代码参数
            normalized.code = normalized.code.trim();
        }
        
        return normalized;
    }

    /**
     * 🎯 降级解析
     */
    _fallbackParse(text) {
        const result = {};
        
        // 🎯 简单键值对提取
        const patterns = [
            /"([^"]+)"\s*:\s*"([^"]*)"/g, // 双引号键值
            /'([^']+)'\s*:\s*'([^']*)'/g, // 单引号键值
            /(\w+)\s*:\s*"([^"]*)"/g,     // 无引号键，双引号值
            /(\w+)\s*:\s*'([^']*)'/g,     // 无引号键，单引号值
            /(\w+)\s*:\s*([^,}\s]+)/g     // 无引号键值
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const key = match[1].trim();
                let value = match[2].trim();
                
                // 🎯 尝试推断类型
                if (value === 'true' || value === 'false') {
                    value = value === 'true';
                } else if (!isNaN(value) && value !== '') {
                    value = Number(value);
                }
                
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * 🎯 提取研究意图
     */
    _extractResearchIntent(thought) {
        if (!thought) return 'general_research';
        
        const intents = {
            'information_gathering': ['搜索', '查找', '获取', '收集', 'search', 'find'],
            'deep_analysis': ['分析', '解析', '研究', '调查', 'analyze', 'research'],
            'validation': ['验证', '确认', '检查', '核实', 'validate', 'verify'],
            'synthesis': ['综合', '总结', '归纳', '整合', 'synthesize', 'summarize']
        };
        
        const lowerThought = thought.toLowerCase();
        
        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => lowerThought.includes(keyword))) {
                return intent;
            }
        }
        
        return 'general_research';
    }

    /**
     * 🎯 评估答案置信度
     */
    _assessAnswerConfidence(answer) {
        if (!answer || answer.length < 50) return 'low';
        
        const indicators = {
            high: ['研究表明', '根据数据', '统计分析', '实验证明', '研究显示'],
            medium: ['可能', '似乎', '建议', '考虑', '推测'],
            low: ['不确定', '不清楚', '需要更多', '可能不准确']
        };
        
        const lowerAnswer = answer.toLowerCase();
        
        if (indicators.high.some(indicator => lowerAnswer.includes(indicator))) {
            return 'high';
        }
        
        if (indicators.low.some(indicator => lowerAnswer.includes(indicator))) {
            return 'low';
        }
        
        return 'medium';
    }

    /**
     * 🎯 为继续研究生成摘要
     */
    _summarizeForContinuation(text) {
        const sentences = text.split(/[.!?。！？]+/);
        const meaningful = sentences.filter(s => 
            s.length > 10 && 
            !s.includes('思考:') && 
            !s.includes('行动:') &&
            !s.includes('最终答案:')
        );
        
        return meaningful.slice(0, 2).join('. ') + (meaningful.length > 2 ? '...' : '');
    }

    /**
     * 🎯 获取解析器状态
     */
    getStatus() {
        return {
            researchMode: this.researchMode,
            strictParsing: this.strictParsing,
            supportedFormats: ['research_format', 'react_format'],
            type: 'research_output_parser'
        };
    }
}
