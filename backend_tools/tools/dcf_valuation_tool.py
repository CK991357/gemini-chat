"""
DCF估值工具 - 整合版
将dcf_model.py和sensitivity_analysis.py的核心功能整合
"""

from pydantic import BaseModel, Field, validator
from typing import Dict, Any, Optional, List, Union
import numpy as np
from datetime import datetime
import logging
from enum import Enum

logger = logging.getLogger(__name__)


class TerminalValueMethod(str, Enum):
    """终值计算方法"""
    PERPETUITY_GROWTH = "perpetuity_growth"
    EXIT_MULTIPLE = "exit_multiple"


class DCFValuationTool:
    """DCF估值模型工具"""
    
    name = "dcf_valuation"
    description = "折现现金流(DCF)估值模型，包含敏感性分析和情景规划"
    version = "2.0.0"
    
    class InputSchema(BaseModel):
        """输入参数定义"""
        company_name: str = Field(
            default="Company",
            description="公司名称"
        )
        historical_data: Dict[str, Any] = Field(
            ...,
            description="历史财务数据，必须包含revenue、ebitda、capex、nwc和years"
        )
        assumptions: Dict[str, Any] = Field(
            ...,
            description="预测假设参数"
        )
        wacc_components: Dict[str, Any] = Field(
            ...,
            description="WACC计算参数"
        )
        equity_params: Optional[Dict[str, Any]] = Field(
            default=None,
            description="股权价值计算参数"
        )
        terminal_method: TerminalValueMethod = Field(
            default=TerminalValueMethod.PERPETUITY_GROWTH,
            description="终值计算方法"
        )
        terminal_params: Optional[Dict[str, Any]] = Field(
            default=None,
            description="终值计算参数"
        )
        sensitivity_analysis: bool = Field(
            default=False,
            description="是否进行敏感性分析"
        )
        scenario_analysis: bool = Field(
            default=False,
            description="是否进行情景分析"
        )
        include_detailed_projections: bool = Field(
            default=True,
            description="是否包含详细预测表"
        )
        
        @validator('historical_data')
        def validate_historical_data(cls, v):
            required_fields = ['revenue', 'ebitda', 'years']
            for field in required_fields:
                if field not in v:
                    raise ValueError(f'historical_data必须包含{field}字段')
                if not isinstance(v[field], list) or len(v[field]) == 0:
                    raise ValueError(f'{field}必须是非空列表')
            return v
        
        @validator('assumptions')
        def validate_assumptions(cls, v):
            if 'projection_years' not in v:
                raise ValueError('assumptions必须包含projection_years')
            if v['projection_years'] <= 0:
                raise ValueError('projection_years必须大于0')
            return v
        
        @validator('wacc_components')
        def validate_wacc_components(cls, v):
            required_fields = ['risk_free_rate', 'beta', 'market_premium', 'cost_of_debt', 'debt_to_equity']
            for field in required_fields:
                if field not in v:
                    raise ValueError(f'wacc_components必须包含{field}字段')
            return v
        
        class Config:
            schema_extra = {
                "example": {
                    "company_name": "TechCorp",
                    "historical_data": {
                        "revenue": [800, 900, 1000],
                        "ebitda": [160, 189, 220],
                        "capex": [40, 45, 50],
                        "nwc": [80, 90, 100],
                        "years": [2022, 2023, 2024]
                    },
                    "assumptions": {
                        "projection_years": 5,
                        "revenue_growth": [0.15, 0.12, 0.10, 0.08, 0.06],
                        "ebitda_margin": [0.22, 0.23, 0.24, 0.24, 0.24],
                        "capex_percent": [0.05, 0.05, 0.05, 0.05, 0.05],
                        "nwc_percent": [0.10, 0.10, 0.10, 0.10, 0.10],
                        "tax_rate": 0.25,
                        "terminal_growth": 0.03
                    },
                    "wacc_components": {
                        "risk_free_rate": 0.04,
                        "beta": 1.2,
                        "market_premium": 0.07,
                        "cost_of_debt": 0.05,
                        "debt_to_equity": 0.5,
                        "tax_rate": 0.25
                    },
                    "terminal_method": "perpetuity_growth",
                    "equity_params": {
                        "net_debt": 200,
                        "cash": 100,
                        "shares_outstanding": 50
                    }
                }
            }
    
    input_schema = InputSchema
    
    def __init__(self):
        """初始化工具"""
        logger.info(f"初始化DCF估值工具 v{self.version}")
    
    async def execute(self, parameters: InputSchema) -> Dict[str, Any]:
        """执行DCF估值分析"""
        start_time = datetime.now()
        
        try:
            # 1. 计算WACC
            wacc = self._calculate_wacc(parameters.wacc_components)
            
            # 2. 获取历史数据
            historical = parameters.historical_data
            assumptions = parameters.assumptions
            
            # 3. 预测现金流
            projections = self._project_cash_flows(historical, assumptions)
            
            # 4. 计算终值
            terminal_value = self._calculate_terminal_value(
                projections, 
                wacc, 
                parameters.terminal_method,
                parameters.terminal_params or {}
            )
            
            # 5. 计算企业价值
            enterprise_value = self._calculate_enterprise_value(
                projections, terminal_value, wacc
            )
            
            # 6. 计算股权价值
            equity_value = None
            value_per_share = None
            if parameters.equity_params:
                equity_results = self._calculate_equity_value(
                    enterprise_value, parameters.equity_params
                )
                equity_value = equity_results["equity_value"]
                value_per_share = equity_results["value_per_share"]
            
            # 7. 敏感性分析
            sensitivity_results = None
            if parameters.sensitivity_analysis:
                sensitivity_results = self._run_sensitivity_analysis(
                    enterprise_value, wacc, parameters
                )
            
            # 8. 情景分析
            scenario_results = None
            if parameters.scenario_analysis:
                scenario_results = self._run_scenario_analysis(parameters)
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "success": True,
                "execution_time": execution_time,
                "company_name": parameters.company_name,
                "valuation": {
                    "enterprise_value": enterprise_value["ev"],
                    "enterprise_value_formatted": f"${enterprise_value['ev']:,.0f}",
                    "pv_of_fcf": enterprise_value["pv_fcf"],
                    "pv_of_terminal": enterprise_value["pv_terminal"],
                    "terminal_percent": enterprise_value["terminal_percent"],
                    "wacc": wacc,
                    "wacc_formatted": f"{wacc*100:.1f}%"
                },
                "equity_valuation": {
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}" if equity_value else None,
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}" if value_per_share else None
                } if equity_value else None,
                "projections": projections if parameters.include_detailed_projections else None,
                "sensitivity_analysis": sensitivity_results,
                "scenario_analysis": scenario_results,
                "key_assumptions": {
                    "projection_years": assumptions.get("projection_years", 5),
                    "avg_revenue_growth": np.mean(assumptions.get("revenue_growth", [0.1])) * 100,
                    "avg_ebitda_margin": np.mean(assumptions.get("ebitda_margin", [0.2])) * 100,
                    "terminal_growth": assumptions.get("terminal_growth", 0.03) * 100,
                    "terminal_method": parameters.terminal_method
                },
                "summary": self._generate_summary(
                    enterprise_value, equity_value, value_per_share, parameters.company_name
                ),
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "terminal_method": parameters.terminal_method,
                    "has_sensitivity": parameters.sensitivity_analysis,
                    "has_scenario": parameters.scenario_analysis
                }
            }
            
            logger.info(f"DCF估值完成，耗时: {execution_time:.2f}秒")
            return result
            
        except Exception as e:
            logger.error(f"DCF估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"DCF估值失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查输入数据格式和假设合理性"
            }
    
    def _calculate_wacc(self, components: Dict[str, Any]) -> float:
        """计算加权平均资本成本"""
        try:
            risk_free_rate = components.get("risk_free_rate", 0.04)
            beta = components.get("beta", 1.0)
            market_premium = components.get("market_premium", 0.06)
            cost_of_debt = components.get("cost_of_debt", 0.05)
            debt_to_equity = components.get("debt_to_equity", 0.5)
            tax_rate = components.get("tax_rate", 0.25)
            
            # 股权成本 (CAPM)
            cost_of_equity = risk_free_rate + beta * market_premium
            
            # 权重计算
            equity_weight = 1 / (1 + debt_to_equity)
            debt_weight = debt_to_equity / (1 + debt_to_equity)
            
            # WACC公式
            wacc = (equity_weight * cost_of_equity + 
                   debt_weight * cost_of_debt * (1 - tax_rate))
            
            # 合理性检查
            if wacc <= 0 or wacc > 0.5:
                logger.warning(f"WACC计算结果异常: {wacc}")
                return max(0.08, min(wacc, 0.20))  # 限制在8%-20%之间
            
            return wacc
            
        except Exception as e:
            logger.error(f"WACC计算失败: {str(e)}")
            return 0.10  # 默认返回10%
    
    def _project_cash_flows(self, historical: Dict[str, Any], assumptions: Dict[str, Any]) -> Dict[str, List[float]]:
        """预测现金流"""
        projection_years = assumptions.get("projection_years", 5)
        
        # 获取历史数据
        historical_revenue = historical.get("revenue", [])
        historical_years = historical.get("years", [])
        
        if not historical_revenue:
            raise ValueError("历史收入数据为空")
        
        # 基准收入（使用最近一年）
        base_revenue = historical_revenue[-1]
        
        # 获取假设参数
        revenue_growth = assumptions.get("revenue_growth", [0.10] * projection_years)
        ebitda_margin = assumptions.get("ebitda_margin", [0.20] * projection_years)
        capex_percent = assumptions.get("capex_percent", [0.05] * projection_years)
        nwc_percent = assumptions.get("nwc_percent", [0.10] * projection_years)
        tax_rate = assumptions.get("tax_rate", 0.25)
        depreciation_rate = assumptions.get("depreciation_rate", 0.03)
        
        # 确保数组长度正确
        if len(revenue_growth) < projection_years:
            revenue_growth = revenue_growth + [revenue_growth[-1]] * (projection_years - len(revenue_growth))
        
        # 初始化预测表
        projections = {
            "year": list(range(1, projection_years + 1)),
            "revenue": [],
            "revenue_growth": revenue_growth[:projection_years],
            "ebitda": [],
            "ebitda_margin": ebitda_margin[:projection_years],
            "depreciation": [],
            "ebit": [],
            "tax": [],
            "nopat": [],
            "capex": [],
            "capex_percent": capex_percent[:projection_years],
            "nwc": [],
            "nwc_percent": nwc_percent[:projection_years],
            "nwc_change": [],
            "fcf": []
        }
        
        prev_revenue = base_revenue
        prev_nwc = base_revenue * nwc_percent[0] if base_revenue > 0 else 0
        
        for i in range(projection_years):
            # 收入预测
            revenue = prev_revenue * (1 + revenue_growth[i])
            projections["revenue"].append(revenue)
            
            # EBITDA预测
            ebitda = revenue * ebitda_margin[i]
            projections["ebitda"].append(ebitda)
            
            # 折旧（简化：基于收入的比例）
            depreciation = revenue * depreciation_rate
            projections["depreciation"].append(depreciation)
            
            # EBIT
            ebit = ebitda - depreciation
            projections["ebit"].append(ebit)
            
            # 税收
            tax = ebit * tax_rate
            projections["tax"].append(tax)
            
            # NOPAT（税后经营利润）
            nopat = ebit - tax
            projections["nopat"].append(nopat)
            
            # 资本支出
            capex = revenue * capex_percent[i]
            projections["capex"].append(capex)
            
            # 营运资本
            nwc = revenue * nwc_percent[i]
            projections["nwc"].append(nwc)
            
            # 营运资本变动
            nwc_change = nwc - prev_nwc
            projections["nwc_change"].append(nwc_change)
            
            # 自由现金流
            fcf = nopat + depreciation - capex - nwc_change
            projections["fcf"].append(fcf)
            
            # 更新上期值
            prev_revenue = revenue
            prev_nwc = nwc
        
        # 计算累计和统计
        projections["cumulative_fcf"] = np.cumsum(projections["fcf"]).tolist()
        projections["avg_fcf_growth"] = self._calculate_cagr(
            projections["fcf"][0], projections["fcf"][-1], projection_years
        )
        
        return projections
    
    def _calculate_terminal_value(self, projections: Dict[str, List[float]], 
                                 wacc: float, method: TerminalValueMethod,
                                 params: Dict[str, Any]) -> float:
        """计算终值"""
        final_fcf = projections["fcf"][-1]
        final_ebitda = projections["ebitda"][-1]
        
        if method == TerminalValueMethod.PERPETUITY_GROWTH:
            # 永续增长法
            terminal_growth = params.get("terminal_growth", 0.03)
            
            # 检查合理性：永续增长率应小于WACC
            if terminal_growth >= wacc:
                logger.warning(f"永续增长率{terminal_growth}大于等于WACC{wacc}，调整为{wacc*0.8}")
                terminal_growth = wacc * 0.8
            
            terminal_fcf = final_fcf * (1 + terminal_growth)
            terminal_value = terminal_fcf / (wacc - terminal_growth)
            
        elif method == TerminalValueMethod.EXIT_MULTIPLE:
            # 退出倍数法
            exit_multiple = params.get("exit_multiple", 10.0)
            terminal_value = final_ebitda * exit_multiple
            
        else:
            raise ValueError(f"不支持的终值计算方法: {method}")
        
        return terminal_value
    
    def _calculate_enterprise_value(self, projections: Dict[str, List[float]], 
                                   terminal_value: float, wacc: float) -> Dict[str, float]:
        """计算企业价值"""
        pv_fcf_list = []
        
        # 计算预测期现金流的现值
        for i, fcf in enumerate(projections["fcf"]):
            discount_factor = (1 + wacc) ** (i + 1)
            pv = fcf / discount_factor
            pv_fcf_list.append(pv)
        
        total_pv_fcf = sum(pv_fcf_list)
        
        # 计算终值的现值
        projection_years = len(projections["year"])
        terminal_discount = (1 + wacc) ** projection_years
        pv_terminal = terminal_value / terminal_discount
        
        # 企业价值
        enterprise_value = total_pv_fcf + pv_terminal
        
        # 终值占比
        terminal_percent = (pv_terminal / enterprise_value) * 100 if enterprise_value > 0 else 0
        
        return {
            "ev": enterprise_value,
            "pv_fcf": total_pv_fcf,
            "pv_terminal": pv_terminal,
            "terminal_value": terminal_value,
            "terminal_percent": terminal_percent,
            "pv_fcf_detail": pv_fcf_list
        }
    
    def _calculate_equity_value(self, enterprise_value: Dict[str, float], 
                               equity_params: Dict[str, Any]) -> Dict[str, float]:
        """计算股权价值"""
        ev = enterprise_value["ev"]
        net_debt = equity_params.get("net_debt", 0)
        cash = equity_params.get("cash", 0)
        shares_outstanding = equity_params.get("shares_outstanding", 1)
        
        # 股权价值 = 企业价值 - 净债务 + 现金
        equity_value = ev - net_debt + cash
        
        # 每股价值
        value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0
        
        return {
            "equity_value": equity_value,
            "value_per_share": value_per_share,
            "shares_outstanding": shares_outstanding,
            "net_debt": net_debt,
            "cash": cash
        }
    
    def _run_sensitivity_analysis(self, base_ev: float, base_wacc: float, 
                                 parameters: InputSchema) -> Dict[str, Any]:
        """运行敏感性分析"""
        try:
            # 定义变量范围和步长
            wacc_range = np.linspace(base_wacc * 0.8, base_wacc * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)  # 永续增长率范围
            
            # 初始化结果矩阵
            ev_matrix = np.zeros((len(wacc_range), len(growth_range)))
            
            # 计算不同假设下的企业价值
            for i, wacc_val in enumerate(wacc_range):
                for j, growth_val in enumerate(growth_range):
                    # 创建修改后的假设
                    modified_assumptions = parameters.assumptions.copy()
                    modified_assumptions["terminal_growth"] = growth_val
                    
                    # 计算企业价值
                    projections = self._project_cash_flows(
                        parameters.historical_data, 
                        modified_assumptions
                    )
                    
                    terminal_value = self._calculate_terminal_value(
                        projections, wacc_val, parameters.terminal_method,
                        {"terminal_growth": growth_val}
                    )
                    
                    ev_result = self._calculate_enterprise_value(
                        projections, terminal_value, wacc_val
                    )
                    
                    ev_matrix[i, j] = ev_result["ev"]
            
            # 计算敏感性指标
            wacc_sensitivity = {
                "low": ev_matrix[0, :].tolist(),
                "base": ev_matrix[2, :].tolist(),
                "high": ev_matrix[-1, :].tolist(),
                "impact": ((ev_matrix[-1, 2] - ev_matrix[0, 2]) / base_ev) * 100
            }
            
            growth_sensitivity = {
                "low": ev_matrix[:, 0].tolist(),
                "base": ev_matrix[:, 2].tolist(),
                "high": ev_matrix[:, -1].tolist(),
                "impact": ((ev_matrix[2, -1] - ev_matrix[2, 0]) / base_ev) * 100
            }
            
            return {
                "wacc_sensitivity": wacc_sensitivity,
                "growth_sensitivity": growth_sensitivity,
                "ev_matrix": ev_matrix.tolist(),
                "wacc_range": wacc_range.tolist(),
                "growth_range": growth_range.tolist(),
                "base_enterprise_value": base_ev
            }
            
        except Exception as e:
            logger.error(f"敏感性分析失败: {str(e)}")
            return None
    
    def _run_scenario_analysis(self, parameters: InputSchema) -> Dict[str, Any]:
        """运行情景分析"""
        scenarios = {
            "base": {
                "name": "基础情景",
                "probability": 0.5,
                "revenue_growth_adjustment": 0.0,
                "margin_adjustment": 0.0,
                "wacc_adjustment": 0.0
            },
            "optimistic": {
                "name": "乐观情景",
                "probability": 0.3,
                "revenue_growth_adjustment": 0.2,  # 增长假设提高20%
                "margin_adjustment": 0.1,  # 利润率提高10%
                "wacc_adjustment": -0.05  # WACC降低5%
            },
            "pessimistic": {
                "name": "悲观情景",
                "probability": 0.2,
                "revenue_growth_adjustment": -0.2,  # 增长假设降低20%
                "margin_adjustment": -0.1,  # 利润率降低10%
                "wacc_adjustment": 0.05  # WACC提高5%
            }
        }
        
        scenario_results = []
        
        for scenario_key, scenario in scenarios.items():
            try:
                # 调整假设
                modified_assumptions = parameters.assumptions.copy()
                modified_wacc_components = parameters.wacc_components.copy()
                
                # 调整增长率
                if "revenue_growth" in modified_assumptions:
                    original_growth = modified_assumptions["revenue_growth"]
                    adjusted_growth = [g * (1 + scenario["revenue_growth_adjustment"]) for g in original_growth]
                    modified_assumptions["revenue_growth"] = adjusted_growth
                
                # 调整利润率
                if "ebitda_margin" in modified_assumptions:
                    original_margin = modified_assumptions["ebitda_margin"]
                    adjusted_margin = [m * (1 + scenario["margin_adjustment"]) for m in original_margin]
                    modified_assumptions["ebitda_margin"] = adjusted_margin
                
                # 调整WACC
                original_wacc = self._calculate_wacc(parameters.wacc_components)
                adjusted_wacc = original_wacc * (1 + scenario["wacc_adjustment"])
                modified_wacc_components["risk_free_rate"] *= (1 + scenario["wacc_adjustment"])
                
                # 计算估值
                wacc = self._calculate_wacc(modified_wacc_components)
                projections = self._project_cash_flows(
                    parameters.historical_data, 
                    modified_assumptions
                )
                
                terminal_value = self._calculate_terminal_value(
                    projections, wacc, parameters.terminal_method,
                    parameters.terminal_params or {}
                )
                
                ev_result = self._calculate_enterprise_value(
                    projections, terminal_value, wacc
                )
                
                equity_value = None
                if parameters.equity_params:
                    equity_result = self._calculate_equity_value(
                        ev_result, parameters.equity_params
                    )
                    equity_value = equity_result["equity_value"]
                
                scenario_results.append({
                    "scenario": scenario_key,
                    "name": scenario["name"],
                    "probability": scenario["probability"],
                    "enterprise_value": ev_result["ev"],
                    "equity_value": equity_value,
                    "wacc": wacc,
                    "avg_revenue_growth": np.mean(modified_assumptions.get("revenue_growth", [0.1])),
                    "avg_ebitda_margin": np.mean(modified_assumptions.get("ebitda_margin", [0.2]))
                })
                
            except Exception as e:
                logger.error(f"情景分析失败 ({scenario_key}): {str(e)}")
                continue
        
        if not scenario_results:
            return None
        
        # 计算期望值
        expected_ev = sum(r["enterprise_value"] * r["probability"] for r in scenario_results)
        expected_equity = sum(r.get("equity_value", 0) * r["probability"] for r in scenario_results 
                             if r.get("equity_value") is not None)
        
        return {
            "scenarios": scenario_results,
            "expected_values": {
                "enterprise_value": expected_ev,
                "equity_value": expected_equity if expected_equity > 0 else None
            },
            "range": {
                "min_ev": min(r["enterprise_value"] for r in scenario_results),
                "max_ev": max(r["enterprise_value"] for r in scenario_results),
                "ev_range": max(r["enterprise_value"] for r in scenario_results) - 
                          min(r["enterprise_value"] for r in scenario_results)
            }
        }
    
    @staticmethod
    def _calculate_cagr(start_value: float, end_value: float, years: int) -> float:
        """计算复合年增长率"""
        if start_value <= 0 or years <= 0:
            return 0.0
        return (end_value / start_value) ** (1 / years) - 1
    
    def _generate_summary(self, enterprise_value: Dict[str, float], 
                         equity_value: Optional[float], 
                         value_per_share: Optional[float],
                         company_name: str) -> str:
        """生成总结报告"""
        summary_parts = []
        
        ev = enterprise_value["ev"]
        terminal_percent = enterprise_value["terminal_percent"]
        
        summary_parts.append(f"{company_name}的DCF估值分析完成。")
        summary_parts.append(f"企业价值为${ev:,.0f}。")
        
        if terminal_percent > 70:
            summary_parts.append(f"注意：终值占比高达{terminal_percent:.1f}%，模型对终值假设非常敏感。")
        elif terminal_percent < 30:
            summary_parts.append(f"终值占比为{terminal_percent:.1f}%，估值主要基于预测期现金流。")
        else:
            summary_parts.append(f"终值占比为{terminal_percent:.1f}%。")
        
        if equity_value is not None:
            summary_parts.append(f"股权价值为${equity_value:,.0f}。")
        
        if value_per_share is not None:
            summary_parts.append(f"每股价值为${value_per_share:.2f}。")
        
        # 添加风险提示
        summary_parts.append("注：估值结果高度依赖假设参数，建议进行敏感性分析。")
        
        return " ".join(summary_parts)
    
    async def health_check(self) -> str:
        """健康检查"""
        # 简单测试计算功能
        try:
            test_wacc = self._calculate_wacc({
                "risk_free_rate": 0.04,
                "beta": 1.0,
                "market_premium": 0.06,
                "cost_of_debt": 0.05,
                "debt_to_equity": 0.5,
                "tax_rate": 0.25
            })
            
            if 0.05 <= test_wacc <= 0.20:
                return "available"
            else:
                return f"wacc_calc_abnormal: {test_wacc}"
        except Exception as e:
            return f"error: {str(e)}"