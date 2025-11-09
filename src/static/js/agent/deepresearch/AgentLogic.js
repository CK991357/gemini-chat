// src/static/js/agent/deepresearch/AgentLogic.js - 规划-执行-调整模式版本

export class AgentLogic {
    constructor(chatApiHandler) {
        if (!chatApiHandler) {
            throw new Error("AgentLogic requires a valid chatApiHandler instance.");
        }
        this.chatApiHandler = chatApiHandler;
    }

    // ✨ 新增：智能规划器 - 使用更强的模型生成结构化研究计划
    async createInitialPlan(topic) {
        const plannerPrompt = `
# 角色：顶级AI研究策略师
你负责为复杂研究任务制定高效的研究策略。

# 核心指令
1. 将研究主题分解为3-5个逻辑连贯的研究步骤
2. 每个步骤必须解决一个明确的子问题
3. 为每个步骤提供1-2个精准的搜索关键词
4. 预估每个步骤所需的信息深度（浅层概览/中层分析/深度挖掘）

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
  "estimated_iterations": 4,
  "risk_assessment": "低|中|高"
}

# 研究主题
"${topic}"

现在生成研究计划：`;

        try {
            const llmResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: plannerPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025', // 使用最强模型规划
                temperature: 0.1,
            });

            const responseText = llmResponse?.choices?.[0]?.message?.content || '{}';
            
            // 增强JSON解析容错
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
            const plan = JSON.parse(jsonMatch[1]);
            
            // 验证计划结构
            if (plan?.research_plan?.length > 0) {
                console.log(`[AgentLogic] 生成研究计划成功，共${plan.research_plan.length}个步骤`);
                return plan;
            }
            throw new Error('计划结构无效');
            
        } catch (error) {
            console.error('[AgentLogic] 规划失败，使用降级方案:', error);
            return this._createFallbackPlan(topic);
        }
    }

    // ✨ 新增：降级方案 - 确保系统鲁棒性
    _createFallbackPlan(topic) {
        return {
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
            risk_assessment: "低"
        };
    }

    async plan(inputs, runManager) {
        const { topic, intermediateSteps, availableTools, researchPlan } = inputs;
        
        // 动态计算当前步骤
        const currentStep = this._determineCurrentStep(researchPlan, intermediateSteps);
        
        const prompt = this._constructFinalPrompt({
            topic,
            intermediateSteps, 
            availableTools,
            researchPlan,
            currentStep
        });
        
        console.log('[AgentLogic] 构建的提示词长度:', prompt.length);
        console.log('[AgentLogic] 提示词结尾部分:', prompt.substring(prompt.length - 500));
        
        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { 
            run_id: runManager.runId,
            data: { 
                prompt_length: prompt.length,
                current_step: currentStep,
                total_steps: researchPlan?.research_plan?.length || '未知'
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
                    current_step: currentStep
                } 
            });
            
            return responseText;

        } catch (error) {
            console.error("[AgentLogic] LLM 思考失败:", error);
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', { 
                run_id: runManager.runId, 
                data: { error: error.message } 
            });
            
            // 返回一个格式正确的错误响应
            return `思考: 发生内部错误，无法继续规划。错误信息: ${error.message}\n最终答案: 研究因内部错误终止。`;
        }
    }

    // ✨ 重构：强化版主提示词构建
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1 }) {
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // 动态计划显示 - 突出当前步骤
        const planText = researchPlan ? this._formatResearchPlan(researchPlan, currentStep) : '';
        
        // ✨ 关键优化：强化策略指导的提示词
        const prompt = `
# 角色：策略型AI研究专家
你是一个高效、精准的研究专家，擅长使用多种工具组合来获取深度信息。

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
- **示例**："摇滚红与黑 剧情分析" 而非 "摇滚红与黑"

### 🕷️ crawl4ai 使用时机：
- 当搜索结果中出现权威来源时（百科、官方页面、深度文章）
- 需要获取完整内容而非摘要时
- 信息片段不足以回答深度问题时
- **必须参数**：{url: "具体的URL链接"}
- **禁止**：对每个链接都使用爬虫

### 💻 python_sandbox 使用时机：
- 需要数据处理、计算或分析时
- 生成图表或进行复杂计算时

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

## 5. 最终报告要求
**结构**：
# 主标题
## 一、引言与背景
## 二、核心内容分析（至少2个子部分）
## 三、深度洞察与总结
## 四、资料来源

**质量要求**：
- 字数：800-1200字
- 内容：全面、准确、深度
- 风格：专业、客观、信息密集
- 引用：关键信息标注来源[1][2]

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

    // ✨ 新增：格式化研究计划，突出当前步骤
    _formatResearchPlan(plan, currentStep) {
        return `
# 📋 研究计划（当前步骤：${currentStep}）
${plan.research_plan.map(item => 
    item.step === currentStep ? 
    `✅ **步骤 ${item.step}（进行中）**: ${item.sub_question}` :
    `▢ 步骤 ${item.step}: ${item.sub_question}`
).join('\n')}

**预计总迭代**: ${plan.estimated_iterations} 次
**复杂度评估**: ${plan.risk_assessment}
`;
    }

    // ✨ 新增：步骤追踪逻辑
    _determineCurrentStep(plan, history) {
        if (!plan || !history || history.length === 0) return 1;
        
        const completedSteps = plan.research_plan.filter(step => 
            this._isStepCompleted(step, history)
        ).length;
        
        return Math.min(completedSteps + 1, plan.research_plan.length);
    }

    _isStepCompleted(step, history) {
        // 基于历史判断步骤是否完成（简化版）
        const stepKeywords = step.sub_question.toLowerCase().split(' ');
        const recentActions = history.slice(-3).join(' ').toLowerCase();
        
        return stepKeywords.some(keyword => 
            recentActions.includes(keyword) && 
            history.some(entry => entry.includes('最终答案') || entry.includes('足够信息'))
        );
    }

    // 🎯 重构：格式化历史记录
    _formatHistory(intermediateSteps) {
        if (!intermediateSteps || intermediateSteps.length === 0) {
            return "这是研究的第一步，还没有历史记录。";
        }

        console.log(`[AgentLogic] 构建历史记录，步骤数: ${intermediateSteps.length}`);
        
        // 🎯 关键修复：构建包含完整"思考->行动->观察"链条的历史记录
        const formattedSteps = intermediateSteps.map((step, index) => {
            const toolName = step.action?.tool_name || 'unknown_action';
            const parameters = step.action?.parameters || {};
            
            const actionJson = JSON.stringify({
                tool_name: toolName,
                parameters: parameters
            }, null, 2);
            
            // 🎯 使用保存的思考过程，如果不存在则提供智能默认值
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

    // 🎯 新增：格式化工具描述
    _formatTools(availableTools) {
        if (!availableTools || availableTools.length === 0) {
            return "暂无可用工具";
        }
        
        return availableTools
            .map(tool => `  - ${tool.name}: ${tool.description}`)
            .join('\n');
    }
}