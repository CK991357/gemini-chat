"""
自动DCF估值工具
从本地JSON文件加载历史财务数据、分析师预期、国债收益率等，自动构建DCF输入参数。
依赖 dcf_valuation_tool.py
扩展：增加提取净利润、股息、账面价值、净借款等方法，用于FCFE和RIM模型。
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

    # ================= 新增：提取历史净利润 =================
    def extract_net_income(self, symbol: str) -> List[float]:
        """从利润表提取历史净利润，按年份升序"""
        inc = self.load_json(f"income_statement_{symbol}.json")
        annual_inc = sorted(inc['annualReports'], key=lambda x: x['fiscalDateEnding'])
        net_income = [_safe_float(item.get('netIncome', 0)) for item in annual_inc]
        return net_income

    # ================= 新增：提取历史股息总额 =================
    def extract_total_dividends(self, symbol: str) -> List[float]:
        """
        从现金流量表提取历史支付的股息总额，按年份升序。
        注意：现金流量表中 dividendPaid 通常为负值，我们取绝对值。
        """
        cf = self.load_json(f"cash_flow_{symbol}.json")
        annual_cf = sorted(cf['annualReports'], key=lambda x: x['fiscalDateEnding'])
        # dividendPaid 字段可能存在，也可能没有
        dividends = []
        for item in annual_cf:
            div = _safe_float(item.get('dividendPaid', 0))
            dividends.append(abs(div))  # 取绝对值表示支付的现金
        return dividends

    # ================= 修改：提取历史每股股息（按财年对齐） =================
    def extract_dividend_per_share(self, symbol: str) -> List[float]:
        """
        从 dividends_{symbol}.json 提取历史每股股息，并按财年汇总。
        返回列表按财年升序（每股股息）。
        """
        try:
            div_data = self.load_json(f"dividends_{symbol}.json")
        except FileNotFoundError:
            logger.warning(f"未找到 dividends_{symbol}.json，返回空列表")
            return []

        # 获取财年结束月份
        overview = self.load_json(f"overview_{symbol}.json")
        fiscal_year_end = overview.get('FiscalYearEnd', 'December')
        month_map = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        }
        fiscal_month = month_map.get(fiscal_year_end, 12)

        # 将股息按财年分组
        div_by_year = {}
        for item in div_data['data']:
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

    # ================= 新增：提取历史账面价值（股东权益） =================
    def extract_book_value(self, symbol: str) -> List[float]:
        """从资产负债表提取历史股东权益，按年份升序"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        book_value = [_safe_float(item.get('totalShareholderEquity', 0)) for item in annual_bs]
        return book_value

    # ================= 新增：提取历史净借款 =================
    def extract_net_borrowing(self, symbol: str) -> List[float]:
        """从现金流量表提取历史净借款（issuanceOfDebt - repaymentOfDebt），按年份升序"""
        cf = self.load_json(f"cash_flow_{symbol}.json")
        annual_cf = sorted(cf['annualReports'], key=lambda x: x['fiscalDateEnding'])
        net_borrowings = []
        for item in annual_cf:
            issuance = _safe_float(item.get('issuanceOfDebt', 0))
            repayment = _safe_float(item.get('repaymentOfDebt', 0))
            net_borrowings.append(issuance - repayment)
        return net_borrowings

    # ================= 新增：提取历史每股收益 =================
    def extract_eps_history(self, symbol: str) -> List[float]:
        """从利润表提取历史每股收益，按年份升序"""
        net_income = self.extract_net_income(symbol)
        shares = self.compute_equity_params(symbol)['shares_outstanding']
        return [ni / shares for ni in net_income]

    # ================= 新增：提取历史投入资本（总负债+权益） =================
    def extract_invested_capital(self, symbol: str) -> List[float]:
        """从资产负债表提取历史投入资本（总负债+股东权益），按年份升序"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        ic = []
        for item in annual_bs:
            total_liab = _safe_float(item.get('totalLiabilities', 0))
            total_equity = _safe_float(item.get('totalShareholderEquity', 0))
            ic.append(total_liab + total_equity)
        return ic

    # ================= 新增：预测净利润 =================
    def compute_net_income_forecast(self, symbol: str, projection_years: int = 5) -> List[float]:
        """
        预测未来净利润。
        方法：优先使用分析师EPS预测（若存在）乘以股份数；否则使用历史平均净利润率 × 收入预测。
        """
        # 获取股份数
        overview = self.load_json(f"overview_{symbol}.json")
        shares = _safe_float(overview.get('SharesOutstanding', 0))
        if shares == 0:
            bs = self.load_json(f"balance_sheet_{symbol}.json")
            latest_bs = bs['annualReports'][-1]
            shares = _safe_float(latest_bs.get('commonStockSharesOutstanding', 1))

        # 获取收入预测（来自DCF方法）
        growth_rates = self.compute_growth_rates(symbol, projection_years)
        hist_data = self.extract_historical_data(symbol)
        latest_rev = hist_data['revenue'][-1]
        revenue_forecast = []
        rev = latest_rev
        for g in growth_rates:
            rev *= (1 + g)
            revenue_forecast.append(rev)

        # 尝试从earnings_estimates获取EPS预测
        try:
            est_df = self.extract_estimates(symbol)  # 返回包含eps_estimate的DataFrame
            # 过滤出未来年份的EPS
            today = datetime.now()
            future_eps = est_df[est_df['date'] > today]['eps_estimate'].dropna().values
            if len(future_eps) >= projection_years:
                # 使用EPS × 股份数得到净利润
                net_income_forecast = [eps * shares for eps in future_eps[:projection_years]]
                logger.info(f"使用分析师EPS预测净利润: {net_income_forecast}")
                return net_income_forecast
        except:
            pass

        # 否则使用历史平均净利润率
        net_income_hist = self.extract_net_income(symbol)
        rev_hist = hist_data['revenue']
        # 对齐年份（净利润历史可能比收入少一年？通常是一一对应的）
        min_len = min(len(net_income_hist), len(rev_hist))
        if min_len > 0:
            ratios = [net_income_hist[i] / rev_hist[i] for i in range(min_len) if rev_hist[i] > 0]
            avg_ratio = np.mean(ratios) if ratios else 0.15
        else:
            avg_ratio = 0.15

        net_income_forecast = [rev * avg_ratio for rev in revenue_forecast]
        logger.info(f"使用历史平均净利润率 {avg_ratio:.2%} 预测净利润")
        return net_income_forecast

    # ================= 新增：预测股利 =================
    def compute_dividend_forecast(self, symbol: str, net_income_forecast: List[float]) -> List[float]:
        """
        预测未来股利总额。
        方法：使用历史平均股利支付率（股利/净利润）乘以净利润预测。
        若无历史股利，返回全零列表。
        """
        # 获取历史股利总额
        div_hist = self.extract_total_dividends(symbol)
        if not div_hist:
            logger.warning("无历史股利数据，假设未来股利为0")
            return [0.0] * len(net_income_forecast)

        # 获取历史净利润
        ni_hist = self.extract_net_income(symbol)
        min_len = min(len(div_hist), len(ni_hist))
        if min_len == 0:
            return [0.0] * len(net_income_forecast)

        payout_ratios = []
        for i in range(min_len):
            if ni_hist[i] > 0:
                payout_ratios.append(div_hist[i] / ni_hist[i])
        avg_payout = np.mean(payout_ratios) if payout_ratios else 0.0

        # 预测股利
        div_forecast = [ni * avg_payout for ni in net_income_forecast]
        return div_forecast

    # ================= 新增：预测净借款 =================
    def compute_net_borrowing_forecast(self, symbol: str, projection_years: int, revenue_forecast: List[float]) -> List[float]:
        """预测未来净借款：使用历史平均净借款/收入比例乘以收入预测"""
        net_borrow_hist = self.extract_net_borrowing(symbol)
        hist_data = self.extract_historical_data(symbol)
        rev_hist = hist_data['revenue']
        min_len = min(len(net_borrow_hist), len(rev_hist))
        if min_len == 0:
            return [0.0] * projection_years
        ratios = []
        for i in range(min_len):
            if rev_hist[i] > 0:
                ratios.append(net_borrow_hist[i] / rev_hist[i])
        avg_ratio = np.mean(ratios) if ratios else 0.0
        forecast = [rev * avg_ratio for rev in revenue_forecast]
        return forecast

    # ================= 原有方法保持不变 =================
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

        DEFAULT_COST_OF_DEBT = 0.05
        if total_debt > 0:
            cost_of_debt = interest_expense / total_debt
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