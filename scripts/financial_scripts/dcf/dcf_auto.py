"""
自动DCF估值工具
从本地JSON文件加载历史财务数据、分析师预期、国债收益率等，自动构建DCF输入参数。
依赖 dcf_valuation_tool.py
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, Optional, List
import logging
from pathlib import Path

from dcf_valuation_tool import DCFValuationTool, TerminalValueMethod

logger = logging.getLogger(__name__)


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
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.dcf_tool = DCFValuationTool()

    def load_json(self, filename: str) -> Dict:
        filepath = self.data_dir / filename
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

    def load_treasury_rates(self, filename: str = "treasury_10year_daily.parquet") -> pd.DataFrame:
        filepath = self.data_dir / filename
        return pd.read_parquet(filepath)

    def get_risk_free_rate(self, method: str = "latest") -> float:
        df = self.load_treasury_rates()
        date_col = None
        for col in df.columns:
            if 'date' in col.lower():
                date_col = col
                break
        if date_col is None:
            date_col = df.columns[0]
        df['date'] = pd.to_datetime(df[date_col])
        df = df.sort_values('date')

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
                raise ValueError("无法找到收益率列")

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
            raise ValueError(f"未知的method: {method}")

    def extract_historical_data(self, symbol: str) -> Dict[str, List]:
        """从三张表中提取历史数据，按日期升序排列（旧→新）"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        cf = self.load_json(f"cash_flow_{symbol}.json")
        inc = self.load_json(f"income_statement_{symbol}.json")

        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        annual_cf = sorted(cf['annualReports'], key=lambda x: x['fiscalDateEnding'])
        annual_inc = sorted(inc['annualReports'], key=lambda x: x['fiscalDateEnding'])

        # 按日期对齐
        if not (len(annual_bs) == len(annual_cf) == len(annual_inc)):
            logger.warning("三张表数量不一致，尝试按日期对齐")
            bs_dict = {item['fiscalDateEnding']: item for item in annual_bs}
            cf_dict = {item['fiscalDateEnding']: item for item in annual_cf}
            inc_dict = {item['fiscalDateEnding']: item for item in annual_inc}
            common_dates = sorted(set(bs_dict.keys()) & set(cf_dict.keys()) & set(inc_dict.keys()))
            annual_bs = [bs_dict[d] for d in common_dates]
            annual_cf = [cf_dict[d] for d in common_dates]
            annual_inc = [inc_dict[d] for d in common_dates]

        years, revenue, ebitda, capex, nwc = [], [], [], [], []
        for i in range(len(annual_inc)):
            inc_item = annual_inc[i]
            cf_item = annual_cf[i]
            bs_item = annual_bs[i]

            year = inc_item['fiscalDateEnding'][:4]
            years.append(int(year))
            revenue.append(_safe_float(inc_item.get('totalRevenue', 0)))

            # EBITDA
            if 'ebitda' in inc_item and inc_item['ebitda'] not in (None, 'None'):
                ebitda_val = _safe_float(inc_item['ebitda'])
            else:
                ebit = _safe_float(inc_item.get('ebit', 0))
                da = _safe_float(inc_item.get('depreciationAndAmortization', 0))
                ebitda_val = ebit + da
            ebitda.append(ebitda_val)

            # 资本支出
            capex.append(abs(_safe_float(cf_item.get('capitalExpenditures', 0))))

            # 经营性营运资本：应收账款 + 存货 - 应付账款
            receivables = _safe_float(bs_item.get('currentNetReceivables', 0))
            inventory = _safe_float(bs_item.get('inventory', 0))
            payables = _safe_float(bs_item.get('currentAccountsPayable', 0))
            if receivables > 0 or inventory > 0 or payables > 0:
                nwc_val = receivables + inventory - payables
            else:
                current_assets = _safe_float(bs_item.get('totalCurrentAssets', 0))
                current_liab = _safe_float(bs_item.get('totalCurrentLiabilities', 0))
                nwc_val = current_assets - current_liab
            nwc.append(nwc_val)

        if len(years) < 3:
            logger.warning(f"历史数据不足3年，实际只有{len(years)}年")

        return {
            "revenue": revenue,
            "ebitda": ebitda,
            "capex": capex,
            "nwc": nwc,
            "years": years
        }

    def extract_estimates(self, symbol: str) -> pd.DataFrame:
        """加载盈利预估JSON，根据公司财年结束日过滤年度估计"""
        est = self.load_json(f"earnings_estimates_{symbol}.json")
        
        # 获取财年结束月份
        overview = self.load_json(f"overview_{symbol}.json")
        fiscal_year_end = overview.get('FiscalYearEnd', 'June')
        month_map = {
            'January': '-01-31', 'February': '-02-28', 'March': '-03-31',
            'April': '-04-30', 'May': '-05-31', 'June': '-06-30',
            'July': '-07-31', 'August': '-08-31', 'September': '-09-30',
            'October': '-10-31', 'November': '-11-30', 'December': '-12-31'
        }
        fiscal_suffix = month_map.get(fiscal_year_end, '-06-30')

        records = []
        for item in est['estimates']:
            date = item['date']
            if not date.endswith(fiscal_suffix):
                continue
            eps_avg = _safe_float(item.get('eps_estimate_average')) if item.get('eps_estimate_average') else None
            rev_avg = _safe_float(item.get('revenue_estimate_average')) if item.get('revenue_estimate_average') else None
            
            # Alpha Vantage 的估计值已经是实际美元金额，无需单位转换
            logger.debug(f"Symbol {symbol}: raw revenue estimate for {date} = {rev_avg}")
            records.append({
                'date': date,
                'eps_estimate': eps_avg,
                'revenue_estimate': rev_avg
            })
        df = pd.DataFrame(records)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        return df

    def compute_growth_rates(self, symbol: str, projection_years: int = 5) -> List[float]:
        df = self.extract_estimates(symbol)
        today = datetime.now()
        future = df[df['date'] > today].copy()

        if len(future) == 0:
            logger.warning(f"Symbol {symbol}: 无未来收入估计，使用历史平均增长率")
            hist_data = self.extract_historical_data(symbol)
            revs = hist_data['revenue']
            if len(revs) >= 2:
                hist_growth = [(revs[i] / revs[i-1] - 1) for i in range(1, len(revs))]
                avg_growth = np.mean(hist_growth)
                return [avg_growth] * projection_years
            else:
                return [0.10] * projection_years

        future = future.head(projection_years)
        revs = future['revenue_estimate'].values
        logger.info(f"Symbol {symbol}: 未来收入估计值: {revs}")

        hist_data = self.extract_historical_data(symbol)
        latest_rev = hist_data['revenue'][-1]

        growth_rates = []
        for i in range(len(revs)):
            if i == 0:
                growth = revs[i] / latest_rev - 1
            else:
                growth = revs[i] / revs[i-1] - 1
            growth_rates.append(growth)

        if len(growth_rates) < projection_years:
            last = growth_rates[-1] if growth_rates else 0.10
            growth_rates.extend([last] * (projection_years - len(growth_rates)))
        return growth_rates[:projection_years]

    def compute_margins(self, symbol: str) -> Dict[str, float]:
        hist = self.extract_historical_data(symbol)
        revenues = np.array(hist['revenue'])
        ebitda = np.array(hist['ebitda'])
        capex = np.array(hist['capex'])
        nwc = np.array(hist['nwc'])

        mask = revenues > 0
        ebitda_margin = (ebitda[mask] / revenues[mask]).tolist() if any(mask) else [0.3]
        capex_pct = (capex[mask] / revenues[mask]).tolist() if any(mask) else [0.05]
        nwc_pct = (nwc[mask] / revenues[mask]).tolist() if any(mask) else [0.10]

        # 税率
        inc = self.load_json(f"income_statement_{symbol}.json")
        tax_rates = []
        for item in inc['annualReports'][-5:]:
            pretax = _safe_float(item.get('incomeBeforeTax', 0))
            tax = _safe_float(item.get('incomeTaxExpense', 0))
            if pretax > 0:
                tax_rates.append(tax / pretax)
        avg_tax = np.mean(tax_rates) if tax_rates else 0.25

        # 折旧率
        dep_rates = []
        for item in inc['annualReports'][-5:]:
            dep = _safe_float(item.get('depreciationAndAmortization', 0))
            rev = _safe_float(item.get('totalRevenue', 0))
            if rev > 0:
                dep_rates.append(dep / rev)
        avg_dep = np.mean(dep_rates) if dep_rates else 0.03

        return {
            'avg_ebitda_margin': np.mean(ebitda_margin),
            'avg_capex_pct': np.mean(capex_pct),
            'avg_nwc_pct': np.mean(nwc_pct),
            'avg_tax_rate': avg_tax,
            'avg_depreciation_rate': avg_dep
        }

    def compute_wacc_components(self, symbol: str, risk_free_rate: float, market_premium: float = 0.06) -> Dict[str, float]:
        overview = self.load_json(f"overview_{symbol}.json")
        beta = _safe_float(overview.get('Beta', 1.0))

        inc = self.load_json(f"income_statement_{symbol}.json")
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        latest_inc = inc['annualReports'][-1]
        latest_bs = bs['annualReports'][-1]

        interest_expense = _safe_float(latest_inc.get('interestExpense', 0))
        short_debt = _safe_float(latest_bs.get('shortTermDebt', 0))
        long_debt = _safe_float(latest_bs.get('longTermDebt', 0))
        total_debt = short_debt + long_debt

        # 计算债务成本，并处理异常值
        DEFAULT_COST_OF_DEBT = 0.05  # 默认5%
        if total_debt > 0:
            cost_of_debt = interest_expense / total_debt
            # 如果计算结果异常（过高或过低），使用默认值
            if cost_of_debt > 0.10 or cost_of_debt < 0.01:
                logger.warning(f"Symbol {symbol}: 计算出的债务成本 {cost_of_debt:.2%} 异常，使用默认值 {DEFAULT_COST_OF_DEBT:.0%}")
                cost_of_debt = DEFAULT_COST_OF_DEBT
        else:
            cost_of_debt = DEFAULT_COST_OF_DEBT

        equity = _safe_float(latest_bs.get('totalShareholderEquity', 1))
        debt_to_equity = total_debt / equity if equity > 0 else 0.5

        margins = self.compute_margins(symbol)
        tax_rate = margins['avg_tax_rate']

        return {
            'risk_free_rate': risk_free_rate,
            'beta': beta,
            'market_premium': market_premium,
            'cost_of_debt': cost_of_debt,
            'debt_to_equity': debt_to_equity,
            'tax_rate': tax_rate
        }

    def compute_equity_params(self, symbol: str) -> Dict[str, float]:
        overview = self.load_json(f"overview_{symbol}.json")
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        latest_bs = bs['annualReports'][-1]

        cash = _safe_float(latest_bs.get('cashAndCashEquivalentsAtCarryingValue', 0))
        short_debt = _safe_float(latest_bs.get('shortTermDebt', 0))
        long_debt = _safe_float(latest_bs.get('longTermDebt', 0))
        total_debt = short_debt + long_debt
        net_debt = total_debt - cash

        shares = _safe_float(overview.get('SharesOutstanding', 0))
        if shares == 0:
            shares = _safe_float(latest_bs.get('commonStockSharesOutstanding', 1))

        return {
            'net_debt': net_debt,
            'cash': cash,
            'shares_outstanding': shares
        }

    def build_input_schema(self, symbol: str,
                           projection_years: int = 5,
                           terminal_growth: float = 0.025,
                           risk_free_method: str = "latest",
                           market_premium: float = 0.06,
                           terminal_method: TerminalValueMethod = TerminalValueMethod.PERPETUITY_GROWTH,
                           sensitivity: bool = False,
                           scenario: bool = False,
                           include_detailed: bool = True) -> DCFValuationTool.InputSchema:
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
        company_name = overview.get('Name', symbol)

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

    async def run_valuation(self, symbol: str, **kwargs) -> Dict[str, Any]:
        input_schema = self.build_input_schema(symbol, **kwargs)
        return await self.dcf_tool.execute(input_schema)