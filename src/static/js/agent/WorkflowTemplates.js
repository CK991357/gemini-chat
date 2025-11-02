export const WORKFLOW_TEMPLATES = {
  web_analysis: {
    name: '网页分析工作流',
    description: '自动爬取网页内容并进行分析总结',
    steps: [
      {
        name: '网页内容爬取',
        toolName: 'firecrawl',
        parameters: {
          mode: 'scrape',
          parameters: { url: '{user_query}' }
        },
        critical: true
      },
      {
        name: '内容分析总结',
        toolName: 'standard_ai',
        prompt: '请分析以下网页内容，提取关键信息并总结要点:\n\n{step0.output}',
        critical: true
      }
    ]
  },

  data_visualization: {
    name: '数据可视化工作流', 
    description: '数据处理、分析和可视化生成',
    steps: [
      {
        name: '数据准备与分析',
        toolName: 'python_sandbox',
        parameters: {
          code: `# 数据准备和清洗
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# 这里处理用户的数据需求
# {user_query}`
        },
        critical: true
      },
      {
        name: '结果解释',
        toolName: 'standard_ai',
        prompt: '请解释以下数据分析结果:\n\n{step0.output}',
        critical: false
      }
    ]
  },

  research_report: {
    name: '研究报告工作流',
    description: '信息收集、分析和报告生成',
    steps: [
      {
        name: '信息搜索',
        toolName: 'tavily_search', 
        parameters: { query: '{user_query}' },
        critical: true
      },
      {
        name: '分析总结',
        toolName: 'standard_ai',
        prompt: '基于搜索到的信息，生成完整的研究报告:\n\n{step0.output}',
        critical: true
      }
    ]
  }
};