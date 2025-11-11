// src/static/js/agent/deepresearch/AgentLogic.js - 关键词触发最终版

export class AgentLogic {
    constructor(chatApiHandler) {
        if (!chatApiHandler) {
            throw new Error("AgentLogic requires a valid chatApiHandler instance.");
        }
        this.chatApiHandler = chatApiHandler;
    }

    // ✨ 智能规划器 - 支持多种研究模式
    async createInitialPlan(topic, researchMode = 'standard') {
        const plannerPrompt = this._getPlannerPrompt(topic, researchMode);

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
            
            // 验证计划结构
            if (plan?.research_plan?.length > 0) {
                console.log(`[AgentLogic] 生成${researchMode}研究计划成功，共${plan.research_plan.length}个步骤`);
                return {
                    ...plan,
                    usage: llmResponse.usage // 🎯 新增：返回 token usage
                };
            }
            throw new Error('计划结构无效');
            
        } catch (error) {
            console.error('[AgentLogic] 规划失败，使用降级方案:', error);
            return this._createFallbackPlan(topic, researchMode);
        }
    }

    // ✨ 获取规划器提示词
    _getPlannerPrompt(topic, researchMode) {
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
你负责为复杂研究任务制定高效的研究策略。

# 核心指令
${config.instructions}

# 输出格式（严格JSON）
{
  "research_plan": [
    {
      "step": 1,
      "sub_question": "需要回答的关键问题",
      "initial_queries": ["关键词1", "关键词2"],
      "depth_required": "浅层概览|中层分析|深度挖掘",
      "expected_tools": ["tavily_search", "crawl4ai"]
    }
  ],
  "estimated_iterations": ${config.iterations},
  "risk_assessment": "${config.risk}",
  "research_mode": "${researchMode}"
}

# 研究主题
"${topic}"

现在生成研究计划：`;
    }

    // ✨ 降级方案 - 支持所有模式
    _createFallbackPlan(topic, researchMode = 'standard') {
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

        return fallbackPlans[researchMode] || fallbackPlans.standard;
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
            researchMode: detectedMode
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

    // ✨ 重构：主提示词构建
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1, researchMode = 'standard' }) {
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // 动态计划显示
        const planText = researchPlan ? this._formatResearchPlan(researchPlan, currentStep) : '';
        
        // 🎯 根据模式选择不同的配置
        const modeConfigs = {
            deep: {
                role: "深度研究专家",
                description: "你是一个专业的研究专家和问题解决顾问。你的任务是为复杂的用户查询提供深度、全面且专业的分析报告。",
                specialInstructions: `
### 🎯 深度研究特别指导：
- **多源验证**：每个关键论点至少需要2个独立来源验证
- **权威优先**：优先搜索学术论文、行业报告、官方数据
- **辩证思考**：主动寻找反对观点和局限性分析
- **深度挖掘**：不要停留在表面信息，深入探索底层机制`,
                reportRequirements: `
## 5. 最终报告要求（深度研究模式）

**核心章节**：
# 主标题
## 问题解构与分析
## 多维度深度探索（至少从技术、实践、历史三个维度）
## 权威验证与专业深化  
## 辩证解决方案（至少3个可行方案+反对观点）
## 创新建议与执行路径

**质量要求**：
- 字数：2500-3500字
- 内容：深度、全面、专业、辩证
- 风格：专业术语但易于理解，**加粗**关键结论
- 引用：所有关键数据必须验证并标注来源[1][2]
- 深度标准：至少两个分析层次，数据支撑的论点，创新性见解`
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
- **价值分析**：考虑性价比、保值率和投资价值`,
                reportRequirements: `
## 5. 最终报告要求（奢侈品导购模式）

**核心章节**：
# 商品深度对比分析
## 对比商品基本信息
## 核心参数详细对比
## 性能与使用体验
## 成分与工艺深度解析
## 市场表现与口碑
## 价值评估与购买建议

**质量要求**：
- 字数：2000-3000字
- 内容：专业细致、数据驱动、实用导向
- 风格：客观专业，避免商业吹捧
- 引用：基于权威商品信息和真实用户反馈`
            },
            academic: {
                role: "学术论文分析专家",
                description: "你是一个严谨的学术论文分析专家，擅长深度解析论文核心价值并进行验证扩展。",
                specialInstructions: `
### 🎓 学术研究特别指导：
- **文献严谨**：优先引用权威学术来源和期刊论文
- **方法论**：关注研究设计、数据收集和分析方法
- **理论框架**：注重理论支撑和概念清晰度
- **引用规范**：严格按照学术引用格式`,
                reportRequirements: `
## 5. 最终报告要求（学术论文模式）

**核心章节**：
# 标题
## 摘要
## 引言与研究背景
## 文献综述
## 方法论
## 分析与讨论
## 结论
## 参考文献

**质量要求**：
- 字数：2500-3500字
- 内容：学术严谨、逻辑清晰、论证充分
- 风格：正式学术语言，避免口语化
- 引用：严格标注来源，使用标准引用格式`
            },
            business: {
                role: "行业分析专家",
                description: "你是一个资深的行业分析师，擅长全景扫描行业现状、分析竞争格局和预测发展趋势。",
                specialInstructions: `
### 💼 商业分析特别指导：
- **市场导向**：关注市场规模、增长趋势和用户需求
- **竞争意识**：分析竞争对手和差异化优势
- **可行性**：评估技术可行性和商业可行性
- **ROI思维**：关注投资回报和商业价值`,
                reportRequirements: `
## 5. 最终报告要求（商业分析模式）

**核心章节**：
# 执行摘要
## 市场分析
## 竞争格局
## 机会与挑战
## 战略建议
## 财务影响
## 实施路线图

**质量要求**：
- 字数：1500-2500字
- 内容：商业洞察、数据支撑、可行性分析
- 风格：专业但易懂，突出关键商业价值
- 引用：市场数据必须标注来源`
            },
            technical: {
                role: "技术实现专家",
                description: "你是一个资深的技术架构师，擅长提供完整的技术实现方案和最佳实践指南。",
                specialInstructions: `
### 🛠️ 技术研究特别指导：
- **技术深度**：深入技术细节和实现机制
- **架构思维**：关注系统架构和组件设计
- **性能意识**：评估性能指标和优化空间
- **实践导向**：提供可落地的技术方案`,
                reportRequirements: `
## 5. 最终报告要求（技术文档模式）

**核心章节**：
# 技术概述
## 架构设计
## 核心组件
## 实现细节
## 性能评估
## 最佳实践
## 故障排除

**质量要求**：
- 字数：1800-2800字
- 内容：技术准确、细节丰富、方案可行
- 风格：技术专业但不晦涩，代码示例清晰
- 引用：技术规格和性能数据必须验证`
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
- **风险评估**：预测技术成熟度和潜在的伦理/安全风险`,
                reportRequirements: `
## 5. 最终报告要求（前沿技术模式）

**核心章节**：
# 前沿技术深度分析报告
## 技术概述与核心原理
## 关键挑战与突破性进展
## 潜在应用场景与商业价值
## 行业生态与竞争格局
## 发展趋势与风险预测

**质量要求**：
- 字数：2000-3000字
- 内容：前瞻性、技术深度、市场洞察
- **风格**：专业、富有远见，突出创新点
- 引用：新兴技术报告和权威专家观点`
            },
            standard: {
                role: "策略型AI研究专家",
                description: "你是一个高效、精准的研究专家，擅长使用多种工具组合来获取深度信息。",
                specialInstructions: '',
                reportRequirements: `
## 5. 最终报告要求
**结构**：
# 主标题
## 一、引言与背景
## 二、核心内容分析（至少3个子部分）
## 三、深度洞察与总结
## 四、资料来源

**质量要求**：
- 字数：800-1200字
- 内容：全面、准确、深度
- 风格：专业、客观、信息密集
- 引用：关键信息标注来源[1][2]`
            }
        };

        const config = modeConfigs[researchMode] || modeConfigs.standard;

        const prompt = `
# 角色：${config.role}
${config.description}

${planText}

# 研究目标
**最终主题**：${topic}

# 可用工具
${availableToolsText}

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

${config.reportRequirements}

# 输出格式 (严格遵守)

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

重要说明：
- 不要使用 Markdown 代码块包裹输出
- "行动" 和 "行动输入" 必须分开在两行
- JSON 参数必须有效且格式正确
- 最终答案必须是完整的Markdown报告

现在开始决策：`;

        return prompt;
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