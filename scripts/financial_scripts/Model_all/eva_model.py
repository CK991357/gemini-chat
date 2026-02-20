"""
简化 EVA 估值模型（经济增加值）
企业价值 = 期初投入资本 + 未来 EVA 现值。
EVA = NOPAT - 投入资本 × WACC。
复用 DCF 的收入预测和 WACC。
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

from dcf_auto_all import DCFAutoValuation

logger = logging.getLogger(__name__)


class EVAValuation:
    """简化 EVA 估值模型"""

    def __init__(self, data_dir: str = "data"):
        self.data_loader = DCFAutoValuation(data_dir)

    async def run_valuation(
        self,
        symbol: str,
        projection_years: int = 5,
        terminal_growth: float = 0.025,
        risk_free_method: str = "latest",
        market_premium: float = 0.06,
        include_detailed: bool = True,
        sensitivity: bool = False,
    ) -> Dict[str, Any]:
        """
        执行 EVA 估值
        返回结果字典，包含企业价值、股权价值、每股价值等。
        """
        start_time = datetime.now()
        try:
            # 1. 加载基础数据
            hist_data = self.data_loader.extract_historical_data(symbol)
            margins = self.data_loader.compute_margins(symbol)
            growth_rates = self.data_loader.compute_growth_rates(symbol, projection_years)
            risk_free = self.data_loader.get_risk_free_rate(method=risk_free_method)
            wacc_comp = self.data_loader.compute_wacc_components(symbol, risk_free, market_premium)
            equity_params = self.data_loader.compute_equity_params(symbol)

            # WACC
            wacc = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']  # 简化？实际需用 _calculate_wacc
            # 更准确：使用 dcf_tool 的 WACC 计算，但为避免循环依赖，可直接用 _calculate_wacc 逻辑
            # 这里直接复用 compute_wacc_components 然后手动计算，与 DCF 保持一致
            cost_of_debt = wacc_comp['cost_of_debt']
            tax_rate = wacc_comp['tax_rate']
            debt_to_equity = wacc_comp['debt_to_equity']
            cost_of_equity = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']
            equity_weight = 1 / (1 + debt_to_equity)
            debt_weight = debt_to_equity / (1 + debt_to_equity)
            wacc = equity_weight * cost_of_equity + debt_weight * cost_of_debt * (1 - tax_rate)

            # 2. 获取历史投入资本（最新一期作为期初）
            ic_hist = self.data_loader.extract_invested_capital(symbol)
            if not ic_hist:
                raise ValueError("无法获取历史投入资本")
            ic0 = ic_hist[-1]  # 最新一期投入资本

            # 3. 计算历史投入资本周转率
            rev_hist = hist_data['revenue']
            min_len = min(len(ic_hist), len(rev_hist))
            if min_len == 0:
                raise ValueError("收入或投入资本历史数据为空")
            turnovers = [rev_hist[i] / ic_hist[i] for i in range(min_len) if ic_hist[i] > 0]
            avg_turnover = np.mean(turnovers) if turnovers else 1.0
            logger.info(f"历史平均投入资本周转率: {avg_turnover:.2f}")

            # 4. 收入预测
            latest_rev = rev_hist[-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            # 5. 预测投入资本（使用周转率）
            ic_forecast = [rev / avg_turnover for rev in revenue_forecast]

            # 6. 预测 NOPAT
            # 使用历史平均 EBIT 利润率 = EBITDA margin - 折旧率
            ebit_margin = margins['avg_ebitda_margin'] - margins['avg_depreciation_rate']
            nopat_forecast = [rev * ebit_margin * (1 - tax_rate) for rev in revenue_forecast]

            # 7. 计算 EVA
            eva_forecast = []
            ic_prev = ic0
            for i in range(projection_years):
                eva = nopat_forecast[i] - wacc * ic_prev
                eva_forecast.append(eva)
                ic_prev = ic_forecast[i]

            # 8. 折现 EVA
            pv_factors = [(1 + wacc) ** (i + 1) for i in range(projection_years)]
            pv_eva = [eva_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_eva = sum(pv_eva)

            # 9. 终值 EVA
            MAX_TERMINAL_GROWTH = 0.05
            if terminal_growth > MAX_TERMINAL_GROWTH:
                logger.warning(f"永续增长率 {terminal_growth:.2%} 超过上限 {MAX_TERMINAL_GROWTH:.0%}，调整为上限")
                terminal_growth = MAX_TERMINAL_GROWTH
            if terminal_growth >= wacc:
                logger.warning(f"永续增长率 {terminal_growth} 大于等于 WACC {wacc}，调整为 {wacc*0.8}")
                terminal_growth = wacc * 0.8
                if terminal_growth > MAX_TERMINAL_GROWTH:
                    terminal_growth = MAX_TERMINAL_GROWTH

            terminal_eva = eva_forecast[-1] * (1 + terminal_growth)
            terminal_value = terminal_eva / (wacc - terminal_growth)
            pv_terminal = terminal_value / ((1 + wacc) ** projection_years)

            # 10. 企业价值
            enterprise_value = ic0 + total_pv_eva + pv_terminal

            # 11. 股权价值
            net_debt = equity_params['net_debt']
            cash = equity_params['cash']
            equity_value = enterprise_value - net_debt + cash
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            # 12. 构建详细预测表
            projections = None
            if include_detailed:
                projections = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "nopat": nopat_forecast,
                    "invested_capital": [ic0] + ic_forecast[:-1],  # 期初投入资本
                    "eva": eva_forecast,
                    "pv_eva": pv_eva,
                }

            # 13. 敏感性分析（可选）
            sensitivity_results = None
            if sensitivity:
                sensitivity_results = self._run_sensitivity_analysis(
                    equity_value, wacc, terminal_growth, projection_years,
                    ic0, revenue_forecast, ebit_margin, tax_rate, avg_turnover,
                    equity_params
                )

            result = {
                "success": True,
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol),
                "model": "EVA",
                "valuation": {
                    "enterprise_value": enterprise_value,
                    "enterprise_value_formatted": f"${enterprise_value:,.0f}",
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}",
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}",
                    "wacc": wacc,
                    "wacc_formatted": f"{wacc*100:.2f}%",
                    "terminal_growth": terminal_growth,
                    "terminal_growth_formatted": f"{terminal_growth*100:.2f}%",
                    "pv_of_eva": total_pv_eva,
                    "pv_of_terminal": pv_terminal,
                    "terminal_percent": (pv_terminal / (ic0 + total_pv_eva + pv_terminal)) * 100,
                    "beginning_invested_capital": ic0,
                },
                "projections": projections,
                "key_assumptions": {
                    "projection_years": projection_years,
                    "avg_revenue_growth": np.mean(growth_rates) * 100,
                    "avg_ebit_margin": ebit_margin * 100,
                    "avg_invested_capital_turnover": avg_turnover,
                },
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                },
                "sensitivity_analysis": sensitivity_results,
            }
            logger.info(f"EVA 估值完成，每股价值: ${value_per_share:.2f}")
            return result

        except Exception as e:
            logger.error(f"EVA 估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"EVA 估值失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查资产负债表和利润表数据完整性",
            }

    def _run_sensitivity_analysis(self, base_equity_value, base_wacc, base_terminal_growth,
                                   projection_years, ic0, revenue_forecast, ebit_margin,
                                   tax_rate, turnover, equity_params):
        """运行敏感性分析，对 WACC 和永续增长率进行二维分析"""
        try:
            wacc_range = np.linspace(base_wacc * 0.8, base_wacc * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)
            equity_matrix = np.zeros((len(wacc_range), len(growth_range)))

            MAX_TERMINAL_GROWTH = 0.05

            for i, wacc_val in enumerate(wacc_range):
                for j, g_val in enumerate(growth_range):
                    # 增长率上限检查
                    if g_val > MAX_TERMINAL_GROWTH:
                        g_val = MAX_TERMINAL_GROWTH
                    if g_val >= wacc_val:
                        g_val = wacc_val * 0.8
                        if g_val > MAX_TERMINAL_GROWTH:
                            g_val = MAX_TERMINAL_GROWTH

                    # 重新预测投入资本和 NOPAT（假设收入预测不变）
                    ic_forecast = [rev / turnover for rev in revenue_forecast]
                    nopat_forecast = [rev * ebit_margin * (1 - tax_rate) for rev in revenue_forecast]

                    # 计算 EVA
                    eva_forecast = []
                    ic_prev = ic0
                    for k in range(projection_years):
                        eva = nopat_forecast[k] - wacc_val * ic_prev
                        eva_forecast.append(eva)
                        ic_prev = ic_forecast[k]

                    # 折现
                    pv_factors = [(1 + wacc_val) ** (k + 1) for k in range(projection_years)]
                    pv_eva = [eva_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv = sum(pv_eva)

                    # 终值
                    terminal_eva = eva_forecast[-1] * (1 + g_val)
                    terminal_val = terminal_eva / (wacc_val - g_val)
                    pv_terminal = terminal_val / ((1 + wacc_val) ** projection_years)

                    enterprise_val = ic0 + total_pv + pv_terminal
                    equity_val = enterprise_val - equity_params['net_debt'] + equity_params['cash']
                    equity_matrix[i, j] = equity_val

            return {
                "wacc_sensitivity": {
                    "low": equity_matrix[0, :].tolist(),
                    "base": equity_matrix[2, :].tolist(),
                    "high": equity_matrix[-1, :].tolist(),
                    "impact": ((equity_matrix[-1, 2] - equity_matrix[0, 2]) / base_equity_value) * 100
                },
                "growth_sensitivity": {
                    "low": equity_matrix[:, 0].tolist(),
                    "base": equity_matrix[:, 2].tolist(),
                    "high": equity_matrix[:, -1].tolist(),
                    "impact": ((equity_matrix[2, -1] - equity_matrix[2, 0]) / base_equity_value) * 100
                },
                "equity_matrix": equity_matrix.tolist(),
                "wacc_range": wacc_range.tolist(),
                "growth_range": growth_range.tolist(),
                "base_equity_value": base_equity_value
            }
        except Exception as e:
            logger.error(f"EVA 敏感性分析失败: {e}")
            return None