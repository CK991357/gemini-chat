// src/static/js/agent/deepresearch/AgentLogic.js - 知识检索集成版

// 🎯 核心修改：导入 ReportTemplates 中的工具函数
import { getTemplatePromptFragment } from './ReportTemplates.js';

export class AgentLogic {
    constructor(chatApiHandler) {
        if (!chatApiHandler) {
            throw new Error("AgentLogic requires a valid chatApiHandler instance.");
        }
        this.chatApiHandler = chatApiHandler;
    }

    // ✨ 智能规划器 - 支持多种研究模式
    async createInitialPlan(topic, researchMode = 'standard', currentDate) {
        const plannerPrompt = this._getPlannerPrompt(topic, researchMode, currentDate);

        try {
            const llmResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: plannerPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.1,
            });

            const responseText = llmResponse?.choices?.[0]?.message?.content || '{}';
            
            // 增强JSON解析容错
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
            const plan = JSON.parse(jsonMatch[1]);
            
            // 🔥 核心：验证模型是否进行了时效性评估
            if (!plan.temporal_awareness?.assessed) {
                console.warn('[AgentLogic] 模型未进行时效性评估，强制添加默认评估');
                plan.temporal_awareness = {
                    assessed: true,
                    overall_sensitivity: '中', // 默认中等
                    current_date: currentDate,
                    system_note: '模型未评估，系统默认添加'
                };
            }

            // 验证每个步骤都有敏感度标注
            plan.research_plan.forEach((step, index) => {
                if (!step.temporal_sensitivity) {
                    step.temporal_sensitivity = '中'; // 默认中等
                    console.warn(`[AgentLogic] 步骤${index + 1}未标注敏感度，使用默认值`);
                }
            });

            // 验证计划结构
            if (plan?.research_plan?.length > 0) {
                console.log(`[AgentLogic] 生成研究计划成功，整体敏感度: ${plan.temporal_awareness.overall_sensitivity}`);
                return {
                    ...plan,
                    usage: llmResponse.usage // 🎯 新增：返回 token usage
                };
            }
            throw new Error('计划结构无效');
            
        } catch (error) {
            console.error('[AgentLogic] 规划失败，使用降级方案:', error);
            return this._createFallbackPlan(topic, researchMode, currentDate);
        }
    }

    // ✨ 获取规划器提示词 - 增强时效性评估版本
    _getPlannerPrompt(topic, researchMode, currentDate) {
        const currentYear = new Date().getFullYear();
        const currentDateReadable = new Date().toLocaleDateString('zh-CN', { 
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
        });
        
        const modeConfigs = {
            deep: {
                role: "顶级深度研究策略师",
                instructions: `1. 将研究主题分解为5-7个逻辑连贯的深度研究步骤
2. 每个步骤必须解决一个明确的深度分析子问题
3. 为每个步骤提供2-3个精准的搜索关键词
4. 预估每个步骤所需的信息深度（必须包含深度挖掘）
5. 确保覆盖：问题解构、多维度分析、权威验证、辩证解决方案、创新建议`,
                iterations: 6,
                risk: "中|高"
            },
            academic: {
                role: "学术研究策略师", 
                instructions: `1. 将研究主题分解为4-6个符合学术规范的步骤
2. 每个步骤必须解决一个学术研究子问题
3. 为每个步骤提供2-3个学术搜索关键词
4. 强调文献综述、方法论、理论框架和学术引用`,
                iterations: 5,
                risk: "中"
            },
            business: {
                role: "商业分析策略师",
                instructions: `1. 将研究主题分解为3-5个商业分析步骤
2. 每个步骤聚焦市场、竞争、战略或财务分析
3. 为每个步骤提供2-3个商业关键词
4. 强调可行性、ROI、市场数据和商业洞察`,
                iterations: 4, 
                risk: "中"
            },
            technical: {
                role: "技术研究策略师",
                instructions: `1. 将研究主题分解为4-6个技术分析步骤
2. 每个步骤聚焦架构、实现、性能或最佳实践
3. 为每个步骤提供2-3个技术关键词
4. 强调技术细节、实现方案和性能指标`,
                iterations: 5,
                risk: "中"
            },
            standard: {
                role: "AI研究策略师",
                instructions: `1. 将研究主题分解为3-5个逻辑连贯的研究步骤
2. 每个步骤必须解决一个明确的子问题
3. 为每个步骤提供1-2个精准的搜索关键词
4. 预估每个步骤所需的信息深度（浅层概览/中层分析/深度挖掘）`,
                iterations: 4,
                risk: "低|中|高"
            }
        };

        const config = modeConfigs[researchMode] || modeConfigs.standard;

        return `
# 角色：${config.role}
# 任务：为"${topic}"制定研究计划

# 🕒 时效性自主评估
**知识状态**：你的训练数据截止于2024年初，当前系统日期为${currentDateReadable}

## 评估指南
请自主判断该主题的时效性需求：
- **高敏感度**：AI模型、软件版本、市场趋势、政策法规 → 必须验证最新信息
- **低敏感度**：历史研究、经典理论、基础概念 → 专注准确性
- **中等敏感度**：其他情况 → 选择性验证

## 输出要求
- 每个步骤必须标注\`temporal_sensitivity\` ("高", "中", "低")
- 整体计划必须包含\`temporal_awareness\`评估

# 输出格式（严格JSON）
{
  "research_plan": [
    {
      "step": 1,
      "sub_question": "关键问题",
      "initial_queries": ["关键词"],
      "depth_required": "浅层概览|中层分析|深度挖掘", 
      "expected_tools": ["tavily_search", "crawl4ai"],
      "temporal_sensitivity": "高|中|低"
    }
  ],
  "estimated_iterations": ${config.iterations},
  "risk_assessment": "${config.risk}",
  "research_mode": "${researchMode}",
  "temporal_awareness": {
    "assessed": true,
    "overall_sensitivity": "高|中|低",
    "current_date": "${currentDate}"
  }
}

现在开始评估并生成计划：`;
    }

    // ✨ 降级方案 - 支持所有模式
    _createFallbackPlan(topic, researchMode = 'standard', currentDate) {
        const fallbackPlans = {
            deep: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: `深度解构"${topic}"的核心问题与假设`,
                        initial_queries: [`${topic} 核心问题`, `${topic} 关键假设`, `${topic} 问题边界`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 2,
                        sub_question: "多维度深度探索与技术可行性分析",
                        initial_queries: [`${topic} 技术维度`, `${topic} 实践案例`, `${topic} 历史演变`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 3, 
                        sub_question: "权威理论与前沿研究成果验证",
                        initial_queries: [`${topic} 权威研究`, `${topic} 学术论文`, `${topic} 最新数据`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 4,
                        sub_question: "辩证解决方案设计与评估", 
                        initial_queries: [`${topic} 解决方案`, `${topic} 替代方案`, `${topic} 风险评估`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 5,
                        sub_question: "创新建议与执行路径规划",
                        initial_queries: [`${topic} 创新建议`, `${topic} 实施路径`, `${topic} 挑战应对`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai"]
                    }
                ],
                estimated_iterations: 6,
                risk_assessment: "中",
                research_mode: "deep"
            },
            academic: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: `界定"${topic}"的研究范围和理论框架`,
                        initial_queries: [`${topic} 研究综述`, `${topic} 理论框架`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 2,
                        sub_question: "收集相关学术文献和研究成果",
                        initial_queries: [`${topic} 学术论文`, `${topic} 研究现状`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 3,
                        sub_question: "分析研究方法和数据支持",
                        initial_queries: [`${topic} 研究方法`, `${topic} 实证数据`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai"]
                    },
                    {
                        step: 4,
                        sub_question: "总结学术贡献和研究局限",
                        initial_queries: [`${topic} 学术价值`, `${topic} 研究局限`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"]
                    }
                ],
                estimated_iterations: 5,
                risk_assessment: "中", 
                research_mode: "academic"
            },
            business: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: `分析"${topic}"的市场规模和增长趋势`,
                        initial_queries: [`${topic} 市场规模`, `${topic} 增长趋势`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"]
                    },
                    {
                        step: 2, 
                        sub_question: "评估竞争格局和主要参与者",
                        initial_queries: [`${topic} 竞争分析`, `${topic} 主要企业`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 3,
                        sub_question: "识别商业机会和潜在风险",
                        initial_queries: [`${topic} 商业机会`, `${topic} 风险分析`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 4,
                        sub_question: "提出战略建议和实施方案",
                        initial_queries: [`${topic} 战略建议`, `${topic} 实施计划`],
                        depth_required: "中层分析", 
                        expected_tools: ["tavily_search"]
                    }
                ],
                estimated_iterations: 4,
                risk_assessment: "中",
                research_mode: "business"
            },
            technical: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: `理解"${topic}"的技术架构和核心组件`,
                        initial_queries: [`${topic} 技术架构`, `${topic} 核心组件`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 2,
                        sub_question: "分析技术实现方案和工具链",
                        initial_queries: [`${topic} 实现方案`, `${topic} 技术工具`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 3,
                        sub_question: "评估性能指标和优化策略",
                        initial_queries: [`${topic} 性能指标`, `${topic} 优化方法`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai"]
                    },
                    {
                        step: 4,
                        sub_question: "总结最佳实践和部署方案",
                        initial_queries: [`${topic} 最佳实践`, `${topic} 部署方案`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"]
                    }
                ],
                estimated_iterations: 5,
                risk_assessment: "中",
                research_mode: "technical"
            },
            standard: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: `了解"${topic}"的基本背景和定义`,
                        initial_queries: [`${topic} 是什么`, `${topic} 基本信息`],
                        depth_required: "浅层概览",
                        expected_tools: ["tavily_search"]
                    },
                    {
                        step: 2,
                        sub_question: "深入挖掘具体细节和关键信息",
                        initial_queries: [`${topic} 详细分析`, `${topic} 深度解读`],
                        depth_required: "中层分析", 
                        expected_tools: ["tavily_search", "crawl4ai"]
                    },
                    {
                        step: 3,
                        sub_question: "收集权威来源和验证信息准确性",
                        initial_queries: [`${topic} 权威来源`, `${topic} 官方信息`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai"]
                    }
                ],
                estimated_iterations: 4,
                risk_assessment: "低",
                research_mode: "standard"
            }
        };

        const basePlan = fallbackPlans[researchMode] || fallbackPlans.standard;
        
        // 为降级方案添加时效性评估
        basePlan.temporal_awareness = {
            assessed: true,
            overall_sensitivity: '中', // 降级方案默认中等
            current_date: currentDate,
            is_fallback: true
        };
        
        basePlan.research_plan.forEach(step => {
            step.temporal_sensitivity = step.temporal_sensitivity || '中';
        });
        
        return basePlan;
    }

    async plan(inputs, runManager) {
        const { topic, intermediateSteps, availableTools, researchPlan, researchMode = 'standard' } = inputs;
        
        // 🎯 关键词检测逻辑
        const detectedMode = this._detectResearchMode(topic);
        
        // 动态计算当前步骤
        const currentStep = this._determineCurrentStep(researchPlan, intermediateSteps);
        
        const prompt = this._constructFinalPrompt({
            topic,
            intermediateSteps, 
            availableTools,
            researchPlan,
            currentStep,
            researchMode: detectedMode,
            currentDate: new Date().toISOString() // 添加当前日期
        });
        
        console.log(`[AgentLogic] 检测到模式: ${detectedMode}, 提示词长度:`, prompt.length);
        
        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { 
            run_id: runManager.runId,
            data: { 
                prompt_length: prompt.length,
                current_step: currentStep,
                total_steps: researchPlan?.research_plan?.length || '未知',
                research_mode: detectedMode
            }
        });
        
        try {
            const llmResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.0,
            });

            const choice = llmResponse && llmResponse.choices && llmResponse.choices[0];
            const responseText = choice && choice.message && choice.message.content ? 
                choice.message.content : '';

            if (!responseText) {
                throw new Error("LLM返回了空的或无效的响应。");
            }

            await runManager?.callbackManager.invokeEvent('on_agent_think_end', { 
                run_id: runManager.runId, 
                data: { 
                    response_length: responseText.length,
                    response_preview: responseText.substring(0, 200),
                    current_step: currentStep,
                    research_mode: detectedMode
                } 
            });
            
            return {
                responseText: responseText,
                usage: llmResponse.usage // 🎯 新增：返回 token usage
            };

        } catch (error) {
            // 🎯 修复：确保 error 对象存在
            const errorMessage = error?.message || '未知错误';
            console.error("[AgentLogic] LLM 思考失败:", errorMessage);
            
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', {
                run_id: runManager.runId,
                data: { error: errorMessage }
            });
            
            // ✨ 修改：返回兼容的结构，即使在出错时
            return {
                responseText: `思考: 发生内部错误，无法继续规划。错误信息: ${errorMessage}\n最终答案: 研究因内部错误终止。`,
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } // 提供一个空的usage对象
            };
        }
    }

    // 🎯 关键词检测逻辑
    _detectResearchMode(topic) {
        const keywords = {
            '深度研究': 'deep',
            '学术论文': 'academic', 
            '商业分析': 'business',
            '技术文档': 'technical',
            '标准报告': 'standard'
        };

        // 清理topic，移除关键词
        let cleanTopic = topic;
        let detectedMode = 'standard'; // 默认模式

        for (const [keyword, mode] of Object.entries(keywords)) {
            if (topic.includes(keyword)) {
                detectedMode = mode;
                cleanTopic = topic.replace(keyword, '').trim();
                break;
            }
        }

        return detectedMode;
    }

    // ✨ 重构：主提示词构建 - 核心知识检索集成
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1, researchMode = 'standard', currentDate }) {
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // --- START FIX: 注入上一步的观察结果作为上下文 ---
        let lastObservation = '';
        if (intermediateSteps.length > 0) {
            const lastStep = intermediateSteps[intermediateSteps.length - 1];
            // 确保观察结果是字符串且足够长，避免注入无用信息
            if (typeof lastStep.observation === 'string' && lastStep.observation.length > 50) {
                 lastObservation = `
📋 Context from Previous Step (Observation)
You have just received the following information from the last tool call. You MUST use this data for your next action if relevant.
\`\`\`
${lastStep.observation.substring(0, 4000)} ${lastStep.observation.length > 4000 ? '... (content truncated)' : ''}
\`\`\`
`;
            }
        }
        // --- END FIX ---
        
        // 🎯 增强：动态知识检索触发器
        const knowledgeRetrievalTriggers = this._buildKnowledgeRetrievalTriggers(intermediateSteps, researchPlan, currentStep);
        
        // 🎯 核心新增：知识检索策略指导
        const knowledgeStrategySection = `
## 🧠 知识驱动决策框架 - 强制执行版

### 🔥 强制检索条件（遇到以下情况必须检索知识）：
${knowledgeRetrievalTriggers.conditions.map(condition => `- ${condition}`).join('\n')}

### 📚 当前上下文建议检索的知识：
${knowledgeRetrievalTriggers.suggestedTools.map(tool => `- **${tool.name}**: ${tool.reason}`).join('\n')}

### 🚨 违反规则的后果：
- 如果未检索知识直接编写复杂代码，执行成功率将低于30%
- 系统将无法提供最佳实践和错误预防指导
- 可能导致任务失败和迭代浪费

${knowledgeRetrievalTriggers.conditions.length > 0 ? `
## ⚡ 立即行动要求
基于当前任务，你**必须**首先调用 \`retrieve_knowledge\` 来获取以下工具的完整指南：
${knowledgeRetrievalTriggers.suggestedTools.map(tool => `- \`${tool.name}\` - ${tool.reason}`).join('\n')}
` : ''}

### 🛠️ 复杂工具专用指南（备查）

#### python_sandbox 知识地图
- **数据分析**: 参考 "数据清洗与分析" + "pandas_cheatsheet"
- **可视化**: 参考 "数据可视化" + "matplotlib_cookbook"
- **数学证明**: 参考 "公式证明工作流" + "sympy_cookbook"
- **报告生成**: 参考 "自动化报告生成" + "report_generator_workflow"
- **机器学习**: 参考 "机器学习" + "ml_workflow"

#### crawl4ai 知识地图
- **网页抓取**: 参考 "网页抓取最佳实践"
- **内容提取**: 参考 "智能内容提取"
- **错误处理**: 参考 "爬虫错误诊断"

记住：**知识是你最强大的工具**。在行动前先确保你拥有完整的指导！
`;
        
        // 🎯 核心修复：添加Python代码调试专业指南
        const pythonDebuggingGuide = `
## 🐍 Python代码调试专业指南

### 当代码执行失败时，你必须遵循以下专业调试流程：

**📋 诊断阶段**：
1.  **仔细阅读错误报告**：错误报告已经过专业解析，包含错误类型、位置和具体描述
2.  **理解错误性质**：区分语法错误（IndentationError, SyntaxError）和运行时错误（NameError, TypeError）
3.  **定位问题代码**：根据报告中的行号定位到具体的问题代码行

**🔧 修复阶段**：
4.  **最小化修改**：只修改导致错误的具体代码行，保持其他代码不变
5.  **针对性修复**：
    - **缩进错误** → 修正缩进，确保代码块正确对齐
    - **语法错误** → 检查括号、引号、冒号等语法元素
    - **名称错误** → 检查变量/函数名拼写和定义
    - **类型错误** → 检查数据类型和操作兼容性

**💡 思考要求**：
在"思考:"部分必须明确包含：
- "我识别到错误类型：[错误类型]，位于[位置]"
- "错误原因是：[具体原因分析]"
- "我将通过[具体修复方法]来修正这个问题"
- "修改后的代码将：[预期效果]"

**🚫 绝对禁止**：
- 在没有理解错误原因的情况下重试相同代码
- 进行与错误无关的大范围代码修改
- 忽略错误报告中的具体建议

**✅ 成功标准**：
- 代码能够无错误执行
- 输出符合任务要求的结果
- 保持了代码的可读性和逻辑清晰性
`;
        
        const pythonStateInjectionGuide = `
## 🐍 Python Sandbox 数据注入规则 (强制遵循)

**当你的任务是处理上一步的数据时（例如处理 crawl4ai 的抓取结果），你必须遵循以下规则：**

1.  **定义占位符变量**: 在你的 Python 代码中，定义一个名为 \`input_data\` 的变量。
2.  **分配占位符字符串**: 将一个特殊的、不可更改的字符串 \`"{{LAST_OBSERVATION}}"\` 赋给这个变量。
3.  **编写处理逻辑**: 像往常一样编写你的数据处理代码，直接使用 \`input_data\` 变量，就好像它已经包含了上一步的完整数据一样。

**系统会自动在后台将上一步的观察结果安全地注入到你的代码中。**

**✅ 正确示例**:
思考: 我需要处理上一步 crawl4ai 获取的网页内容，提取其中的表格。
行动: python_sandbox
行动输入: {
  "code": "import re\\n\\n# 系统将会把上一步的观察结果注入到这里\\ninput_data = \\"{{LAST_OBSERVATION}}\\"\\n\\n# 现在，我可以直接使用 input_data 变量进行处理\\nprint(f\\"接收到的数据长度: {len(input_data)}\\")"
}

**🚫 绝对禁止**:
- 在代码中硬编码或粘贴上一步的观察结果。
- 假设数据会自动出现在某个未定义的变量中（如 \`web_content\`)。
`;

        const errorCorrectionProtocol = `
## 🔴 强制错误诊断与修正协议

**当工具执行失败时，你必须严格遵循以下流程：**

### 第一步：深度诊断错误
- **仔细阅读错误报告**：错误信息已经过专业解析，包含具体错误类型、位置和描述
- **在思考中明确写出**："我识别到错误类型：[具体错误]，位于[具体位置]"
- **分析错误原因**："错误原因是：[具体分析]，我将通过[具体方法]修复"

### 第二步：针对性修正
- **最小化修改**：只修改导致错误的具体代码行
- **基于错误类型修复**：
  - \`SyntaxError\` → 检查引号、括号、冒号等语法元素
  - \`IndentationError\` → 修正缩进，确保代码块正确对齐
  - \`NameError\` → 检查变量/函数名拼写和定义
- **绝对禁止**：在没有理解错误的情况下重试相同代码

### 第三步：验证性重试
- 在思考中说明："修改后的代码将：[预期效果]"
- 提交完整的、修正后的代码进行验证
`;
        
        // 🎯 新增：报告大纲生成策略指导
        const outlineGenerationGuide = `
## 5. 报告大纲生成策略

### 何时生成大纲：
- 当收集到3-5个高质量的关键发现时
- 当信息收集达到计划完成度的70%以上时
- 当连续2次迭代信息增益低于阈值时

### 如何生成大纲：
思考: [分析当前信息完整性，判断是否适合生成大纲]
行动: generate_outline
行动输入: {"key_findings": ["发现1", "发现2", "发现3"]}

### 大纲生成后的工作：
- 基于生成的大纲继续完善信息收集
- 或直接进入最终报告撰写阶段
`;
        
        // 动态计划显示
        const planText = researchPlan ? this._formatResearchPlan(researchPlan, currentStep) : '';
        
        // 🎯 核心修复：聚焦当前任务 - 防止Agent跳过步骤产生幻觉
        const currentStepPlan = researchPlan.research_plan.find(step => step.step === currentStep);
        const currentTaskSection = `
# 🎯 当前任务 (你的唯一焦点)
**你现在正在执行研究计划的第 ${currentStep} 步。**
**你当前唯一的目标是解决以下子问题：** "${currentStepPlan?.sub_question}"

**🛑 重要指令 🛑**
- 你所有的思考都必须围绕如何完成上述任务，并生成**唯一一个**工具调用。
- **绝对禁止**执行计划中的未来步骤。
- **绝对禁止**生成最终报告或任何形式的摘要。你的响应**必须**是一个工具调用。
`;
        
        const stepSensitivity = currentStepPlan?.temporal_sensitivity || '中';
        const modelOverallSensitivity = researchPlan.temporal_awareness?.overall_sensitivity || '中';
        
        // 构建基于模型评估的动态指导
        const temporalGuidance = this._buildDynamicTemporalGuidance(
            currentDate, 
            stepSensitivity,
            modelOverallSensitivity // 传递整体敏感度用于上下文
        );
        
        // 🎯 DRY优化：只保留Agent思考相关的配置，报告要求从ReportTemplates动态获取
        const agentPersonaConfigs = {
            deep: {
                role: "深度研究专家",
                description: "你是一个专业的研究专家和问题解决顾问。你的任务是为复杂的用户查询提供深度、全面且专业的分析报告。",
                specialInstructions: `
### 🎯 深度研究特别指导：
- **多源验证**：每个关键论点至少需要2个独立来源验证
- **权威优先**：优先搜索学术论文、行业报告、官方数据
- **辩证思考**：主动寻找反对观点和局限性分析
- **深度挖掘**：不要停留在表面信息，深入探索底层机制`
            },
            shopping_guide: {
                role: "奢侈品导购专家",
                description: "你是一个专业的奢侈品导购顾问，擅长高端商品的深度对比分析和购买建议。",
                specialInstructions: `
### 🛍️ 奢侈品导购特别指导：
- **品牌深度**：深入了解品牌历史、定位和核心价值
- **成分解析**：分析化妆品/护肤品的核心成分和功效
- **工艺评估**：评估包包等商品的制作工艺和材质
- **用户体验**：基于真实用户反馈和使用体验
- **价值分析**：考虑性价比、保值率和投资价值`
            },
            academic: {
                role: "学术论文分析专家",
                description: "你是一个严谨的学术论文分析专家，擅长深度解析论文核心价值并进行验证扩展。",
                specialInstructions: `
### 🎓 学术研究特别指导：
- **文献严谨**：优先引用权威学术来源和期刊论文
- **方法论**：关注研究设计、数据收集和分析方法
- **理论框架**：注重理论支撑和概念清晰度
- **引用规范**：严格按照学术引用格式`
            },
            business: {
                role: "行业分析专家",
                description: "你是一个资深的行业分析师，擅长全景扫描行业现状、分析竞争格局和预测发展趋势。",
                specialInstructions: `
### 💼 商业分析特别指导：
- **市场导向**：关注市场规模、增长趋势和用户需求
- **竞争意识**：分析竞争对手和差异化优势
- **可行性**：评估技术可行性和商业可行性
- **ROI思维**：关注投资回报和商业价值`
            },
            technical: {
                role: "技术实现专家",
                description: "你是一个资深的技术架构师，擅长提供完整的技术实现方案和最佳实践指南。",
                specialInstructions: `
### 🛠️ 技术研究特别指导：
- **技术深度**：深入技术细节和实现机制
- **架构思维**：关注系统架构和组件设计
- **性能意识**：评估性能指标和优化空间
- **实践导向**：提供可落地的技术方案`
            },
            cutting_edge: {
                role: "前沿技术分析专家",
                description: "你是一个前瞻性的技术趋势分析师，擅长深度分析新兴技术的发展和未来趋势。",
                specialInstructions: `
### 🚀 前沿技术特别指导：
- **趋势洞察**：识别新兴技术的核心驱动力和发展阶段
- **技术解构**：深入分析技术原理、关键挑战和突破点
- **应用前景**：评估潜在的应用场景和商业价值
- **生态系统**：分析相关技术栈和社区活跃度
- **风险评估**：预测技术成熟度和潜在的伦理/安全风险`
            },
            standard: {
                role: "策略型AI研究专家",
                description: "你是一个高效、精准的研究专家，擅长使用多种工具组合来获取深度信息。",
                specialInstructions: ''
            }
        };

        const config = agentPersonaConfigs[researchMode] || agentPersonaConfigs.standard;
        
        // 🎯 核心DRY优化：动态获取报告要求，避免硬编码重复
        const reportRequirements = getTemplatePromptFragment(researchMode);

        // 🎯 核心新增：知识检索输出格式
        const knowledgeRetrievalOutputFormat = `
## 如果需要查阅工具文档：
思考: [明确说明：1) 要解决什么任务 2) 需要使用哪个工具 3) 为什么需要查阅文档 4) 期望获取什么具体指导]
示例: "用户要求进行数据分析和生成图表。我需要使用python_sandbox，但不确定数据处理和可视化的最佳实践。我应该查阅完整文档来获取'数据可视化工作流'的具体实现方法。"
行动: retrieve_knowledge
行动输入: {"tool_name": "python_sandbox", "context": "数据分析和可视化任务"}

## 如果已获得知识指导：
思考: [基于获取的完整指南，详细说明你的执行计划，并引用具体的工作流步骤]
示例: "根据python_sandbox文档中的'数据可视化工作流'，我需要：1) 导入pandas和matplotlib 2) 数据清洗处理 3) 使用subplot创建多图表 4) 添加标签和标题"
行动: python_sandbox
行动输入: {"code": "具体实现代码..."}
`;

        // 🎯 核心修复：最终指令强化纪律
        const finalInstruction = `
# ⚡ 最终指令
请严格依据**当前任务**，决策出下一步的**唯一行动**。你的响应格式**必须**严格遵循"思考、行动、行动输入"的格式。除非所有计划步骤均已完成，否则不要生成最终报告。
`;

        const prompt = `
# 角色：${config.role}
${config.description}

${temporalGuidance}

${currentTaskSection}  // 🎯 核心修复：聚焦当前任务，防止跳过步骤

${planText}

# 研究目标
**最终主题**：${topic}
${lastObservation}

# 可用工具
${availableToolsText}

# 研究历史与观察
${formattedHistory}

${outlineGenerationGuide}  // 🎯 新增：大纲生成指导

${knowledgeStrategySection}  // 🎯 核心新增：知识检索策略

## 🔍 多源信息整合策略

**信息验证与整合要求**：
1. **交叉验证**：对于关键信息，比较多个来源的一致性
2. **优先级排序**：官方文档 > 学术论文 > 权威媒体 > 其他来源
3. **冲突处理**：当来源信息冲突时，在报告中说明并倾向于权威来源
4. **信息补充**：使用不同来源补充信息的完整维度

**整合示例思考**：
"来源1提供了GLM-4.5的架构细节，来源2补充了性能基准数据，我将结合这两个来源构建完整的模型描述[来源1][来源2]"

# 🎯 核心决策框架（严格执行）

## 1. 状态评估 & 信息满足度 (**必须回答**)
- **当前子问题**: [明确复述当前研究计划的步骤目标]
- **信息满足度评估**: 基于"研究历史与观察"，我已经获得的信息是否**完全且清晰地**回答了上述子问题？
- **信息缺口分析**:
  - 如果**是**，请明确指出"信息已满足"，并直接规划**下一个**研究步骤。
  - 如果**否**，请明确列出还缺少**哪些具体**的信息点（例如："我还不清楚Wilson的六个观点具体是哪六个"）。

## 2. 工具选择策略
[基于上述信息缺口分析，选择最合适的工具和参数来填补缺口...]

## 2. 工具选择策略

### 🔍 tavily_search 使用时机：
- 探索新概念、寻找多个信息源
- 快速获取概况和背景信息  
- 关键词优化：使用更具体、更精准的搜索词

### 🕷️ crawl4ai 使用时机：
- 当搜索结果中出现权威来源时（百科、官方页面、深度文章）
- 需要获取完整内容而非摘要时
- **重要提示**: \`crawl4ai\` 的返回结果（观察）通常是一个经过优化的**智能摘要**，它可能已经包含了你需要的所有结构化信息（如表格）。在进入下一个步骤，如编写下一步的\`python_sandbox\`代码时，**你应该优先尝试从这个摘要中提取数据**，因为它比解析原始HTML更简单、更可靠。只有当摘要信息确实不足时，才需要考虑处理更原始的数据。
- 信息片段不足以回答深度问题时
- **必须参数**：{url: "具体的URL链接"}

${pythonDebuggingGuide}
${pythonStateInjectionGuide}
${errorCorrectionProtocol}
${config.specialInstructions}

## 3. 动态调整权限
如果你发现：
- 新的重要研究方向未在计划中
- 当前计划步骤可以合并或优化
- 找到了更高效的信息获取路径

请在"思考:"部分明确提出调整建议。

## 4. 终止条件
当满足以下条件时立即终止研究：
- 所有计划步骤已完成
- 关键问题都已得到充分回答
- 连续2次迭代没有获得新信息

${reportRequirements}

# 输出格式 (知识驱动版本，严格遵守)

${knowledgeRetrievalOutputFormat}

## 如果需要继续研究：
思考: [基于研究计划的详细推理，包括当前步骤评估、信息缺口分析、工具选择理由]
行动: tool_name_here
行动输入: {"parameter_name": "parameter_value"}

## 如果信息收集完成，准备撰写报告：
思考: [判断信息已足够，并从历史记录的"关键发现"中提炼出核心要点，用于构建大纲]
行动: generate_outline
行动输入: {"topic": "报告主题", "key_findings": ["从关键发现中总结的要点1", "要点2", "要点3"]}

## 如果已收到并审核过大纲：
思考: [基于收到的高质量大纲，现在开始填充细节，撰写最终报告]
最终答案:
# 报告标题
## 章节一
内容...
## 章节二
内容...

## 🚫 严格禁止：
1. 不要在"思考"部分包含JSON代码块或工具调用格式
2. 不要在"行动输入"的JSON之外添加任何额外文本
3. 最终答案必须是完整的Markdown报告，不要包含"思考"或"行动"部分
## ✅ 正确示例：
思考: 我已经收集了足够的信息...
最终答案:
# 我的研究报告
## 介绍
内容...

${finalInstruction}  // 🎯 核心修复：最终指令强化纪律

现在开始决策：`;

        return prompt;
    }

    // ✨ 构建动态时效性指导 - 基于模型自主评估
    _buildDynamicTemporalGuidance(currentDate, stepSensitivity, modelOverallSensitivity) {
        const currentDateReadable = new Date().toLocaleDateString('zh-CN', { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });
        
        const baseAwareness = `
## 🎯 自主时效性管理

**事实基准**:
- 你的知识截止: 2024年初
- 当前系统日期: ${currentDateReadable}
- 信息差距: 2024年初之后的发展需通过工具验证

**核心原则**: 你负责基于专业判断自主管理信息时效性。`;

        const guidanceTemplates = {
            '高': {
                title: '🔥 高时效性敏感步骤',
                content: `**当前步骤敏感度**: 高 | **整体主题敏感度**: ${modelOverallSensitivity}
                
**专业建议**:
1. 必须验证产品版本和发布时间
2. 搜索时强烈建议使用时序性关键词
3. 直接访问官方网站获取准确信息
4. 关注${new Date().getFullYear()}年最新动态

**推荐策略**:
- "产品名 最新版本 ${new Date().getFullYear()}"
- "技术名 当前状态 最新"
- "市场趋势 2025年发展"`,
                reminder: '⚠️ 注意：此步骤对时效性要求极高，过时信息将严重影响研究价值'
            },
            '中': {
                title: '⚠️ 中等时效性敏感步骤', 
                content: `**当前步骤敏感度**: 中 | **整体主题敏感度**: ${modelOverallSensitivity}
                
**专业建议**:
1. 选择性验证关键信息的时效性  
2. 关注技术产品的版本信息
3. 在深度研究和时效性验证间取得平衡

**灵活策略**:
- 根据需要添加"最新"关键词
- 优先但不强制时效性验证`,
                reminder: '💡 提示：适当关注信息时效性可显著提升研究质量'
            },
            '低': {
                title: '✅ 低时效性敏感步骤',
                content: `**当前步骤敏感度**: 低 | **整体主题敏感度**: ${modelOverallSensitivity}
                
**专业建议**:
1. 专注于信息的准确性和完整性
2. 关注历史脉络和发展历程
3. 引用权威经典来源

**研究重点**:
- 不需要强制添加时效性关键词  
- 专注于主题本身的核心信息`,
                reminder: '📚 提示：历史研究应注重准确性和学术完整性'
            }
        };

        const strategy = guidanceTemplates[stepSensitivity] || guidanceTemplates['中'];
        
        return `
# ${strategy.title}
${baseAwareness}

${strategy.content}

${strategy.reminder}

## 可用工具与策略
- **tavily_search**: 自主决定是否使用时序性关键词
- **crawl4ai**: 访问官网获取准确版本信息  
- **python_sandbox**: 对信息进行时间相关性分析

**最终决策权在你手中，请基于专业判断选择最佳研究策略。**`;
    }
    /**
     * 🎯 新增：智能知识检索触发器
     */
    _buildKnowledgeRetrievalTriggers(intermediateSteps, researchPlan, currentStep) {
        const conditions = [];
        const suggestedTools = [];
        
        const currentStepPlan = researchPlan.research_plan.find(step => step.step === currentStep);
        const hasPythonTasks = currentStepPlan?.sub_question?.includes('python_sandbox') ||
                              currentStepPlan?.expected_tools?.includes('python_sandbox') ||
                              currentStepPlan?.sub_question?.includes('数据') ||
                              currentStepPlan?.sub_question?.includes('表格') ||
                              currentStepPlan?.sub_question?.includes('图表');
        
        // ✅ 关键修复：检查是否已经学习过
        const hasAlreadyLearnedPython = intermediateSteps.some(step =>
            step.action?.tool_name === 'retrieve_knowledge' &&
            step.action?.parameters?.tool_name === 'python_sandbox' &&
            step.success !== false // 检查是否成功
        );

        // 条件1：首次使用复杂工具 (python_sandbox) 且尚未学习过
        const usedTools = intermediateSteps.map(step => step.action?.tool_name).filter(Boolean);
        if (!usedTools.includes('python_sandbox') && hasPythonTasks && !hasAlreadyLearnedPython) {
            conditions.push('首次使用 `python_sandbox` 进行数据处理或图表生成');
            suggestedTools.push({
                name: 'python_sandbox',
                reason: '获取数据处理和表格/图表生成的最佳实践工作流'
            });
        }
        
        // 条件2：复杂数据处理任务 (保留原有逻辑，但如果条件1触发，这里不会重复添加)
        const complexDataTasks = ['提取', '表格', '处理', '分析', '清洗', '图表', '可视化'];
        const hasComplexDataTask = complexDataTasks.some(task =>
            currentStepPlan?.sub_question?.includes(task)
        );
        
        if (hasComplexDataTask && !suggestedTools.some(t => t.name === 'python_sandbox') && hasPythonTasks && !hasAlreadyLearnedPython) {
            conditions.push('执行复杂的数据提取、处理或可视化任务');
            suggestedTools.push({
                name: 'python_sandbox',
                reason: '获取数据提取和表格/图表生成的专业工作流'
            });
        }
        
        // 条件3：之前步骤有网页抓取且当前需要处理数据 且尚未学习过
        const hasCrawledData = intermediateSteps.some(step =>
            step.action?.tool_name === 'crawl4ai' && step.observation?.includes('成功')
        );
        
        if (hasCrawledData && hasPythonTasks && !hasAlreadyLearnedPython) {
            conditions.push('需要处理之前抓取的网页数据');
            suggestedTools.push({
                name: 'python_sandbox',
                reason: '获取网页数据解析和结构化的完整指南'
            });
        }
        
        // 移除重复的工具建议
        const uniqueSuggestedTools = suggestedTools.filter((tool, index, self) =>
            index === self.findIndex((t) => (
                t.name === tool.name
            ))
        );

        return { conditions, suggestedTools: uniqueSuggestedTools };
    }


    // ✨ 格式化研究计划
    _formatResearchPlan(plan, currentStep) {
        if (!plan || !plan.research_plan) return '';
        
        return `
# 📋 研究计划（当前步骤：${currentStep}）
${plan.research_plan.map(item => 
    item.step === currentStep ? 
    `✅ **步骤 ${item.step}（进行中）**: ${item.sub_question}` :
    `▢ 步骤 ${item.step}: ${item.sub_question}`
).join('\n')}

**预计总迭代**: ${plan.estimated_iterations || 4} 次
**复杂度评估**: ${plan.risk_assessment || '未知'}
**研究模式**: ${plan.research_mode || 'standard'}
**时效性敏感度**: ${plan.temporal_awareness?.overall_sensitivity || '未知'}
`;
    }

    // ✨ 步骤追踪逻辑
    _determineCurrentStep(plan, history) {
        if (!plan || !history || history.length === 0) return 1;
        
        const completedSteps = plan.research_plan.filter(step => 
            this._isStepCompleted(step, history)
        ).length;
        
        return Math.min(completedSteps + 1, plan.research_plan.length);
    }

    _isStepCompleted(step, history) {
        const stepKeywords = step.sub_question.toLowerCase().split(' ');
        const recentActions = history.slice(-3).join(' ').toLowerCase();
        
        return stepKeywords.some(keyword => 
            recentActions.includes(keyword) && 
            history.some(entry => entry.includes('最终答案') || entry.includes('足够信息'))
        );
    }

    // 🎯 格式化历史记录 - 核心修复：简化旧历史记录以降低干扰
    _formatHistory(intermediateSteps) {
        if (!intermediateSteps || intermediateSteps.length === 0) {
            return "这是研究的第一步，还没有历史记录。";
        }

        console.log(`[AgentLogic] 构建历史记录，步骤数: ${intermediateSteps.length}`);
        const totalSteps = intermediateSteps.length;

        const formattedSteps = intermediateSteps.map((step, index) => {
            const toolName = step.action?.tool_name || 'unknown_action';
            const parameters = step.action?.parameters || {};

            const actionJson = JSON.stringify({
                tool_name: toolName,
                parameters: parameters
            }, null, 2);

            let thought = step.action?.thought || `执行 ${toolName}。`;

            // 🎯 核心修复：简化旧历史记录以降低干扰
            let observationText;
            const isRecent = (totalSteps - 1 - index) < 2; // 是否是最近的两个步骤之一?

            if (!isRecent) {
                // 对于旧步骤，只显示关键发现
                observationText = `[发现摘要]: ${step.key_finding || '未总结关键发现。'}`;
            } else if (step.action?.tool_name === 'python_sandbox' && step.success === false) {
                // 对于最近的、失败的 Python 步骤，显示完整错误
                observationText = typeof step.observation === 'string' ? step.observation : 'Python 执行失败。';
            } else {
                // 对于其他最近的步骤，显示截断的观察结果
                observationText = `${(step.observation || '').substring(0, 300)}... (内容已折叠)`;
            }

            return `## 步骤 ${index + 1}
思考: ${thought}
行动:
\`\`\`json
${actionJson}
\`\`\`
观察: ${observationText}
💡
**关键发现**: ${step.key_finding || '无'}`;
        });

        const history = formattedSteps.join('\n\n');
        console.log(`[AgentLogic] 历史记录构建完成，最终长度: ${history.length}`);

        return history;
    }

    // 🎯 格式化工具描述
    _formatTools(availableTools) {
        if (!availableTools || availableTools.length === 0) {
            return "暂无可用工具";
        }
        
        return availableTools
            .map(tool => `  - ${tool.name}: ${tool.description}`)
            .join('\n');
    }
}