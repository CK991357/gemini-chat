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

`alphavantage` 是一个专业的金融数据获取工具，通过 AlphaVantage API 提供丰富的金融市场数据。数据会保存到会话工作区，与代码解释器共享。

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
| `historical_options` | 历史期权数据 | `symbol`, `date` | `{"symbol": "AAPL", "date": "2024-01-19"}` |
| `earnings_transcript` | 财报电话会议记录 | `symbol`, `quarter` | `{"symbol": "AAPL", "quarter": "2024-Q1"}` |
| `insider_transactions` | 内部人交易数据 | `symbol` | `{"symbol": "AAPL"}` |
| `etf_profile` | ETF详细信息 | `symbol` | `{"symbol": "SPY"}` |
| `forex_daily` | 外汇每日数据 | `from_symbol`, `to_symbol` | `{"from_symbol": "USD", "to_symbol": "JPY", "outputsize": "full"}` |
| `digital_currency_daily` | 数字货币每日数据 | `symbol`, `market` | `{"symbol": "BTC", "market": "USD"}` |
| `wti` | WTI原油价格 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `brent` | Brent原油价格 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `copper` | 铜价数据 | 无（可选的`interval`） | `{"interval": "monthly"}` |
| `treasury_yield` | 国债收益率 | `maturity` | `{"interval": "monthly", "maturity": "10year"}` |
| `news_sentiment` | 新闻情绪数据 | 无 | `{"tickers": "AAPL,MSFT", "limit": 50}` |

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
      "/srv/sandbox_workspaces/user123-session-abc/stock/AAPL.parquet"
    ],
    "data_type": "weekly_adjusted",
    "session_dir": "/srv/sandbox_workspaces/user123-session-abc",
    "example_code": "# AlphaVantage数据分析示例...",
    "instructions": "数据已保存到会话目录，代码解释器可以通过 /srv/sandbox_workspaces/user123-session-abc/ 访问这些文件。"
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
/srv/sandbox_workspaces/<session_id>/
├── stock/                 # 股票数据
│   ├── AAPL.parquet      # 苹果公司股票数据
│   └── MSFT_quote.json   # 微软实时行情
├── forex/                # 外汇数据
│   ├── USD_JPY.parquet   # 美元兑日元
│   └── EUR_USD.parquet   # 欧元兑美元
├── crypto/               # 加密货币
│   └── BTC_USD.parquet   # 比特币兑美元
├── commodities/          # 大宗商品
│   ├── WTI_monthly.parquet
│   ├── BRENT_monthly.parquet
│   └── COPPER_monthly.parquet
├── treasury/             # 国债收益率
│   └── TREASURY_10year_monthly.parquet
├── news/                 # 新闻数据
│   ├── news_AAPL.json
│   └── news_SPY.json
├── etf/                  # ETF数据
│   └── SPY_profile.json
├── insider/              # 内部交易
│   └── AAPL_insider.json
├── transcripts/          # 财报记录
│   └── AAPL_2024-Q1.json
├── options/              # 期权数据
│   └── AAPL_2024-01-19.parquet
└── digital_currency/     # 数字货币
    └── BTC_USD.parquet
```

## 🔧 代码解释器访问示例

### 基本数据读取
```python
import pandas as pd
import json
from pathlib import Path

# 访问会话数据
session_id = "your_session_id"
data_path = Path(f"/srv/sandbox_workspaces/{session_id}")

# 读取股票数据
stock_file = data_path / "stock" / "AAPL.parquet"
if stock_file.exists():
    df_stock = pd.read_parquet(stock_file)
    print(f"AAPL数据形状: {df_stock.shape}")
    print(df_stock.head())
```

### 股票数据分析
```python
# 技术分析示例
import matplotlib.pyplot as plt

df = pd.read_parquet("/srv/sandbox_workspaces/user123-session-abc/stock/AAPL.parquet")

# 计算移动平均线
df['MA_20'] = df['close'].rolling(window=20).mean()
df['MA_50'] = df['close'].rolling(window=50).mean()

# 绘制图表
plt.figure(figsize=(14, 8))
plt.plot(df.index, df['close'], label='收盘价', linewidth=2)
plt.plot(df.index, df['MA_20'], label='20日均线', alpha=0.7)
plt.plot(df.index, df['MA_50'], label='50日均线', alpha=0.7)
plt.title('AAPL 股价走势与技术分析')
plt.xlabel('日期')
plt.ylabel('价格 (USD)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
```

### 外汇数据分析
```python
# 外汇数据分析
df_forex = pd.read_parquet("/srv/sandbox_workspaces/user123-session-abc/forex/USD_JPY.parquet")

# 计算收益率和波动率
df_forex['returns'] = df_forex['close'].pct_change()
df_forex['volatility'] = df_forex['returns'].rolling(window=20).std()

print("外汇数据统计:")
print(f"数据点数: {len(df_forex)}")
print(f"平均汇率: {df_forex['close'].mean():.2f}")
print(f"最大汇率: {df_forex['close'].max():.2f}")
print(f"最小汇率: {df_forex['close'].min():.2f}")
```

### 批量处理多个股票
```python
import glob

# 获取所有股票文件
stock_files = glob.glob("/srv/sandbox_workspaces/user123-session-abc/stock/*.parquet")

results = []
for file in stock_files:
    symbol = Path(file).stem
    df = pd.read_parquet(file)
    
    if len(df) > 100:
        # 计算年化收益率
        start_price = df['close'].iloc[-100]
        end_price = df['close'].iloc[-1]
        annual_return = (end_price - start_price) / start_price * 100
        
        results.append({
            'symbol': symbol,
            'current_price': end_price,
            'annual_return_pct': annual_return,
            'data_points': len(df)
        })

# 转换为DataFrame分析
results_df = pd.DataFrame(results)
print("股票表现分析:")
print(results_df.sort_values('annual_return_pct', ascending=False))
```

## ⚠️ 重要注意事项

### API限制
1. **免费套餐限制**：每分钟5次请求，每天500次请求
2. **付费功能**：`historical_options` 需要付费套餐
3. **数据延迟**：股票数据通常有15-20分钟延迟
4. **数据完整性**：某些历史数据可能不完整

### 会话管理
1. **会话超时**：会话数据24小时后自动清理
2. **临时会话**：无session_id时使用临时目录（1小时清理）
3. **磁盘空间**：大数据量时注意磁盘使用情况

### 最佳实践
1. **始终提供session_id**：确保数据保存到正确位置
2. **错误处理**：检查返回的success字段
3. **批量处理**：避免高频API调用
4. **数据验证**：检查返回数据的完整性

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

### 完整的工作流示例
```python
# 1. 获取数据
response = await alphavantage({
  "mode": "weekly_adjusted",
  "parameters": {"symbol": "AAPL"}
})

# 2. 数据保存到会话目录
if response.success:
    print(f"数据已保存到: {response.metadata.session_dir}")
    
    # 3. 使用代码解释器分析
    code = f"""
    import pandas as pd
    df = pd.read_parquet('{response.metadata.saved_files[0]}')
    print(f'AAPL最新价格: {{df[\"close\"].iloc[-1]}} USD')
    print(f'今年涨幅: {{(df[\"close\"].iloc[-1] - df[\"close\"].iloc[0]) / df[\"close\"].iloc[0] * 100:.2f}}%')
    """
    
    # 4. 执行分析
    analysis_result = await python_sandbox({"code": code})
    return analysis_result
```

## 🆘 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| **API Key错误** | 环境变量未设置 | 检查ALPHAVANTAGE_API_KEY环境变量 |
| **数据为空** | 参数错误或API无数据 | 验证参数格式，检查示例 |
| **会话目录不存在** | session_id无效 | 确保使用有效的session_id |
| **磁盘空间不足** | 数据积累过多 | 清理旧会话，监控磁盘使用 |
| **网络超时** | API响应慢 | 增加超时时间，稍后重试 |

## 📚 相关资源

- [AlphaVantage官方文档](https://www.alphavantage.co/documentation/)
- [API套餐升级](https://www.alphavantage.co/premium/)
- [金融数据格式说明](https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=IBM&apikey=demo)
