# Pandas 数据处理指南 (v2.2)

## 🎯 工具概述
**功能**：数据清洗、转换、分析和可视化
**输出原则**：直接打印结果，系统自动处理输出格式

## 🔧 基础数据操作

### 数据创建与查看
```python
import pandas as pd
import numpy as np

# 创建示例数据
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie', 'David', 'Eva'],
    'Age': [25, 30, 35, 28, 32],
    'Salary': [50000, 60000, 70000, 55000, 65000],
    'Department': ['IT', 'HR', 'IT', 'Finance', 'Marketing'],
    'Join_Date': pd.date_range('2020-01-01', periods=5, freq='Y')
})

print("=== 数据基本信息 ===")
print(f"数据形状: {df.shape}")
print(f"列名: {list(df.columns)}")
print("\n前5行数据:")
print(df.head())
print("\n数据信息:")
print(df.info())
print("\n数值列统计:")
print(df.describe())
```

### 数据筛选与排序
```python
import pandas as pd

# 假设df是已有的DataFrame
print("=== 数据筛选与排序 ===")

# 条件筛选
age_above_30 = df[df['Age'] > 30]
print(f"年龄大于30的员工: {len(age_above_30)}人")
print(age_above_30[['Name', 'Age', 'Department']])

# 多条件筛选
it_high_salary = df[(df['Department'] == 'IT') & (df['Salary'] > 55000)]
print(f"\nIT部门高薪员工:")
print(it_high_salary[['Name', 'Salary']])

# 数据排序
sorted_by_salary = df.sort_values('Salary', ascending=False)
print(f"\n按薪资降序排列:")
print(sorted_by_salary[['Name', 'Salary', 'Department']])
```

## 🧹 数据清洗模板

### 基础数据清洗
```python
import pandas as pd
import numpy as np

def basic_data_cleaning(df):
    """基础数据清洗流程"""
    
    print("=== 数据清洗流程 ===")
    df_clean = df.copy()
    
    # 1. 检查数据质量
    print(f"原始数据形状: {df_clean.shape}")
    print(f"缺失值统计:")
    print(df_clean.isnull().sum())
    print(f"重复行数: {df_clean.duplicated().sum()}")
    
    # 2. 处理缺失值
    numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
    categorical_cols = df_clean.select_dtypes(include=['object']).columns
    
    # 数值列用中位数填充
    for col in numeric_cols:
        if df_clean[col].isnull().any():
            median_val = df_clean[col].median()
            df_clean[col].fillna(median_val, inplace=True)
            print(f"列 '{col}' 用中位数 {median_val} 填充缺失值")
    
    # 分类列用众数填充
    for col in categorical_cols:
        if df_clean[col].isnull().any():
            mode_val = df_clean[col].mode()[0] if not df_clean[col].mode().empty else 'Unknown'
            df_clean[col].fillna(mode_val, inplace=True)
            print(f"列 '{col}' 用众数 '{mode_val}' 填充缺失值")
    
    # 3. 删除重复行
    before_dedup = len(df_clean)
    df_clean = df_clean.drop_duplicates()
    after_dedup = len(df_clean)
    print(f"删除重复行: {before_dedup - after_dedup} 行")
    
    print(f"\n清洗后数据形状: {df_clean.shape}")
    return df_clean

# 使用示例
# df_with_issues = pd.DataFrame({
#     'A': [1, 2, np.nan, 4, 4],
#     'B': ['x', 'y', np.nan, 'x', 'z']
# })
# cleaned_df = basic_data_cleaning(df_with_issues)
```

### 异常值处理
```python
import pandas as pd
import numpy as np

def handle_outliers(df):
    """异常值检测与处理"""
    
    print("=== 异常值处理 ===")
    df_clean = df.copy()
    numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
    
    outliers_info = {}
    
    for col in numeric_cols:
        Q1 = df_clean[col].quantile(0.25)
        Q3 = df_clean[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        # 检测异常值
        outliers = df_clean[(df_clean[col] < lower_bound) | (df_clean[col] > upper_bound)]
        outlier_count = len(outliers)
        
        if outlier_count > 0:
            print(f"列 '{col}' 发现 {outlier_count} 个异常值")
            print(f"  范围: [{lower_bound:.2f}, {upper_bound:.2f}]")
            print(f"  异常值: {outliers[col].tolist()}")
            
            # 用边界值替换异常值（可选）
            df_clean[col] = np.where(df_clean[col] < lower_bound, lower_bound, df_clean[col])
            df_clean[col] = np.where(df_clean[col] > upper_bound, upper_bound, df_clean[col])
    
    return df_clean

# 使用示例
# df_with_outliers = pd.DataFrame({'Values': [1, 2, 3, 100, 2, 3, 1, -50]})
# cleaned_df = handle_outliers(df_with_outliers)
```

## 📊 数据分析与统计

### 分组统计
```python
import pandas as pd

# 假设df是已有的DataFrame
print("=== 分组统计分析 ===")

# 基础分组统计
dept_stats = df.groupby('Department').agg({
    'Age': ['mean', 'min', 'max', 'count'],
    'Salary': ['mean', 'sum', 'std']
}).round(2)

print("各部门统计:")
print(dept_stats)

# 更详细的分组分析
print("\n各部门详细分析:")
for dept, group in df.groupby('Department'):
    print(f"\n{dept}部门:")
    print(f"  员工数: {len(group)}")
    print(f"  平均年龄: {group['Age'].mean():.1f}")
    print(f"  平均薪资: {group['Salary'].mean():.0f}")
    print(f"  总薪资: {group['Salary'].sum():.0f}")
```

### 数据透视表
```python
import pandas as pd

print("=== 数据透视表 ===")

# 创建更丰富的数据用于演示
sales_data = pd.DataFrame({
    'Region': ['North', 'South', 'East', 'West'] * 6,
    'Product': ['A', 'B'] * 12,
    'Quarter': ['Q1', 'Q1', 'Q1', 'Q1', 'Q2', 'Q2', 'Q2', 'Q2', 'Q3', 'Q3', 'Q3', 'Q3'] * 2,
    'Sales': np.random.randint(1000, 5000, 24),
    'Profit': np.random.randint(100, 1000, 24)
})

# 基础数据透视表
pivot1 = pd.pivot_table(sales_data, 
                       values='Sales', 
                       index='Region', 
                       columns='Quarter', 
                       aggfunc='sum')

print("各地区各季度销售总额:")
print(pivot1)

# 多指标数据透视表
pivot2 = pd.pivot_table(sales_data,
                       values=['Sales', 'Profit'],
                       index=['Region', 'Product'],
                       columns='Quarter',
                       aggfunc={'Sales': 'sum', 'Profit': 'mean'})

print("\n各地区产品详细分析:")
print(pivot2)
```

## 📈 数据可视化

### 基础图表
```python
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

print("=== 数据可视化 ===")

# 创建示例数据
sales_data = pd.DataFrame({
    'Month': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    'Sales': [120, 150, 130, 170, 160, 190],
    'Profit': [40, 50, 45, 60, 55, 70]
})

# 折线图
plt.figure(figsize=(10, 6))
plt.plot(sales_data['Month'], sales_data['Sales'], marker='o', label='Sales', linewidth=2)
plt.plot(sales_data['Month'], sales_data['Profit'], marker='s', label='Profit', linewidth=2)
plt.title('月度销售与利润趋势')
plt.xlabel('月份')
plt.ylabel('金额 (千元)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

# 条形图
plt.figure(figsize=(10, 6))
plt.bar(sales_data['Month'], sales_data['Sales'], alpha=0.7, label='Sales')
plt.title('月度销售额')
plt.xlabel('月份')
plt.ylabel('销售额 (千元)')
plt.tight_layout()
plt.show()
```

### 高级可视化
```python
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# 创建相关数据示例
data = pd.DataFrame({
    'Feature1': np.random.normal(0, 1, 100),
    'Feature2': np.random.normal(0, 1, 100),
    'Feature3': np.random.normal(0, 1, 100),
    'Target': np.random.normal(0, 1, 100)
})

# 相关性热力图
plt.figure(figsize=(8, 6))
correlation_matrix = data.corr()
sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', center=0)
plt.title('特征相关性热力图')
plt.tight_layout()
plt.show()

# 分布直方图
plt.figure(figsize=(12, 4))

plt.subplot(1, 3, 1)
data['Feature1'].hist(bins=15, alpha=0.7, edgecolor='black')
plt.title('Feature1 分布')

plt.subplot(1, 3, 2)
data['Feature2'].hist(bins=15, alpha=0.7, edgecolor='black')
plt.title('Feature2 分布')

plt.subplot(1, 3, 3)
data['Feature3'].hist(bins=15, alpha=0.7, edgecolor='black')
plt.title('Feature3 分布')

plt.tight_layout()
plt.show()
```

## 🚀 高级数据处理

### 时间序列分析
```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

print("=== 时间序列分析 ===")

# 创建时间序列数据
dates = pd.date_range('2024-01-01', periods=100, freq='D')
time_series = pd.DataFrame({
    'date': dates,
    'value': np.random.randn(100).cumsum() + 100,
    'volume': np.random.randint(100, 1000, 100)
})

# 设置时间索引
time_series.set_index('date', inplace=True)

print("时间序列基本信息:")
print(f"时间范围: {time_series.index.min()} 到 {time_series.index.max()}")
print(f"数据点数: {len(time_series)}")

# 重采样（日数据转为周数据）
weekly_data = time_series.resample('W').agg({'value': 'mean', 'volume': 'sum'})
print("\n周度聚合数据:")
print(weekly_data.head())

# 移动平均
time_series['7_day_ma'] = time_series['value'].rolling(window=7).mean()

# 可视化时间序列
plt.figure(figsize=(12, 8))

plt.subplot(2, 1, 1)
plt.plot(time_series.index, time_series['value'], label='原始值', alpha=0.7)
plt.plot(time_series.index, time_series['7_day_ma'], label='7日移动平均', linewidth=2)
plt.title('时间序列与移动平均')
plt.legend()
plt.grid(True, alpha=0.3)

plt.subplot(2, 1, 2)
plt.bar(weekly_data.index, weekly_data['volume'], alpha=0.7)
plt.title('周度交易量')
plt.tight_layout()
plt.show()
```

### 数据合并与连接
```python
import pandas as pd

print("=== 数据合并操作 ===")

# 创建示例数据
df1 = pd.DataFrame({
    'ID': [1, 2, 3, 4],
    'Name': ['Alice', 'Bob', 'Charlie', 'David'],
    'Dept': ['IT', 'HR', 'IT', 'Finance']
})

df2 = pd.DataFrame({
    'ID': [1, 2, 5, 6],
    'Salary': [50000, 60000, 70000, 55000],
    'Join_Date': ['2020-01-01', '2019-03-15', '2021-06-01', '2018-11-20']
})

print("数据表1:")
print(df1)
print("\n数据表2:")
print(df2)

# 内连接
inner_join = pd.merge(df1, df2, on='ID', how='inner')
print(f"\n内连接结果 (共{len(inner_join)}行):")
print(inner_join)

# 左连接
left_join = pd.merge(df1, df2, on='ID', how='left')
print(f"\n左连接结果 (共{len(left_join)}行):")
print(left_join)

# 外连接
outer_join = pd.merge(df1, df2, on='ID', how='outer')
print(f"\n外连接结果 (共{len(outer_join)}行):")
print(outer_join)
```

## ⚠️ 使用注意事项

### ✅ 推荐做法：
- 正常导入：`import pandas as pd`
- 使用标准的 Pandas 函数和方法
- 直接使用 `print()` 输出结果
- 使用 `plt.show()` 显示图表

### ❌ 避免的操作：
- 不要手动构建 JSON 输出
- 不要使用 `base64` 编码图像
- 不要创建复杂的自定义输出格式

### 🔧 错误处理：
```python
try:
    import pandas as pd
    # 数据处理代码
    result = df.groupby('Department')['Salary'].mean()
    print(f"各部门平均薪资: {result}")
except ImportError:
    print("Pandas 不可用")
except Exception as e:
    print(f"数据处理错误: {e}")
```

### 💡 实用技巧：
```python
# 快速查看数据分布
def quick_analysis(df):
    print("数据快速分析:")
    print(f"形状: {df.shape}")
    print(f"内存使用: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")
    print("\n数值列统计:")
    print(df.describe())
    print("\n缺失值统计:")
    print(df.isnull().sum())

# 使用示例
# quick_analysis(your_dataframe)
```

**记住**：系统会自动处理所有输出格式，您只需要专注于数据处理逻辑！
