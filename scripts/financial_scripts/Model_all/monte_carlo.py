"""
蒙特卡洛模拟模块
对指定模型进行不确定性分析，输出估值分布统计。
当前版本支持 DCF 模型。
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime
from pathlib import Path

from dcf_auto_all import DCFAutoValuation
from dcf_valuation_tool import DCFValuationTool, TerminalValueMethod

logger = logging.getLogger(__name__)

# 尝试导入 matplotlib（可选）
try:
    import matplotlib.pyplot as plt
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False


class MonteCarloSimulator:
    def __init__(self, symbol: str, data_dir: str = "data"):
        self.symbol = symbol
        self.data_dir = data_dir
        self.data_loader = DCFAutoValuation(data_dir)

        # 加载基础数据（历史、当前假设）
        self.hist_data = self.data_loader.extract_historical_data(symbol)
        self.margins = self.data_loader.compute_margins(symbol)
        self.growth_rates_base = self.data_loader.compute_growth_rates(symbol, projection_years=5)
        self.risk_free = self.data_loader.get_risk_free_rate(method="latest")
        self.wacc_comp = self.data_loader.compute_wacc_components(symbol, self.risk_free, 0.06)
        self.equity_params = self.data_loader.compute_equity_params(symbol)
        self.shares = self.equity_params['shares_outstanding']

        # 创建 DCF 工具实例（用于复用计算方法）
        self.dcf_tool = DCFValuationTool()

    def _sample_normal(self, mean: float, std: float, lower: float = None, upper: float = None) -> float:
        """生成正态分布样本，可截断"""
        val = np.random.normal(mean, std)
        if lower is not None:
            val = max(lower, val)
        if upper is not None:
            val = min(upper, val)
        return val

    def _sample_uniform(self, low: float, high: float) -> float:
        """生成均匀分布样本"""
        return np.random.uniform(low, high)

    def _get_random_assumptions(self) -> Dict[str, Any]:
        """
        生成一组随机的预测假设（用于 DCF）
        返回 assumptions 字典，可直接用于估值模型
        """
        # 1. 收入增长率（首年）
        g1_mean = self.growth_rates_base[0]
        g1_std = max(0.01, abs(g1_mean * 0.2))  # 20% 波动
        g1 = self._sample_normal(g1_mean, g1_std, lower=0.0, upper=0.3)

        # 后续年份增长率线性递减至永续增长率（将在假设中设定）
        # 这里我们让 growth_rates 列表有 5 个值，但实际使用时会用 assumptions['revenue_growth'] 覆盖
        growth_rates = [g1] * 5  # 简化：假设所有年份增长率相同

        # 2. EBITDA 利润率
        margin_mean = self.margins['avg_ebitda_margin']
        margin_std = max(0.01, margin_mean * 0.1)  # 10% 波动
        margin = self._sample_normal(margin_mean, margin_std, lower=0.05, upper=0.8)

        # 3. 资本支出/收入
        capex_mean = self.margins['avg_capex_pct']
        capex_std = max(0.005, capex_mean * 0.2)
        capex = self._sample_normal(capex_mean, capex_std, lower=0.0, upper=0.2)

        # 4. NWC/收入
        nwc_mean = self.margins['avg_nwc_pct']
        nwc_std = max(0.01, abs(nwc_mean * 0.2))
        nwc = self._sample_normal(nwc_mean, nwc_std, lower=-0.3, upper=0.3)

        # 5. 税率（均匀分布）
        tax_rate = self._sample_uniform(0.15, 0.35)

        # 6. 永续增长率（均匀分布）
        terminal_growth = self._sample_uniform(0.01, 0.05)

        # 7. 折旧率（固定为历史平均）
        dep_rate = self.margins['avg_depreciation_rate']

        assumptions = {
            "projection_years": 5,
            "revenue_growth": growth_rates,
            "ebitda_margin": [margin] * 5,
            "capex_percent": [capex] * 5,
            "nwc_percent": [nwc] * 5,
            "tax_rate": tax_rate,
            "terminal_growth": terminal_growth,
            "depreciation_rate": dep_rate
        }
        return assumptions

    def _run_dcf_with_assumptions(self, assumptions: Dict[str, Any]) -> float:
        """根据给定假设运行 DCF 模型，返回每股价值"""
        try:
            # 重新计算 WACC（因为税率可能变了）
            wacc_comp = self.wacc_comp.copy()
            wacc_comp['tax_rate'] = assumptions['tax_rate']
            wacc = self.dcf_tool._calculate_wacc(wacc_comp)

            # 预测现金流
            proj = self.dcf_tool._project_cash_flows(self.hist_data, assumptions)

            # 计算终值
            terminal = self.dcf_tool._calculate_terminal_value(
                proj, wacc, TerminalValueMethod.PERPETUITY_GROWTH,
                {"terminal_growth": assumptions["terminal_growth"]}
            )

            # 计算企业价值
            ev_result = self.dcf_tool._calculate_enterprise_value(proj, terminal, wacc)

            # 计算股权价值
            equity = self.dcf_tool._calculate_equity_value(ev_result, self.equity_params)
            return equity["value_per_share"]
        except Exception as e:
            logger.warning(f"单次模拟失败: {e}")
            return np.nan

    def run_dcf_simulation(self, n_simulations: int = 1000, seed: int = 42) -> np.ndarray:
        """对 DCF 模型执行蒙特卡洛模拟"""
        np.random.seed(seed)
        values = []
        for i in range(n_simulations):
            ass = self._get_random_assumptions()
            v = self._run_dcf_with_assumptions(ass)
            if not np.isnan(v):
                values.append(v)
            if (i + 1) % 100 == 0:
                logger.info(f"已完成 {i+1}/{n_simulations} 次模拟")
        return np.array(values)

    def analyze_results(self, values: np.ndarray, plot: bool = True) -> Dict[str, Any]:
        """计算统计量，可选显示直方图"""
        mean_val = float(np.mean(values))
        median_val = float(np.median(values))
        std_val = float(np.std(values))
        p5 = float(np.percentile(values, 5))
        p95 = float(np.percentile(values, 95))

        stats = {
            "mean": mean_val,
            "median": median_val,
            "std": std_val,
            "p5": p5,
            "p95": p95,
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "n_simulations": len(values)
        }

        if plot and MATPLOTLIB_AVAILABLE:
            plt.figure(figsize=(10, 6))
            plt.hist(values, bins=50, edgecolor='black', alpha=0.7)
            plt.axvline(mean_val, color='red', linestyle='--', label=f'均值: ${mean_val:.2f}')
            plt.axvline(median_val, color='green', linestyle='--', label=f'中位数: ${median_val:.2f}')
            plt.axvline(p5, color='orange', linestyle='--', label=f'5%: ${p5:.2f}')
            plt.axvline(p95, color='orange', linestyle='--', label=f'95%: ${p95:.2f}')
            plt.xlabel('每股价值 (美元)')
            plt.ylabel('频数')
            plt.title(f'{self.symbol} DCF 蒙特卡洛模拟结果 ({len(values)} 次)')
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.show()
        elif plot and not MATPLOTLIB_AVAILABLE:
            logger.warning("matplotlib 未安装，无法绘图")

        return stats

    def generate_md_report(self, output_dir: str, stats: Dict[str, Any], values: np.ndarray) -> str:
        """
        生成 Markdown 格式的报告，包含统计信息和直方图（如果 matplotlib 可用）
        返回报告的完整内容，并保存到文件
        """
        lines = []
        lines.append(f"# {self.symbol} 蒙特卡洛模拟报告")
        lines.append(f"\n**报告生成时间**：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  \n")
        lines.append(f"**模拟次数**：{stats['n_simulations']}  \n")
        lines.append("\n## 统计结果\n")
        lines.append(f"- **均值**：${stats['mean']:.2f}")
        lines.append(f"- **中位数**：${stats['median']:.2f}")
        lines.append(f"- **标准差**：${stats['std']:.2f}")
        lines.append(f"- **最小值**：${stats['min']:.2f}")
        lines.append(f"- **最大值**：${stats['max']:.2f}")
        lines.append(f"- **5% 分位数**：${stats['p5']:.2f}")
        lines.append(f"- **95% 分位数**：${stats['p95']:.2f}")

        # 生成直方图并保存（如果可用）
        image_path = None
        if MATPLOTLIB_AVAILABLE:
            plt.figure(figsize=(10, 6))
            plt.hist(values, bins=50, edgecolor='black', alpha=0.7)
            plt.axvline(stats['mean'], color='red', linestyle='--', label=f'Mean: ${stats["mean"]:.2f}')
            plt.axvline(stats['median'], color='green', linestyle='--', label=f'Median: ${stats["median"]:.2f}')
            plt.axvline(stats['p5'], color='orange', linestyle='--', label=f'5th percentile: ${stats["p5"]:.2f}')
            plt.axvline(stats['p95'], color='orange', linestyle='--', label=f'95th percentile: ${stats["p95"]:.2f}')
            plt.xlabel('Value per Share (USD)')
            plt.ylabel('Frequency')
            plt.title(f'{self.symbol} DCF Monte Carlo Simulation Results ({stats["n_simulations"]} runs)')
            plt.legend()
            plt.grid(True, alpha=0.3)

            # 保存图片
            img_filename = f"mc_{self.symbol}_hist.png"
            image_path = Path(output_dir) / img_filename
            plt.savefig(image_path, dpi=150, bbox_inches='tight')
            plt.close()
            lines.append(f"\n![直方图]({img_filename})\n")
        else:
            lines.append("\n*（未安装 matplotlib，无法生成直方图）*")

        lines.append("\n## 分布解读")
        lines.append("该分布显示了在不同假设下 DCF 模型得出的每股价值范围。")
        lines.append("宽度较大的分布表明估值对关键假设敏感，不确定性较高。")
        lines.append("当前股价若低于 5% 分位数可能表明低估，高于 95% 分位数可能表明高估。")

        lines.append("\n---\n")
        lines.append("*报告生成时间：{}*".format(datetime.now().isoformat()))

        content = "\n".join(lines)

        # 保存 MD 文件
        md_filename = f"mc_{self.symbol}.md"
        md_path = Path(output_dir) / md_filename
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"蒙特卡洛报告已保存至 {md_path}")

        return content
