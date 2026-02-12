---
name: alphavantage
description: 金融数据获取工具，从AlphaVantage API获取股票、外汇、加密货币、大宗商品等多种金融数据
tool_name: alphavantage
category: finance-data
priority: 5
tags: ["stock", "forex", "crypto", "commodity", "finance", "alpha-vantage"]
version: 3.2
---

# AlphaVantage 金融数据工具

`alphavantage` 是一个专业的金融数据获取工具，通过 AlphaVantage API 提供丰富的金融市场数据。**数据会返回在响应中，也可以保存到会话工作区，可用于进一步分析**。

## 🎯 工具定义说明

### 调用结构
```json
{
  "mode": "<功能模式>",
  "parameters": {
    "<参数名>": "<参数值>"
  }
}
```

### 可用模式（20个完整功能）
- `weekly_adjusted` - 股票周调整数据
- `global_quote` - 实时行情数据
- `earnings_transcript` - 财报电话会议记录
- `insider_transactions` - 内部人交易数据
- `etf_profile` - ETF详细信息
- `forex_daily` - 外汇每日数据
- `digital_currency_daily` - 数字货币每日数据
- `wti` - WTI原油价格
- `brent` - Brent原油价格
- `copper` - 铜价数据
- `treasury_yield` - 国债收益率
- `news_sentiment` - 新闻情绪数据
- `overview` - 公司概况和财务比率数据
- `income_statement` - 利润表数据
- `balance_sheet` - 资产负债表数据
- `cash_flow` - 现金流量表数据
- `earnings` - 每股收益(EPS)数据
- `earnings_estimates` - 盈利预测数据
- `dividends` - 股息历史数据
- `shares_outstanding` - 流通股数量数据

## 🎯 快速开始

### 基本调用格式
```json
{
  "mode": "<功能模式>",
  "parameters": {
    "<参数名>": "<参数值>"
  }
}
```

### 示例：获取苹果公司股票数据
```json
{
  "mode": "weekly_adjusted",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

## 📋 可用模式列表

| 模式 | 描述 | 必需参数 | 示例 |
|------|------|----------|------|
| `weekly_adjusted` | 股票周调整数据 | `symbol` | `{"symbol": "AAPL"}` |
| `global_quote` | 实时行情数据 | `symbol` | `{"symbol": "MSFT"}` |
| `earnings_transcript` | 财报电话会议记录 | `symbol`, `quarter` | `{"symbol": "AAPL", "quarter": "2024Q1"}` |
| `insider_transactions` | 内部人交易数据 | `symbol` | `{"symbol": "AAPL"}` |
| `etf_profile` | ETF详细信息 | `symbol` | `{"symbol": "SPY"}` |
| `forex_daily` | 外汇每日数据 | `from_symbol`, `to_symbol` | `{"from_symbol": "USD", "to_symbol": "JPY", "outputsize": "full"}` |
| `digital_currency_daily` | 数字货币每日数据 | `symbol`, `market` | `{"symbol": "BTC", "market": "USD"}` |
| `wti` | WTI原油价格 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `brent` | Brent原油价格 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `copper` | 铜价数据 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `treasury_yield` | 国债收益率 | `maturity` | `{"interval": "monthly", "maturity": "10year"}` |
| `news_sentiment` | 新闻情绪数据 | 无 | `{"tickers": "AAPL,MSFT", "limit": 50}` |
| `overview` | 公司概况和财务比率 | `symbol` | `{"symbol": "AAPL"}` |
| `income_statement` | 利润表数据 | `symbol` | `{"symbol": "AAPL"}` |
| `balance_sheet` | 资产负债表数据 | `symbol` | `{"symbol": "AAPL"}` |
| `cash_flow` | 现金流量表数据 | `symbol` | `{"symbol": "AAPL"}` |
| `earnings` | 每股收益数据 | `symbol` | `{"symbol": "AAPL"}` |
| `earnings_estimates` | 盈利预测数据 | `symbol` | `{"symbol": "AAPL"}` |
| `dividends` | 股息历史数据 | `symbol` | `{"symbol": "AAPL"}` |
| `shares_outstanding` | 流通股数量数据 | `symbol` | `{"symbol": "AAPL"}` |

## 🎯 详细使用示例

### 示例1: 获取股票周调整数据
```json
{
  "mode": "weekly_adjusted",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

### 示例2: 获取外汇数据
```json
{
  "mode": "forex_daily",
  "parameters": {
    "from_symbol": "USD",
    "to_symbol": "JPY",
    "outputsize": "full"
  }
}
```

### 示例3: 获取实时行情
```json
{
  "mode": "global_quote",
  "parameters": {
    "symbol": "GOOGL"
  }
}
```

### 示例4: 获取加密货币数据
```json
{
  "mode": "digital_currency_daily",
  "parameters": {
    "symbol": "BTC",
    "market": "USD"
  }
}
```

### 示例5: 获取新闻情绪数据
```json
{
  "mode": "news_sentiment",
  "parameters": {
    "tickers": "AAPL,MSFT,GOOGL",
    "limit": 20,
    "sort": "LATEST"
  }
}
```

### 示例6: 获取公司基本面数据
```json
{
  "mode": "overview",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

### 示例7: 获取财务报表数据
```json
{
  "mode": "income_statement",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

### 示例8: 获取股息历史
```json
{
  "mode": "dividends",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

## 📊 返回数据格式

### 成功响应示例（普通模式）
```json
{
  "success": true,
  "data": {
    "total_records": 1364,
    "date_range": {
      "start": "1999-11-12",
      "end": "2025-12-19"
    },
    "sample_data": [
      {
        "date": "2025-12-19",
        "open": 273.25,
        "high": 274.88,
        "low": 272.15,
        "close": 273.81,
        "adjusted_close": 273.81,
        "volume": 17910574,
        "dividend": 0.0
      }
    ],
    "message": "数据过多，显示前10条，共1364条"
  },
  "metadata": {
    "mode": "weekly_adjusted",
    "parameters": {
      "symbol": "AAPL"
    },
    "session_id": "temp",
    "timestamp": "2025-12-25T11:55:01.872000",
    "saved_files": [
      {
        "filename": "stock_AAPL.parquet",
        "host_path": "/srv/sandbox_workspaces/temp/stock_AAPL.parquet",
        "container_path": "/srv/sandbox_workspaces/temp/stock_AAPL.parquet",
        "size_kb": 125.5,
        "session_id": "temp"
      }
    ],
    "data_type": "weekly_adjusted",
    "session_dir": "/srv/sandbox_workspaces/temp",
    "example_code": "# 数据文件已保存: stock_AAPL.parquet\n# 后续处理请在代码解释器中进行",
    "access_instructions": "数据已保存到工作区目录"
  }
}
```

### 成功响应示例（Agent 模式）
```json
{
  "success": true,
  "data": {
    "total_records": 1364,
    "date_range": {
      "start": "1999-11-12",
      "end": "2025-12-19"
    },
    "sample_data": [
      {
        "date": "2025-12-19",
        "open": 273.25,
        "high": 274.88,
        "low": 272.15,
        "close": 273.81,
        "adjusted_close": 273.81,
        "volume": 17910574,
        "dividend": 0.0
      }
    ],
    "message": "数据过多，显示前10条，共1364条"
  },
  "metadata": {
    "mode": "weekly_adjusted",
    "parameters": {
      "symbol": "AAPL"
    },
    "session_id": "session_20260212_abc123",
    "timestamp": "2025-12-25T11:55:01.872000",
    "saved_files": [
      {
        "filename": "stock_AAPL.parquet",
        "host_path": "/srv/sandbox_workspaces/session_20260212_abc123/stock_AAPL.parquet",
        "container_path": "/srv/sandbox_workspaces/session_20260212_abc123/stock_AAPL.parquet",
        "size_kb": 125.5,
        "session_id": "session_20260212_abc123"
      }
    ],
    "data_type": "weekly_adjusted",
    "session_dir": "/srv/sandbox_workspaces/session_20260212_abc123",
    "example_code": "# 数据文件已保存: stock_AAPL.parquet\n# 后续处理请在代码解释器中进行",
    "access_instructions": "数据已保存到工作区目录"
  }
}
```

### 错误响应示例
```json
{
  "success": false,
  "error": "API调用失败: 无效的股票代码",
  "mode": "weekly_adjusted"
}
```

## 🗂️ 数据保存结构

### 会话ID格式约定
系统通过 **会话ID（`session_id`）** 来区分普通模式与Agent模式，并决定文件保存位置：

- **有效会话ID**：必须以 `"session_"` 开头（例如 `session_20260212_abc123`）。此类ID通常由前端Agent系统自动生成，用于**独立会话隔离**。
- **无效/缺失会话ID**：任何**不以 `"session_"` 开头的字符串**（包括 `null`、空字符串、`"temp"`、`"123"` 等）均被视为普通模式，**强制使用全局共享的 `temp` 目录**。

> 💡 **全链路统一校验**：该约定已在前端代理层（`chat-api-handler.js`）、后端工具注册层（`tool_registry.py`）、代码解释器层（`code_interpreter.py`）统一实现，开发者无需手动处理，工具会自动适配。

### 目录结构示例

#### 普通模式（无有效会话ID）
```
/srv/sandbox_workspaces/
└── temp/                    # 临时会话目录（所有普通模式文件统一存放于此）
    ├── stock_AAPL.parquet
    ├── balance_sheet_AAPL.json
    ├── income_statement_AAPL.json
    ├── forex_USD_JPY.parquet
    └── ...
```

#### Agent 模式（以 `session_` 开头的会话ID）
```
/srv/sandbox_workspaces/
└── session_20260212_abc123/  # 独立会话目录（每个Agent任务对应一个唯一目录）
    ├── stock_AAPL.parquet
    ├── balance_sheet_AAPL.json
    ├── income_statement_AAPL.json
    └── ...
```

### 文件命名规则
工具会根据不同的数据模式自动生成规范的文件名：
- 股票数据：`stock_{symbol}.parquet`
- 实时行情：`quote_{symbol}.json`
- 外汇数据：`forex_{from}_{to}.parquet`
- 加密货币：`crypto_{symbol}_{market}.parquet`
- 大宗商品：`commodity_{commodity}_{interval}.parquet`
- 国债收益率：`treasury_{maturity}_{interval}.parquet`
- 新闻情绪：`news_{tickers/topics}.json`
- ETF信息：`etf_{symbol}_profile.json`
- 内部交易：`insider_{symbol}.json`
- 财报记录：`transcript_{symbol}_{quarter}.json`
- 公司概况：`overview_{symbol}.json`
- 利润表：`income_statement_{symbol}.json`
- 资产负债表：`balance_sheet_{symbol}.json`
- 现金流量表：`cash_flow_{symbol}.json`
- 每股收益：`earnings_{symbol}.json`
- 盈利预测：`earnings_estimates_{symbol}.json`
- 股息历史：`dividends_{symbol}.json`
- 流通股数量：`shares_outstanding_{symbol}.json`

## 🔧 代码解释器文件访问指南（安全沙箱规范）

### 背景说明
代码解释器（`python_sandbox`）出于**安全隔离**目的，**移除了标准内置函数 `open()` 及相关异常**，因此无法使用 `with open(...) as f:` 等传统方式直接读取文件。**这是设计使然，并非缺陷**——沙箱环境通过此限制防止恶意代码访问宿主机文件系统。

### ✅ 安全替代方案
**所有文件读取操作必须通过已加载模块（如 `pandas`、`numpy`）内部持有的原始 `open` 引用进行**。以下方法均已测试通过，可稳定工作：

| 文件格式 | 推荐方法 | 示例 |
|---------|---------|------|
| **JSON** | `pd.io.common.get_handle` + `json.load` | ✅ 支持 |
| **Parquet** | `pd.read_parquet` | ✅ 支持 |
| **CSV** | `pd.read_csv` | ✅ 支持 |
| **Excel** | `pd.read_excel` | ✅ 支持 |
| **文本** | `pd.io.common.get_handle` + `.read()` | ✅ 支持 |

### 📝 完整示例：读取利润表 JSON 文件
```python
import pandas as pd
import json

file_path = '/data/income_statement_AAPL.json'  # 容器内路径（普通模式对应 temp，Agent模式对应独立会话目录）

try:
    # 利用 pandas 内部持有的原始 open 引用获取文件句柄
    with pd.io.common.get_handle(file_path, 'r', is_text=True) as f:
        raw_content = f.handle.read()
        data = json.loads(raw_content)

    annual_reports = data.get('annualReports', [])
    if not annual_reports:
        print("❌ 未找到年度报告数据")
    else:
        latest = annual_reports[0]
        fiscal_date = latest.get('fiscalDateEnding', 'N/A')
        revenue = float(latest.get('totalRevenue', 0))
        cost_of_revenue = float(latest.get('costOfRevenue', 0))
        gross_profit = revenue - cost_of_revenue
        operating_income = float(latest.get('operatingIncome', 0))
        net_income = float(latest.get('netIncome', 0))

        gross_margin = gross_profit / revenue if revenue != 0 else 0
        operating_margin = operating_income / revenue if revenue != 0 else 0
        net_margin = net_income / revenue if revenue != 0 else 0

        print(f"📁 文件读取成功: {file_path}")
        print(f"📅 最新财年结束日: {fiscal_date}")
        print(f"\n💰 营业收入: ${revenue:,.0f}")
        print(f"   净利润: ${net_income:,.0f}")
        print(f"\n📊 毛利率: {gross_margin:.2%}")
        print(f"   净利率: {net_margin:.2%}")

except FileNotFoundError:
    print(f"❌ 文件不存在: {file_path}")
except json.JSONDecodeError:
    print(f"❌ JSON 解析失败，请检查文件格式")
except Exception as e:
    print(f"❌ 发生未知错误: {type(e).__name__}: {e}")
```

### 📊 读取 Parquet 文件（推荐）
```python
import pandas as pd

df = pd.read_parquet('/data/stock_AAPL.parquet')
print(df.head())
```

### 📄 读取 CSV 文件
```python
import pandas as pd

df = pd.read_csv('/data/my_data.csv')
print(df.info())
```

### 📌 重要提醒
1. **始终使用容器内路径**：文件在代码解释器中的可访问路径为 **`/data/文件名`**（普通模式）或 **`/data/文件名`**（Agent模式）。**不要使用宿主机绝对路径**（如 `/srv/sandbox_workspaces/...`），该路径在容器内不可见。
2. **普通模式文件自动共享**：所有未携带有效会话ID的调用都会将文件保存到 `temp` 目录，且代码解释器**自动挂载该目录**。因此**无需任何额外配置**，多个代码解释器调用之间可直接通过 `/data/` 读取彼此生成的文件。
3. **Agent模式文件隔离**：携带以 `session_` 开头的会话ID时，文件保存到对应独立目录，代码解释器也仅挂载该目录。**不同Agent会话的文件完全隔离**。
4. **禁止使用 `open`**：任何尝试直接调用 `open()` 的代码都会抛出 `NameError`，请严格遵循上述替代方案。

## ⚠️ 重要注意事项

### API限制
1. **免费套餐限制**：每分钟5次请求，每天25次请求
2. **数据延迟**：股票数据通常有15-20分钟延迟
3. **数据完整性**：某些历史数据可能不完整
4. **请求频率**：避免高频API调用，建议批量处理

### 会话管理
1. **会话ID格式**：仅当请求中携带**以 `"session_"` 开头的会话ID**时，文件才会保存到独立的会话目录；否则**一律强制保存到 `temp` 目录**。
2. **临时目录**：`temp` 目录为全局共享目录，所有普通模式会话的文件均存储于此，**可被任意代码解释器访问**（需使用相同的会话策略）。
3. **独立会话目录**：Agent模式下生成的 `session_xxx` 目录具有**强隔离性**，不同会话之间的文件互不可见。
4. **自动清理**：后端会定期清理超过24小时未使用的会话目录，临时目录 `temp` **不会被自动删除**。
5. **磁盘空间**：处理大数据量时请注意磁盘使用情况。

### 最佳实践
1. **数据验证**：始终检查返回的 `success` 字段
2. **参数检查**：确保提供正确的参数格式
3. **错误处理**：处理API调用可能失败的情况
4. **数据缓存**：对于频繁访问的数据考虑本地缓存
5. **会话共享**：在普通模式下，若需在不同代码解释器调用间共享数据，**无需任何额外操作**——所有文件均位于 `temp` 目录，自动共享。
6. **文件访问**：在代码解释器中始终使用 `pd.io.common.get_handle`、`pd.read_parquet` 等安全方法，**切勿使用 `open`**。

## 🔄 实际使用示例

### 在Qwen/Gemini中使用
```json
// 用户请求：获取苹果公司最新股价信息
{
  "tools": [{
    "name": "alphavantage",
    "parameters": {
      "mode": "global_quote",
      "parameters": {
        "symbol": "AAPL"
      }
    }
  }]
}
```

### 获取多种数据类型
```json
// 获取苹果公司基本面数据
{
  "tools": [{
    "name": "alphavantage",
    "parameters": {
      "mode": "overview",
      "parameters": {
        "symbol": "AAPL"
      }
    }
  }]
}
```

```json
// 获取外汇市场数据
{
  "tools": [{
    "name": "alphavantage",
    "parameters": {
      "mode": "forex_daily",
      "parameters": {
        "from_symbol": "USD",
        "to_symbol": "JPY",
        "outputsize": "compact"
      }
    }
  }]
}
```

## 🆘 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| **API Key错误** | 环境变量未设置 | 检查ALPHAVANTAGE_API_KEY环境变量 |
| **数据为空** | 参数错误或API无数据 | 验证参数格式，检查示例 |
| **网络超时** | API响应慢 | 增加超时时间，稍后重试 |
| **无效股票代码** | 代码格式错误或不存在 | 检查股票代码格式和有效性 |
| **请求频率过高** | 超过API限制 | 降低请求频率，使用批量处理 |
| **工具返回的 `session_id` 为 `"temp"`，但期望独立会话** | 前端未传入以 `session_` 开头的会话ID | 检查Agent模式是否开启，或确认前端是否正确传递了会话ID |
| **代码解释器无法读取工具保存的文件** | 会话ID不一致，导致文件保存目录与挂载目录不匹配 | 确保工具调用、文件上传、代码解释器使用**相同**的会话ID（普通模式下均为 `temp`，Agent模式下均为同一 `session_xxx`） |
| **代码解释器报错 `NameError: name 'open' is not defined`** | 尝试直接使用 `open()` 函数 | **必须使用** `pd.io.common.get_handle`、`pd.read_parquet` 等安全替代方法（见🔧代码解释器文件访问指南） |

## 📚 相关资源

- [AlphaVantage官方文档](https://www.alphavantage.co/documentation/)
- [API套餐升级](https://www.alphavantage.co/premium/)
- [金融数据格式说明](https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=IBM&apikey=demo)

---

**版本信息**: 3.2  
**最后更新**: 2026-02-12  
**支持模式**: 20种金融数据获取功能  
**数据保存**: 自动保存到会话工作区目录（普通模式：`temp`；Agent模式：独立 `session_` 目录）  
**文件访问规范**: 代码解释器中**严禁使用 `open`**，必须通过 `pandas` 等库的安全方法读取  
**兼容性**: 支持股票、外汇、加密货币、大宗商品、国债、新闻、基本面数据等