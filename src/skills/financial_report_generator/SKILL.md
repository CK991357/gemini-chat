---
name: financial_report_generator
description: 财务报告生成工具，从会话工作区中读取 AlphaVantage 获取的原始 JSON 文件，生成基础财务数据报告和财务比率历史数据报告
tool_name: financial_report_generator
category: finance-analysis
priority: 5
tags: ["finance", "report", "analysis", "ratio", "financial-statement"]
version: 1.0
---

# 财务报告生成工具

`financial_report_generator` 是一个专用的财务报告生成工具，它读取由 AlphaVantage 工具保存到会话工作区的原始 JSON 文件（如利润表、资产负债表、现金流量表等），生成两种详细的 Markdown 报告：基础财务数据报告和财务比率历史数据报告。报告文件会保存回同一会话目录，可供后续分析或下载。

## 🎯 工具定义说明

### 调用结构
```json
{
  "mode": "<报告模式>",
  "parameters": {
    "symbol": "<股票代码（可选）>"
  }
}
```

### 可用模式
- `base`：生成基础财务数据报告（包含同比变化、复合增长率、财务健康评分模型）
- `ratio`：生成财务比率历史数据报告（多年度对比表格，含盈利能力、流动性、杠杆、效率、现金流五大类比率）
- `both`：同时生成两种报告

### 必需数据文件
工具需要 AlphaVantage 工具先前在会话目录中保存的以下 JSON 文件（文件名格式固定）：
- `income_statement_{symbol}.json` — 利润表
- `balance_sheet_{symbol}.json` — 资产负债表
- `cash_flow_{symbol}.json` — 现金流量表
- `earnings_{symbol}.json` — 盈利数据（每股收益）
- `overview_{symbol}.json` — 公司概况（用于获取公司名称、行业等）

对于 `ratio` 模式，`cash_flow.json` 和 `earnings.json` 为可选，但若缺少则部分比率无法计算。

## 🎯 快速开始

### 基本调用格式
```json
{
  "mode": "both",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

### 示例：生成苹果公司两种财务报告
```json
{
  "mode": "both",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

## 📋 报告内容概要

### 1. 基础财务数据报告 (`*_base_financials.md`)
- **损益表核心数据**：营收、成本、毛利、营业利润、净利润、EBITDA、EBIT、利息费用、所得税、研发费用等（含同比变化）
- **资产负债表核心数据**：总资产、总负债、股东权益、流动资产/负债、现金、存货、应收/应付账款、短期/长期债务、营运资本等
- **现金流量表核心数据**：经营现金流、资本支出、自由现金流、投资/筹资现金流、股息支付、股份回购等
- **每股数据**：每股收益（EPS）及同比
- **复合年增长率（CAGR）**：近3年、近5年、全部年份的营收、净利润、总资产、股东权益、经营现金流、自由现金流、EPS 的 CAGR
- **财务健康评分模型**：基于盈利能力、流动性、杠杆、效率、现金流五个维度，加权计算历年评分及评级

### 2. 财务比率历史数据报告 (`*_report.md`)
- **盈利能力**：ROE、ROA、毛利率、营业利润率、净利率、EBITDA利润率、ROIC
- **流动性**：流动比率、速动比率、现金比率、营运资本、营运资本比率
- **杠杆**：负债权益比、资产负债率、权益乘数、利息保障倍数、固定费用保障倍数
- **效率**：资产周转率、存货周转率、应收账款周转率、应付账款周转率、DSO、DIO、DPO、现金转换周期
- **现金流与投资**：资本支出、自由现金流、资本支出/收入、资本支出/EBITDA、资本支出/经营现金流、自由现金流利润率、自由现金流收益率、经营现金流利润率、自由现金流/净利润

## 🎯 参数说明

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `mode` | string | 是 | 报告生成模式，可选 `base` / `ratio` / `both` |
| `parameters.symbol` | string | 否 | 股票代码，如 `AAPL`。若不提供，工具会自动从会话目录中的 `income_statement_*.json` 文件推断。 |

## 📥 输入与输出

### 输入
工具直接读取会话工作区（`temp` 或 `session_xxx` 目录）中的 JSON 文件，文件命名必须遵循 AlphaVantage 工具的保存规则（见上文列表）。

### 输出
- 基础财务数据报告：`{symbol}_base_financials.md`
- 财务比率历史数据报告：`{symbol}_report.md`

两个报告均保存在**同一会话目录**中，与原始 JSON 文件同位置。

## 📊 成功响应示例

```json
{
  "success": true,
  "message": "报告生成成功，共生成 2 个文件",
  "generated_files": [
    "/srv/sandbox_workspaces/temp/aapl_base_financials.md",
    "/srv/sandbox_workspaces/temp/aapl_report.md"
  ],
  "session_dir": "/srv/sandbox_workspaces/temp",
  "mode": "both",
  "symbol": "AAPL",
  "timestamp": "2026-02-21T10:30:00.123456"
}
```

## ⚠️ 重要注意事项

### 依赖关系
- **必须先使用 AlphaVantage 工具获取原始 JSON 文件**，且文件必须保存在同一会话目录中（普通模式为 `temp`，Agent 模式为对应的 `session_xxx`）。
- 文件名必须严格遵循 AlphaVantage 工具的命名规则（例如 `income_statement_AAPL.json` 而非 `AAPL_income.json`）。

### 会话一致性
- 生成报告时使用的 `session_id`（由前端自动传递）必须与获取数据时使用的 `session_id` 完全一致。若不一致，工具将无法找到所需文件。
- 普通模式下所有工具调用均使用 `temp` 目录，因此文件自动共享，无需额外操作。

### 数据完整性
- 对于 `base` 模式，必须同时存在 `income_statement`, `balance_sheet`, `cash_flow`, `earnings` 四个 JSON 文件，否则工具会报错。
- 对于 `ratio` 模式，至少需要 `income_statement` 和 `balance_sheet`，`cash_flow` 和 `earnings` 缺失时部分比率（如现金流指标、PEG）将不可用，但不会中断执行。

### 代码解释器文件访问
- 生成的 Markdown 报告为纯文本文件，可在代码解释器中通过安全的文件读取方式（如 `pd.io.common.get_handle`）读取内容，或直接下载。
- **切勿使用 `open()`**，应使用 `pandas` 等库的安全方法。

## 🔄 实际使用示例

### 在 Qwen/Gemini 中调用（假设已获取 AAPL 的原始数据）
```json
{
  "tools": [{
    "name": "financial_report_generator",
    "parameters": {
      "mode": "both",
      "parameters": {
        "symbol": "AAPL"
      }
    }
  }]
}
```

### 生成报告后，读取并展示部分内容
（可在后续对话中调用 `python_sandbox` 读取 Markdown 文件并提取关键数据）

## 🆘 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 返回错误 `缺少必需文件` | 会话目录中缺少相应的 JSON 文件 | 确保已使用 AlphaVantage 工具获取了所需的所有数据，且文件命名正确 |
| 自动推断 symbol 失败 | 目录中没有 `income_statement_*.json` 文件，或文件名格式不符 | 在参数中显式提供 `symbol` |
| 生成比率报告时某些指标为 `—` | 缺少现金流或盈利数据文件 | 使用 AlphaVantage 工具获取 `cash_flow` 和 `earnings` 数据 |
| 报告文件路径错误 | `session_id` 不一致 | 检查调用时传递的 `session_id` 是否与获取数据时一致 |

## 📚 相关资源

- [AlphaVantage 工具 SKILL](./alphavantage.md)
- [代码解释器文件访问指南](#)
- [财务比率计算方法说明](https://www.investopedia.com/financial-ratios-4689817)

---

**版本信息**: 1.0  
**最后更新**: 2026-02-21  
**数据依赖**: AlphaVantage 原始 JSON 文件  
**输出格式**: Markdown 报告  
**工作流**: 与 AlphaVantage 工具无缝衔接，共享会话目录
