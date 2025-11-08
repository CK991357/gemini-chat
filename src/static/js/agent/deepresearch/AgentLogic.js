// src/static/js/agent/core/AgentLogic.js

/**
 * @class AgentLogic
 * @description 研究专用Agent思考核心，优化用于深度研究任务
 */
import { ObservationUtils } from '../utils/ObservationUtils.js';

export class AgentLogic {
    constructor(llm, tools, outputParser) {
        this.llm = llm;
        this.tools = tools;
        this.outputParser = outputParser;
        
        // 🎯 研究专用配置
        this.researchFocus = '';
        this.analysisDepth = 'standard';
    }

    /**
     * 🎯 研究专用规划方法
     */
    async plan(intermediateSteps, inputs, runManager) {
        const { userMessage, context } = inputs;
        
        // 🎯 提取研究上下文
        this._extractResearchContext(userMessage, context);
        
        // 🎯 构建研究专用提示词
        const prompt = this._constructResearchPrompt(userMessage, intermediateSteps, context);
        
        console.log(`[AgentLogic] 研究思考第 ${intermediateSteps.length + 1} 轮...`);

        try {
            // 🎯 思考开始事件
            await runManager?.callbackManager.invokeEvent('on_agent_think_start', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    researchFocus: this.researchFocus,
                    analysisDepth: this.analysisDepth
                }
            });

            // 🎯 调用LLM进行研究思考
            const llmResponse = await this.llm.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: context?.model || 'gpt-4', // 🎯 研究任务使用更强模型
                temperature: 0.1,
                max_tokens: 1200,
                research_context: {
                    focus: this.researchFocus,
                    depth: this.analysisDepth
                }
            }, context?.apiKey);

            if (!llmResponse || !llmResponse.choices || !llmResponse.choices[0]) {
                throw new Error("LLM返回无效研究响应");
            }

            const responseText = llmResponse.choices[0].message.content;
            
            // 🎯 思考结束事件
            await runManager?.callbackManager.invokeEvent('on_agent_think_end', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    response_preview: responseText.substring(0, 200) + '...',
                    researchFocus: this.researchFocus
                }
            });

            // 🎯 使用研究专用解析器
            const action = this.outputParser.parse(responseText);
            
            console.log(`[AgentLogic] 研究决策:`, {
                type: action.type,
                tool: action.tool_name,
                researchFocus: this.researchFocus
            });
            
            return action;

        } catch (error) {
            console.error(`[AgentLogic] 研究思考失败:`, error);
            
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    error: error.message,
                    researchFocus: this.researchFocus
                }
            });

            throw new Error(`研究思考失败: ${error.message}`);
        }
    }

    /**
     * 🎯 构建研究专用提示词
     */
    _constructResearchPrompt(userMessage, intermediateSteps, context) {
        const toolDescriptions = this._getResearchToolDescriptions();
        const researchStrategy = this._getResearchStrategy();

        let prompt = `你是一个专业研究助手，负责进行深度研究和综合分析。

研究主题: ${userMessage}
研究重点: ${this.researchFocus}
分析深度: ${this.analysisDepth}

可用研究工具:
${toolDescriptions}

研究策略:
${researchStrategy}

请严格按照研究格式响应：

思考: 分析当前研究进展，规划下一步研究行动。考虑信息缺口、可靠性验证和研究深度。
行动: 需要调用的工具名称
行动输入: 工具的输入参数(JSON格式)
最终答案: 完整的研究结论（当研究完成时）

重要指导原则:
1. 优先使用 crawl4ai 获取原始资料，确保信息准确性
2. 使用 tavily_search 进行信息检索和交叉验证
3. 对矛盾信息进行深入分析
4. 关注信息的时效性、权威性和相关性
5. 逐步构建完整的研究图景

`;

        // 🎯 添加压缩的研究历史
        if (intermediateSteps.length > 0) {
            prompt += "\n研究进展:\n";
            const compressedHistory = this._compressResearchHistory(intermediateSteps);
            compressedHistory.forEach((step, index) => {
                const status = step.observation.isError ? '❌' : '✅';
                prompt += `${index + 1}. ${step.action.tool_name} ${status}: ${step.summary}\n`;
            });
            
            prompt += `\n当前研究状态: 已完成 ${intermediateSteps.length} 步，收集 ${this._countSources(intermediateSteps)} 个来源\n`;
            prompt += "基于以上进展，请继续:\n";
        }

        prompt += "思考: ";
        
        return prompt;
    }

    /**
     * 🎯 获取研究工具描述
     */
    _getResearchToolDescriptions() {
        const researchTools = {
            'tavily_search': '🔍 智能搜索工具：获取最新信息、新闻和研究成果，支持关键词搜索和内容过滤',
            'crawl4ai': '🌐 网页抓取工具：提取网页内容、文章、报告等原始资料，支持深度内容解析',
            'python_sandbox': '📊 数据分析工具：执行数据分析、统计计算、可视化等研究任务'
        };

        return Object.entries(researchTools)
            .map(([name, desc]) => `- ${name}: ${desc}`)
            .join('\n');
    }

    /**
     * 🎯 获取研究策略
     */
    _getResearchStrategy() {
        const strategies = {
            'technology': '- 关注技术原理、实现方式、性能指标\n- 分析技术趋势和发展方向\n- 比较不同技术方案的优劣',
            'market': '- 分析市场规模、增长趋势、竞争格局\n- 研究用户需求、消费行为\n- 评估市场机会和风险',
            'trends': '- 识别当前和未来趋势\n- 分析驱动因素和影响\n- 预测发展趋势和时机',
            'comprehensive': '- 多角度全面分析\n- 交叉验证信息可靠性\n- 构建完整知识体系'
        };

        return strategies[this.researchFocus] || strategies['comprehensive'];
    }

    /**
     * 🎯 压缩研究历史
     */
    _compressResearchHistory(intermediateSteps) {
        // 🎯 只保留最近3个步骤的摘要
        return intermediateSteps.slice(-3).map(step => ({
            action: step.action,
            observation: step.observation,
            summary: this._summarizeStep(step)
        }));
    }

    /**
     * 🎯 步骤摘要
     */
    _summarizeStep(step) {
        const output = ObservationUtils.getOutputText(step.observation) || '';
        
        if (step.observation.isError) {
            return `执行失败: ${output.substring(0, 60)}...`;
        }
        
        switch (step.action.tool_name) {
            case 'tavily_search':
                return `搜索: ${output.substring(0, 80)}...`;
            case 'crawl4ai':
                return `抓取: ${output.substring(0, 80)}...`;
            case 'python_sandbox':
                return `分析: ${output.substring(0, 80)}...`;
            default:
                return `执行: ${output.substring(0, 80)}...`;
        }
    }

    /**
     * 🎯 计算来源数量
     */
    _countSources(intermediateSteps) {
        return intermediateSteps.filter(step => 
            !step.observation.isError && 
            ['tavily_search', 'crawl4ai'].includes(step.action.tool_name)
        ).length;
    }

    /**
     * 🎯 提取研究上下文
     */
    _extractResearchContext(userMessage, context) {
        // 🎯 从用户消息提取研究重点
        this.researchFocus = this._determineResearchFocus(userMessage);
        
        // 🎯 从上下文获取分析深度
        this.analysisDepth = context?.researchDepth || 'standard';
        
        console.log(`[AgentLogic] 研究上下文:`, {
            focus: this.researchFocus,
            depth: this.analysisDepth,
            message: userMessage.substring(0, 100)
        });
    }

    /**
     * 🎯 确定研究重点
     */
    _determineResearchFocus(userMessage) {
        const focusPatterns = {
            'technology': ['技术', '原理', '实现', '算法', '架构', '系统'],
            'market': ['市场', '商业', '竞争', '用户', '需求', '销售'],
            'trends': ['趋势', '发展', '未来', '预测', '方向', '前景'],
            'analysis': ['分析', '研究', '调查', '评估', '比较', '优劣']
        };

        const lowerMessage = userMessage.toLowerCase();
        
        for (const [focus, keywords] of Object.entries(focusPatterns)) {
            if (keywords.some(keyword => lowerMessage.includes(keyword))) {
                return focus;
            }
        }
        
        return 'comprehensive';
    }

    /**
     * 🎯 获取逻辑状态
     */
    getStatus() {
        return {
            researchFocus: this.researchFocus,
            analysisDepth: this.analysisDepth,
            availableTools: Object.keys(this.tools),
            researchTools: Object.keys(this.tools).filter(name => 
                ['tavily_search', 'crawl4ai', 'python_sandbox'].includes(name)
            ),
            type: 'research_agent_logic'
        };
    }
}
