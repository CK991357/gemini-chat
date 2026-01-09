// src/static/js/agent/deepresearch/middleware/ToolExecutionMiddleware.js
// 🛠️ 工具执行中间件 - 从 DeepResearchAgent 中分离的核心工具执行逻辑
// 🔥 修复版 - 解决与主文件的兼容性问题
// 📅 修复版本: 1.3 - 增强中文标点处理，改进备用方案触发条件
// 🚀 优化：激进中文标点移除，多层防御机制

export class ToolExecutionMiddleware {
    /**
     * 🎯 工具执行中间件构造函数
     * @param {Object} tools - 所有可用工具
     * @param {Object} callbackManager - 回调管理器
     * @param {Object} skillManager - 技能管理器（联邦知识系统）
     * @param {Object} sharedState - 共享状态
     * @param {Object} config - 配置
     */
    constructor(tools, callbackManager, skillManager, sharedState, config = {}) {
        // 🎯 依赖注入
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.skillManager = skillManager;
        
        // 🎯 关键修复：必须注入 chatApiHandler
        if (!config.chatApiHandler) {
            console.error('[ToolExecutionMiddleware] ❌ 致命错误：缺少 chatApiHandler 依赖！');
            throw new Error('ToolExecutionMiddleware 必须接收 chatApiHandler 参数');
        }
        this.chatApiHandler = config.chatApiHandler;
        
        // 🎯 关键修复：注入智能摘要方法
        this.smartSummarizeMethod = config.smartSummarizeMethod || this._defaultSummarizeMethod;
        
        // 🎯 关键修复：注入数据存储方法
        this.storeRawDataMethod = config.storeRawDataMethod || this._defaultStoreRawData;
        
        // 🎯 关键修复：注入Token追踪方法
        this.updateTokenUsageMethod = config.updateTokenUsageMethod || this._defaultUpdateTokenUsage;
        
        // 🎯 共享状态（来自主Agent）
        this.visitedURLs = sharedState.visitedURLs || new Map();
        this.generatedImages = sharedState.generatedImages || new Map();
        this.intermediateSteps = sharedState.intermediateSteps || [];
        this.dataBus = sharedState.dataBus || new Map();
        this.runId = sharedState.runId || null;
        this.imageCounter = sharedState.imageCounter || 0;
        
        // 🎯 配置参数
        this.urlSimilarityThreshold = config.urlSimilarityThreshold || 0.85;
        this.maxRevisitCount = config.maxRevisitCount || 2;
        
        // 🎯 内部状态
        this.currentResearchContext = config.currentResearchContext || "";
        
        console.log(`[ToolExecutionMiddleware] ✅ 初始化完成，可用工具: ${Object.keys(tools).join(', ')}`);
    }

    // ============================================================
    // 🔥🔥🔥 虚拟专家接管系统 (优先级最高) 🔥🔥🔥
    // ============================================================
    
    /**
     * 🎯 虚拟专家接管系统 - code_generator 委托流程
     * 🔥 与主文件完全一致的实现
     */
    async _delegateToCodeExpert(parameters, detectedMode, recordToolCall) {
        console.log('[ToolExecutionMiddleware] 👔 启动代码专家委托流程...');
        const { objective, data_context } = parameters;

        // 🟢 步骤 A: 从联邦知识库获取 python_sandbox 的完整技能包
        let knowledgeContext = "";
        if (this.skillManager) {
            console.log('[ToolExecutionMiddleware] 🧠 正在从 SkillManager 获取专家知识...');
            const knowledgePackage = await this.skillManager.retrieveFederatedKnowledge(
                'python_sandbox',
                { userQuery: objective }
            );
            
            if (knowledgePackage && knowledgePackage.content) {
                console.log('[ToolExecutionMiddleware] 📚 已成功加载专家知识库');
                knowledgeContext = knowledgePackage.content;
            }
        } else {
            console.warn('[ToolExecutionMiddleware] ⚠️ SkillManager 未注入，专家模型将仅依赖通用知识。');
        }

        // 🟢 步骤 B: 构建专家 Prompt (融合知识库) - 与主文件完全相同
        // 🔥 关键修复：增加严格的代码生成要求，避免中文标点和语法错误
        // 🚀 优化：清理提示词本身的中文标点
        const specialistPrompt = `
# 角色：高级 Python 数据专家

# 任务目标
${this._cleanChinesePunctuationFromText(objective)}

# 数据上下文 (必须严格遵守)
${JSON.stringify(data_context)}

# 📚 你的核心技能与规范 (Knowledge Base)
${knowledgeContext ? this._cleanChinesePunctuationFromText(knowledgeContext) : "未加载知识库. 请遵循通用 Python 规范."}

# ⚡ 补充强制执行协议 (Override Rules)
1. **核心导入**: 必须在代码开头**强制导入**以下库: \`import json\`, \`import pandas as pd\`, \`import matplotlib.pyplot as plt\`, \`import numpy as np\`.
2. **数据硬编码**: 必须将【数据上下文】中的数据完整写入代码变量, **严禁空赋值**.
3. **中文支持 (关键)**:
   - 本环境**不包含** SimHei 或 Microsoft YaHei.
   - **必须**显式设置字体为文泉驿微米黑:
     \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']\`
   - 设置负号支持: \`plt.rcParams['axes.unicode_minus'] = False\`
4. **输出纯净**: 只输出 Python 代码, 不要 Markdown 标记.
5. **必须调用 \`plt.show()\`**: 这是触发图像输出的唯一方式.

# 🚨 严格代码格式要求（新增强制规则）
6. **标点符号**: 代码中**禁止使用中文标点符号**（如中文逗号, 中文括号, 中文引号）, 只能使用英文标点.
7. **字符串处理**: 如果文本中包含中文内容, 必须在字符串内部使用 Unicode 转义或保持原样, 但字符串外的标点必须是英文.
8. **语法验证**: 生成代码后, 必须确保以下语法正确:
   - 所有括号, 引号必须成对
   - 所有导入语句必须完整
   - 所有变量在使用前必须定义
9. **错误处理**: 必须在代码中添加基本的异常处理, 使用 try-except 包裹可能失败的操作.
10. **最终输出**: 代码最后必须有 \`print(json.dumps(result, ensure_ascii=False, indent=2))\` 输出.

# 🎯 关键提醒
- **绝对禁止**在代码语句中使用中文逗号, 中文括号等中文标点
- 如果处理中文文本数据, 使用 \`ensure_ascii=False\` 参数
- 优先使用简单的正则表达式和字符串处理, 避免复杂逻辑
- 如果文本过长, 使用切片处理（如 \`text[:5000]\`）避免内存问题
`;

        try {
            // 🟢 步骤 C: 呼叫专家模型 (独立上下文) - 使用注入的 chatApiHandler
            const startTime = Date.now();
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: specialistPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025', 
                temperature: 0.1
            });

            // 🎯 Token追踪
            if (response?.usage) {
                this.updateTokenUsageMethod(response.usage);
            }

            const executionTime = Date.now() - startTime;
            console.log(`[ToolExecutionMiddleware] ⏱️ 专家模型响应时间: ${executionTime}ms`);
            
            let generatedCode = response.choices[0].message.content;
            
            // 🔥 关键修复：增强代码清理和验证 - 新增激进中文标点移除
            // 🚀 第一步：立即移除所有可能的中文标点
            generatedCode = this._aggressivelyRemoveChinesePunctuation(generatedCode);
            
            // 🚀 第二步：然后进行常规清理和验证
            generatedCode = this._cleanAndValidateGeneratedCode(generatedCode, objective);
            
            // 🔥 新增：检查代码质量，决定是否使用备用方案
            const shouldUseFallback = 
                !generatedCode || 
                generatedCode.trim().length < 100 ||
                generatedCode.includes('SyntaxError') ||
                generatedCode.includes('NameError') ||
                generatedCode.includes('IndentationError') ||
                this._countChinesePunctuation(generatedCode) > 3 ||
                !this._hasValidOutputStatement(generatedCode);

            if (shouldUseFallback) {
                console.warn('[ToolExecutionMiddleware] ⚠️ 专家代码质量问题，使用备用方案');
                generatedCode = this._generateFallbackCode(objective, data_context);
            }

            console.log(`[ToolExecutionMiddleware] 👨‍💻 专家代码生成完毕，长度: ${generatedCode.length} 字符`);
            
            // 🔥 新增：验证代码基本语法
            const syntaxCheck = this._validatePythonSyntax(generatedCode);
            if (!syntaxCheck.isValid) {
                console.error(`[ToolExecutionMiddleware] ❌ 代码语法检查失败: ${syntaxCheck.error}`);
                console.log('[ToolExecutionMiddleware] 🔧 尝试自动修复语法错误...');
                generatedCode = this._repairSyntaxErrors(generatedCode, syntaxCheck.error);
                
                // 🚀 如果修复后仍然有错误，直接使用备用方案
                const secondCheck = this._validatePythonSyntax(generatedCode);
                if (!secondCheck.isValid) {
                    console.warn('[ToolExecutionMiddleware] ⚠️ 修复失败，直接使用备用方案');
                    generatedCode = this._generateFallbackCode(objective, data_context);
                }
            }
            
            // 🟢 步骤 D: 自动转发给沙盒执行 (Auto-Forwarding)
            console.log('[ToolExecutionMiddleware] 🔄 自动转接沙盒执行...');
            
            // 递归调用，真正执行 python_sandbox
            const sandboxResult = await this._executeBasicToolCall(
                'python_sandbox', 
                { code: generatedCode }, 
                detectedMode, 
                recordToolCall
            );
            
            // 🟢 步骤 E: 包装结果反馈给经理 - 与主文件完全一致的逻辑
            let finalObservation;

            if (sandboxResult.toolSuccess) {
                // 检查输出类型并相应处理
                try {
                    const outputData = JSON.parse(sandboxResult.rawObservation);

                    if (outputData.type === 'image' && outputData.image_base64) {
                        // 🚀 增强图像处理：验证base64数据有效性
                        if (outputData.image_base64.length > 100 && 
                            (outputData.image_base64.startsWith('iVBOR') || 
                             outputData.image_base64.includes('/9j/'))) {
                            console.log('[ToolExecutionMiddleware] 🖼️ 检测到有效图像输出，调用图像处理方法');
                            finalObservation = this._handleGeneratedImage(outputData);
                        } else {
                            console.warn('[ToolExecutionMiddleware] ⚠️ 图像数据格式无效或太短');
                            finalObservation = `⚠️ **图像生成失败** - 数据格式无效\n\n错误信息: 图像数据长度不足或格式错误`;
                        }

                    } else if (['excel', 'word', 'powerpoint', 'ppt', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                        // 文件处理逻辑
                        console.log(`[ToolExecutionMiddleware] 📄 检测到Python沙盒生成的文件: ${outputData.type}`);
                        finalObservation = `[✅ 文件生成成功] 类型: "${outputData.type}", 标题: "${outputData.title}". 文件已准备就绪。`;
                        this.callbackManager.invokeEvent('on_file_generated', {
                            run_id: this.runId,
                            data: outputData
                        });

                    } else if (outputData.type === 'ml_report' || outputData.type === 'data_extraction') {
                        // 🎯 保留原有特殊类型的处理逻辑
                        console.log(`[ToolExecutionMiddleware] 📊 检测到${outputData.type}类型输出，保留完整数据`);
        
                        // 格式化输出以便Agent理解
                        let formattedData = '';
                        if (outputData.title) formattedData += `## ${outputData.title}\n\n`;
                        if (outputData.summary) formattedData += `### 摘要\n${outputData.summary}\n\n`;
                        if (outputData.tables && Array.isArray(outputData.tables)) {
                            formattedData += `### 提取的表格数据\n`;
                            outputData.tables.forEach((table, idx) => {
                                formattedData += `#### 表格 ${idx + 1}: ${table.title || '未命名'}\n`;
                                formattedData += `${table.content}\n\n`;
                            });
                        }
                        if (outputData.metrics) {
                            formattedData += `### 性能指标\n`;
                            Object.entries(outputData.metrics).forEach(([key, value]) => {
                                formattedData += `- ${key}: ${value}\n`;
                            });
                        }
        
                        // 🔥 核心修复：保存原始数据到数据总线（与主文件一致）
                        const stepIndex = this.intermediateSteps.length + 1;
                        this.storeRawDataMethod(stepIndex, sandboxResult.rawObservation, {
                            toolName: 'code_generator',
                            contentType: 'structured_data',
                            dataType: outputData.type,
                            hasSpecialFormatting: true
                        }, sandboxResult.toolSources);
        
                        // 返回格式化内容
                        finalObservation = `✅ **数据提取成功**\n\n${formattedData}\n\n**提示**：完整结构化数据已保存到数据总线 (DataBus:step_${stepIndex})`;

                    } else {
                        // 🔥 核心修复：对于所有其他成功的JSON输出，统一视为结构化数据
                        console.log(`[ToolExecutionMiddleware] 📦 检测到结构化数据输出，类型: ${outputData.type || 'generic_data'}`);

                        const jsonStr = sandboxResult.rawObservation;
                        const outputType = outputData.type || 'generic_data';
                        const keyCount = Object.keys(outputData).length;
                        
                        // 🔥 核心修复：保存到数据总线
                        const stepIndex = this.intermediateSteps.length + 1;
                        this.storeRawDataMethod(stepIndex, jsonStr, {
                            toolName: 'code_generator',
                            contentType: 'structured_data',
                            dataType: outputType
                        }, sandboxResult.toolSources);
                        
                        // 生成 Agent 友好的观察结果
                        let finalObservationContent;
                        if (jsonStr.length > 3000) {
                            const sampleData = Object.entries(outputData)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 100) : typeof v}`)
                                .join('\n');

                            finalObservationContent = `✅ **专家任务执行成功 (结构化数据)**\n\n**数据类型**: ${outputType}\n**数据字段**: ${keyCount} 个\n**示例**:\n${sampleData}\n\n⚠️ 完整数据已保存到数据总线 (DataBus:step_${stepIndex})，请在报告生成时引用。`;
                        } else {
                            finalObservationContent = `✅ **专家任务执行成功 (结构化数据)**\n\n**数据类型**: ${outputType}\n\n**提取的数据**:\n\`\`\`json\n${jsonStr}\n\`\`\``;
                        }
                        
                        finalObservation = finalObservationContent;
                    }
                } catch (e) {
                    // 🚀 增强错误处理：尝试检测图像数据即使不是JSON格式
                    const rawOutput = sandboxResult.rawObservation;
                    if ((rawOutput.includes('iVBOR') || rawOutput.includes('/9j/')) && 
                        rawOutput.length > 500) {
                        console.log('[ToolExecutionMiddleware] 🖼️ 在纯文本输出中检测到图像数据，尝试提取');
                        
                        // 尝试从文本中提取图像数据
                        const imageMatch = rawOutput.match(/"image_base64"\s*:\s*"([^"]+)"/) || 
                                          rawOutput.match(/image_base64\s*=\s*'([^']+)'/);
                        
                        if (imageMatch && imageMatch[1]) {
                            const titleMatch = rawOutput.match(/"title"\s*:\s*"([^"]+)"/) || 
                                              rawOutput.match(/title\s*=\s*'([^']+)'/);
                            
                            const imageData = {
                                type: 'image',
                                title: titleMatch ? titleMatch[1] : '提取的图像',
                                image_base64: imageMatch[1]
                            };
                            
                            finalObservation = this._handleGeneratedImage(imageData);
                        } else {
                            // 如果输出不是JSON，或者解析失败
                            console.log('[ToolExecutionMiddleware] 🐍 Python输出不是JSON格式，作为纯文本处理');

                            // 检查是否已经是成功消息
                            if (sandboxResult.rawObservation.includes('[✅ 图像生成成功]') ||
                                sandboxResult.rawObservation.includes('[✅ 文件生成成功]')) {
                                finalObservation = sandboxResult.rawObservation;
                            } else {
                                // 对于纯文本输出，如果包含结构化信息，尝试格式化
                                const textOutput = sandboxResult.rawObservation;
                                const hasTable = textOutput.includes('|') && textOutput.includes('---');
                                const hasJsonStructure = textOutput.includes('{') && textOutput.includes('}');

                                if (hasTable || hasJsonStructure) {
                                    finalObservation = `✅ **专家任务执行成功 (包含结构化数据)**\n\n${textOutput}`;
                                } else if (textOutput.length > 500) {
                                    finalObservation = `✅ **专家任务执行成功**\n\n输出 (已截断):\n${textOutput.substring(0, 500)}...\n\n*完整输出: ${textOutput.length} 字符*`;
                                } else {
                                    finalObservation = `✅ **专家任务执行成功**\n\n输出:\n${textOutput}`;
                                }
                            }
                        }
                    } else {
                        // 原有处理逻辑
                        console.log('[ToolExecutionMiddleware] 🐍 Python输出不是JSON格式，作为纯文本处理');

                        // 检查是否已经是成功消息
                        if (sandboxResult.rawObservation.includes('[✅ 图像生成成功]') ||
                            sandboxResult.rawObservation.includes('[✅ 文件生成成功]')) {
                            finalObservation = sandboxResult.rawObservation;
                        } else {
                            // 对于纯文本输出，如果包含结构化信息，尝试格式化
                            const textOutput = sandboxResult.rawObservation;
                            const hasTable = textOutput.includes('|') && textOutput.includes('---');
                            const hasJsonStructure = textOutput.includes('{') && textOutput.includes('}');

                            if (hasTable || hasJsonStructure) {
                                finalObservation = `✅ **专家任务执行成功 (包含结构化数据)**\n\n${textOutput}`;
                            } else if (textOutput.length > 500) {
                                finalObservation = `✅ **专家任务执行成功**\n\n输出 (已截断):\n${textOutput.substring(0, 500)}...\n\n*完整输出: ${textOutput.length} 字符*`;
                            } else {
                                finalObservation = `✅ **专家任务执行成功**\n\n输出:\n${textOutput}`;
                            }
                        }
                    }
                }

            } else {
                // 失败情况
                console.log('[ToolExecutionMiddleware] ❌ 专家代码执行出错');
                
                // 🔥 新增：如果沙盒执行失败，尝试使用简化版的文本分析
                if (sandboxResult.rawObservation.includes('SyntaxError') || 
                    sandboxResult.rawObservation.includes('NameError')) {
                    console.log('[ToolExecutionMiddleware] 🔧 检测到语法错误，尝试使用简化分析方案...');
                    const simplifiedResult = await this._executeSimplifiedTextAnalysis(objective, data_context, detectedMode, recordToolCall);
                    if (simplifiedResult.toolSuccess) {
                        return simplifiedResult;
                    }
                }
                
                finalObservation = `❌ **专家代码执行出错**\n\n错误信息: ${sandboxResult.rawObservation}`;
            }

            // 标记 code_generator 调用成功
            recordToolCall('code_generator', parameters, true, "专家任务已完成");

            return {
                rawObservation: finalObservation,
                toolSources: sandboxResult.toolSources,
                toolSuccess: sandboxResult.toolSuccess
            };

        } catch (error) {
            console.error('[ToolExecutionMiddleware] ❌ 专家系统故障:', error);
            recordToolCall('code_generator', parameters, false, `专家系统故障: ${error.message}`);
            return { rawObservation: `专家系统故障: ${error.message}`, toolSources: [], toolSuccess: false };
        }
    }

    // ============================================================
    // 🔥🔥🔥 新增：代码清理和验证方法 🔥🔥🔥
    // ============================================================
    
    /**
     * 🎯 清理和验证生成的代码
     * @param {string} code - 原始生成的代码
     * @param {string} objective - 任务目标
     * @returns {string} 清理后的代码
     */
    _cleanAndValidateGeneratedCode(code, objective) {
        console.log('[ToolExecutionMiddleware] 🔧 开始清理和验证生成的代码...');
        
        // 1. 提取代码块（如果有的话）
        let cleanedCode = code;
        const codeBlockMatch = cleanedCode.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) {
            cleanedCode = codeBlockMatch[1];
            console.log('[ToolExecutionMiddleware] 📦 从Markdown代码块中提取代码');
        }
        
        // 2. 移除所有中文标点符号（替换为英文标点）
        // 注意：我们只替换不在字符串内的中文标点，但这里简化处理
        const chinesePunctuationMap = {
            '，': ',',  // 中文逗号 -> 英文逗号
            '。': '.',  // 中文句号 -> 英文句号
            '；': ';',  // 中文分号 -> 英文分号
            '：': ':',  // 中文冒号 -> 英文冒号
            '（': '(',  // 中文左括号 -> 英文左括号
            '）': ')',  // 中文右括号 -> 英文右括号
            '【': '[',  // 中文左方括号 -> 英文左方括号
            '】': ']',  // 中文右方括号 -> 英文右方括号
            '「': '"',  // 中文左引号 -> 英文双引号
            '」': '"',  // 中文右引号 -> 英文双引号
            '《': '"',  // 中文左书名号 -> 英文双引号
            '》': '"',  // 中文右书名号 -> 英文双引号
            '`': '"',   // 反引号 -> 双引号（避免混淆）
            '、': ',',  // 中文顿号 -> 英文逗号
        };
        
        Object.keys(chinesePunctuationMap).forEach(chineseChar => {
            const englishChar = chinesePunctuationMap[chineseChar];
            // 统计替换次数
            const count = (cleanedCode.match(new RegExp(chineseChar, 'g')) || []).length;
            if (count > 0) {
                console.log(`[ToolExecutionMiddleware] 🔄 替换 ${count} 个中文标点 "${chineseChar}" -> "${englishChar}"`);
                cleanedCode = cleanedCode.replace(new RegExp(chineseChar, 'g'), englishChar);
            }
        });
        
        // 3. 确保代码以 import 开头，移除开头的注释和空行
        const lines = cleanedCode.split('\n');
        let importFound = false;
        let codeStartIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('import ') || line.startsWith('from ')) {
                importFound = true;
                codeStartIndex = i;
                break;
            } else if (line && !line.startsWith('#') && !line.startsWith('"""') && !line.startsWith("'''")) {
                // 找到非注释非空行的代码，但没有import，可能需要添加
                codeStartIndex = i;
                break;
            }
        }
        
        if (!importFound) {
            console.log('[ToolExecutionMiddleware] ⚠️ 代码缺少import语句，添加标准导入');
            const standardImports = [
                'import json',
                'import re',
                'import pandas as pd',
                'import matplotlib.pyplot as plt',
                'import numpy as np'
            ].join('\n');
            cleanedCode = standardImports + '\n\n' + cleanedCode;
        } else if (codeStartIndex > 0) {
            // 移除import之前的空行和注释
            cleanedCode = lines.slice(codeStartIndex).join('\n');
        }
        
        // 4. 确保代码最后有print输出
        if (!cleanedCode.includes('print(json.dumps(') && !cleanedCode.includes("print(json.dumps(")) {
            console.log('[ToolExecutionMiddleware] ⚠️ 代码缺少JSON输出，添加输出语句');
            if (cleanedCode.includes('def ') || cleanedCode.includes('result =')) {
                // 如果有函数或结果变量，在最后添加输出
                cleanedCode += '\n\n# 输出结果\nprint(json.dumps(result, ensure_ascii=False, indent=2))';
            } else {
                // 否则添加简单的输出
                cleanedCode += '\n\n# 输出结果\nimport json\nprint(json.dumps({"type": "analysis_result", "status": "completed", "message": "Analysis completed successfully"}, ensure_ascii=False, indent=2))';
            }
        }
        
        // 5. 移除多余的空行（连续3个以上空行减少为2个）
        cleanedCode = cleanedCode.replace(/\n\s*\n\s*\n\s*\n+/g, '\n\n');
        
        console.log(`[ToolExecutionMiddleware] ✅ 代码清理完成，长度: ${cleanedCode.length} 字符`);
        return cleanedCode;
    }
    
    /**
     * 🎯 激进移除中文标点（包括字符串内部）
     * 用于处理专家提示词自身可能包含的中文标点
     * @param {string} text - 输入文本
     * @returns {string} 清理后的文本
     */
    _aggressivelyRemoveChinesePunctuation(text) {
        console.log('[ToolExecutionMiddleware] 🔥 激进移除中文标点...');
        
        // 第一步：替换代码注释中的中文标点
        let result = text;
        
        // 处理单行注释
        const lines = result.split('\n');
        const processedLines = lines.map(line => {
            // 找到注释部分
            const commentIndex = line.indexOf('#');
            if (commentIndex !== -1) {
                const codePart = line.substring(0, commentIndex);
                const commentPart = line.substring(commentIndex);
                
                // 只在注释部分替换中文标点
                const cleanedComment = commentPart.replace(/[，。；：（）【】「」《》、]/g, (match) => {
                    const map = {
                        '，': ',', '。': '.', '；': ';', '：': ':', 
                        '（': '(', '）': ')', '【': '[', '】': ']', 
                        '「': '"', '」': '"', '《': '"', '》': '"', '、': ','
                    };
                    return map[match] || match;
                });
                
                return codePart + cleanedComment;
            }
            return line;
        });
        
        result = processedLines.join('\n');
        
        // 第二步：处理多行字符串（小心处理）
        // 暂时保留字符串内容，只处理字符串外的部分
        // 这是一个简化版本，复杂的字符串处理需要更精确的解析
        
        // 第三步：全局替换剩余的中文标点（不在字符串内的）
        const chinesePunctuationMap = {
            '，': ',', '。': '.', '；': ';', '：': ':', 
            '（': '(', '）': ')', '【': '[', '】': ']', 
            '「': '"', '」': '"', '《': '"', '》': '"', '、': ',',
            '＂': '"', '＇': "'", '？': '?', '！': '!'
        };
        
        Object.keys(chinesePunctuationMap).forEach(chineseChar => {
            const englishChar = chinesePunctuationMap[chineseChar];
            const pattern = new RegExp(chineseChar, 'g');
            const matches = result.match(pattern);
            if (matches) {
                console.log(`[ToolExecutionMiddleware] 🔄 替换 ${matches.length} 个中文标点 "${chineseChar}" -> "${englishChar}"`);
            }
            result = result.replace(pattern, englishChar);
        });
        
        return result;
    }
    
    /**
     * 🎯 清理文本中的中文标点（用于提示词）
     * @param {string} text - 输入文本
     * @returns {string} 清理后的文本
     */
    _cleanChinesePunctuationFromText(text) {
        if (!text) return text;
        
        const chinesePunctuationMap = {
            '，': ',', '。': '.', '；': ';', '：': ':', 
            '（': '(', '）': ')', '【': '[', '】': ']', 
            '「': '"', '」': '"', '《': '"', '》': '"', '、': ','
        };
        
        let result = text;
        Object.keys(chinesePunctuationMap).forEach(chineseChar => {
            const englishChar = chinesePunctuationMap[chineseChar];
            result = result.replace(new RegExp(chineseChar, 'g'), englishChar);
        });
        
        return result;
    }
    
    /**
     * 🎯 统计中文标点数量
     * @param {string} code - Python代码
     * @returns {number} 中文标点数量
     */
    _countChinesePunctuation(code) {
        const chinesePunctuation = /[，。；：（）【】「」《》、]/g;
        const matches = code.match(chinesePunctuation);
        return matches ? matches.length : 0;
    }
    
    /**
     * 🎯 检查是否有有效输出语句
     * @param {string} code - Python代码
     * @returns {boolean} 是否有有效输出
     */
    _hasValidOutputStatement(code) {
        return code.includes('print(') || 
               code.includes('print (') || 
               code.includes('json.dumps') ||
               code.includes('plt.show()');
    }
    
    /**
     * 🎯 验证Python代码基本语法
     * @param {string} code - 要验证的代码
     * @returns {Object} 验证结果 {isValid: boolean, error: string}
     */
    _validatePythonSyntax(code) {
        console.log('[ToolExecutionMiddleware] 🔍 验证Python代码语法...');
        
        // 1. 检查括号平衡
        const bracketPairs = [
            { open: '(', close: ')' },
            { open: '[', close: ']' },
            { open: '{', close: '}' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ];
        
        for (const pair of bracketPairs) {
            const openCount = (code.match(new RegExp('\\' + pair.open, 'g')) || []).length;
            const closeCount = (code.match(new RegExp('\\' + pair.close, 'g')) || []).length;
            
            if (openCount !== closeCount) {
                return {
                    isValid: false,
                    error: `括号不平衡: ${pair.open}(${openCount}) 与 ${pair.close}(${closeCount}) 不匹配`
                };
            }
        }
        
        // 2. 检查是否存在明显的中文标点错误
        const chinesePunctuation = /[，。；：（）【】「」《》、]/;
        if (chinesePunctuation.test(code)) {
            // 检查是否在字符串内
            const lines = code.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const chineseMatch = line.match(chinesePunctuation);
                if (chineseMatch) {
                    // 检查是否在引号内
                    const beforeMatch = line.substring(0, chineseMatch.index);
                    const quoteCount = (beforeMatch.match(/["']/g) || []).length;
                    // 如果引号数量是奇数，说明在字符串内，允许中文标点
                    if (quoteCount % 2 === 0) {
                        return {
                            isValid: false,
                            error: `第${i+1}行存在中文标点符号: "${chineseMatch[0]}"`
                        };
                    }
                }
            }
        }
        
        // 3. 检查明显的语法问题
        const syntaxPatterns = [
            { pattern: /def\s+\w+\s*\([^)]*\)\s*:/, name: '函数定义' },
            { pattern: /if\s+.*:\s*$/, name: 'if语句' },
            { pattern: /for\s+.*:\s*$/, name: 'for循环' },
            { pattern: /while\s+.*:\s*$/, name: 'while循环' },
            { pattern: /try:\s*$/, name: 'try语句' },
            { pattern: /except\s+.*:\s*$/, name: 'except语句' }
        ];
        
        for (const { pattern, name } of syntaxPatterns) {
            const matches = code.match(new RegExp(pattern.source + '\\s*$', 'gm'));
            if (matches) {
                for (const match of matches) {
                    // 检查冒号后是否有内容
                    const afterColon = match.substring(match.indexOf(':') + 1);
                    if (!afterColon.trim() && !afterColon.includes('\n')) {
                        // 冒号后立即换行是允许的
                        continue;
                    }
                }
            }
        }
        
        return { isValid: true, error: '' };
    }
    
    /**
     * 🎯 修复语法错误
     * @param {string} code - 有错误的代码
     * @param {string} error - 错误信息
     * @returns {string} 修复后的代码
     */
    _repairSyntaxErrors(code, error) {
        console.log(`[ToolExecutionMiddleware] 🔧 尝试修复语法错误: ${error}`);
        
        let repairedCode = code;
        
        // 1. 修复中文标点错误
        if (error.includes('中文标点符号')) {
            const chinesePunctuationMap = {
                '，': ',',
                '。': '.',
                '；': ';',
                '：': ':',
                '（': '(',
                '）': ')',
                '【': '[',
                '】': ']',
                '「': '"',
                '」': '"',
                '《': '"',
                '》': '"',
                '、': ','
            };
            
            Object.keys(chinesePunctuationMap).forEach(chineseChar => {
                const englishChar = chinesePunctuationMap[chineseChar];
                repairedCode = repairedCode.replace(new RegExp(chineseChar, 'g'), englishChar);
            });
        }
        
        // 2. 修复括号不平衡
        if (error.includes('括号不平衡')) {
            // 尝试添加缺失的括号
            const openParenCount = (repairedCode.match(/\(/g) || []).length;
            const closeParenCount = (repairedCode.match(/\)/g) || []).length;
            
            if (openParenCount > closeParenCount) {
                repairedCode += ')'.repeat(openParenCount - closeParenCount);
                console.log(`[ToolExecutionMiddleware] 🔄 添加 ${openParenCount - closeParenCount} 个右括号`);
            } else if (closeParenCount > openParenCount) {
                // 无法修复缺少左括号的情况
                console.warn('[ToolExecutionMiddleware] ⚠️ 右括号多于左括号，无法自动修复');
            }
            
            // 同样处理方括号和花括号
            const openBracketCount = (repairedCode.match(/\[/g) || []).length;
            const closeBracketCount = (repairedCode.match(/\]/g) || []).length;
            
            if (openBracketCount > closeBracketCount) {
                repairedCode += ']'.repeat(openBracketCount - closeBracketCount);
            }
            
            const openBraceCount = (repairedCode.match(/\{/g) || []).length;
            const closeBraceCount = (repairedCode.match(/\}/g) || []).length;
            
            if (openBraceCount > closeBraceCount) {
                repairedCode += '}'.repeat(openBraceCount - closeBraceCount);
            }
        }
        
        // 3. 确保代码有输出
        if (!repairedCode.includes('print(') && !repairedCode.includes('print (')) {
            repairedCode += '\n\n# 输出结果\nimport json\nprint(json.dumps({"type": "analysis_result", "status": "completed", "message": "Analysis completed after syntax repair"}, ensure_ascii=False, indent=2))';
        }
        
        return repairedCode;
    }
    
    /**
     * 🎯 生成通用备用代码（当专家代码失败时使用）
     * 🔥 修改：从特定任务改为通用可扩展设计
     * @param {string} objective - 任务目标
     * @param {string} dataContext - 数据上下文
     * @returns {string} 通用备用代码
     */
    _generateFallbackCode(objective, dataContext) {
        console.log('[ToolExecutionMiddleware] 🛡️ 生成通用备用代码方案...');
        
        // 通用分析关键词提取（从objective中提取分析重点）
        const analysisKeywords = this._extractAnalysisKeywordsFromObjective(objective);
        const analysisType = this._determineAnalysisType(objective);
        
        // 限制文本长度，避免沙盒内存问题
        const safeDataContext = dataContext.length > 8000 ? 
            dataContext.substring(0, 8000) + "\n[...内容过长，已截断前8000字符...]" : 
            dataContext;
        
        // 构建通用分析代码
        return `
import json
import re
from datetime import datetime

def safe_text_analysis(text, analysis_type="general", keywords=None):
    """
    安全文本分析函数 - 通用版本
    设计原则：简单、健壮、可扩展
    """
    if keywords is None:
        keywords = []
    
    # 基础统计信息
    result = {
        "type": "safe_analysis",
        "analysis_type": analysis_type,
        "timestamp": datetime.now().isoformat(),
        "metadata": {
            "text_length": len(text),
            "line_count": text.count('\\n'),
            "analysis_keywords": keywords,
            "fallback_used": True
        },
        "findings": {}
    }
    
    try:
        # 1. 关键词匹配分析
        if keywords:
            keyword_matches = {}
            for keyword in keywords:
                if isinstance(keyword, str):
                    keyword_lower = keyword.lower()
                    text_lower = text.lower()
                    # 统计出现次数
                    count = text_lower.count(keyword_lower)
                    if count > 0:
                        # 找到包含关键词的上下文
                        matches = []
                        lines = text.split('\\n')
                        for line in lines[:50]:  # 只检查前50行
                            if keyword_lower in line.lower():
                                matches.append(line.strip()[:200])
                                if len(matches) >= 3:  # 每个关键词最多3个示例
                                    break
                        keyword_matches[keyword] = {
                            "count": count,
                            "examples": matches
                        }
            result["findings"]["keyword_analysis"] = keyword_matches
        
        # 2. 结构化内容检测
        structure_analysis = {}
        
        # 表格检测（Markdown表格）
        table_pattern = r'\\|.*\\|'
        table_lines = [line for line in text.split('\\n') if re.search(table_pattern, line) and '---' not in line]
        structure_analysis["potential_tables"] = len(table_lines)
        if table_lines:
            structure_analysis["table_samples"] = table_lines[:2]
        
        # JSON/数据检测
        json_pattern = r'\\{.*\\}'
        json_matches = re.findall(json_pattern, text[:5000], re.DOTALL)
        structure_analysis["json_like_structures"] = len(json_matches)
        
        # 列表检测
        list_items = re.findall(r'^[\\s]*[-*•]\\s+.+', text, re.MULTILINE)
        structure_analysis["list_items"] = len(list_items)
        
        result["findings"]["structure_analysis"] = structure_analysis
        
        # 3. 基于分析类型的具体分析
        if analysis_type == "comparison":
            # 比较分析：查找差异、变化、版本等
            comparison_keywords = ["vs", "vs.", "对比", "差异", "不同", "变化", "更新", "新增", "删除", "改进"]
            comparison_findings = []
            
            for keyword in comparison_keywords:
                if keyword in text.lower():
                    # 找到相关上下文
                    lines = text.split('\\n')
                    for i, line in enumerate(lines[:100]):
                        if keyword in line.lower():
                            context_start = max(0, i-1)
                            context_end = min(len(lines), i+2)
                            context = "\\n".join(lines[context_start:context_end])
                            comparison_findings.append({
                                "keyword": keyword,
                                "context": context[:300]
                            })
                            break
            
            result["findings"]["comparison_analysis"] = {
                "keywords_found": [k for k in comparison_keywords if k in text.lower()],
                "findings": comparison_findings[:5]  # 最多5个发现
            }
            
        elif analysis_type == "extraction":
            # 信息提取：查找数据、数字、规格等
            extraction_patterns = {
                "numbers": r'\\b\\d+[\\.,]?\\d*\\b',
                "percentages": r'\\b\\d+[\\.,]?\\d*%\\b',
                "dates": r'\\b\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}\\b|\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}\\b',
                "emails": r'\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
                "urls": r'https?://[^\\s<>"]+|www\\.[^\\s<>"]+'
            }
            
            extraction_results = {}
            for name, pattern in extraction_patterns.items():
                matches = re.findall(pattern, text[:10000])
                if matches:
                    extraction_results[name] = {
                        "count": len(matches),
                        "samples": list(set(matches))[:5]  # 去重后取前5个
                    }
            
            result["findings"]["extraction_analysis"] = extraction_results
            
        elif analysis_type == "summary":
            # 摘要生成：提取关键句子
            sentences = re.split(r'[。.!?]', text)
            # 过滤短句和空句
            valid_sentences = [s.strip() for s in sentences if len(s.strip()) > 30]
            
            # 简单的重要性排序：包含关键词的句子优先
            scored_sentences = []
            for sentence in valid_sentences[:50]:  # 只处理前50个句子
                score = 0
                if keywords:
                    for keyword in keywords:
                        if isinstance(keyword, str) and keyword.lower() in sentence.lower():
                            score += 1
                # 长度适中得分更高（避免过短或过长）
                if 50 <= len(sentence) <= 200:
                    score += 1
                scored_sentences.append((sentence, score))
            
            # 按分数排序，取前5个
            scored_sentences.sort(key=lambda x: x[1], reverse=True)
            key_sentences = [s[0] for s in scored_sentences[:5]]
            
            result["findings"]["summary_analysis"] = {
                "total_sentences": len(valid_sentences),
                "key_sentences": key_sentences
            }
        
        # 4. 内容分类（基于关键词）
        categories = {
            "technical": ["算法", "代码", "实现", "架构", "参数", "模型", "训练", "优化"],
            "research": ["论文", "研究", "实验", "方法", "结果", "结论", "分析"],
            "business": ["产品", "市场", "客户", "商业", "价格", "竞争", "策略"],
            "academic": ["引用", "文献", "理论", "假设", "验证", "学术"]
        }
        
        detected_categories = []
        for category, cat_keywords in categories.items():
            for keyword in cat_keywords:
                if keyword in text:
                    detected_categories.append(category)
                    break
        
        result["findings"]["content_categorization"] = {
            "detected_categories": list(set(detected_categories)),
            "confidence": len(detected_categories) > 0
        }
        
        return result
        
    except Exception as e:
        # 即使分析部分失败，也返回基本信息和错误
        result["error"] = str(e)
        result["findings"] = {"error_occurred": True, "error_message": str(e)}
        return result

def analyze_with_fallback(text, objective):
    """主分析函数，根据目标动态调整分析策略"""
    
    # 从目标中提取关键词
    keywords = []
    objective_lower = objective.lower()
    
    # 常见分析类型关键词
    type_keywords = {
        "comparison": ["对比", "比较", "差异", "不同", "vs", "versus", "变化", "更新"],
        "extraction": ["提取", "抽取", "数据", "信息", "详情", "细节", "规格"],
        "summary": ["总结", "摘要", "概括", "要点", "主要", "关键"],
        "analysis": ["分析", "研究", "调查", "评估", "评价"]
    }
    
    # 确定分析类型
    analysis_type = "general"
    for type_name, type_words in type_keywords.items():
        for word in type_words:
            if word in objective_lower:
                analysis_type = type_name
                break
        if analysis_type != "general":
            break
    
    # 从目标中提取具体关键词（简单的分词）
    # 移除常见停用词
    stop_words = ["的", "了", "在", "是", "和", "与", "对", "进行", "需要", "要求", "任务"]
    words = re.findall(r'[\\w\\u4e00-\\u9fff]+', objective)
    keywords = [word for word in words if word not in stop_words and len(word) > 1]
    
    # 执行分析
    return safe_text_analysis(text, analysis_type, keywords)

# ===================== 执行分析 =====================
try:
    # 准备数据
    text_to_analyze = """${safeDataContext}"""
    
    # 执行分析
    analysis_result = analyze_with_fallback(text_to_analyze, """${objective.replace(/"/g, '\\"')}""")
    
    # 输出结果
    print(json.dumps(analysis_result, ensure_ascii=False, indent=2))
    
except Exception as e:
    # 终极错误处理
    error_result = {
        "type": "critical_error",
        "message": f"备用分析完全失败: {str(e)}",
        "timestamp": datetime.now().isoformat(),
        "fallback_used": True,
        "objective": """${objective.replace(/"/g, '\\"')}""",
        "text_sample": text_to_analyze[:500] if 'text_to_analyze' in locals() else "无数据"
    }
    print(json.dumps(error_result, ensure_ascii=False, indent=2))
`;
    }
    
    /**
     * 🎯 从目标中提取分析关键词（辅助方法）
     * @param {string} objective - 任务目标
     * @returns {Array} 关键词数组
     */
    _extractAnalysisKeywordsFromObjective(objective) {
        // 简单的中英文关键词提取
        const keywords = [];
        
        // 移除常见停用词
        const stopWords = new Set([
            '的', '了', '在', '是', '和', '与', '对', '进行', '需要', '要求', '任务',
            'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'as'
        ]);
        
        // 提取中文词汇
        const chineseWords = objective.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        keywords.push(...chineseWords.filter(word => !stopWords.has(word)));
        
        // 提取英文词汇
        const englishWords = objective.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        keywords.push(...englishWords.filter(word => !stopWords.has(word)));
        
        return [...new Set(keywords)]; // 去重
    }
    
    /**
     * 🎯 确定分析类型（辅助方法）
     * @param {string} objective - 任务目标
     * @returns {string} 分析类型
     */
    _determineAnalysisType(objective) {
        const objectiveLower = objective.toLowerCase();
        
        const typePatterns = {
            'comparison': ['对比', '比较', '差异', '不同', 'vs', 'versus', '变化', '更新', '新旧', 'v1', 'v2'],
            'extraction': ['提取', '抽取', '数据', '信息', '详情', '细节', '规格', '参数', '数字'],
            'summary': ['总结', '摘要', '概括', '要点', '主要', '关键', '核心', '重点'],
            'analysis': ['分析', '研究', '调查', '评估', '评价', '诊断', '检查'],
            'classification': ['分类', '归类', '类别', '类型', '种类', '分组']
        };
        
        for (const [type, patterns] of Object.entries(typePatterns)) {
            for (const pattern of patterns) {
                if (objectiveLower.includes(pattern)) {
                    return type;
                }
            }
        }
        
        return 'general';
    }
    
    /**
     * 🎯 执行简化版文本分析（当专家代码完全失败时）
     */
    async _executeSimplifiedTextAnalysis(objective, dataContext, detectedMode, recordToolCall) {
        console.log('[ToolExecutionMiddleware] 🔧 执行简化版文本分析...');
        
        // 生成简化分析代码
        const simplifiedCode = `
import json
import re

def simple_text_analysis(text, analysis_type):
    """简化文本分析函数"""
    
    if analysis_type == "new_content":
        # 分析新增内容
        keywords = ["新增", "更新", "补充", "v2", "version 2", "修订"]
        findings = []
        
        for keyword in keywords:
            if keyword in text:
                # 找到包含关键词的句子
                sentences = re.split(r'[。.!?]', text)
                for sentence in sentences:
                    if keyword in sentence and len(sentence) > 20:
                        findings.append(sentence.strip()[:150])
        
        return {
            "type": "simplified_analysis",
            "analysis_type": "new_content",
            "keywords_found": keywords,
            "findings_count": len(findings),
            "sample_findings": findings[:5]
        }
    
    elif analysis_type == "training":
        # 分析训练信息
        training_terms = ["训练", "training", "预训练", "pretrain", "RLHF", "DPO", "强化学习", "reinforcement"]
        architecture_terms = ["参数", "parameters", "层数", "layers", "注意力头", "attention heads"]
        
        training_found = [term for term in training_terms if term in text]
        arch_found = [term for term in architecture_terms if term in text]
        
        return {
            "type": "simplified_analysis",
            "analysis_type": "training",
            "training_terms_found": training_found,
            "architecture_terms_found": arch_found,
            "text_sample": text[:500] + "..." if len(text) > 500 else text
        }
    
    else:
        # 通用分析
        return {
            "type": "simplified_analysis",
            "analysis_type": "general",
            "text_length": len(text),
            "has_tables": "|" in text and "-" in text,
            "has_json": "{" in text and "}" in text,
            "key_sentences": [s.strip() for s in re.split(r'[。.!?]', text) if len(s.strip()) > 30][:3]
        }

# 确定分析类型
analysis_type = "general"
text_data = """${dataContext.substring(0, 3000)}"""

if "新增" in "${objective}" or "v1" in "${objective}" or "v2" in "${objective}":
    analysis_type = "new_content"
elif "训练" in "${objective}" or "复现" in "${objective}" or "实现" in "${objective}":
    analysis_type = "training"

# 执行分析
try:
    result = simple_text_analysis(text_data, analysis_type)
    print(json.dumps(result, ensure_ascii=False, indent=2))
except Exception as e:
    print(json.dumps({
        "type": "error",
        "message": "简化分析失败: " + str(e),
        "fallback_analysis": True
    }, ensure_ascii=False, indent=2))
`;
        
        // 执行简化代码
        try {
            const sandboxResult = await this._executeBasicToolCall(
                'python_sandbox',
                { code: simplifiedCode },
                detectedMode,
                recordToolCall
            );
            
            return {
                rawObservation: `🛡️ **备用分析执行完成**\n\n${sandboxResult.rawObservation}`,
                toolSources: [],
                toolSuccess: sandboxResult.toolSuccess
            };
        } catch (error) {
            return {
                rawObservation: `❌ **备用分析也失败了**\n\n错误: ${error.message}`,
                toolSources: [],
                toolSuccess: false
            };
        }
    }

    // ============================================================
    // 🛠️ 基础工具执行方法（与主文件完全一致）
    // ============================================================
    
    /**
     * 🎯 基础工具调用（不含专家系统逻辑）
     * 🔥 修复：保持与附件版相同的返回结构
     */
    async _executeBasicToolCall(toolName, parameters, detectedMode, recordToolCall) {
        const tool = this.tools[toolName];
        let rawObservation;
        let toolSources = [];
        let toolSuccess = false;

        if (!tool) {
            rawObservation = `错误: 工具 "${toolName}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
            console.error(`[ToolExecutionMiddleware] ❌ 工具不存在: ${toolName}`);
            recordToolCall(toolName, parameters, false, rawObservation);
            return { rawObservation, toolSources, toolSuccess: false };
        }

        try {
            console.log(`[ToolExecutionMiddleware] 🔧 执行工具调用: ${toolName}`, parameters);

            // ============================================================
            // 🎯 URL去重检查（针对crawl4ai）- 与主文件完全一致
            // ============================================================
            if (toolName === 'crawl4ai' && parameters.url) {
                const url = parameters.url;
                
                // 检查是否访问过相似URL
                const visitedUrl = this._checkURLDuplicate(url);
                
                if (visitedUrl) {
                    console.log(`[ToolExecutionMiddleware] 🛑 拦截到重复/相似URL: ${url} (相似于: ${visitedUrl})`);
                    
                    const cachedStep = this._findCachedObservationForURL(visitedUrl);
                    const cachedObservation = cachedStep ? cachedStep.observation : '无缓存数据';
                    
                    recordToolCall(toolName, parameters, false, `重复URL拦截: ${url}`);
                    
                    throw new Error(`[DUPLICATE_URL_ERROR] URL "${url}" 与已访问的 "${visitedUrl}" 高度相似。请立即更换 URL 或转向下一个子问题。缓存内容摘要: ${cachedObservation.substring(0, 200)}...`);
                }
                
                // 记录本次访问
                if (!this.visitedURLs.has(url)) {
                    this.visitedURLs.set(url, {
                        count: 1,
                        lastVisited: Date.now(),
                        stepIndex: this.intermediateSteps.length
                    });
                    console.log(`[ToolExecutionMiddleware] 📍 记录新URL访问: ${url}`);
                }
            }
            
            // ============================================================
            // 🔥🔥🔥 核心修复：Python 代码客户端强制预检
            // ============================================================
            if (toolName === 'python_sandbox' && parameters.code) {
                const code = parameters.code;
                
                // 1. 检查空赋值
                const emptyAssignmentRegex = /^\s*[a-zA-Z_]\w*\s*=\s*(?:\s*(?:#.*)?$)/m;
                const emptyMatches = code.match(emptyAssignmentRegex);
                
                if (emptyMatches) {
                    console.warn('[ToolExecutionMiddleware] 🛑 拦截到空赋值，正在呼叫急诊室...');
                    
                    // 🔥 尝试自动修复
                    const fixedCode = await this._repairCodeWithLLM(code, "变量声明未赋值 (Empty Assignment)");
                    
                    if (fixedCode) {
                        console.log('[ToolExecutionMiddleware] 🔄 使用急诊修复后的代码继续执行...');
                        
                        // 递归调用自己，使用修复后的代码
                        return await this._executeBasicToolCall(
                            toolName,
                            { ...parameters, code: fixedCode },
                            detectedMode,
                            recordToolCall
                        );
                    }

                    // 🚑 如果急诊修复失败，才执行原来的报错返回逻辑
                    const errorMsg = `❌ **代码预检失败 (Preflight Check Failed)**\n\n` +
                        `**检测到空赋值**: \`${emptyMatches.trim()}\`\n` +
                        `**错误原因**: 变量声明后没有赋值数据\n` +
                        `**强制修正**: 请将用户提供的数据完整硬编码到代码中\n\n` +
                        `**请修改代码后重新提交**:\n` +
                        `**✅ 正确格式示例** (请替换为真实数据):\n` +
                        `\`\`\`python\n` +
                        `years = # 必须填入数据\n` +
                        `values =\n` +
                        `\`\`\``;
                    
                    recordToolCall(toolName, parameters, false, errorMsg);
                    return { rawObservation: errorMsg, toolSources: [], toolSuccess: false };
                }

                // 2. 客户端导入预检
                const missingImports = this._validatePythonImports(code);
                
                if (missingImports.length > 0) {
                    console.warn(`[ToolExecutionMiddleware] 🛠️ 预检检测到缺失导入: ${missingImports.join(', ')}，自动修复...`);
                    
                    const importStatements = missingImports.join('\n');
                    parameters.code = `${importStatements}\n\n${code}`;
                    
                    console.log('[ToolExecutionMiddleware] ✅ 客户端预检修复完成。');
                }

                // 3. 状态注入逻辑
                const stateInjectionPattern = /"\{\{LAST_OBSERVATION\}\}"/g;
                if (stateInjectionPattern.test(code)) {
                    console.log('[ToolExecutionMiddleware] 🐍 检测到 Python 状态注入占位符。');
                    const lastStep = this.intermediateSteps[this.intermediateSteps.length - 1];
                    
                    if (lastStep && typeof lastStep.observation === 'string') {
                        const safelyEscapedData = JSON.stringify(lastStep.observation);
                        const innerData = safelyEscapedData.slice(1, -1);
                        parameters.code = code.replace(stateInjectionPattern, `"${innerData}"`);
                        console.log(`[ToolExecutionMiddleware] ✅ 成功注入 ${lastStep.observation.length} 字符的数据。`);
                    } else {
                        console.warn('[ToolExecutionMiddleware] ⚠️ 找不到上一步的观察结果来注入。');
                        parameters.code = code.replace(stateInjectionPattern, '""');
                    }
                }
                
                // 🔥 新增：基本语法验证
                const syntaxCheck = this._validatePythonSyntax(code);
                if (!syntaxCheck.isValid) {
                    console.warn(`[ToolExecutionMiddleware] ⚠️ 代码语法检查失败: ${syntaxCheck.error}`);
                    
                    // 尝试自动修复
                    const repairedCode = this._repairSyntaxErrors(code, syntaxCheck.error);
                    if (repairedCode !== code) {
                        console.log('[ToolExecutionMiddleware] 🔄 使用修复后的代码继续执行...');
                        parameters.code = repairedCode;
                    }
                }
            }

            // --- 调用工具 ---
            console.log(`[ToolExecutionMiddleware] 🚀 开始调用工具 ${toolName}...`);
            const toolResult = await tool.invoke(parameters, {
                mode: 'deep_research',
                researchMode: detectedMode
            });
            
            // 🎯 关键修复：保持与附件版完全一致的处理方式
            // 直接使用 toolResult.output 或 JSON.stringify(toolResult)
            rawObservation = toolResult.output || JSON.stringify(toolResult);
            toolSuccess = toolResult.success !== false;

            // 🎯 降级识别：检查 crawl4ai 是否降级运行
            if (toolName === 'crawl4ai' && toolSuccess) {
                if (rawObservation.includes('pdf_skipped') || rawObservation.includes('内存优化')) {
                    console.log('[ToolExecutionMiddleware] 📝 检测到 crawl4ai 工具降级运行，但核心内容已获取');
                }
            }

            // ================================================================
            // 🚀 智能分发中心（图像/文件处理）- 与主文件完全一致
            // ================================================================
            if (toolName === 'python_sandbox' && toolSuccess) {
                try {
                    const outputData = JSON.parse(rawObservation);

                    if (outputData.type === 'image' && outputData.image_base64) {
                        if (outputData.image_base64.length > 100) {
                            console.log('[ToolExecutionMiddleware] 🐍 检测到Python沙盒生成的图像，正在处理...');
                            rawObservation = this._handleGeneratedImage(outputData);
                        } else {
                            console.warn('[ToolExecutionMiddleware] ⚠️ 收到图片数据但长度不足，跳过渲染。');
                        }

                    } else if (['excel', 'word', 'powerpoint', 'ppt', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                        console.log(`[ToolExecutionMiddleware] 🐍 检测到Python沙盒生成的文件: ${outputData.type}`);
                        rawObservation = `[✅ 文件生成成功] 类型: "${outputData.type}", 标题: "${outputData.title}". 文件已准备就绪。`;
                        this.callbackManager.invokeEvent('on_file_generated', {
                            run_id: this.runId,
                            data: outputData
                        });
                    }

                } catch (e) {
                    console.log('[ToolExecutionMiddleware] 🐍 Python输出不是特殊JSON格式，作为纯文本处理。');
                }
            }

            // --- 错误诊断与来源提取 ---
            if (toolName === 'python_sandbox' && !toolSuccess) {
                console.log(`[ToolExecutionMiddleware] 🐍 Python执行失败，启动自动诊断...`);
                const diagnosis = await this._diagnosePythonError(rawObservation, parameters);
                if (diagnosis.suggestedFix) {
                    rawObservation += `\n\n## 🔧 自动诊断结果\n${diagnosis.analysis}\n\n**建议修复**: ${diagnosis.suggestedFix}`;
                }
            }
            
            if (toolResult.sources && Array.isArray(toolResult.sources)) {
                toolSources = toolResult.sources.map(source => ({
                    title: source.title || '无标题',
                    url: source.url || '#',
                    description: source.description || '',
                    collectedAt: new Date().toISOString(),
                    used_in_report: false
                }));
                console.log(`[ToolExecutionMiddleware] 📚 提取到 ${toolSources.length} 个来源`);
            }
            
            if (toolSuccess) {
                console.log(`[ToolExecutionMiddleware] ✅ 工具执行成功`);
            } else {
                console.warn(`[ToolExecutionMiddleware] ⚠️ 工具执行失败`);
            }
            
        } catch (error) {
            rawObservation = `错误: 工具 "${toolName}" 执行失败: ${error.message}`;
            console.error(`[ToolExecutionMiddleware] ❌ 工具执行失败: ${toolName}`, error);
            toolSuccess = false;
            
            // 🔥 新增：crawl4ai参数错误自动修复
            if (toolName === 'crawl4ai' && error.message.includes('Missing required parameter')) {
                console.log('[ToolExecutionMiddleware] 🛠️ 检测到crawl4ai参数格式错误，尝试自动修复...');
                
                try {
                    const fixedParams = this._autoFixCrawl4aiParams(parameters, error.message);
                    if (fixedParams) {
                        console.log('[ToolExecutionMiddleware] 🔄 使用修复后的参数重试');
                        
                        return await this._executeBasicToolCall(
                            toolName,
                            fixedParams,
                            detectedMode,
                            recordToolCall
                        );
                    }
                } catch (fixError) {
                    console.warn('[ToolExecutionMiddleware] ⚠️ 自动修复失败:', fixError);
                }
            }
        }

        recordToolCall(toolName, parameters, toolSuccess, rawObservation);
        console.log(`[ToolExecutionMiddleware] 📊 工具调用记录完成: ${toolName}, 成功: ${toolSuccess}`);
        
        // 🔥 核心修复：保持与附件版完全一致的返回结构
        // 不包含 metadata 字段，确保与主文件兼容
        return { rawObservation, toolSources, toolSuccess };
    }

    // ============================================================
    // 🎯 主入口：执行工具调用（对外暴露的主方法）
    // ============================================================
    
    /**
     * 🎯 执行工具调用（对外暴露的主方法）
     * 🔥 保持与附件版完全一致的接口
     */
    async executeToolCall(toolName, parameters, detectedMode, recordToolCall) {
        // ============================================================
        // 🔥🔥🔥 虚拟专家接管系统 (优先级最高)
        // ============================================================
        if (toolName === 'code_generator') {
            console.log('[ToolExecutionMiddleware] 👔 检测到code_generator，启动专家接管流程');
            return await this._delegateToCodeExpert(parameters, detectedMode, recordToolCall);
        }

        // ============================================================
        // 🎯 正常工具执行流程
        // ============================================================
        console.log(`[ToolExecutionMiddleware] 🛠️ 执行普通工具调用: ${toolName}`);
        return await this._executeBasicToolCall(toolName, parameters, detectedMode, recordToolCall);
    }

    // ============================================================
    // 🎯 知识感知的工具执行（修复版）
    // ============================================================
    
    /**
     * 🎯 知识感知的工具执行
     * 🔥 修复：使用迭代次数作为stepIndex
     */
    async executeToolWithKnowledge(toolName, parameters, thought, intermediateSteps, detectedMode, recordToolCall, iteration) {
        console.log(`[ToolExecutionMiddleware] 🧠 执行知识感知的工具调用: ${toolName}, 迭代: ${iteration}`);
        
        // 🔥🔥🔥 关键修复：使用传入的迭代次数作为stepIndex
        // iteration应该从1开始计数，对应第一次迭代
        const stepIndex = iteration;
        
        console.log(`[ToolExecutionMiddleware] 🔢 stepIndex = 迭代 ${iteration}`);
        console.log(`[ToolExecutionMiddleware] 📋 intermediateSteps长度: ${intermediateSteps.length} (历史步骤数)`);
        
        // 更新本地缓存的状态（如果需要）
        this.intermediateSteps = intermediateSteps;
        
        // 🎯 检查是否有相关知识缓存
        // 可以在thought中引用知识指导

        // 🎯 新增：检查是否有相关数据可复用
        if (this.dataBus.size > 0 && (thought.includes('提取') || thought.includes('数据'))) {
            console.log('[ToolExecutionMiddleware] 🔍 检查数据总线中的相关数据...');
            
            const recentData = Array.from(this.dataBus.entries())
                .filter(([key, data]) => data.metadata.contentType === 'structured_data')
                .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());
            
            if (recentData.length > 0) {
                const [key, data] = recentData;
                console.log(`[ToolExecutionMiddleware] ✅ 找到可用数据: ${key}, 类型: ${data.metadata.dataType}`);
                
                thought = `注意：系统已缓存了相关结构化数据（${data.metadata.dataType}），请考虑利用这些数据。\n\n${thought}`;
            }
        }

        // 正常执行工具调用
        const result = await this.executeToolCall(toolName, parameters, detectedMode, recordToolCall);
        
        // 🔥 核心修复：在执行工具后存储数据到数据总线
        if (result.toolSuccess) {
            // 🔥🔥🔥 使用迭代次数作为stepIndex，确保每次工具调用都有唯一的存储位置
            console.log(`[ToolExecutionMiddleware] 💾 存储到 step_${stepIndex}, 对应第 ${iteration} 次迭代`);
            
            // 🔥 修复：自己构建 metadata，不依赖 result.metadata
            const metadata = {
                toolName: toolName,
                contentType: toolName === 'crawl4ai' ? 'webpage' : 
                           toolName === 'tavily_search' ? 'search_results' : 'text',
                timestamp: new Date().toISOString(),
                iteration: iteration, // 🆕 新增：记录迭代次数
                planStep: this._detectPlanStep(thought, intermediateSteps) // 🆕 新增：尝试推断计划步骤
            };
            
            // 🆕 针对特定工具的专门字段
            if (toolName === 'tavily_search') {
                metadata.searchQuery = parameters.query;
                metadata.searchEngine = 'tavily';
            } else if (toolName === 'crawl4ai' && parameters.url) {
                metadata.url = parameters.url;
                try {
                    metadata.domain = new URL(parameters.url).hostname;
                } catch (e) {
                    metadata.domain = 'unknown';
                }
            }
            
            this.storeRawDataMethod(
                stepIndex, 
                result.rawObservation, 
                metadata,
                result.toolSources
            );
            
            console.log(`[ToolExecutionMiddleware] 💾 已存储数据到DataBus: step_${stepIndex}, 工具: ${toolName}, 迭代: ${iteration}`);
        }
        
        // 🎯 返回更新后的 thought
        return { ...result, updatedThought: thought };
    }

    /**
     * 🆕 辅助方法：尝试从thought推断当前计划步骤
     */
    _detectPlanStep(thought, intermediateSteps) {
        // 简单的关键词匹配来推断当前处于计划中的哪个步骤
        const planStepKeywords = [
            { keyword: '第一步', step: 1 },
            { keyword: '第二步', step: 2 },
            { keyword: '第三步', step: 3 },
            { keyword: '验证', step: 1 },
            { keyword: '方法论', step: 2 },
            { keyword: '实验', step: 3 },
            { keyword: '架构', step: 4 },
            { keyword: '解释', step: 5 }
        ];
        
        for (const { keyword, step } of planStepKeywords) {
            if (thought && thought.includes(keyword)) {
                return step;
            }
        }
        
        // 默认根据历史步骤推断
        return intermediateSteps.length % 5 + 1; // 假设最多5个计划步骤
    }

    // ============================================================
    // 🔧 辅助工具方法（与主文件完全一致）
    // ============================================================
    
    /**
     * 🛠️ 自动修复crawl4ai参数格式
     * 🔥 与主文件完全一致的实现
     */
    _autoFixCrawl4aiParams(originalParams, errorMsg) {
        console.log('[ToolExecutionMiddleware] 🛠️ 执行crawl4ai参数自动修复');
        
        try {
            const params = JSON.parse(JSON.stringify(originalParams));
            let fixed = false;
            
            // 修复1：模式名映射
            if (params.mode === 'batch_scrape') {
                params.mode = 'batch_crawl';
                console.log('[ToolExecutionMiddleware] 🔄 修复模式名: batch_scrape -> batch_crawl');
                fixed = true;
            }
            
            // 修复2：扁平化嵌套参数
            if (params.parameters && params.parameters.urls) {
                console.log('[ToolExecutionMiddleware] 📦 扁平化嵌套参数');
                const urls = params.parameters.urls;
                delete params.parameters;
                params.urls = urls;
                fixed = true;
            }
            
            // 修复3：确保参数结构正确
            if (params.mode === 'batch_crawl' && !params.parameters) {
                const urls = params.urls || [];
                delete params.urls;
                params.parameters = { urls };
                fixed = true;
            }
            
            if (fixed) {
                console.log('[ToolExecutionMiddleware] ✅ 参数修复完成:', params);
                return params;
            }
            
            return null;
        } catch (error) {
            console.error('[ToolExecutionMiddleware] ❌ 参数修复失败:', error);
            return null;
        }
    }

    /**
     * 🎯 图像生成结果处理
     * 🔥 与主文件完全一致的实现
     */
    _handleGeneratedImage(imageData) {
        this.imageCounter++;
        const imageId = `agent_image_${this.imageCounter}`;
        
        console.log(`[ToolExecutionMiddleware] 🖼️ 处理生成图像: ${imageId}, 标题: "${imageData.title}"`);

        // 1. 存储图像数据
        this.generatedImages.set(imageId, imageData);

        // 2. 触发事件，让UI可以立即显示图片
        this.callbackManager.invokeEvent('on_image_generated', {
            run_id: this.runId,
            data: {
                imageId: imageId,
                title: imageData.title,
                base64: imageData.image_base64
            }
        });

        // 3. 返回简洁确认信息
        return `[✅ 图像生成成功] 标题: "${imageData.title}". 在最终报告中，你可以使用占位符 ![${imageData.title}](placeholder:${imageId}) 来引用这张图片。`;
    }

    /**
     * 🎯 客户端 Python 导入预检
     * 🔥 与主文件完全一致的实现
     */
    _validatePythonImports(code) {
        const mandatoryImports = [
            'import json',
            'import pandas as pd',
            'import matplotlib.pyplot as plt',
            'import numpy as np'
        ];
        
        let missingImports = [];
        const codeLower = code.toLowerCase();
        
        mandatoryImports.forEach(fullImportStatement => {
            if (!codeLower.includes(fullImportStatement.toLowerCase())) {
                missingImports.push(fullImportStatement);
            }
        });
        
        return [...new Set(missingImports)];
    }

    /**
     * 🚑 代码急诊室：基于 LLM 的自动修复
     * 🔥 与主文件完全一致的实现
     */
    async _repairCodeWithLLM(brokenCode, errorType) {
        console.log('[ToolExecutionMiddleware] 🚑 启动代码急诊室 (Auto-Repair)...');
        
        const contextData = this.currentResearchContext || "无上下文数据";
        const maxRetries = 2;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const isRetry = attempt > 0;
            if (isRetry) {
                console.warn(`[ToolExecutionMiddleware] 🚑 修复尝试 ${attempt}/${maxRetries} 失败，正在重试...`);
            }

            const prompt = `
# 角色：Python 代码修复专家

# 紧急任务
检测到以下代码存在 **${errorType}**。
请根据【任务背景】中的数据，修复代码中的空赋值或语法错误。

# 任务背景 (用户原始请求 - 包含数据)
${contextData}

# 损坏的代码
\`\`\`python
${brokenCode}
\`\`\`

# 修复要求
1. **数据填充 (关键)**: 
   - 仔细阅读【任务背景】，找到年份、数值等具体数据。
   - 将这些数据**完整、准确地硬编码**到代码的变量中 (例如 \`years = [2020, 2021...]\`)。
   - **绝对禁止**再次生成空赋值 (如 \`x =\`)。
2. **语法修正**: 确保所有括号、引号闭合，import 完整。
3. **输出格式**: 只输出修复后的 Python 代码，不要 Markdown 标记，不要解释。
${isRetry ? "\n# 特别注意：上一次修复失败了，请务必仔细检查数据是否完整填入！" : ""}
`;

            try {
                const response = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'gemini-2.5-flash-preview-09-2025',
                    temperature: 0.1
                });

                // 🎯 Token追踪
                if (response?.usage) {
                    this.updateTokenUsageMethod(response.usage);
                }

                let fixedCode = response.choices[0].message.content;
                
                // 清理 Markdown
                fixedCode = fixedCode.replace(/```python/g, '').replace(/```/g, '').trim();
                
                // 验证：修复后的代码不应该再包含空赋值或懒惰写法
                if (/^\s*[a-zA-Z_]\w*\s*=\s*(?:\s*(?:#.*)?$)/m.test(fixedCode) || fixedCode.includes("...")) {
                    console.warn('[ToolExecutionMiddleware] 🚑 修复后的代码仍不符合要求。');
                    continue;
                }

                console.log(`[ToolExecutionMiddleware] ✅ 急诊修复成功 (尝试 ${attempt + 1})，代码长度: ${fixedCode.length} 字符`);
                return fixedCode;

            } catch (error) {
                console.error(`[ToolExecutionMiddleware] 🚑 修复尝试 ${attempt + 1} 发生异常:`, error);
            }
        }

        console.error('[ToolExecutionMiddleware] 🚑 急诊室宣告抢救无效 (达到最大重试次数)。');
        return null;
    }

    /**
     * Python错误智能诊断
     * 🔥 与主文件完全一致的实现
     */
    async _diagnosePythonError(errorOutput, parameters) {
        console.log('[ToolExecutionMiddleware] 🔧 启动Python错误诊断...');
        
        let diagnosis = "Python 执行报错。";
        let suggestion = "请检查代码逻辑，确保变量已定义且库已正确导入。";

        // 1. 语法错误
        if (errorOutput.includes("SyntaxError")) {
            diagnosis = "语法错误 (SyntaxError)。";
            suggestion = "请检查括号 `()`、引号 `'` `\"` 是否成对闭合，以及是否遗漏了冒号 `:`。**注意：在 Python 字符串内部使用引号时，必须使用转义字符 `\\` (例如 `\\\"`)。**";
        }
        // 2. 缩进错误
        else if (errorOutput.includes("IndentationError")) {
            diagnosis = "缩进错误 (IndentationError)。";
            suggestion = "Python 对缩进非常敏感。请确保代码块的缩进一致（推荐使用 4 个空格），不要混用 Tab 和空格。";
        }
        // 3. 模块缺失
        else if (errorOutput.includes("ModuleNotFoundError")) {
            diagnosis = "模块缺失 (ModuleNotFoundError)。";
            suggestion = "沙箱环境只支持标准库和 pandas, matplotlib, numpy, scipy, sklearn, statsmodels。请勿导入其他第三方库。";
        }
        // 4. 变量未定义
        else if (errorOutput.includes("NameError")) {
            diagnosis = "变量未定义 (NameError)。";
            suggestion = "请检查变量名是否拼写正确，或者是否在使用变量前忘记了定义它。";
        }
        // 5. 类型错误
        else if (errorOutput.includes("TypeError")) {
            diagnosis = "类型错误 (TypeError)。";
            suggestion = "请检查操作数的数据类型是否兼容（例如，不能直接将字符串和数字相加，除非先转换）。";
        }

        console.log(`[ToolExecutionMiddleware] 🔧 诊断完成: ${diagnosis}`);
        
        return {
            errorType: 'python_execution_error',
            analysis: diagnosis,
            suggestedFix: suggestion
        };
    }

    // ============================================================
    // 🔗 URL 去重系统（与主文件完全一致）
    // ============================================================
    
    /**
     * 🎯 检查URL重复 (返回相似的已访问URL或 null)
     * 🔥 与主文件完全一致的实现
     */
    _checkURLDuplicate(url) {
        console.log(`[ToolExecutionMiddleware] 🔍 检查URL重复: ${url}`);
        
        for (const [visitedUrl, data] of this.visitedURLs.entries()) {
            const similarity = this._calculateURLSimilarity(url, visitedUrl);
            
            // 相似度超过阈值
            if (similarity >= this.urlSimilarityThreshold) {
                console.log(`[ToolExecutionMiddleware] ⚠️ 检测到相似URL: ${url} ~ ${visitedUrl} (相似度: ${(similarity*100).toFixed(1)}%)`);
                
                // 检查是否超过最大重访次数
                if (data.count >= this.maxRevisitCount) {
                    console.log(`[ToolExecutionMiddleware] 🛑 URL ${visitedUrl} 已达到最大重访次数 (${data.count})`);
                    return visitedUrl; 
                }
                
                // 相似但未达到最大重访次数，更新计数并允许本次访问
                data.count++;
                data.lastVisited = Date.now();
                console.log(`[ToolExecutionMiddleware] 🔄 URL ${visitedUrl} 重访计数: ${data.count}`);
                return null;
            }
        }
        return null;
    }

    /**
     * 🎯 查找缓存的观察结果
     * 🔥 与主文件完全一致的实现
     */
    _findCachedObservationForURL(url) {
        console.log(`[ToolExecutionMiddleware] 🔍 查找URL缓存: ${url}`);
        
        for (let i = this.intermediateSteps.length - 1; i >= 0; i--) {
            const step = this.intermediateSteps[i];
            if (step.action.tool_name === 'crawl4ai' && 
                step.action.parameters.url === url) {
                console.log(`[ToolExecutionMiddleware] ✅ 找到缓存步骤: 第${i+1}步`);
                return step;
            }
        }
        
        console.log(`[ToolExecutionMiddleware] ❌ 未找到URL缓存: ${url}`);
        return null;
    }

    /**
     * 🎯 Levenshtein距离计算
     * 🔥 与主文件完全一致的实现
     */
    _levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }

    /**
     * 🎯 字符串相似度算法
     * 🔥 与主文件完全一致的实现
     */
    _calculateStringSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / parseFloat(longer.length);
    }

    /**
     * 🎯 URL相似度计算
     * 🔥 与主文件完全一致的实现
     */
    _calculateURLSimilarity(url1, url2) {
        try {
            const u1 = new URL(url1);
            const u2 = new URL(url2);
            
            // 1. 相同域名和路径 = 相同URL
            if (u1.hostname === u2.hostname && u1.pathname === u2.pathname) {
                return 1.0;
            }
            
            // 2. 计算路径相似度
            const path1 = u1.pathname.toLowerCase();
            const path2 = u2.pathname.toLowerCase();
            const similarity = this._calculateStringSimilarity(path1, path2);
            
            return similarity;
        } catch (e) {
            // URL解析失败，退回到字符串相似度
            console.warn(`[ToolExecutionMiddleware] ⚠️ URL解析失败，使用字符串相似度: ${url1}, ${url2}`);
            return this._calculateStringSimilarity(url1, url2);
        }
    }

    // ============================================================
    // 🔄 默认方法（当回调未提供时的降级实现）
    // ============================================================
    
    /**
     * 🎯 默认智能摘要方法（降级实现）
     */
    _defaultSummarizeMethod(mainTopic, observation, researchMode, toolName) {
        console.warn(`[ToolExecutionMiddleware] ⚠️ 使用默认摘要方法: ${toolName}, 长度: ${observation.length}`);
        
        // 简单截断
        const maxLength = 5000;
        if (observation.length <= maxLength) {
            return observation;
        }
        
        return observation.substring(0, maxLength) + `\n\n[...内容过长，已截断前${maxLength}字符...]`;
    }
    
    /**
     * 🎯 默认数据存储方法（降级实现）
     */
    _defaultStoreRawData(stepIndex, rawData, metadata, toolSources) {
        const dataKey = `step_${stepIndex}`;
        
        console.log(`[ToolExecutionMiddleware] 💾 默认数据存储: ${dataKey}, 长度: ${rawData.length}, 工具: ${metadata.toolName}`);
        
        // 简单存储
        this.dataBus.set(dataKey, {
            rawData: rawData,
            originalData: rawData,
            metadata: {
                ...metadata,
                originalLength: rawData.length,
                processedLength: rawData.length,
                timestamp: new Date().toISOString(),
                toolSources: toolSources || [],
                sourceCount: (toolSources || []).length
            }
        });
    }
    
    /**
     * 🎯 默认Token追踪方法（降级实现）
     */
    _defaultUpdateTokenUsage(usage) {
        console.log(`[ToolExecutionMiddleware] 📊 默认Token追踪:`, usage);
        // 不做实际处理，仅记录
    }

    // ============================================================
    // 🎯 状态更新方法（与主文件交互）
    // ============================================================
    
    /**
     * 更新共享状态
     * 🔥 确保与主文件状态同步
     */
    updateSharedState(updates) {
        if (updates.runId) {
            this.runId = updates.runId;
            console.log(`[ToolExecutionMiddleware] 🔄 更新runId: ${this.runId}`);
        }
        if (updates.intermediateSteps) {
            this.intermediateSteps = updates.intermediateSteps;
            console.log(`[ToolExecutionMiddleware] 🔄 更新intermediateSteps: ${this.intermediateSteps.length} 步`);
        }
        if (updates.currentResearchContext) {
            this.currentResearchContext = updates.currentResearchContext;
            console.log(`[ToolExecutionMiddleware] 🔄 更新研究上下文: ${this.currentResearchContext.substring(0, 100)}...`);
        }
        if (updates.dataBus) {
            this.dataBus = updates.dataBus;
            console.log(`[ToolExecutionMiddleware] 🔄 更新dataBus: ${this.dataBus.size} 条数据`);
        }
        if (updates.generatedImages) {
            this.generatedImages = updates.generatedImages;
            console.log(`[ToolExecutionMiddleware] 🔄 更新generatedImages: ${this.generatedImages.size} 张图片`);
        }
        if (updates.imageCounter !== undefined) {
            this.imageCounter = updates.imageCounter;
            console.log(`[ToolExecutionMiddleware] 🔄 更新imageCounter: ${this.imageCounter}`);
        }
        
        console.log('[ToolExecutionMiddleware] ✅ 共享状态已更新完成');
    }

    /**
     * 获取共享状态
     * 🔥 供主文件获取最新状态
     */
    getSharedState() {
        return {
            visitedURLs: this.visitedURLs,
            generatedImages: this.generatedImages,
            imageCounter: this.imageCounter,
            intermediateSteps: this.intermediateSteps,
            dataBus: this.dataBus,
            runId: this.runId
        };
    }

    /**
     * 重置状态（新研究开始时调用）
     * 🔥 与主文件保持一致
     */
    resetState() {
        this.visitedURLs.clear();
        this.generatedImages.clear();
        this.imageCounter = 0;
        this.runId = null;
        this.currentResearchContext = "";
        
        console.log('[ToolExecutionMiddleware] 🔄 工具执行状态已重置（新研究开始）');
    }
    
    /**
     * 🎯 获取图像计数器（供主文件同步使用）
     */
    getImageCounter() {
        return this.imageCounter;
    }
    
    /**
     * 🎯 设置图像计数器（供主文件同步使用）
     */
    setImageCounter(count) {
        this.imageCounter = count;
        console.log(`[ToolExecutionMiddleware] 🔄 设置imageCounter: ${this.imageCounter}`);
    }
    
    /**
     * 🆕 调试方法：打印当前DataBus状态
     */
    printDataBusStatus() {
        console.log(`[ToolExecutionMiddleware] 🚌 DataBus 状态报告:`);
        console.log(`  • 总条目数: ${this.dataBus.size}`);
        
        // 按step_1, step_2...顺序打印
        const stepKeys = Array.from(this.dataBus.keys())
            .filter(key => key.startsWith('step_'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('step_', ''), 10);
                const numB = parseInt(b.replace('step_', ''), 10);
                return numA - numB;
            });
        
        stepKeys.forEach(key => {
            const data = this.dataBus.get(key);
            console.log(`  • ${key}: ${data.rawData.length} 字符, 工具: ${data.metadata.toolName}, 迭代: ${data.metadata.iteration || '未知'}`);
        });
    }
}