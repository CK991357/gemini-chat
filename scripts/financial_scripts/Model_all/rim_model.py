"""
RIM 估值模型（剩余收益模型）
权益价值 = 当前账面价值 + 未来剩余收益现值。
复用 DCFAutoValuation 的数据加载和参数计算。
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

from dcf_auto_all import DCFAutoValuation

logger = logging.getLogger(__name__)


class RIMValuation:
    """剩余收益估值模型"""

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
        执行 RIM 估值
        返回结果字典，包含股权价值、每股价值等。
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

            # 股权成本
            cost_of_equity = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']

            # 2. 最新账面价值（期初）
            book_values_hist = self.data_loader.extract_book_value(symbol)
            if not book_values_hist:
                raise ValueError("无法获取历史账面价值")
            bv0 = book_values_hist[-1]  # 最新一期账面价值

            # 3. 收入预测
            latest_rev = hist_data['revenue'][-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            # 4. 预测净利润
            net_income_forecast = self.data_loader.compute_net_income_forecast(symbol, projection_years)

            # 5. 预测股利（用于计算账面价值变化，若无则假设为0）
            dividend_forecast = self.data_loader.compute_dividend_forecast(symbol, net_income_forecast)

            # 6. 预测未来账面价值
            bv_forecast = [bv0]
            for i in range(projection_years):
                # BV_t = BV_{t-1} + NI_t - Div_t
                next_bv = bv_forecast[-1] + net_income_forecast[i] - dividend_forecast[i]
                bv_forecast.append(next_bv)

            # 7. 计算剩余收益
            ri_forecast = []
            for i in range(projection_years):
                ri = net_income_forecast[i] - cost_of_equity * bv_forecast[i]  # BV_{i} 是期初
                ri_forecast.append(ri)

            # 8. 折现剩余收益
            pv_factors = [(1 + cost_of_equity) ** (i + 1) for i in range(projection_years)]
            pv_ri = [ri_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_ri = sum(pv_ri)

            # 9. 终值（永续增长法，对剩余收益）—— 增加增长率上限检查
            MAX_TERMINAL_GROWTH = 0.05
            if terminal_growth > MAX_TERMINAL_GROWTH:
                logger.warning(f"永续增长率 {terminal_growth:.2%} 超过上限 {MAX_TERMINAL_GROWTH:.0%}，调整为上限")
                terminal_growth = MAX_TERMINAL_GROWTH
            if terminal_growth >= cost_of_equity:
                logger.warning(f"永续增长率 {terminal_growth} 大于等于股权成本 {cost_of_equity}，调整为 {cost_of_equity*0.8}")
                terminal_growth = cost_of_equity * 0.8
                if terminal_growth > MAX_TERMINAL_GROWTH:
                    terminal_growth = MAX_TERMINAL_GROWTH

            terminal_ri = ri_forecast[-1] * (1 + terminal_growth)  # 假设剩余收益也按 g 增长
            terminal_value = terminal_ri / (cost_of_equity - terminal_growth)
            pv_terminal = terminal_value / ((1 + cost_of_equity) ** projection_years)

            # 10. 股权价值
            equity_value = bv0 + total_pv_ri + pv_terminal
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            # 11. 构建详细预测表
            projections = None
            if include_detailed:
                projections = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "net_income": net_income_forecast,
                    "dividends": dividend_forecast,
                    "book_value_begin": bv_forecast[:-1],
                    "book_value_end": bv_forecast[1:],
                    "residual_income": ri_forecast,
                    "pv_ri": pv_ri,
                }

            # 12. 敏感性分析（如果需要）
            sensitivity_results = None
            if sensitivity:
                sensitivity_results = self._run_sensitivity_analysis(
                    equity_value, cost_of_equity, terminal_growth, projection_years,
                    bv0, ri_forecast
                )

            execution_time = (datetime.now() - start_time).total_seconds()

            result = {
                "success": True,
                "execution_time": execution_time,
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol),
                "model": "RIM",
                "valuation": {
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}",
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}",
                    "cost_of_equity": cost_of_equity,
                    "cost_of_equity_formatted": f"{cost_of_equity*100:.2f}%",
                    "terminal_growth": terminal_growth,
                    "terminal_growth_formatted": f"{terminal_growth*100:.2f}%",
                    "beginning_book_value": bv0,
                    "pv_of_ri": total_pv_ri,
                    "pv_of_terminal": pv_terminal,
                    "terminal_percent": (pv_terminal / equity_value) * 100 if equity_value > 0 else 0,
                },
                "projections": projections,
                "key_assumptions": {
                    "projection_years": projection_years,
                    "avg_revenue_growth": np.mean(growth_rates) * 100,
                    "avg_roe": np.mean([ni / bv for ni, bv in zip(net_income_forecast, bv_forecast[:-1])]) * 100 if bv0 > 0 else 0,
                    "shares_outstanding": shares,
                },
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "risk_free_method": risk_free_method,
                    "market_premium": market_premium,
                },
                "sensitivity_analysis": sensitivity_results,
            }
            logger.info(f"RIM 估值完成，每股价值: ${value_per_share:.2f}")
            return result

        except Exception as e:
            logger.error(f"RIM 估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"RIM 估值失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查数据完整性和假设合理性",
            }

    def _run_sensitivity_analysis(self, base_equity_value, base_cost_of_equity, base_terminal_growth,
                                  projection_years, bv0, ri_forecast):
        """运行敏感性分析，对股权成本和永续增长率进行二维分析"""
        try:
            # 生成折现率范围（±20%）
            coe_range = np.linspace(base_cost_of_equity * 0.8, base_cost_of_equity * 1.2, 5)
            # 生成增长率范围（1% 到 5%）
            growth_range = np.linspace(0.01, 0.05, 5)
            equity_matrix = np.zeros((len(coe_range), len(growth_range)))

            MAX_TERMINAL_GROWTH = 0.05

            for i, coe_val in enumerate(coe_range):
                for j, g_val in enumerate(growth_range):
                    # 应用增长率上限和合理性检查
                    if g_val > MAX_TERMINAL_GROWTH:
                        g_val = MAX_TERMINAL_GROWTH
                    if g_val >= coe_val:
                        g_val = coe_val * 0.8
                        if g_val > MAX_TERMINAL_GROWTH:
                            g_val = MAX_TERMINAL_GROWTH

                    # 重新计算剩余收益现值（ri_forecast 不变，因为净利润预测不变）
                    pv_factors = [(1 + coe_val) ** (k + 1) for k in range(projection_years)]
                    pv_ri = [ri_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv_ri = sum(pv_ri)

                    # 终值
                    terminal_ri = ri_forecast[-1] * (1 + g_val)
                    terminal_val = terminal_ri / (coe_val - g_val)
                    pv_terminal = terminal_val / ((1 + coe_val) ** projection_years)

                    equity_matrix[i, j] = bv0 + total_pv_ri + pv_terminal

            # 计算敏感性指标
            return {
                "cost_of_equity_sensitivity": {
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
                "coe_range": coe_range.tolist(),
                "growth_range": growth_range.tolist(),
                "base_equity_value": base_equity_value
            }
        except Exception as e:
            logger.error(f"RIM 敏感性分析失败: {e}")
            return None