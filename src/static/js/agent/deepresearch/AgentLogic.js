// src/static/js/agent/deepresearch/AgentLogic.js - DRY原则优化版

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
        const { topic, intermediateSteps, availableTools, researchPlan, researchMode = 'standard', skillInjection } = inputs;
        
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
            currentDate: new Date().toISOString(), // 添加当前日期
            skillInjection // 🎯 新增：传递技能指导
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

    // ✨ 重构：主提示词构建 - 核心DRY原则优化
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1, researchMode = 'standard', currentDate, skillInjection }) {
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // 新增技能指导强制引用部分
        const skillGuidanceSection = skillInjection ? `
## 🛠️ 技能系统专业指导（必须参考）

${skillInjection}

### 技能使用要求：
1. **工具选择必须基于技能匹配度** - 优先使用技能系统推荐的工具
2. **参数设置参考技能建议** - 按照技能描述优化工具参数
3. **在思考中明确说明** - 必须解释如何利用技能系统指导

**违反后果**：如果忽略技能指导且无法合理解释，系统将强制重新规划
` : '';
        
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
        
        // 动态计划显示
        const planText = researchPlan ? this._formatResearchPlan(researchPlan, currentStep) : '';
        
        // 🎯 核心：使用模型自主评估的结果
        const currentStepPlan = researchPlan.research_plan.find(step => step.step === currentStep);
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

        const prompt = `
# 角色：${config.role}
${config.description}

${temporalGuidance}

${planText}

# 研究目标
**最终主题**：${topic}

# 可用工具
${availableToolsText}

${skillGuidanceSection}  // 🎯 新增技能指导部分

# 研究历史与观察
${formattedHistory}

# 🎯 核心决策框架（严格执行）

## 1. 状态评估
- 回顾研究计划，确认当前步骤：${currentStep}
- 评估已有信息是否足够回答当前子问题
- 检查信息缺口和需要验证的内容

## 2. 工具选择策略

### 🔍 tavily_search 使用时机：
- 探索新概念、寻找多个信息源
- 快速获取概况和背景信息  
- 关键词优化：使用更具体、更精准的搜索词

### 🕷️ crawl4ai 使用时机：
- 当搜索结果中出现权威来源时（百科、官方页面、深度文章）
- 需要获取完整内容而非摘要时
- 信息片段不足以回答深度问题时
- **必须参数**：{url: "具体的URL链接"}

${pythonDebuggingGuide}

${config.specialInstructions}

## 3. 动态调整权限
如果你发现：
- 新的重要研究方向未在计划中
- 当前计划步骤可以合并或优化
- 找到了更高效的信息获取路径

请在"思考:"部分明确提出调整建议。

## 4. 探索与学习新能力
在你已有的工具之外，你还拥有一个特殊的元工具 skill_search。

### ⚡️ skill_search 使用时机：
在你已有的工具之外，你还拥有一个特殊的元工具 skill_search，用于发现解决特定问题的新方法或更专业的工具。

### ⚡️ skill_search 使用时机：
- **场景一 (发现新任务类型):** 当你通过研究（例如 crawl4ai 或 tavily_search）发现了一个需要特定专业工具才能解决的新任务时（例如，分析图表、处理特定格式的文件等）。
- **场景二 (寻求最优解):** 当你感觉当前工具（尤其是 python_sandbox）虽然能完成任务但实现过程会非常复杂或低效时，你应该主动怀疑并查询是否有更直接、更专业的工具存在。

**使用流程与示例 (基于现有工具):**

1.  **识别问题**: 在"思考:"部分清晰地描述你遇到的挑战。
    *   **思考 (示例):** "我使用 crawl4ai 抓取了一个包含大量非结构化文本的网页。我需要从中提取所有AI模型的名称、参数量和发布日期，并整理成一个表格。虽然我**可以**尝试在 python_sandbox 中编写一个复杂的正则表达式脚本来解析这段文本，但这非常容易出错且效率低下。我想确认一下，系统里是否有一个专门用于'从文本中提取结构化信息'的更高级工具？"

2.  **调用 skill_search**: 将你的核心需求作为 query 参数，调用 skill_search 工具。
    *   **行动:** skill_search
    *   **行动输入:** {"query": "从非结构化文本中提取结构化数据"}

3.  **分析结果并行动**: skill_search 会返回最匹配的工具及其使用方法。
    *   **如果找到新工具**: "观察: skill_search 结果显示，存在一个名为 structured_data_extractor 的工具，它更适合此任务。我将在下一步中使用它。"
    *   **如果未找到**: "观察: skill_search 结果表明，目前没有更专业的工具。最佳实践仍然是使用 python_sandbox。建议在 Python 脚本中使用 re 或 pandas 库来提高解析的准确性和效率。我将采纳此建议，在下一步中编写一个更健壮的 Python 脚本。"

## 5. 终止条件
在你认为信息已经足够并准备生成最终答案之前，**你必须在"思考:"部分进行一次严格的自我评估**，并明确回答以下问题。只有所有问题的答案都是肯定的，你才能输出最终答案。

**思考 (示例):**
我已完成信息收集，现在进行最终检查：
1.  **核心问题回答完毕？** 是的，我已经收集了关于智谱和OpenAI旗舰模型的规格、性能和价格，足以回答用户的对比请求。
2.  **关键论点交叉验证？** 是的，关于GLM-4.6的性能数据，我从多个科技新闻网站获得了相似的报道，信息来源一致。
3.  **数据时效性确认？** 是的，我获取到的所有模型信息和性能数据都是基于2025年的最新发布，时效性很高。
所有检查项均已满足，我将开始撰写最终报告。

**最终答案:**
...

---
**检查清单**:
1.  **核心问题完整性**: 我是否已经明确回答了用户原始问题中的**每一个核心要点**？（例如，如果用户要求对比A和B，我是否同时拥有A和B的详细信息？）
2.  **关键论点可信度**: 我的每一个关键论点或数据点，是否都得到了**至少两个独立、可靠来源**的支持或交叉验证？
3.  **数据时效性**: 对于所有涉及时间敏感性的数据（如版本号、性能指标、价格、市场趋势），我是否已通过工具获取并确认了**这是当前最新的信息**？

${reportRequirements}

# 输出格式 (严格遵守，否则系统将无法解析)

## 如果需要继续研究：
思考: [基于研究计划的详细推理，包括当前步骤评估、信息缺口分析、工具选择理由]
行动: tool_name_here
行动输入: {"parameter_name": "parameter_value"}

## 如果研究完成：
思考: [判断研究完成的理由，信息完整性评估]
最终答案:
# 报告标题
## 章节一
内容...
## 章节二
内容...

## 🚫 严格禁止：
1. 不要在"思考"部分包含JSON代码块或工具调用格式
2. 不要在"行动输入"的JSON之外添加任何额外文本
3. 不要混合使用两种格式（要么全部工具调用，要么全部最终答案）
4. 最终答案必须是完整的Markdown报告，不要包含"思考"或"行动"部分

## ✅ 正确示例：
思考: 我已经收集了足够的信息...
最终答案:
# 我的研究报告
## 介绍
内容...

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

    // 🎯 格式化历史记录
    _formatHistory(intermediateSteps) {
        if (!intermediateSteps || intermediateSteps.length === 0) {
            return "这是研究的第一步，还没有历史记录。";
        }

        console.log(`[AgentLogic] 构建历史记录，步骤数: ${intermediateSteps.length}`);
        
        const formattedSteps = intermediateSteps.map((step, index) => {
            const toolName = step.action?.tool_name || 'unknown_action';
            const parameters = step.action?.parameters || {};
            
            const actionJson = JSON.stringify({
                tool_name: toolName,
                parameters: parameters
            }, null, 2);
            
            let thought = step.action?.thought;
            if (!thought) {
                if (toolName === 'self_correction') {
                    thought = '上一步格式错误，需要重新规划。';
                } else if (toolName === 'tavily_search') {
                    thought = `我需要搜索关于"${parameters.query || '相关主题'}"的更多信息。`;
                } else if (toolName === 'crawl4ai') {
                    thought = `我需要抓取网页"${parameters.url || '相关网页'}"来获取详细信息。`;
                } else {
                    thought = `我需要使用${toolName}工具来获取相关信息。`;
                }
            }
            
            return `## 步骤 ${index + 1}\n思考: ${thought}\n行动:\n\`\`\`json\n${actionJson}\n\`\`\`\n观察: ${step.observation}`;
        });
        
        const history = formattedSteps.join('\n\n');
        console.log(`[AgentLogic] 历史记录构建完成，总长度: ${history.length}`);
        
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