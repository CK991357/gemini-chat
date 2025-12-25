---
name: alphavantage
description: 金融数据获取工具，从AlphaVantage API获取股票、外汇、加密货币、大宗商品等多种金融数据
tool_name: alphavantage
category: finance-data
priority: 5
tags: ["stock", "forex", "crypto", "commodity", "finance", "alpha-vantage"]
version: 1.0
---

# AlphaVantage 金融数据工具

`alphavantage` 是一个专业的金融数据获取工具，通过 AlphaVantage API 提供丰富的金融市场数据。

## 核心特点

1. **多类型数据支持**：股票、外汇、加密货币、大宗商品、国债收益率、新闻情绪等
2. **实时与历史数据**：支持实时行情和历史时间序列数据
3. **数据持久化**：所有获取的数据会自动保存到本地文件系统
4. **标准化输出**：返回格式化的JSON数据，便于前端处理

## 📋 数据保存与工作区管理

**重要更新**：数据现在保存到会话工作区，与代码解释器共享：

### 数据保存路径：
```
/srv/sandbox_workspaces/<session_id>/
├── alphavantage/     # AlphaVantage原始数据
├── stock/           # 股票数据
├── forex/           # 外汇数据
├── crypto/          # 加密货币数据
├── commodities/     # 大宗商品数据
└── news/           # 新闻情绪数据
```

### 会话管理：
- **会话ID**：工具调用时自动生成或传递
- **会话超时**：24小时自动清理
- **临时会话**：无session_id时使用临时目录，1小时后清理

## 调用结构

**基本调用格式：**
```json
{
  "function": "<功能名称>",
  "parameters": {
    "<参数名>": "<参数值>"
  }
}
```

## 功能示例

### 📈 示例 1: 获取股票周调整数据

**✅ 正确示例：**
```json
{
  "function": "fetch_weekly_adjusted",
  "parameters": {
    "symbol": "IBM"
  }
}
```

**返回数据格式：**
```json
{
  "success": true,
  "data": {
    "total_records": 520,
    "date_range": {
      "start": "2014-01-10",
      "end": "2024-01-12"
    },
    "sample_data": [
      {
        "date": "2024-01-12",
        "open": 158.25,
        "high": 159.18,
        "low": 156.67,
        "close": 158.15,
        "adjusted_close": 158.15,
        "volume": 5234567,
        "dividend": 0.0
      }
    ],
    "message": "数据过多，只显示前10条记录，共520条"
  },
  "metadata": {
    "function": "fetch_weekly_adjusted",
    "parameters": {"symbol": "IBM"},
    "session_id": "user123-session-abc",
    "timestamp": "2024-01-15T10:30:00.123456",
    "saved_files": [
      "/srv/sandbox_workspaces/user123-session-abc/alphavantage/IBM_weekly.parquet"
    ],
    "data_type": "stock_weekly_data",
    "session_dir": "/srv/sandbox_workspaces/user123-session-abc",
    "data_dir": "/srv/sandbox_workspaces/user123-session-abc/alphavantage",
    "example_code": "# 读取股票数据并进行简单分析..."
  }
}
```

### 📊 示例 2: 获取实时行情

**✅ 正确示例：**
```json
{
  "function": "fetch_global_quote",
  "parameters": {
    "symbol": "AAPL"
  }
}
```

**返回数据格式：**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "open": 185.64,
    "high": 186.34,
    "low": 184.72,
    "price": 185.92,
    "volume": 12345678,
    "latest_trading_day": "2024-01-12",
    "previous_close": 185.56,
    "change": 0.36,
    "change_percent": "0.19%"
  },
  "metadata": {
    "function": "fetch_global_quote",
    "parameters": {"symbol": "AAPL"},
    "session_id": "user123-session-abc",
    "timestamp": "2024-01-15T10:31:15.456789",
    "saved_files": [
      "/srv/sandbox_workspaces/user123-session-abc/alphavantage/AAPL_quote.json"
    ],
    "data_type": "stock_realtime_quote",
    "session_dir": "/srv/sandbox_workspaces/user123-session-abc",
    "data_dir": "/srv/sandbox_workspaces/user123-session-abc/alphavantage",
    "example_code": "# 读取实时行情数据..."
  }
}
```

### 💱 示例 3: 获取外汇数据

**✅ 正确示例：**
```json
{
  "function": "fetch_forex_daily",
  "parameters": {
    "from_symbol": "EUR",
    "to_symbol": "USD",
    "outputsize": "compact"
  }
}
```

**返回数据特征：**
- 数据保存到：`/srv/sandbox_workspaces/<session_id>/forex/EUR_USD.parquet`
- 返回数据抽样（前10条记录）
- 包含完整的Python分析示例代码

### 📰 示例 4: 获取新闻情绪数据

**✅ 正确示例：**
```json
{
  "function": "fetch_news_sentiment",
  "parameters": {
    "tickers": "AAPL,MSFT,GOOGL",
    "limit": 20,
    "sort": "LATEST"
  }
}
```

**返回数据特征：**
- 数据保存到：`/srv/sandbox_workspaces/<session_id>/news/AAPL_MSFT_GOOGL_<timestamp>.json`
- 包含新闻标题、摘要、情绪标签
- 生成情绪分析示例代码

## 所有可用功能

| 功能 | 描述 | 主要参数 | 数据保存位置 |
|------|------|----------|--------------|
| `fetch_weekly_adjusted` | 股票周调整数据 | `symbol` | `alphavantage/<symbol>_weekly.parquet` |
| `fetch_global_quote` | 实时行情数据 | `symbol` | `alphavantage/<symbol>_quote.json` |
| `fetch_historical_options` | 历史期权数据 | `symbol`, `date` | `alphavantage/options/` |
| `fetch_earnings_transcript` | 财报电话会议记录 | `symbol`, `quarter` | `alphavantage/transcripts/` |
| `fetch_insider_transactions` | 内部人交易数据 | `symbol` | `alphavantage/insider/` |
| `fetch_etf_profile` | ETF详细信息 | `symbol` | `alphavantage/etf/` |
| `fetch_forex_daily` | 外汇每日数据 | `from_symbol`, `to_symbol` | `forex/<from>_<to>.parquet` |
| `fetch_digital_currency_daily` | 数字货币每日数据 | `symbol`, `market` | `crypto/<symbol>_<market>_*.parquet` |
| `fetch_wti` | WTI原油价格 | `interval` | `commodities/WTI_<interval>.parquet` |
| `fetch_brent` | Brent原油价格 | `interval` | `commodities/BRENT_<interval>.parquet` |
| `fetch_copper` | 铜价数据 | `interval` | `commodities/COPPER_<interval>.parquet` |
| `fetch_treasury_yield` | 国债收益率 | `interval`, `maturity` | `alphavantage/treasury_*.parquet` |
| `fetch_news_sentiment` | 新闻情绪数据 | `tickers`, `topics`, `limit` | `news/<tickers>_<timestamp>.json` |

## 🔄 后续数据分析

### 使用代码解释器分析数据

每个响应都包含 `example_code` 字段，提供了在代码解释器中分析数据的完整示例：

```python
# 示例：分析股票数据
import pandas as pd
import matplotlib.pyplot as plt

# 1. 读取数据
df = pd.read_parquet('/srv/sandbox_workspaces/user123-session-abc/alphavantage/IBM_weekly.parquet')

# 2. 数据探索
print(f"数据形状: {df.shape}")
print(df.describe())

# 3. 可视化
plt.figure(figsize=(12, 6))
plt.plot(df['date'], df['close'], label='收盘价')
plt.title('IBM股价走势')
plt.xlabel('日期')
plt.ylabel('价格 (USD)')
plt.legend()
plt.show()
```

### 访问会话工作区文件

```python
from pathlib import Path

# 列出所有可用文件
session_path = Path('/srv/sandbox_workspaces/user123-session-abc')
for file_path in session_path.rglob('*.parquet'):
    print(f"Parquet文件: {file_path.relative_to(session_path)}")

for file_path in session_path.rglob('*.json'):
    print(f"JSON文件: {file_path.relative_to(session_path)}")
```

## 数据保存说明

所有通过此工具获取的数据都会自动保存到会话工作区：
- **路径**：`/srv/sandbox_workspaces/<session_id>/` 下的相应子目录
- **格式**：时间序列数据保存为Parquet格式，实时数据/新闻保存为JSON格式
- **目的**：数据持久化，便于后续分析和重复使用
- **清理**：会话24小时后自动清理，临时目录1小时后清理

## 最佳实践

1. **参数验证**：所有参数都有严格验证，请确保提供正确的格式
2. **错误处理**：工具会返回详细的错误信息，便于调试
3. **数据缓存**：相同参数的重复调用可能从本地缓存获取，提高性能
4. **API限制**：AlphaVantage有API调用频率限制，请合理使用
5. **大数据处理**：对于大量数据，响应中只显示前10条记录，完整数据保存在文件中

## ❌ 常见错误

- **缺少function参数**：`{"parameters": {"symbol": "IBM"}}`
- **错误的function名称**：`{"function": "get_stock_data", ...}`
- **参数类型错误**：`{"function": "fetch_weekly_adjusted", "parameters": {"symbol": 123}}`
- **缺少必需参数**：`{"function": "fetch_weekly_adjusted", "parameters": {}}`
- **会话目录权限问题**：确保 `/srv/sandbox_workspaces/` 目录有正确的写入权限
- **API Key未配置**：检查 `.env` 文件中的 `ALPHAVANTAGE_API_KEY` 设置
