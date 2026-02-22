#!/usr/bin/env python3
"""
估值模型综合工具
整合 DCF、FCFE、RIM、EVA、APV 估值模型及蒙特卡洛模拟。
从会话工作区读取 AlphaVantage 获取的 JSON 文件，生成估值报告（Markdown + JSON）。
"""

import json
import logging
import asyncio
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union, Tuple
from enum import Enum

from pydantic import BaseModel, Field, validator

# 配置日志
logger = logging.getLogger(__name__)


# =============================================================================
# 以下为原 dcf_valuation_tool.py 内容（完整整合版）
# =============================================================================

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
            json_schema_extra = {
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
        logger.info(f"🚀 开始执行DCF估值分析")
        logger.debug(f"📋 输入参数: {parameters}")
        
        try:
            # 1. 计算WACC
            logger.debug("🧮 步骤1: 计算WACC")
            wacc = self._calculate_wacc(parameters.wacc_components)
            logger.info(f"✅ WACC计算完成: {wacc:.2%}")
            
            # 2. 获取历史数据
            logger.debug("📊 步骤2: 获取历史数据")
            historical = parameters.historical_data
            assumptions = parameters.assumptions
            logger.debug(f"📈 历史数据年份数: {len(historical.get('years', []))}")
            
            # 3. 预测现金流
            logger.debug("🔮 步骤3: 预测现金流")
            projections = self._project_cash_flows(historical, assumptions)
            logger.info(f"✅ 现金流预测完成，预测年数: {len(projections['year'])}")
            
            # 4. 计算终值
            logger.debug("🎯 步骤4: 计算终值")
            terminal_method = getattr(parameters, 'terminal_method', 'perpetuity_growth')
            terminal_params = getattr(parameters, 'terminal_params', {})
            terminal_value = self._calculate_terminal_value(
                projections, 
                wacc, 
                terminal_method,
                terminal_params
            )
            logger.info(f"✅ 终值计算完成: ${terminal_value:,.0f}")
            
            # 5. 计算企业价值
            logger.debug("🏢 步骤5: 计算企业价值")
            enterprise_value = self._calculate_enterprise_value(
                projections, terminal_value, wacc
            )
            logger.info(f"✅ 企业价值计算完成: ${enterprise_value['ev']:,.0f}")
            
            # 6. 计算股权价值
            logger.debug("💰 步骤6: 计算股权价值")
            equity_value = None
            value_per_share = None
            if parameters.equity_params:
                equity_results = self._calculate_equity_value(
                    enterprise_value, parameters.equity_params
                )
                equity_value = equity_results["equity_value"]
                value_per_share = equity_results["value_per_share"]
                logger.info(f"✅ 股权价值计算完成: ${equity_value:,.0f}, 每股价值: ${value_per_share:.2f}")
            
            # 7. 敏感性分析
            logger.debug("🔍 步骤7: 敏感性分析")
            sensitivity_results = None
            if parameters.sensitivity_analysis:
                sensitivity_results = self._run_sensitivity_analysis(
                    enterprise_value["ev"],  # 关键修复
                    wacc, 
                    parameters
                )
                logger.info("✅ 敏感性分析完成")
            
            # 8. 情景分析
            logger.debug("🎭 步骤8: 情景分析")
            scenario_results = None
            if parameters.scenario_analysis:
                scenario_results = self._run_scenario_analysis(parameters)
                logger.info("✅ 情景分析完成")
            
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
                    "terminal_value": enterprise_value["terminal_value"],
                    "terminal_percent": enterprise_value["terminal_percent"],
                    "wacc": wacc,
                    "wacc_formatted": f"{wacc*100:.1f}%"
                },
                "equity_valuation": {
                    "equity_value": equity_value,
                    "equity_value_formatted": f"${equity_value:,.0f}" if equity_value else None,
                    "value_per_share": value_per_share,
                    "value_per_share_formatted": f"${value_per_share:.2f}" if value_per_share else None,
                    "shares_outstanding": parameters.equity_params.get("shares_outstanding") if parameters.equity_params else None,
                    "net_debt": parameters.equity_params.get("net_debt") if parameters.equity_params else None,
                    "cash": parameters.equity_params.get("cash") if parameters.equity_params else None
                } if equity_value else None,
                "projections": projections if parameters.include_detailed_projections else None,
                "sensitivity_analysis": sensitivity_results,
                "scenario_analysis": scenario_results,
                "key_assumptions": {
                    "projection_years": assumptions.get("projection_years", 5),
                    "avg_revenue_growth": np.mean(assumptions.get("revenue_growth", [0.1])) * 100,
                    "avg_ebitda_margin": np.mean(assumptions.get("ebitda_margin", [0.2])) * 100,
                    "terminal_growth": assumptions.get("terminal_growth", 0.03) * 100,
                    "terminal_method": parameters.terminal_method.value if isinstance(parameters.terminal_method, Enum) else parameters.terminal_method
                },
                "summary": self._generate_summary(
                    enterprise_value, equity_value, value_per_share, parameters.company_name
                ),
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "terminal_method": parameters.terminal_method.value if isinstance(parameters.terminal_method, Enum) else parameters.terminal_method,
                    "has_sensitivity": parameters.sensitivity_analysis,
                    "has_scenario": parameters.scenario_analysis
                },
                "wacc_components_input": parameters.wacc_components,
                "assumptions_input": parameters.assumptions,
                "terminal_params_input": parameters.terminal_params,
                "historical_data_input": parameters.historical_data,
                "equity_params_input": parameters.equity_params,
                "terminal_method_input": parameters.terminal_method.value if isinstance(parameters.terminal_method, Enum) else parameters.terminal_method
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
        logger.debug(f"📥 开始计算WACC，组件参数: {components}")
        
        try:
            risk_free_rate = components.get("risk_free_rate", 0.04)
            beta = components.get("beta", 1.0)
            market_premium = components.get("market_premium", 0.06)
            cost_of_debt = components.get("cost_of_debt", 0.05)
            debt_to_equity = components.get("debt_to_equity", 0.5)
            tax_rate = components.get("tax_rate", 0.25)
            
            logger.debug(f"🧮 计算参数 - 无风险利率: {risk_free_rate:.2%}, Beta: {beta}, 市场风险溢价: {market_premium:.2%}")
            logger.debug(f"🏦 债务成本: {cost_of_debt:.2%}, 债股比: {debt_to_equity:.2f}, 税率: {tax_rate:.2%}")
            
            # 股权成本 (CAPM)
            cost_of_equity = risk_free_rate + beta * market_premium
            logger.debug(f"📈 权益成本: {cost_of_equity:.2%}")
            
            # 权重计算
            equity_weight = 1 / (1 + debt_to_equity)
            debt_weight = debt_to_equity / (1 + debt_to_equity)
            
            logger.debug(f"⚖️ 权重 - 权益权重: {equity_weight:.2%}, 债务权重: {debt_weight:.2%}")
            
            # WACC公式
            wacc = (equity_weight * cost_of_equity + 
                   debt_weight * cost_of_debt * (1 - tax_rate))
            
            # 合理性检查
            if wacc <= 0 or wacc > 0.5:
                logger.warning(f"⚠️ WACC计算结果异常: {wacc}")
                wacc = max(0.08, min(wacc, 0.20))  # 限制在8%-20%之间
            
            logger.debug(f"📤 WACC计算完成: {wacc:.2%}")
            return wacc
            
        except Exception as e:
            logger.error(f"❌ WACC计算失败: {str(e)}")
            return 0.10  # 默认返回10%
    
    def _project_cash_flows(self, historical: Dict[str, Any], assumptions: Dict[str, Any]) -> Dict[str, List[float]]:
        """预测现金流"""
        logger.debug(f"📥 开始预测现金流")
        logger.debug(f"📊 历史数据: {historical}")
        logger.debug(f"⚙️ 假设参数: {assumptions}")
        
        projection_years = assumptions.get("projection_years", 5)
        
        # 获取历史数据
        historical_revenue = historical.get("revenue", [])
        historical_years = historical.get("years", [])
        
        if not historical_revenue:
            logger.error("❌ 历史收入数据为空")
            raise ValueError("历史收入数据为空")
        
        # 基准收入（使用最近一年）
        base_revenue = historical_revenue[-1]
        logger.debug(f"📈 基准收入: ${base_revenue:,.0f}")
        
        # 获取假设参数
        revenue_growth = assumptions.get("revenue_growth", [0.10] * projection_years)
        ebitda_margin = assumptions.get("ebitda_margin", [0.20] * projection_years)
        capex_percent = assumptions.get("capex_percent", [0.05] * projection_years)
        nwc_percent = assumptions.get("nwc_percent", [0.10] * projection_years)
        tax_rate = assumptions.get("tax_rate", 0.25)
        depreciation_rate = assumptions.get("depreciation_rate", 0.03)
        
        logger.debug(f"📈 收入增长率: {[f'{g*100:.1f}%' for g in revenue_growth]}")
        logger.debug(f"💰 EBITDA利润率: {[f'{m*100:.1f}%' for m in ebitda_margin]}")
        
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
            year = i + 1
            logger.debug(f"📅 计算第{year}年现金流预测")
            
            # 收入预测
            growth_rate = revenue_growth[i]
            revenue = prev_revenue * (1 + growth_rate)
            projections["revenue"].append(revenue)
            logger.debug(f"  💰 第{year}年收入: ${revenue:,.0f} (增长率: {growth_rate*100:.1f}%)")
            
            # EBITDA预测
            margin = ebitda_margin[i]
            ebitda = revenue * margin
            projections["ebitda"].append(ebitda)
            logger.debug(f"  💎 第{year}年EBITDA: ${ebitda:,.0f} (利润率: {margin*100:.1f}%)")
            
            # 折旧
            depreciation = revenue * depreciation_rate
            projections["depreciation"].append(depreciation)
            logger.debug(f"  🔧 第{year}年折旧: ${depreciation:,.0f}")
            
            # EBIT
            ebit = ebitda - depreciation
            projections["ebit"].append(ebit)
            logger.debug(f"  📊 第{year}年EBIT: ${ebit:,.0f}")
            
            # 税收
            tax = ebit * tax_rate
            projections["tax"].append(tax)
            logger.debug(f"  🏛️ 第{year}年税收: ${tax:,.0f} (税率: {tax_rate*100:.1f}%)")
            
            # NOPAT
            nopat = ebit - tax
            projections["nopat"].append(nopat)
            logger.debug(f"  💵 第{year}年NOPAT: ${nopat:,.0f}")
            
            # CapEx
            capex = revenue * capex_percent[i]
            projections["capex"].append(capex)
            logger.debug(f"  🏗️ 第{year}年CapEx: ${capex:,.0f}")
            
            # NWC
            nwc = revenue * nwc_percent[i]
            projections["nwc"].append(nwc)
            nwc_change = nwc - prev_nwc
            projections["nwc_change"].append(nwc_change)
            logger.debug(f"  💰 第{year}年NWC变动: ${nwc_change:,.0f}")
            
            # 自由现金流
            fcf = nopat + depreciation - capex - nwc_change
            projections["fcf"].append(fcf)
            logger.debug(f"  💎 第{year}年自由现金流: ${fcf:,.0f}")
            
            prev_revenue = revenue
            prev_nwc = nwc
        
        projections["cumulative_fcf"] = np.cumsum(projections["fcf"]).tolist()
        logger.debug(f"📤 现金流预测完成，预测期FCF: {[f'${x:,.0f}' for x in projections['fcf']]}")
        return projections
    
    def _calculate_terminal_value(self, projections: Dict[str, List[float]], 
                                 wacc: float, method: TerminalValueMethod,
                                 params: Dict[str, Any]) -> float:
        """计算终值"""
        logger.debug(f"📥 开始计算终值")
        logger.debug(f"🧮 参数 - WACC: {wacc:.2%}, 方法: {method}, 参数: {params}")
        
        final_fcf = projections["fcf"][-1]
        final_ebitda = projections["ebitda"][-1]
        
        logger.debug(f"📈 最终年FCF: ${final_fcf:,.0f}, 最终年EBITDA: ${final_ebitda:,.0f}")
        
        if method == TerminalValueMethod.PERPETUITY_GROWTH:
            # 永续增长法
            terminal_growth = params.get("terminal_growth", 0.03)
            logger.debug(f"🔄 使用永续增长法，增长率: {terminal_growth:.2%}")
            
            # 检查合理性：永续增长率应小于WACC
            if terminal_growth >= wacc:
                logger.warning(f"⚠️ 永续增长率{terminal_growth}大于等于WACC{wacc}，调整为{wacc*0.8}")
                terminal_growth = wacc * 0.8
            
            terminal_fcf = final_fcf * (1 + terminal_growth)
            terminal_value = terminal_fcf / (wacc - terminal_growth)
            logger.debug(f"🎯 永续增长法终值: ${terminal_value:,.0f}")
            
        elif method == TerminalValueMethod.EXIT_MULTIPLE:
            # 退出倍数法
            exit_multiple = params.get("exit_multiple", 10.0)
            terminal_value = final_ebitda * exit_multiple
            logger.debug(f"🔢 退出倍数法终值: ${terminal_value:,.0f} (倍数: {exit_multiple}x)")
            
        else:
            logger.error(f"❌ 不支持的终值计算方法: {method}")
            raise ValueError(f"不支持的终值计算方法: {method}")
        
        logger.debug(f"📤 终值计算完成: ${terminal_value:,.0f}")
        return terminal_value
    
    def _calculate_enterprise_value(self, projections: Dict[str, List[float]], 
                                   terminal_value: float, wacc: float) -> Dict[str, float]:
        """计算企业价值"""
        logger.debug(f"📥 开始计算企业价值")
        logger.debug(f"🧮 参数 - 终值: ${terminal_value:,.0f}, WACC: {wacc:.2%}")
        
        pv_fcf_list = []
        
        # 计算预测期现金流的现值
        logger.debug("💎 计算预测期现金流现值")
        for i, fcf in enumerate(projections["fcf"]):
            year = i + 1
            discount_factor = (1 + wacc) ** year
            pv = fcf / discount_factor
            pv_fcf_list.append(pv)
            logger.debug(f"  第{year}年FCF现值: ${pv:,.0f} (贴现因子: {discount_factor:.3f})")
        
        total_pv_fcf = sum(pv_fcf_list)
        logger.debug(f"💰 预测期现金流总现值: ${total_pv_fcf:,.0f}")
        
        # 计算终值的现值
        projection_years = len(projections["year"])
        terminal_discount = (1 + wacc) ** projection_years
        pv_terminal = terminal_value / terminal_discount
        logger.debug(f"🎯 终值现值: ${pv_terminal:,.0f} (贴现因子: {terminal_discount:.3f})")
        
        # 企业价值
        enterprise_value = total_pv_fcf + pv_terminal
        logger.debug(f"🏢 企业价值总额: ${enterprise_value:,.0f}")
        
        # 终值占比
        terminal_percent = (pv_terminal / enterprise_value) * 100 if enterprise_value > 0 else 0
        logger.debug(f"📊 终值占比: {terminal_percent:.1f}%")
        
        result = {
            "ev": enterprise_value,
            "pv_fcf": total_pv_fcf,
            "pv_terminal": pv_terminal,
            "terminal_value": terminal_value,
            "terminal_percent": terminal_percent,
            "pv_fcf_detail": pv_fcf_list
        }
        
        logger.debug(f"📤 企业价值计算完成: {result}")
        return result
    
    def _calculate_equity_value(self, enterprise_value: Dict[str, float], 
                               equity_params: Dict[str, Any]) -> Dict[str, float]:
        """计算股权价值"""
        logger.debug(f"📥 开始计算股权价值")
        logger.debug(f"🏢 企业价值: ${enterprise_value['ev']:,.0f}")
        logger.debug(f"📊 股权参数: {equity_params}")
        
        ev = enterprise_value["ev"]
        net_debt = equity_params.get("net_debt", 0)
        cash = equity_params.get("cash", 0)
        shares_outstanding = equity_params.get("shares_outstanding", 1)
        
        logger.debug(f"🧮 计算参数 - 净债务: ${net_debt:,.0f}, 现金: ${cash:,.0f}, 流通股数: {shares_outstanding}")
        
        # 股权价值 = 企业价值 - 净债务 + 现金
        equity_value = ev - net_debt + cash
        logger.debug(f"💰 股权价值计算: ${ev:,.0f} - ${net_debt:,.0f} + ${cash:,.0f} = ${equity_value:,.0f}")
        
        # 每股价值
        value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0
        logger.debug(f"💎 每股价值: ${value_per_share:.2f}")
        
        result = {
            "equity_value": equity_value,
            "value_per_share": value_per_share,
            "shares_outstanding": shares_outstanding,
            "net_debt": net_debt,
            "cash": cash
        }
        
        logger.debug(f"📤 股权价值计算完成: {result}")
        return result
    
    def _run_sensitivity_analysis(self, base_ev: float, base_wacc: float, 
                                 parameters: InputSchema) -> Dict[str, Any]:
        """运行敏感性分析"""
        logger.debug(f"📥 开始敏感性分析")
        logger.debug(f"📊 基准参数 - 企业价值: ${base_ev:,.0f}, WACC: {base_wacc:.2%}")
        
        try:
            # 定义变量范围和步长
            wacc_range = np.linspace(base_wacc * 0.8, base_wacc * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)  # 永续增长率范围
            
            logger.debug(f"📉 WACC范围: {[f'{w:.2%}' for w in wacc_range]}")
            logger.debug(f"📈 增长率范围: {[f'{g:.2%}' for g in growth_range]}")
            
            # 初始化结果矩阵
            ev_matrix = np.zeros((len(wacc_range), len(growth_range)))
            
            # 计算不同假设下的企业价值
            logger.debug("🧮 计算敏感性矩阵")
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
                    logger.debug(f"  WACC {wacc_val:.2%}, 增长率 {growth_val:.2%} → EV ${ev_result['ev']:,.0f}")
            
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
            
            result = {
                "wacc_sensitivity": wacc_sensitivity,
                "growth_sensitivity": growth_sensitivity,
                "ev_matrix": ev_matrix.tolist(),
                "wacc_range": wacc_range.tolist(),
                "growth_range": growth_range.tolist()
            }
            
            logger.debug(f"📤 敏感性分析完成")
            return result
            
        except Exception as e:
            logger.error(f"❌ 敏感性分析失败: {str(e)}")
            return None
    
    def _run_scenario_analysis(self, parameters: InputSchema) -> Dict[str, Any]:
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
                "revenue_growth_adjustment": 0.2,
                "margin_adjustment": 0.1,
                "wacc_adjustment": -0.05
            },
            "pessimistic": {
                "name": "悲观情景",
                "probability": 0.2,
                "revenue_growth_adjustment": -0.2,
                "margin_adjustment": -0.1,
                "wacc_adjustment": 0.05
            }
        }
        
        scenario_results = []
        
        for scenario_key, scenario in scenarios.items():
            try:
                modified_assumptions = parameters.assumptions.copy()
                modified_wacc_components = parameters.wacc_components.copy()
                
                if "revenue_growth" in modified_assumptions:
                    original_growth = modified_assumptions["revenue_growth"]
                    adjusted_growth = [g * (1 + scenario["revenue_growth_adjustment"]) for g in original_growth]
                    modified_assumptions["revenue_growth"] = adjusted_growth
                
                if "ebitda_margin" in modified_assumptions:
                    original_margin = modified_assumptions["ebitda_margin"]
                    adjusted_margin = [m * (1 + scenario["margin_adjustment"]) for m in original_margin]
                    modified_assumptions["ebitda_margin"] = adjusted_margin
                
                original_wacc = self._calculate_wacc(parameters.wacc_components)
                adjusted_wacc = original_wacc * (1 + scenario["wacc_adjustment"])
                modified_wacc_components["risk_free_rate"] *= (1 + scenario["wacc_adjustment"])
                
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
        if start_value <= 0 or years <= 0:
            return 0.0
        return (end_value / start_value) ** (1 / years) - 1
    
    def _generate_summary(self, enterprise_value: Dict[str, float], 
                         equity_value: Optional[float], 
                         value_per_share: Optional[float],
                         company_name: str) -> str:
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
        
        summary_parts.append("注：估值结果高度依赖假设参数，建议进行敏感性分析。")
        return " ".join(summary_parts)
    
    async def health_check(self) -> str:
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


# =============================================================================
# 以下为原 dcf_auto_all.py 内容（数据加载与自动构建，已增强健壮性）
# =============================================================================

def _safe_float(value, default=0.0) -> float:
    """安全转换为浮点数"""
    if value is None:
        return default
    if isinstance(value, str):
        if value.strip().upper() == 'NONE' or value.strip() == '':
            return default
        try:
            return float(value)
        except ValueError:
            return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


class DCFAutoValuation:
    """自动DCF估值数据加载器（适配会话工作区，增强异常处理）"""

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.dcf_tool = DCFValuationTool()  # 复用核心计算工具

    def load_json(self, filename: str) -> Optional[Dict]:
        """安全加载JSON文件，文件不存在时返回None"""
        filepath = self.data_dir / filename
        if not filepath.exists():
            logger.warning(f"文件不存在: {filepath}")
            return None
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载JSON文件失败 {filepath}: {e}")
            return None

    def load_treasury_rates(self, filename: str = "treasury_10year_daily.parquet") -> Optional[pd.DataFrame]:
        """
        加载国债收益率文件。仅从会话目录读取。
        如果文件不存在，返回一个模拟数据帧并记录警告（避免崩溃）。
        """
        filepath = self.data_dir / filename
        if filepath.exists():
            try:
                return pd.read_parquet(filepath)
            except Exception as e:
                logger.warning(f"读取国债文件失败 {filepath}: {e}")

        # 若文件不存在，返回模拟数据（避免服务崩溃）
        logger.warning(f"无法找到国债收益率文件 {filepath}，使用模拟数据（默认无风险利率 4.5%）")
        # 生成一个包含最近日期的模拟DataFrame
        today = datetime.now().date()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(10)]
        # 使用当前实际10年期国债收益率近似值（可根据需要调整）
        mock_yield = 0.045  # 4.5%
        mock_df = pd.DataFrame({
            'date': dates,
            'yield': [mock_yield] * 10
        })
        mock_df['date'] = pd.to_datetime(mock_df['date'])
        return mock_df

    def get_risk_free_rate(self, method: str = "latest") -> float:
        df = self.load_treasury_rates()
        if df is None or df.empty:
            logger.warning("无法获取国债收益率，使用默认值 4.5%")
            return 0.045

        # 识别日期列
        date_col = None
        for col in df.columns:
            if 'date' in col.lower():
                date_col = col
                break
        if date_col is None:
            # 假设第一列为日期
            date_col = df.columns[0]
        df['date'] = pd.to_datetime(df[date_col])
        df = df.sort_values('date')

        # 识别收益率列
        possible_rate_cols = ['yield', 'rate', 'close', 'price', 'value']
        rate_col = None
        for col in possible_rate_cols:
            if col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):
                    rate_col = col
                    break
                else:
                    try:
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                        if df[col].notna().any():
                            rate_col = col
                            break
                    except:
                        continue
        if rate_col is None:
            if len(df.columns) >= 2:
                rate_col = df.columns[1]
                df[rate_col] = pd.to_numeric(df[rate_col], errors='coerce')
            else:
                logger.warning("无法找到收益率列，使用默认值 4.5%")
                return 0.045

        if method == "latest":
            latest = df.iloc[-1]
            return float(latest[rate_col]) / 100
        elif method == "1y_avg":
            one_year_ago = datetime.now() - pd.DateOffset(years=1)
            recent = df[df['date'] >= one_year_ago]
            if len(recent) == 0:
                recent = df.tail(252)
            return float(recent[rate_col].mean()) / 100
        else:
            logger.warning(f"未知的method: {method}，使用latest")
            return self.get_risk_free_rate(method="latest")

    def extract_historical_data(self, symbol: str) -> Dict[str, List]:
        """从三张表中提取历史数据，按日期升序排列（旧→新）"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        cf = self.load_json(f"cash_flow_{symbol}.json")
        inc = self.load_json(f"income_statement_{symbol}.json")

        # 如果任一必需文件缺失，返回空数据
        if bs is None or cf is None or inc is None:
            logger.error(f"缺少必需财务文件，无法提取历史数据 for {symbol}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}

        # 安全获取annualReports，添加空列表检查
        annual_bs_reports = bs.get('annualReports', [])
        annual_cf_reports = cf.get('annualReports', [])
        annual_inc_reports = inc.get('annualReports', [])
        
        # 检查报告列表是否为空
        if not annual_bs_reports:
            logger.warning(f"资产负债表 annualReports 为空 for {symbol}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}
        
        if not annual_cf_reports:
            logger.warning(f"现金流量表 annualReports 为空 for {symbol}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}
        
        if not annual_inc_reports:
            logger.warning(f"利润表 annualReports 为空 for {symbol}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}

        # 安全排序，添加键存在性检查
        try:
            annual_bs = sorted(annual_bs_reports, key=lambda x: x.get('fiscalDateEnding', ''))
            annual_cf = sorted(annual_cf_reports, key=lambda x: x.get('fiscalDateEnding', ''))
            annual_inc = sorted(annual_inc_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序财务报告时出错 for {symbol}: {e}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}

        # 检查排序后的列表是否为空
        if not annual_bs or not annual_cf or not annual_inc:
            logger.warning(f"排序后财务报告列表为空 for {symbol}")
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}

        # 数据对齐检查
        if not (len(annual_bs) == len(annual_cf) == len(annual_inc)):
            logger.warning("三张表数量不一致，尝试按日期对齐")
            try:
                bs_dict = {item.get('fiscalDateEnding', ''): item for item in annual_bs if item.get('fiscalDateEnding')}
                cf_dict = {item.get('fiscalDateEnding', ''): item for item in annual_cf if item.get('fiscalDateEnding')}
                inc_dict = {item.get('fiscalDateEnding', ''): item for item in annual_inc if item.get('fiscalDateEnding')}
                
                common_dates = sorted(set(bs_dict.keys()) & set(cf_dict.keys()) & set(inc_dict.keys()))
                if not common_dates:
                    logger.error(f"无法找到共同的财务报告日期 for {symbol}")
                    return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}
                    
                annual_bs = [bs_dict[d] for d in common_dates]
                annual_cf = [cf_dict[d] for d in common_dates]
                annual_inc = [inc_dict[d] for d in common_dates]
            except Exception as e:
                logger.error(f"数据对齐过程中出错 for {symbol}: {e}")
                return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}

        years, revenue, ebitda, capex, nwc = [], [], [], [], []
        
        # 主要数据提取循环，添加详细的字段存在性检查
        for i in range(len(annual_inc)):
            try:
                inc_item = annual_inc[i]
                cf_item = annual_cf[i] if i < len(annual_cf) else {}
                bs_item = annual_bs[i] if i < len(annual_bs) else {}

                # 安全提取年份
                fiscal_date = inc_item.get('fiscalDateEnding', '')
                if not fiscal_date or len(fiscal_date) < 4:
                    logger.warning(f"无效的财政日期格式: {fiscal_date}")
                    continue
                    
                year_str = fiscal_date[:4]
                try:
                    year = int(year_str)
                    years.append(year)
                except ValueError:
                    logger.warning(f"无法解析年份: {year_str}")
                    continue

                # 安全提取收入数据
                revenue_val = _safe_float(inc_item.get('totalRevenue', 0))
                if revenue_val <= 0:
                    logger.warning(f"收入数据异常或为零: {revenue_val}, 年份: {year}")
                revenue.append(revenue_val)

                # 安全提取EBITDA数据
                ebitda_val = 0.0
                if 'ebitda' in inc_item and inc_item['ebitda'] not in (None, 'None', ''):
                    ebitda_val = _safe_float(inc_item['ebitda'])
                else:
                    ebit = _safe_float(inc_item.get('ebit', 0))
                    da = _safe_float(inc_item.get('depreciationAndAmortization', 0))
                    ebitda_val = ebit + da
                
                if ebitda_val <= 0:
                    logger.debug(f"EBITDA为零或负数: {ebitda_val}, 年份: {year}")
                ebitda.append(ebitda_val)

                # 安全提取资本支出数据
                capex_val = abs(_safe_float(cf_item.get('capitalExpenditures', 0)))
                capex.append(capex_val)

                # 安全提取营运资本数据
                receivables = _safe_float(bs_item.get('currentNetReceivables', 0))
                inventory = _safe_float(bs_item.get('inventory', 0))
                payables = _safe_float(bs_item.get('currentAccountsPayable', 0))
                
                if receivables > 0 or inventory > 0 or payables > 0:
                    nwc_val = receivables + inventory - payables
                else:
                    # 备用方案：使用总资产减总负债
                    current_assets = _safe_float(bs_item.get('totalCurrentAssets', 0))
                    current_liab = _safe_float(bs_item.get('totalCurrentLiabilities', 0))
                    nwc_val = current_assets - current_liab
                
                nwc.append(nwc_val)

            except Exception as e:
                logger.error(f"处理第{i}条财务记录时出错 for {symbol}: {e}")
                continue

        # 最终数据质量检查
        if len(years) < 2:
            logger.warning(f"有效历史数据不足2年，实际只有{len(years)}年 for {symbol}")
        
        logger.info(f"成功提取 {symbol} 的历史数据，共 {len(years)} 年记录")

        return {
            "revenue": revenue,
            "ebitda": ebitda,
            "capex": capex,
            "nwc": nwc,
            "years": years
        }

    def extract_net_income(self, symbol: str) -> List[float]:
        """提取历史净利润数据，增强容错性"""
        inc = self.load_json(f"income_statement_{symbol}.json")
        if inc is None:
            logger.warning(f"无法加载利润表数据 for {symbol}")
            return []
        
        annual_reports = inc.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"利润表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_inc = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序利润表数据时出错 for {symbol}: {e}")
            return []
        
        net_income_list = []
        for i, item in enumerate(annual_inc):
            try:
                net_income = _safe_float(item.get('netIncome', 0))
                net_income_list.append(net_income)
            except Exception as e:
                logger.warning(f"处理第{i}条净利润数据时出错 for {symbol}: {e}")
                net_income_list.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的净利润数据，共 {len(net_income_list)} 条记录")
        return net_income_list

    def extract_total_dividends(self, symbol: str) -> List[float]:
        """提取历史股息总额，增强容错性"""
        cf = self.load_json(f"cash_flow_{symbol}.json")
        if cf is None:
            logger.warning(f"无法加载现金流量表数据 for {symbol}")
            return []
        
        annual_reports = cf.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"现金流量表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_cf = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序现金流量表数据时出错 for {symbol}: {e}")
            return []
        
        dividends = []
        for i, item in enumerate(annual_cf):
            try:
                div = _safe_float(item.get('dividendPaid', 0))
                dividends.append(abs(div))  # 取绝对值表示支付的现金
            except Exception as e:
                logger.warning(f"处理第{i}条股息数据时出错 for {symbol}: {e}")
                dividends.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的股息数据，共 {len(dividends)} 条记录")
        return dividends

    def extract_dividend_per_share(self, symbol: str) -> List[float]:
        """
        从 dividends_{symbol}.json 提取历史每股股息，并按财年汇总。
        返回列表按财年升序（每股股息）。
        """
        div_data = self.load_json(f"dividends_{symbol}.json")
        if div_data is None:
            logger.warning(f"未找到 dividends_{symbol}.json，返回空列表")
            return []

        # 获取财年结束月份
        overview = self.load_json(f"overview_{symbol}.json")
        fiscal_year_end = overview.get('FiscalYearEnd', 'December') if overview else 'December'
        month_map = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        }
        fiscal_month = month_map.get(fiscal_year_end, 12)

        # 将股息按财年分组
        div_by_year = {}
        for item in div_data.get('data', []):
            ex_date = item.get('ex_dividend_date')
            if ex_date is None or ex_date == 'None':
                continue
            try:
                dt = datetime.strptime(ex_date, '%Y-%m-%d')
            except:
                continue
            amount = _safe_float(item.get('amount', 0))
            if amount <= 0:
                continue
            # 确定财年：如果 dt.month > fiscal_month，则属于下一财年
            if dt.month > fiscal_month:
                fiscal_year = dt.year + 1
            else:
                fiscal_year = dt.year
            div_by_year[fiscal_year] = div_by_year.get(fiscal_year, 0) + amount

        # 按年份排序
        sorted_years = sorted(div_by_year.keys())
        return [div_by_year[y] for y in sorted_years]

    def extract_book_value(self, symbol: str) -> List[float]:
        """提取历史账面价值（股东权益），增强容错性"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        if bs is None:
            logger.warning(f"无法加载资产负债表数据 for {symbol}")
            return []
        
        annual_reports = bs.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"资产负债表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_bs = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序资产负债表数据时出错 for {symbol}: {e}")
            return []
        
        book_values = []
        for i, item in enumerate(annual_bs):
            try:
                book_value = _safe_float(item.get('totalShareholderEquity', 0))
                if book_value <= 0:
                    logger.warning(f"账面价值为零或负数: {book_value}, 项目索引: {i}")
                book_values.append(book_value)
            except Exception as e:
                logger.warning(f"处理第{i}条账面价值数据时出错 for {symbol}: {e}")
                book_values.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的账面价值数据，共 {len(book_values)} 条记录")
        return book_values

    def extract_net_borrowing(self, symbol: str) -> List[float]:
        """提取历史净借款数据，增强容错性"""
        cf = self.load_json(f"cash_flow_{symbol}.json")
        if cf is None:
            logger.warning(f"无法加载现金流量表数据 for {symbol}")
            return []
        
        annual_reports = cf.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"现金流量表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_cf = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序现金流量表数据时出错 for {symbol}: {e}")
            return []
        
        net_borrowings = []
        for i, item in enumerate(annual_cf):
            try:
                issuance = _safe_float(item.get('issuanceOfDebt', 0))
                repayment = _safe_float(item.get('repaymentOfDebt', 0))
                net_borrowing = issuance - repayment
                net_borrowings.append(net_borrowing)
            except Exception as e:
                logger.warning(f"处理第{i}条净借款数据时出错 for {symbol}: {e}")
                net_borrowings.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的净借款数据，共 {len(net_borrowings)} 条记录")
        return net_borrowings

    def extract_debt_history(self, symbol: str) -> List[float]:
        """提取历史总债务数据，增强容错性"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        if bs is None:
            logger.warning(f"无法加载资产负债表数据 for {symbol}")
            return []
        
        annual_reports = bs.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"资产负债表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_bs = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序资产负债表数据时出错 for {symbol}: {e}")
            return []
        
        debt_history = []
        for i, item in enumerate(annual_bs):
            try:
                short_debt = _safe_float(item.get('shortTermDebt', 0))
                long_debt = _safe_float(item.get('longTermDebt', 0))
                total_debt = short_debt + long_debt
                if total_debt < 0:
                    logger.warning(f"总债务为负数: {total_debt}, 项目索引: {i}")
                debt_history.append(total_debt)
            except Exception as e:
                logger.warning(f"处理第{i}条债务数据时出错 for {symbol}: {e}")
                debt_history.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的债务历史数据，共 {len(debt_history)} 条记录")
        return debt_history

    def extract_invested_capital(self, symbol: str) -> List[float]:
        """提取历史投入资本数据，增强容错性"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        if bs is None:
            logger.warning(f"无法加载资产负债表数据 for {symbol}")
            return []
        
        annual_reports = bs.get('annualReports', [])
        if not annual_reports:
            logger.warning(f"资产负债表 annualReports 为空 for {symbol}")
            return []
        
        try:
            annual_bs = sorted(annual_reports, key=lambda x: x.get('fiscalDateEnding', ''))
        except Exception as e:
            logger.error(f"排序资产负债表数据时出错 for {symbol}: {e}")
            return []
        
        invested_capital = []
        for i, item in enumerate(annual_bs):
            try:
                total_liab = _safe_float(item.get('totalLiabilities', 0))
                total_equity = _safe_float(item.get('totalShareholderEquity', 0))
                ic = total_liab + total_equity
                if ic <= 0:
                    logger.warning(f"投入资本为零或负数: {ic}, 项目索引: {i}")
                invested_capital.append(ic)
            except Exception as e:
                logger.warning(f"处理第{i}条投入资本数据时出错 for {symbol}: {e}")
                invested_capital.append(0.0)
        
        logger.info(f"成功提取 {symbol} 的投入资本数据，共 {len(invested_capital)} 条记录")
        return invested_capital

    def extract_estimates(self, symbol: str) -> pd.DataFrame:
        """加载盈利预估JSON，增强容错性"""
        est_data = self.load_json(f"earnings_estimates_{symbol}.json")
        if est_data is None:
            logger.info(f"未找到盈利预估数据 for {symbol}，返回空DataFrame")
            return pd.DataFrame()
        
        estimates_list = est_data.get('estimates', [])
        if not estimates_list:
            logger.info(f"盈利预估数据为空 for {symbol}")
            return pd.DataFrame()
        
        # 获取财年结束日期
        overview = self.load_json(f"overview_{symbol}.json")
        if overview is None:
            fiscal_suffix = '-06-30'  # 默认
            logger.warning(f"无法加载公司概况数据 for {symbol}，使用默认财年结束日期")
        else:
            fiscal_year_end = overview.get('FiscalYearEnd', 'June')
            month_map = {
                'January': '-01-31', 'February': '-02-28', 'March': '-03-31',
                'April': '-04-30', 'May': '-05-31', 'June': '-06-30',
                'July': '-07-31', 'August': '-08-31', 'September': '-09-30',
                'October': '-10-31', 'November': '-11-30', 'December': '-12-31'
            }
            fiscal_suffix = month_map.get(fiscal_year_end, '-06-30')

        records = []
        for i, item in enumerate(estimates_list):
            try:
                date = item.get('date', '')
                if not date:
                    logger.debug(f"跳过无日期的预估记录，索引: {i}")
                    continue
                    
                if not date.endswith(fiscal_suffix):
                    continue
                    
                eps_avg = _safe_float(item.get('eps_estimate_average')) if item.get('eps_estimate_average') else None
                rev_avg = _safe_float(item.get('revenue_estimate_average')) if item.get('revenue_estimate_average') else None
                
                records.append({
                    'date': date,
                    'eps_estimate': eps_avg,
                    'revenue_estimate': rev_avg
                })
            except Exception as e:
                logger.warning(f"处理第{i}条预估数据时出错 for {symbol}: {e}")
                continue
        
        if not records:
            logger.info(f"没有符合条件的预估数据 for {symbol}")
            return pd.DataFrame()
        
        try:
            df = pd.DataFrame(records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
            logger.info(f"成功提取 {symbol} 的预估数据，共 {len(df)} 条记录")
            return df
        except Exception as e:
            logger.error(f"处理预估数据DataFrame时出错 for {symbol}: {e}")
            return pd.DataFrame()

    def compute_growth_rates(self, symbol: str, projection_years: int = 5) -> List[float]:
        """计算收入增长率，增强容错性"""
        try:
            df = self.extract_estimates(symbol)
        except Exception as e:
            logger.error(f"提取预估数据时出错 for {symbol}: {e}")
            df = pd.DataFrame()
        
        # 如果没有预估数据，使用历史数据
        if df.empty:
            logger.info(f"Symbol {symbol}: 无未来收入估计，使用历史平均增长率")
            try:
                hist_data = self.extract_historical_data(symbol)
                revs = hist_data.get('revenue', [])
                
                if len(revs) < 2:
                    logger.warning(f"历史收入数据不足，使用默认增长率10% for {symbol}")
                    return [0.10] * projection_years
                
                # 计算历史增长率
                hist_growth = []
                for i in range(1, len(revs)):
                    if revs[i-1] > 0:
                        growth = (revs[i] / revs[i-1]) - 1
                        # 限制增长率在合理范围内
                        growth = max(-0.5, min(0.5, growth))  # 限制在-50%到50%之间
                        hist_growth.append(growth)
                
                if hist_growth:
                    avg_growth = np.mean(hist_growth)
                    logger.info(f"使用历史平均增长率 {avg_growth:.2%} for {symbol}")
                else:
                    logger.warning(f"无法计算历史增长率，使用默认值10% for {symbol}")
                    avg_growth = 0.10
                    
                return [avg_growth] * projection_years
                
            except Exception as e:
                logger.error(f"计算历史增长率时出错 for {symbol}: {e}")
                return [0.10] * projection_years

        # 处理预估数据
        try:
            today = datetime.now()
            future = df[df['date'] > today].copy()
            
            if len(future) == 0:
                logger.info(f"没有未来的预估数据，使用历史平均增长率 for {symbol}")
                return self.compute_growth_rates(symbol, projection_years)  # 递归调用历史数据处理
            
            future = future.head(projection_years)
            revs = future['revenue_estimate'].values
            
            # 获取最新历史收入
            try:
                hist_data = self.extract_historical_data(symbol)
                if not hist_data.get('revenue'):
                    latest_rev = 1e9  # 假设一个基准值
                    logger.warning(f"无历史收入数据，使用基准值 for {symbol}")
                else:
                    latest_rev = hist_data['revenue'][-1]
            except Exception as e:
                logger.error(f"获取历史收入数据时出错 for {symbol}: {e}")
                latest_rev = 1e9

            growth_rates = []
            for i in range(len(revs)):
                try:
                    if i == 0:
                        growth = (revs[i] / latest_rev - 1) if latest_rev > 0 else 0.10
                    else:
                        growth = (revs[i] / revs[i-1] - 1) if revs[i-1] > 0 else 0.10
                    
                    # 数据验证和限制
                    if pd.isna(growth) or np.isinf(growth):
                        growth = 0.10
                    else:
                        # 限制增长率在合理范围内
                        growth = max(-0.5, min(0.5, growth))
                    
                    growth_rates.append(growth)
                    
                except Exception as e:
                    logger.warning(f"计算第{i}年增长率时出错 for {symbol}: {e}")
                    growth_rates.append(0.10)  # 使用默认值

            # 补充不足的年份
            if len(growth_rates) < projection_years:
                last_growth = growth_rates[-1] if growth_rates else 0.10
                remaining_years = projection_years - len(growth_rates)
                growth_rates.extend([last_growth] * remaining_years)
                logger.info(f"补充了 {remaining_years} 年的默认增长率 for {symbol}")
            
            final_rates = growth_rates[:projection_years]
            logger.info(f"成功计算 {symbol} 的增长率预测: {[f'{r:.2%}' for r in final_rates]}")
            return final_rates
            
        except Exception as e:
            logger.error(f"处理预估数据计算增长率时出错 for {symbol}: {e}")
            return [0.10] * projection_years

    def compute_margins(self, symbol: str) -> Dict[str, float]:
        """计算各种财务比率，增强容错性"""
        try:
            # 提取历史数据
            hist = self.extract_historical_data(symbol)
            revenues = np.array(hist.get('revenue', []))
            ebitda = np.array(hist.get('ebitda', []))
            capex = np.array(hist.get('capex', []))
            nwc = np.array(hist.get('nwc', []))
            
            # 数据验证
            if len(revenues) == 0:
                logger.warning(f"无收入数据，使用默认比率 for {symbol}")
                return {
                    'avg_ebitda_margin': 0.3,
                    'avg_capex_pct': 0.05,
                    'avg_nwc_pct': 0.10,
                    'avg_tax_rate': 0.25,
                    'avg_depreciation_rate': 0.03
                }
            
            # 计算各项比率，添加数据过滤
            mask = revenues > 0
            valid_count = np.sum(mask)
            
            if valid_count > 0:
                # EBITDA利润率
                ebitda_filtered = ebitda[mask]
                rev_filtered = revenues[mask]
                ebitda_margin = (ebitda_filtered / rev_filtered).tolist()
                
                # Capex占比
                capex_filtered = capex[mask]
                capex_pct = (capex_filtered / rev_filtered).tolist()
                
                # 营运资本占比
                nwc_filtered = nwc[mask]
                nwc_pct = (nwc_filtered / rev_filtered).tolist()
                
                # 数据清洗：移除异常值
                def clean_ratios(ratios, min_val=-1.0, max_val=2.0):
                    cleaned = []
                    for ratio in ratios:
                        if np.isnan(ratio) or np.isinf(ratio):
                            continue
                        cleaned_ratio = max(min_val, min(max_val, ratio))
                        cleaned.append(cleaned_ratio)
                    return cleaned if cleaned else [0.0]  # 如果全部异常，返回默认值
                
                ebitda_margin = clean_ratios(ebitda_margin, -0.5, 1.5)
                capex_pct = clean_ratios(capex_pct, 0, 0.5)
                nwc_pct = clean_ratios(nwc_pct, -0.5, 1.0)
                
            else:
                logger.warning(f"无有效的收入数据，使用默认比率 for {symbol}")
                ebitda_margin = [0.3]
                capex_pct = [0.05]
                nwc_pct = [0.10]

            # 计算税率
            tax_rates = []
            try:
                inc = self.load_json(f"income_statement_{symbol}.json")
                if inc is not None:
                    annual_reports = inc.get('annualReports', [])
                    # 取最近5年的数据
                    recent_reports = annual_reports[-5:] if len(annual_reports) >= 5 else annual_reports
                    
                    for item in recent_reports:
                        try:
                            pretax = _safe_float(item.get('incomeBeforeTax', 0))
                            tax = _safe_float(item.get('incomeTaxExpense', 0))
                            if pretax > 0 and tax >= 0:  # 确保税前利润为正且税收非负
                                tax_rate = tax / pretax
                                # 限制税率在合理范围内 (0%-50%)
                                tax_rate = max(0.0, min(0.5, tax_rate))
                                tax_rates.append(tax_rate)
                        except Exception as e:
                            logger.debug(f"处理税率数据时出错: {e}")
                            continue
            except Exception as e:
                logger.warning(f"加载利润表计算税率时出错 for {symbol}: {e}")
            
            avg_tax = np.mean(tax_rates) if tax_rates else 0.25
            logger.debug(f"计算得出的平均税率: {avg_tax:.2%} for {symbol}")

            # 计算折旧率
            dep_rates = []
            try:
                if inc is not None:
                    annual_reports = inc.get('annualReports', [])
                    recent_reports = annual_reports[-5:] if len(annual_reports) >= 5 else annual_reports
                    
                    for item in recent_reports:
                        try:
                            dep = _safe_float(item.get('depreciationAndAmortization', 0))
                            rev = _safe_float(item.get('totalRevenue', 0))
                            if rev > 0 and dep >= 0:
                                dep_rate = dep / rev
                                # 限制折旧率在合理范围内 (0%-20%)
                                dep_rate = max(0.0, min(0.2, dep_rate))
                                dep_rates.append(dep_rate)
                        except Exception as e:
                            logger.debug(f"处理折旧率数据时出错: {e}")
                            continue
            except Exception as e:
                logger.warning(f"加载利润表计算折旧率时出错 for {symbol}: {e}")
            
            avg_dep = np.mean(dep_rates) if dep_rates else 0.03
            logger.debug(f"计算得出的平均折旧率: {avg_dep:.2%} for {symbol}")

            # 计算最终平均值
            final_ebitda_margin = np.mean(ebitda_margin) if ebitda_margin else 0.3
            final_capex_pct = np.mean(capex_pct) if capex_pct else 0.05
            final_nwc_pct = np.mean(nwc_pct) if nwc_pct else 0.10
            
            # 数据合理性检查
            if final_ebitda_margin <= 0 or final_ebitda_margin > 1.0:
                logger.warning(f"EBITDA利润率异常: {final_ebitda_margin:.2%}, 使用默认值30% for {symbol}")
                final_ebitda_margin = 0.3
            
            if final_capex_pct <= 0 or final_capex_pct > 0.5:
                logger.warning(f"Capex占比异常: {final_capex_pct:.2%}, 使用默认值5% for {symbol}")
                final_capex_pct = 0.05
                
            if final_nwc_pct < -0.5 or final_nwc_pct > 1.0:
                logger.warning(f"NWC占比异常: {final_nwc_pct:.2%}, 使用默认值10% for {symbol}")
                final_nwc_pct = 0.10

            result = {
                'avg_ebitda_margin': final_ebitda_margin,
                'avg_capex_pct': final_capex_pct,
                'avg_nwc_pct': final_nwc_pct,
                'avg_tax_rate': avg_tax,
                'avg_depreciation_rate': avg_dep
            }
            
            logger.info(f"成功计算 {symbol} 的财务比率: "
                       f"EBITDA利润率={final_ebitda_margin:.2%}, "
                       f"Capex占比={final_capex_pct:.2%}, "
                       f"NWC占比={final_nwc_pct:.2%}, "
                       f"税率={avg_tax:.2%}, "
                       f"折旧率={avg_dep:.2%}")
            
            return result
            
        except Exception as e:
            logger.error(f"计算财务比率时发生严重错误 for {symbol}: {e}")
            # 返回保守的默认值
            return {
                'avg_ebitda_margin': 0.25,
                'avg_capex_pct': 0.05,
                'avg_nwc_pct': 0.10,
                'avg_tax_rate': 0.25,
                'avg_depreciation_rate': 0.03
            }

    def compute_wacc_components(self, symbol: str, risk_free_rate: float, market_premium: float = 0.06) -> Dict[str, float]:
        """计算WACC组件，增强容错性"""
        # 默认返回值
        default_components = {
            'risk_free_rate': risk_free_rate,
            'beta': 1.0,
            'market_premium': market_premium,
            'cost_of_debt': 0.05,
            'debt_to_equity': 0.5,
            'tax_rate': 0.25
        }
        
        try:
            # 提取Beta值
            overview = self.load_json(f"overview_{symbol}.json")
            if overview is None:
                logger.warning(f"无法加载公司概况数据，使用默认Beta值1.0 for {symbol}")
                beta = 1.0
            else:
                beta_raw = overview.get('Beta')
                beta = _safe_float(beta_raw, 1.0)
                # Beta值合理性检查
                if beta <= 0 or beta > 3.0:
                    logger.warning(f"Beta值异常: {beta}, 使用默认值1.0 for {symbol}")
                    beta = 1.0
                elif beta < 0.5:
                    logger.info(f"Beta值偏低: {beta}, 可能是公用事业或防御性股票 for {symbol}")

            # 加载财务报表
            inc = self.load_json(f"income_statement_{symbol}.json")
            bs = self.load_json(f"balance_sheet_{symbol}.json")
            
            if inc is None or bs is None:
                logger.warning(f"缺少财务报表数据，使用默认WACC组件 for {symbol}")
                default_components['beta'] = beta
                return default_components

            # 获取最新的财务数据
            try:
                inc_reports = inc.get('annualReports', [])
                bs_reports = bs.get('annualReports', [])
                
                if not inc_reports or not bs_reports:
                    logger.warning(f"财务报表数据为空，使用默认WACC组件 for {symbol}")
                    default_components['beta'] = beta
                    return default_components
                
                latest_inc = inc_reports[-1]
                latest_bs = bs_reports[-1]
            except Exception as e:
                logger.error(f"获取最新财务数据时出错 for {symbol}: {e}")
                default_components['beta'] = beta
                return default_components

            # 计算债务成本
            try:
                interest_expense = _safe_float(latest_inc.get('interestExpense', 0))
                short_debt = _safe_float(latest_bs.get('shortTermDebt', 0))
                long_debt = _safe_float(latest_bs.get('longTermDebt', 0))
                total_debt = short_debt + long_debt

                DEFAULT_COST_OF_DEBT = 0.05
                if total_debt > 0 and interest_expense >= 0:
                    cost_of_debt = interest_expense / total_debt
                    # 债务成本合理性检查 (1%-15%)
                    if cost_of_debt < 0.01 or cost_of_debt > 0.15:
                        logger.warning(f"计算出的债务成本 {cost_of_debt:.2%} 异常，使用默认值 {DEFAULT_COST_OF_DEBT:.0%} for {symbol}")
                        cost_of_debt = DEFAULT_COST_OF_DEBT
                    else:
                        logger.debug(f"计算得出的债务成本: {cost_of_debt:.2%} for {symbol}")
                else:
                    logger.info(f"无债务或利息支出数据，使用默认债务成本 {DEFAULT_COST_OF_DEBT:.0%} for {symbol}")
                    cost_of_debt = DEFAULT_COST_OF_DEBT
                    
            except Exception as e:
                logger.warning(f"计算债务成本时出错，使用默认值 for {symbol}: {e}")
                cost_of_debt = DEFAULT_COST_OF_DEBT

            # 计算债务权益比
            try:
                equity = _safe_float(latest_bs.get('totalShareholderEquity', 0))
                if equity <= 0:
                    logger.warning(f"股东权益为零或负数: {equity}, 使用默认债务权益比0.5 for {symbol}")
                    debt_to_equity = 0.5
                else:
                    debt_to_equity = total_debt / equity
                    # 债务权益比合理性检查
                    if debt_to_equity < 0:
                        logger.warning(f"债务权益比为负数: {debt_to_equity}, 使用默认值0.5 for {symbol}")
                        debt_to_equity = 0.5
                    elif debt_to_equity > 5.0:
                        logger.warning(f"债务权益比过高: {debt_to_equity}, 可能存在数据问题 for {symbol}")
                        
            except Exception as e:
                logger.warning(f"计算债务权益比时出错，使用默认值 for {symbol}: {e}")
                debt_to_equity = 0.5

            # 获取税率
            try:
                margins = self.compute_margins(symbol)
                tax_rate = margins.get('avg_tax_rate', 0.25)
                # 税率合理性检查
                if tax_rate < 0 or tax_rate > 0.5:
                    logger.warning(f"税率异常: {tax_rate:.2%}, 使用默认值25% for {symbol}")
                    tax_rate = 0.25
            except Exception as e:
                logger.warning(f"获取税率时出错，使用默认值25% for {symbol}: {e}")
                tax_rate = 0.25

            # 构建最终结果
            result = {
                'risk_free_rate': risk_free_rate,
                'beta': beta,
                'market_premium': market_premium,
                'cost_of_debt': cost_of_debt,
                'debt_to_equity': debt_to_equity,
                'tax_rate': tax_rate
            }
            
            # 验证WACC组件的整体合理性
            try:
                equity_weight = 1 / (1 + debt_to_equity)
                debt_weight = debt_to_equity / (1 + debt_to_equity)
                cost_of_equity = risk_free_rate + beta * market_premium
                wacc = equity_weight * cost_of_equity + debt_weight * cost_of_debt * (1 - tax_rate)
                
                if wacc < 0.03 or wacc > 0.30:  # 3%-30%的合理范围
                    logger.warning(f"计算出的WACC {wacc:.2%} 可能异常，请检查输入参数 for {symbol}")
                else:
                    logger.info(f"成功计算 {symbol} 的WACC组件，WACC={wacc:.2%}")
                    
            except Exception as e:
                logger.warning(f"WACC合理性检查时出错 for {symbol}: {e}")

            return result
            
        except Exception as e:
            logger.error(f"计算WACC组件时发生严重错误 for {symbol}: {e}")
            # 确保返回默认值
            return default_components.copy()

    def compute_equity_params(self, symbol: str) -> Dict[str, float]:
        """计算股权相关参数（净债务、现金、流通股数）"""
        overview = self.load_json(f"overview_{symbol}.json")
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        if bs is None:
            logger.warning(f"无法加载balance_sheet_{symbol}.json，使用默认权益参数")
            return {'net_debt': 0, 'cash': 0, 'shares_outstanding': 1}

        latest_bs = bs.get('annualReports', [{}])[-1] if bs.get('annualReports') else {}

        cash = _safe_float(latest_bs.get('cashAndCashEquivalentsAtCarryingValue', 0))
        short_debt = _safe_float(latest_bs.get('shortTermDebt', 0))
        long_debt = _safe_float(latest_bs.get('longTermDebt', 0))
        total_debt = short_debt + long_debt
        net_debt = total_debt - cash

        if overview is not None:
            shares = _safe_float(overview.get('SharesOutstanding', 0))
        else:
            shares = 0
        if shares == 0:
            shares = _safe_float(latest_bs.get('commonStockSharesOutstanding', 1))

        return {
            'net_debt': net_debt,
            'cash': cash,
            'shares_outstanding': shares
        }

    def extract_eps_history(self, symbol: str) -> List[float]:
        """从利润表提取历史每股收益，按年份升序"""
        net_income = self.extract_net_income(symbol)
        shares = self.compute_equity_params(symbol)['shares_outstanding']
        return [ni / shares for ni in net_income]

    def compute_net_income_forecast(self, symbol: str, projection_years: int = 5) -> List[float]:
        """
        预测未来净利润。
        方法：优先使用分析师EPS预测（若存在）乘以股份数；否则使用历史平均净利润率 × 收入预测。
        """
        # 获取股份数
        overview = self.load_json(f"overview_{symbol}.json")
        if overview is None:
            shares = 1
        else:
            shares = _safe_float(overview.get('SharesOutstanding', 0))
        if shares == 0:
            bs = self.load_json(f"balance_sheet_{symbol}.json")
            if bs is not None and bs.get('annualReports'):
                latest_bs = bs['annualReports'][-1]
                shares = _safe_float(latest_bs.get('commonStockSharesOutstanding', 1))
            else:
                shares = 1

        # 收入预测
        growth_rates = self.compute_growth_rates(symbol, projection_years)
        hist_data = self.extract_historical_data(symbol)
        if not hist_data['revenue']:
            latest_rev = 1e9
        else:
            latest_rev = hist_data['revenue'][-1]
        revenue_forecast = []
        rev = latest_rev
        for g in growth_rates:
            rev *= (1 + g)
            revenue_forecast.append(rev)

        # 尝试从earnings_estimates获取EPS预测
        est_df = self.extract_estimates(symbol)
        if not est_df.empty:
            today = datetime.now()
            future_eps = est_df[est_df['date'] > today]['eps_estimate'].dropna().values
            if len(future_eps) >= projection_years:
                net_income_forecast = [eps * shares for eps in future_eps[:projection_years]]
                logger.info(f"使用分析师EPS预测净利润: {net_income_forecast}")
                return net_income_forecast

        # 否则使用历史平均净利润率
        net_income_hist = self.extract_net_income(symbol)
        rev_hist = hist_data['revenue']
        min_len = min(len(net_income_hist), len(rev_hist))
        if min_len > 0:
            ratios = [net_income_hist[i] / rev_hist[i] for i in range(min_len) if rev_hist[i] > 0]
            avg_ratio = np.mean(ratios) if ratios else 0.15
        else:
            avg_ratio = 0.15

        net_income_forecast = [rev * avg_ratio for rev in revenue_forecast]
        logger.info(f"使用历史平均净利润率 {avg_ratio:.2%} 预测净利润")
        return net_income_forecast

    def compute_dividend_forecast(self, symbol: str, net_income_forecast: List[float]) -> List[float]:
        """
        预测未来股利总额。
        方法：使用历史平均股利支付率（股利/净利润）乘以净利润预测。
        若无历史股利，返回全零列表。
        """
        div_hist = self.extract_total_dividends(symbol)
        if not div_hist:
            logger.warning("无历史股利数据，假设未来股利为0")
            return [0.0] * len(net_income_forecast)

        ni_hist = self.extract_net_income(symbol)
        min_len = min(len(div_hist), len(ni_hist))
        if min_len == 0:
            return [0.0] * len(net_income_forecast)

        payout_ratios = []
        for i in range(min_len):
            if ni_hist[i] > 0:
                payout_ratios.append(div_hist[i] / ni_hist[i])
        avg_payout = np.mean(payout_ratios) if payout_ratios else 0.0

        div_forecast = [ni * avg_payout for ni in net_income_forecast]
        return div_forecast

    def compute_net_borrowing_forecast(self, symbol: str, projection_years: int, revenue_forecast: List[float]) -> List[float]:
        """预测未来净借款：使用历史平均净借款/收入比例乘以收入预测"""
        net_borrow_hist = self.extract_net_borrowing(symbol)
        rev_hist = self.extract_historical_data(symbol)['revenue']
        min_len = min(len(net_borrow_hist), len(rev_hist))
        if min_len == 0:
            return [0.0] * projection_years
        ratios = []
        for i in range(min_len):
            if rev_hist[i] > 0:
                ratios.append(net_borrow_hist[i] / rev_hist[i])
        avg_ratio = np.mean(ratios) if ratios else 0.0
        return [rev * avg_ratio for rev in revenue_forecast]

    def forecast_debt_by_ratio(self, symbol: str, projection_years: int, revenue_forecast: List[float]) -> List[float]:
        """根据历史平均债务/收入比例预测未来各期债务余额"""
        debt_hist = self.extract_debt_history(symbol)
        rev_hist = self.extract_historical_data(symbol)['revenue']
        min_len = min(len(debt_hist), len(rev_hist))
        if min_len == 0:
            return [0.0] * projection_years
        ratios = []
        for i in range(min_len):
            if rev_hist[i] > 0:
                ratios.append(debt_hist[i] / rev_hist[i])
        avg_ratio = np.mean(ratios) if ratios else 0.0
        return [rev * avg_ratio for rev in revenue_forecast]

    # ================= 构建输入 schema =================
    def build_input_schema(self, symbol: str,
                           projection_years: int = 5,
                           terminal_growth: float = 0.025,
                           risk_free_method: str = "latest",
                           market_premium: float = 0.06,
                           terminal_method: TerminalValueMethod = TerminalValueMethod.PERPETUITY_GROWTH,
                           sensitivity: bool = False,
                           scenario: bool = False,
                           include_detailed: bool = True) -> DCFValuationTool.InputSchema:
        """构建 DCF 估值工具的输入参数"""
        historical = self.extract_historical_data(symbol)
        risk_free = self.get_risk_free_rate(method=risk_free_method)
        margins = self.compute_margins(symbol)
        growth_rates = self.compute_growth_rates(symbol, projection_years)
        wacc_comp = self.compute_wacc_components(symbol, risk_free, market_premium)
        equity_params = self.compute_equity_params(symbol)

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

        terminal_params = {
            "terminal_growth": terminal_growth,
            "exit_multiple": 15.0
        }

        overview = self.load_json(f"overview_{symbol}.json")
        company_name = overview.get('Name', symbol) if overview else symbol

        return DCFValuationTool.InputSchema(
            company_name=company_name,
            historical_data=historical,
            assumptions=assumptions,
            wacc_components=wacc_comp,
            equity_params=equity_params,
            terminal_method=terminal_method,
            terminal_params=terminal_params,
            sensitivity_analysis=sensitivity,
            scenario_analysis=scenario,
            include_detailed_projections=include_detailed
        )

    # ================= 异步运行估值 =================
    async def run_valuation(self, symbol: str, **kwargs) -> Dict[str, Any]:
        """执行 DCF 估值"""
        input_schema = self.build_input_schema(symbol, **kwargs)
        return await self.dcf_tool.execute(input_schema)


# =============================================================================
# 以下为各估值模型（APV, FCFE, RIM, EVA）的类定义（已完全对齐本地版本）
# =============================================================================

class APVValuation:
    """APV 估值模型（调整现值法）"""

    def __init__(self, data_dir: str):
        self.data_loader = DCFAutoValuation(data_dir)

    async def run_valuation(
        self,
        symbol: str,
        projection_years: int = 5,
        terminal_growth: float = 0.025,
        risk_free_method: str = "latest",
        market_premium: float = 0.06,
        debt_assumption: str = "ratio",
        include_detailed: bool = True,
        sensitivity: bool = False,
    ) -> Dict[str, Any]:
        start_time = datetime.now()
        try:
            hist_data = self.data_loader.extract_historical_data(symbol)
            if not hist_data['revenue']:
                raise ValueError(f"无法获取 {symbol} 的历史收入数据")

            margins = self.data_loader.compute_margins(symbol)
            growth_rates = self.data_loader.compute_growth_rates(symbol, projection_years)
            risk_free = self.data_loader.get_risk_free_rate(method=risk_free_method)
            wacc_comp = self.data_loader.compute_wacc_components(symbol, risk_free, market_premium)
            equity_params = self.data_loader.compute_equity_params(symbol)

            latest_rev = hist_data['revenue'][-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

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
            dcf_tool = DCFValuationTool()
            projections = dcf_tool._project_cash_flows(hist_data, assumptions)
            ufcf_forecast = projections['fcf']

            beta = wacc_comp['beta']
            tax_rate = wacc_comp['tax_rate']
            debt_to_equity = wacc_comp['debt_to_equity']
            beta_u = beta / (1 + (1 - tax_rate) * debt_to_equity)
            r_u = risk_free + beta_u * market_premium

            debt_hist = self.data_loader.extract_debt_history(symbol)
            if not debt_hist:
                raise ValueError("无法获取历史债务数据")
            latest_debt = debt_hist[-1]

            if debt_assumption == "constant":
                debt_forecast = [latest_debt] * projection_years
            elif debt_assumption == "ratio":
                debt_forecast = self.data_loader.forecast_debt_by_ratio(symbol, projection_years, revenue_forecast)
            else:
                raise ValueError("debt_assumption 必须为 'constant' 或 'ratio'")

            cost_of_debt = wacc_comp['cost_of_debt']
            tax_shield_forecast = [debt_forecast[i] * cost_of_debt * tax_rate for i in range(projection_years)]

            pv_factors = [(1 + r_u) ** (i + 1) for i in range(projection_years)]
            pv_tax_shield = [tax_shield_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_tax_shield = sum(pv_tax_shield)

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

            pv_ufcf = [ufcf_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_ufcf = sum(pv_ufcf)
            terminal_ufcf = ufcf_forecast[-1] * (1 + terminal_growth_adj)
            terminal_val = terminal_ufcf / (r_u - terminal_growth_adj)
            pv_terminal_ufcf = terminal_val / ((1 + r_u) ** projection_years)
            unlevered_value = total_pv_ufcf + pv_terminal_ufcf

            enterprise_value = unlevered_value + total_pv_tax_shield

            net_debt = equity_params['net_debt']
            cash = equity_params['cash']
            equity_value = enterprise_value - net_debt + cash
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            projections_out = None
            if include_detailed:
                projections_out = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "ufcf": ufcf_forecast,
                    "debt": debt_forecast,
                    "tax_shield": tax_shield_forecast,
                    "pv_ufcf": pv_ufcf,
                    "pv_tax_shield": pv_tax_shield,
                }

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
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol) if self.data_loader.load_json(f"overview_{symbol}.json") else symbol,
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
                "projections": projections_out,
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


class FCFEValuation:
    """FCFE 估值模型（完全对齐本地 fcfe_model.py）"""

    def __init__(self, data_dir: str):
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
        start_time = datetime.now()
        try:
            # 1. 加载基础数据
            hist_data = self.data_loader.extract_historical_data(symbol)
            if not hist_data['revenue']:
                raise ValueError(f"无法获取 {symbol} 的历史收入数据")

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
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol) if self.data_loader.load_json(f"overview_{symbol}.json") else symbol,
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


class RIMValuation:
    """剩余收益估值模型"""

    def __init__(self, data_dir: str):
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
        start_time = datetime.now()
        try:
            hist_data = self.data_loader.extract_historical_data(symbol)
            if not hist_data['revenue']:
                raise ValueError(f"无法获取 {symbol} 的历史收入数据")

            margins = self.data_loader.compute_margins(symbol)
            growth_rates = self.data_loader.compute_growth_rates(symbol, projection_years)
            risk_free = self.data_loader.get_risk_free_rate(method=risk_free_method)
            wacc_comp = self.data_loader.compute_wacc_components(symbol, risk_free, market_premium)
            equity_params = self.data_loader.compute_equity_params(symbol)

            cost_of_equity = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']

            book_values_hist = self.data_loader.extract_book_value(symbol)
            if not book_values_hist:
                raise ValueError("无法获取历史账面价值")
            bv0 = book_values_hist[-1]

            latest_rev = hist_data['revenue'][-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            net_income_forecast = self.data_loader.compute_net_income_forecast(symbol, projection_years)
            dividend_forecast = self.data_loader.compute_dividend_forecast(symbol, net_income_forecast)

            bv_forecast = [bv0]
            for i in range(projection_years):
                next_bv = bv_forecast[-1] + net_income_forecast[i] - dividend_forecast[i]
                bv_forecast.append(next_bv)

            ri_forecast = []
            for i in range(projection_years):
                ri = net_income_forecast[i] - cost_of_equity * bv_forecast[i]
                ri_forecast.append(ri)

            pv_factors = [(1 + cost_of_equity) ** (i + 1) for i in range(projection_years)]
            pv_ri = [ri_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_ri = sum(pv_ri)

            MAX_TERMINAL_GROWTH = 0.05
            if terminal_growth > MAX_TERMINAL_GROWTH:
                logger.warning(f"永续增长率 {terminal_growth:.2%} 超过上限 {MAX_TERMINAL_GROWTH:.0%}，调整为上限")
                terminal_growth = MAX_TERMINAL_GROWTH
            if terminal_growth >= cost_of_equity:
                logger.warning(f"永续增长率 {terminal_growth} 大于等于股权成本 {cost_of_equity}，调整为 {cost_of_equity*0.8}")
                terminal_growth = cost_of_equity * 0.8
                if terminal_growth > MAX_TERMINAL_GROWTH:
                    terminal_growth = MAX_TERMINAL_GROWTH

            terminal_ri = ri_forecast[-1] * (1 + terminal_growth)
            terminal_value = terminal_ri / (cost_of_equity - terminal_growth)
            pv_terminal = terminal_value / ((1 + cost_of_equity) ** projection_years)

            equity_value = bv0 + total_pv_ri + pv_terminal
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            projections_out = None
            if include_detailed:
                projections_out = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "net_income": net_income_forecast,
                    "dividends": dividend_forecast,
                    "book_value_begin": bv_forecast[:-1],
                    "book_value_end": bv_forecast[1:],
                    "residual_income": ri_forecast,
                    "pv_ri": pv_ri,
                }

            sensitivity_results = None
            if sensitivity:
                sensitivity_results = self._run_sensitivity_analysis(
                    equity_value, cost_of_equity, terminal_growth, projection_years,
                    bv0, ri_forecast
                )

            result = {
                "success": True,
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol) if self.data_loader.load_json(f"overview_{symbol}.json") else symbol,
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
                "projections": projections_out,
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
        try:
            coe_range = np.linspace(base_cost_of_equity * 0.8, base_cost_of_equity * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)
            equity_matrix = np.zeros((len(coe_range), len(growth_range)))
            MAX_TERMINAL_GROWTH = 0.05

            for i, coe_val in enumerate(coe_range):
                for j, g_val in enumerate(growth_range):
                    if g_val > MAX_TERMINAL_GROWTH:
                        g_val = MAX_TERMINAL_GROWTH
                    if g_val >= coe_val:
                        g_val = coe_val * 0.8
                        if g_val > MAX_TERMINAL_GROWTH:
                            g_val = MAX_TERMINAL_GROWTH

                    pv_factors = [(1 + coe_val) ** (k + 1) for k in range(projection_years)]
                    pv_ri = [ri_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv_ri = sum(pv_ri)

                    terminal_ri = ri_forecast[-1] * (1 + g_val)
                    terminal_val = terminal_ri / (coe_val - g_val)
                    pv_terminal = terminal_val / ((1 + coe_val) ** projection_years)

                    equity_matrix[i, j] = bv0 + total_pv_ri + pv_terminal

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


class EVAValuation:
    """简化 EVA 估值模型"""

    def __init__(self, data_dir: str):
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
        start_time = datetime.now()
        try:
            hist_data = self.data_loader.extract_historical_data(symbol)
            if not hist_data['revenue']:
                raise ValueError(f"无法获取 {symbol} 的历史收入数据")

            margins = self.data_loader.compute_margins(symbol)
            growth_rates = self.data_loader.compute_growth_rates(symbol, projection_years)
            risk_free = self.data_loader.get_risk_free_rate(method=risk_free_method)
            wacc_comp = self.data_loader.compute_wacc_components(symbol, risk_free, market_premium)
            equity_params = self.data_loader.compute_equity_params(symbol)

            cost_of_debt = wacc_comp['cost_of_debt']
            tax_rate = wacc_comp['tax_rate']
            debt_to_equity = wacc_comp['debt_to_equity']
            cost_of_equity = wacc_comp['risk_free_rate'] + wacc_comp['beta'] * wacc_comp['market_premium']
            equity_weight = 1 / (1 + debt_to_equity)
            debt_weight = debt_to_equity / (1 + debt_to_equity)
            wacc = equity_weight * cost_of_equity + debt_weight * cost_of_debt * (1 - tax_rate)

            ic_hist = self.data_loader.extract_invested_capital(symbol)
            if not ic_hist:
                raise ValueError("无法获取历史投入资本")
            ic0 = ic_hist[-1]

            rev_hist = hist_data['revenue']
            min_len = min(len(ic_hist), len(rev_hist))
            if min_len == 0:
                raise ValueError("收入或投入资本历史数据为空")
            turnovers = [rev_hist[i] / ic_hist[i] for i in range(min_len) if ic_hist[i] > 0]
            avg_turnover = np.mean(turnovers) if turnovers else 1.0

            latest_rev = rev_hist[-1]
            revenue_forecast = []
            rev = latest_rev
            for g in growth_rates:
                rev *= (1 + g)
                revenue_forecast.append(rev)

            ic_forecast = [rev / avg_turnover for rev in revenue_forecast]

            ebit_margin = margins['avg_ebitda_margin'] - margins['avg_depreciation_rate']
            nopat_forecast = [rev * ebit_margin * (1 - tax_rate) for rev in revenue_forecast]

            eva_forecast = []
            ic_prev = ic0
            for i in range(projection_years):
                eva = nopat_forecast[i] - wacc * ic_prev
                eva_forecast.append(eva)
                ic_prev = ic_forecast[i]

            pv_factors = [(1 + wacc) ** (i + 1) for i in range(projection_years)]
            pv_eva = [eva_forecast[i] / pv_factors[i] for i in range(projection_years)]
            total_pv_eva = sum(pv_eva)

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

            enterprise_value = ic0 + total_pv_eva + pv_terminal

            net_debt = equity_params['net_debt']
            cash = equity_params['cash']
            equity_value = enterprise_value - net_debt + cash
            shares = equity_params['shares_outstanding']
            value_per_share = equity_value / shares if shares > 0 else 0

            projections_out = None
            if include_detailed:
                projections_out = {
                    "year": list(range(1, projection_years + 1)),
                    "revenue": revenue_forecast,
                    "nopat": nopat_forecast,
                    "invested_capital": [ic0] + ic_forecast[:-1],
                    "eva": eva_forecast,
                    "pv_eva": pv_eva,
                }

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
                "company_name": self.data_loader.load_json(f"overview_{symbol}.json").get('Name', symbol) if self.data_loader.load_json(f"overview_{symbol}.json") else symbol,
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
                "projections": projections_out,
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
        try:
            wacc_range = np.linspace(base_wacc * 0.8, base_wacc * 1.2, 5)
            growth_range = np.linspace(0.01, 0.05, 5)
            equity_matrix = np.zeros((len(wacc_range), len(growth_range)))
            MAX_TERMINAL_GROWTH = 0.05

            for i, wacc_val in enumerate(wacc_range):
                for j, g_val in enumerate(growth_range):
                    if g_val > MAX_TERMINAL_GROWTH:
                        g_val = MAX_TERMINAL_GROWTH
                    if g_val >= wacc_val:
                        g_val = wacc_val * 0.8
                        if g_val > MAX_TERMINAL_GROWTH:
                            g_val = MAX_TERMINAL_GROWTH

                    ic_forecast = [rev / turnover for rev in revenue_forecast]
                    nopat_forecast = [rev * ebit_margin * (1 - tax_rate) for rev in revenue_forecast]

                    eva_forecast = []
                    ic_prev = ic0
                    for k in range(projection_years):
                        eva = nopat_forecast[k] - wacc_val * ic_prev
                        eva_forecast.append(eva)
                        ic_prev = ic_forecast[k]

                    pv_factors = [(1 + wacc_val) ** (k + 1) for k in range(projection_years)]
                    pv_eva = [eva_forecast[k] / pv_factors[k] for k in range(projection_years)]
                    total_pv = sum(pv_eva)

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


# =============================================================================
# 蒙特卡洛模拟
# =============================================================================

class MonteCarloSimulator:
    def __init__(self, symbol: str, data_dir: str):
        self.symbol = symbol
        self.data_dir = data_dir
        self.data_loader = DCFAutoValuation(data_dir)

        self.hist_data = self.data_loader.extract_historical_data(symbol)
        self.margins = self.data_loader.compute_margins(symbol)
        self.growth_rates_base = self.data_loader.compute_growth_rates(symbol, projection_years=5)
        self.risk_free = self.data_loader.get_risk_free_rate(method="latest")
        self.wacc_comp = self.data_loader.compute_wacc_components(symbol, self.risk_free, 0.06)
        self.equity_params = self.data_loader.compute_equity_params(symbol)
        self.shares = self.equity_params['shares_outstanding']
        self.dcf_tool = DCFValuationTool()

    def _sample_normal(self, mean: float, std: float, lower: float = None, upper: float = None) -> float:
        val = np.random.normal(mean, std)
        if lower is not None:
            val = max(lower, val)
        if upper is not None:
            val = min(upper, val)
        return val

    def _sample_uniform(self, low: float, high: float) -> float:
        return np.random.uniform(low, high)

    def _get_random_assumptions(self) -> Dict[str, Any]:
        g1_mean = self.growth_rates_base[0] if self.growth_rates_base else 0.10
        g1_std = max(0.01, abs(g1_mean * 0.2))
        g1 = self._sample_normal(g1_mean, g1_std, lower=0.0, upper=0.3)
        growth_rates = [g1] * 5

        margin_mean = self.margins['avg_ebitda_margin']
        margin_std = max(0.01, margin_mean * 0.1)
        margin = self._sample_normal(margin_mean, margin_std, lower=0.05, upper=0.8)

        capex_mean = self.margins['avg_capex_pct']
        capex_std = max(0.005, capex_mean * 0.2)
        capex = self._sample_normal(capex_mean, capex_std, lower=0.0, upper=0.2)

        nwc_mean = self.margins['avg_nwc_pct']
        nwc_std = max(0.01, abs(nwc_mean * 0.2))
        nwc = self._sample_normal(nwc_mean, nwc_std, lower=-0.3, upper=0.3)

        tax_rate = self._sample_uniform(0.15, 0.35)
        terminal_growth = self._sample_uniform(0.01, 0.05)
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
        try:
            wacc_comp = self.wacc_comp.copy()
            wacc_comp['tax_rate'] = assumptions['tax_rate']
            wacc = self.dcf_tool._calculate_wacc(wacc_comp)

            proj = self.dcf_tool._project_cash_flows(self.hist_data, assumptions)
            terminal = self.dcf_tool._calculate_terminal_value(
                proj, wacc, TerminalValueMethod.PERPETUITY_GROWTH,
                {"terminal_growth": assumptions["terminal_growth"]}
            )
            ev_result = self.dcf_tool._calculate_enterprise_value(proj, terminal, wacc)
            equity = self.dcf_tool._calculate_equity_value(ev_result, self.equity_params)
            return equity["value_per_share"]
        except Exception as e:
            logger.warning(f"单次模拟失败: {e}")
            return np.nan

    def run_dcf_simulation(self, n_simulations: int = 1000, seed: int = 42) -> np.ndarray:
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

    def analyze_results(self, values: np.ndarray) -> Dict[str, Any]:
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
        return stats

    def generate_md_report(self, output_dir: str, stats: Dict[str, Any]) -> str:
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

        # 可选生成直方图（依赖matplotlib），此处省略以保持简洁
        lines.append("\n## 分布解读")
        lines.append("该分布显示了在不同假设下 DCF 模型得出的每股价值范围。")
        lines.append("宽度较大的分布表明估值对关键假设敏感，不确定性较高。")
        lines.append("当前股价若低于 5% 分位数可能表明低估，高于 95% 分位数可能表明高估。")

        lines.append("\n---\n")
        lines.append("*报告生成时间：{}*".format(datetime.now().isoformat()))
        content = "\n".join(lines)

        md_filename = f"mc_{self.symbol}.md"
        md_path = Path(output_dir) / md_filename
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"蒙特卡洛报告已保存至 {md_path}")
        return content


# =============================================================================
# 综合报告生成函数（完全复制本地 test_dcf_all.py 中的版本）
# =============================================================================

def load_current_price(session_dir: Path, symbol: str) -> float:
    quote_path = session_dir / f"quote_{symbol}.json"
    if quote_path.exists():
        try:
            with open(quote_path, 'r', encoding='utf-8') as f:
                quote = json.load(f)
                return float(quote.get('price', 0))
        except:
            pass
    return 0.0


def get_value_per_share(res: Dict[str, Any]) -> str:
    """安全获取每股价值字符串"""
    if res.get('equity_valuation'):
        return res['equity_valuation'].get('value_per_share_formatted', 'N/A')
    elif res.get('valuation'):
        return res['valuation'].get('value_per_share_formatted', 'N/A')
    return 'N/A'


def generate_combined_report(symbol: str, results: Dict[str, Any], current_price: float) -> str:
    lines = []
    company_name = results.get(list(results.keys())[0], {}).get('company_name', symbol)
    lines.append(f"# {company_name} 多模型估值报告（详尽版）")
    lines.append(f"\n**报告生成时间**：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  \n")
    lines.append(f"**当前股价**：${current_price:.2f}  \n")
    lines.append("本报告综合运用五种经典估值模型，从不同视角评估公司价值。以下为各模型的详细计算过程与结果。\n")

    # 汇总表
    lines.append("## 模型估值结果汇总")
    lines.append("| 模型 | 每股价值 | 股权价值 | 折现率 | 终值占比 | 状态 |")
    lines.append("|------|----------|----------|--------|----------|------|")
    for model_name, res in results.items():
        vps = "N/A"
        ev = "N/A"
        disc = "N/A"
        term_pct = "N/A"
        status = "✅" if res.get('success') else "❌"

        if res.get('success'):
            if 'equity_valuation' in res and res['equity_valuation']:
                vps = res['equity_valuation'].get('value_per_share_formatted', 'N/A')
                ev = res['equity_valuation'].get('equity_value_formatted', 'N/A')
            elif 'valuation' in res:
                vps = res['valuation'].get('value_per_share_formatted', 'N/A')
                ev = res['valuation'].get('equity_value_formatted', 'N/A')

            if 'valuation' in res:
                disc = res['valuation'].get('wacc_formatted', res['valuation'].get('cost_of_equity_formatted', 'N/A'))
                term_pct = f"{res['valuation'].get('terminal_percent', 0):.1f}%"

        lines.append(f"| {model_name.upper()} | {vps} | {ev} | {disc} | {term_pct} | {status} |")

    lines.append("\n---\n")

    # 详细结果
    for model_name, res in results.items():
        lines.append(f"\n## {model_name.upper()} 模型详细解析")
        if not res.get('success'):
            lines.append(f"**错误**：{res.get('error')}")
            lines.append(f"**建议**：{res.get('suggestion')}")
            continue

        # 通用信息
        company = res.get('company_name', symbol)
        lines.append(f"**公司**：{company}\n")

        # 根据模型类型展开详细解释
        if model_name == 'dcf':
            v = res['valuation']
            eq = res.get('equity_valuation', {})
            proj = res.get('projections', {})
            ass_in = res.get('assumptions_input', {})
            wacc_comp = res.get('wacc_components_input', {})
            key_ass = res.get('key_assumptions', {})
            scenario = res.get('scenario_analysis')

            lines.append("### 1. 估值方法概述")
            lines.append("本报告采用**两阶段自由现金流贴现（FCFF）模型**进行估值。第一阶段为明确预测期（{}年），详细预测公司未来的自由现金流；第二阶段为终值期，假设公司进入稳定增长阶段。终值采用**永续增长法**计算。".format(key_ass.get('projection_years', 5)))

            lines.append("\n### 2. 数据来源")
            lines.append("- 历史财务数据：取自公司年报（利润表、资产负债表、现金流量表）。")
            lines.append("- 未来收入增长率：基于分析师一致预期（若无则使用历史平均增长率）。")
            lines.append("- 无风险利率：10年期美国国债收益率（取值方式：{}）。".format(res.get('metadata', {}).get('risk_free_method', 'latest')))
            lines.append("- 市场风险溢价：{}%（历史平均值）。".format(res.get('metadata', {}).get('market_premium', 0.06)*100))
            lines.append("- Beta：取自公司概览。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- **预测期年数**：{key_ass.get('projection_years', 5)} 年")
            lines.append(f"- **平均收入增长率**：{key_ass.get('avg_revenue_growth', 0):.2f}%")
            lines.append(f"- **平均EBITDA利润率**：{key_ass.get('avg_ebitda_margin', 0):.2f}%（取自历史5年平均值）")
            lines.append(f"- **永续增长率**：{key_ass.get('terminal_growth', 2.5):.2f}%（经合理性检查，不超过5%且低于WACC）")
            lines.append(f"- **平均资本支出/收入**：{ass_in.get('capex_percent', [0])[0]*100:.2f}%（历史平均）")
            lines.append(f"- **平均营运资本/收入**：{ass_in.get('nwc_percent', [0])[0]*100:.2f}%（历史平均）")
            lines.append(f"- **税率**：{wacc_comp.get('tax_rate', 0.25)*100:.2f}%（历史平均）")
            lines.append(f"- **折旧率**：{ass_in.get('depreciation_rate', 0.03)*100:.2f}%（历史平均）")

            # 逐年假设表格
            lines.append("\n**详细假设（预测期逐年）**：")
            lines.append("| 年份 | 收入增长率 | EBITDA利润率 | 资本支出/收入 | 营运资本/收入 |")
            lines.append("|------|------------|--------------|----------------|----------------|")
            rev_growth_list = ass_in.get('revenue_growth', [])
            ebitda_margin_list = ass_in.get('ebitda_margin', [])
            capex_pct_list = ass_in.get('capex_percent', [])
            nwc_pct_list = ass_in.get('nwc_percent', [])
            proj_years = ass_in.get('projection_years', len(rev_growth_list))
            for i in range(proj_years):
                rg = rev_growth_list[i] * 100 if i < len(rev_growth_list) else 0
                em = ebitda_margin_list[i] * 100 if i < len(ebitda_margin_list) else 0
                cp = capex_pct_list[i] * 100 if i < len(capex_pct_list) else 0
                nwc = nwc_pct_list[i] * 100 if i < len(nwc_pct_list) else 0
                lines.append(f"| {i+1} | {rg:.1f}% | {em:.1f}% | {cp:.1f}% | {nwc:.1f}% |")

            lines.append("\n### 4. WACC计算明细")
            lines.append(f"- 无风险利率：{wacc_comp.get('risk_free_rate', 0)*100:.2f}%")
            lines.append(f"- Beta：{wacc_comp.get('beta', 1.0):.2f}")
            lines.append(f"- 市场风险溢价：{wacc_comp.get('market_premium', 0.06)*100:.2f}%")
            cost_of_equity = wacc_comp.get('risk_free_rate', 0) + wacc_comp.get('beta', 1.0) * wacc_comp.get('market_premium', 0.06)
            lines.append(f"- 股权成本（CAPM）：{cost_of_equity:.2%}")
            lines.append(f"- 债务成本（税前）：{wacc_comp.get('cost_of_debt', 0)*100:.2f}%")
            lines.append(f"- 税率：{wacc_comp.get('tax_rate', 0.25)*100:.2f}%")
            lines.append(f"- 债务/股权比例：{wacc_comp.get('debt_to_equity', 0.5):.2f}")
            d_e = wacc_comp.get('debt_to_equity', 0.5)
            equity_weight = 1 / (1 + d_e)
            debt_weight = d_e / (1 + d_e)
            lines.append(f"- 股权权重：{equity_weight*100:.1f}%，债务权重：{debt_weight*100:.1f}%")
            lines.append(f"- **WACC**：{v['wacc_formatted']}")

            lines.append("\n### 5. 自由现金流预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | EBITDA | 折旧 | EBIT | 税 | NOPAT | 资本支出 | 营运资本变动 | 自由现金流 |")
            lines.append("|------|------|--------|------|------|-----|-------|----------|--------------|------------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ebitda = f"{proj['ebitda'][i]/1e6:.0f}"
                dep = f"{proj['depreciation'][i]/1e6:.0f}"
                ebit = f"{proj['ebit'][i]/1e6:.0f}"
                tax = f"{proj['tax'][i]/1e6:.0f}"
                nopat = f"{proj['nopat'][i]/1e6:.0f}"
                capex = f"{proj['capex'][i]/1e6:.0f}"
                nwc_change = f"{proj['nwc_change'][i]/1e6:.0f}"
                fcf = f"{proj['fcf'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ebitda} | ${dep} | ${ebit} | ${tax} | ${nopat} | ${capex} | ${nwc_change} | ${fcf} |")

            lines.append("\n### 6. 终值计算")
            tv = v['terminal_value']
            pv_terminal = v['pv_of_terminal']
            g = key_ass.get('terminal_growth', 2.5) / 100
            wacc_val = v['wacc']
            lines.append(f"- 预测期末自由现金流：${proj['fcf'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{g:.2%}")
            lines.append(f"- 终值（未折现）= FCF₅ × (1+g) / (WACC - g) = {tv/1e6:.0f} 百万")
            lines.append(f"- 终值现值 = 终值 / (1+WACC)^5 = ${pv_terminal/1e6:.0f} 百万")

            lines.append("\n### 7. 企业价值")
            ev_total = v['enterprise_value']
            pv_fcf = v['pv_of_fcf']
            lines.append(f"- 预测期现金流现值：${pv_fcf/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${pv_terminal/1e6:.0f} 百万")
            lines.append(f"- **企业价值** = 预测期现值 + 终值现值 = ${ev_total/1e6:.0f} 百万")
            lines.append(f"- 终值占比：{v['terminal_percent']:.1f}%")

            lines.append("\n### 8. 股权价值与每股价值")
            net_debt = eq.get('net_debt', 0)
            cash = eq.get('cash', 0)
            shares = eq.get('shares_outstanding', 1)
            equity_val = eq.get('equity_value')
            vps = eq.get('value_per_share')
            lines.append(f"- 净债务：${net_debt/1e6:.0f} 百万")
            lines.append(f"- 现金：${cash/1e6:.0f} 百万")
            lines.append(f"- 股本：{shares/1e6:.2f} 百万股")
            lines.append(f"- **股权价值** = 企业价值 - 净债务 + 现金 = ${equity_val/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = 股权价值 / 股本 = ${vps:.2f}")

            # 敏感性分析
            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 9. 敏感性分析")
                lines.append("对WACC和永续增长率进行二维敏感性分析，变动范围分别为±20%和1%~5%。")
                lines.append(f"- WACC变动 ±20% 导致企业价值变化 {sa['wacc_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致企业价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                lines.append("\n**企业价值敏感性矩阵（单位：百万美元）**：")
                growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                lines.append("| WACC \\ g | " + " | ".join(growth_range) + " |")
                lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                for i, w in enumerate(sa['wacc_range']):
                    row = [f"{w*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['ev_matrix'][i]]
                    lines.append("| " + " | ".join(row) + " |")

            # 情景分析
            if scenario:
                lines.append("\n### 10. 情景分析")
                lines.append("| 情景 | 概率 | 企业价值 | 平均收入增长率 | 平均EBITDA利润率 | WACC |")
                lines.append("|------|------|----------|----------------|------------------|------|")
                for s in scenario['scenarios']:
                    lines.append(f"| {s['name']} | {s['probability']*100:.0f}% | ${s['enterprise_value']/1e6:.0f}M | {s['avg_revenue_growth']*100:.1f}% | {s['avg_ebitda_margin']*100:.1f}% | {s['wacc']*100:.1f}% |")
                lines.append(f"\n- **期望企业价值**：${scenario['expected_values']['enterprise_value']/1e6:.0f}M")
                lines.append(f"- **估值区间**：${scenario['range']['min_ev']/1e6:.0f}M ~ ${scenario['range']['max_ev']/1e6:.0f}M")

            lines.append("\n### 11. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${vps:.2f}**。")
            lines.append("- **风险提示**：估值结果高度依赖未来假设，特别是永续增长率和WACC。建议结合敏感性分析结果判断合理区间。")
            lines.append("- **局限性**：模型未考虑潜在并购、股份回购、可转换债券等复杂资本结构变化。")

        elif model_name == 'fcfe':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})
            meta = res.get('metadata', {})

            lines.append("### 1. 模型简介")
            lines.append("股权自由现金流模型（FCFE）：直接计算股东可获得的现金流，包括净利润、折旧、资本支出、营运资本变动和净借款。使用股权成本折现。")

            lines.append("\n### 2. 数据来源")
            lines.append("同DCF模型，另使用净利润预测（优先分析师EPS，否则历史净利润率）和净借款预测（历史净借款/收入比例）。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- 净利润预测方法：{'分析师EPS' if '使用分析师EPS' in res.get('metadata', {}).get('notes', '') else '历史平均净利润率'}，平均净利润率 {key_ass.get('avg_net_income_margin', 0):.2f}%")
            lines.append(f"- 折旧率：{proj['depreciation'][0]/proj['revenue'][0]:.2%}（同DCF）")
            lines.append(f"- 资本支出/收入：{proj['capex'][0]/proj['revenue'][0]:.2%}（同DCF）")
            lines.append(f"- 营运资本变动/收入：{proj['nwc_change'][0]/proj['revenue'][0]:.2%}（近似）")
            lines.append(f"- 净借款/收入：{proj['net_borrowing'][0]/proj['revenue'][0]:.2%}（历史平均）")
            lines.append(f"- 股权成本：{v['cost_of_equity_formatted']}（CAPM）")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}（经上限检查）")

            lines.append("\n### 4. FCFE预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | 净利润 | 折旧 | 资本支出 | NWC变动 | 净借款 | FCFE | PV(FCFE) |")
            lines.append("|------|------|--------|------|----------|---------|--------|------|----------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ni = f"{proj['net_income'][i]/1e6:.0f}"
                dep = f"{proj['depreciation'][i]/1e6:.0f}"
                capex = f"{proj['capex'][i]/1e6:.0f}"
                nwc = f"{proj['nwc_change'][i]/1e6:.0f}"
                nb = f"{proj['net_borrowing'][i]/1e6:.0f}"
                fcfe = f"{proj['fcfe'][i]/1e6:.0f}"
                pv = f"{proj['pv_fcfe'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ni} | ${dep} | ${capex} | ${nwc} | ${nb} | ${fcfe} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末FCFE：${proj['fcfe'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = FCFE₅ × (1+g) / (r_e - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 股权价值")
            lines.append(f"- 预测期现值：${v['pv_of_fcfe']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = 预测期现值 + 终值现值 = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = 股权价值 / 股本 = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- 股权成本变动 ±20% 导致股权价值变化 {sa['cost_of_equity_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                # 输出矩阵
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| 股权成本 \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, coe in enumerate(sa['coe_range']):
                        row = [f"{coe*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：FCFE模型对净利润预测和净借款假设敏感，适用于资本结构变化较大的公司。")
            lines.append("- **局限性**：净借款预测基于历史比例，可能不反映未来融资计划。")

        elif model_name == 'rim':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})

            lines.append("### 1. 模型简介")
            lines.append("剩余收益模型（RIM）：权益价值 = 期初账面价值 + 未来剩余收益现值。剩余收益 = 净利润 - 股权成本 × 期初账面价值。")

            lines.append("\n### 2. 数据来源")
            lines.append("期初账面价值取自最新资产负债表，净利润预测同FCFE，股利预测基于历史支付率。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- 净利润预测：同FCFE，平均净利润率 {key_ass.get('avg_roe', 0)/100:.2%}（ROE近似）")
            lines.append(f"- 股利支付率：历史平均 {proj['dividends'][0]/proj['net_income'][0] if proj['net_income'][0]!=0 else 0:.2%}（若无则为0）")
            lines.append(f"- 股权成本：{v['cost_of_equity_formatted']}")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}")

            lines.append("\n### 4. 剩余收益预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | 净利润 | 股利 | 期初BV | 剩余收益 | PV(RI) |")
            lines.append("|------|------|--------|------|--------|----------|--------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ni = f"{proj['net_income'][i]/1e6:.0f}"
                div = f"{proj['dividends'][i]/1e6:.0f}"
                bv = f"{proj['book_value_begin'][i]/1e6:.0f}"
                ri = f"{proj['residual_income'][i]/1e6:.0f}"
                pv = f"{proj['pv_ri'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ni} | ${div} | ${bv} | ${ri} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末剩余收益：${proj['residual_income'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = 剩余收益₅ × (1+g) / (r_e - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 股权价值")
            lines.append(f"- 期初账面价值 BV0：${v['beginning_book_value']/1e6:.0f} 百万")
            lines.append(f"- 剩余收益现值：${v['pv_of_ri']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = BV0 + PV(RI) + PV(终值) = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- 股权成本变动 ±20% 导致股权价值变化 {sa['cost_of_equity_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| 股权成本 \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, coe in enumerate(sa['coe_range']):
                        row = [f"{coe*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：RIM模型对账面价值和净利润预测敏感，适用于盈利稳定的公司。")
            lines.append("- **局限性**：股利支付率假设可能偏离实际，影响账面价值递推。")

        elif model_name == 'eva':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})

            lines.append("### 1. 模型简介")
            lines.append("经济增加值模型（EVA）：企业价值 = 期初投入资本 + 未来EVA现值。EVA = NOPAT - WACC × 期初投入资本。")

            lines.append("\n### 2. 数据来源")
            lines.append("投入资本取自资产负债表（总负债+股东权益），NOPAT基于EBIT利润率预测，WACC同DCF。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- EBIT利润率：{key_ass.get('avg_ebit_margin', 0):.2f}%（历史平均，EBIT = EBITDA - 折旧）")
            lines.append(f"- 投入资本周转率：{key_ass.get('avg_invested_capital_turnover', 0):.2f}（收入/投入资本，历史平均）")
            lines.append(f"- 税率：{v.get('wacc', 0):.2%}中的税率部分")
            lines.append(f"- WACC：{v['wacc_formatted']}")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}（经上限检查）")

            lines.append("\n### 4. EVA预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | NOPAT | 期初投入资本 | EVA | PV(EVA) |")
            lines.append("|------|------|-------|--------------|-----|---------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                nopat = f"{proj['nopat'][i]/1e6:.0f}"
                ic = f"{proj['invested_capital'][i]/1e6:.0f}"
                eva = f"{proj['eva'][i]/1e6:.0f}"
                pv = f"{proj['pv_eva'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${nopat} | ${ic} | ${eva} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末EVA：${proj['eva'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = EVA₅ × (1+g) / (WACC - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 企业价值与股权价值")
            lines.append(f"- 期初投入资本：${v['beginning_invested_capital']/1e6:.0f} 百万")
            lines.append(f"- EVA现值合计：${v['pv_of_eva']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 企业价值 = 期初投入资本 + EVA现值 + 终值现值 = ${v['enterprise_value']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = 企业价值 - 净债务 + 现金 = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- WACC变动 ±20% 导致股权价值变化 {sa['wacc_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| WACC \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, w in enumerate(sa['wacc_range']):
                        row = [f"{w*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：EVA模型对投入资本周转率和EBIT利润率假设敏感，适用于资本密集型公司。")
            lines.append("- **局限性**：简化EVA未对研发、商誉等进行复杂调整，可能低估真实经济利润。")

        elif model_name == 'apv':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})

            lines.append("### 1. 模型简介")
            lines.append("调整现值法（APV）：企业价值 = 无杠杆企业价值 + 利息税盾现值。无杠杆企业价值用无杠杆自由现金流（UFCF）按无杠杆权益成本折现。")
            lines.append(f"债务假设：{key_ass.get('debt_assumption', 'ratio')}（constant=固定债务，ratio=债务/收入比例）。")

            lines.append("\n### 2. 数据来源")
            lines.append("同DCF模型，债务历史取自资产负债表。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- 无杠杆权益成本：{v['unlevered_cost_of_equity_formatted']}（去杠杆Beta计算）")
            lines.append(f"- 债务成本：{v['cost_of_debt_formatted']}")
            lines.append(f"- 税率：{v['tax_rate_formatted']}")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}")

            lines.append("\n### 4. APV预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | UFCF | 债务 | 税盾 | PV(UFCF) | PV(税盾) |")
            lines.append("|------|------|------|------|------|----------|----------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ufcf = f"{proj['ufcf'][i]/1e6:.0f}"
                debt = f"{proj['debt'][i]/1e6:.0f}"
                tax = f"{proj['tax_shield'][i]/1e6:.0f}"
                pv_u = f"{proj['pv_ufcf'][i]/1e6:.0f}"
                pv_t = f"{proj['pv_tax_shield'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ufcf} | ${debt} | ${tax} | ${pv_u} | ${pv_t} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末UFCF：${proj['ufcf'][-1]/1e6:.0f} 百万")
            lines.append(f"- 预测期末债务：${proj['debt'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 无杠杆终值现值：${v['unlevered_value']/1e6:.0f} 百万")
            lines.append(f"- 税盾终值现值：${v['pv_of_tax_shield']/1e6:.0f} 百万")

            lines.append("\n### 6. 企业价值与股权价值")
            lines.append(f"- 无杠杆价值：${v['unlevered_value']/1e6:.0f} 百万")
            lines.append(f"- 税盾现值：${v['pv_of_tax_shield']/1e6:.0f} 百万")
            lines.append(f"- 企业价值 = 无杠杆价值 + 税盾现值 = ${v['enterprise_value']/1e6:.0f} 百万")
            lines.append(f"- 净债务：${v['net_debt']/1e6:.0f} 百万")
            lines.append(f"- 现金：${v['cash']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = 企业价值 - 净债务 + 现金 = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- 无杠杆权益成本变动 ±20% 导致股权价值变化 {sa['unlevered_cost_of_equity_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| r_u \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, r in enumerate(sa['r_u_range']):
                        row = [f"{r*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：APV模型对债务假设和无杠杆权益成本敏感，适用于资本结构变化较大的公司。")
            lines.append("- **局限性**：债务预测基于简化假设，可能不反映未来实际融资计划。")

    # DCF/FCFE/RIM 联合研判
    dcf_fcfe_rim = [model for model in ['dcf', 'fcfe', 'rim'] if model in results and results[model].get('success')]
    if len(dcf_fcfe_rim) >= 2:
        lines.append("\n## DCF/FCFE/RIM 联合研判")
        lines.append("| 模型 | 每股价值 | 折现率 | 终值占比 |")
        lines.append("|------|----------|--------|----------|")
        for model in ['dcf', 'fcfe', 'rim']:
            if model in results and results[model].get('success'):
                res = results[model]
                vps = get_value_per_share(res)
                # 获取折现率
                if 'valuation' in res:
                    disc = res['valuation'].get('wacc_formatted', res['valuation'].get('cost_of_equity_formatted', 'N/A'))
                    term_pct = f"{res['valuation'].get('terminal_percent', 0):.1f}%"
                else:
                    disc = 'N/A'
                    term_pct = 'N/A'
                lines.append(f"| {model.upper()} | {vps} | {disc} | {term_pct} |")
        lines.append("\n**差异分析**：")
        lines.append("- DCF（企业自由现金流）反映整体企业价值，对资本结构敏感。")
        lines.append("- FCFE（股权自由现金流）直接衡量股东回报，适用于高杠杆公司。")
        lines.append("- RIM（剩余收益）基于会计数据，对盈利稳定公司更可靠。")
        lines.append("三者结果差异提示估值需结合公司特点综合判断。")

    # 综合对比分析（所有成功模型）
    lines.append("\n## 综合对比分析")
    successful = [(model, res) for model, res in results.items() if res.get('success')]
    if len(successful) > 1:
        values = []
        model_names = []
        for model_name, res in successful:
            if 'equity_valuation' in res and res['equity_valuation']:
                v = res['equity_valuation'].get('value_per_share')
            else:
                v = res.get('valuation', {}).get('value_per_share')
            if v is not None:
                values.append(v)
                model_names.append(model_name)
        if values:
            avg_val = sum(values) / len(values)
            min_val = min(values)
            max_val = max(values)
            lines.append(f"- **平均值**：${avg_val:.2f}")
            lines.append(f"- **最小值**：${min_val:.2f}（{model_names[values.index(min_val)]}）")
            lines.append(f"- **最大值**：${max_val:.2f}（{model_names[values.index(max_val)]}）")
            lines.append(f"- **区间宽度**：${max_val - min_val:.2f} ({(max_val - min_val)/avg_val*100:.1f}%)")
            if current_price > 0:
                if current_price < min_val:
                    lines.append(f"- **当前股价 ${current_price:.2f} 低于所有模型估值**，可能存在低估。")
                elif current_price > max_val:
                    lines.append(f"- **当前股价 ${current_price:.2f} 高于所有模型估值**，可能存在高估。")
                else:
                    lines.append(f"- **当前股价 ${current_price:.2f} 落在估值区间内**。")

    lines.append("\n## 风险提示与使用说明")
    lines.append("- 所有估值结果均基于对未来财务表现的假设，实际结果可能存在差异。")
    lines.append("- 模型对永续增长率、折现率等参数敏感，建议结合敏感性分析判断合理区间。")
    lines.append("- 不同模型的假设基础相同（收入增长率一致），确保可比性。")
    lines.append("- 本报告旨在提供多维度估值视角，不构成投资建议。")
    lines.append("- 对于缺少数据（如股息）的模型，已采用保守默认值并提示。")

    lines.append("\n---\n")
    lines.append(f"*报告生成时间：{datetime.now().isoformat()}*")
    return "\n".join(lines)


# =============================================================================
# 工具输入模型
# =============================================================================

class ValuationMode(str, Enum):
    SINGLE = "single"          # 运行单个模型
    MULTI = "multi"            # 运行多个模型（默认所有）
    MONTE_CARLO = "monte_carlo"  # 蒙特卡洛模拟

class ValuationParams(BaseModel):
    symbol: Optional[str] = Field(None, description="股票代码，若未提供则自动从会话目录推断")
    mode: ValuationMode = Field(ValuationMode.MULTI, description="运行模式")
    # 用于 single/multi 模式的参数
    models: List[str] = Field(default=["dcf","fcfe","rim","eva","apv"], description="要运行的模型列表")
    projection_years: int = Field(5, description="预测年数")
    terminal_growth: float = Field(0.025, description="永续增长率")
    risk_free_method: str = Field("latest", description="无风险利率取值方式 (latest/1y_avg)")
    market_premium: float = Field(0.06, description="市场风险溢价")
    sensitivity: bool = Field(True, description="是否进行敏感性分析")
    include_detailed: bool = Field(True, description="是否包含详细预测表")
    debt_assumption: str = Field("ratio", description="APV模型债务假设 (constant/ratio)")
    # 蒙特卡洛参数
    n_simulations: int = Field(1000, description="蒙特卡洛模拟次数")
    seed: int = Field(42, description="随机种子")

class ValuationInput(BaseModel):
    mode: str = Field(..., description="操作模式：single / multi / monte_carlo")
    parameters: Dict[str, Any] = Field(..., description="参数字典，包含symbol及其他选项")


# =============================================================================
# 工具主类
# =============================================================================

class ValuationTool:
    name = "valuation_tool"
    description = "财务估值模型综合工具，支持 DCF、FCFE、RIM、EVA、APV 模型及蒙特卡洛模拟。从会话目录读取 AlphaVantage 数据文件，生成估值报告（Markdown + JSON）。"
    input_schema = ValuationInput

    def __init__(self):
        logger.info("ValuationTool 初始化完成")
        self.dcf_tool = DCFValuationTool()  # 初始化 DCF 工具（虽然未直接使用，但保留以满足要求）

    def _ensure_session_workspace(self, session_id: str = None) -> Path:
        if session_id and session_id.startswith("session_"):
            session_dir = Path("/srv/sandbox_workspaces") / session_id
        else:
            session_dir = Path("/srv/sandbox_workspaces") / "temp"
        session_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 使用会话目录: {session_dir}")
        return session_dir

    def _detect_symbol_from_files(self, session_dir: Path) -> str:
        pattern = "income_statement_*.json"
        files = list(session_dir.glob(pattern))
        if not files:
            raise FileNotFoundError(f"在目录 {session_dir} 中未找到任何 income_statement_*.json 文件，无法推断 symbol。")
        filename = files[0].stem
        parts = filename.split('_')
        if len(parts) >= 3:
            return parts[2]
        raise ValueError(f"无法从文件名 {filename} 推断 symbol，请显式提供 symbol 参数。")

    async def execute(self, parameters: ValuationInput, session_id: str = None) -> Dict[str, Any]:
        start_time = datetime.now()
        logger.info(f"🚀 开始执行综合估值工具")
        logger.debug(f"📋 输入参数: {parameters}")
        logger.debug(f"📁 会话ID: {session_id}")
        
        # 🛠️ 兼容性处理：如果传入的是字典，则转换为模型实例
        if isinstance(parameters, dict):
            try:
                parameters = self.input_schema(**parameters)
                logger.debug("🔧 参数已转换为Pydantic模型实例")
            except Exception as e:
                logger.error(f"❌ 参数转换失败: {e}")
                return {
                    "success": False,
                    "error": f"参数格式错误: {str(e)}",
                    "execution_time": (datetime.now() - start_time).total_seconds()
                }
        
        try:
            mode = parameters.mode
            raw_params = parameters.parameters

            # 确定会话目录
            session_dir = self._ensure_session_workspace(session_id)
            logger.debug(f"📂 使用会话目录: {session_dir}")

            # 获取或推断 symbol
            symbol = raw_params.get("symbol")
            if not symbol:
                symbol = self._detect_symbol_from_files(session_dir)
                logger.info(f"🔍 自动检测到symbol: {symbol}")
            else:
                logger.info(f"🎯 使用指定symbol: {symbol}")

            logger.info(f"📊 执行估值工具，模式: {mode}, 标的: {symbol}")
            
            generated_files = []
            
            # 根据模式执行不同的估值逻辑
            if mode == ValuationMode.SINGLE:
                model_name = raw_params.get("model", "dcf").lower()
                result = await self._execute_single_model(symbol, raw_params, session_dir)
                # 构造包含单个模型结果的字典
                single_results = {model_name: result}
                # 获取当前股价
                current_price = load_current_price(session_dir, symbol)
                # 生成综合报告
                md_content = generate_combined_report(symbol, single_results, current_price)
                json_path = session_dir / f"valuation_{symbol}_{model_name}.json"
                md_path = session_dir / f"valuation_{symbol}_{model_name}.md"
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(single_results, f, indent=2, default=str, ensure_ascii=False)
                with open(md_path, 'w', encoding='utf-8') as f:
                    f.write(md_content)
                generated_files = [str(json_path), str(md_path)]
                result_data = {"model_results": {model_name: result.get("success", False)}}
                result = {
                    "success": True,
                    "execution_time": result.get("execution_time", (datetime.now() - start_time).total_seconds()),
                    "mode": mode,
                    "symbol": symbol,
                    "session_dir": str(session_dir),
                    "generated_files": generated_files,
                    "data": result_data,
                    "message": f"{mode} 估值完成，共生成 {len(generated_files)} 个文件。"
                }
            elif mode == ValuationMode.MULTI:
                result = await self._execute_multi_models(symbol, raw_params, session_dir)
                result["mode"] = mode
                result["symbol"] = symbol
                result["session_dir"] = str(session_dir)
                result["execution_time"] = (datetime.now() - start_time).total_seconds()
            elif mode == ValuationMode.MONTE_CARLO:
                result = await self._execute_monte_carlo(symbol, raw_params, session_dir)
                result["mode"] = mode
                result["symbol"] = symbol
                result["session_dir"] = str(session_dir)
                result["execution_time"] = (datetime.now() - start_time).total_seconds()
            else:
                raise ValueError(f"不支持的估值模式: {mode}")
            
            logger.info(f"🎉 综合估值执行完成，总耗时: {result['execution_time']:.2f}秒")
            return result
            
        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            logger.error(f"❌ 综合估值执行失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"综合估值执行失败: {str(e)}",
                "execution_time": execution_time,
                "symbol": getattr(parameters, 'symbol', 'unknown') if hasattr(parameters, 'symbol') else 'unknown',
                "mode": getattr(parameters, 'mode', 'unknown') if hasattr(parameters, 'mode') else 'unknown'
            }

    async def _execute_single_model(self, symbol: str, params: Dict, session_dir: Path) -> Dict[str, Any]:
        """执行单一模型估值，仅返回结果，不保存文件"""
        logger.info(f"🎯 执行单一模型估值: {symbol}")
        model_name = params.get("model", "dcf").lower()
        logger.debug(f"🔧 使用模型: {model_name}")
        
        try:
            projection_years = params.get("projection_years", 5)
            terminal_growth = params.get("terminal_growth", 0.025)
            risk_free_method = params.get("risk_free_method", "latest")
            market_premium = params.get("market_premium", 0.06)
            sensitivity = params.get("sensitivity", True)
            include_detailed = params.get("include_detailed", True)
            debt_assumption = params.get("debt_assumption", "ratio")
            
            logger.debug(f"⚙️ 执行参数 - 预测年数: {projection_years}, 终值增长率: {terminal_growth:.2%}")
            
            # 根据模型名称选择对应的估值工具
            if model_name == "dcf":
                logger.debug("💎 使用DCF估值工具")
                val = DCFAutoValuation(data_dir=str(session_dir))
                result = await val.run_valuation(
                    symbol=symbol,
                    projection_years=projection_years,
                    terminal_growth=terminal_growth,
                    risk_free_method=risk_free_method,
                    market_premium=market_premium,
                    terminal_method=TerminalValueMethod.PERPETUITY_GROWTH,
                    sensitivity=sensitivity,
                    scenario=False,
                    include_detailed=include_detailed
                )
            elif model_name == "fcfe":
                logger.debug("💰 使用FCFE估值工具")
                val = FCFEValuation(data_dir=str(session_dir))
                result = await val.run_valuation(
                    symbol=symbol,
                    projection_years=projection_years,
                    terminal_growth=terminal_growth,
                    risk_free_method=risk_free_method,
                    market_premium=market_premium,
                    include_detailed=include_detailed,
                    sensitivity=sensitivity
                )
            elif model_name == "rim":
                logger.debug("🎯 使用RIM估值工具")
                val = RIMValuation(data_dir=str(session_dir))
                result = await val.run_valuation(
                    symbol=symbol,
                    projection_years=projection_years,
                    terminal_growth=terminal_growth,
                    risk_free_method=risk_free_method,
                    market_premium=market_premium,
                    include_detailed=include_detailed,
                    sensitivity=sensitivity
                )
            elif model_name == "eva":
                logger.debug("📈 使用EVA估值工具")
                val = EVAValuation(data_dir=str(session_dir))
                result = await val.run_valuation(
                    symbol=symbol,
                    projection_years=projection_years,
                    terminal_growth=terminal_growth,
                    risk_free_method=risk_free_method,
                    market_premium=market_premium,
                    include_detailed=include_detailed,
                    sensitivity=sensitivity
                )
            elif model_name == "apv":
                logger.debug("🏢 使用APV估值工具")
                val = APVValuation(data_dir=str(session_dir))
                result = await val.run_valuation(
                    symbol=symbol,
                    projection_years=projection_years,
                    terminal_growth=terminal_growth,
                    risk_free_method=risk_free_method,
                    market_premium=market_premium,
                    debt_assumption=debt_assumption,
                    include_detailed=include_detailed,
                    sensitivity=sensitivity
                )
            else:
                raise ValueError(f"不支持的估值模型: {model_name}")
            
            # 此处不再保存单个模型的 JSON 文件，仅返回结果
            return result
            
        except Exception as e:
            logger.error(f"❌ 单一模型估值失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"单一模型估值失败: {str(e)}",
                "model": model_name
            }

    async def _execute_multi_models(self, symbol: str, params: Dict, session_dir: Path) -> Dict[str, Any]:
        """执行多模型估值，最后保存两个文件"""
        logger.info(f"🎯 执行多模型估值: {symbol}")
        
        models = params.get("models", ["dcf", "fcfe", "rim", "eva", "apv"])
        logger.debug(f"🔧 执行模型列表: {models}")
        
        results = {}
        generated_files = []
        
        # 依次执行各个模型
        for model_name in models:
            try:
                logger.info(f"🚀 开始执行模型: {model_name.upper()}")
                start_time = datetime.now()
                
                # 构建模型参数
                model_params = {
                    "model": model_name,
                    "projection_years": params.get("projection_years", 5),
                    "terminal_growth": params.get("terminal_growth", 0.025),
                    "risk_free_method": params.get("risk_free_method", "latest"),
                    "market_premium": params.get("market_premium", 0.06),
                    "sensitivity": params.get("sensitivity", True),
                    "include_detailed": params.get("include_detailed", True),
                    "debt_assumption": params.get("debt_assumption", "ratio")
                }
                
                # 执行单一模型（已移除文件保存）
                model_result = await self._execute_single_model(symbol, model_params, session_dir)
                execution_time = (datetime.now() - start_time).total_seconds()
                
                results[model_name] = model_result
                results[model_name]["execution_time"] = execution_time
                
                if model_result.get("success", False):
                    logger.info(f"✅ 模型 {model_name.upper()} 执行成功，耗时: {execution_time:.2f}秒")
                else:
                    logger.error(f"❌ 模型 {model_name.upper()} 执行失败: {model_result.get('error', 'Unknown error')}")
                        
            except Exception as e:
                logger.error(f"❌ 模型 {model_name} 执行失败: {str(e)}", exc_info=True)
                results[model_name] = {
                    "success": False,
                    "error": f"模型执行失败: {str(e)}",
                    "execution_time": (datetime.now() - start_time).total_seconds()
                }

        # 保存 JSON 结果（即使部分模型失败也继续）
        json_path = session_dir / f"valuation_{symbol}_multi.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, default=str, ensure_ascii=False)
        generated_files.append(str(json_path))
        logger.info(f"💾 多模型结果已保存至: {json_path}")

        # 生成综合 Markdown 报告
        try:
            current_price = params.get("current_price", 0)
            if current_price == 0:
                current_price = load_current_price(session_dir, symbol)
            md_content = generate_combined_report(symbol, results, current_price)
            md_path = session_dir / f"valuation_{symbol}_multi.md"
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(md_content)
            generated_files.append(str(md_path))
            logger.info(f"📄 综合报告已保存至: {md_path}")
        except Exception as e:
            logger.error(f"❌ 生成综合报告失败: {str(e)}")

        logger.info(f"🎉 多模型估值执行完成，共生成 {len(generated_files)} 个文件")
        return {
            "success": True,
            "results": results,
            "generated_files": generated_files,
            "models_executed": len([r for r in results.values() if r.get("success", False)])
        }

    async def _execute_monte_carlo(self, symbol: str, params: Dict, session_dir: Path) -> Dict[str, Any]:
        """执行蒙特卡洛模拟"""
        logger.info(f"🎯 执行蒙特卡洛模拟: {symbol}")
        
        try:
            n_simulations = params.get("n_simulations", 1000)
            seed = params.get("seed", 42)
            
            logger.debug(f"🎲 模拟参数 - 模拟次数: {n_simulations}, 随机种子: {seed}")
            
            # 初始化蒙特卡洛模拟器
            mc_simulator = MonteCarloSimulator(symbol=symbol, data_dir=str(session_dir))
            
            # 执行模拟
            logger.debug("🎲 开始执行蒙特卡洛模拟")
            simulation_results = mc_simulator.run_dcf_simulation(n_simulations=n_simulations, seed=seed)
            
            if len(simulation_results) == 0:
                raise ValueError("蒙特卡洛模拟未产生有效结果")
            
            # 计算统计指标
            stats = mc_simulator.analyze_results(simulation_results)
            
            # 保存 JSON 结果
            json_path = session_dir / f"mc_{symbol}.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(stats, f, indent=2, default=float)
            
            # 生成 MD 报告
            md_content = mc_simulator.generate_md_report(str(session_dir), stats)
            md_path = session_dir / f"mc_{symbol}.md"
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(md_content)
            
            logger.info(f"🎉 蒙特卡洛模拟完成，报告已保存至: {md_path}")
            
            return {
                "success": True,
                "statistics": stats,
                "json_path": str(json_path),
                "md_path": str(md_path),
                "n_valid_simulations": len(simulation_results)
            }
            
        except Exception as e:
            logger.error(f"❌ 蒙特卡洛模拟失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"蒙特卡洛模拟失败: {str(e)}"
            }