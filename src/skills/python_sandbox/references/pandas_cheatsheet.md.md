# Pandas 数据处理速查表

## 🔧 常用操作速查

### 数据读取与查看
```python
import pandas as pd
import numpy as np

# 创建示例数据
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie', 'David'],
    'Age': [25, 30, 35, 28],
    'Salary': [50000, 60000, 70000, 55000],
    'Department': ['IT', 'HR', 'IT', 'Finance']
})

# 基本查看
df.head()        # 前5行
df.info()        # 数据信息
df.describe()    # 数值列统计
df.shape         # 数据维度
```

### 数据清洗模板
```python
def data_cleaning_pipeline(df):
    """完整的数据清洗流水线"""
    
    # 1. 处理缺失值
    print("处理前缺失值统计:")
    print(df.isnull().sum())
    
    # 数值列用中位数填充
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
    
    # 分类列用众数填充
    categorical_cols = df.select_dtypes(include=['object']).columns
    for col in categorical_cols:
        df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else 'Unknown')
    
    # 2. 处理异常值（IQR方法）
    def remove_outliers_iqr(df, column):
        Q1 = df[column].quantile(0.25)
        Q3 = df[column].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        return df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]
    
    for col in numeric_cols:
        df = remove_outliers_iqr(df, col)
    
    # 3. 数据类型转换
    df['Age'] = df['Age'].astype(int)
    
    return df
```

### 数据转换操作
```python
# 数据筛选
df_filtered = df[df['Age'] > 25]
df_department = df[df['Department'].isin(['IT', 'Finance'])]

# 数据排序
df_sorted = df.sort_values(['Department', 'Salary'], ascending=[True, False])

# 分组聚合
department_stats = df.groupby('Department').agg({
    'Age': ['mean', 'min', 'max'],
    'Salary': ['mean', 'sum', 'count']
}).round(2)

# 数据透视表
pivot_table = pd.pivot_table(df, 
                           values='Salary', 
                           index='Department', 
                           columns=None, 
                           aggfunc=['mean', 'sum'])
```

## 📊 完整数据清洗流水线

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64
import json

def comprehensive_data_analysis(df):
    """完整的数据分析与清洗流水线"""
    
    # 数据质量报告
    quality_report = {
        'original_rows': len(df),
        'original_columns': len(df.columns),
        'missing_values': df.isnull().sum().to_dict(),
        'data_types': df.dtypes.astype(str).to_dict(),
        'duplicate_rows': df.duplicated().sum()
    }
    
    # 数据清洗
    df_clean = df.copy()
    
    # 1. 处理缺失值
    numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
    categorical_cols = df_clean.select_dtypes(include=['object']).columns
    
    for col in numeric_cols:
        df_clean[col].fillna(df_clean[col].median(), inplace=True)
    
    for col in categorical_cols:
        df_clean[col].fillna(df_clean[col].mode()[0] if not df_clean[col].mode().empty else 'Unknown', inplace=True)
    
    # 2. 处理异常值
    outliers_removed = 0
    for col in numeric_cols:
        Q1 = df_clean[col].quantile(0.25)
        Q3 = df_clean[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        before = len(df_clean)
        df_clean = df_clean[(df_clean[col] >= lower_bound) & (df_clean[col] <= upper_bound)]
        outliers_removed += (before - len(df_clean))
    
    quality_report['cleaned_rows'] = len(df_clean)
    quality_report['outliers_removed'] = outliers_removed
    
    # 3. 统计分析
    analysis_results = {
        'descriptive_stats': df_clean.describe().to_dict(),
        'correlation_matrix': df_clean.select_dtypes(include=[np.number]).corr().to_dict()
    }
    
    # 4. 生成可视化
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    
    # 数值列分布
    if len(numeric_cols) > 0:
        df_clean[numeric_cols[0]].hist(ax=axes[0,0], bins=15, alpha=0.7, edgecolor='black')
        axes[0,0].set_title(f'{numeric_cols[0]}分布')
    
    # 箱线图
    if len(numeric_cols) > 0:
        df_clean[numeric_cols].boxplot(ax=axes[0,1])
        axes[0,1].set_title('数值列箱线图')
    
    # 相关性热力图
    if len(numeric_cols) > 1:
        sns.heatmap(df_clean[numeric_cols].corr(), annot=True, cmap='coolwarm', ax=axes[1,0])
        axes[1,0].set_title('特征相关性热力图')
    
    # 分类数据统计
    if len(categorical_cols) > 0:
        df_clean[categorical_cols[0]].value_counts().plot(kind='bar', ax=axes[1,1])
        axes[1,1].set_title(f'{categorical_cols[0]}分布')
        axes[1,1].tick_params(axis='x', rotation=45)
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    # 生成分析报告
    result = {
        "type": "analysis_report",
        "title": "数据清洗与分析报告",
        "data_quality": quality_report,
        "statistical_analysis": analysis_results,
        "chart_preview": chart_base64,
        "cleaned_data_sample": df_clean.head().to_dict('records')
    }
    print(json.dumps(result))

# 使用示例
# data = {'Age': [25, 30, 35, 28, np.nan], 'Salary': [50000, 60000, 70000, 55000, 1000000]}
# df = pd.DataFrame(data)
# comprehensive_data_analysis(df)
```

## 🚀 高级数据处理技巧

### 数据合并与连接
```python
# 合并多个DataFrame
df1 = pd.DataFrame({'A': ['A0', 'A1'], 'B': ['B0', 'B1']})
df2 = pd.DataFrame({'A': ['A0', 'A2'], 'C': ['C0', 'C2']})

# 内连接
result_inner = pd.merge(df1, df2, on='A', how='inner')

# 左连接
result_left = pd.merge(df1, df2, on='A', how='left')

# 外连接
result_outer = pd.merge(df1, df2, on='A', how='outer')
```

### 时间序列处理
```python
# 创建时间序列数据
dates = pd.date_range('2024-01-01', periods=100, freq='D')
ts_data = pd.DataFrame({
    'date': dates,
    'value': np.random.randn(100).cumsum()
})

# 设置时间索引
ts_data.set_index('date', inplace=True)

# 重采样（日数据转为周数据）
weekly_data = ts_data.resample('W').mean()

# 移动平均
ts_data['moving_avg'] = ts_data['value'].rolling(window=7).mean()
```

这个速查表提供了从基础到高级的Pandas操作指南，是数据处理任务的必备参考。
