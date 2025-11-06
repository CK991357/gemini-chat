// src/static/js/agent/core/OutputParser.js
export class AgentOutputParser {
    parse(response) {
        const cleanedText = response.trim();
        console.log(`[OutputParser] 解析响应: ${cleanedText.substring(0, 200)}...`);

        // 🎯 强制解析：必须识别出工具调用或最终答案
        const thoughtMatch = cleanedText.match(/Thought:\s*(.*?)(?=Action:|Final Answer:|$)/s);
        const actionMatch = cleanedText.match(/Action:\s*(\w+)/s);
        const actionInputMatch = cleanedText.match(/Action Input:\s*(\{.*?\})/s);
        const finalAnswerMatch = cleanedText.match(/Final Answer:\s*(.*)/s);
        
        let thought = thoughtMatch ? thoughtMatch[1].trim() : '';
        let action = actionMatch ? actionMatch[1].trim() : null;
        let actionInput = actionInputMatch ? this._safeParseJson(actionInputMatch[1]) : {};
        let finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : null;
        
        // 🎯 关键修复：如果模型直接回答问题，强制要求使用工具
        if (finalAnswer && !this._isValidFinalAnswer(finalAnswer)) {
            console.warn('[OutputParser] 检测到过早的最终答案，强制要求使用工具');
            return this._forceToolUsage(cleanedText);
        }
        
        // 🎯 检查是否包含工具调用意图
        const hasToolIntent = cleanedText.includes('Action:') || 
                            cleanedText.includes('工具:') ||
                            this._containsToolKeywords(cleanedText);
        
        const hasFinalAnswer = cleanedText.includes('Final Answer:') || 
                              cleanedText.includes('最终答案:') ||
                              (finalAnswer && this._isValidFinalAnswer(finalAnswer));
        
        console.log('[OutputParser] 解析结果:', {
            thought: thought.substring(0, 100),
            action,
            hasActionInput: !!Object.keys(actionInput).length,
            finalAnswer: finalAnswer ? finalAnswer.substring(0, 100) : null,
            hasToolIntent,
            hasFinalAnswer
        });
        
        if (finalAnswer && hasFinalAnswer) {
            return {
                type: 'final_answer',
                answer: finalAnswer,
                log: thought || '生成最终答案'
            };
        }
        
        if (action && hasToolIntent) {
            return {
                type: 'tool_call',
                tool_name: action,
                parameters: actionInput,
                log: thought || `执行工具: ${action}`
            };
        }
        
        // 🎯 智能工具选择：如果模型分析了问题但没有调用工具，自动选择合适工具
        const suggestedTool = this._suggestTool(cleanedText);
        if (suggestedTool) {
            console.log(`[OutputParser] 智能推荐工具: ${suggestedTool.tool}`);
            return {
                type: 'tool_call',
                tool_name: suggestedTool.tool,
                parameters: suggestedTool.parameters,
                log: thought || `自动选择工具: ${suggestedTool.tool}`
            };
        }
        
        // 🎯 安全兜底：继续思考
        console.warn('[OutputParser] 无法明确解析响应，默认继续思考');
        return {
            type: 'continue_thinking',
            log: cleanedText.substring(0, 500)
        };
    }
    
    /**
     * 🎯 检查是否为有效的最终答案
     */
    _isValidFinalAnswer(answer) {
        if (!answer || answer.trim().length < 50) return false;
        
        // 检查是否包含明显的未完成标记
        const invalidPatterns = [
            'Action:', 'Observation:', '...', '待补充', '需要更多信息',
            '现在开始！', 'Thought:', '思考:'
        ];
        
        return !invalidPatterns.some(pattern => answer.includes(pattern));
    }
    
    /**
     * 🎯 强制模型使用工具
     */
    _forceToolUsage(response) {
        // 根据响应内容推荐合适的工具
        if (response.includes('搜索') || response.includes('查询') || response.includes('search')) {
            return {
                type: 'tool_call',
                tool_name: 'tavily_search',
                parameters: { query: this._extractSearchQuery(response) },
                log: '需要搜索实时信息'
            };
        } else if (response.includes('网页') || response.includes('网站') || response.includes('URL')) {
            return {
                type: 'tool_call', 
                tool_name: 'crawl4ai',
                parameters: { 
                    mode: 'scrape',
                    parameters: { url: this._extractUrl(response) }
                },
                log: '需要获取网页详细信息'
            };
        }
        
        // 默认使用搜索工具
        return {
            type: 'tool_call',
            tool_name: 'tavily_search',
            parameters: { query: '获取最新信息' },
            log: '需要获取实时数据'
        };
    }
    
    /**
     * 🎯 检查是否包含工具关键词
     */
    _containsToolKeywords(text) {
        const toolKeywords = [
            'tavily_search', 'crawl4ai', 'firecrawl', 'python_sandbox',
            '搜索', '抓取', '爬取', '执行代码', '分析数据'
        ];
        return toolKeywords.some(keyword => text.toLowerCase().includes(keyword));
    }
    
    /**
     * 🎯 智能推荐工具
     */
    _suggestTool(response) {
        const lowerResponse = response.toLowerCase();
        
        if (lowerResponse.includes('搜索') || lowerResponse.includes('查询') || lowerResponse.includes('最新') || lowerResponse.includes('实时')) {
            return {
                tool: 'tavily_search',
                parameters: { query: this._extractSearchQuery(response) }
            };
        }
        
        if (lowerResponse.includes('网页') || lowerResponse.includes('网站') || lowerResponse.includes('url') || lowerResponse.includes('http')) {
            return {
                tool: 'crawl4ai',
                parameters: { 
                    mode: 'scrape',
                    parameters: { url: this._extractUrl(response) || 'https://www.example.com' }
                }
            };
        }
        
        if (lowerResponse.includes('代码') || lowerResponse.includes('python') || lowerResponse.includes('执行') || lowerResponse.includes('分析')) {
            return {
                tool: 'python_sandbox',
                parameters: { code: '# 执行分析任务\nprint("开始分析")' }
            };
        }
        
        return null;
    }
    
    _extractSearchQuery(response) {
        const queryMatch = response.match(/(?:搜索|查询|search)\s*[：:]\s*([^。！？\n]+)/);
        return queryMatch ? queryMatch[1].trim() : '获取相关信息';
    }
    
    _extractUrl(response) {
        const urlMatch = response.match(/https?:\/\/[^\s]+/);
        return urlMatch ? urlMatch[0] : null;
    }
    
    _safeParseJson(jsonStr) {
        try {
            let cleaned = jsonStr
                .replace(/(\w+)\s*:/g, '"$1":')
                .replace(/'/g, '"')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');
            return JSON.parse(cleaned);
        } catch (error) {
            console.warn('[OutputParser] JSON解析失败:', error);
            return {};
        }
    }
}