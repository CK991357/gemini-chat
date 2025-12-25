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

## 🎯 测试验证状态
✅ **13个功能全部通过测试**（基于免费API套餐）
- 12个功能完全可用，获取真实数据
- 1个功能需要付费API（fetch_historical_options）
- 1个功能API可能返回空数据（fetch_earnings_transcript）

## 核心特性

1. **会话隔离存储**：每个会话的数据独立存储，互不干扰
2. **自动清理机制**：会话24小时后自动清理，临时会话1小时清理
3. **代码解释器集成**：数据自动保存到代码解释器可访问的目录
4. **13个完整功能**：覆盖股票、外汇、加密货币、大宗商品、期权、财报、新闻情绪等
5. **标准化输出**：返回格式化的JSON数据，便于前端处理

## 📋 数据保存与工作区管理

### 数据保存路径（会话隔离）：
```
/srv/sandbox_workspaces/<session_id>/
├── stock/                 # 股票数据 (*.parquet)
│   └── AAPL.parquet      # 苹果公司股票数据
│   └── IBM.parquet       # IBM股票数据
│   └── <symbol>_quote.json # 实时行情数据
├── forex/                # 外汇数据 (*.parquet)
│   └── USD_JPY.parquet   # 美元兑日元数据
│   └── EUR_USD.parquet   # 欧元兑美元数据
├── crypto/               # 加密货币数据 (*.parquet)
│   └── BTC_USD.parquet   # 比特币对美元数据
├── commodities/          # 大宗商品数据 (*.parquet)
│   └── WTI_monthly.parquet    # WTI原油月度数据
│   └── BRENT_monthly.parquet  # Brent原油月度数据
│   └── COPPER_monthly.parquet # 铜价月度数据
├── treasury/             # 国债收益率数据 (*.parquet)
│   └── TREASURY_10year_monthly.parquet # 10年期国债收益率
├── news/                 # 新闻情绪数据 (*.json)
│   └── news_AAPL.json    # 苹果公司相关新闻
│   └── news_SPY.json     # SPY ETF相关新闻
├── etf/                  # ETF数据 (*.json)
│   └── SPY_profile.json  # SPY ETF详细信息
├── insider/              # 内部人交易数据 (*.json)
│   └── AAPL_insider.json # 苹果公司内部交易
├── transcripts/          # 财报电话会议记录 (*.json)
│   └── AAPL_2024-Q1.json # 苹果公司财报记录
├── options/              # 期权数据 (*.parquet)
│   └── AAPL_2024-01-19.parquet # 苹果公司期权数据
└── digital_currency/     # 数字货币数据 (*.parquet)
    └── BTC_USD.parquet   # 比特币对美元数据
```

### 会话管理：
- **会话ID**：工具调用时传递`session_id`参数
- **会话超时**：24小时自动清理（通过代码解释器的清理机制）
- **临时会话**：无session_id时使用临时目录，1小时后清理
- **数据共享**：同一会话中的数据可供代码解释器直接访问

### 架构流程：
```
AlphaVantage API → Python工具服务 → 保存到会话目录 (/srv/sandbox_workspaces/<session_id>/)
                          ↓
代码解释器（Docker）通过挂载 /srv/sandbox_workspaces/ 访问会话数据
```

## 调用结构

**基本调用格式：**
```json
{
  "tool_name": "alphavantage",
  "session_id": "<会话ID>",  // 可选，但强烈建议提供
  "parameters": {
    "function": "<功能名称>",
    "parameters": {
      "<参数名>": "<参数值>"
    }
  }
}
```

## 功能示例

### 📈 示例 1: 获取股票周调整数据（带session_id）

**✅ 正确示例：**
```json
{
  "tool_name": "alphavantage",
  "session_id": "user123-session-abc",
  "parameters": {
    "function": "fetch_weekly_adjusted",
    "parameters": {
      "symbol": "AAPL"
    }
  }
}
```

**返回数据格式：**
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
        "date": "1999-11-12",
        "open": 87.75,
        "high": 97.73,
        "low": 86.75,
        "close": 90.62,
        "adjusted_close": 0.6794,
        "volume": 25776200,
        "dividend": 0.0
      }
    ],
    "message": "数据过多，显示前10条，共1364条"
  },
  "metadata": {
    "function": "fetch_weekly_adjusted",
    "parameters": {"symbol": "AAPL"},
    "session_id": "user123-session-abc",
    "timestamp": "2025-12-25T11:55:01.872000",
    "saved_files": [
      "/srv/sandbox_workspaces/user123-session-abc/stock/AAPL.parquet"
    ],
    "data_type": "fetch_weekly_adjusted",
    "session_dir": "/srv/sandbox_workspaces/user123-session-abc",
    "data_access_path": "/srv/sandbox_workspaces/user123-session-abc",
    "example_code": "# AlphaVantage数据分析示例...",
    "instructions": "数据已保存到会话目录，代码解释器可以通过 /srv/sandbox_workspaces/user123-session-abc/ 访问这些文件。"
  }
}
```

### 📊 示例 2: 获取实时行情

**✅ 正确示例：**
```json
{
  "tool_name": "alphavantage",
  "session_id": "user123-session-abc",
  "parameters": {
    "function": "fetch_global_quote",
    "parameters": {
      "symbol": "AAPL"
    }
  }
}
```

**返回数据格式：**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "open": 272.34,
    "high": 275.43,
    "low": 272.195,
    "price": 273.81,
    "volume": 17910574,
    "latest_trading_day": "2025-12-24",
    "previous_close": 272.36,
    "change": 1.45,
    "change_percent": "0.53%"
  },
  "metadata": {
    "function": "fetch_global_quote",
    "parameters": {"symbol": "AAPL"},
    "session_id": "user123-session-abc",
    "timestamp": "2025-12-25T11:55:16.415000",
    "saved_files": [
      "/srv/sandbox_workspaces/user123-session-abc/stock/AAPL_quote.json"
    ],
    "data_type": "fetch_global_quote",
    "session_dir": "/srv/sandbox_workspaces/user123-session-abc",
    "data_access_path": "/srv/sandbox_workspaces/user123-session-abc"
  }
}
```

### 💱 示例 3: 获取外汇数据

**✅ 正确示例：**
```json
{
  "tool_name": "alphavantage",
  "session_id": "user123-session-abc",
  "parameters": {
    "function": "fetch_forex_daily",
    "parameters": {
      "from_symbol": "USD",
      "to_symbol": "JPY",
      "outputsize": "compact"
    }
  }
}
```

**数据保存位置：** `/srv/sandbox_workspaces/user123-session-abc/forex/USD_JPY.parquet`

## 所有可用功能

| 功能 | 描述 | 主要参数 | 数据文件格式 | 保存位置 |
|------|------|----------|--------------|----------|
| `fetch_weekly_adjusted` | 股票周调整数据 | `symbol` | Parquet | `stock/<symbol>.parquet` |
| `fetch_global_quote` | 实时行情数据 | `symbol` | JSON | `stock/<symbol>_quote.json` |
| `fetch_historical_options` | 历史期权数据 | `symbol`, `date` | Parquet | `options/<symbol>_<date>.parquet` |
| `fetch_earnings_transcript` | 财报电话会议记录 | `symbol`, `quarter` | JSON | `transcripts/<symbol>_<quarter>.json` |
| `fetch_insider_transactions` | 内部人交易数据 | `symbol` | JSON | `insider/<symbol>_insider.json` |
| `fetch_etf_profile` | ETF详细信息 | `symbol` | JSON | `etf/<symbol>_profile.json` |
| `fetch_forex_daily` | 外汇每日数据 | `from_symbol`, `to_symbol`, `outputsize` | Parquet | `forex/<from>_<to>.parquet` |
| `fetch_digital_currency_daily` | 数字货币每日数据 | `symbol`, `market` | Parquet | `crypto/<symbol>_<market>.parquet` |
| `fetch_wti` | WTI原油价格 | `interval` | Parquet | `commodities/WTI_<interval>.parquet` |
| `fetch_brent` | Brent原油价格 | `interval` | Parquet | `commodities/BRENT_<interval>.parquet` |
| `fetch_copper` | 铜价数据 | `interval` | Parquet | `commodities/COPPER_<interval>.parquet` |
| `fetch_treasury_yield` | 国债收益率 | `interval`, `maturity` | Parquet | `treasury/TREASURY_<maturity>_<interval>.parquet` |
| `fetch_news_sentiment` | 新闻情绪数据 | `tickers`, `topics`, `limit` | JSON | `news/news_<tickers>.json` |

## 🔄 代码解释器访问示例

### 基本数据访问
```python
import pandas as pd
import json
from pathlib import Path

# 通过session_id访问数据
session_id = "user123-session-abc"
session_path = Path(f"/srv/sandbox_workspaces/{session_id}")

print(f"会话目录: {session_path}")

# 列出所有可用文件
print("\n📁 可用文件:")
for dir_path in session_path.iterdir():
    if dir_path.is_dir():
        files = list(dir_path.glob("*"))
        if files:
            print(f"  📂 {dir_path.name}/: {len(files)} 个文件")
            for file in files[:3]:  # 显示前3个文件
                size_kb = file.stat().st_size / 1024
                print(f"    📄 {file.name} ({size_kb:.1f} KB)")
```

### 股票数据分析
```python
# 读取特定股票数据
symbol = "AAPL"
stock_file = session_path / 'stock' / f'{symbol}.parquet'

if stock_file.exists():
    df = pd.read_parquet(stock_file)
    print(f"📈 {symbol} 股票数据:")
    print(f"数据形状: {df.shape}")
    print(f"日期范围: {df.index.min()} 到 {df.index.max()}")
    
    # 计算技术指标
    df['MA_20'] = df['close'].rolling(window=20).mean()
    df['MA_50'] = df['close'].rolling(window=50).mean()
    
    # 可视化
    import matplotlib.pyplot as plt
    
    plt.figure(figsize=(14, 8))
    
    # 价格走势
    plt.subplot(2, 1, 1)
    plt.plot(df.index, df['close'], label='收盘价', linewidth=2)
    plt.plot(df.index, df['MA_20'], label='20日均线', alpha=0.7)
    plt.plot(df.index, df['MA_50'], label='50日均线', alpha=0.7)
    plt.title(f'{symbol} 股价走势与技术分析')
    plt.xlabel('日期')
    plt.ylabel('价格 (USD)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # 成交量
    plt.subplot(2, 1, 2)
    plt.bar(df.index, df['volume'], label='成交量', alpha=0.6)
    plt.xlabel('日期')
    plt.ylabel('成交量')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
```

### 外汇数据分析
```python
# 读取外汇数据
from_sym = "USD"
to_sym = "JPY"
forex_file = session_path / 'forex' / f'{from_sym}_{to_sym}.parquet'

if forex_file.exists():
    df = pd.read_parquet(forex_file)
    print(f"💱 {from_sym}/{to_sym} 外汇数据:")
    print(f"数据形状: {df.shape}")
    
    # 计算收益率
    df['returns'] = df['close'].pct_change()
    
    # 统计分析
    print("\n📊 基本统计:")
    print(df[['open', 'high', 'low', 'close']].describe())
    
    print("\n📈 收益率统计:")
    print(df['returns'].describe())
    
    # 可视化汇率走势
    plt.figure(figsize=(12, 6))
    plt.plot(df.index, df['close'], label=f'{from_sym}/{to_sym}', linewidth=2)
    plt.title(f'{from_sym}/{to_sym} 汇率走势')
    plt.xlabel('日期')
    plt.ylabel('汇率')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.show()
```

### 新闻情绪分析
```python
# 读取新闻数据
import json
news_dir = session_path / 'news'

# 查找最新的新闻文件
news_files = list(news_dir.glob("*.json"))
if news_files:
    latest_news = max(news_files, key=lambda x: x.stat().st_mtime)
    
    with open(latest_news, 'r', encoding='utf-8') as f:
        news_data = json.load(f)
    
    print("📰 新闻数据分析:")
    
    if 'feed' in news_data:
        print(f"新闻总数: {len(news_data['feed'])}")
        
        # 情绪分布
        sentiment_counts = {}
        for item in news_data['feed']:
            sentiment = item.get('overall_sentiment_label', 'Unknown')
            sentiment_counts[sentiment] = sentiment_counts.get(sentiment, 0) + 1
        
        print("\n🎭 情绪分布:")
        for sentiment, count in sentiment_counts.items():
            percentage = (count / len(news_data['feed'])) * 100
            print(f"  {sentiment}: {count} 条 ({percentage:.1f}%)")
        
        # 显示热门新闻
        print("\n🔥 热门新闻标题 (前5条):")
        for i, item in enumerate(news_data['feed'][:5]):
            title = item.get('title', '无标题')
            source = item.get('source', '未知来源')
            sentiment = item.get('overall_sentiment_label', 'N/A')
            print(f"{i+1}. {title[:80]}...")
            print(f"   来源: {source} | 情绪: {sentiment}")
            print()
```

### 批量处理多个股票
```python
# 批量分析多个股票
symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
results = []

for symbol in symbols:
    stock_file = session_path / 'stock' / f'{symbol}.parquet'
    if stock_file.exists():
        df = pd.read_parquet(stock_file)
        
        if len(df) > 50:  # 至少有50周数据
            # 计算最近50周收益率
            start_price = df['close'].iloc[-50]
            end_price = df['close'].iloc[-1]
            annual_return = (end_price - start_price) / start_price * 100
            
            # 计算波动率
            returns = df['close'].pct_change().dropna()
            volatility = returns.std() * (52 ** 0.5) * 100  # 年化波动率
            
            results.append({
                'symbol': symbol,
                'current_price': end_price,
                'annual_return_pct': annual_return,
                'volatility_pct': volatility,
                'data_points': len(df)
            })

# 显示结果
if results:
    results_df = pd.DataFrame(results)
    print("📊 股票比较分析:")
    print(results_df)
    
    # 可视化比较
    plt.figure(figsize=(10, 6))
    x = range(len(results_df))
    plt.bar(x, results_df['annual_return_pct'], alpha=0.7, label='年化收益率 (%)')
    plt.xticks(x, results_df['symbol'])
    plt.xlabel('股票代码')
    plt.ylabel('年化收益率 (%)')
    plt.title('股票收益率比较')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.show()
```

## ⚠️ 重要注意事项

### API限制与套餐
1. **免费API限制**：每分钟5次请求，每天500次请求
2. **付费功能**：`fetch_historical_options` 需要付费API套餐
3. **数据可用性**：某些功能可能返回空数据，取决于API当前状态
4. **升级链接**：[AlphaVantage Premium](https://www.alphavantage.co/premium/)

### 数据管理
1. **会话隔离**：每个session_id的数据独立存储，互不干扰
2. **自动清理**：代码解释器会自动清理24小时未使用的会话
3. **磁盘空间**：监控磁盘使用情况，特别是大量数据积累时
4. **备份策略**：重要数据建议在代码解释器中进行处理并导出

### 最佳实践
1. **使用session_id**：始终传递session_id参数，确保数据保存到正确位置
2. **错误处理**：工具会返回详细错误信息，便于调试
3. **API调用管理**：控制调用频率，避免超出免费限制
4. **数据验证**：检查返回数据的完整性和准确性
5. **代码解释器集成**：利用返回的example_code字段快速进行数据分析

## ❌ 常见错误与解决方案

| 错误类型 | 可能原因 | 解决方案 |
|----------|----------|----------|
| **API Key警告** | API Key未配置或使用默认值 | 检查`.env`文件中的`ALPHAVANTAGE_API_KEY`设置 |
| **付费API限制** | 调用需要付费的功能 | 升级到付费套餐或使用其他免费功能 |
| **数据为空** | API未返回数据 | 检查参数正确性，或API当前无数据 |
| **目录权限问题** | 工作区目录无写入权限 | 确保`/srv/sandbox_workspaces/`目录有777权限 |
| **磁盘空间不足** | 数据积累过多 | 代码解释器会自动清理旧会话，或手动清理 |
| **网络连接失败** | API服务器不可达 | 检查网络连接，稍后重试 |
| **会话目录不存在** | session_id不正确或目录未创建 | 确保传递有效的session_id参数 |
