"""
FCFE 估值模型
股权自由现金流模型，直接对股东可获得的现金流进行折现。
复用 DCFAutoValuation 的数据加载和参数计算。
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

from dcf_auto_all import DCFAutoValuation

logger = logging.getLogger(__name__)


class FCFEValuation:
    """FCFE 估值模型"""

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
        执行 FCFE 估值
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

            # 股权成本（CAPM）
            cost_of_equity = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']

            # 2. 收入预测（与 DCF 一致）
            latest_rev = hist_data['revenue'][-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            # 3. 预测净利润
            net_income_forecast = self.data_loader.compute_net_income_forecast(symbol, projection_years)

            # 4. 预测其他现金流项（复用 DCF 的比率）
            capex_pct = margins['avg_capex_pct']
            nwc_pct = margins['avg_nwc_pct']
            dep_rate = margins['avg_depreciation_rate']

            # 折旧预测
            depreciation_forecast = [rev * dep_rate for rev in revenue_forecast]

            # 资本支出预测
            capex_forecast = [rev * capex_pct for rev in revenue_forecast]

            # 营运资本变动预测
            nwc_forecast = [rev * nwc_pct for rev in revenue_forecast]
            prev_nwc = hist_data['nwc'][-1]  # 最新历史 NWC
            nwc_change_forecast = []
            for nwc in nwc_forecast:
                change = nwc - prev_nwc
                nwc_change_forecast.append(change)
                prev_nwc = nwc

            # 5. 预测净借款
            net_borrow_forecast = self.data_loader.compute_net_borrowing_forecast(symbol, projection_years, revenue_forecast)

            # 6. 计算 FCFE
            fcfe_forecast = []
            for i in range(projection_years):
                fcfe = net_income_forecast[i] + depreciation_forecast[i] - capex_forecast[i] - nwc_change_forecast[i] + net_borrow_forecast[i]
                fcfe_forecast.append(fcfe)

            # 7. 折现
            pv_factors = [(1 + cost_of_equity) ** (i + 1) for i in range(projection_years)]
            pv_fcfe = [fcfe_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_fcfe = sum(pv_fcfe)

            # 8. 终值（永续增长法）—— 增加增长率上限检查
            MAX_TERMINAL_GROWTH = 0.05
            if terminal_growth > MAX_TERMINAL_GROWTH:
                logger.warning(f"永续增长率 {terminal_growth:.2%} 超过上限 {MAX_TERMINAL_GROWTH:.0%}，调整为上限")
                terminal_growth = MAX_TERMINAL_GROWTH
            if terminal_growth >= cost_of_equity:
                logger.warning(f"永续增长率 {terminal_growth} 大于等于股权成本 {cost_of_equity}，调整为 {cost_of_equity*0.8}")
                terminal_growth = cost_of_equity * 0.8
                if terminal_growth > MAX_TERMINAL_GROWTH:
                    terminal_growth = MAX_TERMINAL_GROWTH

            terminal_fcfe = fcfe_forecast[-1] * (1 + terminal_growth)
            terminal_value = terminal_fcfe / (cost_of_equity - terminal_growth)
            pv_terminal = terminal_value / ((1 + cost_of_equity) ** projection_years)

            # 9. 股权价值
            equity_value = total_pv_fcfe + pv_terminal
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            # 10. 构建详细预测表（可选）
            projections = None
            if include_detailed:
                projections = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "net_income": net_income_forecast,
                    "depreciation": depreciation_forecast,
                    "capex": capex_forecast,
                    "nwc_change": nwc_change_forecast,
                    "net_borrowing": net_borrow_forecast,
                    "fcfe": fcfe_forecast,
                    "pv_fcfe": pv_fcfe,
                }

            # 11. 敏感性分析（如果需要）
            sensitivity_results = None
            if sensitivity:
                sensitivity_results = self._run_sensitivity_analysis(
                    equity_value, cost_of_equity, terminal_growth, projection_years,
                    fcfe_forecast
                )

            execution_time = (datetime.now() - start_time).total_seconds()

            result = {
                "success": True,
                "execution_time": execution_time,
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol),
                "model": "FCFE",
                "valuation": {
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}",
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}",
                    "cost_of_equity": cost_of_equity,
                    "cost_of_equity_formatted": f"{cost_of_equity*100:.2f}%",
                    "terminal_growth": terminal_growth,
                    "terminal_growth_formatted": f"{terminal_growth*100:.2f}%",
                    "pv_of_fcfe": total_pv_fcfe,
                    "pv_of_terminal": pv_terminal,
                    "terminal_percent": (pv_terminal / equity_value) * 100 if equity_value > 0 else 0,
                },
                "projections": projections,
                "key_assumptions": {
                    "projection_years": projection_years,
                    "avg_revenue_growth": np.mean(growth_rates) * 100,
                    "avg_net_income_margin": np.mean([ni / rev for ni, rev in zip(net_income_forecast, revenue_forecast)]) * 100,
                    "shares_outstanding": shares,
                },
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "risk_free_method": risk_free_method,
                    "market_premium": market_premium,
                },
                "sensitivity_analysis": sensitivity_results,
            }
            logger.info(f"FCFE 估值完成，每股价值: ${value_per_share:.2f}")
            return result

        except Exception as e:
            logger.error(f"FCFE 估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"FCFE 估值失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查数据完整性和假设合理性",
            }

    def _run_sensitivity_analysis(self, base_equity_value, base_cost_of_equity, base_terminal_growth,
                                  projection_years, fcfe_forecast):
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

                    # 重新计算现值
                    pv_factors = [(1 + coe_val) ** (k + 1) for k in range(projection_years)]
                    pv_fcfe = [fcfe_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv = sum(pv_fcfe)

                    # 终值
                    terminal_fcfe = fcfe_forecast[-1] * (1 + g_val)
                    terminal_val = terminal_fcfe / (coe_val - g_val)
                    pv_terminal = terminal_val / ((1 + coe_val) ** projection_years)

                    equity_matrix[i, j] = total_pv + pv_terminal

            # 计算敏感性指标（与 DCF 类似）
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
            logger.error(f"FCFE 敏感性分析失败: {e}")
            return None