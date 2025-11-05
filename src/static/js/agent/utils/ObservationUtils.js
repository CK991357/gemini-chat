// src/static/js/agent/utils/ObservationUtils.js
export class ObservationUtils {
    /**
     * 🎯 统一规范化工具返回结果
     */
    static normalizeToolResult(rawResult) {
        // 🛡️ 防御性检查
        if (rawResult === null || rawResult === undefined) {
            return { 
                success: false, 
                output: '工具返回空结果', 
                _rawResult: rawResult,
                _normalized: true
            };
        }

        // 如果已经是规范化格式，直接返回
        if (this.isNormalizedObservation(rawResult)) {
            return { ...rawResult, _normalized: true };
        }

        let success = true;
        let outputText = '';
        let extractedFrom = '';

        try {
            // 🎯 类型化处理
            if (typeof rawResult === 'string') {
                outputText = rawResult;
                extractedFrom = 'string';
                success = !outputText.toLowerCase().includes('失败') && 
                         !outputText.toLowerCase().includes('错误');
            } else if (typeof rawResult === 'object') {
                // 🎯 关键修复：优先使用工具返回的成功状态
                if (rawResult.success === false) {
                    success = false;
                } else if (rawResult.success === true) {
                    success = true;
                }
                
                // 🎯 智能提取输出文本
                const extraction = this.extractOutputText(rawResult);
                outputText = extraction.text;
                extractedFrom = extraction.source;
                
                // 🎯 修复：对于 crawl4ai 的特殊格式处理
                if (!outputText && rawResult.title && rawResult.content) {
                    outputText = `标题: ${rawResult.title}\n内容: ${rawResult.content}`;
                    extractedFrom = 'crawl4ai_format';
                    success = true; // 有标题和内容意味着成功
                }
                
                // 如果没有提取到有效文本，序列化整个对象
                if (!outputText || outputText.trim() === '') {
                    outputText = this.safeStringify(rawResult);
                    extractedFrom = 'stringify';
                }
                
                // 🎯 检查是否有错误字段
                if (rawResult.error) {
                    success = false;
                    if (!outputText.includes('失败') && !outputText.includes('错误')) {
                        outputText = `错误: ${rawResult.error}`;
                    }
                }
            } else {
                // 数字、布尔值等基本类型
                outputText = String(rawResult);
                success = !!rawResult;
                extractedFrom = 'primitive';
            }

            // 🎯 构建规范化对象
            const normalized = {
                success,
                output: outputText,
                _rawResult: rawResult,
                _normalized: true,
                _extractedFrom: extractedFrom,
                _timestamp: Date.now()
            };

            // 🎯 保留原始的重要字段（避免破坏性修改）
            if (typeof rawResult === 'object' && !Array.isArray(rawResult)) {
                Object.keys(rawResult).forEach(key => {
                    if (!['success', 'output', '_normalized'].includes(key)) {
                        normalized[key] = rawResult[key];
                    }
                });
            }

            console.log(`[ObservationUtils] 规范化完成:`, {
                inputType: typeof rawResult,
                outputLength: outputText.length,
                success,
                extractedFrom
            });

            return normalized;

        } catch (error) {
            console.error('[ObservationUtils] 规范化失败:', error);
            return {
                success: false,
                output: `规范化失败: ${error.message}`,
                _rawResult: rawResult,
                _normalizationError: true,
                _error: error.message
            };
        }
    }

    /**
     * 🎯 检查是否为已规范化的 observation
     */
    static isNormalizedObservation(obj) {
        return obj && 
               typeof obj === 'object' && 
               typeof obj.output === 'string' && 
               (obj._normalized === true || (typeof obj.success === 'boolean'));
    }

    /**
     * 🎯 安全地从对象中提取输出文本
     */
    static extractOutputText(obj) {
        if (!obj || typeof obj !== 'object') {
            return { text: '', source: 'invalid' };
        }

        // 🎯 优先级提取序列 - 增加更多可能的输出字段
        const textFields = [
            'stdout', 'output', 'result', 'text', 'message', 
            'content', 'data', 'error', 'stderr', 'title', 'body'
        ];

        for (const field of textFields) {
            const value = obj[field];
            if (typeof value === 'string' && value.trim() !== '') {
                return { text: value, source: field };
            }
        }

        // 🎯 嵌套对象检查
        if (obj.output && typeof obj.output === 'object') {
            const nestedExtraction = this.extractOutputText(obj.output);
            if (nestedExtraction.text) {
                return { 
                    text: nestedExtraction.text, 
                    source: `output.${nestedExtraction.source}` 
                };
            }
        }

        return { text: '', source: 'none' };
    }

    /**
     * 🎯 安全地序列化对象
     */
    static safeStringify(obj) {
        try {
            const seen = new WeakSet();
            return JSON.stringify(obj, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                return value;
            }, 2);
        } catch (error) {
            try {
                // 尝试简单序列化
                return String(obj);
            } catch {
                return '[无法序列化的对象]';
            }
        }
    }

    /**
     * 🎯 统一的输出文本提取（供其他类使用）
     */
    static getOutputText(observation) {
        if (!observation) return '';

        try {
            // 如果是字符串，直接返回
            if (typeof observation === 'string') return observation;

            // 如果是规范化对象，使用 output 字段
            if (this.isNormalizedObservation(observation)) {
                return observation.output || '';
            }

            // 否则进行提取
            const extraction = this.extractOutputText(observation);
            return extraction.text;
        } catch (error) {
            console.warn('[ObservationUtils] getOutputText 失败:', error);
            try {
                return String(observation);
            } catch {
                return '[无法提取文本]';
            }
        }
    }

    /**
     * 🎯 检查是否为错误结果
     */
    static isErrorResult(observation) {
        if (!observation) return false;
        
        const outputText = this.getOutputText(observation);
        const lowerText = outputText.toLowerCase();
        
        return lowerText.includes('失败') || 
               lowerText.includes('错误') || 
               lowerText.includes('error') ||
               (observation.success === false) ||
               (observation.isError === true);
    }
}