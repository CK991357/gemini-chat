// src/static/js/agent/specialized/ResearchPrompts.js
export const ResearchPrompts = {
    keywordGeneration: (topic, requirements) => `
你是一个专业的研究分析师。请为以下研究主题生成3-5个精准的搜索关键词：

研究主题: ${topic}
具体要求: ${requirements || '无特殊要求'}

请考虑以下维度：
1. 核心概念和术语
2. 最新发展和趋势  
3. 关键应用场景
4. 相关技术标准
5. 行业重要组织

请以JSON格式返回：
{
    "keywords": [
        {
            "term": "精确关键词",
            "rationale": "选择理由",
            "priority": "high/medium/low"
        }
    ]
}
    `,

    reportStructure: (researchState, analyzedContent) => `
# 深度研究报告生成

## 研究主题
${researchState.topic}

## 用户需求  
${researchState.requirements || '无特定要求'}

## 分析的内容摘要
${analyzedContent.slice(0, 8).map((content, index) => `
### 来源 ${index + 1}
**标题**: ${content.title}
**关键信息**: ${content.keyPoints.join('; ')}
**相关性**: ${content.relevanceScore}/10
`).join('\n')}

## 报告要求
1. 使用${researchState.language}撰写
2. 包含完整的报告结构
3. 基于分析的内容提供实质性见解
4. 突出关键发现和趋势
5. 提供可操作的建议

## 报告格式
# ${researchState.topic} - 深度研究报告

## 执行摘要
[200-300字的核心发现摘要]

## 1. 研究背景
[背景介绍和研究目的]

## 2. 主要发现
### 2.1 [关键发现领域1]
### 2.2 [关键发现领域2] 

## 3. 分析与洞察
### 3.1 趋势分析
### 3.2 挑战与机遇

## 4. 结论与建议
### 4.1 主要结论
### 4.2 实践建议

## 参考文献
[列出主要信息来源]

请开始生成报告：
    `
};