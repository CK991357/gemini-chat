# 量化估值偏差策略系统 —— 完整使用指南

## 目录

- [量化估值偏差策略系统 —— 完整使用指南](#量化估值偏差策略系统--完整使用指南)
  - [目录](#目录)
  - [项目概述](#项目概述)
  - [系统要求与安装](#系统要求与安装)
    - [环境要求](#环境要求)
    - [依赖库](#依赖库)
    - [文件结构](#文件结构)
  - [数据准备](#数据准备)
  - [模块说明](#模块说明)
  - [量化策略核心原理](#量化策略核心原理)
    - [5.1 估值偏差 (Bias)](#51-估值偏差-bias)
    - [5.2 偏差区间划分](#52-偏差区间划分)
    - [5.3 条件统计量](#53-条件统计量)
    - [5.4 凯利公式与仓位建议](#54-凯利公式与仓位建议)
    - [5.5 回测机制](#55-回测机制)
  - [命令行使用指南](#命令行使用指南)
    - [6.1 生成历史估值文件](#61-生成历史估值文件)
    - [6.2 训练量化模型](#62-训练量化模型)
    - [6.3 实时预测](#63-实时预测)
    - [6.4 回测策略](#64-回测策略)
    - [6.5 阈值分析（拐点探测）](#65-阈值分析拐点探测)
  - [输出文件解读](#输出文件解读)
    - [7.1 历史估值文件 (msft\_valuations.json)](#71-历史估值文件-msft_valuationsjson)
    - [7.2 训练模型文件 (MSFT\_quant\_model.pkl)](#72-训练模型文件-msft_quant_modelpkl)
    - [7.3 预测报告 (valuation\_report\_\*.md)](#73-预测报告-valuation_report_md)
    - [7.4 回测报告 (backtest\_report\_\*/report.md)](#74-回测报告-backtest_report_reportmd)
  - [高级自定义与优化建议](#高级自定义与优化建议)
    - [8.1 修改偏差区间](#81-修改偏差区间)
    - [8.2 调整持有期](#82-调整持有期)
    - [8.3 合并稀疏区间](#83-合并稀疏区间)
    - [8.4 等频分箱](#84-等频分箱)
  - [常见问题与解答](#常见问题与解答)
  - [参考文献](#参考文献)
  - [简化版完整运行步骤](#简化版完整运行步骤)

---

## 项目概述

本系统是一个基于财务估值模型（DCF）与量化统计相结合的股票分析工具。它的核心思想是：利用每年财报发布后计算出的每股内在价值，与每周的股价进行比较，得到“估值偏差”（bias）。通过统计历史上不同偏差区间后续的股价表现（未来收益率），找出规律，从而对当前偏差做出概率判断，并利用凯利公式给出仓位建议。整个流程包括：

- 生成历史估值（基于每年财报的DCF模型）
- 构建偏差时间序列
- 划分偏差区间并计算条件统计量（胜率、平均收益、盈亏比）
- 训练模型（保存统计结果）
- 实时预测（根据当前股价和最新估值给出建议）
- 回测验证策略效果
- 阈值分析（寻找拐点）

该系统适用于对个股进行长期价值投资中的动态仓位管理，帮助投资者在估值过低时加大仓位，估值过高时降低仓位。

---

## 系统要求与安装

### 环境要求
- Python 3.8 及以上
- 操作系统：Windows / macOS / Linux

### 依赖库
安装以下 Python 包（建议使用虚拟环境）：
```bash
pip install numpy pandas matplotlib pydantic
```
此外，还需要 `dcf_valuation_tool.py` 和 `quant_dcf_auto_all.py`（已在项目中提供），它们实现了DCF估值模型。

### 文件结构
确保项目目录中包含以下文件：
```
your_project/
│
├── quant_build_valuation_history.py   # 生成历史估值
├── quant_main.py                       # 主程序（训练/预测/回测/阈值）
├── quant_strategy.py                    # 量化策略核心类
├── quant_dcf_auto_all.py                # DCF自动估值（支持历史截断）
├── quant_valuation_history_utils.py      # 估值历史工具函数
├── dcf_valuation_tool.py                 # DCF估值工具（底层）
├── data/                                 # 数据文件夹
│   ├── income_statement_MSFT.json
│   ├── balance_sheet_MSFT.json
│   ├── cash_flow_MSFT.json
│   ├── overview_MSFT.json
│   ├── earnings_estimates_MSFT.json
│   ├── dividends_MSFT.json
│   ├── treasury_10year_daily.parquet
│   └── stock_MSFT.parquet
├── models/                               # 模型保存目录（自动创建）
└── output/                               # 报告输出目录（自动创建）
```

---

## 数据准备

系统依赖以下数据文件（以 MSFT 为例，符号可替换）：

1. **财务报表（JSON）**
   - `income_statement_<symbol>.json`：利润表（年度）
   - `balance_sheet_<symbol>.json`：资产负债表（年度）
   - `cash_flow_<symbol>.json`：现金流量表（年度）
   - 这些文件可从 Alpha Vantage 等数据源获取，格式需符合其 API 返回结构。

2. **公司概览**
   - `overview_<symbol>.json`：包含公司名称、Beta、发行股本等。

3. **盈利预测**
   - `earnings_estimates_<symbol>.json`：分析师对未来年度的EPS和收入预测（用于DCF中的增长率）。

4. **股息数据**
   - `dividends_<symbol>.json`：历史股息记录（用于部分模型，非必需）。

5. **无风险利率**
   - `treasury_10year_daily.parquet`：10年期国债收益率日线数据，包含日期和收益率列。

6. **周线股价**
   - `stock_<symbol>.parquet`：股票周线数据，必须包含 `date` 和 `adjusted_close`（复权收盘价）。

确保所有文件放置在 `data/` 目录下，文件名中的 `<symbol>` 需与命令行参数 `--symbol` 一致。

---

## 模块说明

| 文件名 | 作用 |
|--------|------|
| `quant_build_valuation_history.py` | 读取历年财务报表，调用 `quant_dcf_auto_all` 为每个财年生成历史估值（使用截至该年的数据），输出 JSON 文件。 |
| `quant_dcf_auto_all.py` | 扩展的 DCF 自动估值类，支持 `as_of_year` 参数，可基于特定年份前的数据进行估值。 |
| `quant_valuation_history_utils.py` | 工具函数，将 `as_of_year` 传递给 DCF 估值器。 |
| `quant_strategy.py` | 核心量化策略类 `QuantStrategy`，包含偏差序列构建、条件统计计算、回测、报告生成。 |
| `quant_main.py` | 命令行入口，整合训练、预测、回测、阈值分析。 |
| `dcf_valuation_tool.py` | 底层 DCF 模型，计算企业价值、股权价值、每股价值。 |

---

## 量化策略核心原理

### 5.1 估值偏差 (Bias)

对于每个财报发布日（报告日），我们有一个新的内在价值 `V`。从该日起直到下一个报告日，我们假定这个 `V` 是合理的参考价值。对于每周的股价 `P`，定义偏差：

```
bias = (P - V) / V
```

- `bias > 0`：股价高于内在价值（高估）
- `bias < 0`：股价低于内在价值（低估）

### 5.2 偏差区间划分

为了将连续偏差离散化，我们将偏差范围划分为若干区间（bins）。例如，`[-1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5]` 对应区间：`-150%~-120%`, `-120%~-90%`, … , `120%~150%`。每个周点根据其偏差值落入某个区间。

### 5.3 条件统计量

对于每个区间，我们统计所有落入该区间的周点，并计算未来 `horizon_weeks` 周（例如52周）的收益率：

- **样本数 (Count)**：该区间内周点的个数。
- **胜率 (Win Rate)**：未来收益率为正的比例。
- **平均收益 (Mean Return)**：未来收益率的算术平均值。
- **盈亏比 (Profit/Loss Ratio)**：平均盈利 / 平均亏损的绝对值（盈利指收益率为正的样本，亏损指收益率为负的样本）。

这些统计量构成了该区间的“历史表现画像”。

### 5.4 凯利公式与仓位建议

凯利公式用于在已知胜率 `p` 和盈亏比 `b` 的情况下，计算最优投资比例：

```
f = (p * (b + 1) - 1) / b
```

其中 `f` 是应投入资金的比例（0~1）。为了降低风险，通常采用“半凯利” `f/2`。在系统中，我们为每个区间计算出半凯利仓位，若当前偏差落入某区间，则建议按该比例持仓。若胜率低于60%，则不开仓。

### 5.5 回测机制

回测模拟策略在历史上的表现：
- 每周检查当前偏差，若其所在区间胜率 ≥ 60%，则开仓（投入半凯利比例的资金）。
- 持有固定周数 `horizon_weeks` 后平仓（无论盈亏）。
- 记录每笔交易，并计算最终资金曲线、总收益率、年化收益率、夏普比率等。

回测结果用于评估策略的有效性。

---

## 命令行使用指南

所有操作通过 `quant_main.py` 执行，支持四个子命令：`--train`、`--predict`、`--backtest`、`--thresholds`。

### 6.1 生成历史估值文件

**命令**：
```bash
python quant_build_valuation_history.py --symbol <股票代码> --data-dir data --output-file <输出文件名>.json [--projection-years 5] [--terminal-growth 0.025] [--risk-free-method latest] [--market-premium 0.06]
```

**参数说明**：
- `--symbol`：股票代码，如 MSFT。
- `--data-dir`：数据目录，默认 `data`。
- `--output-file`：输出的 JSON 文件路径，如 `msft_valuations.json`。
- `--projection-years`：DCF 预测年数，默认 5。
- `--terminal-growth`：永续增长率，默认 0.025。
- `--risk-free-method`：无风险利率取值方式，`latest` 或 `1y_avg`，默认 `latest`。
- `--market-premium`：市场风险溢价，默认 0.06。

**示例**：
```bash
python quant_build_valuation_history.py --symbol MSFT --data-dir data --output-file msft_valuations.json
```

生成的文件包含每个财年的 `fiscal_year`、`report_date`（报告日）、`value`（每股估值）。

### 6.2 训练量化模型

**命令**：
```bash
python quant_main.py --symbol <股票代码> --data-dir data --valuation-file <历史估值文件> --train --horizon-weeks <持有周数> --bins "<边界列表>"
```

**参数说明**：
- `--symbol`：股票代码。
- `--data-dir`：数据目录（需包含周线文件 `stock_<symbol>.parquet`）。
- `--valuation-file`：历史估值 JSON 文件路径（由上一步生成）。
- `--train`：训练模式。
- `--horizon-weeks`：持有周数，建议 52（一年）。
- `--bins`：偏差区间边界，逗号分隔的浮点数列表。**注意**：在 PowerShell 中需用等号连接，如 `--bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5"`。

**示例**：
```bash
python quant_main.py --symbol MSFT --data-dir data --valuation-file msft_valuations.json --train --horizon-weeks 52 --bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5"
```

训练完成后，会在 `models/` 目录生成 `<symbol>_quant_model.pkl` 文件。

### 6.3 实时预测

**命令**：
```bash
python quant_main.py --symbol <股票代码> --data-dir data --model-dir models --predict --current-price <当前股价> --current-value <最新估值> [--output-dir output]
```

**参数说明**：
- `--predict`：预测模式。
- `--current-price`：当前股价。
- `--current-value`：最新估值（可从 `msft_valuations.json` 中获取最新 `value`）。
- `--output-dir`：可选，若指定，将在该目录下生成带时间戳的子文件夹，内含详细报告（Markdown + 图片）。

**示例**：
```bash
python quant_main.py --symbol MSFT --data-dir data --model-dir models --predict --current-price 400 --current-value 179.43 --output-dir output
```

控制台将输出简要信息，同时在 `output/valuation_report_MSFT_时间戳/` 下生成详细报告。

### 6.4 回测策略

**命令**：
```bash
python quant_main.py --symbol <股票代码> --data-dir data --valuation-file <历史估值文件> --backtest --horizon-weeks <持有周数> --bins "<边界列表>" --output-dir output
```

**示例**：
```bash
python quant_main.py --symbol MSFT --data-dir data --valuation-file msft_valuations.json --backtest --horizon-weeks 52 --bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5" --output-dir output
```

回测完成后，在 `output/backtest_report_MSFT_时间戳/` 下生成完整的回测报告（含表格、交易记录、五张图表）。

### 6.5 阈值分析（拐点探测）

**命令**：
```bash
python quant_main.py --symbol <股票代码> --data-dir data --valuation-file <历史估值文件> --thresholds --horizon-weeks <持有周数> --bins "<边界列表>"
```

该命令仅输出各偏差区间的统计表格，不保存模型，用于快速观察不同区间的表现，寻找可能的拐点（如胜率由高转低的区间边界）。

**示例**：
```bash
python quant_main.py --symbol MSFT --data-dir data --valuation-file msft_valuations.json --thresholds --horizon-weeks 52 --bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5"
```

---

## 输出文件解读

### 7.1 历史估值文件 (msft_valuations.json)

JSON 数组，每个元素包含：
- `fiscal_year`：财年
- `report_date`：估值发布日期（假设为财年结束后90天）
- `value`：每股内在价值（美元）

**示例**：
```json
[
  {"fiscal_year": 2020, "report_date": "2021-03-31", "value": 184.48},
  {"fiscal_year": 2021, "report_date": "2022-03-31", "value": 182.59},
  ...
]
```

### 7.2 训练模型文件 (MSFT_quant_model.pkl)

Python pickle 格式，包含字典：
- `symbol`：股票代码
- `horizon_weeks`：持有期
- `bins`：区间边界列表
- `stats`：各区间统计信息列表（每个元素包含 `bias_bin`, `count`, `win_rate`, `mean_return`, `profit_loss_ratio`, `min_date`, `max_date`）
- `timestamp`：训练时间

### 7.3 预测报告 (valuation_report_*.md)

Markdown 文件，包含：
- 当前股价、估值、偏差
- 参数设置（持有期、偏差区间）
- 历史偏差区间统计表（含样本数、胜率、平均收益、盈亏比、样本时间范围）
- 当前偏差评估（所在区间、历史表现）
- 仓位建议（半凯利）
- 偏差分布条形图（用红色高亮当前区间）
- 风险提示

### 7.4 回测报告 (backtest_report_*/report.md)

综合报告，包含：
- 策略概述
- 数据来源说明
- 核心统计量解释
- 参数设置
- 各偏差区间统计表（含样本时间范围）
- **五张图表**：
  1. 偏差分布直方图 (英文)
  2. 各区间未来收益率箱线图 (英文)
  3. 偏差 vs 未来收益率散点图 (英文)
  4. 策略净值曲线 (英文)
  5. 股价 vs 内在价值时间序列图 (英文)
- 回测绩效（总收益、年化收益、夏普比率、交易次数等）
- 交易记录
- 当前偏差评估（基于最近数据）
- 仓位建议表格（各区间凯利仓位）
- 模型说明、优化建议、结论

所有图表保存在同一文件夹中，报告通过相对路径引用。

---

## 高级自定义与优化建议

### 8.1 修改偏差区间

根据股票的历史偏差分布，可能需要调整区间边界以覆盖实际出现的偏差范围。可以通过 `--bins` 参数自定义边界。例如，若股价从未低于-90%，可以去掉 `-150%~-120%` 等区间，或扩大高估区间。

**示例**（合并高估区间）：
```
--bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,1.5"
```

### 8.2 调整持有期

持有期 `horizon_weeks` 可根据投资周期调整。对于长期投资者，52周（一年）是合理选择；也可尝试 24周（半年）或 104周（两年），观察哪个周期下区间区分度最好。

### 8.3 合并稀疏区间

若某些区间样本数过少（如 <30），统计结果不可靠。可以在训练后手动合并相邻区间，或修改代码在 `calculate_conditional_stats` 中自动合并。当前版本支持在 `generate_report` 中提示样本不足，但未自动合并。建议用户根据阈值分析结果自行合并 bins。

### 8.4 等频分箱

当前系统使用固定边界划分区间。若希望每个区间样本数大致相等，可修改 `quant_strategy.py` 中的 `calculate_conditional_stats` 方法，改用 `pd.qcut`。这需要谨慎处理重复边界。

---

## 常见问题与解答

**Q1: 运行训练命令时出现 `argument --bins: expected one argument` 错误？**
A: 在 PowerShell 中，参数值如果包含逗号，需要用等号连接，例如 `--bins="-1.5,-1.2,..."`。在 cmd 中可直接使用空格和引号，如 `--bins "-1.5,-1.2,..."`。

**Q2: 生成的图片中方块乱码？**
A: 这是由于 matplotlib 默认字体不支持中文。解决方案：
   - 安装中文字体（如 SimHei、Microsoft YaHei）。
   - 或者在代码中将图表标题、标签改为英文（系统已默认使用英文，请勿修改）。
   - 如需中文，可添加以下代码设置字体：
     ```python
     plt.rcParams['font.sans-serif'] = ['Microsoft YaHei']
     plt.rcParams['axes.unicode_minus'] = False
     ```

**Q3: 历史估值文件中的报告日期如何确定？**
A: 目前硬编码为财年结束后90天，可根据实际情况调整 `quant_build_valuation_history.py` 中的 `timedelta(days=90)`。

**Q4: 为什么回测结果中某些区间胜率100%？**
A: 这通常是因为该区间样本数极少（如仅出现在特定牛市阶段），统计存在偶然性。建议合并稀疏区间或增加数据量。

**Q5: 如何验证DCF估值的准确性？**
A: 本系统的核心是利用历史估值与股价的偏差，而非DCF估值本身的绝对准确性。只要估值方法在不同年份一致，偏差序列即可用于量化分析。

**Q6: 可以用于多只股票吗？**
A: 可以，每只股票需独立准备数据文件，并在命令中替换 `--symbol` 参数。模型文件和报告会按股票代码区分。

---

## 参考文献

1. Damodaran, A. (2012). *Investment Valuation: Tools and Techniques for Determining the Value of Any Asset*. Wiley.
2. Kelly, J. L. (1956). A new interpretation of information rate. *Bell System Technical Journal*.
3. 本系统依赖的 DCF 模型实现参考了经典估值教材。

---

## 简化版完整运行步骤

命令使用顺序：

**1.第一步：生成历史估值（如果尚未生成）**
bash
python quant_build_valuation_history.py --symbol MSFT --data-dir data --output-file msft_valuations.json --projection-years 5 --terminal-growth 0.025

**2. 第二步：训练量化模型（使用52周持有期，扩展bins覆盖高估区间）**
bash
python quant_main.py --symbol MSFT --data-dir data --valuation-file msft_valuations.json --train --horizon-weeks 52 --bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5"

**3.第三步：运行回测并生成详细报告**
bash
python quant_main.py --symbol MSFT --data-dir data --valuation-file msft_valuations.json --backtest --horizon-weeks 52 --bins="-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5" --output-dir output
**4.第四步：生成的回测报告**
执行后，output 文件夹下会生成类似 backtest_report_MSFT_20260223_xxxxxx.md 的报告文件，包含完整的策略解释、统计表格、五张图表和详细分析。

**如果需要使用更宽的区间重新训练**
bash
python quant_main.py --symbol MSFT --train --valuation-file msft_valuations.json --horizon-weeks 12 --bins "-2.0,-1.5,-1.2,-0.9,-0.6,-0.3,0,0.3,0.6,0.9,1.2,1.5,2.0"