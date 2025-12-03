// src/static/js/agent/deepresearch/AgentLogic.js - 修复crawl4ai参数匹配版

// 🎯 核心修改：导入 ReportTemplates 中的工具函数
import { getTemplatePromptFragment } from './ReportTemplates.js';

// --- crawl4ai 模式感知优化策略：第一层 (通用核心原则) ---
const universalCrawlPrinciples = `
## 🌐 通用网页抓取核心原则（所有模式共享）

### 🎯 核心目标：质量 > 数量
- **研究目的**：获取**深度信息**，不是收集大量页面
- **成功标准**：抓取到**有实质内容的页面**，不是简单的页面加载成功

### 📊 URL 质量评估体系（通用）
**高质量URL特征（优先选择）：**
1. **新闻报道/深度文章**：URL包含 \`/news/\`、\`/article/\`、\`/blog/\`、\`/posts/\`
2. **静态HTML页面**：URL以 \`.html\` 结尾，参数简单
3. **权威媒体**：知名媒体（OSCHINA、InfoQ、36kr、CSDN、知乎专栏）
4. **发布时间近**：包含 \`2024\`、\`2025\` 等年份，或 \`latest\`、\`recently\`

**低质量URL特征（避免选择）：**
1. **文档模板页面**：URL包含 \`docs.\`、\`api-docs.\`、\`/docs/\`、\`/guide/\`
2. **动态查询页面**：URL包含 \`?query=\`、\`search=\`、\`database=\`
3. **用户交互页面**：URL包含 \`login\`、\`signin\`、\`dashboard\`、\`account\`
4. **侧边栏/导航页**：页面标题模糊（"首页"、"文档"、"目录"）

### 🔄 智能模式选择决策树（通用）
\`\`\`
IF (高质量URL数量 == 1) THEN
    → 使用 \`scrape\` 模式（专注深度）
ELSE IF (高质量URL数量 2-4) THEN
    → 使用 \`batch_crawl\` 模式（效率平衡）
ELSE IF (需要验证多个相似页面) THEN
    → 使用 \`batch_crawl\`，但限制最多3个URL
ELSE
    → 优先使用 \`scrape\` 抓取最重要的1个URL
END IF
\`\`\`
`;

// --- crawl4ai 模式感知优化策略：第二层 (模式特定的优化策略) ---
const getModeSpecificCrawlStrategy = (researchMode) => {
    const strategies = {
        // 🔥 深度研究模式
        deep: `
## 🔬 深度研究模式专用策略

### 抓取深度要求：
1. **多角度验证**：每个核心观点至少需要2个独立来源
2. **权威优先**：优先抓取学术论文、行业报告、官方数据
3. **辩证思维**：主动寻找反对观点和局限性分析

### 最佳实践：
- 使用 \`batch_crawl\` 同时抓取**正反双方**的权威观点
- 优先选择第三方深度分析，避免官方宣传稿
- 对技术参数、性能数据必须抓取原始来源

### 质量检查清单：
- [ ] 是否包含至少1个学术来源（论文、研究报告）
- [ ] 是否包含至少1个行业深度分析
- [ ] 是否包含技术细节和量化数据
- [ ] 是否有不同观点的对比分析
`,

        // 💼 行业分析模式
        business: `
## 📈 行业分析模式专用策略

### 数据要求：
1. **时效性优先**：必须使用最新季度/年度数据
2. **权威来源**：优先统计局、行业协会、上市公司财报
3. **量化分析**：必须有具体数字支撑（市场规模、增长率、份额）

### URL选择优先级：
🥇 **1. 官方统计数据**：统计局、行业协会官网
🥈 **2. 上市公司财报**：交易所、公司投资者关系页面
🥉 **3. 行业研究报告**：第三方研究机构报告
🔍 **4. 行业新闻报道**：权威媒体报道

### 避坑指南：
- ❌ 避开"软文"和"营销内容"
- ❌ 避开没有数据支撑的"观点文章"
- ❌ 避开过时信息（超过1年的市场数据）
`,

        // 📚 学术论文模式
        academic: `
## 🎓 学术论文模式专用策略

### 抓取重点：
1. **论文原文**：优先 arXiv、Google Scholar、会议官网
2. **技术细节**：方法部分、实验设置、结果数据
3. **相关工作**：引用的关键论文和技术对比

### 最佳实践：
- **PDF处理策略（曲线救国）**：**严禁**直接抓取以 \`.pdf\` 结尾的URL。
- **替代方案**：如果搜索结果是PDF链接，必须尝试寻找其**摘要页/HTML版本**（例如，arXiv的 \`/abs/\` 页面）。
- 对综述文章，抓取 **参考文献列表** 和 **对比表格**
- 对实验论文，重点关注 **数据集** 和 **评估指标**

### 学术严谨性：
- 必须验证论文的**发表时间**和**会议/期刊级别**
- 对关键技术声称，必须追溯到**原始论文**
- 避免引用未经同行评审的"预印本"作为最终结论
`,

        // 🛠️ 技术方案模式
        technical: `
## ⚙️ 技术方案模式专用策略

### 抓取目标：
1. **最佳实践文档**：官方文档、技术博客、案例研究
2. **架构设计**：系统架构图、设计模式说明
3. **实现指南**：部署文档、配置说明、排错指南

### URL类型偏好：
✅ **技术博客**：medium.com、dev.to、公司技术博客
✅ **开源项目文档**：GitHub README、Wiki、官方文档
✅ **架构案例**：技术会议演讲材料、架构师博客

### 质量判断：
- 优先选择**有代码示例**的技术文章
- 优先选择**有架构图**的设计文档
- 优先选择**有实际案例**的最佳实践指南
`,

        // 🛍️ 购物导购模式
        shopping_guide: `
## 🛒 购物导购模式专用策略

### 信息需求：
1. **产品规格**：详细参数、成分、材质
2. **用户评价**：真实使用体验、优缺点
3. **专业评测**：权威机构评测、对比分析

### 来源优先级：
🥇 **1. 官方产品页面**：规格最准确
🥈 **2. 专业评测网站**：Consumer Reports、专业媒体评测
🥉 **3. 用户评论聚合**：亚马逊、京东、小红书
🔍 **4. 社交媒体讨论**：Reddit、知乎、专业论坛

### 可信度判断：
- 警惕"赞助内容"和"推广软文"
- 优先有**实测数据**的评测
- 关注**长期使用**的用户反馈
`,


        // 🛠️ 标准调试模式
        standard: `
## 🔍 调试/审计模式专用策略

### 抓取目的：
1. **系统诊断**：验证工具调用是否正常
2. **性能分析**：测量抓取成功率和响应时间
3. **错误复现**：捕获和记录抓取失败的具体原因

### 日志详细要求：
- 必须记录每个URL的**完整抓取参数**
- 必须记录**响应时间**和**内容长度**
- 必须记录**失败原因**（超时、反爬虫、JS渲染等）

### 测试策略：
- 故意测试**不同类型的URL**以验证系统鲁棒性
- 记录**相同URL在不同时间的抓取结果**以检测变化
- 对比 \`scrape\` 和 \`batch_crawl\` 在相同URL上的表现
`
    };

    return strategies[researchMode] || strategies.deep;
};

// --- crawl4ai 模式感知优化策略：第三层 (智能恢复协议) ---
const getModeSpecificRecoveryProtocol = (researchMode) => {
    const protocols = {
        deep: `
## 🔄 深度研究恢复协议

**失败处理策略：**
1. **第一次失败**：切换到同主题的不同来源（不同媒体）
2. **第二次失败**：降低信息要求，使用现有信息继续研究
3. **第三次失败**：重新评估研究计划，可能调整研究方向

**学习机制：**
- 记录哪些**域名**容易失败（如官方文档站）
- 记录哪些**页面类型**质量低（如模板页）
- 在后续研究中主动避开已知问题源
`,

        business: `
## 📉 商业分析恢复协议

**数据缺失处理：**
1. **关键数据缺失**：寻找替代指标或估算方法
2. **过时数据**：明确标注数据时间，并说明局限性
3. **矛盾数据**：分析矛盾原因，给出可能范围

**时效性保障：**
- 如果无法获取最新数据，**必须明确说明**
- 提供**历史趋势**作为参考
- 建议**关注即将发布的数据**
`,

        academic: `
## 📚 学术分析恢复协议

**信息缺失处理：**
1. **PDF抓取失败/规避后**：如果无法获取论文的HTML/摘要页，或者抓取PDF失败（如500错误），**必须**切换到使用 \`tavily_search\` 搜索论文的**摘要、技术博客解析**或**会议演讲稿**作为替代。
2. **实验数据缺失**：寻找**复现项目**或**第三方验证报告**
3. **技术细节模糊**：搜索**作者的GitHub**或**相关讨论论坛**

**严谨性保障：**
- 任何替代来源必须在报告中**明确标注**其非原始性
- 避免基于不完整信息进行批判性评估
`,

        technical: `
## ⚙️ 技术方案恢复协议

**信息缺失处理：**
1. **最佳实践缺失**：从**官方文档**和**社区问答**中提炼通用原则
2. **架构图缺失**：基于文本描述，在思考中**自主构建**一个简化的架构图（不输出，仅用于指导下一步）
3. **选型依据不足**：搜索**技术对比文章**和**性能基准测试**

**可行性保障：**
- 优先保证方案的**稳定性**和**可落地性**
- 避免推荐**未经生产环境验证**的新兴技术
`,

        shopping_guide: `
## 🛍️ 购物导购恢复协议

**信息缺失处理：**
1. **产品规格缺失**：尝试搜索**第三方电商平台**或**专业评测网站**的规格表
2. **用户评价不足**：扩大搜索范围到**不同社交媒体平台**（如Reddit、小红书、知乎）
3. **专业评测缺失**：寻找**同品牌/同系列**产品的评测作为参考

**个性化保障：**
- 即使信息不完整，也必须基于现有信息给出**明确的购买建议**
- 明确指出**信息缺口**对建议的影响
`,


        standard: `
## 🔍 标准研究恢复协议

**失败处理策略：**
1. **第一次失败**：切换到同主题的不同来源
2. **第二次失败**：重新评估搜索关键词，尝试更宽泛的查询
3. **第三次失败**：使用现有信息继续研究

**学习机制：**
- 记录失败的 URL 和原因
- 避免在后续步骤中重复使用失败的策略
`
    };

    return protocols[researchMode] || protocols.deep;
};
export class AgentLogic {
    constructor(chatApiHandler) {
        if (!chatApiHandler) {
            throw new Error("AgentLogic requires a valid chatApiHandler instance.");
        }
        this.chatApiHandler = chatApiHandler;
    }
    // 🎯 新增：模式专用的质量检查清单
    _getModeQualityChecklist(researchMode) {
        const checklists = {
            deep: `
### 深度研究质量检查：
- [ ] 是否进行了多角度验证？
- [ ] 是否包含辩证分析？
- [ ] 是否有足够的权威来源？
- [ ] 技术细节是否充分？
- [ ] 是否有创新性见解？
`,

            business: `
### 商业分析质量检查：
- [ ] 数据是否是最新的？
- [ ] 是否有量化分析？
- [ ] 竞争分析是否充分？
- [ ] 风险识别是否全面？
- [ ] 投资建议是否具体？
`,

            academic: `
### 学术分析质量检查：
- [ ] 技术描述是否准确？
- [ ] 实验验证是否充分？
- [ ] 引用是否规范？
- [ ] 批判性思考是否到位？
- [ ] 学术价值是否明确？
`,

            technical: `
### 技术方案质量检查：
- [ ] 需求分析是否清晰？
- [ ] 架构设计是否合理？
- [ ] 技术选型是否有依据？
- [ ] 实施路径是否可行？
- [ ] 风险识别是否全面？
`,

            shopping_guide: `
### 购物导购质量检查：
- [ ] 产品规格是否准确？
- [ ] 用户评价是否真实？
- [ ] 专业评测是否全面？
- [ ] 购买建议是否明确？
- [ ] 价值分析是否充分？
`,


            standard: `
### 标准研究质量检查：
- [ ] 是否完成了所有计划步骤？
- [ ] 关键问题是否得到回答？
- [ ] 信息来源是否权威？
- [ ] 报告结构是否清晰？
- [ ] 结论是否明确？
`
        };
        
        return checklists[researchMode] || checklists.deep;
    }

    // 🎯 新增：模式感知的抓取策略生成器
    _getModeAwareCrawlStrategy(researchMode) {
        const universal = universalCrawlPrinciples;
        const modeSpecific = getModeSpecificCrawlStrategy(researchMode);
        const recoveryProtocol = getModeSpecificRecoveryProtocol(researchMode);
        
        return `
${universal}

${modeSpecific}

## 🛠️ 智能恢复与学习
${recoveryProtocol}

## 📊 质量检查清单（模式专用）
${this._getModeQualityChecklist(researchMode)}
`;
    }

    // ✨ 智能规划器 - 支持多种研究模式
    async createInitialPlan(topic, researchMode = 'standard', currentDate, retryCount = 0) {
        const MAX_RETRIES = 2;
        const plannerPrompt = this._getPlannerPrompt(topic, researchMode, currentDate);

        try {
            const llmResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: plannerPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.1,
            });

            const responseText = llmResponse?.choices?.[0]?.message?.content || '{}';

            // 增强JSON解析容错与一次重试
            const tryParseJson = (text) => {
                if (!text || typeof text !== 'string') return null;
                // 1) 直接尝试 JSON.parse
                try {
                    return JSON.parse(text);
                } catch (_e) { /* ignore parse error */ }

                // 2) 提取 ```json ``` 代码块内容
                const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                if (jsonBlock && jsonBlock[1]) {
                    try {
                        return JSON.parse(jsonBlock[1].trim());
                    } catch (_e) { /* ignore parse error */ }
                }

                // 3) 提取第一个最外层的花括号块
                const braceMatch = text.match(/\{[\s\S]*\}/);
                if (braceMatch) {
                    try {
                        return JSON.parse(braceMatch[0]);
                    } catch (_e) { /* ignore parse error */ }
                }

                // 4) 尝试从第一个"{"到最后一个"}"之间的子串
                const first = text.indexOf('{');
                const last = text.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    const candidate = text.slice(first, last + 1);
                    try {
                        return JSON.parse(candidate);
                    } catch (_e) { /* ignore parse error */ }
                }

                return null;
            };

            let plan = tryParseJson(responseText);

            // 如果首次解析失败，向模型请求一次仅返回纯 JSON 的重试
            if (!plan) {
                try {
                    console.warn('[AgentLogic] 初始JSON解析失败，尝试请求模型返回纯JSON重试');
                    const repairPrompt = `请将下面的文本仅以严格的JSON格式返回（不要加任何解释、代码块标记或多余文本）。\n\n原始输出:\n\n${responseText.substring(0, 20000)}`;

                    const repairResp = await this.chatApiHandler.completeChat({
                        messages: [{ role: 'user', content: repairPrompt }],
                        model: 'gemini-2.5-flash-preview-09-2025',
                        temperature: 0.0,
                    });

                    const repairText = repairResp?.choices?.[0]?.message?.content || '';
                    plan = tryParseJson(repairText);
                } catch (e) {
                    console.warn('[AgentLogic] 请求模型重试时发生错误:', e?.message || e);
                }
            }

            if (!plan) {
                console.warn('[AgentLogic] JSON解析失败，使用降级方案');
                return this._createFallbackPlan(topic, researchMode, currentDate);
            }
            
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
            console.error(`[AgentLogic] 规划失败 (尝试 ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
            
            if (retryCount < MAX_RETRIES) {
                // 添加重试延迟
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.createInitialPlan(topic, researchMode, currentDate, retryCount + 1);
            } else {
                console.warn('[AgentLogic] 达到最大重试次数，使用降级方案');
                return this._createFallbackPlan(topic, researchMode, currentDate);
            }
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
                role: "行业投资分析专家",
                instructions: `1. 将行业分析分解为4-6个核心研究步骤
2. 必须包含：市场规模验证、产业链解构、竞争格局量化、投资风险评估
3. 每个步骤聚焦一个明确的分析维度
4. 强调数据时效性、量化分析和投资视角
5. 确保覆盖：市场、产业链、竞争、风险、机会全维度`,
                iterations: 6,
                risk: "中|高"
            },
            technical: {
                role: "企业级技术方案架构师",
                instructions: `1. 将企业级需求分解为5个研究指引步骤
2. 每个步骤必须产出明确的研究成果和架构指引
3. 为每个步骤提供2-3个精准的研究关键词
4. 预估每个步骤所需的研究深度（需求分析/案例研究/技术验证）
5. 确保覆盖：需求标准化、架构设计、技术选型、实施指引、风险评估`,
                iterations: 6,
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

## 🚨 严格输出格式要求
**你的响应必须是且只能是有效的JSON格式，不要包含任何其他文本。**

### 禁止行为：
- ❌ 不要在JSON外添加解释性文字
- ❌ 不要使用代码块标记
- ❌ 不要包含思考过程或额外说明

### 正确示例：
{"research_plan": [{"step": 1, "sub_question": "问题", "initial_queries": ["关键词"], "depth_required": "浅层概览", "expected_tools": ["tavily_search"], "temporal_sensitivity": "中"}]}

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

# 输出格式（严格JSON，不要其他内容）
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

现在生成JSON：`;
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
                        sub_question: `获取"${topic}"最新市场规模、增长率和全球对比数据`,
                        initial_queries: [
                            `${topic} 2025年 市场规模`,
                            `${topic} 增长率 CAGR`,
                            `${topic} 全球市场 对比`
                        ],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高"
                    },
                    {
                        step: 2,
                        sub_question: "深度分析产业链结构和各环节价值分布",
                        initial_queries: [
                            `${topic} 产业链 结构`,
                            `${topic} 上中下游 企业`,
                            `${topic} 毛利率 各环节`
                        ],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 3,
                        sub_question: "量化分析竞争格局和主要参与者战略",
                        initial_queries: [
                            `${topic} 市场竞争格局`,
                            `${topic} 市场份额 CR3 CR5`,
                            `${topic} 头部企业 战略`
                        ],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高"
                    },
                    {
                        step: 4,
                        sub_question: "识别核心驱动因素和主要风险",
                        initial_queries: [
                            `${topic} 政策驱动 因素`,
                            `${topic} 技术突破 影响`,
                            `${topic} 投资风险 预警`
                        ],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "高"
                    },
                    {
                        step: 5,
                        sub_question: "评估投资价值和识别具体机会",
                        initial_queries: [
                            `${topic} 投资价值 评估`,
                            `${topic} 细分机会 领域`,
                            `${topic} 估值水平 参考`
                        ],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "中"
                    },
                    {
                        step: 6,
                        sub_question: "综合趋势预测和投资策略建议",
                        initial_queries: [
                            `${topic} 发展趋势 预测`,
                            `${topic} 投资策略 建议`,
                            `${topic} 实施路径 规划`
                        ],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "中"
                    }
                ],
                estimated_iterations: 6,
                risk_assessment: "中",
                research_mode: "business",
                // 🔥 添加时效性评估
                temporal_awareness: {
                    assessed: true,
                    overall_sensitivity: "高", // 行业分析对时效性要求极高
                    current_date: currentDate,
                    is_fallback: true
                }
            },
            technical: {
                research_plan: [
                    {
                        step: 1,
                        sub_question: "需求标准化：将用户自然语言描述转化为结构化需求规格文档",
                        initial_queries: ["需求规格说明书模板", "用户故事映射方法", "功能需求分析框架"],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "低",
                        // 明确交付物：标准化的需求文档
                        deliverables: "结构化需求规格书"
                    },
                    {
                        step: 2,
                        sub_question: "案例研究：搜索同类优秀项目的最佳实践和架构模式",
                        initial_queries: ["类似项目架构设计", "行业最佳实践案例", "成功项目技术分析"],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高",
                        deliverables: "案例分析与借鉴报告"
                    },
                    {
                        step: 3,
                        sub_question: "技术架构设计：基于需求和研究确定最优架构方案",
                        initial_queries: ["系统架构设计原则", "前后端分离架构", "微服务 vs 单体"],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高",
                        deliverables: "架构设计方案"
                    },
                    {
                        step: 4,
                        sub_question: "技术栈选型：确定最稳定、最适合的技术版本组合",
                        initial_queries: ["技术栈稳定性分析", "LTS版本对比", "生产环境最佳实践"],
                        depth_required: "深度挖掘",
                        expected_tools: ["tavily_search", "crawl4ai"],
                        temporal_sensitivity: "高",
                        deliverables: "技术栈选型指南"
                    },
                    {
                        step: 5,
                        sub_question: "落地实施指引：制定完整的项目结构和实施路线图",
                        initial_queries: ["项目结构最佳实践", "部署架构设计", "开发环境配置"],
                        depth_required: "中层分析",
                        expected_tools: ["tavily_search"],
                        temporal_sensitivity: "中",
                        deliverables: "落地实施指南"
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
        const { topic, intermediateSteps, availableTools, researchPlan, researchMode = 'standard', forceNativeVision = false, dataBus } = inputs; // 🎯 核心修改：接收 dataBus
        
        // 🎯 关键词检测逻辑
        const detectedMode = researchMode; // 直接使用传入的、正确的模式！
        
        // 动态计算当前步骤
        const currentStep = this._determineCurrentStep(researchPlan, intermediateSteps);
        
        // 🎯 核心新增：生成数据总线摘要和相似性检测
        const dataBusSummary = this._generateDataBusSummary(dataBus, currentStep);
        const similarityDetection = this._buildSimilarityDetectionSystem(researchPlan, intermediateSteps, currentStep);

        const prompt = this._constructFinalPrompt({
            topic,
            intermediateSteps,
            availableTools,
            researchPlan,
            currentStep,
            researchMode: detectedMode,
            currentDate: new Date().toISOString(), // 添加当前日期
            forceNativeVision, // 🚀 传递强制 Native Vision 标志
            dataBusSummary, // 🎯 核心新增：传递数据总线摘要
            similarityDetection // 🎯 核心新增：传递相似性检测结果
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
            let responseText = choice && choice.message && choice.message.content ? 
                choice.message.content : '';

            if (!responseText) {
                throw new Error("LLM返回了空的或无效的响应。");
            }
            
            // 🎯 新增：格式验证与修复
            responseText = this._validateAndFixFormat(responseText, runManager?.runId);

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
    _constructFinalPrompt({ topic, intermediateSteps, availableTools, researchPlan, currentStep = 1, researchMode = 'standard', currentDate, forceNativeVision = false, dataBusSummary = '', similarityDetection = { hasSimilarData: false, recommendations: [] } }) { // 🎯 核心修改：接收新的参数
        const formattedHistory = this._formatHistory(intermediateSteps);
        const availableToolsText = this._formatTools(availableTools);
        
        // 🎯 核心修改：获取模式感知的抓取策略
        const modeAwareCrawlStrategy = this._getModeAwareCrawlStrategy(researchMode);
        
        // 增强严格格式要求部分
        const strictFormatProtocol = `
## 🚨【最高优先级】输出格式绝对纪律 (Absolute Format Discipline)

### 你的响应必须且只能是以下三种格式之一：

### 格式A：继续研究（工具调用）
思考: [你的详细推理过程...]
行动: tool_name_here
行动输入: {"parameter1": "value1", "parameter2": "value2"}

### 格式B：生成报告大纲
思考: [判断信息已足够...]
行动: generate_outline
行动输入: {"topic": "报告主题", "key_findings": ["要点1", "要点2"]}

### 格式C：最终答案
思考: [确认研究已完成...]
最终答案:
# 报告标题
## 章节一
内容...

### 🚫 绝对禁止 (会立即导致解析失败)：
1. ❌ 不要在同一响应中包含多个"行动:"节
2. ❌ 不要在"行动输入:"的JSON外添加任何额外文本
3. ❌ 不要在JSON中使用注释
4. ❌ 不要使用Markdown代码块标记(\`\`\`json\`\`\`)
5. ❌ 不要在"行动:"后换行再写工具名

### ✅ 正确示例 (注意所有细节)：
思考: 当前任务是获取第三方评测...
行动: tavily_search
行动输入: {"query": "DeepSeek 3.2 评测", "max_results": 10}

### ❌ 错误示例 (会导致解析失败)：
行动: tavily_search
行动: tavily_search  # ❌ 重复的行动标记
行动输入: {"query": "测试"}  # ❌ 额外的行动输入
`;
        
        // --- START FIX: [最终修复版] 注入上一步的观察结果，并强化知识应用指令 ---
    // --- 1.1 增强Agent思考中的数据总线提醒 ---
    const dataBusIntelligenceProtocol = (dataBusSummary) => `
## 🧠 数据总线智能激活协议 (Data Bus Intelligence Protocol)

### 📊 你有一个隐藏的"记忆库"：数据总线 (Data Bus)
**重要发现**：系统已经为你存储了先前步骤的关键数据！这些数据可以：
- ✅ 避免重复搜索相同信息
- ✅ 快速回顾历史发现
- ✅ 建立信息之间的关联
- ✅ 提升研究效率30%以上

### 🔍 数据总线内容预览
${dataBusSummary || "数据总线正在加载中..."}

### 🎯 智能数据复用策略

#### 策略A：关键词匹配复用
**当你计划搜索时，先检查数据总线：**
1. **提取搜索关键词**：从查询中提取核心名词
2. **扫描数据总线**：查找包含相同关键词的历史数据
3. **复用决策**：
   - 如果历史数据相关度>80%，直接复用并补充新角度
   - 如果相关度50-80%，快速浏览后决定是否需要新搜索
   - 如果相关度<50%，执行新搜索

**思考示例**：
"我计划搜索'DeepSeek 3.2 性能对比'。让我先检查数据总线..."
→ 发现步骤3已有相关性能数据
→ 决定："已有基础性能数据，我将聚焦'最新评测对比'补充新视角"

#### 策略B：主题关联挖掘
**当你深入一个主题时，挖掘相关数据：**
1. **主题扩展**：当前主题 → 相关子主题
2. **关联查找**：在数据总线中查找子主题相关信息
3. **知识整合**：将分散的信息整合成完整图景

**思考示例**：
"我正在研究DSA稀疏注意力。数据总线显示步骤2提到了'注意力机制优化'，步骤4有'计算效率提升'。我将整合这些信息构建完整的技术分析。"

#### 策略C：数据验证与补充
**当你需要验证信息时：**
1. **交叉验证**：用数据总线中的其他来源验证当前信息
2. **缺口识别**：对比历史数据，识别信息缺口
3. **精准补充**：针对缺口进行精准搜索

### 📈 数据总线使用决策框架

\`\`\`
开始新任务 → 提取关键词 → 扫描数据总线 →
发现相关数据? → 是 → 评估数据质量 →
      ↓否                    ↓高质量
执行新搜索              复用并补充新角度
                             ↓中质量
                        快速验证后决定
                             ↓低质量
                        执行新搜索并记录
\`\`\`

### 🚀 具体行动指南

#### 1. 在思考开头添加数据总线检查
**必须格式**：
\`\`\`
思考: [当前任务描述]
**数据总线检查**: 扫描关键词"[关键词1]", "[关键词2]"...
发现相关数据: [是/否，简要描述]
复用决策: [复用全部/部分/不复用] + 理由
\`\`\`

#### 2. 智能工具选择
- **如果数据总线有高质量相关数据**：优先使用\`code_generator\`分析或\`crawl4ai\`深度抓取
- **如果数据总线数据不足**：使用\`tavily_search\`探索新方向
- **如果需要验证**：结合数据总线和新搜索进行交叉验证

#### 3. 信息整合报告
- 在最终报告中，明确标注哪些信息来自数据总线复用
- 展示信息演进的脉络：从初始发现到深入验证

### 📋 数据总线检索命令（思维模拟）
虽然你不能直接查询，但可以在思考中模拟：

\`\`\`
**思维模拟查询**:
查询: "DeepSeek 3.2 性能数据"
预期返回: 步骤3的结构化表格、步骤5的评测摘要
使用策略: 整合已有数据，补充时效性验证
\`\`\`

### 🎭 不同研究模式的数据策略

#### Deep/Academic 模式（深度复用）：
- **必须**检查数据总线的所有相关记录
- **必须**建立信息演化时间线
- **鼓励**深入挖掘数据总线的隐含关联

#### Technical/Business 模式（效率复用）：
- **快速**扫描数据总线的关键数据点
- **优先**复用结构化数据（表格、图表）
- **聚焦**数据验证和决策支持

#### Standard 模式（基础复用）：
- **选择性**检查最近2-3步的数据
- **简单**复用明显相关的内容
- **保持**研究流程的简洁性

### 💡 高级技巧：数据总线思维模型

#### 1. 时间维度分析
"数据总线显示：第1步有基础信息 → 第3步有深度分析 → 第5步有最新动态。我看到了信息演进的完整脉络。"

#### 2. 来源交叉验证
"来源A（步骤2）和来源B（步骤4）都提到了30-40%内存降低，这个数据点已经得到交叉验证。"

#### 3. 信息缺口识别
"数据总线有大量V3.2-Exp信息，但V3.2正式版数据不足。这是我的研究重点。"

### 🚫 常见误区避免

1. **不要忽略**：每次都从头开始，不检查已有数据
2. **不要过度**：为了复用而复用，忽略新信息需求
3. **不要混淆**：明确区分"历史数据"和"新发现"
4. **不要遗漏**：在最终报告中引用数据总线的贡献

### ✅ 数据总线使用成功标准

- [ ] 每次思考都检查了数据总线
- [ ] 有效复用了至少1个历史数据点
- [ ] 避免了明显的重复搜索
- [ ] 建立了信息的连贯性和深度
- [ ] 在报告中体现了信息演进过程
`;

    // --- 1.4 在思考流程中集成数据总线 ---
    const dataBusIntegration = (dataBusSummary, similarityDetection) => `
## 🔗 数据总线集成与相似性检测

### 📊 数据总线状态
${dataBusSummary}

### 🔍 相似性检测结果
${similarityDetection.hasSimilarData ?
    `检测到 ${similarityDetection.recommendations.length} 个相似历史步骤：\n` +
    similarityDetection.recommendations.map(rec =>
        `- **步骤 ${rec.step}** (相似度 ${rec.similarity}%): ${rec.thought}\n  建议: ${rec.suggestion}`
    ).join('\n')
    : '未检测到高度相似的历史步骤。'
}

### 🎯 当前步骤的数据策略
基于以上分析，你的数据复用策略应该是：
1. **优先检查**：高相似度（>80%）的历史数据
2. **选择性复用**：中度相似度（60-80%）的相关信息
3. **避免重复**：相同关键词的重复搜索
4. **建立连接**：将新信息与历史数据关联

### 💡 思考模板（集成数据总线）
\`\`\`
思考: [当前任务描述]

**数据总线分析**:
- 相关历史数据: [列出发现的相似数据]
- 信息缺口: [当前步骤需要但历史缺乏的信息]
- 复用策略: [具体如何复用历史数据]

**相似性检测**:
- 历史相似步骤: [步骤X (相似度Y%)]
- 可借鉴经验: [从历史步骤中学到什么]
- 避免错误: [历史步骤中的教训]

**下一步行动**:
基于以上分析，我将[具体行动方案]...
\`\`\`
`;
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

const pdfIntelligentBypassProtocol = `
## 📄 PDF 智能规避与曲线救国协议 (PDF Bypass Protocol)

### 🚨 核心认知：你无法直接抓取PDF文件
**重要事实**：crawl4ai 工具**无法处理PDF文件**。PDF是二进制文件，不是HTML网页。当你尝试抓取PDF时，会导致：
- ❌ 500服务器错误
- ❌ 超时失败
- ❌ 研究流程中断

### 🔍 PDF链接智能识别规则

**当URL包含以下特征时，自动识别为PDF：**
1. **扩展名检测**：以 \`.pdf\` 结尾
2. **路径检测**：包含 \`/pdf/\`、\`/paper.pdf\`、\`/report.pdf\`、\`/whitepaper.pdf\`
3. **域名检测**：来自arxiv.org/pdf/、academia.edu、researchgate.net的文件
4. **内容检测**：链接中包含 \`download\`、\`paper\`、\`thesis\`、\`dissertation\` + \`.pdf\`

### 🧠 智能决策框架：三层次处理策略

#### 第一层：学术论文专用策略（针对arXiv、学术会议）

**场景**：https://arxiv.org/pdf/2501.12345.pdf

**思考模式**：
"这是一个arXiv学术论文PDF。由于crawl4ai无法处理PDF，我将采取替代方案：
1. **提取论文ID**：从URL中提取2501.12345
2. **访问摘要页**：https://arxiv.org/abs/2501.12345 (将/pdf/替换为/abs/)
3. **抓取摘要页**：获取标题、作者、摘要、关键词
4. **搜索相关分析**：寻找技术博客解析和讨论"

**具体行动**：
\`\`\`
思考: [识别为arXiv论文PDF，说明替代方案]
行动: crawl4ai
行动输入: {
  "mode": "scrape",
  "parameters": {
    "url": "https://arxiv.org/abs/2501.12345"
  }
}
\`\`\`

#### 第二层：技术报告与文档

**场景**：https://company.com/reports/2025-whitepaper.pdf

**思考模式**：
"这是一个公司技术报告PDF。由于无法直接抓取PDF，我将：
1. **记录引用**：在报告中引用此PDF作为数据来源
2. **搜索摘要**：搜索'公司名 2025 技术报告 摘要'或'whitepaper key findings'
3. **寻找替代**：查找博客解析、新闻覆盖、开发者讨论
4. **获取数据**：如果报告包含数据，搜索'数据名称 表格'或'统计 可视化'"

**具体行动**：
\`\`\`
思考: [识别为技术报告PDF，说明替代方案]
行动: tavily_search
行动输入: {"query": "Company 2025 技术报告 主要发现 摘要", "max_results": 10}
\`\`\`

#### 第三层：统计数据与政府报告

**场景**：https://data.gov/statistics/2025-report.pdf

**思考模式**：
"这是一个政府统计数据PDF。由于PDF无法抓取，我将：
1. **寻找HTML版本**：搜索'数据名 在线表格'或'交互式数据'
2. **搜索摘要**：查找'报告摘要'或'主要数据点'
3. **查找可视化**：寻找信息图或数据可视化
4. **新闻报道**：查找报道该数据的新闻文章"

**具体行动**：
\`\`\`
思考: [识别为数据报告PDF，说明替代方案]
行动: tavily_search
行动输入: {"query": "2025 统计数据 摘要 表格", "max_results": 8}
\`\`\`

### 📊 根据研究模式差异化处理

#### Deep/Academic 模式（严格学术标准）：
- **必须**提取arXiv摘要页
- **必须**搜索至少3篇相关分析文章
- **必须**使用标准学术引用格式
- **必须**区分"原始论文"和"第三方分析"

**示例思考**：
"作为深度研究，我遇到arXiv论文PDF。我将：
1. 抓取arXiv摘要页获取元数据
2. 搜索技术博客获取深度解析
3. 查找作者其他相关研究
4. 记录标准学术引用"

#### Technical/Business 模式（实用导向）：
- **优先**搜索"技术解析"和"实施指南"
- **关注**具体数据、图表、案例研究
- **引用**原始PDF作为数据来源声明

**示例思考**：
"作为技术分析，我遇到技术报告PDF。我将：
1. 搜索'实施指南'和'最佳实践'
2. 查找相关代码示例和案例
3. 获取关键性能数据
4. 引用原始报告支持结论"

#### Standard 模式（效率优先）：
- **快速**搜索"摘要"和"主要观点"
- **使用**第三方摘要节省时间
- **记录**PDF链接供参考

### 🔄 具体转换示例库

#### 示例1：arXiv论文转换
\`\`\`
原始PDF: https://arxiv.org/pdf/2501.12345.pdf
转换方案:
1. 摘要页: https://arxiv.org/abs/2501.12345
2. 搜索词: ["arXiv:2501.12345 摘要", "论文标题 技术解析"]
3. 备用方案: 搜索作者主页、GitHub仓库
\`\`\`

#### 示例2：会议论文转换
\`\`\`
原始PDF: https://proceedings.mlr.press/v250/paper123.pdf
转换方案:
1. HTML页: https://proceedings.mlr.press/v250/paper123.html
2. 搜索词: ["ICML 2025 论文标题", "论文标题 代码实现"]
3. 备用方案: 搜索演讲视频、幻灯片
\`\`\`

#### 示例3：公司技术报告转换
\`\`\`
原始PDF: https://openai.com/research/gpt-5-technical-report.pdf
转换方案:
1. 搜索词: ["GPT-5 技术报告 摘要", "GPT-5 性能分析"]
2. 备用方案: 搜索开发者博客、Twitter讨论、Reddit分析
3. 可视化: 搜索"GPT-5 性能图表 对比"
\`\`\`

### 📝 引用与诚信准则

#### 如何引用未直接阅读的PDF：
1. **诚实声明**：明确说明"基于PDF摘要和第三方分析"
2. **标准格式**：使用标准学术引用格式
3. **多方验证**：至少引用2个独立分析来源
4. **区分信息**：清楚区分原始信息和解读信息

#### 引用示例：
**正确做法**：
"根据DeepSeek V3.2技术报告(DeepSeek, 2025)的摘要和第三方分析，该模型采用了..."

**错误做法**：
"我阅读了DeepSeek V3.2技术报告，发现..." (实际上未直接阅读PDF)

### 🚫 绝对禁止行为

1. **禁止尝试抓取PDF**：
   \`\`\`
   ❌ 错误: 行动: crawl4ai
        行动输入: {"url": "https://.../paper.pdf"}
   ✅ 正确: 行动: crawl4ai
        行动输入: {"url": "https://arxiv.org/abs/2501.12345"}
   \`\`\`

2. **禁止因PDF放弃研究**：
   \`\`\`
   ❌ 错误: "无法获取PDF，研究终止"
   ✅ 正确: "PDF无法直接访问，将搜索替代信息源"
   \`\`\`

3. **禁止隐藏PDF引用**：
   \`\`\`
   ❌ 错误: 不提及PDF存在
   ✅ 正确: 明确引用PDF并说明使用替代信息
   \`\`\`

### ✅ 成功检查清单

当遇到PDF链接时，你必须：

- [ ] **识别类型**：准确判断PDF类型（学术/技术/数据）
- [ ] **制定策略**：选择合适的三层处理策略
- [ ] **执行替代**：进行摘要页抓取或相关搜索
- [ ] **记录引用**：在思考中记录PDF引用
- [ ] **验证信息**：从多个替代源交叉验证信息
- [ ] **保持诚信**：明确说明信息来源

### 🎯 快速决策流程图

\`\`\`
遇到URL → 是PDF吗？ → 否 → 正常处理
              ↓是
识别PDF类型 →
   ├─ 学术论文 → 提取ID → 访问摘要页 → 搜索分析文章
   ├─ 技术报告 → 搜索"摘要"+"解析" → 查找替代内容
   └─ 数据报告 → 搜索"数据表"+"可视化" → 查找HTML版本
\`\`\`

### 💡 高级技巧与最佳实践

#### 1. arXiv论文的元数据提取
- 从摘要页提取：标题、作者、摘要、关键词、发表日期
- 使用这些元数据进行更精准的后续搜索

#### 2. 会议论文的多种获取方式
- 查找会议网站上的HTML版本
- 搜索作者个人网站上的预印本
- 查找演讲视频或幻灯片

#### 3. 技术报告的信息挖掘
- 公司博客通常有报告摘要
- 技术新闻媒体会有分析文章
- 开发者社区有讨论和实现

#### 4. 保持研究的连续性
- 即使无法获取PDF，也不中断研究流程
- 使用替代信息继续推进研究计划
- 在最终报告中说明限制和采取的措施
`;

const pdfAwarenessInThinking = `
## 🔍 遇到URL时的思考流程（PDF感知版）

### 步骤1：URL健康检查
**检查每个URL：**
- 是否以.pdf结尾？
- 是否包含/pdf/路径？
- 是否来自已知的学术PDF源？

### 步骤2：如果是PDF，立即触发PDF处理协议
**思考中必须包含：**
1. **明确声明**："检测到PDF链接：[URL]"
2. **类型判断**："这是一个[学术论文/技术报告/数据文档]PDF"
3. **限制认知**："由于crawl4ai无法处理PDF文件，我将采取替代方案"
4. **替代策略**："我将[具体替代方案]"

### 步骤3：执行替代方案
**根据PDF类型选择：**
- **学术论文**："提取论文ID [ID]，访问arXiv摘要页 [新URL]"
- **技术报告**："搜索'[报告名] 摘要 关键发现'"
- **数据文档**："寻找HTML版本或数据表格"

### 步骤4：验证信息完整性
**思考中回答：**
- "通过替代方案，我获得了哪些关键信息？"
- "这些信息是否足够回答当前子问题？"
- "是否需要进一步搜索来补充？"

### 示例思考（完整版）：
\`\`\`
思考: 当前任务是分析DeepSeek V3.2的技术架构。我找到了一个PDF链接: https://arxiv.org/pdf/2501.12345.pdf

检测到PDF链接，这是一个学术论文PDF。由于crawl4ai无法处理PDF文件，我将采取替代方案：
1. 提取论文ID: 2501.12345
2. 访问arXiv摘要页: https://arxiv.org/abs/2501.12345
3. 从摘要页获取标题、作者、摘要等元数据
4. 搜索相关技术解析文章补充细节

现在我将抓取摘要页来获取论文的核心信息。
\`\`\`
`;

const enhancedToolSelectionStrategy = `
## 🛠️ 工具选择策略（PDF感知增强版）

### 选择逻辑流程图：
\`\`\`
需要信息 → 检查URL → 是PDF? → 是 → 使用替代方案
                             ↓否
                 选择正常抓取或搜索
\`\`\`

### PDF链接的专用工具选择：

#### 情况1：arXiv学术论文PDF
- **禁止使用**：crawl4ai抓取PDF
- **必须使用**：crawl4ai抓取摘要页 (arxiv.org/abs/)
- **补充使用**：tavily_search搜索技术解析
- **示例**：
  \`\`\`
  思考: [识别为arXiv PDF，计划抓取摘要页]
  行动: crawl4ai
  行动输入: {"url": "https://arxiv.org/abs/2501.12345"}
  \`\`\`

#### 情况2：公司技术报告PDF
- **禁止使用**：crawl4ai
- **推荐使用**：tavily_search搜索摘要和解析
- **备用方案**：搜索新闻覆盖和博客分析
- **示例**：
  \`\`\`
  思考: [识别为技术报告PDF，将搜索摘要]
  行动: tavily_search
  行动输入: {"query": "DeepSeek V3.2 技术报告 主要改进", "max_results": 10}
  \`\`\`

#### 情况3：数据统计PDF
- **禁止使用**：crawl4ai
- **推荐使用**：tavily_search寻找HTML表格
- **备用方案**：搜索数据可视化或信息图
- **示例**：
  \`\`\`
  思考: [识别为数据PDF，将搜索在线表格]
  行动: tavily_search
  行动输入: {"query": "2025 人工智能 市场规模 数据表", "max_results": 8}
  \`\`\`

### 🚫 绝对工具使用禁令：
1. **crawl4ai** 永远不能用于抓取.pdf结尾的URL
2. 不要尝试用任何工具直接处理PDF二进制文件
3. 遇到PDF时不要跳过，必须采取替代行动

### ✅ 正确工具使用模式：
1. **PDF → 摘要页**：使用crawl4ai抓取HTML摘要页
2. **PDF → 搜索**：使用tavily_search寻找替代内容
3. **PDF → 多源**：结合使用两种工具获取完整信息
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
        
        // 💼 行业分析模式专用约束
        const businessModeConstraints = researchMode === 'business' ? `
## 💼 行业分析模式专用约束

### 数据收集完整性要求：
1. **必须完成所有计划步骤**后才能生成最终报告
2. **每个关键维度**（市场规模、产业链、竞争格局等）都需要独立的数据收集
3. **交叉验证**：重要数据点需要至少2个独立来源确认

### 禁止行为：
- 🚫 在完成产业链分析前生成报告
- 🚫 跳过竞争格局量化分析
- 🚫 遗漏风险评估维度
- 🚫 使用单一数据源得出结论

### 质量检查清单：
当前进度：已完成 ${currentStep-1}/${researchPlan.research_plan.length} 步骤
- [ ] 市场规模与增长数据 ✅
- [ ] 产业链深度解构与价值链条分析 ${currentStep >= 2 ? '✅' : '❌'}
- [ ] 竞争格局量化 ${currentStep >= 3 ? '✅' : '❌'}
- [ ] 风险因素识别 ${currentStep >= 4 ? '✅' : '❌'}
- [ ] 投资价值评估 ${currentStep >= 5 ? '✅' : '❌'}

**只有完成所有检查项后才能生成最终报告！**
` : '';

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
                role: "技术方案架构师",
                description: "你是专注于将自然语言需求转化为标准化技术方案的专业架构师，不涉及具体代码实现",
                specialInstructions: `
## 🎯 核心工作流程

### 第一阶段：需求标准化 (核心)
**输入**: 用户自然语言描述
**输出**: 结构化需求规格文档
**重点**:
- 将模糊描述转化为清晰的需求规格
- 识别核心业务目标和功能模块
- 定义可衡量的成功标准

### 第二阶段：技术分析 (研究驱动)
**方法**:
- 搜索同类项目的最佳实践
- 分析行业成功案例的架构模式
- 研究技术栈的稳定性和适用性
**输出**: 基于研究的架构设计建议

### 第三阶段：落地指引 (实用导向)
**内容**:
- **项目结构设计指南**: 推荐的文件目录组织、关键文件位置规划
- **技术实施路线图**: 开发阶段划分和关键里程碑
- **风险识别和规避策略**: 技术实施中的潜在问题和解决方案
**原则**: 提供架构级别的指导，不涉及具体文件内容实现

## 🔍 研究策略重点

### 需求分析阶段搜索:
- "[领域] 需求规格说明书 最佳实践"
- "用户故事 验收标准 模板"
- "功能需求 非功能需求 定义"

### 案例研究阶段搜索:
- "[类似项目] 架构设计 案例"
- "[行业] 成功项目 技术分析"
- "最佳实践 架构模式 [年份]"

### 技术架构阶段搜索:
- "系统架构设计 原则"
- "前后端分离 架构 指南"
- "微服务 单体 架构 选择"

### 技术选型阶段搜索:
- "[技术] 生产环境 稳定性"
- "LTS版本 支持周期 对比"
- "[技术栈] 最佳组合 实践"

### 落地指引阶段搜索:
- "项目结构 最佳实践 [技术栈]"
- "企业级项目目录组织"
- "微服务/单体 项目结构 规范"
- "部署架构 设计指南"
- "技术实施 路线图 模板"

## 📋 交付质量标准

### 需求文档标准:
- [ ] 业务目标清晰明确
- [ ] 功能模块划分合理
- [ ] 验收标准可衡量
- [ ] 非功能需求完整

### 技术分析标准:
- [ ] 基于实际案例研究
- [ ] 架构选择有充分理由
- [ ] 技术栈稳定性已验证
- [ ] 考虑了团队技术背景

### 落地指引标准:
- [ ] 项目结构清晰可行 - 提供合理的目录结构建议
- [ ] 关键文件位置明确 - 说明重要配置文件、源代码目录的位置
- [ ] 实施步骤具体明确 - 给出可操作的开发阶段划分
- [ ] 风险识别全面准确 - 识别项目组织相关的风险
- [ ] 资源配置建议合理 - 团队结构和工具链建议

## 🚫 严格禁止
- 生成具体代码实现
- 提供完整的配置文件内容
- 编写详细的API实现
- 输出可运行的代码片段
- **具体文件内部实现细节**

## ✅ 核心价值
专注于提供架构设计思路、技术选型建议、实施路线指导，包括：
- 项目应该包含哪些目录和文件
- 关键文件应该放在什么位置
- 开发实施的阶段和顺序
- 每个阶段的重要注意事项
让用户清楚知道"项目结构如何组织"和"实施路径如何规划"。
`
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

        // 修改：构建可用工具部分，包括特别提示
        // 🎯 核心修改：移除旧的 crawl4aiSpecialNote，因为新策略已包含所有指导
        const availableToolsSection = `
# 可用工具
${availableToolsText}

## 🕷️ crawl4ai 工具使用说明 (由模式策略提供)
- **核心增强：批量爬取 (Batch Crawl)**：使用 \`batch_crawl\` 模式，传入 \`urls\` 数组。
- **重要**: 当使用 \`extract\` 模式时，必须提供一个名为 \`schema_definition\` 的参数来定义提取的数据结构。请勿使用 \`schema\` 作为参数名。
- **限制**: 仅支持基于 **精确 CSS 选择器** 的结构化数据提取（\`extraction_type: 'css'\`）。**严禁**尝试进行 LLM 驱动的智能提取（\`extraction_type: 'llm'\`）。
`;

        const prompt = `
# 角色：${config.role}
${config.description}

${strictFormatProtocol} // 🎯 核心新增：插入严格格式协议

${dataBusIntegration(dataBusSummary, similarityDetection)} // 🎯 核心新增：数据总线集成与相似性检测

${dataBusIntelligenceProtocol(dataBusSummary)} // 🎯 核心新增：数据总线智能激活协议
 
${modeAwareCrawlStrategy} // 🎯 核心替换：插入模式感知的抓取策略
 
${businessModeConstraints} // 💼 插入：行业分析模式专用约束

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
    
    **核心增强：批量爬取 (Batch Crawl)**
    - **模式**: \`batch_crawl\`
    - **用途**: 如果你识别出 **3-4 个**权威 URL，请使用此模式一次性抓取，以加速信息收集。
    - **参数**: 必须传入一个 URL 数组 \`urls\`。
    - **备注**:目前\`crawl4ai\`最大并大数为4，请勿超过4个。

    **正确示例 (批量爬取)**:
    \`\`\`json
    {
      "mode": "batch_crawl",
      "urls": ["https://url1.com", "https://url2.com", "https://url3.com"]
    }
    \`\`\`

### **阶段 C：信息综合与验证 (python_sandbox / tavily_search)**
- **触发条件**: 当你已经通过 \`crawl4ai\` 获取了1-2个高质量的全文信息后。
- **可选行动**:
    - 对抓取到的文本进行数据分析、提取或处理。备选工具： \`python_sandbox\` 。
    - 如果信息仍不足或需要交叉验证，可以再次调用 \`tavily_search\` 寻找补充观点。

 ### 🚫 绝对禁止 (深度研究模式下):
- **连续两次**调用 \`tavily_search\`，除非第一次搜索完全没有返回任何有价值的URL。
- 在 \`tavily_search\` 之后，如果存在有价值的URL，却选择执行其他操作。**必须优先钻取**。
- 在 \`crawl4ai\` 抓取到长文本后，因为摘要里没看到需要的表格或图片就再次调用 \`tavily_search\`。**如果所需要的数据已经在资料中有明确表述，你可以记录下来并优先尝试用 \`python_sandbox\` 提取或绘制数据图表**。

${pdfIntelligentBypassProtocol} // 📄 核心新增：PDF 智能规避与曲线救国协议
${enhancedToolSelectionStrategy} // 🛠️ 核心新增：PDF 感知增强版工具选择策略
${pdfAwarenessInThinking} // 🔍 核心新增：PDF 感知版思考流程指导
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
        } else if (researchMode === 'business') {
            modeSpecificGuidance = `
## 💼 行业分析模式：框架指导下的自主探索

### 核心原则（必须遵守）：
1. **搜索语言纯净**：使用纯中文或纯英文，避免混合缩写+数字+中文
2. **关键词精炼**：每个搜索3-5个核心关键词，聚焦关键信息
3. **分阶段推进**：遵循研究计划的逻辑步骤，确保分析深度

### 分阶段搜索框架（参考模板）：

#### 阶段1：市场规模探索
\`\`\`json
{"query": "[行业] 市场规模 增长率 最新数据", "max_results": 10}
\`\`\`

#### 阶段2：产业链分析  
\`\`\`json
{"query": "[行业] 产业链 上下游 利润分布", "max_results": 8}
\`\`\`

#### 阶段3：竞争格局
\`\`\`json
{"query": "[行业] 竞争格局 市场份额", "max_results": 8}
\`\`\`

#### 阶段4：政策风险
\`\`\`json
{"query": "[行业] 政策法规 税收优惠", "max_results": 6}
\`\`\`

### 🧠 认知维度启发：

#### 基于行业特性的深度思考框架：

**技术密集型行业**（半导体、AI、生物医药）：
- 核心关注："技术路线图"、"研发投入"、"专利布局"、"创新生态"
- 深度问题：技术瓶颈在哪里？下一代技术方向是什么？

**政策敏感行业**（教育、医疗、金融）：
- 核心关注："监管政策"、"准入条件"、"合规要求"、"政策趋势"  
- 深度问题：政策变化如何重塑行业格局？合规成本有多高？

**消费类行业**（零售、餐饮、娱乐）：
- 核心关注："消费趋势"、"用户画像"、"渠道变革"、"品牌价值"
- 深度问题：消费者行为正在发生什么根本性变化？

**资本密集型行业**（房地产、基建、能源）：
- 核心关注："投资规模"、"融资环境"、"回报周期"、"资产质量"
- 深度问题：资本回报率是否可持续？现金流状况如何？

**新兴颠覆性行业**（AI、新能源、生物科技）：
- 核心关注："技术突破"、"市场渗透率"、"生态构建"、"标准制定"
- 深度问题：颠覆的临界点在哪里？传统企业如何应对？

### 🎯 你的专业自主权：

#### 创造性搜索策略：
基于你对行业的深度理解，可以：
- **组合维度**：将技术趋势与市场数据结合搜索
- **发现盲点**：搜索行业报告中未充分讨论的关键问题
- **前瞻探索**：寻找未来3-5年的趋势预测
- **跨界借鉴**：从相关行业寻找可借鉴的模式

#### 深度分析框架：
展现你作为行业专家的能力：
1. **系统性思维**：将零散信息整合成完整的行业图谱
2. **辩证分析**：识别矛盾数据背后的深层原因
3. **趋势预测**：基于现有数据推断未来发展方向
4. **风险评估**：识别被市场忽视的潜在风险

#### 质量标杆：
我们期待看到：
- 💡 **独特洞见**：超越常规分析的深度发现
- 🔗 **逻辑严密**：数据支撑的完整论证链条  
- 🎯 **实用价值**：对决策者有实际指导意义的结论
- 🚀 **前瞻视野**：对未来趋势的准确判断

### 避免的搜索模式：
\`\`\`json
{"query": "PCB感光干膜 CR3 CR5 2025", "max_results": 10}  // 🚫 混合缩写+数字
\`\`\`
`;
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
        
        // --- 核心工具的检测逻辑 (通用) ---
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
        
        // --- 技术模式专用的研究触发条件 ---
        if (researchPlan.research_mode === 'technical') {
            const stepTriggers = {
                1: { // 需求标准化阶段
                    tools: ['tavily_search', 'crawl4ai'],
                    queries: ["需求规格说明书 模板", "用户故事验收标准", "功能需求分析框架"],
                    researchFocus: "将自然语言转化为结构化需求的方法论"
                },
                2: { // 案例研究阶段
                    tools: ['tavily_search', 'crawl4ai'],
                    queries: ["类似项目架构案例", "行业最佳实践分析", "成功项目技术复盘"],
                    researchFocus: "同类项目的成功经验和可借鉴模式"
                },
                3: { // 架构设计阶段
                    tools: ['tavily_search', 'crawl4ai'],
                    queries: ["系统架构设计原则", "架构模式对比分析", "扩展性设计指南"],
                    researchFocus: "基于需求的最优架构方案设计"
                },
                4: { // 技术选型阶段
                    tools: ['tavily_search', 'crawl4ai'],
                    queries: ["技术栈稳定性评估", "LTS版本生产验证", "技术生态成熟度"],
                    researchFocus: "稳定可靠的技术组合选择"
                },
                5: { // 落地指引阶段
                    tools: ['tavily_search'],
                    queries: ["项目结构最佳实践", "实施路线图模板", "部署架构设计指南"],
                    researchFocus: "具体可行的落地实施指引"
                }
            };
            
            const trigger = stepTriggers[currentStep];
            if (trigger && currentStepPlan.expected_tools.some(tool => trigger.tools.includes(tool))) {
                conditions.push(`技术指引第${currentStep}步需要深度研究: ${currentStepPlan.sub_question}`);
                trigger.tools.forEach(tool => {
                    if (currentStepPlan.expected_tools.includes(tool)) {
                        suggestedTools.set(tool, {
                            name: tool,
                            reason: `${trigger.researchFocus} - 搜索: ${trigger.queries.join(', ')}`
                        });
                    }
                });
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

    /**
     * 🎯 核心方法：格式验证与自动修复
     * 检查模型输出是否存在重复的"行动:"或"行动输入:"标记，并尝试自动修复。
     * @param {string} text 原始LLM输出文本
     * @param {object} runManager 当前运行管理器实例
     * @returns {string} 修复后的文本
     */
    _validateAndFixFormat(text, runId) {
    // 检查是否存在明显格式问题
    const issues = [];
    
    // 检查1：是否有重复的"行动:"
    const actionCount = (text.match(/行动:/g) || []).length;
    if (actionCount > 1) {
        issues.push(`发现 ${actionCount} 个"行动:"标记`);
    }
    
    // 检查2：是否有重复的"行动输入:"
    const inputCount = (text.match(/行动输入:/g) || []).length;
    if (inputCount > 1) {
        issues.push(`发现 ${inputCount} 个"行动输入:"标记`);
    }
    
    // 如果发现问题，记录并尝试修复
    if (issues.length > 0) {
        console.warn(`[AgentLogic] 格式问题检测: ${issues.join(', ')}`);
        
        // 触发自我纠正事件
        if (runManager?.callbackManager) {
            runManager.callbackManager.invokeEvent('on_agent_think_format_error', {
                run_id: runId,
                data: { issues, originalText: text }
            });
        }
        
        // 尝试自动修复：只保留第一个"行动:"和"行动输入:"部分
        const lines = text.split('\n');
        let inAction = false;
        let inInput = false;
        let foundAction = false;
        let foundInput = false;
        const filteredLines = [];
        
        for (const line of lines) {
            if (line.trim().startsWith('行动:')) {
                if (!foundAction) {
                    filteredLines.push(line);
                    foundAction = true;
                    inAction = true;
                    inInput = false;
                }
            } else if (line.trim().startsWith('行动输入:')) {
                if (!foundInput) {
                    filteredLines.push(line);
                    foundInput = true;
                    inAction = false;
                    inInput = true;
                }
            } else if (line.trim().startsWith('思考:')) {
                filteredLines.push(line);
                inAction = false;
                inInput = false;
            } else if (line.trim().startsWith('最终答案:')) {
                filteredLines.push(line);
                inAction = false;
                inInput = false;
            } else {
                // 普通文本行
                filteredLines.push(line);
            }
        }
        
        const fixedText = filteredLines.join('\n');
        console.log(`[AgentLogic] 格式修复: ${text.length} → ${fixedText.length} 字符`);
        
        return fixedText;
    }
    
    return text;
    }
    
    // --- 1.2 数据总线摘要生成系统辅助方法 ---
    
    _extractKeyPointsFromData(data) {
        const keyPoints = [];
        
        // 从元数据中提取
        if (data.metadata?.keyFinding) {
            keyPoints.push(data.metadata.keyFinding);
        }
        
        // 从内容中提取关键词
        if (typeof data.processedData === 'string') {
            // 简单关键词提取
            const text = data.processedData.toLowerCase();
            const keywords = [
                'deepseek', '性能', '提升', '对比', '架构',
                '训练', '推理', '成本', '效率', '评测', '数据', '分析', '结果'
            ];
            
            const foundKeywords = keywords.filter(keyword =>
                text.includes(keyword)
            );
            
            if (foundKeywords.length > 0) {
                keyPoints.push(`包含关键词: ${foundKeywords.slice(0, 3).join(', ')}`);
            }
        }
        
        return keyPoints.length > 0 ? keyPoints : ['通用信息'];
    }

    _analyzeInformationEvolution(summaries) {
        if (summaries.length < 3) return "数据不足进行趋势分析。\n";
        
        let analysis = "通过数据总线可以看到信息演进的清晰脉络：\n";
        
        // 按步骤分组
        const stepGroups = {};
        summaries.forEach(s => {
            if (!stepGroups[s.step]) stepGroups[s.step] = [];
            stepGroups[s.step].push(s);
        });
        
        // 分析每个阶段的信息特点
        Object.keys(stepGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(step => {
            const group = stepGroups[step];
            const dataTypes = [...new Set(group.map(d => d.dataType))];
            
            analysis += `- **步骤${step}**: 主要收集了${dataTypes.join('、')}\n`;
        });
        
        // 识别信息覆盖度
        const allKeywords = summaries.flatMap(s => s.keyPoints);
        const uniqueKeywords = [...new Set(allKeywords.filter(kp => kp.startsWith('包含关键词')))];
        
        analysis += `\n**信息覆盖度**: 已覆盖 ${uniqueKeywords.length} 个关键维度\n`;
        
        return analysis;
    }

    _generateReuseRecommendations(summaries, currentStep) {
        const recommendations = [];
        
        // 根据当前步骤推荐
        switch(currentStep) {
            case 1:
                recommendations.push("🔍 复用基础定义和背景信息");
                recommendations.push("📊 查找已有的结构化性能数据");
                break;
            case 2:
                recommendations.push("🔬 复用技术架构的初步分析");
                recommendations.push("⚡ 查找已有的效率对比数据");
                break;
            case 3:
                recommendations.push("🎯 复用已有的评测和对比分析");
                recommendations.push("💰 查找成本效益数据");
                break;
            default:
                recommendations.push("📚 回顾所有历史数据寻找关联");
                recommendations.push("🎨 整合分散信息形成完整图景");
        }
        
        // 根据数据类型推荐
        const hasStructuredData = summaries.some(s => s.dataType.includes('结构化'));
        if (hasStructuredData) {
            recommendations.push("📈 重点复用结构化数据进行深度分析");
        }
        
        const hasWebContent = summaries.some(s => s.dataType.includes('网页'));
        if (hasWebContent) {
            recommendations.push("🌐 复用网页内容中的关键段落");
        }
        
        return recommendations.map(r => `- ${r}`).join('\n');
    }

    // --- 1.3 相似数据检测与复用机制辅助方法 ---

    _extractKeywords(text) {
        if (!text) return [];
        
        // 中文分词简化版（实际应使用更复杂的分词）
        const words = text.toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ') // 保留中文、英文、数字
            .split(/\s+/)
            .filter(word => word.length > 1); // 过滤单字
        
        // 过滤停用词
        const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '将', '进行', '使用', '来', '以', '并', '或', '为', '对', '从', '中', '等', '个', '种', '些', '那', '这'];
        return words.filter(word => !stopWords.includes(word));
    }

    _calculateSimilarity(keywords1, keywords2) {
        if (keywords1.length === 0 || keywords2.length === 0) return 0;
        
        // Jaccard相似度
        const set1 = new Set(keywords1);
        const set2 = new Set(keywords2);
        
        const intersection = [...set1].filter(x => set2.has(x)).length;
        const union = new Set([...keywords1, ...keywords2]).size;
        
        return union > 0 ? intersection / union : 0;
    }

    _generateSimilaritySuggestion(similarity, toolName) {
        if (similarity > 0.8) {
            return `高度相似（${Math.round(similarity * 100)}%），建议直接复用并补充新角度`;
        } else if (similarity > 0.6) {
            return `中度相似（${Math.round(similarity * 100)}%），可参考历史方法但需要新信息`;
        } else {
            return `低度相似，建议执行全新搜索`;
        }
    }

    // --- 1.2 数据总线摘要生成系统核心方法 ---

    _generateDataBusSummary(dataBus, currentStep) {
        if (!dataBus || dataBus.size === 0) {
            return "📭 数据总线当前为空，这是研究的第一步。";
        }
        
        const summaries = [];
        let totalDataPoints = 0;
        let structuredDataCount = 0;
        
        // 按步骤组织数据
        const stepEntries = Array.from(dataBus.entries())
            .map(([key, data]) => {
                const stepMatch = key.match(/step_(\d+)/);
                return {
                    step: stepMatch ? parseInt(stepMatch) : 0,
                    key,
                    data
                };
            })
            .sort((a, b) => a.step - b.step);
        
        // 生成按步骤的摘要
        stepEntries.forEach(entry => {
            const { step, data } = entry;
            
            // 计算相关性评分（基于当前步骤）
            let relevance = '🟡 中等';
            const stepDiff = Math.abs(currentStep - (step + 1)); // step是从0开始的，所以要+1
            if (stepDiff <= 1) relevance = '🟢 高';
            if (stepDiff >= 3) relevance = '🔴 低';
            
            // 提取关键信息
            let contentPreview = '';
            if (typeof data.processedData === 'string') {
                contentPreview = data.processedData.substring(0, 150);
                if (data.processedData.length > 150) contentPreview += '...';
            }
            
            // 检测数据类型
            let dataType = '文本';
            if (data.metadata?.contentType === 'structured_data') {
                dataType = '📊 结构化数据';
                structuredDataCount++;
            }
            if (data.metadata?.toolName === 'crawl4ai') {
                dataType = '🌐 网页内容';
            }
            
            summaries.push({
                step: step + 1,
                relevance,
                dataType,
                length: data.processedData?.length || 0,
                preview: contentPreview,
                tool: data.metadata?.toolName || 'unknown',
                keyPoints: this._extractKeyPointsFromData(data)
            });
            
            totalDataPoints++;
        });
        
        // 生成摘要文本
        let summaryText = `## 📚 数据总线状态报告\n\n`;
        summaryText += `**总数据点**: ${totalDataPoints} 个 | **结构化数据**: ${structuredDataCount} 个\n\n`;
        
        summaryText += `### 🔍 与你当前任务（步骤${currentStep}）最相关的数据：\n\n`;
        
        // 显示高相关性数据
        const highRelevance = summaries.filter(s => s.relevance.includes('高'));
        if (highRelevance.length > 0) {
            highRelevance.forEach(data => {
                summaryText += `#### 步骤 ${data.step} (${data.relevance})\n`;
                summaryText += `- **类型**: ${data.dataType} | **工具**: ${data.tool}\n`;
                summaryText += `- **关键信息**: ${data.keyPoints.join('; ')}\n`;
                summaryText += `- **预览**: ${data.preview}\n\n`;
            });
        } else {
            summaryText += `暂无高相关性数据，所有历史数据都可能有用。\n\n`;
        }
        
        summaryText += `### 📈 数据趋势分析\n`;
        
        // 分析信息演进
        const infoEvolution = this._analyzeInformationEvolution(summaries);
        summaryText += infoEvolution;
        
        // 建议复用策略
        summaryText += `\n### 💡 智能复用建议\n`;
        summaryText += this._generateReuseRecommendations(summaries, currentStep);
        
        return summaryText;
    }

    // --- 1.3 相似数据检测与复用机制核心方法 ---

    _buildSimilarityDetectionSystem(researchPlan, intermediateSteps, currentStep) {
        if (!intermediateSteps || intermediateSteps.length === 0) {
            return { hasSimilarData: false, recommendations: [] };
        }
        
        const currentStepPlan = researchPlan.research_plan.find(
            step => step.step === currentStep
        );
        
        if (!currentStepPlan) {
            return { hasSimilarData: false, recommendations: [] };
        }
        
        const currentKeywords = this._extractKeywords(currentStepPlan.sub_question);
        const recommendations = [];
        
        // 分析历史步骤的相似性
        intermediateSteps.forEach((step, index) => {
            // 只检查历史步骤的思考（thought）部分，因为这是Agent的意图
            if (step.action?.thought) {
                const stepKeywords = this._extractKeywords(step.action.thought);
                const similarity = this._calculateSimilarity(currentKeywords, stepKeywords);
                
                if (similarity > 0.6) {
                    const toolName = step.action?.tool_name || '未知工具';
                    const stepNum = index + 1;
                    
                    recommendations.push({
                        step: stepNum,
                        similarity: Math.round(similarity * 100),
                        tool: toolName,
                        thought: step.action.thought.substring(0, 100) + '...',
                        suggestion: this._generateSimilaritySuggestion(similarity, toolName)
                    });
                }
            }
        });
        
        return {
            hasSimilarData: recommendations.length > 0,
            recommendations: recommendations.slice(0, 3) // 最多显示3条
        };
    }
}