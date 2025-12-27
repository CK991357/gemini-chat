// src/static/js/agent/deepresearch/middleware/ToolExecutionMiddleware.js
// 🛠️ 工具执行中间件 - 从 DeepResearchAgent 中分离的核心工具执行逻辑
// 🔥 完整修复版 - 包含所有原有内容，确保100%一致体验

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
        const specialistPrompt = `
# 角色：高级 Python 数据专家

# 任务目标
${objective}

# 数据上下文 (必须严格遵守)
${JSON.stringify(data_context)}

# 📚 你的核心技能与规范 (Knowledge Base)
${knowledgeContext ? knowledgeContext : "未加载知识库，请遵循通用 Python 规范。"}

# ⚡ 补充强制执行协议 (Override Rules)
1. **核心导入**: 必须在代码开头**强制导入**以下库：\`import json\`, \`import pandas as pd\`, \`import matplotlib.pyplot as plt\`, \`import numpy as np\`。
2. **数据硬编码**: 必须将【数据上下文】中的数据完整写入代码变量，**严禁空赋值**。
3. **中文支持 (关键)**:
   - 本环境**不包含** SimHei 或 Microsoft YaHei。
   - **必须**显式设置字体为文泉驿微米黑：
     \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']\`
   - 设置负号支持：\`plt.rcParams['axes.unicode_minus'] = False\`
4. **输出纯净**: 只输出 Python 代码，不要 Markdown 标记。
5. **必须调用 \`plt.show()\`**: 这是触发图像输出的唯一方式。
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
            
            // 🔥 增强清理：只提取代码块（如果有的话），或者清理常见标记
            const codeBlockMatch = generatedCode.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
            if (codeBlockMatch) {
                generatedCode = codeBlockMatch[1];
            } else {
                generatedCode = generatedCode.replace(/```/g, '').trim();
            }

            console.log(`[ToolExecutionMiddleware] 👨‍💻 专家代码生成完毕，长度: ${generatedCode.length} 字符`);
            
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
                        // 图像处理逻辑
                        console.log('[ToolExecutionMiddleware] 🖼️ 检测到图像输出，调用图像处理方法');
                        finalObservation = this._handleGeneratedImage(outputData);

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
                // 失败情况
                console.log('[ToolExecutionMiddleware] ❌ 专家代码执行出错');
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
    // 🛠️ 基础工具执行方法（与主文件完全一致）
    // ============================================================
    
    /**
     * 🎯 基础工具调用（不含专家系统逻辑）
     * 🔥 与主文件完全一致的实现
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
            }

            // --- 调用工具 ---
            console.log(`[ToolExecutionMiddleware] 🚀 开始调用工具 ${toolName}...`);
            const toolResult = await tool.invoke(parameters, {
                mode: 'deep_research',
                researchMode: detectedMode
            });
            
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
        return { rawObservation, toolSources, toolSuccess };
    }

    // ============================================================
    // 🎯 主入口：执行工具调用（对外暴露的主方法）
    // ============================================================
    
    /**
     * 🎯 执行工具调用（对外暴露的主方法）
     * 🔥 与主文件完全一致的接口
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
    // 🎯 知识感知的工具执行（与主文件完全一致）
    // ============================================================
    
    /**
     * 🎯 知识感知的工具执行
     * 🔥 与主文件完全一致的实现
     */
    async executeToolWithKnowledge(toolName, parameters, thought, intermediateSteps, detectedMode, recordToolCall) {
        console.log(`[ToolExecutionMiddleware] 🧠 执行知识感知的工具调用: ${toolName}`);
        
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
            const stepIndex = this.intermediateSteps.length + 1;
            this.storeRawDataMethod(stepIndex, result.rawObservation, {
                toolName: toolName,
                contentType: toolName === 'crawl4ai' ? 'webpage' : 'text'
            }, result.toolSources);
            console.log(`[ToolExecutionMiddleware] 💾 已存储数据到DataBus: step_${stepIndex}`);
        }
        
        // 🎯 返回更新后的 thought
        return { ...result, updatedThought: thought };
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
        for (let j = 0; j <= str1.length; j++) {
            matrix[j] = j;
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
                timestamp: Date.now(),
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
}