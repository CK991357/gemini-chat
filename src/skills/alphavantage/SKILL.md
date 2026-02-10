---
name: alphavantage
description: 金融数据获取工具，从AlphaVantage API获取股票、外汇、加密货币、大宗商品等多种金融数据
tool_name: alphavantage
category: finance-data
priority: 5
tags: ["stock", "forex", "crypto", "commodity", "finance", "alpha-vantage"]
version: 3.0
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

### 成功响应示例
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
    "session_id": "user123-session-abc",
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

### 错误响应示例
```json
{
  "success": false,
  "error": "API调用失败: 无效的股票代码",
  "mode": "weekly_adjusted"
}
```

## 🗂️ 数据保存结构

### 会话工作区目录
```
/srv/sandbox_workspaces/
└── temp/                    # 临时会话目录
    ├── stock_AAPL.parquet      # 股票数据
    ├── quote_MSFT.json         # 实时行情
    ├── forex_USD_JPY.parquet   # 外汇数据
    ├── crypto_BTC_USD.parquet  # 加密货币数据
    ├── commodity_WTI_monthly.parquet  # 大宗商品
    ├── commodity_BRENT_monthly.parquet
    ├── commodity_COPPER_monthly.parquet
    ├── treasury_10year_monthly.parquet  # 国债收益率
    ├── news_AAPL_MSFT.json     # 新闻数据
    ├── etf_SPY_profile.json    # ETF数据
    ├── insider_AAPL.json       # 内部交易
    ├── transcript_AAPL_2024-Q1.json  # 财报记录
    ├── overview_AAPL.json      # 公司概况
    ├── income_statement_AAPL.json  # 利润表
    ├── balance_sheet_AAPL.json  # 资产负债表
    ├── cash_flow_AAPL.json     # 现金流量表
    ├── earnings_AAPL.json      # 每股收益
    ├── earnings_estimates_AAPL.json  # 盈利预测
    ├── dividends_AAPL.json     # 股息历史
    └── shares_outstanding_AAPL.json  # 流通股数量
```

## ⚠️ 重要注意事项

### API限制
1. **免费套餐限制**：每分钟5次请求，每天500次请求
2. **数据延迟**：股票数据通常有15-20分钟延迟
3. **数据完整性**：某些历史数据可能不完整
4. **请求频率**：避免高频API调用，建议批量处理

### 会话管理
1. **会话目录**：数据默认保存到 `/srv/sandbox_workspaces/temp/` 目录
2. **临时存储**：临时目录数据可能定期清理
3. **磁盘空间**：大数据量时注意磁盘使用情况

### 最佳实践
1. **数据验证**：始终检查返回的 `success` 字段
2. **参数检查**：确保提供正确的参数格式
3. **错误处理**：处理API调用可能失败的情况
4. **数据缓存**：对于频繁访问的数据考虑本地缓存

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

## 📚 相关资源

- [AlphaVantage官方文档](https://www.alphavantage.co/documentation/)
- [API套餐升级](https://www.alphavantage.co/premium/)
- [金融数据格式说明](https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=IBM&apikey=demo)

---

**版本信息**: 3.0  
**最后更新**: 2025-12-25  
**支持模式**: 20种金融数据获取功能  
**数据保存**: 自动保存到会话工作区目录  
**兼容性**: 支持股票、外汇、加密货币、大宗商品、国债、新闻、基本面数据等