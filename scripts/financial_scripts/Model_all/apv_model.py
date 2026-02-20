"""
APV 估值模型（调整现值法）
企业价值 = 无杠杆企业价值 + 利息税盾现值。
支持两种债务假设：constant（固定债务）或 ratio（债务/收入比例）。
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

from dcf_auto_all import DCFAutoValuation

logger = logging.getLogger(__name__)


class APVValuation:
    """APV 估值模型"""

    def __init__(self, data_dir: str = "data"):
        self.data_loader = DCFAutoValuation(data_dir)

    async def run_valuation(
        self,
        symbol: str,
        projection_years: int = 5,
        terminal_growth: float = 0.025,
        risk_free_method: str = "latest",
        market_premium: float = 0.06,
        debt_assumption: str = "ratio",  # "constant" 或 "ratio"
        include_detailed: bool = True,
        sensitivity: bool = False,
    ) -> Dict[str, Any]:
        """
        执行 APV 估值
        debt_assumption: "constant" 保持最新一期债务不变；"ratio" 按历史债务/收入比例预测
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

            # 2. 收入预测
            latest_rev = hist_data['revenue'][-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            # 3. 无杠杆自由现金流（UFCF）预测，复用 DCF 的 FCFF
            assumptions = {
                "projection_years": projection_years,
                "revenue_growth": growth_rates,
                "ebitda_margin": [margins['avg_ebitda_margin']] * projection_years,
                "capex_percent": [margins['avg_capex_pct']] * projection_years,
                "nwc_percent": [margins['avg_nwc_pct']] * projection_years,
                "tax_rate": margins['avg_tax_rate'],
                "terminal_growth": terminal_growth,
                "depreciation_rate": margins['avg_depreciation_rate']
            }
            from dcf_valuation_tool import DCFValuationTool
            dcf_tool = DCFValuationTool()
            projections = dcf_tool._project_cash_flows(hist_data, assumptions)
            ufcf_forecast = projections['fcf']  # FCFF 即 UFCF

            # 4. 无杠杆权益成本（去杠杆 Beta）
            beta = wacc_comp['beta']
            tax_rate = wacc_comp['tax_rate']
            debt_to_equity = wacc_comp['debt_to_equity']
            beta_u = beta / (1 + (1 - tax_rate) * debt_to_equity)
            r_u = risk_free + beta_u * market_premium

            # 5. 债务预测
            debt_hist = self.data_loader.extract_debt_history(symbol)
            if not debt_hist:
                raise ValueError("无法获取历史债务数据")
            latest_debt = debt_hist[-1]

            if debt_assumption == "constant":
                debt_forecast = [latest_debt] * projection_years
                logger.info("使用固定债务假设，债务保持不变")
            elif debt_assumption == "ratio":
                debt_forecast = self.data_loader.forecast_debt_by_ratio(symbol, projection_years, revenue_forecast)
                logger.info("使用债务/收入比例假设，历史平均比例预测债务")
            else:
                raise ValueError("debt_assumption 必须为 'constant' 或 'ratio'")

            # 6. 计算各期利息税盾
            cost_of_debt = wacc_comp['cost_of_debt']
            tax_shield_forecast = [debt_forecast[i] * cost_of_debt * tax_rate for i in range(projection_years)]

            # 7. 折现税盾（按无杠杆权益成本 r_u）
            pv_factors = [(1 + r_u) ** (i + 1) for i in range(projection_years)]
            pv_tax_shield = [tax_shield_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_tax_shield = sum(pv_tax_shield)

            # 8. 终值税盾
            if terminal_growth >= r_u:
                logger.warning(f"永续增长率 {terminal_growth} 大于等于无杠杆权益成本 {r_u}，调整为 {r_u*0.8}")
                terminal_growth_adj = r_u * 0.8
            else:
                terminal_growth_adj = terminal_growth

            if debt_assumption == "constant":
                terminal_tax_shield = latest_debt * cost_of_debt * tax_rate / r_u
                pv_terminal_tax = terminal_tax_shield / ((1 + r_u) ** projection_years)
            else:
                terminal_tax_shield = tax_shield_forecast[-1] * (1 + terminal_growth_adj) / (r_u - terminal_growth_adj)
                pv_terminal_tax = terminal_tax_shield / ((1 + r_u) ** projection_years)
            total_pv_tax_shield += pv_terminal_tax

            # 9. 无杠杆企业价值
            pv_ufcf = [ufcf_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_ufcf = sum(pv_ufcf)
            terminal_ufcf = ufcf_forecast[-1] * (1 + terminal_growth_adj)
            terminal_val = terminal_ufcf / (r_u - terminal_growth_adj)
            pv_terminal_ufcf = terminal_val / ((1 + r_u) ** projection_years)
            unlevered_value = total_pv_ufcf + pv_terminal_ufcf

            # 10. 企业价值
            enterprise_value = unlevered_value + total_pv_tax_shield

            # 11. 股权价值
            net_debt = equity_params['net_debt']
            cash = equity_params['cash']
            equity_value = enterprise_value - net_debt + cash
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            # 12. 详细预测表
            projections = None
            if include_detailed:
                projections = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "ufcf": ufcf_forecast,
                    "debt": debt_forecast,
                    "tax_shield": tax_shield_forecast,
                    "pv_ufcf": pv_ufcf,
                    "pv_tax_shield": pv_tax_shield,
                }

            # 13. 敏感性分析
            sensitivity_results = None
            if sensitivity:
                sensitivity_results = self._run_sensitivity_analysis(
                    equity_value, r_u, terminal_growth, projection_years,
                    ufcf_forecast, debt_forecast, cost_of_debt, tax_rate,
                    debt_assumption, equity_params
                )

            result = {
                "success": True,
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol),
                "model": "APV",
                "valuation": {
                    "enterprise_value": enterprise_value,
                    "enterprise_value_formatted": f"${enterprise_value:,.0f}",
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}",
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}",
                    "unlevered_cost_of_equity": r_u,
                    "unlevered_cost_of_equity_formatted": f"{r_u*100:.2f}%",
                    "terminal_growth": terminal_growth_adj,
                    "terminal_growth_formatted": f"{terminal_growth_adj*100:.2f}%",
                    "unlevered_value": unlevered_value,
                    "pv_of_tax_shield": total_pv_tax_shield,
                    "terminal_percent": (pv_terminal_ufcf / unlevered_value) * 100,
                    "cost_of_debt": cost_of_debt,
                    "cost_of_debt_formatted": f"{cost_of_debt*100:.2f}%",
                    "tax_rate": tax_rate,
                    "tax_rate_formatted": f"{tax_rate*100:.2f}%",
                    "net_debt": equity_params['net_debt'],
                    "cash": equity_params['cash'],
                    "shares_outstanding": shares,
                },
                "projections": projections,
                "key_assumptions": {
                    "projection_years": projection_years,
                    "debt_assumption": debt_assumption,
                    "avg_revenue_growth": np.mean(growth_rates) * 100,
                },
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "risk_free_method": risk_free_method,
                    "market_premium": market_premium,
                },
                "sensitivity_analysis": sensitivity_results,
            }
            logger.info(f"APV 估值完成，每股价值: ${value_per_share:.2f}")
            return result

        except Exception as e:
            logger.error(f"APV 估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"APV 估值失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查数据完整性和债务假设",
            }

    def _run_sensitivity_analysis(self, base_equity_value, base_r_u, base_terminal_growth,
                                   projection_years, ufcf_forecast, debt_forecast,
                                   cost_of_debt, tax_rate, debt_assumption, equity_params):
        """运行敏感性分析，对无杠杆权益成本和永续增长率进行二维分析"""
        try:
            r_u_range = np.linspace(base_r_u * 0.8, base_r_u * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)
            equity_matrix = np.zeros((len(r_u_range), len(growth_range)))

            MAX_TERMINAL_GROWTH = 0.05

            for i, r_u_val in enumerate(r_u_range):
                for j, g_val in enumerate(growth_range):
                    if g_val > MAX_TERMINAL_GROWTH:
                        g_val = MAX_TERMINAL_GROWTH
                    if g_val >= r_u_val:
                        g_val = r_u_val * 0.8
                        if g_val > MAX_TERMINAL_GROWTH:
                            g_val = MAX_TERMINAL_GROWTH

                    pv_factors = [(1 + r_u_val) ** (k + 1) for k in range(projection_years)]
                    pv_ufcf = [ufcf_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv_ufcf = sum(pv_ufcf)

                    pv_tax = [debt_forecast[k] * cost_of_debt * tax_rate / pv_factors[k] for k in range(projection_years)]
                    total_pv_tax = sum(pv_tax)

                    terminal_ufcf = ufcf_forecast[-1] * (1 + g_val)
                    terminal_val = terminal_ufcf / (r_u_val - g_val)
                    pv_terminal_ufcf = terminal_val / ((1 + r_u_val) ** projection_years)

                    if debt_assumption == "constant":
                        terminal_tax = debt_forecast[-1] * cost_of_debt * tax_rate / r_u_val
                    else:
                        terminal_tax = debt_forecast[-1] * cost_of_debt * tax_rate * (1 + g_val) / (r_u_val - g_val)
                    pv_terminal_tax = terminal_tax / ((1 + r_u_val) ** projection_years)

                    unlevered = total_pv_ufcf + pv_terminal_ufcf
                    tax_total = total_pv_tax + pv_terminal_tax
                    ev = unlevered + tax_total
                    equity_val = ev - equity_params['net_debt'] + equity_params['cash']
                    equity_matrix[i, j] = equity_val

            return {
                "unlevered_cost_of_equity_sensitivity": {
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
                "r_u_range": r_u_range.tolist(),
                "growth_range": growth_range.tolist(),
                "base_equity_value": base_equity_value
            }
        except Exception as e:
            logger.error(f"APV 敏感性分析失败: {e}")
            return None