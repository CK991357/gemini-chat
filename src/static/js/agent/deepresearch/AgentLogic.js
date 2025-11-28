// src/static/js/agent/deepresearch/AgentLogic.js - 修复crawl4ai参数匹配版

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
                role: "学术论文深度分析专家",
                instructions: `1. 将论文分析分解为4-6个逻辑连贯的深度分析步骤
2. 必须包含：核心贡献识别、方法深度解析、实验验证、技术对比分析、学术价值评估
3. 每个步骤聚焦一个明确的学术分析维度
4. 强调技术深度、批判性思考和学术价值评估
5. 确保覆盖：创新点识别、技术路线分析、实验结果验证、领域影响评估`,
                iterations: 6,
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
                role: "资深技术架构师",
                instructions: `1. 将技术需求分解为4-6个逻辑连贯的技术实现步骤
2. 必须包含：需求分析、技术选型、架构设计、核心实现、部署运维
3. 每个步骤聚焦一个明确的技术实现维度
4. 强调技术可行性、性能考量、代码质量和最佳实践
5. 确保覆盖：技术方案论证、具体实现细节、部署配置、问题排查`,
                iterations: 6,
                risk: "中|高"
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
                        sub_question: `深度解析"${topic}"的核心学术贡献和技术创新点`,
                        initial_queries: [`${topic} 核心贡献`, `${topic} 技术创新`, `${topic} 方法创新`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai", "tavily_search"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 2,
                        sub_question: "分析论文的技术路线和实现细节",
                        initial_queries: [`${topic} 技术路线`, `${topic} 算法细节`, `${topic} 架构设计`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai", "tavily_search"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 3,
                        sub_question: "验证实验结果和性能指标的可信度",
                        initial_queries: [`${topic} 实验结果`, `${topic} 性能指标`, `${topic} 实验设置`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai", "python_sandbox"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 4,
                        sub_question: "对比分析与相关工作的技术差异和创新突破",
                        initial_queries: [`${topic} 技术对比`, `${topic} 相关工作`, `类似方法比较`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高"
                    },
                    {
                        step: 5,
                        sub_question: "评估论文的学术价值和领域影响",
                        initial_queries: [`${topic} 学术价值`, `${topic} 领域影响`, `技术前景评估`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "中"
                    }
                ],
                estimated_iterations: 6,
                risk_assessment: "中",
                research_mode: "academic",
                // 🔥 添加时效性评估
                temporal_awareness: {
                    assessed: true,
                    overall_sensitivity: "中", // 学术论文整体中等敏感度
                    current_date: currentDate,
                    is_fallback: true
                }
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
                        sub_question: `深度分析"${topic}"的技术需求和约束条件`,
                        initial_queries: [`${topic} 技术需求`, `${topic} 性能要求`, `${topic} 业务场景`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高"  // 技术选型对时效性要求高
                    },
                    {
                        step: 2,
                        sub_question: "评估和选择合适的技术栈和架构方案",
                        initial_queries: [`${topic} 技术栈选择`, `${topic} 架构设计`, `类似项目技术方案`],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高"
                    },
                    {
                        step: 3,
                        sub_question: "设计核心算法和系统架构实现细节",
                        initial_queries: [`${topic} 核心算法`, `${topic} 系统架构`, `${topic} 实现方案`],
                        depth_required: "深度挖掘",
                        expected_tools: ["crawl4ai", "python_sandbox"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 4,
                        sub_question: "提供完整的代码实现和配置示例",
                        initial_queries: [`${topic} 代码示例`, `${topic} 配置指南`, `${topic} 最佳实践`],
                        depth_required: "深度挖掘",
                        expected_tools: ["python_sandbox", "crawl4ai"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 5,
                        sub_question: "制定部署运维和性能优化方案",
                        initial_queries: [`${topic} 部署指南`, `${topic} 性能优化`, `${topic} 监控方案`],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "中"
                    }
                ],
                estimated_iterations: 6,
                risk_assessment: "中",
                research_mode: "technical",
                temporal_awareness: {
                    assessed: true,
                    overall_sensitivity: "高", // 技术实现对时效性要求高
                    current_date: currentDate,
                    is_fallback: true
                }
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
        const { topic, intermediateSteps, availableTools, researchPlan, researchMode = 'standard', forceNativeVision = false } = inputs;
        
        // 🎯 关键词检测逻辑
        const detectedMode = researchMode; // 直接使用传入的、正确的模式！
        
        // 动态计算当前步骤
        const currentStep = this._determineCurrentStep(researchPlan, intermediateSteps);
        
        const prompt = this._constructFinalPrompt({
            topic,
            intermediateSteps,
            availableTools,
            researchPlan,
            currentStep,
            researchMode: detectedMode,
            currentDate: new Date().toISOString(), // 添加当前日期
            forceNativeVision // 🚀 传递强制 Native Vision 标志
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

    // ✨ 重构：主提示词构建 - 核心知识检索集成
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1, researchMode = 'standard', currentDate, forceNativeVision = false }) {
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // --- START FIX: [最终修复版] 注入上一步的观察结果，并强化知识应用指令 ---
// --- START OF FINAL FIX: 统一的、分层级的上下文注入逻辑 (健壮版 v3 - 修复 lastStep 作用域) ---
        // 🎯 核心修复：确保 lastStep 变量始终定义（作用域安全）
        let lastStep = null;
        let lastObservation = '';
        
        if (intermediateSteps && intermediateSteps.length > 0) {
            lastStep = intermediateSteps[intermediateSteps.length - 1];
            
            // 检查 lastStep 是否有效且包含有意义的 observation
            if (lastStep && typeof lastStep.observation === 'string' && lastStep.observation.length > 50) {
                
                // 🔥🔥🔥【核心逻辑分层】🔥🔥🔥
                // 优先级 1: 判断上一步是否是【成功的知识检索】
                if (lastStep.action && lastStep.action.tool_name === 'retrieve_knowledge' && lastStep.success !== false) {
                    
                    // 如果是，则使用专门为"知识应用"设计的提示
                    const retrievedToolName = lastStep.action.parameters ? lastStep.action.parameters.tool_name : '未知工具';
                    
                    lastObservation = `
## 📖 【强制应用】你已获取操作指南
你刚刚通过 \`retrieve_knowledge\` 获取了 \`${retrievedToolName}\` 的完整操作指南。
**你的下一步行动必须严格依据这份指南中的代码示例、Schema格式和工作流来构建。**
在你的"思考"中，你必须明确引用你参考了指南的哪个部分。

**指南内容摘要:**
\`\`\`markdown
${lastStep.observation.substring(0, 4000)} ${lastStep.observation.length > 4000 ? '... (内容已截断)' : ''}
\`\`\`
`;

                } else {
                    // 优先级 2: 如果不是知识检索，则是通用的工具调用观察结果
                    // 使用统一的、语言清晰的中文提示
                    lastObservation = `
## 📋 上下文：上一步的观察结果
你刚从上一个工具调用中收到了以下信息。如果相关，你**必须**使用这些数据来指导你的下一步行动。

**观察结果摘要:**
\`\`\`
${lastStep.observation.substring(0, 4000)} ${lastStep.observation.length > 4000 ? '... (内容已截断)' : ''}
\`\`\`
`;
                }
            }
        }
// --- END OF FINAL FIX ---
        
        // 🎯 增强：动态知识检索触发器
        const knowledgeRetrievalTriggers = this._buildKnowledgeRetrievalTriggers(intermediateSteps, researchPlan, currentStep);
        
// 🔥🔥🔥【最终版】知识驱动决策协议 - 简洁高效版本
        const knowledgeStrategySection = `
## 🧠 【强制】知识驱动决策协议

### 决策检查清单:
1.  **任务需求:** 我下一步是否需要使用 \`python_sandbox\` 或 \`crawl4ai\`？
2.  **知识储备:** 我是否**在上一步**已经成功查阅了该工具的完整指南？

### 协议规则:
*   **如果对清单2的回答是"否"**: 你的唯一合法行动是调用 \`retrieve_knowledge\` 来获取操作指南。**禁止**直接调用目标工具。
*   **如果对清单2的回答是"是"**: 你现在被授权可以调用目标工具。你的思考过程必须引用指南中的内容。

${knowledgeRetrievalTriggers.conditions.length > 0 ? `
### ⚡ 协议已触发！立即执行培训！
**系统检测到：** ${knowledgeRetrievalTriggers.conditions.join('; ')}
**因此，你的下一步行动必须是调用 \`retrieve_knowledge\` 获取以下指南：**
${knowledgeRetrievalTriggers.suggestedTools.map(tool => `- **\`${tool.name}\`**: ${tool.reason}`).join('\n')}
` : `
### ✅ 协议未触发。
你可以根据标准决策流程继续。
`}
`;
        
// 🚀🚀🚀 [v3.0 核心更新] 经理人委托协议 (Manager Delegation Protocol) 🚀🚀🚀
        const academicAnalysisFramework = `
## 🎓 学术论文深度分析框架

### 论文解析维度：
1. **核心贡献识别**：论文解决了什么关键问题？提出了什么新方法？
2. **方法深度剖析**：技术路线的创新点、理论基础、实现细节
3. **实验严谨性评估**：实验设计、数据集、评估指标、结果可信度
4. **相关工作脉络**：领域发展历程、技术路线演进、关键突破点
5. **局限性与改进**：方法局限性、实验不足、可改进方向
6. **未来趋势预测**：技术演进方向、应用拓展、交叉研究机会

### 搜索策略：
- 论文标题 + "核心贡献"/"创新点"
- 论文标题 + "方法"/"算法"/"架构"
- 论文标题 + "实验"/"结果"/"性能"
- 论文标题 + "相关工作"/"文献综述"
- 论文标题 + "未来方向"/"研究挑战"
- 作者姓名 + "相关研究"/"其他论文"

### 动态章节生成原则：
- 每个研究步骤对应报告中的一个核心章节
- 章节标题要体现该步骤的核心发现
- 内容要基于收集的证据进行深度分析和整合
- 确保学术严谨性和论证的逻辑性
`;
        
        const technicalAnalysisFramework = `
## 🏗️ 技术实现深度分析框架

### 技术方案评估维度：
1. **需求符合度**: 方案是否精准满足用户的技术需求？
2. **技术可行性**: 现有技术栈和团队能力是否支持实现？
3. **性能考量**: 响应时间、吞吐量、资源消耗等指标
4. **可维护性**: 代码结构、文档完整性、调试便利性
5. **扩展性**: 系统是否容易扩展和适应未来需求变化？

### 技术选型决策树：
- **数据库选择**: 关系型 vs NoSQL → 基于数据结构和查询模式
- **架构模式**: 微服务 vs 单体 → 基于团队规模和复杂度
- **部署方式**: 容器化 vs 传统部署 → 基于运维能力和弹性需求
- **技术栈**: 成熟技术 vs 新兴技术 → 基于风险承受能力

### 代码质量标准：
- **可读性**: 清晰的命名、适当的注释、合理的代码结构
- **可测试性**: 模块化设计、依赖注入、测试覆盖率
- **错误处理**: 完善的异常捕获、有意义的错误信息
- **性能优化**: 避免常见性能陷阱，提供优化建议

### 部署运维考量：
- **环境配置**: 开发、测试、生产环境的差异化配置
- **监控告警**: 关键指标监控、日志收集、告警机制
- **安全防护**: 身份认证、数据加密、漏洞防护
- **备份恢复**: 数据备份策略、灾难恢复方案
`;

        const delegationProtocol = `
## 👔 经理人行动准则 (Manager Protocol)

1.  **角色定位**：你是指挥官，负责规划和决策，**绝不亲自写代码**。
2.  **委托机制**：
    *   遇到需要代码解决的问题（如绘图、计算、数据处理），**必须**调用 \`code_generator\`。
    *   **严禁**直接调用 \`python_sandbox\`。
    *   在 \`data_context\` 中，必须将用户提供的**原始数据**（如完整的年份列表、数值列表）原封不动地传给专家。不要做摘要。
`;

const managerDecisionFramework = `
## 🎯 核心决策框架 (经理人委托版)

### 1. 任务性质评估 (必须回答)
- **当前子问题**: [复述当前步骤]
- **任务类型判断**:
  - 是否涉及数据计算、图表绘制、文件生成或复杂逻辑？ -> 是/否
  - 如果是，**必须**启动委托流程。

### 2. 委托完整性检查 (Delegation Check)
- **工具选择**: 我是否选择了 \`code_generator\` 而非 \`python_sandbox\`？ -> 必须为是
- **数据传递**:
  - 我是否将用户提供的**原始数据**（如年份列表、数值列表）完整地放入了 \`data_context\` 参数？
  - **严禁摘要**：数据必须原样传递，不能概括。

### 3. 避坑指南
- **🚫 禁止自作聪明**: 不要尝试自己在思考中写 Python 代码。
- **🚫 禁止直接操作**: 不要直接调用 \`python_sandbox\`。
`;


const crawlTimeoutProtocol = `
## 🕷️ crawl4ai 超时恢复协议 (Timeout Recovery Protocol)

**情景**: 当你上一步调用 \`crawl4ai\` 后，观察结果中包含“超时”、“timeout”或“500”服务器错误。

**你必须严格遵循以下多层次恢复策略，而不是立即重试相同的 URL：**

### **第一步：诊断与切换 (Switch Source)**
1.  **诊断**: 在“思考”中明确承认：“上一步 \`crawl4ai\` 调用失败，原因是超时或服务器错误，这很可能是因为目标网站存在反爬虫机制或服务器不稳定。”
2.  **切换源**: **立即回顾**你历史记录中**上一次成功**的 \`tavily_search\` 调用的结果列表。
3.  **行动**: 从该列表中选择一个**不同的、看起来同样权威的 URL** (例如，选择另一个官方网站、知名技术博客或权威百科)，然后使用 \`crawl4ai\` 对这个**新 URL** 进行抓取。

### **第二步：重新探索 (Re-Search)**
- **触发条件**: 如果上一次 \`tavily_search\` 的结果中没有其他可用的高质量 URL，或者对新 URL 的 \`crawl4ai\` 调用**再次失败**。
- **诊断**: 在“思考”中说明：“尝试抓取备用 URL 失败，我需要寻找全新的数据源。”
- **行动**: 执行一次**全新的 \`tavily_search\` 调用**。在查询中加入新的关键词，如“官方数据”、“研究报告”、“替代来源”，以发现不同类型的网站。

### **第三步：最终判定 (Final Judgment)**
- **触发条件**: 如果在**全新的数据源**上尝试 \`crawl4ai\` **仍然失败**。
- **诊断**: 在“思考”中做出最终判断：“经过多次对不同来源的尝试，\`crawl4ai\` 工具目前可能暂时无法访问这些类型的网站或自身存在不稳定性。”
- **行动**: **放弃**使用 \`crawl4ai\` 完成当前子问题。在思考中总结你**已经**从 \`tavily_search\` 的摘要中获取了哪些信息，然后**继续推进到研究计划的下一个步骤**。

**🚫 绝对禁止**:
- **在同一个失败的 URL 上连续重试 \`crawl4ai\`超过一次。**
- 因为 \`crawl4ai\` 失败就卡住不动或提前终止整个研究。你必须灵活地调整策略，利用已有信息继续前进。
`;

const toolOptimizationProtocol = `
## 🛠️ 工具使用策略优化 (Agent Optimization Protocol)

### 🕷️ crawl4ai 使用禁忌与最佳实践:
- **避开交互式页面**: 严禁抓取 URL 中包含 \`query\`, \`search\`, \`database\`, \`easyquery\` 等字样的动态查询页面（例如 \`data.stats.gov.cn/easyquery\`）。这些页面通常需要交互才能显示数据，静态抓取无效。
- **优先选择静态页面**: 优先抓取包含“公报”、“报告”、“文章”、“新闻”字样的 URL。
- **失败处理**: 如果对某个域名的抓取返回“内容过短”或失败，**不要**再次尝试该域名下的其他链接，直接切换到 \`tavily_search\` 寻找第三方权威汇总（如维基百科、智库报告）。

### 🔍 tavily_search 策略优化:
- **组合查询**: 尽量在一个查询中包含多个年份，例如 "中国人口 2020 2021 2022 2023 数据表"，而不是分年份搜索。
- **寻找汇总表**: 优先寻找“统计公报汇总”或“历年数据一览”类的信息源。
`;

        const errorCorrectionProtocol = `
## 🔴 强制错误诊断与修正协议

**当工具执行失败时，你必须严格遵循以下流程：**

### 第一步：深度诊断错误
- **仔细阅读错误报告**：错误信息已经过专业解析
- **【关键】检查数据完整性**：确认所有变量都有完整的赋值
- **在思考中明确写出**："我识别到错误：[具体错误]，原因是数据赋值不完整"

### 第二步：针对性修正
- **数据完整性优先**：首先确保所有变量都有完整的数据
- **基于错误类型修复**：
  - \`SyntaxError\` → 检查数据赋值是否完整，引号括号是否正确
  - \`NameError\` → 检查变量名拼写和定义
- **绝对禁止**：在没有理解错误的情况下重试相同代码

### 第三步：验证性重试
- 在思考中说明："我已将用户数据完整填入代码"
- 提交完整的、修正后的代码进行验证
`;

        const formatComplianceProtocol = `
## 格式遵从与自我纠正协议

**系统警告**: 你的输出**必须**严格遵循“思考、行动、行动输入”的格式。任何多余的字符、Markdown标记或不规范的JSON都将导致**解析失败 (Parsing Failure)**。

**当上一步的观察结果是“格式错误”或“解析失败”时，你必须执行以下操作：**

1.  **诊断**: 在“思考”中明确承认：“我上一步的输出格式不正确，导致了解析失败。”
2.  **复现**: 回顾你上一步**想要执行的** \`行动\` 和 \`行动输入\`。
3.  **修正**: 重新生成完全相同的 \`行动\` 和 \`行动输入\`，但这一次**确保格式绝对纯净**。
    *   \`思考:\` 部分只能包含文本。
    *   \`行动:\` 后面只能是工具名。
    *   \`行动输入:\` 后面只能是一个干净、无注释、无额外文本的 JSON 对象。

**🚫 绝对禁止**: 因为一次解析失败就放弃当前任务或跳到未来的步骤。**你必须在原地修正格式并重试。**
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
            modelOverallSensitivity, // 传递整体敏感度用于上下文
            researchMode // 🔥 注入 researchMode
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
                role: "学术论文深度分析专家",
                description: "你是一个严谨的学术论文分析专家，擅长深度解析论文核心价值、方法创新性，并进行研究脉络追踪和未来趋势预测。",
                specialInstructions: `
### 🎯 深度学术分析要求：
- **技术具体化**: 避免抽象描述，提供具体的算法细节、技术参数、实现机制
- **数据支撑**: 所有性能声明必须基于具体的实验数据和统计指标
- **批判思维**: 客观分析技术局限性和改进空间，不回避问题

### 🔍 辩证分析框架：
1. **技术路线对比**: 与2-3个相关工作进行深度技术对比
2. **优劣权衡**: 分析不同技术选择的优势和代价
3. **创新评估**: 评估技术突破的真实价值和推广潜力

### 📊 结构化表达：
- 使用子标题组织复杂的技术内容
- 关键数据和技术参数要突出显示
- 确保技术描述→实验验证→价值评估的逻辑连贯性

### 💡 学术价值聚焦：
- 专注于论文的核心贡献和技术创新
- 避免泛泛而谈的背景介绍
- 每个分析点都要有明确的学术意义
`
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
                role: "资深全栈架构师",
                description: "你是一个经验丰富的技术架构师，擅长设计可落地的技术方案，提供完整的代码实现和最佳实践指南",
                specialInstructions: `
### 🛠️ 技术实现深度要求：
- **代码完整性**: 所有代码示例必须包含完整的导入语句、错误处理、类型注解
- **可运行性**: 代码应该可以直接运行或稍作调整即可使用
- **生产就绪**: 考虑安全性、性能、可维护性等生产环境要求

### 📋 技术文档标准：
1. **架构图说明**: 如有架构图，必须在文中详细解释每个组件的作用
2. **配置示例**: 提供完整的配置文件示例（如Dockerfile、环境变量）
3. **部署步骤**: 详细的部署指令，包含可能遇到的问题和解决方案
4. **测试方案**: 重要的功能应该包含单元测试或集成测试示例

### 🔧 技术选型框架：
- **需求匹配度**: 技术选型必须基于具体的需求分析
- **生态成熟度**: 考虑社区支持、文档完整性、长期维护性
- **团队适应性**: 评估学习曲线和团队技术背景
- **成本效益**: 综合考虑开发成本、运维成本和扩展性

### 💡 最佳实践要求：
- 每个技术决策都要说明理由和权衡
- 提供性能优化和调试技巧
- 包含常见错误的排查指南
- 强调安全性和代码质量
`
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

        // 🔥🔥🔥 新增：强制图表展示指令 🔥🔥🔥
        const visualizationMandate = `
## 📊 图表展示强制协议 (Mandatory Visualization Display)

**如果**在任何研究步骤中，工具返回了**图像数据**（即观察结果中包含 \`"type": "image"\` 或 Base64 字符串），你**必须**在最终报告中展示它。

1.  **引用规则**：使用 Markdown 图片语法 \`![图表标题](placeholder:image_id)\`。
    *   注意：系统会自动替换占位符。你只需要确保在报告的相关章节（通常是"核心发现"或"数据分析"部分）插入这个图片标签。
2.  **容错原则**：即使工具返回了 Warning（例如字体缺失），只要图表生成了，就视为**成功**，必须展示图表，并在正文中简要说明 Warning（例如"注：部分中文字符可能显示异常"）。
3.  **禁止隐瞒**：绝对不要因为一点小 Warning 就宣称“绘图失败”而把图表藏起来。
`;

        // 🔥🔥🔥 新增：工具降级响应处理指南 🔥🔥🔥
        const toolDegradationHandling = `
## 🟡 工具降级响应处理指南

**当工具返回以下信息时，视为成功并继续**：
- "PDF生成已跳过，文本内容已完整返回"
- "内存优化：部分功能已降级"
- "内容已截断，核心信息完整"
- 包含"降级"、"跳过"但提供有效内容的响应

**处理原则**：
1. 核心文本内容可用 → 继续研究流程
2. 数据/图表生成成功 → 忽略内存警告
3. 搜索返回部分结果 → 使用可用信息

**示例思考**：
"工具因内存限制跳过了PDF生成，但返回了完整的文本内容。这些信息足够我继续下一步研究。"
`;

        // 🎯 核心新增：代码生成和质量控制
        const codeQualityStandards = `
## 💻 代码生成质量标准

### 代码完整性要求：
1. **完整可运行**: 提供完整的、可复现的代码示例
2. **错误处理**: 必须包含适当的异常捕获和错误处理逻辑
3. **输入验证**: 对用户输入进行验证和清理
4. **资源管理**: 正确管理文件句柄、数据库连接等资源

### 代码示例结构：
\`\`\`python
# 1. 导入语句（完整的依赖）
import os
from typing import List, Dict

# 2. 配置和常量定义
CONFIG = {
    'database_url': os.getenv('DATABASE_URL', 'sqlite:///default.db'),
    'max_workers': 4
}

# 3. 核心函数实现（包含类型注解和文档字符串）
def process_data(input_data: List[Dict]) -> List[Dict]:
    """
    处理输入数据，返回清洗后的结果
    
    Args:
        input_data: 原始数据列表
        
    Returns:
        处理后的数据列表
        
    Raises:
        ValueError: 当输入数据格式不正确时
    """
    if not input_data:
        raise ValueError("输入数据不能为空")
    
    try:
        # 核心处理逻辑
        processed = []
        for item in input_data:
            # 数据清洗和转换
            cleaned_item = {k: v.strip() for k, v in item.items() if v}
            processed.append(cleaned_item)
        return processed
    except Exception as e:
        # 详细的错误处理和日志记录
        print(f"数据处理失败: {e}")
        raise

# 4. 使用示例和测试代码
if __name__ == "__main__":
    sample_data = [{"name": " Alice ", "age": "30"}, {"name": "Bob", "age": ""}]
    result = process_data(sample_data)
    print(f"处理结果: {result}")
\`\`\`

### 配置文件和部署文件：
- **Dockerfile**: 多阶段构建、安全最佳实践
- **docker-compose.yml**: 服务依赖、网络配置、数据卷
- **环境配置**: 区分开发、测试、生产环境
- **CI/CD配置**: 自动化测试和部署流程
`;

        // 🎯 核心新增：技术实现专用协议
        const technicalDecisionProtocol = `
## 🎯 技术实现决策协议

### 1. 需求分析阶段 (必须详细)
- **功能需求**: [明确用户需要实现的具体功能]
- **非功能需求**: [性能、安全、可用性等要求]
- **约束条件**: [技术栈限制、资源限制、时间限制]
- **成功标准**: [如何衡量方案的成功]

### 2. 技术选型评估框架
对于每个技术选择，必须回答：
- **为什么选择这个技术？** → 基于具体的需求匹配度
- **有哪些替代方案？** → 至少对比2-3个替代方案
- **选择的权衡是什么？** → 性能、复杂度、维护成本的权衡

### 3. 实现深度要求
- **架构图**: 如有，必须详细解释每个组件
- **代码示例**: 必须是完整可运行的代码片段
- **配置说明**: 详细的配置参数和调优建议
- **测试方案**: 重要的功能要提供测试示例

### 4. 部署运维考量
- **环境要求**: 硬件、软件、网络要求
- **部署步骤**: 详细的、可操作的部署指令
- **监控方案**: 关键指标和告警设置
- **故障处理**: 常见问题排查指南
`;

        // 🎯 核心新增：JSON 格式纪律
        const strictJsonFormatGuideline = `
## 🚨【强制】JSON 输出纪律

当你的行动是调用工具时，"行动输入"部分**必须**是一个**严格有效**的 JSON 对象。

**检查清单**:
1.  **所有键名 (keys)** 必须用**双引号** (") 包围。
2.  **所有字符串值 (string values)** 必须用**双引号** (") 包围。
3.  对象的最后一个键值对**之后不能有逗号** (trailing comma)。
4.  **禁止**任何形式的注释 (\`//\` 或 \`/* */\`)。

**🚫 错误示例**:
行动输入: { tool_name: 'code_generator', 'objective': '画图' } // 键名 tool_name 无引号

**✅ 正确示例**:
行动输入: { "objective": "绘制销售折线图", "data_context": "年份[2021, 2022]..." }
`;

        // 🎯 核心新增：知识检索输出格式
        const knowledgeRetrievalOutputFormat = `
## 知识应用框架：查阅知识 vs. 应用知识

### 1. 查阅知识 (检索工具文档)
思考: [明确说明：1) 要解决什么任务 2) 需要使用哪个工具 3) 为什么需要查阅文档 4) 期望获取什么具体指导]
示例: "用户要求进行数据分析和生成图表。我需要使用python_sandbox，但不确定数据处理和可视化的最佳实践。我应该查阅完整文档来获取'数据可视化工作流'的具体实现方法。"
行动: retrieve_knowledge
行动输入: {"tool_name": "python_sandbox", "context": "数据分析和可视化任务"}

### 2. 应用知识 (执行工具操作)
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

        // 🎯 核心修复：添加 crawl4ai 参数特别说明
        const crawl4aiSpecialNote = `
## 🕷️ crawl4ai 特别使用说明

**重要**: 当使用 \`extract\` 模式时，必须提供一个名为 \`schema_definition\` 的参数来定义提取的数据结构。请勿使用 \`schema\` 作为参数名。

**正确示例**:
\`\`\`json
{
  "mode": "extract",
  "parameters": {
    "url": "https://example.com",
    "schema_definition": {
      "title": "string",
      "content": "string"
    }
  }
}
\`\`\`
`;

        // 修改：构建可用工具部分，包括特别提示
        const availableToolsSection = `
# 可用工具
${availableToolsText}

${crawl4aiSpecialNote}
`;

        const prompt = `
# 角色：${config.role}
${config.description}

${temporalGuidance}

${visualizationMandate} // 🔥 插入：强制图表展示指令

${toolDegradationHandling} // 🟡 插入：工具降级响应处理指南

${strictJsonFormatGuideline} // 🎯 核心新增：JSON 格式纪律

${forceNativeVision ? this._getNativeVisionMandate() : ''} // 🚀 核心新增：强制 Native Vision 指令

${currentTaskSection}  // 🎯 核心修复：聚焦当前任务，防止跳过步骤

${planText}

# 研究目标
**最终主题**：${topic}
${lastObservation}

${availableToolsSection}  // 🎯 修复：使用包含crawl4ai特别说明的工具部分

# 研究历史与观察
${formattedHistory}

${outlineGenerationGuide}  // 🎯 新增：大纲生成指导

${knowledgeStrategySection}  // 🎯 核心新增：知识检索策略
${researchMode === 'technical' ? technicalDecisionProtocol : ''} // 🎯 插入：技术实现专用决策协议

## 🔍 多源信息整合策略

**信息验证与整合要求**：
1. **交叉验证**：对于关键信息，比较多个来源的一致性
2. **优先级排序**：官方文档 > 学术论文 > 权威媒体 > 其他来源
3. **冲突处理**：当来源信息冲突时，在报告中说明并倾向于权威来源
4. **信息补充**：使用不同来源补充信息的完整维度

**整合示例思考**：
"来源1提供了GLM-4.5的架构细节，来源2补充了性能基准数据，我将结合这两个来源构建完整的模型描述[来源1][来源2]"

${researchMode === 'academic' ? academicAnalysisFramework : ''} // 🔥 插入：学术论文专用分析框架
${researchMode === 'technical' ? technicalAnalysisFramework : ''} // 🏗️ 插入：技术实现专用分析框架
${managerDecisionFramework} // 🎯 核心新增：经理人委托版决策框架

## 3. 研究状态评估与工具选择 (基于信息缺口)

### 3.1. 状态评估 & 交叉验证 (必须回答)
- **当前子问题**: [明确复述当前研究计划的步骤目标]
- **信息满足度评估**: 基于"研究历史与观察"，我已经获得的信息是否**完全且清晰地**回答了上述子问题？
- **证据强度评估**:
    - **单一来源风险**: 我当前的关键论点是否只依赖于单一的来源（例如，仅仅依赖于上一篇抓取的论文）？
    - **观点交叉验证**: 我是否已经从**至少2个不同角度或不同作者**的来源中，找到了可以相互印证或形成对比的观点？
- **信息缺口分析 (必须详细)**:
    - 如果**是**，请明确指出"信息已满足"，并直接规划**下一个**研究步骤。
    - 如果**否**，请明确列出还缺少**哪些具体的、用于形成对比或验证的**信息点（例如："我已经有了A论文的观点，现在需要寻找B机构的报告来验证或挑战它"）。

### 3.2. 工具选择策略 (基于缺口分析)
- **如果存在单一来源风险**: 你的首要任务是使用 \`tavily_search\` 寻找一个**不同类型**的信息源（如行业报告、技术博客、新闻分析）来补充视角。
- **如果信息不足**: [基于上述信息缺口分析，选择最合适的工具和参数来填补缺口...]

### 🔍 tavily_search 使用时机：
- 探索新概念、寻找多个信息源
- 快速获取概况和背景信息  
- 关键词优化：使用更具体、更精准的搜索词

### **阶段 A：信息探索 (tavily_search)**
- **时机**: 当开始一个新的子问题，或者需要寻找多个潜在信息源时。
- **行动**: 调用 \`tavily_search\` 获取一个全面的来源列表。
- **参数**: {query: "你的搜索词", max_results: 10}
- **注意**: \`tavily_search\` 的返回结果是一个**列表**，包含多个来源。你可以选择一个**最相关的**来源，并使用 \`crawl4ai\` 获取该来源的**完整内容**。

### 🕷️ crawl4ai 使用时机：
- 当搜索结果中出现权威来源时（百科、官方页面、深度文章）
- 需要获取完整内容而非摘要时
- **重要提示**: \`crawl4ai\` 的返回结果（观察）通常是一个经过优化的**智能摘要**，它可能已经包含了你需要的所有结构化信息（如表格）。在进入下一个步骤，如编写下一步的\`python_sandbox\`代码时，**你应该优先尝试从这个摘要中提取数据**，因为它比解析原始HTML更简单、更可靠。只有当摘要信息确实不足时，才需要考虑处理更原始的数据。
- 信息片段不足以回答深度问题时
- **必须参数**：{url: "具体的URL链接"}
- **【重要修复】**：使用 \`extract\` 模式时，参数名必须是 \`schema_definition\`，不是 \`schema\`！

### **阶段 B：深度钻取 (crawl4ai)** - 你的核心任务
- **触发条件**: 当你的**上一步行动是 \`tavily_search\` 并且成功返回了结果**时。
- **强制任务**:
    1.  **仔细分析**上一步 \`tavily_search\` 的观察结果（\`[深度来源 1]\`,\`[深度来源 2]\`...）。
    2.  从列表中**识别出 1-2 个最权威、最相关的 URL**。优先选择官方文档、深度文章、研究报告或标题与子问题高度匹配的链接。
    3.  你的下一步行动**必须是**调用 \`crawl4ai\` 来获取这些URL的**完整内容**。

### **阶段 C：信息综合与验证 (python_sandbox / tavily_search)**
- **触发条件**: 当你已经通过 \`crawl4ai\` 获取了1-2个高质量的全文信息后。
- **可选行动**:
    - 对抓取到的文本进行数据分析、提取或处理。备选工具： \`python_sandbox\` 。
    - 如果信息仍不足或需要交叉验证，可以再次调用 \`tavily_search\` 寻找补充观点。

 ### 🚫 绝对禁止 (深度研究模式下):
- **连续两次**调用 \`tavily_search\`，除非第一次搜索完全没有返回任何有价值的URL。
- 在 \`tavily_search\` 之后，如果存在有价值的URL，却选择执行其他操作。**必须优先钻取**。
- 在 \`crawl4ai\` 抓取到长文本后，因为摘要里没看到需要的表格或图片就再次调用 \`tavily_search\`。**如果所需要的数据已经在资料中有明确表述，你可以记录下来并优先尝试用 \`python_sandbox\` 提取或绘制数据图表**。

${errorCorrectionProtocol}  // 🎯 修复：使用包含参数检查的错误修正协议
${crawlTimeoutProtocol} // 🎯 新增：crawl4ai 超时恢复协议
${toolOptimizationProtocol} // ✅ 优化 3：教育 Agent 避开“陷阱”
${formatComplianceProtocol} // 🎯 新增：格式遵从与自我纠正协议
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

${researchMode === 'technical' ? codeQualityStandards : ''} // 💻 插入：技术模式下的代码质量标准

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

${delegationProtocol} // 🎯 核心更新：经理人委托协议 (Recency Bias 优化)
${finalInstruction}  // 🎯 核心修复：最终指令强化纪律

现在开始决策：`;

        return prompt;
    }

    // 🔥【核心修改】重构 _buildDynamicTemporalGuidance 方法，使其能感知 researchMode
    _buildDynamicTemporalGuidance(currentDate, stepSensitivity, modelOverallSensitivity, researchMode) {
        const currentDateReadable = new Date().toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // 基础的时效性警告，所有模式通用
        const baseAwareness = `
## 🎯 自主时效性管理 (Mandatory Temporal Awareness Protocol)

**事实基准 (Factual Baseline):**
- **你的内部知识截止日期**: 2024年初。这是一个硬性限制，你必须时刻牢记。
- **当前系统日期**: ${currentDateReadable}
- **核心原则**: 任何涉及2024年之后的人、事、技术、市场趋势等，你都**必须**通过工具（如 \`tavily_search\`）进行外部验证。**绝对禁止**依赖你过时的内部知识来回答时效性问题。`;

        // 🔥 模式特定的强化指令
        let modeSpecificGuidance = '';
        if (researchMode === 'deep') {
            modeSpecificGuidance = `
### ⚡ 深度研究模式特别指令 (Deep Research Mode Directive)
作为深度专家，你对信息的“新鲜度”和“准确度”负有最高责任。
- **前沿追踪 (Edge-Tracking):** 对于技术、市场、科学等领域，你必须主动搜索 ${new Date().getFullYear()} 及 ${new Date().getFullYear()-1} 年的最新进展、论文和报告。
- **事实核查 (Fact-Checking):** 即使是你认为“已知”的事实（如某公司的CEO、某产品的最新版本），如果它可能随时间变化，也必须进行快速核查。
- **避免“常识性”错误:** 你的报告将被视为权威来源，任何因知识过时导致的错误都是不可接受的。`;
        }

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
${modeSpecificGuidance}

${strategy.content}
 
${strategy.reminder}
 
## 可用工具与策略
- **tavily_search**: 自主决定是否使用时序性关键词
- **crawl4ai**: 访问官网获取准确版本信息
- **python_sandbox**: 对信息进行时间相关性分析
 
**最终决策权在你手中，请基于专业判断选择最佳研究策略。**`;
    }

    /**
     * [最终修复版] 智能知识检索触发器
     * 核心：检测当前计划步骤是否需要使用复杂工具，并检查Agent是否已"学习"过
     */
    _buildKnowledgeRetrievalTriggers(intermediateSteps, researchPlan, currentStep) {
        const conditions = [];
        const suggestedTools = new Map(); // 使用Map确保唯一性

        const currentStepPlan = researchPlan.research_plan.find(step => step.step === currentStep);
        if (!currentStepPlan) return { conditions, suggestedTools: [] };

        const expectedTools = currentStepPlan.expected_tools || [];
        const subQuestion = (currentStepPlan.sub_question || '').toLowerCase();
        
        // --- 核心工具的检测逻辑 ---
        const coreToolsToCheck = {
            'python_sandbox': ['python', '代码', '分析', '图表', '表格', '计算', '证明'],
            'crawl4ai': ['extract', '提取'] // 重点关注最复杂的 extract 模式
        };

        // 检查最近一次交互是否是针对该工具的知识检索
        const lastStep = intermediateSteps.length > 0 ? intermediateSteps[intermediateSteps.length - 1] : null;
        const hasJustLearned = (toolName) => {
            return lastStep &&
                   lastStep.action?.tool_name === 'retrieve_knowledge' &&
                   lastStep.action?.parameters?.tool_name === toolName &&
                   lastStep.success !== false;
        };

        for (const [toolName, keywords] of Object.entries(coreToolsToCheck)) {
            // 触发条件：1) 计划中明确需要该工具，或 2) 子问题包含相关关键词
            const needsTool = expectedTools.includes(toolName) || keywords.some(kw => subQuestion.includes(kw));
            
            if (needsTool && !hasJustLearned(toolName)) {
                // 如果需要使用该工具，但Agent"还没学过"，则强制学习
                conditions.push(`计划执行需要使用复杂工具 \`${toolName}\`，但尚未查阅其最新操作指南。`);
                
                let reason = '获取该工具的基础用法和最佳实践。';
                if (toolName === 'crawl4ai') {
                    reason = '获取 `extract` 等高级模式的精确 `schema_definition` 格式和示例。';
                } else if (toolName === 'python_sandbox') {
                    reason = '获取特定任务（如数据可视化、文档生成）的标准化工作流和代码模板。';
                }

                if (!suggestedTools.has(toolName)) {
                    suggestedTools.set(toolName, { name: toolName, reason });
                }
            }
        }

        return { conditions, suggestedTools: Array.from(suggestedTools.values()) };
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
        // 将历史记录中的关键文本字段连接成一个大的、可搜索的字符串
        const historyText = history.map(h => `${h.action?.thought || ''} ${h.observation || ''}`).join(' ').toLowerCase();
        
        // 检查历史文本中是否包含表示“完成”的关键词
        const hasCompletionKeywords = historyText.includes('最终答案') || historyText.includes('足够信息');

        if (!hasCompletionKeywords) {
            return false;
        }

        // 检查与当前步骤相关的关键词是否也出现在历史中
        const stepKeywords = step.sub_question.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        
        return stepKeywords.some(keyword => historyText.includes(keyword));
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
        
        let toolsDesc = availableTools
            .map(tool => `  - ${tool.name}: ${tool.description}`)
            .join('\n');

        // 💥 虚拟专家工具定义
        toolsDesc += `\n  - code_generator: [代码专家] 专用于生成Python代码。当任务涉及计算、绘图或数据处理时，**必须**使用此工具委托给专家。参数: {"objective": "任务目标", "data_context": "完整的数据内容"}`;
        
        return toolsDesc;
    }

    // 🚀 核心新增：强制 Native Vision Prompt
    _getNativeVisionMandate() {
        return `
# 🖼️ 【最高优先级指令：原生视觉分析】
 
**系统检测到用户上传了图片附件，且这是研究的第一步。**
 
**你的唯一任务**：
1.  **忽略**研究计划中的第一个子问题（它通常是搜索）。
2.  **立即**使用你的原生视觉能力，对用户上传的图片进行**深度分析**。
3.  在你的**思考**中，详细描述图片内容、识别的关键信息（如文字、图表、对象）以及这些信息与用户请求（主题）的关联。
4.  **行动**：
    *   如果图片分析**直接**回答了用户的问题，则生成 \`最终答案\`。
    *   如果图片分析**提供了关键信息**但不足以回答问题，则生成一个 \`tool_call\`，将图片分析结果作为**关键发现**，并继续执行研究计划的**第二个**步骤。
 
**🚫 绝对禁止**：
-   **禁止**调用任何工具（如 \`tavily_search\` 或 \`crawl4ai\`）。
-   **禁止**生成 \`generate_outline\`。
-   **禁止**在思考中提及此指令块。
`;
    }
}