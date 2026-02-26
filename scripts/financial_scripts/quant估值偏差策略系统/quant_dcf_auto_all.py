"""
自动DCF估值工具
从本地JSON文件加载历史财务数据、分析师预期、国债收益率等，自动构建DCF输入参数。
依赖 dcf_valuation_tool.py
扩展：增加提取净利润、股息、账面价值、净借款等方法，用于FCFE和RIM模型。
支持按历史年份截断数据（用于生成历史估值序列）。
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, Optional, List, Union
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

    def get_risk_free_rate(self, method: str = "latest", as_of_date: Optional[str] = None) -> float:
        """
        获取无风险利率
        :param method: 'latest', '1y_avg', 或 'as_of'（需提供 as_of_date）
        :param as_of_date: 指定日期（字符串 YYYY-MM-DD），仅当 method='as_of' 或提供时使用
        """
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

        # 处理 as_of_date 指定
        if as_of_date is not None:
            target_date = pd.to_datetime(as_of_date)
            # 找到该日期或之前最近的有效数据
            mask = df['date'] <= target_date
            if mask.any():
                closest = df.loc[mask].iloc[-1]
                return float(closest[rate_col]) / 100
            else:
                # 如果没有该日期之前的数据，则使用最早数据
                logger.warning(f"指定日期 {as_of_date} 之前无数据，使用最早可用数据")
                earliest = df.iloc[0]
                return float(earliest[rate_col]) / 100

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

    # ================= 新增：按年份截取历史数据（用于历史估值） =================
    def extract_historical_data_up_to_year(self, symbol: str, up_to_year: int) -> Dict[str, List]:
        """提取截至指定年份（含该年）的历史数据"""
        # 直接调用类方法避免被实例属性覆盖
        full_data = DCFAutoValuation.extract_historical_data(self, symbol)
        if not full_data['years']:
            return full_data
        # 找到年份 <= up_to_year 的索引
        indices = [i for i, y in enumerate(full_data['years']) if y <= up_to_year]
        if not indices:
            return {"revenue": [], "ebitda": [], "capex": [], "nwc": [], "years": []}
        # 截取数据
        return {
            "revenue": [full_data['revenue'][i] for i in indices],
            "ebitda": [full_data['ebitda'][i] for i in indices],
            "capex": [full_data['capex'][i] for i in indices],
            "nwc": [full_data['nwc'][i] for i in indices],
            "years": [full_data['years'][i] for i in indices],
        }

    # ================= 新增：提取特定年份的资产负债表项目 =================
    def extract_balance_sheet_item(self, symbol: str, fiscal_year: int, item_key: str, default=0.0) -> float:
        """提取指定财年的资产负债表特定项目"""
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        for report in bs['annualReports']:
            if report['fiscalDateEnding'].startswith(str(fiscal_year)):
                return _safe_float(report.get(item_key, default))
        logger.warning(f"未找到 {symbol} 财年 {fiscal_year} 的资产负债表项目 {item_key}")
        return default

    def extract_income_statement_item(self, symbol: str, fiscal_year: int, item_key: str, default=0.0) -> float:
        """提取指定财年的利润表特定项目"""
        inc = self.load_json(f"income_statement_{symbol}.json")
        for report in inc['annualReports']:
            if report['fiscalDateEnding'].startswith(str(fiscal_year)):
                return _safe_float(report.get(item_key, default))
        logger.warning(f"未找到 {symbol} 财年 {fiscal_year} 的利润表项目 {item_key}")
        return default

    def extract_cash_flow_item(self, symbol: str, fiscal_year: int, item_key: str, default=0.0) -> float:
        """提取指定财年的现金流量表特定项目"""
        cf = self.load_json(f"cash_flow_{symbol}.json")
        for report in cf['annualReports']:
            if report['fiscalDateEnding'].startswith(str(fiscal_year)):
                return _safe_float(report.get(item_key, default))
        logger.warning(f"未找到 {symbol} 财年 {fiscal_year} 的现金流量表项目 {item_key}")
        return default

    # ================= 原有提取方法保持不变（但为了历史估值，添加了按年份的提取）=================
    def extract_net_income(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        """提取历史净利润，如果指定 up_to_year，则只返回截至该年的数据"""
        inc = self.load_json(f"income_statement_{symbol}.json")
        annual_inc = sorted(inc['annualReports'], key=lambda x: x['fiscalDateEnding'])
        net_income = [_safe_float(item.get('netIncome', 0)) for item in annual_inc]
        years = [int(item['fiscalDateEnding'][:4]) for item in annual_inc]
        if up_to_year is not None:
            filtered = [ni for y, ni in zip(years, net_income) if y <= up_to_year]
            return filtered
        return net_income

    def extract_total_dividends(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        cf = self.load_json(f"cash_flow_{symbol}.json")
        annual_cf = sorted(cf['annualReports'], key=lambda x: x['fiscalDateEnding'])
        dividends = []
        years = []
        for item in annual_cf:
            div = _safe_float(item.get('dividendPaid', 0))
            dividends.append(abs(div))
            years.append(int(item['fiscalDateEnding'][:4]))
        if up_to_year is not None:
            filtered = [d for y, d in zip(years, dividends) if y <= up_to_year]
            return filtered
        return dividends

    def extract_dividend_per_share(self, symbol: str) -> List[float]:
        try:
            div_data = self.load_json(f"dividends_{symbol}.json")
        except FileNotFoundError:
            logger.warning(f"未找到 dividends_{symbol}.json，返回空列表")
            return []

        overview = self.load_json(f"overview_{symbol}.json")
        fiscal_year_end = overview.get('FiscalYearEnd', 'December')
        month_map = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        }
        fiscal_month = month_map.get(fiscal_year_end, 12)

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
            if dt.month > fiscal_month:
                fiscal_year = dt.year + 1
            else:
                fiscal_year = dt.year
            div_by_year[fiscal_year] = div_by_year.get(fiscal_year, 0) + amount

        sorted_years = sorted(div_by_year.keys())
        return [div_by_year[y] for y in sorted_years]

    def extract_book_value(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        book_value = []
        years = []
        for item in annual_bs:
            book_value.append(_safe_float(item.get('totalShareholderEquity', 0)))
            years.append(int(item['fiscalDateEnding'][:4]))
        if up_to_year is not None:
            filtered = [bv for y, bv in zip(years, book_value) if y <= up_to_year]
            return filtered
        return book_value

    def extract_net_borrowing(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        cf = self.load_json(f"cash_flow_{symbol}.json")
        annual_cf = sorted(cf['annualReports'], key=lambda x: x['fiscalDateEnding'])
        net_borrowings = []
        years = []
        for item in annual_cf:
            issuance = _safe_float(item.get('issuanceOfDebt', 0))
            repayment = _safe_float(item.get('repaymentOfDebt', 0))
            net_borrowings.append(issuance - repayment)
            years.append(int(item['fiscalDateEnding'][:4]))
        if up_to_year is not None:
            filtered = [nb for y, nb in zip(years, net_borrowings) if y <= up_to_year]
            return filtered
        return net_borrowings

    def extract_eps_history(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        net_income = self.extract_net_income(symbol, up_to_year)
        shares = self.compute_equity_params(symbol, as_of_year=up_to_year)['shares_outstanding']
        return [ni / shares for ni in net_income]

    def extract_invested_capital(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        ic = []
        years = []
        for item in annual_bs:
            total_liab = _safe_float(item.get('totalLiabilities', 0))
            total_equity = _safe_float(item.get('totalShareholderEquity', 0))
            ic.append(total_liab + total_equity)
            years.append(int(item['fiscalDateEnding'][:4]))
        if up_to_year is not None:
            filtered = [v for y, v in zip(years, ic) if y <= up_to_year]
            return filtered
        return ic

    def compute_net_income_forecast(self, symbol: str, projection_years: int = 5, as_of_year: Optional[int] = None) -> List[float]:
        """预测未来净利润。如果提供 as_of_year，则使用截至该年的历史数据计算平均利润率"""
        # 获取股份数（按 as_of_year 截断）
        equity_params = self.compute_equity_params(symbol, as_of_year=as_of_year)
        shares = equity_params['shares_outstanding']

        # 获取收入预测（需要基于 as_of_year 的增长率）
        growth_rates = self.compute_growth_rates(symbol, projection_years, as_of_year=as_of_year)
        hist_data = self.extract_historical_data_up_to_year(symbol, as_of_year) if as_of_year else self.extract_historical_data(symbol)
        latest_rev = hist_data['revenue'][-1]
        revenue_forecast = []
        rev = latest_rev
        for g in growth_rates:
            rev *= (1 + g)
            revenue_forecast.append(rev)

        # 如果 as_of_year 指定，尝试从当时的历史平均利润率计算（不适用当前分析师预期）
        if as_of_year is not None:
            # 使用历史平均净利润率
            net_income_hist = self.extract_net_income(symbol, up_to_year=as_of_year)
            rev_hist = hist_data['revenue']
            min_len = min(len(net_income_hist), len(rev_hist))
            if min_len > 0:
                ratios = [net_income_hist[i] / rev_hist[i] for i in range(min_len) if rev_hist[i] > 0]
                avg_ratio = np.mean(ratios) if ratios else 0.15
            else:
                avg_ratio = 0.15
            net_income_forecast = [rev * avg_ratio for rev in revenue_forecast]
            logger.info(f"使用截至 {as_of_year} 年的历史平均净利润率 {avg_ratio:.2%} 预测净利润")
            return net_income_forecast

        # 否则尝试使用分析师EPS预测
        try:
            est_df = self.extract_estimates(symbol)
            today = datetime.now()
            future_eps = est_df[est_df['date'] > today]['eps_estimate'].dropna().values
            if len(future_eps) >= projection_years:
                net_income_forecast = [eps * shares for eps in future_eps[:projection_years]]
                logger.info(f"使用分析师EPS预测净利润: {net_income_forecast}")
                return net_income_forecast
        except:
            pass

        # 回退到历史平均利润率
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

    def compute_dividend_forecast(self, symbol: str, net_income_forecast: List[float], as_of_year: Optional[int] = None) -> List[float]:
        """预测未来股利总额。如果 as_of_year 指定，使用截至该年的历史支付率"""
        div_hist = self.extract_total_dividends(symbol, up_to_year=as_of_year)
        if not div_hist:
            logger.warning("无历史股利数据，假设未来股利为0")
            return [0.0] * len(net_income_forecast)

        ni_hist = self.extract_net_income(symbol, up_to_year=as_of_year)
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

    def compute_net_borrowing_forecast(self, symbol: str, projection_years: int, revenue_forecast: List[float], as_of_year: Optional[int] = None) -> List[float]:
        net_borrow_hist = self.extract_net_borrowing(symbol, up_to_year=as_of_year)
        hist_data = self.extract_historical_data_up_to_year(symbol, as_of_year) if as_of_year else self.extract_historical_data(symbol)
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

    def extract_debt_history(self, symbol: str, up_to_year: Optional[int] = None) -> List[float]:
        bs = self.load_json(f"balance_sheet_{symbol}.json")
        annual_bs = sorted(bs['annualReports'], key=lambda x: x['fiscalDateEnding'])
        debt = []
        years = []
        for item in annual_bs:
            short_debt = _safe_float(item.get('shortTermDebt', 0))
            long_debt = _safe_float(item.get('longTermDebt', 0))
            debt.append(short_debt + long_debt)
            years.append(int(item['fiscalDateEnding'][:4]))
        if up_to_year is not None:
            filtered = [d for y, d in zip(years, debt) if y <= up_to_year]
            return filtered
        return debt

    def forecast_debt_by_ratio(self, symbol: str, projection_years: int, revenue_forecast: List[float], as_of_year: Optional[int] = None) -> List[float]:
        debt_hist = self.extract_debt_history(symbol, up_to_year=as_of_year)
        rev_hist = self.extract_historical_data_up_to_year(symbol, as_of_year)['revenue']
        min_len = min(len(debt_hist), len(rev_hist))
        if min_len == 0:
            return [0.0] * projection_years
        ratios = []
        for i in range(min_len):
            if rev_hist[i] > 0:
                ratios.append(debt_hist[i] / rev_hist[i])
        avg_ratio = np.mean(ratios) if ratios else 0.0
        forecast = [rev * avg_ratio for rev in revenue_forecast]
        return forecast

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

    def compute_growth_rates(self, symbol: str, projection_years: int = 5, as_of_year: Optional[int] = None) -> List[float]:
        """
        计算预测期收入增长率。
        如果 as_of_year 指定，则基于截至该年的历史数据计算平均增长率（不使用分析师预期）。
        """
        if as_of_year is not None:
            # 使用截至 as_of_year 的历史数据计算平均增长率
            hist_data = self.extract_historical_data_up_to_year(symbol, as_of_year)
            revs = hist_data['revenue']
            if len(revs) >= 2:
                growth_rates = []
                for i in range(1, len(revs)):
                    if revs[i-1] > 0:
                        growth_rates.append(revs[i] / revs[i-1] - 1)
                avg_growth = np.mean(growth_rates) if growth_rates else 0.10
            else:
                avg_growth = 0.10
            logger.info(f"使用截至 {as_of_year} 年的历史平均增长率 {avg_growth:.2%}")
            return [avg_growth] * projection_years

        # 否则使用当前分析师预期
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

    def compute_margins(self, symbol: str, as_of_year: Optional[int] = None) -> Dict[str, float]:
        """
        计算历史平均利润率。如果 as_of_year 指定，使用截至该年的数据。
        """
        if as_of_year is not None:
            hist = self.extract_historical_data_up_to_year(symbol, as_of_year)
        else:
            hist = self.extract_historical_data(symbol)
        revenues = np.array(hist['revenue'])
        ebitda = np.array(hist['ebitda'])
        capex = np.array(hist['capex'])
        nwc = np.array(hist['nwc'])

        mask = revenues > 0
        ebitda_margin = (ebitda[mask] / revenues[mask]).tolist() if any(mask) else [0.3]
        capex_pct = (capex[mask] / revenues[mask]).tolist() if any(mask) else [0.05]
        nwc_pct = (nwc[mask] / revenues[mask]).tolist() if any(mask) else [0.10]

        # 税率：使用截至 as_of_year 的利润表
        inc = self.load_json(f"income_statement_{symbol}.json")
        tax_rates = []
        for item in inc['annualReports']:
            year = int(item['fiscalDateEnding'][:4])
            if as_of_year is not None and year > as_of_year:
                continue
            pretax = _safe_float(item.get('incomeBeforeTax', 0))
            tax = _safe_float(item.get('incomeTaxExpense', 0))
            if pretax > 0:
                tax_rates.append(tax / pretax)
        avg_tax = np.mean(tax_rates) if tax_rates else 0.25

        # 折旧率
        dep_rates = []
        for item in inc['annualReports']:
            year = int(item['fiscalDateEnding'][:4])
            if as_of_year is not None and year > as_of_year:
                continue
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

    def compute_wacc_components(self, symbol: str, risk_free_rate: float, market_premium: float = 0.06,
                                as_of_year: Optional[int] = None) -> Dict[str, float]:
        """
        计算WACC相关组件。如果 as_of_year 指定，则使用该年份的财务报表数据。
        """
        # Beta 暂时无法历史化，仍使用最新值（或可根据年份估算）
        overview = self.load_json(f"overview_{symbol}.json")
        beta = _safe_float(overview.get('Beta', 1.0))

        if as_of_year is not None:
            # 使用指定年份的报表
            interest_expense = self.extract_income_statement_item(symbol, as_of_year, 'interestExpense')
            short_debt = self.extract_balance_sheet_item(symbol, as_of_year, 'shortTermDebt')
            long_debt = self.extract_balance_sheet_item(symbol, as_of_year, 'longTermDebt')
            total_debt = short_debt + long_debt
            equity = self.extract_balance_sheet_item(symbol, as_of_year, 'totalShareholderEquity', default=1)
        else:
            # 使用最新报表
            inc = self.load_json(f"income_statement_{symbol}.json")
            bs = self.load_json(f"balance_sheet_{symbol}.json")
            latest_inc = inc['annualReports'][-1]
            latest_bs = bs['annualReports'][-1]
            interest_expense = _safe_float(latest_inc.get('interestExpense', 0))
            short_debt = _safe_float(latest_bs.get('shortTermDebt', 0))
            long_debt = _safe_float(latest_bs.get('longTermDebt', 0))
            total_debt = short_debt + long_debt
            equity = _safe_float(latest_bs.get('totalShareholderEquity', 1))

        DEFAULT_COST_OF_DEBT = 0.05
        if total_debt > 0:
            cost_of_debt = interest_expense / total_debt
            if cost_of_debt > 0.10 or cost_of_debt < 0.01:
                logger.warning(f"Symbol {symbol}: 计算出的债务成本 {cost_of_debt:.2%} 异常，使用默认值 {DEFAULT_COST_OF_DEBT:.0%}")
                cost_of_debt = DEFAULT_COST_OF_DEBT
        else:
            cost_of_debt = DEFAULT_COST_OF_DEBT

        debt_to_equity = total_debt / equity if equity > 0 else 0.5

        margins = self.compute_margins(symbol, as_of_year=as_of_year)
        tax_rate = margins['avg_tax_rate']

        return {
            'risk_free_rate': risk_free_rate,
            'beta': beta,
            'market_premium': market_premium,
            'cost_of_debt': cost_of_debt,
            'debt_to_equity': debt_to_equity,
            'tax_rate': tax_rate
        }

    def compute_equity_params(self, symbol: str, as_of_year: Optional[int] = None) -> Dict[str, float]:
        """
        计算股权价值相关参数。如果 as_of_year 指定，则使用该年份的资产负债表。
        """
        overview = self.load_json(f"overview_{symbol}.json")
        if as_of_year is not None:
            cash = self.extract_balance_sheet_item(symbol, as_of_year, 'cashAndCashEquivalentsAtCarryingValue', 0)
            short_debt = self.extract_balance_sheet_item(symbol, as_of_year, 'shortTermDebt', 0)
            long_debt = self.extract_balance_sheet_item(symbol, as_of_year, 'longTermDebt', 0)
            total_debt = short_debt + long_debt
            net_debt = total_debt - cash
            shares = self.extract_balance_sheet_item(symbol, as_of_year, 'commonStockSharesOutstanding', 0)
        else:
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
                           include_detailed: bool = True,
                           as_of_year: Optional[int] = None) -> DCFValuationTool.InputSchema:
        """
        构建输入模式。如果 as_of_year 指定，则使用截至该年的数据（用于历史估值）。
        """
        # 获取历史数据（截断到 as_of_year）
        if as_of_year is not None:
            historical = self.extract_historical_data_up_to_year(symbol, as_of_year)
        else:
            historical = self.extract_historical_data(symbol)

        # 无风险利率：如果指定 as_of_year，则使用该财年结束日附近的利率
        if as_of_year is not None:
            # 需要知道该财年的结束日期，以获取对应日期的无风险利率
            # 从利润表中获取 fiscalDateEnding
            inc = self.load_json(f"income_statement_{symbol}.json")
            fiscal_end = None
            for report in inc['annualReports']:
                if report['fiscalDateEnding'].startswith(str(as_of_year)):
                    fiscal_end = report['fiscalDateEnding']
                    break
            if fiscal_end:
                risk_free = self.get_risk_free_rate(method="as_of", as_of_date=fiscal_end)
            else:
                # 降级为 latest
                risk_free = self.get_risk_free_rate(method=risk_free_method)
                logger.warning(f"未找到 {symbol} 财年 {as_of_year} 的结束日期，使用 {risk_free_method} 无风险利率")
        else:
            risk_free = self.get_risk_free_rate(method=risk_free_method)

        margins = self.compute_margins(symbol, as_of_year=as_of_year)
        growth_rates = self.compute_growth_rates(symbol, projection_years, as_of_year=as_of_year)
        wacc_comp = self.compute_wacc_components(symbol, risk_free, market_premium, as_of_year=as_of_year)
        equity_params = self.compute_equity_params(symbol, as_of_year=as_of_year)

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
        """
        执行估值。支持传递 as_of_year 参数用于历史估值。
        """
        as_of_year = kwargs.pop('as_of_year', None)
        input_schema = self.build_input_schema(symbol, as_of_year=as_of_year, **kwargs)
        return await self.dcf_tool.execute(input_schema)