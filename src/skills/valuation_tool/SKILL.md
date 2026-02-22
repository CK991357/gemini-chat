---
name: valuation_tool
description: 财务估值模型综合工具，支持 DCF、FCFE、RIM、EVA、APV 模型及蒙特卡洛模拟。从会话工作区读取 AlphaVantage 获取的 JSON 文件，生成估值报告（Markdown + JSON）。
tool_name: valuation_tool
category: finance-analysis
priority: 5
tags: ["valuation", "dcf", "fcfe", "rim", "eva", "apv", "monte-carlo", "financial-modeling", "stock-analysis", "sensitivity", "forecast"]
version: 1.1
---

# 估值模型综合工具 (`valuation_tool`)

`valuation_tool` 是一个专业的财务估值工具，整合了五种经典估值模型（DCF、FCFE、RIM、EVA、APV）和蒙特卡洛模拟。**直接从会话工作区读取由 AlphaVantage 工具获取的 JSON 文件**，无需手动上传数据。生成的报告（Markdown + JSON）保存在同一会话目录，供进一步分析或展示。

## 🎯 工具定义说明

### 调用结构
```json
{
  "mode": "<操作模式>",
  "parameters": {
    "<参数名>": "<参数值>"
  }
}
```

### 可用模式
| 模式 | 描述 |
|------|------|
| `single` | 运行单个估值模型（需指定 `model` 参数） |
| `multi` | 运行多个模型（默认包含 DCF、FCFE、RIM、EVA、APV） |
| `monte_carlo` | 对 DCF 模型进行蒙特卡洛模拟 |

### 通用参数（所有模式共用）
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `symbol` | string | 自动推断 | 股票代码，若不提供则从会话目录中的 `income_statement_*.json` 推断 |
| `projection_years` | int | 5 | 预测年数 |
| `terminal_growth` | float | 0.025 | 永续增长率 |
| `risk_free_method` | string | `"latest"` | 无风险利率取值方式（`latest` 或 `1y_avg`） |
| `market_premium` | float | 0.06 | 市场风险溢价 |
| `sensitivity` | bool | `true` | 是否进行敏感性分析（适用于 single/multi 模式） |
| `include_detailed` | bool | `true` | 是否包含详细预测表（Markdown 报告中） |

### 各模式特有参数

#### `single` / `multi` 模式
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `models` | array | `["dcf","fcfe","rim","eva","apv"]` | 要运行的模型列表（multi 模式） |
| `model` | string | - | 要运行的单个模型名称（single 模式），可选值：`dcf`、`fcfe`、`rim`、`eva`、`apv` |
| `debt_assumption` | string | `"ratio"` | APV 模型债务假设（`constant` 固定债务 或 `ratio` 债务/收入比例） |

#### `monte_carlo` 模式
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `n_simulations` | int | 1000 | 蒙特卡洛模拟次数 |
| `seed` | int | 42 | 随机种子（确保结果可复现） |

## 🚀 快速开始

### 示例 1：多模型估值（含敏感性分析）
```json
{
  "mode": "multi",
  "parameters": {
    "symbol": "AAPL",
    "models": ["dcf", "fcfe", "rim", "eva", "apv"],
    "sensitivity": true,
    "projection_years": 5,
    "terminal_growth": 0.025
  }
}
```

### 示例 2：仅运行 DCF 模型（单模型）
```json
{
  "mode": "single",
  "parameters": {
    "symbol": "AAPL",
    "model": "dcf",
    "sensitivity": true
  }
}
```

### 示例 3：蒙特卡洛模拟（2000 次，自定义种子）
```json
{
  "mode": "monte_carlo",
  "parameters": {
    "symbol": "AAPL",
    "n_simulations": 2000,
    "seed": 123
  }
}
```

## 📊 返回数据格式

### 成功响应（multi 模式示例）
```json
{
  "success": true,
  "execution_time": 3.45,
  "mode": "multi",
  "symbol": "AAPL",
  "session_dir": "/srv/sandbox_workspaces/temp",
  "generated_files": [
    "/srv/sandbox_workspaces/temp/valuation_AAPL_multi.json",
    "/srv/sandbox_workspaces/temp/valuation_AAPL_multi.md"
  ],
  "results": {
    "dcf": { ... },
    "fcfe": { ... },
    ...
  },
  "models_executed": 5
}
```

### 成功响应（single 模式示例）
```json
{
  "success": true,
  "execution_time": 0.8,
  "mode": "single",
  "symbol": "AAPL",
  "session_dir": "/srv/sandbox_workspaces/temp",
  "generated_files": [
    "/srv/sandbox_workspaces/temp/valuation_AAPL_dcf.json",
    "/srv/sandbox_workspaces/temp/valuation_AAPL_dcf.md"
  ],
  "data": {
    "model_results": { "dcf": true }
  },
  "message": "single 估值完成，共生成 2 个文件。"
}
```

### 成功响应（蒙特卡洛示例）
```json
{
  "success": true,
  "execution_time": 15.23,
  "mode": "monte_carlo",
  "symbol": "AAPL",
  "session_dir": "/srv/sandbox_workspaces/temp",
  "generated_files": [
    "/srv/sandbox_workspaces/temp/mc_AAPL.json",
    "/srv/sandbox_workspaces/temp/mc_AAPL.md"
  ],
  "statistics": {
    "mean": 185.23,
    "median": 184.56,
    "std": 12.45,
    "p5": 165.12,
    "p95": 205.87,
    "min": 148.32,
    "max": 221.45,
    "n_simulations": 1000
  },
  "json_path": "/srv/sandbox_workspaces/temp/mc_AAPL.json",
  "md_path": "/srv/sandbox_workspaces/temp/mc_AAPL.md",
  "n_valid_simulations": 1000
}
```

### 错误响应示例
```json
{
  "success": false,
  "error": "FCFE 估值失败: 无法获取历史账面价值",
  "execution_time": 0.89
}
```

## 🗂️ 数据文件规范

### 必需文件（由 AlphaVantage 工具生成）
- `income_statement_{symbol}.json` - 利润表（至少最近5年）
- `balance_sheet_{symbol}.json` - 资产负债表
- `cash_flow_{symbol}.json` - 现金流量表
- `overview_{symbol}.json` - 公司概况（包含 Beta、股份数等）

### 可选文件（用于提高预测精度）
- `earnings_estimates_{symbol}.json` - 分析师盈利预估（用于收入增长率预测）
- `dividends_{symbol}.json` - 历史股息数据（用于 RIM 模型）
- `quote_{symbol}.json` - 当前股价（用于报告中的当前股价显示）
- `treasury_10year_daily.parquet` - 10年期国债收益率历史数据（若无，则使用模拟值 4.5%）

### 会话目录规则
与 AlphaVantage 工具完全一致：
- **普通模式**（无有效 `session_id` 或 `session_id` 不以 `session_` 开头）：文件保存到 `/srv/sandbox_workspaces/temp`
- **Agent 模式**（`session_id` 以 `session_` 开头）：文件保存到 `/srv/sandbox_workspaces/{session_id}`

## 📝 输出文件说明

### 1. JSON 报告（多模型）
- 文件名：`valuation_{symbol}_multi.json`
- 包含所有运行模型的原始结果数据，适合程序化处理。

### 2. Markdown 报告（多模型）
- 文件名：`valuation_{symbol}_multi.md`
- 包含详细的估值过程、假设说明、逐年预测表、敏感性矩阵、终值计算、股权价值推导等，格式清晰，可直接展示给用户。

### 3. 单模型报告
- 文件名：`valuation_{symbol}_{model}.json` 和 `valuation_{symbol}_{model}.md`
- 内容与多模型类似，但只包含单个模型的结果。

### 4. 蒙特卡洛输出
- `mc_{symbol}.json`：统计量（均值、中位数、分位数等）
- `mc_{symbol}.md`：文字报告
- 若服务器环境安装了 `matplotlib`，还会生成 `mc_{symbol}_hist.png` 直方图并嵌入 MD 报告。

## 🔧 代码解释器集成示例

### 读取估值报告并提取每股价值
```python
import json
import pandas as pd

# 读取 JSON 结果（注意使用 /data/ 路径）
with pd.io.common.get_handle('/data/valuation_AAPL_multi.json', 'r', is_text=True) as f:
    data = json.load(f)

# 提取各模型每股价值
for model_name, model_result in data.items():
    if model_result.get('success'):
        if 'valuation' in model_result:
            vps = model_result['valuation'].get('value_per_share_formatted', 'N/A')
            print(f"{model_name.upper()}: {vps}")
```

### 读取蒙特卡洛统计
```python
with pd.io.common.get_handle('/data/mc_AAPL.json', 'r', is_text=True) as f:
    stats = json.load(f)
print(f"均值: ${stats['mean']:.2f}")
print(f"95% 置信区间: ${stats['p5']:.2f} ~ ${stats['p95']:.2f}")
```

### 读取 Markdown 报告内容（用于展示）
```python
with pd.io.common.get_handle('/data/valuation_AAPL_multi.md', 'r', is_text=True) as f:
    md_content = f.read()
print(md_content[:500])  # 打印前500字符
```

## ⚠️ 重要注意事项

1. **数据依赖性**：工具依赖 AlphaVantage 生成的 JSON 文件，请先调用 `alphavantage` 获取所需数据（至少包括利润表、资产负债表、现金流量表、公司概况）。若缺少关键文件，工具将返回错误。
2. **会话一致性**：确保工具调用与数据获取使用**相同的会话 ID**，否则工具可能无法找到数据文件。
3. **无风险利率**：工具会优先从会话目录读取 `treasury_10year_daily.parquet`，若不存在则返回模拟值（4.5%）并记录警告。建议提前通过 AlphaVantage 的 `treasury_yield` 模式获取并保存为 Parquet 文件。
4. **代码解释器访问**：遵循沙箱规范，**禁止使用 `open`**，必须通过 `pandas` 的 `pd.io.common.get_handle` 或 `pd.read_parquet` 等方法读取文件。文件路径需以 `/data/` 开头。
6. **单模型文件名**：single 模式生成的报告文件名为 `valuation_{symbol}_{model}.json` 和 `.md`，例如 `valuation_AAPL_dcf.md`。

## 🆘 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| `无法获取历史账面价值` | 缺少 `balance_sheet_{symbol}.json` | 调用 AlphaVantage 的 `balance_sheet` 模式 |
| `无法获取历史债务数据` | 缺少 `balance_sheet_{symbol}.json` 或 `shortTermDebt`/`longTermDebt` 字段 | 检查资产负债表文件完整性 |
| `无法找到国债收益率文件` | 缺少 `treasury_10year_daily.parquet` | 调用 AlphaVantage 的 `treasury_yield` 模式获取并保存为 parquet |
| 工具返回的 `session_dir` 为 `temp`，但期望独立会话 | 前端未传入以 `session_` 开头的会话 ID | 检查 Agent 模式是否开启，或确认前端正确传递了 `session_id` |
| 代码解释器无法读取生成的 MD 报告 | 文件路径错误或权限问题 | 确保使用容器内路径 `/data/文件名`，且文件确实存在于该目录 |
| 蒙特卡洛未生成图片 | 服务器未安装 `matplotlib` | 在运行环境中安装 `matplotlib` 即可自动生成图片 |

---

**版本信息**: 1.1  
**最后更新**: 2026-02-22  
**支持模型**: DCF, FCFE, RIM, EVA, APV, 蒙特卡洛  
**数据依赖**: AlphaVantage 生成的 JSON 文件  
**会话管理**: 与 AlphaVantage 工具完全一致  
