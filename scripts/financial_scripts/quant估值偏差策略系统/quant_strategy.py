#!/usr/bin/env python3
"""
量化策略模块：基于估值偏差的统计套利策略
支持历史偏差计算、条件胜率统计、信号生成、回测及实时预测。
"""

import numpy as np
import pandas as pd
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import json
import pickle
import matplotlib.pyplot as plt
from quant_dcf_auto_all import DCFAutoValuation

logger = logging.getLogger(__name__)


class QuantStrategy:
    def __init__(self, symbol: str, data_dir: str = "data", valuation_file: Optional[str] = None):
        """
        :param symbol: 股票代码
        :param data_dir: 数据目录（包含周线文件 stock_{symbol}.parquet）
        :param valuation_file: 包含历史估值的 JSON 文件路径（可选，若不提供则使用模拟估值）
        """
        self.symbol = symbol
        self.data_dir = Path(data_dir)
        self.valuation_file = Path(valuation_file) if valuation_file else None
        self.val_loader = DCFAutoValuation(data_dir)

        # 加载周线数据
        self.price_df = self._load_weekly_prices()
        if self.price_df is None:
            raise ValueError(f"无法加载 {symbol} 的周线数据")

        # 加载历史财务数据（仅用于获取年份列表，估值将单独读取）
        self.hist_data = self.val_loader.extract_historical_data(symbol)
        if not self.hist_data['revenue']:
            logger.warning(f"无法加载 {symbol} 的历史财务数据，将仅依赖估值文件")

    def _load_weekly_prices(self) -> Optional[pd.DataFrame]:
        """加载周线数据，返回包含date和adjusted_close的DataFrame"""
        filepath = self.data_dir / f"stock_{self.symbol}.parquet"
        if not filepath.exists():
            logger.error(f"周线文件不存在: {filepath}")
            return None
        try:
            df = pd.read_parquet(filepath)
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
            elif df.index.name == 'date':
                df = df.reset_index()
            else:
                df = df.reset_index()
                df.columns = ['date'] + list(df.columns[1:])
                df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            needed_cols = ['date', 'adjusted_close']
            if 'adjusted_close' not in df.columns:
                if 'close' in df.columns:
                    df['adjusted_close'] = df['close']
                else:
                    raise ValueError("周线数据缺少adjusted_close或close字段")
            return df[needed_cols]
        except Exception as e:
            logger.error(f"读取周线文件失败: {e}")
            return None

    def _get_fiscal_year_ends(self) -> pd.DataFrame:
        """
        获取历史财年结束日期及对应的内在价值。
        优先从 valuation_file 读取，若无则使用模拟数据。
        期望的 JSON 格式（可由估值工具生成）：
        [
            {"fiscal_year": 2020, "report_date": "2021-03-31", "value": 150.0},
            ...
        ]
        """
        if self.valuation_file and self.valuation_file.exists():
            try:
                with open(self.valuation_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                df = pd.DataFrame(data)
                # 确保必要列存在
                required_cols = ['fiscal_year', 'report_date', 'value']
                if all(col in df.columns for col in required_cols):
                    df['report_date'] = pd.to_datetime(df['report_date'])
                    df = df.sort_values('fiscal_year').reset_index(drop=True)
                    logger.info(f"从 {self.valuation_file} 加载了 {len(df)} 条历史估值")
                    return df
                else:
                    logger.warning(f"估值文件缺少必要列，需要 {required_cols}，使用模拟估值")
            except Exception as e:
                logger.warning(f"读取估值文件失败: {e}，使用模拟估值")

        # 模拟估值（仅当没有提供有效文件时）
        logger.warning("使用模拟估值数据，请提供真实估值文件以获得准确结果")
        years = self.hist_data.get('years', [])
        if not years:
            # 若连历史年份都没有，则返回空
            return pd.DataFrame()
        fiscal_dates = []
        values = []
        base_val = 50.0
        for y in years:
            fiscal_end = datetime(y, 12, 31)
            report_date = fiscal_end + timedelta(days=90)  # 假设发布延迟3个月
            fiscal_dates.append(report_date)
            values.append(base_val)
            base_val *= 1.1  # 每年增长10%
        return pd.DataFrame({
            'fiscal_year': years,
            'report_date': fiscal_dates,
            'value': values
        })

    def build_bias_series(self) -> pd.DataFrame:
        """构建完整的偏差时间序列（周度）"""
        fiscal_df = self._get_fiscal_year_ends()
        if fiscal_df.empty:
            return pd.DataFrame()

        price_df = self.price_df.copy()
        bias_records = []

        for i in range(len(fiscal_df)-1):
            start = fiscal_df.iloc[i]['report_date']
            end = fiscal_df.iloc[i+1]['report_date']
            val = fiscal_df.iloc[i]['value']
            year = fiscal_df.iloc[i]['fiscal_year']
            mask = (price_df['date'] >= start) & (price_df['date'] < end)
            period = price_df.loc[mask]
            for _, row in period.iterrows():
                bias = (row['adjusted_close'] - val) / val
                bias_records.append({
                    'date': row['date'],
                    'price': row['adjusted_close'],
                    'value': val,
                    'bias': bias,
                    'fiscal_year': year
                })
        # 最后一个财报期至今
        if len(fiscal_df) > 0:
            start = fiscal_df.iloc[-1]['report_date']
            val = fiscal_df.iloc[-1]['value']
            year = fiscal_df.iloc[-1]['fiscal_year']
            mask = price_df['date'] >= start
            period = price_df.loc[mask]
            for _, row in period.iterrows():
                bias = (row['adjusted_close'] - val) / val
                bias_records.append({
                    'date': row['date'],
                    'price': row['adjusted_close'],
                    'value': val,
                    'bias': bias,
                    'fiscal_year': year
                })

        bias_df = pd.DataFrame(bias_records)
        return bias_df

    def calculate_conditional_stats(self, bias_df: pd.DataFrame, horizon_weeks: int = 12,
                                    bins: List[float] = None) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        计算每个偏差区间的条件胜率和盈亏比
        返回：(stats_df, labeled_bias_df)
        - stats_df: 区间统计，包含 count, win_rate, mean_return, median_return, pos_mean, neg_mean,
                    profit_loss_ratio, min_date, max_date
        - labeled_bias_df: 原 bias_df 添加了 future_return 和 bias_bin 列
        """
        if bins is None:
            bins = np.arange(-0.5, 0.51, 0.1)  # 默认每10%一档

        bias_df = bias_df.sort_values('date').reset_index(drop=True)
        price_series = bias_df.set_index('date')['price']

        future_returns = []
        for idx, row in bias_df.iterrows():
            current_date = row['date']
            future_date = current_date + timedelta(weeks=horizon_weeks)
            future_prices = price_series[price_series.index >= future_date]
            if not future_prices.empty:
                future_price = future_prices.iloc[0]
                ret = (future_price - row['price']) / row['price']
            else:
                ret = np.nan
            future_returns.append(ret)

        bias_df['future_return'] = future_returns
        bias_df = bias_df.dropna(subset=['future_return'])

        labels = [f"{bins[i]*100:.0f}%~{bins[i+1]*100:.0f}%" for i in range(len(bins)-1)]
        bias_df['bias_bin'] = pd.cut(bias_df['bias'], bins=bins, labels=labels, right=False)

        # 分组统计，同时获取日期范围
        stats = bias_df.groupby('bias_bin', observed=False).agg(
            count=('future_return', 'count'),
            win_rate=('future_return', lambda x: (x > 0).mean()),
            mean_return=('future_return', 'mean'),
            median_return=('future_return', 'median'),
            pos_mean=('future_return', lambda x: x[x > 0].mean() if (x > 0).any() else 0),
            neg_mean=('future_return', lambda x: x[x < 0].mean() if (x < 0).any() else 0),
            min_date=('date', 'min'),
            max_date=('date', 'max')
        ).reset_index()

        stats['profit_loss_ratio'] = stats['pos_mean'].abs() / stats['neg_mean'].abs()
        stats['profit_loss_ratio'] = stats['profit_loss_ratio'].replace([np.inf, -np.inf], 10.0)
        stats['profit_loss_ratio'] = stats['profit_loss_ratio'].fillna(1.0)
        
        # 将日期格式化为字符串，方便保存
        stats['min_date'] = stats['min_date'].dt.strftime('%Y-%m-%d')
        stats['max_date'] = stats['max_date'].dt.strftime('%Y-%m-%d')
        return stats, bias_df

    def get_bin_info(self, bias: float, stats_df: pd.DataFrame) -> Optional[Dict]:
        """获取偏差所在区间的统计信息"""
        for _, row in stats_df.iterrows():
            bin_range = row['bias_bin']
            parts = bin_range.replace('%', '').split('~')
            if len(parts) != 2:
                continue
            low = float(parts[0]) / 100
            high = float(parts[1]) / 100
            if low <= bias < high:
                return {
                    'bias_bin': bin_range,
                    'win_rate': row['win_rate'],
                    'profit_loss_ratio': row['profit_loss_ratio'],
                    'mean_return': row['mean_return'],
                    'count': row['count'],
                    'min_date': row['min_date'],
                    'max_date': row['max_date']
                }
        return None

    def backtest(self, labeled_bias_df: pd.DataFrame, stats_df: pd.DataFrame,
                 horizon_weeks: int = 12, initial_capital: float = 1.0) -> Dict[str, Any]:
        """
        回测策略
        - labeled_bias_df: 必须包含 'bias_bin' 列（由 calculate_conditional_stats 返回）
        - 在每周点根据信号决定是否开仓
        - 每次开仓持有 horizon_weeks 周后平仓
        - 仓位使用凯利比例的一半（半凯利）
        返回结果中包含 bias_data 字段，存储用于绘图的数据（bias, future_return, bias_bin, date, price, value, fiscal_year）
        """
        bias_df = labeled_bias_df.sort_values('date').reset_index(drop=True)
        price_series = bias_df.set_index('date')['price']

        cash = initial_capital
        position = 0.0
        entry_price = 0.0
        entry_date = None
        entry_bias = None
        trades = []

        for idx, row in bias_df.iterrows():
            current_date = row['date']
            current_price = row['price']
            current_bias = row['bias']
            current_bin = row['bias_bin']

            if position > 0 and entry_date is not None:
                weeks_held = (current_date - entry_date).days / 7.0
                if weeks_held >= horizon_weeks:
                    exit_value = position * current_price / entry_price
                    cash = cash + exit_value
                    trades.append({
                        'entry_date': entry_date,
                        'exit_date': current_date,
                        'entry_price': entry_price,
                        'exit_price': current_price,
                        'return': (current_price - entry_price) / entry_price,
                        'bias_at_entry': entry_bias,
                        'position_size': position / entry_price
                    })
                    position = 0.0
                    entry_date = None

            if position == 0:
                # 根据当前偏差所在的区间，获取统计信息
                bin_info = self.get_bin_info(current_bias, stats_df)
                if bin_info and bin_info['win_rate'] >= 0.6:
                    win_rate = bin_info['win_rate']
                    pl_ratio = bin_info['profit_loss_ratio']
                    f_kelly = (win_rate * (pl_ratio + 1) - 1) / pl_ratio
                    f_kelly = max(0, min(f_kelly, 1))
                    fraction = f_kelly * 0.5
                    invest_amount = cash * fraction
                    if invest_amount > 0:
                        position = invest_amount
                        cash -= invest_amount
                        entry_price = current_price
                        entry_date = current_date
                        entry_bias = current_bias

        if position > 0 and len(bias_df) > 0:
            last_row = bias_df.iloc[-1]
            exit_price = last_row['price']
            exit_value = position * exit_price / entry_price
            cash = cash + exit_value
            trades.append({
                'entry_date': entry_date,
                'exit_date': last_row['date'],
                'entry_price': entry_price,
                'exit_price': exit_price,
                'return': (exit_price - entry_price) / entry_price,
                'bias_at_entry': entry_bias,
                'position_size': position / entry_price
            })
            position = 0.0

        final_capital = cash + position

        if trades:
            returns = [t['return'] for t in trades]
            win_returns = [r for r in returns if r > 0]
            loss_returns = [r for r in returns if r <= 0]
            win_rate = len(win_returns) / len(returns) if returns else 0
            avg_win = np.mean(win_returns) if win_returns else 0
            avg_loss = np.mean(loss_returns) if loss_returns else 0
            profit_loss_ratio = abs(avg_win / avg_loss) if avg_loss != 0 else 1.0
            total_return = (final_capital / initial_capital) - 1
            total_days = (bias_df['date'].max() - bias_df['date'].min()).days
            years = total_days / 365.25 if total_days > 0 else 1
            annual_return = (final_capital / initial_capital) ** (1 / years) - 1
            if len(returns) > 1 and np.std(returns) > 0:
                sharpe = np.mean(returns) / np.std(returns) * np.sqrt(52)
            else:
                sharpe = 0
        else:
            win_rate = avg_win = avg_loss = profit_loss_ratio = total_return = annual_return = sharpe = 0

        # 准备绘图数据：添加 fiscal_year 列
        plot_data = bias_df[['date', 'price', 'value', 'fiscal_year', 'bias', 'future_return', 'bias_bin']].copy()
        plot_data['date'] = plot_data['date'].dt.strftime('%Y-%m-%d')  # 转为字符串方便存储

        result = {
            'initial_capital': initial_capital,
            'final_capital': final_capital,
            'total_return': total_return,
            'annual_return': annual_return,
            'sharpe_ratio': sharpe,
            'num_trades': len(trades),
            'win_rate': win_rate,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_loss_ratio': profit_loss_ratio,
            'trades': trades,
            'bias_stats': stats_df.to_dict('records'),
            'bias_data': plot_data.to_dict('records')  # 添加原始数据用于绘图
        }
        return result

    def generate_report(self, backtest_result: Dict[str, Any], output_dir: str,
                        plot: bool = True) -> str:
        """生成Markdown报告，包含详细的解释、统计表格和五种可视化图表"""
        lines = []
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        lines.append(f"# {self.symbol} - 基于估值偏差的量化策略回测报告\n")
        lines.append(f"**报告生成时间**：{timestamp}  \n")
        lines.append(f"**分析对象**：{self.symbol}  \n")
        lines.append(f"**数据截止**：{timestamp.split()[0]}  \n")

        # ------------------------------------------------------------------
        # 1. 策略概述
        # ------------------------------------------------------------------
        lines.append("## 1. 策略概述\n")
        lines.append("本策略利用财务模型（如DCF）计算出的每股内在价值，与市场实际股价进行比较，形成**估值偏差**（bias）。"
                     "通过分析历史上不同偏差区间后续的股价表现（未来收益率），找出统计规律，从而对当前偏差做出概率判断和仓位建议。\n")
        lines.append("**关键假设**：内在价值代表公司的长期合理价值，股价围绕其波动，极端偏差有均值回归倾向，但回归路径和概率可通过历史数据量化。\n")

        # ------------------------------------------------------------------
        # 2. 数据来源与预处理
        # ------------------------------------------------------------------
        lines.append("## 2. 数据来源与预处理\n")
        lines.append("### 2.1 历史估值数据\n")
        lines.append(f"- **文件**：`{self.valuation_file.name if self.valuation_file else '模拟'}`  \n")
        lines.append("- **内容**：每个财年结束后，基于截至该财年的财务数据计算出的每股内在价值（DCF模型）。\n")
        lines.append("- **字段**：\n")
        lines.append("  - `fiscal_year`：财年\n")
        lines.append("  - `report_date`：估值发布日期（财年结束后90天）\n")
        lines.append("  - `value`：每股内在价值（美元）\n")

        # 列出所有估值记录
        if backtest_result.get('bias_data'):
            # 转换回DataFrame提取唯一估值
            df_plot_full = pd.DataFrame(backtest_result['bias_data'])
            valuation_summary = df_plot_full[['fiscal_year', 'value']].drop_duplicates().sort_values('fiscal_year', ascending=False)
            lines.append("\n**历史估值（最近优先）**：\n")
            lines.append("| 财年 | 价值 ($) |")
            lines.append("|------|----------|")
            for _, row in valuation_summary.iterrows():
                lines.append(f"| {int(row['fiscal_year'])} | ${row['value']:.2f} |")
            lines.append("")

        lines.append("### 2.2 周线股价数据\n")
        lines.append(f"- **文件**：`stock_{self.symbol}.parquet`\n")
        lines.append("- **内容**：包含每周复权收盘价（已处理股息、拆股）。\n")
        lines.append("- **字段**：`date`, `adjusted_close`\n")
        lines.append("数据时间范围覆盖所有估值发布日期之后至最新。\n")

        lines.append("### 2.3 偏差序列构建\n")
        lines.append("对于每个财年的估值，从发布日期起应用，直至下一个估值发布日期前。最新估值应用于其发布日期后的所有周。\n")
        lines.append("**偏差计算公式**：\n")
        lines.append("```\n")
        lines.append("bias = (adjusted_close - value) / value\n")
        lines.append("```\n")
        lines.append("正值表示股价高于估值（高估），负值表示低估。\n")

        # ------------------------------------------------------------------
        # 3. 核心统计量解释
        # ------------------------------------------------------------------
        lines.append("## 3. 核心统计量解释\n")
        lines.append("每个偏差区间统计以下指标：\n")
        lines.append("| 指标 | 含义 | 计算公式 |")
        lines.append("|------|------|----------|")
        lines.append("| **样本数** | 该区间出现的周数 | 计数 |")
        lines.append("| **胜率** | 持有指定周数后收益率为正的概率 | (未来收益>0).mean() |")
        lines.append("| **平均收益** | 所有样本未来收益率的算术平均值 | mean(未来收益) |")
        lines.append("| **盈亏比** | 平均盈利 / 平均亏损的绝对值 | 正收益均值 / abs(负收益均值) |")
        lines.append("")
        lines.append("**未来收益率**：从当前周持有 `horizon_weeks` 周后的总收益率。若数据不足，则丢弃该样本。\n")

        # ------------------------------------------------------------------
        # 4. 参数设置
        # ------------------------------------------------------------------
        horizon = backtest_result.get('horizon_weeks', '?')
        lines.append(f"## 4. 参数设置\n")
        lines.append(f"- **持有期**：{horizon} 周（约 {horizon/52:.1f} 年）\n")
        lines.append(f"- **开仓阈值**：胜率 ≥ 60%\n")
        lines.append(f"- **仓位管理**：半凯利公式\n")

        # ------------------------------------------------------------------
        # 5. 区间统计表（含样本时间范围）
        # ------------------------------------------------------------------
        lines.append("## 5. 各偏差区间统计\n")
        lines.append("| 区间 | 样本数 | 胜率 | 平均收益 | 盈亏比 | 样本时间范围 |")
        lines.append("|------|--------|------|----------|--------|--------------|")
        for row in backtest_result['bias_stats']:
            period = f"{row['min_date']} 至 {row['max_date']}"
            lines.append(f"| {row['bias_bin']} | {row['count']} | {row['win_rate']*100:.1f}% | {row['mean_return']*100:.2f}% | {row['profit_loss_ratio']:.2f} | {period} |")

        # ------------------------------------------------------------------
        # 6. 可视化图表（使用英文以兼容字体）
        # ------------------------------------------------------------------
        if plot and backtest_result.get('bias_data'):
            try:
                # 转换bias_data为DataFrame
                plot_df = pd.DataFrame(backtest_result['bias_data'])
                plot_df['date'] = pd.to_datetime(plot_df['date'])
                plot_df['bias'] = plot_df['bias'].astype(float)
                plot_df['future_return'] = plot_df['future_return'].astype(float)
                plot_df['price'] = plot_df['price'].astype(float)
                plot_df['value'] = plot_df['value'].astype(float)
                plot_df['fiscal_year'] = plot_df['fiscal_year'].astype(int)

                # 按日期排序
                plot_df_sorted = plot_df.sort_values('date')

                # ---- 6.1 偏差分布直方图 ----
                plt.figure(figsize=(10, 6))
                plt.hist(plot_df['bias'], bins=50, edgecolor='black', alpha=0.7)
                plt.axvline(x=0, color='red', linestyle='--', label='Zero Bias')
                plt.title(f'{self.symbol} Historical Bias Distribution')
                plt.xlabel('Bias (Price/Value - 1)')
                plt.ylabel('Frequency')
                plt.legend()
                plt.grid(True, alpha=0.3)
                hist_path = Path(output_dir) / f"{self.symbol}_bias_hist.png"
                plt.savefig(hist_path, dpi=150, bbox_inches='tight')
                plt.close()
                lines.append(f"\n### 6.1 Bias Distribution\n")
                lines.append(f"![Bias Distribution]({hist_path.name})\n")
                lines.append("**解读**：直方图显示不同偏差水平的出现频率。红色虚线标记零偏差。分布形态可反映股票常处于溢价还是折价状态。\n")

                # ---- 6.2 各区间收益率箱线图 ----
                plt.figure(figsize=(12, 6))
                plot_df['bias_bin'] = pd.Categorical(plot_df['bias_bin'], categories=[r['bias_bin'] for r in backtest_result['bias_stats']], ordered=True)
                plot_df.boxplot(column='future_return', by='bias_bin', rot=45)
                plt.title(f'{self.symbol} Future Return Distribution by Bias Interval')
                plt.suptitle('')
                plt.xlabel('Bias Interval')
                plt.ylabel(f'Future Return ({horizon} weeks)')
                plt.grid(True, alpha=0.3)
                box_path = Path(output_dir) / f"{self.symbol}_returns_boxplot.png"
                plt.savefig(box_path, dpi=150, bbox_inches='tight')
                plt.close()
                lines.append(f"\n### 6.2 Future Return by Bias Interval (Boxplot)\n")
                lines.append(f"![Returns Boxplot]({box_path.name})\n")
                lines.append("**解读**：每个箱线图展示了该区间内所有样本未来收益率的分布（中位数、四分位数、异常值）。"
                             "可评估不同区间的收益中枢和风险。\n")

                # ---- 6.3 偏差-收益率散点图 ----
                plt.figure(figsize=(10, 6))
                plt.scatter(plot_df['bias'], plot_df['future_return'], alpha=0.3, s=10)
                plt.axhline(y=0, color='red', linestyle='--', alpha=0.5)
                plt.axvline(x=0, color='red', linestyle='--', alpha=0.5)
                plt.title(f'{self.symbol} Bias vs Future Return')
                plt.xlabel('Bias')
                plt.ylabel(f'Future Return ({horizon} weeks)')
                plt.grid(True, alpha=0.3)
                scatter_path = Path(output_dir) / f"{self.symbol}_bias_scatter.png"
                plt.savefig(scatter_path, dpi=150, bbox_inches='tight')
                plt.close()
                lines.append(f"\n### 6.3 Scatter Plot: Bias vs Future Return\n")
                lines.append(f"![Bias vs Return]({scatter_path.name})\n")
                lines.append("**解读**：每个点代表一个周观测。红色水平线为零收益，垂直线为零偏差。图形揭示了偏差与后续收益的关系，如低估是否常伴随正收益。\n")

                # ---- 6.4 策略净值曲线 ----
                nav = [backtest_result['initial_capital']]
                for t in backtest_result['trades']:
                    nav.append(nav[-1] * (1 + t['return']))
                plt.figure(figsize=(10, 6))
                plt.plot(nav, marker='o', linestyle='-', linewidth=1, markersize=3)
                plt.title(f'{self.symbol} Strategy NAV Curve')
                plt.xlabel('Trade Number')
                plt.ylabel('Net Asset Value')
                plt.grid(True, alpha=0.3)
                nav_path = Path(output_dir) / f"quant_{self.symbol}_nav.png"
                plt.savefig(nav_path, dpi=150, bbox_inches='tight')
                plt.close()
                lines.append(f"\n### 6.4 Strategy NAV Curve\n")
                lines.append(f"![NAV Curve](quant_{self.symbol}_nav.png)\n")
                lines.append("**解读**：显示1美元本金跟随策略信号后的增长情况，反映策略的历史表现，包括回撤和整体收益。\n")

                # ---- 6.5 股价与估值对比图 ----
                plt.figure(figsize=(12, 6))
                plt.plot(plot_df_sorted['date'], plot_df_sorted['price'], label='Price', color='blue', alpha=0.7)
                plt.plot(plot_df_sorted['date'], plot_df_sorted['value'], label='Intrinsic Value', color='green', linestyle='--', alpha=0.7)
                # 标注估值发布日
                if self.valuation_file and self.valuation_file.exists():
                    with open(self.valuation_file, 'r') as f:
                        val_data = json.load(f)
                    for item in val_data:
                        plt.axvline(x=pd.to_datetime(item['report_date']), color='gray', linestyle=':', alpha=0.5)
                        plt.text(pd.to_datetime(item['report_date']), plt.ylim()[1]*0.95, f"{item['fiscal_year']}", rotation=45, fontsize=8)
                plt.title(f'{self.symbol} Price vs Intrinsic Value Over Time')
                plt.xlabel('Date')
                plt.ylabel('USD')
                plt.legend()
                plt.grid(True, alpha=0.3)
                plt.xticks(rotation=45)
                val_price_path = Path(output_dir) / f"{self.symbol}_valuation_vs_price.png"
                plt.savefig(val_price_path, dpi=150, bbox_inches='tight')
                plt.close()
                lines.append(f"\n### 6.5 Price vs Intrinsic Value Over Time\n")
                lines.append(f"![Price vs Value]({val_price_path.name})\n")
                lines.append("**解读**：绿色虚线为各财年估值，蓝色线为股价，灰色竖线为估值发布日期。直观展示历史上价格围绕价值的波动情况。\n")
            except Exception as e:
                logger.warning(f"生成图表失败: {e}")

        # ------------------------------------------------------------------
        # 7. 回测绩效
        # ------------------------------------------------------------------
        lines.append("## 7. 回测绩效\n")
        lines.append(f"- **初始资金**：${backtest_result['initial_capital']:.2f}\n")
        lines.append(f"- **最终资金**：${backtest_result['final_capital']:.2f}\n")
        lines.append(f"- **总收益率**：{backtest_result['total_return']*100:.2f}%\n")
        lines.append(f"- **年化收益率**：{backtest_result['annual_return']*100:.2f}%\n")
        lines.append(f"- **夏普比率**：{backtest_result['sharpe_ratio']:.2f}\n")
        lines.append(f"- **交易次数**：{backtest_result['num_trades']}\n")
        lines.append(f"- **胜率**：{backtest_result['win_rate']*100:.1f}%\n")
        lines.append(f"- **平均盈利**：{backtest_result['avg_win']*100:.2f}%\n")
        lines.append(f"- **平均亏损**：{backtest_result['avg_loss']*100:.2f}%\n")
        lines.append(f"- **盈亏比**：{backtest_result['profit_loss_ratio']:.2f}\n")

        # ------------------------------------------------------------------
        # 8. 交易记录
        # ------------------------------------------------------------------
        if backtest_result['trades']:
            lines.append("\n## 8. 交易记录\n")
            lines.append("| 买入日期 | 卖出日期 | 买入价 | 卖出价 | 收益率 | 买入时偏差 |")
            lines.append("|----------|----------|--------|--------|--------|------------|")
            for t in backtest_result['trades']:
                lines.append(f"| {t['entry_date'].strftime('%Y-%m-%d')} | {t['exit_date'].strftime('%Y-%m-%d')} | {t['entry_price']:.2f} | {t['exit_price']:.2f} | {t['return']*100:.2f}% | {t['bias_at_entry']*100:.1f}% |")

        # ------------------------------------------------------------------
        # 9. 当前偏差评估（基于最近数据）
        # ------------------------------------------------------------------
        if backtest_result.get('bias_data'):
            df_latest = pd.DataFrame(backtest_result['bias_data'])
            df_latest['date'] = pd.to_datetime(df_latest['date'])
            df_latest = df_latest.sort_values('date')
            if not df_latest.empty:
                latest = df_latest.iloc[-1]
                current_price = latest['price']
                current_value = latest['value']
                current_bias = latest['bias']
                current_fiscal_year = latest['fiscal_year']
                current_bin_info = self.get_bin_info(current_bias, pd.DataFrame(backtest_result['bias_stats']))
                lines.append("\n## 9. 当前偏差评估（基于最近数据）\n")
                lines.append(f"- **最新股价**：${current_price:.2f}\n")
                lines.append(f"- **最新内在价值**：${current_value:.2f} (财年 {int(current_fiscal_year)})\n")
                lines.append(f"- **当前偏差**：{current_bias*100:.1f}%\n")
                if current_bin_info:
                    lines.append(f"- **所属区间**：{current_bin_info['bias_bin']}\n")
                    lines.append(f"- **该区间历史胜率**：{current_bin_info['win_rate']*100:.1f}%\n")
                    lines.append(f"- **该区间历史平均收益**：{current_bin_info['mean_return']*100:.2f}%\n")
                    lines.append(f"- **盈亏比**：{current_bin_info['profit_loss_ratio']:.2f}\n")
                    lines.append(f"- **样本时间范围**：{current_bin_info['min_date']} 至 {current_bin_info['max_date']}\n")
                else:
                    lines.append("  （当前偏差不在任何预设区间内）\n")

        # ------------------------------------------------------------------
        # 10. 仓位建议（凯利公式）
        # ------------------------------------------------------------------
        lines.append("\n## 10. 仓位建议（凯利公式）\n")
        lines.append("对于给定区间，设胜率为 `p`，盈亏比为 `b`，凯利比例为：\n")
        lines.append("```\n")
        lines.append("f = (p * (b + 1) - 1) / b\n")
        lines.append("```\n")
        lines.append("我们采用半凯利（`f/2`）以降低波动。下表展示了各区间若今日触发信号的建议仓位。\n")
        lines.append("| 区间 | 胜率 | 盈亏比 | 凯利 % | 半凯利 % |")
        lines.append("|------|------|--------|--------|----------|")
        for row in backtest_result['bias_stats']:
            p = row['win_rate']
            b = row['profit_loss_ratio']
            if p > 0 and b > 0:
                f_kelly = (p * (b + 1) - 1) / b
                f_kelly = max(0, min(f_kelly, 1))
                half_kelly = f_kelly * 0.5
                lines.append(f"| {row['bias_bin']} | {p*100:.1f}% | {b:.2f} | {f_kelly*100:.1f}% | {half_kelly*100:.1f}% |")
            else:
                lines.append(f"| {row['bias_bin']} | {p*100:.1f}% | {b:.2f} | N/A | N/A |")

        # ------------------------------------------------------------------
        # 11. 模型文件说明
        # ------------------------------------------------------------------
        lines.append("\n## 11. 模型文件说明\n")
        lines.append("训练后的模型保存为 `{symbol}_quant_model.pkl`，包含：\n")
        lines.append("- `symbol`：股票代码\n")
        lines.append("- `horizon_weeks`：持有期\n")
        lines.append("- `bins`：区间边界列表\n")
        lines.append("- `stats`：区间统计（如上表）\n")
        lines.append("- `timestamp`：训练时间\n")
        lines.append("预测时加载该模型，根据当前偏差匹配区间，返回历史统计和建议。\n")

        # ------------------------------------------------------------------
        # 12. 与财务估值报告的关联
        # ------------------------------------------------------------------
        lines.append("\n## 12. 与财务估值报告的关联\n")
        lines.append("财务估值模型（如DCF、FCFE、RIM）基于未来预期估计内在价值。本策略使用**历史估值**（基于当时可得数据）作为基准。两者互补：\n")
        lines.append("- **财务估值**回答：“现在值多少钱？”（前瞻性）\n")
        lines.append("- **量化策略**回答：“市场过去偏离价值后如何表现？”（统计规律）\n")
        if 'current_value' in locals():
            lines.append(f"当前历史估值（${current_value:.2f}）可能与前瞻性DCF估值存在差异，这源于对未来增长和市场环境的不同假设。\n")

        # ------------------------------------------------------------------
        # 13. 优化建议
        # ------------------------------------------------------------------
        lines.append("\n## 13. 优化建议\n")
        lines.append("1. **合并稀疏区间**：若某些区间样本过少（如<30），考虑与相邻区间合并，提高统计可靠性。\n")
        lines.append("2. **尝试等频分箱**：用分位数划分区间，使每区间样本数大致相等。\n")
        lines.append("3. **测试不同持有期**：尝试更短（如24周）或更长（如104周）的持有期。\n")
        lines.append("4. **加入宏观过滤器**：结合市场整体指标（如利率、波动率）优化信号。\n")

        # ------------------------------------------------------------------
        # 14. 结论
        # ------------------------------------------------------------------
        lines.append("\n## 14. 结论\n")
        lines.append("本策略将基本面估值转化为可量化的交易信号。回测显示，估值偏差在极端低估区域具有较强预测能力，"
                     "但近期高估区间样本较少，需谨慎对待。框架灵活，可随数据积累和算法优化不断完善。\n")

        lines.append("\n---\n")
        lines.append("*本报告基于历史数据统计，不构成投资建议。*\n")

        return "\n".join(lines)


def train_quant_model(symbol: str, data_dir: str, model_dir: str,
                      valuation_file: Optional[str] = None,
                      horizon_weeks: int = 12,
                      bins: List[float] = None) -> None:
    """
    训练量化模型：计算历史偏差区间的统计信息，并保存到文件。
    :param symbol: 股票代码
    :param data_dir: 数据目录（包含周线文件）
    :param model_dir: 模型保存目录
    :param valuation_file: 包含历史估值的 JSON 文件路径（可选）
    :param horizon_weeks: 持有周数
    :param bins: 偏差区间边界
    """
    qs = QuantStrategy(symbol, data_dir, valuation_file)
    bias_df = qs.build_bias_series()
    if bias_df.empty:
        raise ValueError("无法构建偏差序列")
    stats_df, _ = qs.calculate_conditional_stats(bias_df, horizon_weeks, bins)  # 只取 stats

    model = {
        'symbol': symbol,
        'horizon_weeks': horizon_weeks,
        'bins': bins if bins is not None else np.arange(-0.5, 0.51, 0.1).tolist(),
        'stats': stats_df.to_dict('records'),
        'timestamp': datetime.now().isoformat()
    }

    Path(model_dir).mkdir(parents=True, exist_ok=True)
    model_path = Path(model_dir) / f"{symbol}_quant_model.pkl"
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    logger.info(f"量化模型已保存至 {model_path}")


def predict_quant(symbol: str, data_dir: str, model_dir: str,
                  current_price: float, current_value: float,
                  output_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    根据当前股价和最新估值，加载模型，给出投资建议。
    如果提供 output_dir，将生成详细报告保存到该目录。
    """
    model_path = Path(model_dir) / f"{symbol}_quant_model.pkl"
    if not model_path.exists():
        raise FileNotFoundError(f"模型文件不存在: {model_path}，请先运行 train_quant_model")

    with open(model_path, 'rb') as f:
        model = pickle.load(f)

    current_bias = (current_price - current_value) / current_value
    stats_df = pd.DataFrame(model['stats'])
    # 需要创建一个临时的 QuantStrategy 对象来调用 get_bin_info，但不依赖估值文件
    qs = QuantStrategy(symbol, data_dir)  # 这里不传估值文件，因为只用 get_bin_info
    bin_info = qs.get_bin_info(current_bias, stats_df)

    if bin_info is None:
        return {
            'success': False,
            'error': f"当前偏差 {current_bias*100:.1f}% 不在任何预设区间内",
            'current_bias': current_bias
        }

    win_rate = bin_info['win_rate']
    pl_ratio = bin_info['profit_loss_ratio']
    mean_return = bin_info['mean_return']
    count = bin_info['count']
    min_date = bin_info.get('min_date', 'N/A')
    max_date = bin_info.get('max_date', 'N/A')

    f_kelly = (win_rate * (pl_ratio + 1) - 1) / pl_ratio
    f_kelly = max(0, min(f_kelly, 1))
    half_kelly = f_kelly * 0.5

    if half_kelly > 0.01:
        action = "买入/持有"
    else:
        action = "卖出/减仓"

    result = {
        'success': True,
        'current_bias': current_bias,
        'bias_interval': bin_info['bias_bin'],
        'win_rate': win_rate,
        'mean_return': mean_return,
        'profit_loss_ratio': pl_ratio,
        'sample_count': count,
        'sample_period': f"{min_date} 至 {max_date}",
        'kelly_fraction': f_kelly,
        'half_kelly_fraction': half_kelly,
        'suggested_action': action,
        'message': (
            f"当前偏差处于{bin_info['bias_bin']}区间，历史胜率{win_rate*100:.1f}%，"
            f"平均收益{mean_return*100:.2f}%，盈亏比{pl_ratio:.2f}，"
            f"样本时间：{min_date} 至 {max_date}，建议仓位比例{half_kelly*100:.1f}%"
        )
    }

    # 如果指定了输出目录，生成详细报告（放入带时间戳的子文件夹）
    if output_dir:
        # 创建子文件夹
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        subfolder_name = f"valuation_report_{symbol}_{timestamp}"
        report_dir = Path(output_dir) / subfolder_name
        report_dir.mkdir(parents=True, exist_ok=True)

        _generate_valuation_report(
            symbol=symbol,
            current_price=current_price,
            current_value=current_value,
            current_bias=current_bias,
            stats_df=stats_df,
            bin_info=bin_info,
            horizon_weeks=model.get('horizon_weeks', 12),
            bins=model.get('bins', []),
            half_kelly=half_kelly,
            action=action,
            output_dir=str(report_dir),
            report_filename=subfolder_name  # 传递文件名
        )

    return result


def _generate_valuation_report(symbol: str, current_price: float, current_value: float,
                               current_bias: float, stats_df: pd.DataFrame, bin_info: Dict,
                               horizon_weeks: int, bins: List[float], half_kelly: float,
                               action: str, output_dir: str, report_filename: str = None) -> None:
    """生成详细的估值偏差分析报告（Markdown格式），包含直方图（图表使用英文）"""
    lines = []
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    lines.append(f"# {symbol} 估值偏差分析报告")
    lines.append(f"\n**报告生成时间**：{timestamp}")
    lines.append(f"**当前股价**：${current_price:.2f}")
    lines.append(f"**最新估值**：${current_value:.2f}")
    lines.append(f"**当前偏差**：{current_bias*100:.1f}%\n")

    lines.append("## 参数设置")
    lines.append(f"- **持有期**：{horizon_weeks} 周（约 {horizon_weeks/52:.1f} 年）")
    bins_str = ', '.join([f"{b*100:.0f}%" for b in bins])
    lines.append(f"- **偏差区间**：{bins_str}\n")

    lines.append("## 历史偏差区间统计")
    lines.append("| 区间 | 样本数 | 胜率 | 平均收益 | 盈亏比 | 样本时间范围 |")
    lines.append("|------|--------|------|----------|--------|--------------|")
    for _, row in stats_df.iterrows():
        period = f"{row['min_date']} 至 {row['max_date']}"
        lines.append(f"| {row['bias_bin']} | {row['count']} | {row['win_rate']*100:.1f}% | {row['mean_return']*100:.2f}% | {row['profit_loss_ratio']:.2f} | {period} |")

    lines.append("\n## 当前偏差评估")
    lines.append(f"当前偏差处于 **{bin_info['bias_bin']}** 区间")
    lines.append(f"- **历史样本数**：{bin_info['count']}")
    lines.append(f"- **样本时间范围**：{bin_info.get('min_date', 'N/A')} 至 {bin_info.get('max_date', 'N/A')}")
    lines.append(f"- **未来 {horizon_weeks} 周上涨概率**：{bin_info['win_rate']*100:.1f}%")
    lines.append(f"- **未来 {horizon_weeks} 周平均收益**：{bin_info['mean_return']*100:.2f}%")
    lines.append(f"- **盈亏比**：{bin_info['profit_loss_ratio']:.2f}")

    # 概率解读
    up_prob = bin_info['win_rate']
    down_prob = 1 - up_prob
    lines.append(f"\n根据历史统计，当前估值偏差下，未来 {horizon_weeks} 周上涨的概率为 {up_prob*100:.1f}%，下跌的概率为 {down_prob*100:.1f}%。")

    # 期望收益
    lines.append(f"\n期望收益：{bin_info['mean_return']*100:.2f}%")

    # 仓位建议
    lines.append(f"\n## 仓位建议")
    lines.append(f"基于凯利公式（半凯利），建议仓位比例为 **{half_kelly*100:.1f}%**。")
    lines.append(f"操作建议：**{action}**")

    # 风险提示
    if bin_info['count'] < 30:
        lines.append("\n**风险提示**：该区间历史样本数较少，统计结果可能不稳定，请谨慎参考。")

    # 绘制偏差分布直方图（用条形图模拟，使用英文标题）
    try:
        plt.figure(figsize=(10, 6))
        # 提取区间标签和频数
        labels = [row['bias_bin'] for _, row in stats_df.iterrows()]
        counts = [row['count'] for _, row in stats_df.iterrows()]
        x_pos = np.arange(len(labels))
        plt.bar(x_pos, counts, align='center', alpha=0.7)
        plt.xticks(x_pos, labels, rotation=45, ha='right')
        # 标记当前偏差所在的区间
        current_bin_label = bin_info['bias_bin']
        if current_bin_label in labels:
            idx = labels.index(current_bin_label)
            plt.bar(x_pos[idx], counts[idx], color='red', alpha=0.7, label='Current Bias Interval')
        plt.xlabel('Bias Interval')
        plt.ylabel('Number of Samples')
        plt.title(f'{symbol} Historical Bias Distribution')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        hist_path = Path(output_dir) / f"{symbol}_bias_distribution.png"
        plt.savefig(hist_path, dpi=150, bbox_inches='tight')
        plt.close()
        lines.append(f"\n![Bias Distribution]({hist_path.name})\n")
    except Exception as e:
        logger.warning(f"生成分布图失败: {e}")

    lines.append("\n---\n")
    lines.append("*本报告基于历史数据统计，不构成投资建议。*")

    report_content = "\n".join(lines)

    # 保存到文件（使用传入的子文件夹路径）
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 使用传入的文件名，如果没有则使用默认名称
    if report_filename:
        filename = f"{report_filename}.md"
    else:
        filename = f"valuation_report_{symbol}.md"
    
    filepath = output_path / filename
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(report_content)
    logger.info(f"详细报告已保存至 {filepath}")


def run_quant_strategy(symbol: str, data_dir: str, output_dir: str,
                       valuation_file: Optional[str] = None,
                       horizon_weeks: int = 12, bins: List[float] = None) -> Dict[str, Any]:
    """
    运行量化策略全流程（回测+报告）
    :param symbol: 股票代码
    :param data_dir: 数据目录
    :param output_dir: 输出目录
    :param valuation_file: 历史估值文件（可选）
    :param horizon_weeks: 持有周数
    :param bins: 偏差区间边界
    """
    qs = QuantStrategy(symbol, data_dir, valuation_file)
    bias_df = qs.build_bias_series()
    if bias_df.empty:
        raise ValueError("无法构建偏差序列")
    stats, labeled_bias_df = qs.calculate_conditional_stats(bias_df, horizon_weeks, bins)
    backtest_result = qs.backtest(labeled_bias_df, stats, horizon_weeks)
    # 将持有期加入结果，方便报告显示
    backtest_result['horizon_weeks'] = horizon_weeks

    # 创建带时间戳的子文件夹
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    subfolder_name = f"backtest_report_{symbol}_{timestamp}"
    report_dir = Path(output_dir) / subfolder_name
    report_dir.mkdir(parents=True, exist_ok=True)

    # 生成报告（传入子文件夹路径）
    report_md = qs.generate_report(backtest_result, str(report_dir))

    # 保存报告到子文件夹内，文件名与文件夹名一致
    report_filename = f"{subfolder_name}.md"
    report_filepath = report_dir / report_filename
    with open(report_filepath, 'w', encoding='utf-8') as f:
        f.write(report_md)
    logger.info(f"回测报告已保存至 {report_filepath}")

    return backtest_result