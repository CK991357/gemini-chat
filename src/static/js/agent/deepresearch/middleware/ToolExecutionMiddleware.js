// src/static/js/agent/deepresearch/middleware/ToolExecutionMiddleware.js
// 🛠️ 工具执行中间件 - 从 DeepResearchAgent 中分离的核心工具执行逻辑
// 🔥 修复版 - 解决与主文件的兼容性问题
// 📅 修复版本: 1.5 - 新增 alphavantage 工具支持
// 🚀 优化：修复括号平衡检测，增强数据传递，移除冗余方案，新增金融数据工具支持

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
        
        // 🎯 修复 imageCounter 传递方式不匹配问题
        if (config.imageCounter && typeof config.imageCounter === 'function') {
            this.getImageCounterExternal = config.imageCounter;
            this.imageCounter = config.imageCounter(); // 初始化时获取当前值
        } else if (config.imageCounter !== undefined) {
            this.imageCounter = config.imageCounter;
        } else {
            this.imageCounter = sharedState.imageCounter || 0;
        }
        
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

        // 🟢 步骤 B: 智能数据上下文构建
        // 🔥 关键修复：如果data_context只是描述，尝试从数据总线获取实际数据
        let actualDataContext = data_context;
        
        if (data_context && typeof data_context === 'string') {
            // 检查是否包含关键词，表明需要获取实际数据
            const needsActualData = data_context.includes('上一步crawl4ai') || 
                                   data_context.includes('crawl4ai抓取') ||
                                   data_context.includes('全文内容') ||
                                   data_context.includes('上一步alphavantage') ||
                                   data_context.includes('金融数据');
            
            if (needsActualData) {
                console.log('[ToolExecutionMiddleware] 🔍 检测到需要获取实际数据，扫描数据总线...');
                
                // 按步骤倒序查找最新的相关数据
                const stepKeys = Array.from(this.dataBus.keys())
                    .filter(key => key.startsWith('step_'))
                    .sort((a, b) => {
                        const numA = parseInt(a.replace('step_', ''), 10);
                        const numB = parseInt(b.replace('step_', ''), 10);
                        return numB - numA; // 降序
                    });
                
                // 优先查找 crawl4ai 数据
                if (data_context.includes('crawl4ai')) {
                    for (const key of stepKeys) {
                        const data = this.dataBus.get(key);
                        if (data && data.metadata && data.metadata.toolName === 'crawl4ai') {
                            // ✅ 优先使用元数据中存储的原始 JSON（如果存在）
                            if (data.metadata.originalData) {
                                actualDataContext = JSON.stringify(data.metadata.originalData);
                                console.log(`[ToolExecutionMiddleware] ✅ 使用metadata中的原始JSON数据 (${actualDataContext.length} 字符)`);
                            } else {
                                // 降级：从文本中提取（兼容旧数据）
                                const rawData = data.rawData || data.originalData;
                                if (rawData && rawData.length > 100) {
                                    console.log(`[ToolExecutionMiddleware] ⚠️ 使用降级文本提取，长度: ${rawData.length} 字符`);
                                    
                                    // 安全截断，防止提示词过长
                                    const maxDataLength = 15000;
                                    if (rawData.length > maxDataLength) {
                                        const firstPart = rawData.substring(0, 8000);
                                        const middlePart = rawData.substring(8000, 14000);
                                        actualDataContext = firstPart + middlePart + "\n[...内容过长，已截断部分中间内容...]";
                                    } else {
                                        actualDataContext = rawData;
                                    }
                                }
                            }
                            
                            if (actualDataContext && actualDataContext.length > 100) {
                                console.log(`[ToolExecutionMiddleware] ✅ 找到最新crawl4ai数据: ${key}, 长度: ${actualDataContext.length} 字符`);
                                break;
                            }
                        }
                    }
                }
                // 查找 alphavantage 数据
                else if (data_context.includes('alphavantage') || data_context.includes('金融数据')) {
                    for (const key of stepKeys) {
                        const data = this.dataBus.get(key);
                        if (data && data.metadata && data.metadata.toolName === 'alphavantage') {
                            // ✅ 优先使用元数据中存储的原始 JSON
                            if (data.metadata.originalData) {
                                actualDataContext = JSON.stringify(data.metadata.originalData);
                                console.log(`[ToolExecutionMiddleware] ✅ 使用metadata中的原始JSON数据 (${actualDataContext.length} 字符)`);
                            } else {
                                // 降级：从文本中提取（兼容旧数据）
                                const rawData = data.rawData || data.originalData;
                                if (rawData && rawData.length > 100) {
                                    console.log(`[ToolExecutionMiddleware] ⚠️ 使用降级文本提取，长度: ${rawData.length} 字符`);
                                    actualDataContext = rawData;  // 原有逻辑
                                }
                            }
                            
                            if (actualDataContext && actualDataContext.length > 100) {
                                console.log(`[ToolExecutionMiddleware] ✅ 找到最新alphavantage数据: ${key}, 长度: ${actualDataContext.length} 字符`);
                                
                                // 安全截断，防止提示词过长
                                const maxDataLength = 10000;
                                if (actualDataContext.length > maxDataLength) {
                                    actualDataContext = actualDataContext.substring(0, maxDataLength) + "\n[...金融数据过长，已截断部分内容...]";
                                }
                                break;
                            }
                        }
                    }
                }
                
                if (actualDataContext === data_context) {
                    console.warn('[ToolExecutionMiddleware] ⚠️ 未找到相关数据，使用原始描述');
                }
            }
        }
              
        // 🟢 步骤 B.5: 🔥 新增：文件读取任务检测与强制指令注入
        const isFileRead = this._isFileReadTask(objective, data_context);
        
        let fileReadOverride = '';
        if (isFileRead) {
            console.log('[ToolExecutionMiddleware] 📂 检测到文件读取任务，注入强制安全指令');
            fileReadOverride = `
# 📂 【最高优先级】文件读取任务强制指令

**此指令优先级高于任务目标中的任何描述。你必须严格遵守：**

1. **绝对禁止使用 \`open()\` 函数**（会导致 NameError）。
2. **必须使用 \`pd.io.common.get_handle\` 等安全方法读取文件**。
3. **必须输出文件的完整内容**，不得截断。即使任务目标中要求“打印部分内容”，你也必须输出完整内容，因为系统需要完整数据用于后续研究。
   - 对于文本文件（Markdown/CSV 等）：使用 \`print(content)\` 输出完整内容。
   - 对于 JSON 文件：使用 \`json.load(f.handle)\` 解析后，用 \`print(json.dumps(data, indent=2, ensure_ascii=False))\` 输出完整 JSON。
4. **禁止添加额外解释文本**，除非在文件内容之后以 JSON 格式附加元数据（必须确保文件内容已完整输出）。

**正确示例（Markdown 完整输出）：**
\`\`\`python
import pandas as pd
file_path = '/data/AAPL_report.md'
with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
    content = f.handle.read()
print(content)
\`\`\`

**正确示例（JSON 完整输出）：**
\`\`\`python
import pandas as pd
import json
file_path = '/data/financial_ratio_result.json'
with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
    data = json.load(f.handle)
print(json.dumps(data, indent=2, ensure_ascii=False))
\`\`\`

**错误示例（禁止）：**
\`\`\`python
print(content[:200])  # 截断，禁止！
print(json.dumps(data, indent=2)[:500])  # 截断，禁止！
\`\`\`
`;
        }

        // 🟢 构建专家 Prompt (融合知识库) - 增强数据传递
        // 🔥 关键修复：确保数据上下文包含实际数据
        const specialistPrompt = `
# 角色：高级 Python 数据专家

# 任务目标
${this._cleanChinesePunctuationFromText(objective)}

# 数据上下文 (必须严格遵守)
## 原始指令描述
${data_context}

## 实际数据内容（用于分析）
${this._cleanChinesePunctuationFromText(
    typeof actualDataContext === 'string' && actualDataContext.length > 500 ? 
    actualDataContext.substring(0, 12000) + (actualDataContext.length > 12000 ? "\n[...数据过长，已截断部分内容...]" : "") :
    actualDataContext
)}
${fileReadOverride}
# 📚 你的核心技能与规范 (Knowledge Base)
${knowledgeContext ? this._cleanChinesePunctuationFromText(knowledgeContext) : "未加载知识库. 请遵循通用 Python 规范."}

# ⚡ 补充强制执行协议 (Override Rules)
1. **核心导入**: 必须在代码开头**强制导入**以下库: \`import json\`, \`import pandas as pd\`, \`import matplotlib.pyplot as plt\`, \`import numpy as np\`.
2. **数据硬编码**: 必须将【实际数据内容】中的数据完整写入代码变量, **严禁空赋值**.
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
                model: 'models/gemini-2.5-flash', 
                temperature: 0.1
            });

            // 🎯 Token追踪
            if (response?.usage) {
                this.updateTokenUsageMethod(response.usage);
            }

            const executionTime = Date.now() - startTime;
            console.log(`[ToolExecutionMiddleware] ⏱️ 专家模型响应时间: ${executionTime}ms`);
            
            let generatedCode = response.choices[0].message.content;
            
            // 🔥 关键修复：增强代码清理和验证
            // 🚀 第一步：立即移除所有可能的中文标点
            generatedCode = this._aggressivelyRemoveChinesePunctuation(generatedCode);
            
            // 🚀 第二步：然后进行常规清理和验证
            generatedCode = this._cleanAndValidateGeneratedCode(generatedCode, objective);
            
            // 🔥 移除备用方案触发逻辑，专注提升专家代码质量
            // 仅在最极端情况下才考虑简化方案
            const codeQualityCheck = this._assessCodeQuality(generatedCode);
            
            if (codeQualityCheck.severity === 'critical') {
                console.error(`[ToolExecutionMiddleware] ❌ 专家代码质量极差: ${codeQualityCheck.reason}`);
                console.log('[ToolExecutionMiddleware] 🔧 尝试生成简化分析代码...');
                
                // 仅生成最基本的分析代码
                const simplifiedCode = this._generateMinimalAnalysisCode(objective, actualDataContext);
                if (simplifiedCode) {
                    generatedCode = simplifiedCode;
                }
            } else if (codeQualityCheck.severity === 'warning') {
                console.warn(`[ToolExecutionMiddleware] ⚠️ 专家代码存在警告: ${codeQualityCheck.reason}`);
                // 继续使用专家代码，但尝试修复
            }
            
            console.log(`[ToolExecutionMiddleware] 👨‍💻 专家代码生成完毕，长度: ${generatedCode.length} 字符`);
            
            // 🔥 增强：验证代码基本语法（使用改进的验证方法）
            const syntaxCheck = this._validatePythonSyntaxEnhanced(generatedCode);
            if (!syntaxCheck.isValid) {
                console.warn(`[ToolExecutionMiddleware] ⚠️ 代码语法检查发现问题: ${syntaxCheck.error}`);
                console.log('[ToolExecutionMiddleware] 🔧 尝试自动修复语法错误...');
                generatedCode = this._repairSyntaxErrorsEnhanced(generatedCode, syntaxCheck.error);
                
                // 重新验证修复后的代码
                const secondCheck = this._validatePythonSyntaxEnhanced(generatedCode);
                if (!secondCheck.isValid) {
                    console.error(`[ToolExecutionMiddleware] ❌ 修复后仍有问题: ${secondCheck.error}`);
                    // 不放弃，继续执行，让沙盒报告具体错误
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
                // 🔥🔥🔥 核心修复：正确处理双重JSON嵌套
                console.log('[ToolExecutionMiddleware] 🔍 开始处理python_sandbox输出，长度:', sandboxResult.rawObservation?.length);
                
                try {
                    // 🎯 尝试1：直接解析rawObservation
                    let outputData = null;
                    const rawObservation = sandboxResult.rawObservation || '';
                    
                    try {
                        const parsed = JSON.parse(rawObservation);
                        
                        // 检查是否是双重嵌套 {"stdout": "..."}
                        if (parsed.stdout && typeof parsed.stdout === 'string') {
                            console.log('[ToolExecutionMiddleware] ✅ 检测到stdout字段，尝试解析内层JSON');
                            
                            try {
                                // 解析内层JSON
                                outputData = JSON.parse(parsed.stdout);
                                console.log('[ToolExecutionMiddleware] ✅ 成功解析内层JSON，类型:', outputData.type || 'unknown');
                            } catch (innerError) {
                                console.warn('[ToolExecutionMiddleware] ⚠️ 内层JSON解析失败:', innerError.message);
                                
                                // 尝试直接从stdout字符串中提取JSON
                                const jsonMatch = parsed.stdout.match(/\{"type":\s*"image".*?\}/);
                                if (jsonMatch) {
                                    try {
                                        outputData = JSON.parse(jsonMatch[0]);
                                        console.log('[ToolExecutionMiddleware] ✅ 从stdout字符串中提取图像JSON成功');
                                    } catch (matchError) {
                                        console.warn('[ToolExecutionMiddleware] ⚠️ 提取的JSON解析失败:', matchError.message);
                                    }
                                }
                            }
                        } else {
                            // 如果没有stdout字段，直接使用解析结果
                            outputData = parsed;
                            console.log('[ToolExecutionMiddleware] ✅ 直接解析成功，类型:', outputData.type || 'unknown');
                        }
                    } catch (outerError) {
                        console.log('[ToolExecutionMiddleware] 🔍 外层JSON解析失败，尝试其他方法:', outerError.message);
                        
                        // 🎯 尝试2：从原始字符串中直接匹配JSON
                        const jsonMatch = rawObservation.match(/\{"type":\s*"image".*?\}/);
                        if (jsonMatch) {
                            try {
                                outputData = JSON.parse(jsonMatch[0]);
                                console.log('[ToolExecutionMiddleware] ✅ 直接匹配图像JSON成功');
                            } catch (matchError) {
                                console.warn('[ToolExecutionMiddleware] ⚠️ 直接匹配JSON解析失败:', matchError.message);
                            }
                        }
                        
                        // 🎯 尝试3：如果仍然失败，检查是否是转义的JSON字符串
                        if (!outputData && rawObservation.includes('\\"type\\":\\"image\\"')) {
                            console.log('[ToolExecutionMiddleware] 🔍 检测到转义JSON，尝试清理');
                            const unescaped = rawObservation.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                            const cleanedMatch = unescaped.match(/\{"type":\s*"image".*?\}/);
                            if (cleanedMatch) {
                                try {
                                    outputData = JSON.parse(cleanedMatch[0]);
                                    console.log('[ToolExecutionMiddleware] ✅ 清理后解析转义JSON成功');
                                } catch (e) {
                                    console.warn('[ToolExecutionMiddleware] ⚠️ 清理后JSON解析失败:', e.message);
                                }
                            }
                        }
                    }

                    // 🎯 处理图像数据
                    if (outputData && outputData.type === 'image' && outputData.image_base64) {
                        // 🚀 增强图像处理：验证base64数据有效性
                        if (outputData.image_base64.length > 100) {
                            console.log('[ToolExecutionMiddleware] 🖼️ 检测到有效图像输出，调用图像处理方法');
                            console.log('[ToolExecutionMiddleware] 📊 图像数据长度:', outputData.image_base64.length, '字符');
                            console.log('[ToolExecutionMiddleware] 📝 图像标题:', outputData.title);
                            
                            finalObservation = this._handleGeneratedImage(outputData);
                        } else {
                            console.warn('[ToolExecutionMiddleware] ⚠️ 图像数据格式无效或太短');
                            finalObservation = `⚠️ **图像生成失败** - 数据格式无效\n\n错误信息: 图像数据长度不足或格式错误`;
                        }
                    } 
                    // 🔥 新增：直接处理stdout中的图像数据（当outputData为null时）
                    else if (!outputData && rawObservation.includes('"type": "image"') && rawObservation.includes('"image_base64":')) {
                        console.log('[ToolExecutionMiddleware] 🔍 在原始输出中检测到图像JSON模式，尝试提取');
                        
                        // 使用更精确的正则表达式匹配
                        const imagePattern = /\{"type":\s*"image".*?"image_base64":\s*"[^"]+".*?\}/s;
                        const imageMatch = rawObservation.match(imagePattern);
                        
                        if (imageMatch) {
                            try {
                                // 先尝试直接解析
                                const imageData = JSON.parse(imageMatch[0]);
                                finalObservation = this._handleGeneratedImage(imageData);
                            } catch (parseError) {
                                console.warn('[ToolExecutionMiddleware] ⚠️ 图像JSON解析失败，尝试清理:', parseError.message);
                                
                                // 尝试清理转义字符后解析
                                const cleaned = imageMatch[0].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                try {
                                    const imageData = JSON.parse(cleaned);
                                    finalObservation = this._handleGeneratedImage(imageData);
                                } catch (e) {
                                    console.warn('[ToolExecutionMiddleware] ⚠️ 清理后解析也失败:', e.message);
                                }
                            }
                        }
                    }
                    // 原有其他类型的处理逻辑保持不变
                    else if (outputData && ['excel', 'word', 'powerpoint', 'ppt', 'pdf'].includes(outputData.type) && outputData.data_base64) {
                        // 文件处理逻辑
                        console.log(`[ToolExecutionMiddleware] 📄 检测到Python沙盒生成的文件: ${outputData.type}`);
                        finalObservation = `[✅ 文件生成成功] 类型: "${outputData.type}", 标题: "${outputData.title}". 文件已准备就绪。`;
                        this.callbackManager.invokeEvent('on_file_generated', {
                            run_id: this.runId,
                            data: outputData
                        });
                    } else if (outputData && (outputData.type === 'ml_report' || outputData.type === 'data_extraction')) {
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
                    } else if (outputData) {
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
                    } else {
                        // 如果没有解析出outputData，使用降级处理
                        console.log('[ToolExecutionMiddleware] 🔄 未解析出有效数据，使用降级处理');
                        finalObservation = this._handleNonJsonOutput(sandboxResult.rawObservation);
                    }
                } catch (e) {
                    console.error('[ToolExecutionMiddleware] ❌ 图像处理过程异常:', e);
                    // 降级处理
                    finalObservation = this._handleNonJsonOutput(sandboxResult.rawObservation);
                }

            } else {
                // 失败情况
                console.log('[ToolExecutionMiddleware] ❌ 专家代码执行出错');
                
                // 🔥 增强错误处理：智能格式化错误信息
                const errorMsg = sandboxResult.rawObservation || '未知错误';
                let finalObservation;
                
                // 根据错误类型提供智能建议
                if (errorMsg.includes('SyntaxError')) {
                    finalObservation = `❌ **专家代码语法错误**\n\n错误详情: ${errorMsg.substring(0, 500)}\n\n**建议**: 检查括号匹配、引号闭合和缩进格式`;
                } else if (errorMsg.includes('NameError')) {
                    finalObservation = `❌ **专家代码变量未定义**\n\n错误详情: ${errorMsg.substring(0, 500)}\n\n**建议**: 确保所有变量在使用前都已正确定义`;
                } else if (errorMsg.includes('ImportError') || errorMsg.includes('ModuleNotFoundError')) {
                    finalObservation = `❌ **专家代码导入失败**\n\n错误详情: ${errorMsg.substring(0, 500)}\n\n**建议**: 沙箱仅支持标准库和pandas/matplotlib/numpy/scipy/scikit-learn/statsmodels`;
                } else {
                    // 通用错误，返回完整信息
                    finalObservation = `❌ **专家代码执行出错**\n\n错误信息: ${errorMsg.substring(0, 800)}`;
                }

                // 标记 code_generator 调用失败
                recordToolCall('code_generator', parameters, false, finalObservation);

                return {
                    rawObservation: finalObservation,
                    toolSources: sandboxResult.toolSources,
                    toolSuccess: false
                };
            }

            // 标记 code_generator 调用成功
            recordToolCall('code_generator', parameters, true, "专家任务已完成");

            // 🔥 核心修改：在成功分支中返回原始完整输出
            return {
                rawObservation: finalObservation,           // 截断后的 Agent 友好文本
                toolSources: sandboxResult.toolSources,
                toolSuccess: sandboxResult.toolSuccess,
                fullStdout: sandboxResult.fullStdout || sandboxResult.rawObservation // 🔥 优先使用保存的完整输出
            };

        } catch (error) {
            console.error('[ToolExecutionMiddleware] ❌ 专家系统故障:', error);
            recordToolCall('code_generator', parameters, false, `专家系统故障: ${error.message}`);
            return { rawObservation: `专家系统故障: ${error.message}`, toolSources: [], toolSuccess: false };
        }
    }

    // ============================================================
    // 🎯 处理非JSON输出（降级处理）- 新增方法
    // ============================================================
    
    /**
     * 🎯 处理非JSON输出（降级处理）
     */
    _handleNonJsonOutput(rawOutput) {
        console.log('[ToolExecutionMiddleware] 🔄 执行非JSON输出处理');
        
        // 检查是否已经是成功消息
        if (rawOutput.includes('[✅ 图像生成成功]') ||
            rawOutput.includes('[✅ 文件生成成功]')) {
            return rawOutput;
        }
        
        // 尝试检测图像数据
        if ((rawOutput.includes('iVBOR') || rawOutput.includes('/9j/')) && 
            rawOutput.length > 500) {
            console.log('[ToolExecutionMiddleware] 🖼️ 在纯文本中检测到图像数据标记');
            
            // 尝试提取base64数据
            const base64Pattern = /image_base64["']?\s*[:=]\s*["']([^"']+)["']/;
            const base64Match = rawOutput.match(base64Pattern);
            
            if (base64Match && base64Match[1]) {
                const titleMatch = rawOutput.match(/title["']?\s*[:=]\s*["']([^"']+)["']/);
                
                const imageData = {
                    type: 'image',
                    title: titleMatch ? titleMatch[1] : '提取的图像',
                    image_base64: base64Match[1]
                };
                
                return this._handleGeneratedImage(imageData);
            }
        }
        
        // 对于纯文本输出，如果包含结构化信息，尝试格式化
        const hasTable = rawOutput.includes('|') && rawOutput.includes('---');
        const hasJsonStructure = rawOutput.includes('{') && rawOutput.includes('}');

        if (hasTable || hasJsonStructure) {
            return `✅ **专家任务执行成功 (包含结构化数据)**\n\n${rawOutput.substring(0, 2000)}${rawOutput.length > 2000 ? '...' : ''}`;
        } else if (rawOutput.length > 500) {
            return `✅ **专家任务执行成功**\n\n输出 (已截断):\n${rawOutput.substring(0, 500)}...\n\n*完整输出: ${rawOutput.length} 字符*`;
        } else {
            return `✅ **专家任务执行成功**\n\n输出:\n${rawOutput}`;
        }
    }

    // ============================================================
    // 🔥🔥🔥 新增：代码质量评估方法 🔥🔥🔥
    // ============================================================
    
    /**
     * 🎯 评估代码质量（取代备用方案触发逻辑）
     * @param {string} code - Python代码
     * @returns {Object} 质量评估结果 {severity: 'critical'|'warning'|'ok', reason: string}
     */
    _assessCodeQuality(code) {
        // 1. 基本有效性检查
        if (!code || code.trim().length < 50) {
            return { severity: 'critical', reason: '代码过短或为空' };
        }
        
        // 2. 是否有基本结构
        const hasImport = code.includes('import ') || code.includes('from ');
        const hasFunctionOrLogic = code.includes('def ') || code.includes('print(') || code.includes('=');
        
        if (!hasImport && !hasFunctionOrLogic) {
            return { severity: 'critical', reason: '缺少基本代码结构' };
        }
        
        // 3. 是否有有效输出
        if (!this._hasValidOutputStatement(code)) {
            return { severity: 'warning', reason: '缺少有效输出语句' };
        }
        
        // 4. 检查明显的中文标点问题（仅在关键位置）
        const criticalChinesePunctuation = this._countCriticalChinesePunctuation(code);
        if (criticalChinesePunctuation > 5) {
            return { severity: 'warning', reason: `关键位置有${criticalChinesePunctuation}个中文标点` };
        }
        
        return { severity: 'ok', reason: '代码质量可接受' };
    }
    
    /**
     * 🎯 统计关键位置的中文标点（字符串和注释中忽略）
     */
    _countCriticalChinesePunctuation(code) {
        const lines = code.split('\n');
        let count = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 跳过注释行
            if (line.startsWith('#')) continue;
            
            // 查找代码部分（排除注释）
            let codePart = line;
            const commentIndex = line.indexOf('#');
            if (commentIndex !== -1) {
                codePart = line.substring(0, commentIndex);
            }
            
            // 检查不在字符串内的中文标点
            let inString = false;
            let stringChar = null;
            
            for (let j = 0; j < codePart.length; j++) {
                const char = codePart[j];
                const prevChar = j > 0 ? codePart[j - 1] : '';
                
                // 字符串开始/结束检测
                if (!inString && (char === '"' || char === "'")) {
                    inString = true;
                    stringChar = char;
                } else if (inString && char === stringChar && prevChar !== '\\') {
                    inString = false;
                    stringChar = null;
                }
                
                // 不在字符串中时检查中文标点
                if (!inString) {
                    const chinesePunctuation = /[，。；：（）【】「」《》、]/;
                    if (chinesePunctuation.test(char)) {
                        count++;
                    }
                }
            }
        }
        
        return count;
    }
    
    /**
     * 🎯 生成最小化分析代码（仅在最极端情况下使用）
     */
    _generateMinimalAnalysisCode(objective, dataContext) {
        console.log('[ToolExecutionMiddleware] 🛡️ 生成最小化分析代码...');
        
        // 安全截断数据
        const safeData = typeof dataContext === 'string' && dataContext.length > 5000 ?
            dataContext.substring(0, 5000) + "\n[...数据过长，已截断...]" :
            dataContext;
        
        return `
import json

def minimal_analysis(text, objective):
    """最小化分析函数 - 仅提取最基本的信息"""
    result = {
        "type": "minimal_analysis",
        "status": "limited_analysis",
        "objective": objective,
        "data_summary": {
            "length": len(text),
            "has_chinese": "是" if any('\\u4e00' <= ch <= '\\u9fff' for ch in text) else "否",
            "has_numbers": "是" if any(ch.isdigit() for ch in text) else "否",
            "sample": text[:500] + ("..." if len(text) > 500 else "")
        },
        "note": "专家代码生成失败，仅提供基本数据摘要。请检查数据格式后重试。"
    }
    return result

try:
    data = """${safeData}"""
    result = minimal_analysis(data, """${objective.replace(/"/g, '\\"')}""")
    print(json.dumps(result, ensure_ascii=False, indent=2))
except Exception as e:
    print(json.dumps({
        "type": "error",
        "message": "最小化分析也失败: " + str(e)
    }, ensure_ascii=False, indent=2))
`;
    }

    // ============================================================
    // 🔥🔥🔥 增强的代码清理和验证方法 🔥🔥🔥
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
            '，': ',',    // 逗号
            '。': '.',    // 句号
            '；': ';',    // 分号
            '：': ':',    // 冒号
            '（': '(',    // 左圆括号
            '）': ')',    // 右圆括号
            '【': '[',    // 左方括号
            '】': ']',    // 右方括号
            '《': '"',    // 左书名号
            '》': '"',    // 右书名号
            '、': ',',    // 顿号
            '＂': '"',    // 全角双引号
            '＇': "'",    // 全角单引号
            '？': '?',    // 问号
            '！': '!',    // 感叹号
            '『': '"',    // 左双引号（竖排）
            '』': '"',    // 右双引号（竖排）
            '〈': '<',    // 左尖括号
            '〉': '>',    // 右尖括号
            '〔': '[',    // 左六角括号
            '〕': ']',    // 右六角括号
            '—': '-',    // 破折号/长横
            '～': '~',    // 波浪号
            '·': '.',    // 间隔号
            '「': '"',    // 左双引号（中文）
            '」': '"',    // 右双引号（中文）
            '‘': "'",    // 左单引号（中文）
            '’': "'"     // 右单引号（中文）
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
     * 🎯 增强的Python代码语法验证（修复括号平衡检测）
     */
    _validatePythonSyntaxEnhanced(code) {
        console.log('[ToolExecutionMiddleware] 🔍 增强Python代码语法验证...');
        
        // 1. 检查括号平衡（忽略字符串内的括号）
        const bracketPairs = [
            { open: '(', close: ')' },
            { open: '[', close: ']' },
            { open: '{', close: '}' }
        ];
        
        for (const pair of bracketPairs) {
            let openCount = 0;
            let closeCount = 0;
            let inString = false;
            let stringChar = null;
            let escaped = false;
            
            for (let i = 0; i < code.length; i++) {
                const char = code[i];
                
                // 处理转义字符
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === '\\') {
                    escaped = true;
                    continue;
                }
                
                // 检查是否在字符串内
                if (!inString && (char === '"' || char === "'")) {
                    inString = true;
                    stringChar = char;
                } else if (inString && char === stringChar && !escaped) {
                    inString = false;
                    stringChar = null;
                }
                
                // 只有在不在字符串内时才统计括号
                if (!inString) {
                    if (char === pair.open) openCount++;
                    if (char === pair.close) closeCount++;
                }
            }
            
            if (openCount !== closeCount) {
                return {
                    isValid: false,
                    error: `${pair.open}与${pair.close}不平衡: ${openCount}个左括号, ${closeCount}个右括号`
                };
            }
        }
        
        // 2. 检查是否存在明显的中文标点错误（仅在关键位置）
        const chinesePunctuation = /[，。；：（）【】「」《》、]/;
        const lines = code.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const chineseMatch = line.match(chinesePunctuation);
            if (chineseMatch) {
                // 检查是否在字符串内
                let inString = false;
                let stringChar = null;
                let escaped = false;
                
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    
                    // 处理转义字符
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (char === '\\') {
                        escaped = true;
                        continue;
                    }
                    
                    // 检查是否在字符串内
                    if (!inString && (char === '"' || char === "'")) {
                        inString = true;
                        stringChar = char;
                    } else if (inString && char === stringChar && !escaped) {
                        inString = false;
                        stringChar = null;
                    }
                    
                    // 如果找到中文标点且不在字符串内
                    if (j === chineseMatch.index && !inString) {
                        // 检查是否在注释中
                        const beforeMatch = line.substring(0, j);
                        if (!beforeMatch.includes('#')) {
                            return {
                                isValid: false,
                                error: `第${i+1}行存在中文标点符号: "${chineseMatch[0]}"`
                            };
                        }
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
     * 🎯 增强的语法错误修复
     */
    _repairSyntaxErrorsEnhanced(code, error) {
        console.log(`[ToolExecutionMiddleware] 🔧 尝试修复语法错误: ${error}`);
        
        let repairedCode = code;
        
        // 1. 修复括号不平衡
        if (error.includes('不平衡')) {
            // 提取括号类型和数量
            const match = error.match(/([({[\]})])与([({[\]})])不平衡: (\d+)个左括号, (\d+)个右括号/);
            if (match) {
                const openChar = match[1];
                const closeChar = match[2];
                const openCount = parseInt(match[3], 10);
                const closeCount = parseInt(match[4], 10);
                
                if (openCount > closeCount) {
                    // 添加缺失的右括号
                    const missingCount = openCount - closeCount;
                    repairedCode += closeChar.repeat(missingCount);
                    console.log(`[ToolExecutionMiddleware] 🔄 添加 ${missingCount} 个 ${closeChar}`);
                } else if (closeCount > openCount) {
                    // 移除多余的右括号（从末尾开始移除）
                    const extraCount = closeCount - openCount;
                    let removed = 0;
                    for (let i = repairedCode.length - 1; i >= 0 && removed < extraCount; i--) {
                        if (repairedCode[i] === closeChar) {
                            repairedCode = repairedCode.substring(0, i) + repairedCode.substring(i + 1);
                            removed++;
                        }
                    }
                    console.log(`[ToolExecutionMiddleware] 🔄 移除 ${removed} 个 ${closeChar}`);
                }
            }
        }
        
        // 2. 修复中文标点错误
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
        
        // 3. 确保代码有输出
        if (!repairedCode.includes('print(') && !repairedCode.includes('print (')) {
            repairedCode += '\n\n# 输出结果\nimport json\nprint(json.dumps({"type": "analysis_result", "status": "completed", "message": "Analysis completed after syntax repair"}, ensure_ascii=False, indent=2))';
        }
        
        return repairedCode;
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
        // 🔧 新增：用于传递原始数据给上层
        let originalDataForResult = null;
        // 🔥 新增：用于保存完整输出副本
        let fullStdoutForResult = null;

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
                
                // ========== 🆕 增量添加：open()函数非法调用检测 ==========
                // 预检1：检查是否使用 open()
                if (this._containsOpenCall(code)) {
                    console.warn('[ToolExecutionMiddleware] 🛑 检测到非法 open() 调用，启动急诊修复...');
                    const fixedCode = await this._repairCodeWithLLM(code, '非法使用 open() 函数，必须使用 pd.io.common.get_handle 等安全方法');
                    if (fixedCode) {
                        console.log('[ToolExecutionMiddleware] 🔄 使用修复后的代码继续执行...');
                        parameters.code = fixedCode;
                        // 继续执行，不需要返回，因为已经修改了 parameters.code
                    } else {
                        // 修复失败，返回错误
                        const errorMsg = `❌ **代码预检失败：非法使用 open()**\n\n检测到代码中包含 \`open()\` 调用，但沙盒环境已移除该函数。自动修复失败，请修正后重试。\n\n代码片段：\n\`\`\`python\n${code.substring(0, 500)}...\n\`\`\``;
                        recordToolCall(toolName, parameters, false, errorMsg);
                        return { rawObservation: errorMsg, toolSources: [], toolSuccess: false };
                    }
                }
                // ========== 🆕 增量添加结束 ==========
                
                // ========== 🆕 新增：截断操作检测与修复 ==========
                // 预检2：检查是否存在 content[:数字] 等截断模式
                const truncatedPattern = /print\s*\(\s*(\w+(?:\.\w+)*)\s*\[\s*:\s*\d+\s*\]\s*\)/g;
                let match;
                let hasTruncation = false;
                let fixedCode = code;
                
                while ((match = truncatedPattern.exec(code)) !== null) {
                    hasTruncation = true;
                    const fullMatch = match[0];
                    const variableName = match[1];
                    console.warn(`[ToolExecutionMiddleware] 🛑 检测到截断输出: ${fullMatch}`);
                    
                    // 替换为完整输出
                    const replacement = `print(${variableName})`;
                    fixedCode = fixedCode.replace(fullMatch, replacement);
                    console.log(`[ToolExecutionMiddleware] 🔄 修复截断: ${fullMatch} -> ${replacement}`);
                }
                
                if (hasTruncation) {
                    console.log('[ToolExecutionMiddleware] ✅ 截断修复完成，使用完整输出代码继续执行...');
                    parameters.code = fixedCode;
                }
                // ========== 🆕 截断检测结束 ==========
                
                // 🔥 新增：使用增强的语法验证
                const syntaxCheck = this._validatePythonSyntaxEnhanced(code);
                if (!syntaxCheck.isValid) {
                    console.warn(`[ToolExecutionMiddleware] ⚠️ 代码语法检查发现问题: ${syntaxCheck.error}`);
                    
                    // 尝试自动修复
                    const repairedCode = this._repairSyntaxErrorsEnhanced(code, syntaxCheck.error);
                    if (repairedCode !== code) {
                        console.log('[ToolExecutionMiddleware] 🔄 使用修复后的代码继续执行...');
                        parameters.code = repairedCode;
                    }
                }
            }

            // ============================================================
            // 🆕 新增：alphavantage 工具参数验证和格式化
            // ============================================================
            if (toolName === 'alphavantage') {
                console.log('[ToolExecutionMiddleware] 💹 处理alphavantage工具调用');
                
                // 🔥 确保参数格式正确
                // alphavantage工具期望的参数结构：{ mode: 'xxx', parameters: { ... } }
                if (!parameters.mode) {
                    console.warn('[ToolExecutionMiddleware] ⚠️ alphavantage缺少mode参数，尝试从parameters中提取');
                    
                    // 尝试从parameters中提取mode
                    if (parameters.parameters && parameters.parameters.mode) {
                        parameters.mode = parameters.parameters.mode;
                        delete parameters.parameters.mode;
                    } else if (parameters.parameters && typeof parameters.parameters === 'object') {
                        // 如果parameters本身就是一个对象，可能用户直接传入了mode
                        const possibleModes = ['weekly_adjusted', 'global_quote', 'earnings_transcript', 'insider_transactions', 
                                              'etf_profile', 'forex_daily', 'digital_currency_daily', 'wti', 'brent', 
                                              'copper', 'treasury_yield', 'news_sentiment', 'overview', 'income_statement',
                                              'balance_sheet', 'cash_flow', 'earnings', 'earnings_estimates', 
                                              'dividends', 'shares_outstanding'];
                        
                        for (const mode of possibleModes) {
                            if (parameters[mode] || (parameters.parameters && parameters.parameters[mode])) {
                                parameters.mode = mode;
                                break;
                            }
                        }
                    }
                    
                    if (!parameters.mode) {
                        console.error('[ToolExecutionMiddleware] ❌ 无法确定alphavantage mode参数');
                        throw new Error('alphavantage工具必须提供mode参数，如: { mode: "weekly_adjusted", parameters: { symbol: "AAPL" } }');
                    }
                }
                
                // 确保parameters存在
                if (!parameters.parameters) {
                    // 如果没有parameters字段，假设整个对象都是参数
                    const { mode, ...rest } = parameters;
                    parameters = {
                        mode: mode,
                        parameters: rest
                    };
                    console.log('[ToolExecutionMiddleware] 🔄 重新格式化alphavantage参数');
                }
                
                console.log(`[ToolExecutionMiddleware] 💹 alphavantage模式: ${parameters.mode}, 参数:`, parameters.parameters);
            }

            // --- 调用工具 ---
            console.log(`[ToolExecutionMiddleware] 🚀 开始调用工具 ${toolName}...`);
            const toolResult = await tool.invoke(parameters, {
                mode: 'deep_research',
                researchMode: detectedMode
            });

            // 🎯 关键修复：优先从 toolResult.data.stdout 获取完整输出（仅针对 python_sandbox）
            if (toolName === 'python_sandbox' && toolResult.success !== false) {
                // 尝试从 data.stdout 获取完整输出
                if (toolResult.data && typeof toolResult.data.stdout === 'string') {
                    rawObservation = toolResult.data.stdout;
                    fullStdoutForResult = rawObservation; // 🔥 保存完整副本
                    console.log(`[ToolExecutionMiddleware] 使用完整 stdout (${rawObservation.length} 字符)`);
                } else {
                    // 降级：使用原有的 output 或 JSON 字符串
                    rawObservation = toolResult.output || JSON.stringify(toolResult);
                }
                toolSuccess = true; // 标记成功
            } else {
                // 其他工具保持原有处理
                rawObservation = toolResult.output || JSON.stringify(toolResult);
                toolSuccess = toolResult.success !== false;
            }

            // 降级识别：检查 crawl4ai 是否降级运行
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
                    // 不是 JSON，保持 rawObservation 不变（此时 rawObservation 已经是完整 stdout）
                    console.log('[ToolExecutionMiddleware] 🐍 Python输出不是特殊JSON格式，作为纯文本处理。');
                }
            }
            
            // ================================================================
            // 🆕 新增：alphavantage 工具结果处理
            // ================================================================
            if (toolName === 'alphavantage' && toolSuccess) {
                try {
                    console.log('[ToolExecutionMiddleware] 💹 处理alphavantage工具返回结果');
                    
                    // ========== 新增：保留原始 JSON 对象 ==========
                    const originalData = toolResult.data || toolResult;  // 根据实际返回结构调整
                    originalDataForResult = originalData;               // 赋值给外部变量，随结果返回
                    // =============================================
                    
                    // 尝试解析JSON结果
                    let parsedResult;
                    try {
                        parsedResult = JSON.parse(rawObservation);
                    } catch (e) {
                        console.log('[ToolExecutionMiddleware] 💹 alphavantage返回的不是JSON，直接使用原始输出');
                        parsedResult = rawObservation;
                    }
                    
                    // 格式化输出以便Agent理解
                    if (typeof parsedResult === 'object' && parsedResult !== null) {
                        if (parsedResult.success === true && parsedResult.data) {
                            // 成功获取数据
                            const mode = parameters.mode || 'unknown';
                            const data = parsedResult.data;
                            const metadata = parsedResult.metadata || {};
                            
                            // 根据数据类型格式化输出
                            let formattedOutput = `✅ **AlphaVantage金融数据获取成功**\n\n`;
                            formattedOutput += `**模式**: ${mode}\n`;
                            
                            if (metadata.timestamp) {
                                formattedOutput += `**获取时间**: ${metadata.timestamp}\n`;
                            }
                            
                            if (metadata.saved_files && metadata.saved_files.length > 0) {
                                formattedOutput += `**保存的文件**:\n`;
                                metadata.saved_files.forEach((file, idx) => {
                                    formattedOutput += `  ${idx+1}. ${file.filename} (${file.size_kb.toFixed(1)} KB)\n`;
                                });
                            }
                            
                            // 添加数据摘要
                            if (typeof data === 'object') {
                                if (Array.isArray(data)) {
                                    formattedOutput += `\n**数据记录数**: ${data.length}\n`;
                                    if (data.length > 0 && data.length <= 10) {
                                        formattedOutput += `**示例数据**:\n\`\`\`json\n${JSON.stringify(data.slice(0, 3), null, 2)}\n\`\`\``;
                                    } else if (data.length > 10) {
                                        formattedOutput += `**示例数据 (前3条)**:\n\`\`\`json\n${JSON.stringify(data.slice(0, 3), null, 2)}\n\`\`\`\n`;
                                        formattedOutput += `**提示**: 共${data.length}条记录，建议使用python_sandbox进行进一步分析`;
                                    }
                                } else if (data.total_records || data.sample_data) {
                                    // 已处理过的数据格式
                                    formattedOutput += `\n**总记录数**: ${data.total_records || '未知'}\n`;
                                    if (data.sample_data) {
                                        formattedOutput += `**示例数据**:\n\`\`\`json\n${JSON.stringify(data.sample_data, null, 2)}\n\`\`\``;
                                    }
                                } else {
                                    // 单个对象
                                    const keyCount = Object.keys(data).length;
                                    formattedOutput += `\n**数据字段数**: ${keyCount}\n`;
                                    if (keyCount <= 15) {
                                        formattedOutput += `**完整数据**:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
                                    } else {
                                        // 只显示前5个字段
                                        const sample = {};
                                        let count = 0;
                                        for (const key in data) {
                                            if (count >= 5) break;
                                            sample[key] = data[key];
                                            count++;
                                        }
                                        formattedOutput += `**数据摘要 (前5个字段)**:\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n`;
                                        formattedOutput += `**提示**: 共${keyCount}个字段，建议使用python_sandbox进行进一步分析`;
                                    }
                                }
                            } else {
                                formattedOutput += `\n**获取的数据**: ${typeof data === 'string' ? data.substring(0, 500) + (data.length > 500 ? '...' : '') : String(data)}`;
                            }
                            
                            rawObservation = formattedOutput;
                            
                        } else if (parsedResult.error) {
                            // 错误情况
                            rawObservation = `❌ **AlphaVantage工具执行失败**\n\n错误信息: ${parsedResult.error}\n\n模式: ${parameters.mode || 'unknown'}`;
                            toolSuccess = false;
                        }
                    }
                    
                } catch (error) {
                    console.error('[ToolExecutionMiddleware] ❌ alphavantage结果处理异常:', error);
                    // 保持原始输出
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
            
            // 🔥 新增：alphavantage参数错误提示
            if (toolName === 'alphavantage') {
                if (error.message.includes('mode') || error.message.includes('参数')) {
                    rawObservation = `❌ **AlphaVantage参数错误**\n\n错误信息: ${error.message}\n\n**正确参数格式**:\n\`\`\`json\n{\n  "mode": "weekly_adjusted",\n  "parameters": {\n    "symbol": "AAPL"\n  }\n}\n\`\`\`\n\n**可用模式**: weekly_adjusted, global_quote, earnings_transcript, insider_transactions, etf_profile, forex_daily, digital_currency_daily, wti, brent, copper, treasury_yield, news_sentiment, overview, income_statement, balance_sheet, cash_flow, earnings, earnings_estimates, dividends, shares_outstanding`;
                }
            }
        }

        recordToolCall(toolName, parameters, toolSuccess, rawObservation);
        console.log(`[ToolExecutionMiddleware] 📊 工具调用记录完成: ${toolName}, 成功: ${toolSuccess}`);
        
        // 🔥 核心修复：保持与附件版完全一致的返回结构
        // 不包含 metadata 字段，确保与主文件兼容，但添加 originalData 和 fullStdout 用于传递原始数据
        const result = { rawObservation, toolSources, toolSuccess };
        if (fullStdoutForResult) {
            result.fullStdout = fullStdoutForResult;
            result._fullStdout = fullStdoutForResult; // 添加一个备用字段，确保传递
            console.log(`[ToolExecutionMiddleware] 完整输出已保存到备用字段 _fullStdout (${fullStdoutForResult.length} 字符)`);
        }
        if (originalDataForResult) {
            result.originalData = originalDataForResult;
            result.originalDataType = 'alphavantage';
        }
        return result;
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
        if (this.dataBus.size > 0 && (thought.includes('提取') || thought.includes('数据') || thought.includes('金融') || thought.includes('股票'))) {
            console.log('[ToolExecutionMiddleware] 🔍 检查数据总线中的相关数据...');
            
            const recentData = Array.from(this.dataBus.entries())
                .filter(([key, data]) => data.metadata.contentType === 'structured_data' || data.metadata.contentType === 'financial_data')
                .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.data.metadata.timestamp).getTime());
            
            if (recentData.length > 0) {
                const [key, data] = recentData[0];
                console.log(`[ToolExecutionMiddleware] ✅ 找到可用数据: ${key}, 类型: ${data.metadata.dataType || data.metadata.contentType}, 工具: ${data.metadata.toolName}`);
                
                thought = `注意：系统已缓存了相关结构化数据（${data.metadata.toolName}: ${data.metadata.dataType || data.metadata.contentType}），请考虑利用这些数据。\n\n${thought}`;
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
                           toolName === 'tavily_search' ? 'search_results' : 
                           toolName === 'alphavantage' ? 'financial_data' : 'text',
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
            } else if (toolName === 'alphavantage') {
                // 存储alphavantage特有信息
                metadata.dataType = 'financial_data';
                metadata.alphavantageMode = parameters.mode;
                
                // 存储关键参数
                if (parameters.parameters) {
                    if (parameters.parameters.symbol) {
                        metadata.symbol = parameters.parameters.symbol;
                    }
                    if (parameters.parameters.from_symbol || parameters.parameters.to_symbol) {
                        metadata.currencyPair = `${parameters.parameters.from_symbol || 'USD'}/${parameters.parameters.to_symbol || 'JPY'}`;
                    }
                }
            }

            // ========== 🆕 新增：将原始数据合并到 metadata ==========
            if (toolName === 'alphavantage' && result.originalData) {
                metadata.originalData = result.originalData;
                metadata.hasOriginalData = true;
                metadata.originalDataType = result.originalDataType || 'alphavantage';
                console.log(`[ToolExecutionMiddleware] ✅ 已将原始数据合并到 metadata，准备存储`);
            }
            
            // ========== 🔥 核心修复：处理 fullStdout ==========
            // 优先使用备用字段 _fullStdout，确保所有成功执行的工具都能存储完整输出
            const fullStdoutToSave = result._fullStdout || result.fullStdout;
            if (fullStdoutToSave) {
                metadata.full_stdout = fullStdoutToSave;
                metadata.has_full_stdout = true;
                console.log(`[ToolExecutionMiddleware] ✅ 已将 fullStdout 存入 metadata (${fullStdoutToSave.length} 字符)`);
            }
            // ========================================
            
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
     * 🎯 检测代码中是否包含 open() 函数调用
     * @param {string} code - Python代码字符串
     * @returns {boolean} 是否包含open()调用
     */
    _containsOpenCall(code) {
        // 移除字符串和注释后检查，避免误报
        const withoutStrings = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
        const withoutComments = withoutStrings.replace(/#.*$/gm, '');
        return /\bopen\s*\(/.test(withoutComments);
    }

    /**
     * 🚑 代码急诊室：基于 LLM 的自动修复
     * 🔥 增强版：智能获取上下文 + deepseek-chat
     */
    async _repairCodeWithLLM(brokenCode, errorType) {
        console.log('[ToolExecutionMiddleware] 🚑 启动代码急诊室 (Auto-Repair)...');
    
    // 🔥 关键修复1：优先获取有效的上下文数据
    let contextData = await this._getBestRepairContext();
    console.log(`[ToolExecutionMiddleware] 📊 修复上下文长度: ${contextData.length} 字符`);
    
    // 🔥🔥🔥 核心修复：验证急诊室上下文是否包含实际内容
    console.log('[ToolExecutionMiddleware] 🔍 验证急诊室数据上下文有效性...');
    
    // 检查contextData是否只是描述而不是实际数据
    if (typeof contextData === 'string' && contextData.length < 200) {
        console.warn('[ToolExecutionMiddleware] ⚠️ 急诊室数据上下文可能只是描述而非实际数据');
        
        // 尝试从intermediateSteps中查找实际数据
        const latestCrawlStep = this.intermediateSteps
            .slice()
            .reverse()
            .find(step => step.action?.tool_name === 'crawl4ai');
        
        if (latestCrawlStep?.observation) {
            console.log('[ToolExecutionMiddleware] 🔄 从最近crawl4ai步骤提取实际数据给急诊室');
            // 安全截断，防止提示词过长
            const maxDataLength = 8000;
            if (latestCrawlStep.observation.length > maxDataLength) {
                // 智能截断：保留开头和重要部分
                const firstPart = latestCrawlStep.observation.substring(0, 5000);
                const middlePart = latestCrawlStep.observation.substring(
                    Math.floor(latestCrawlStep.observation.length / 2) - 1000,
                    Math.floor(latestCrawlStep.observation.length / 2) + 1000
                );
                contextData = firstPart + "\n[...中间内容已省略...]\n" + middlePart + "\n[...]";
            } else {
                contextData = latestCrawlStep.observation;
            }
        }
    }
    
    // 🔥 确保急诊室数据至少有一定长度
    if (typeof contextData !== 'string' || contextData.length < 100) {
        console.error('[ToolExecutionMiddleware] ❌ 急诊室数据上下文无效，尝试其他来源');
        
        // 尝试从数据总线获取
        const busData = this._extractBestDataFromDataBus();
        if (busData && busData.length > 100) {
            contextData = busData;
            console.log(`[ToolExecutionMiddleware] 🔄 从DataBus获取急诊室数据: ${contextData.length} 字符`);
        } else {
            console.error('[ToolExecutionMiddleware] ❌ 所有急诊室数据源都无效');
            contextData = "急诊室无法获取有效数据上下文。请参考损坏的代码本身进行修复。";
        }
    }
    
    console.log(`[ToolExecutionMiddleware] ✅ 急诊室最终上下文长度: ${contextData.length} 字符`);
    
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const isRetry = attempt > 0;
        if (isRetry) {
            console.warn(`[ToolExecutionMiddleware] 🚑 修复尝试 ${attempt}/${maxRetries} 失败，正在重试...`);
        }

        // 🔥 关键修复2：增强提示词，明确数据来源
        const prompt = `
# 🚑 紧急代码修复任务
**错误类型**: ${errorType}
${isRetry ? "**注意**: 上一次修复尝试失败，请务必彻底检查数据填充！" : ""}

# 📋 原始任务背景与数据
${contextData}

# ❌ 损坏的代码
\`\`\`python
${brokenCode}
\`\`\`

# 🎯 修复要求（必须严格遵守）
1. **数据填充（最高优先级）**：
   - 仔细阅读上面的【原始任务背景与数据】部分
   - 找到所有可用的具体数据（年份、数值、名称、列表等）
   - 将这些数据**完整、准确地硬编码**到代码变量中 (例如 \`years = [2020, 2021...]\`)。
   - **绝对禁止**生成空赋值（如 \`x =\`）或占位符（如 \`...\`）

2. **语法修复**：
   - 确保所有括号、引号、方括号成对闭合
   - 确保所有导入语句完整
   - 修复缩进错误（使用4个空格）

3. **输出要求**：
   - 代码最后必须有 \`print(json.dumps(...))\` 输出
   - 输出完整的JSON数据结构
   - 只输出修复后的Python代码，不要Markdown标记，不要解释。

4. **特别注意**：
   - 如果上面提供了表格或列表数据，确保在代码中完整包含
   - 不要遗漏任何数据点
   - 检查变量名是否拼写正确
   ${isRetry ? "\n# ⚠️ 上次修复失败：请重点检查数据是否完整填充！" : ""}
`;

        try {
            console.log(`[ToolExecutionMiddleware] 🤖 调用修复模型: deepseek-chat`);
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'deepseek-chat',
                temperature: 0.1,
                max_tokens: 15000  // 🔥 确保足够长度
            });

            // 🎯 Token追踪
            if (response?.usage) {
                this.updateTokenUsageMethod(response.usage);
            }

            let fixedCode = response.choices[0].message.content;
            
            // 清理 Markdown
            fixedCode = fixedCode.replace(/```python/g, '').replace(/```/g, '').trim();
            
            // 🔥 关键修复3：增强验证
            const isValid = this._validateRepairedCode(fixedCode);
            if (!isValid) {
                console.warn('[ToolExecutionMiddleware] 🚑 修复后的代码验证失败。');
                continue;
            }

            console.log(`[ToolExecutionMiddleware] ✅ 急诊修复成功 (尝试 ${attempt + 1})，代码长度: ${fixedCode.length} 字符`);
            return fixedCode;

        } catch (error) {
            console.error(`[ToolExecutionMiddleware] 🚑 修复尝试 ${attempt + 1} 发生异常:`, error);
            
        }
    }

    console.error('[ToolExecutionMiddleware] 🚑 急诊室宣告抢救无效 (达到最大重试次数)。');
    
    // 🔥 最后手段：生成最小化代码
    return this._generateMinimalFallbackCode(brokenCode, errorType, contextData);
}

/**
 * 🆕 从数据总线提取最佳数据（用于急诊室备用）
 */
_extractBestDataFromDataBus() {
    if (!this.dataBus || this.dataBus.size === 0) {
        return null;
    }
    
    // 尝试所有可能的键，从最近的开始
    const possibleKeys = [
        ...Array.from(this.dataBus.keys()).filter(k => k.startsWith('step_')),
        ...Array.from(this.dataBus.keys()).filter(k => !k.startsWith('step_'))
    ].sort((a, b) => {
        // 按时间倒序（假设step_数字越大越新）
        if (a.startsWith('step_') && b.startsWith('step_')) {
            return parseInt(b.replace('step_', '')) - parseInt(a.replace('step_', ''));
        }
        return 0;
    });
    
    for (const key of possibleKeys) {
        const data = this.dataBus.get(key);
        if (!data) continue;
        
        const rawData = data.rawData || data.originalData;
        if (rawData && rawData.length > 500) {
            console.log(`[ToolExecutionMiddleware] 🔍 从DataBus找到数据: ${key}, 长度: ${rawData.length}`);
            return this._formatSimpleDataForEmergency(key, data.metadata, rawData);
        }
    }
    
    return null;
}

/**
 * 🆕 为急诊室简单格式化数据
 */
_formatSimpleDataForEmergency(key, metadata, rawData) {
    const maxLength = 6000;
    
    let formatted = `## 📊 急诊室数据 (来自: ${key})\n`;
    if (metadata.toolName) formatted += `**工具**: ${metadata.toolName}\n`;
    formatted += `**长度**: ${rawData.length} 字符\n\n`;
    
    if (rawData.length > maxLength) {
        formatted += rawData.substring(0, maxLength) + "\n[...数据过长，已截断...]";
    } else {
        formatted += rawData;
    }
    
    return formatted;
}

/**
 * 🆕 获取最佳修复上下文
 */
async _getBestRepairContext() {
    console.log('[ToolExecutionMiddleware] 🔍 获取修复上下文...');
    
    // 优先级1：当前研究上下文（如果有效）
    if (this.currentResearchContext && 
        this.currentResearchContext !== "无上下文数据" && 
        this.currentResearchContext.length > 100) {
        console.log('[ToolExecutionMiddleware] ✅ 使用当前研究上下文');
        return this.currentResearchContext;
    }
    
    // 优先级2：从DataBus提取最近的数据
    console.log('[ToolExecutionMiddleware] 🔍 从DataBus提取最新数据...');
    const latestData = this._extractLatestRelevantData();
    if (latestData) {
        console.log(`[ToolExecutionMiddleware] ✅ 从DataBus获取数据: ${latestData.length} 字符`);
        return latestData;
    }
    
    // 优先级3：从历史步骤提取信息
    const historicalContext = this._extractHistoricalContext();
    if (historicalContext) {
        console.log('[ToolExecutionMiddleware] ✅ 使用历史步骤上下文');
        return historicalContext;
    }
    
    // 最后手段：简单上下文
    console.warn('[ToolExecutionMiddleware] ⚠️ 无法获取有效上下文，使用最小上下文');
    return "无上下文数据。请参考损坏的代码本身进行修复。";
}

/**
 * 🆕 提取最新相关数据
 */
_extractLatestRelevantData() {
    if (!this.dataBus || this.dataBus.size === 0) {
        return null;
    }
    
    // 查找最近的代码生成任务相关数据
    const stepKeys = Array.from(this.dataBus.keys())
        .filter(key => key.startsWith('step_'))
        .sort((a, b) => parseInt(b.replace('step_', '')) - parseInt(a.replace('step_', '')));
    
    for (const key of stepKeys) {
        const data = this.dataBus.get(key);
        if (!data || !data.metadata) continue;
        
        const metadata = data.metadata;
        const rawData = data.rawData || data.originalData;
        
        // 寻找最近的相关数据
        if (rawData && rawData.length > 200) {
            // 🔥 新增：过滤错误数据（修改部分）
            const errorIndicators = ['错误:', 'Error:', '失败:', 'Failed:', '无法访问'];
            const isError = errorIndicators.some(indicator => 
                rawData.toLowerCase().includes(indicator.toLowerCase())
            );
            
            if (isError) {
                console.log(`[ToolExecutionMiddleware] ⚠️ 跳过 ${key}: 包含错误信息`);
                continue;
            }
            
            // 数据源优先级
            if (metadata.toolName === 'code_generator' || 
                metadata.contentType === 'structured_data') {
                // 最近的代码生成数据
                return this._formatDataForRepair(key, metadata, rawData);
            } else if (metadata.toolName === 'crawl4ai') {
                // 最近的爬虫数据
                return this._formatDataForRepair(key, metadata, rawData);
            } else if (metadata.toolName === 'alphavantage') {
                // 最近的金融数据
                console.log(`[ToolExecutionMiddleware] 💹 找到alphavantage数据，用于修复`);
                return this._formatDataForRepair(key, metadata, rawData);
            }
        }
    }
    
    return null;
}

/**
 * 🆕 格式化数据用于修复（简化版）
 */
_formatDataForRepair(stepKey, metadata, rawData) {
    console.log(`[ToolExecutionMiddleware] 🔧 格式化修复数据: ${rawData.length} 字符 (${metadata.toolName})`);
    
    const maxLength = 12000;
    
    let formatted = `## 🔧 代码修复所需数据\n\n`;
    formatted += `**来源**: 步骤 ${stepKey.replace('step_', '')} (${metadata.toolName})\n`;
    if (metadata.dataType) formatted += `**类型**: ${metadata.dataType}\n`;
    if (metadata.alphavantageMode) formatted += `**金融模式**: ${metadata.alphavantageMode}\n`;
    if (metadata.symbol) formatted += `**股票代码**: ${metadata.symbol}\n`;
    formatted += `**原始长度**: ${rawData.length} 字符\n\n`;
    
    // 🆕 智能处理超长数据
    if (rawData.length > maxLength) {
        console.log(`[ToolExecutionMiddleware] 📏 数据过长，使用智能策略: ${rawData.length} → ${maxLength}`);
        
        // 策略1：优先提取表格（最重要）
        const tables = this._extractAllTables(rawData);
        const tablesLength = tables ? tables.length : 0;
        
        if (tablesLength > 0 && tablesLength < maxLength * 0.7) {
            // 表格 + 补充信息
            formatted += `### 📊 核心表格数据（完整保留）\n\n${tables}\n`;
            
            const remaining = maxLength - tablesLength - 500;
            if (remaining > 1500) {
                const supplement = this._extractSupplement(rawData, tablesLength, remaining);
                formatted += `\n### 📝 补充信息\n${supplement}\n`;
            }
        } else {
            // 策略2：智能分段（当没有表格或表格太大时）
            formatted += `### 📋 智能提取数据\n\n`;
            
            // 保留最重要的部分：开头（40%）+ 中间关键（30%）+ 结尾（30%）
            const firstLength = Math.floor(maxLength * 0.4);
            const middleLength = Math.floor(maxLength * 0.3);
            const endLength = Math.floor(maxLength * 0.3);
            
            const firstPart = rawData.substring(0, firstLength);
            const endPart = rawData.substring(rawData.length - endLength);
            
            // 从中间找关键部分（包含数字和表格的区域）
            const middleStart = Math.floor(rawData.length / 2) - Math.floor(middleLength / 2);
            const middleEnd = middleStart + middleLength;
            const middlePart = rawData.substring(middleStart, Math.min(middleEnd, rawData.length - endLength));
            
            formatted += firstPart + "\n\n[...中间内容已省略...]\n\n" + middlePart + "\n\n[...继续省略...]\n\n" + endPart;
        }
        
        formatted += `\n---\n*注：原始数据 ${rawData.length} 字符，此处保留约 ${maxLength} 字符的关键内容*\n`;
    } else {
        // 数据长度合适，直接使用
        formatted += `### 📄 完整数据\n\n${rawData}\n`;
    }
    
    formatted += `\n**修复指令**：请使用以上数据修复代码，确保所有变量都有真实数据填充。`;
    
    return formatted;
}

/**
 * 🆕 提取所有表格（优化版）
 */
_extractAllTables(rawData) {
    let result = '';
    
    // 1. Markdown表格
    const mdTables = rawData.match(/^(\|.+\|(?:\r?\n|$)){3,}/gm);
    if (mdTables && mdTables.length > 0) {
        result += `#### Markdown表格 (${mdTables.length}个)\n\n`;
        mdTables.slice(0, 3).forEach((table, idx) => {
            result += `**表${idx+1}**:\n\`\`\`\n${table}\n\`\`\`\n\n`;
        });
    }
    
    // 2. 类表格结构（如：项目 数值 单位）
    const tableLike = rawData.match(/(?:^|\n)([^:\n]+:[^:\n]+(?:\n|$)){3,}/g);
    if (tableLike && tableLike.length > 0) {
        result += `#### 键值对结构\n\n`;
        tableLike.slice(0, 2).forEach((item, idx) => {
            result += `**结构${idx+1}**:\n\`\`\`\n${item.trim()}\n\`\`\`\n\n`;
        });
    }
    
    // 3. 数字密集段落
    const numericBlocks = rawData.match(/(?:^|\n)(.*\d+.*(?:\n|$)){4,}/g);
    if (numericBlocks && numericBlocks.length > 0) {
        result += `#### 数字密集段落\n\n`;
        numericBlocks.slice(0, 2).forEach((block, idx) => {
            const lines = block.trim().split('\n').slice(0, 6);
            result += `**数字块${idx+1}**:\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n\n`;
        });
    }
    
    return result || null;
}

/**
 * 🆕 提取补充信息
 */
_extractSupplement(rawData, tablesLength, maxLength) {
    console.log(`[ToolExecutionMiddleware] 🔍 提取补充信息: 剩余 ${maxLength} 字符`);
    
    // 排除已提取的表格区域，避免重复
    const nonTableContent = this._removeTableContent(rawData);
    if (!nonTableContent || nonTableContent.length < 100) {
        return "无额外补充信息。";
    }
    
    // 提取关键补充信息
    let supplement = "";
    const targetLength = Math.min(maxLength, 3000);
    
    // 策略：提取包含关键词的重要段落
    const importantKeywords = [
        '数据', '统计', '分析', '结果', '结论',
        '主要', '关键', '重要', '核心', '发现',
        '趋势', '变化', '增长', '下降'
    ];
    
    const lines = nonTableContent.split('\n');
    let collectedLines = [];
    
    for (const line of lines) {
        if (line.trim().length < 10) continue;
        
        // 评分行的重要性
        let score = 0;
        importantKeywords.forEach(keyword => {
            if (line.includes(keyword)) score += 1;
        });
        if (line.match(/\d/)) score += 1; // 包含数字
        if (line.includes(':')) score += 1; // 可能是说明
        
        if (score >= 2) {
            collectedLines.push(line);
            if (collectedLines.join('\n').length > targetLength) {
                break;
            }
        }
    }
    
    if (collectedLines.length > 0) {
        supplement = collectedLines.join('\n');
        if (supplement.length > targetLength) {
            supplement = supplement.substring(0, targetLength) + "\n[...]";
        }
    } else {
        // 如果没有找到重要段落，返回开头部分
        supplement = nonTableContent.substring(0, Math.min(targetLength, nonTableContent.length));
        if (nonTableContent.length > targetLength) {
            supplement += "\n[...]";
        }
    }
    
    return supplement;
}

/**
 * 🆕 移除表格内容（用于提取非表格部分）
 */
_removeTableContent(rawData) {
    // 简单的表格移除策略
    // 1. 移除Markdown表格
    let result = rawData.replace(/^(\|.+\|(?:\r?\n|$)){3,}/gm, '');
    
    // 2. 移除明显的表格行
    result = result.replace(/^\|.*\|$/gm, '');
    
    // 清理多余空行
    result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');
    
    return result.trim();
}

/**
 * 🆕 验证修复后的代码
 */
_validateRepairedCode(code) {
    if (!code || code.trim().length < 50) {
        console.warn('[ToolExecutionMiddleware] ❌ 代码过短');
        return false;
    }
    
    // 检查空赋值
    const emptyAssignment = /^\s*[a-zA-Z_]\w*\s*=\s*(?:\s*(?:#.*)?$)/m;
    if (emptyAssignment.test(code)) {
        console.warn('[ToolExecutionMiddleware] ❌ 仍有空赋值');
        return false;
    }
    
    // 🔥 修复：正确检查占位符（修改部分）
    // 检查不在字符串内的 ... 作为占位符
    const hasPlaceholder = (codeStr) => {
        let inString = false;
        let stringChar = null;
        let escaped = false;
        
        for (let i = 0; i < codeStr.length; i++) {
            const char = codeStr[i];
            
            // 处理转义字符
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            // 处理字符串边界
            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar) {
                inString = false;
                stringChar = null;
            }
            
            // 检查不在字符串内的 ...
            if (!inString && i + 2 < codeStr.length) {
                if (codeStr.substring(i, i + 3) === '...') {
                    // 检查前后字符，确保不是 .... 或 .. 的一部分
                    const prevChar = i > 0 ? codeStr[i - 1] : '';
                    const nextChar = i + 3 < codeStr.length ? codeStr[i + 3] : '';
                    if (prevChar !== '.' && nextChar !== '.') {
                        return true;
                    }
                }
            }
        }
        return false;
    };
    
    if (hasPlaceholder(code)) {
        console.warn('[ToolExecutionMiddleware] ❌ 仍有占位符 "..."');
        return false;
    }
    
    // 检查是否有输出
    if (!code.includes('print(') && !code.includes('print (')) {
        console.warn('[ToolExecutionMiddleware] ⚠️ 缺少输出语句');
    }
    
    return true;
}

/**
 * 🆕 生成最小化后备代码
 */
_generateMinimalFallbackCode(brokenCode, errorType, contextData) {
    console.log('[ToolExecutionMiddleware] 🛡️ 生成最小化后备代码...');
    
    return `import json

# 最小化分析 - 应急后备代码
result = {
    "type": "emergency_analysis",
    "status": "limited",
    "original_error": "${errorType.replace(/"/g, '\\"')}",
    "context_length": ${contextData.length},
    "message": "由于代码修复失败，提供最小化分析。",
    "note": "这是一个后备响应。请检查数据格式后重新尝试。"
}

print(json.dumps(result, ensure_ascii=False, indent=2))`;
}

/**
 * 🆕 从历史步骤提取上下文
 */
_extractHistoricalContext() {
    if (!this.intermediateSteps || this.intermediateSteps.length < 2) {
        return null;
    }
    
    // 提取最近几个步骤的摘要
    const recent = this.intermediateSteps.slice(-3);
    let summary = "最近执行步骤摘要:\n\n";
    
    recent.forEach((step, idx) => {
        const stepNum = this.intermediateSteps.length - recent.length + idx + 1;
        const tool = step.action?.tool_name || 'unknown';
        const obs = step.observation || '';
        
        summary += `${stepNum}. ${tool}: ${obs.substring(0, 150)}${obs.length > 150 ? '...' : ''}\n`;
    });
    
    return summary;
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
        for (let j = 0; j <= str1.length; j++) {
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

    /**
     * 🎯 检测是否为文件读取任务
     * @param {string} objective - 任务目标
     * @param {string} data_context - 数据上下文
     * @returns {boolean} 是否为文件读取任务
     */
    _isFileReadTask(objective, data_context) {
        const combined = (objective + ' ' + (data_context || '')).toLowerCase();
        const keywords = ['/data/', '读取文件', 'get_handle', '文件路径', '代码', 'json'];
        return keywords.some(kw => combined.includes(kw));
    }

}