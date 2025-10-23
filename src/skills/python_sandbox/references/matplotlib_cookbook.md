# Matplotlib 图表菜谱

## 🎨 图表类型指南

### 何时使用何种图表

- **条形图**: 用于比较不同类别的数据
- **折线图**: 用于显示数据随时间的变化趋势
- **散点图**: 用于观察两个变量之间的关系
- **箱线图**: 用于展示数据分布和识别异常值
- **热力图**: 用于显示矩阵数据的颜色编码
- **饼图**: 用于显示各部分占总体的比例

## 📊 基础图表模板

### 标准条形图
```python
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import json

# 数据准备
data = {'Category': ['A', 'B', 'C', 'D'], 'Values': [23, 45, 56, 78]}
df = pd.DataFrame(data)

# 创建图表
plt.figure(figsize=(10, 6))
plt.bar(df['Category'], df['Values'], color=['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'])
plt.title('产品销售额对比', fontsize=14, fontweight='bold')
plt.xlabel('产品类别')
plt.ylabel('销售额 (万元)')
plt.grid(True, alpha=0.3)

# 输出处理
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
buf.seek(0)
image_base64 = base64.b64encode(buf.read()).decode('utf-8')
buf.close()
plt.close('all')

result = {
    "type": "image",
    "title": "产品销售额对比图",
    "image_base64": image_base64
}
print(json.dumps(result))
```

### 多子图布局
```python
import matplotlib.pyplot as plt
import numpy as np
import io
import base64
import json

# 创建多子图
fig, axes = plt.subplots(2, 2, figsize=(12, 10))

# 子图1: 折线图
x = np.linspace(0, 10, 100)
axes[0,0].plot(x, np.sin(x), label='sin(x)')
axes[0,0].plot(x, np.cos(x), label='cos(x)')
axes[0,0].set_title('三角函数')
axes[0,0].legend()
axes[0,0].grid(True, alpha=0.3)

# 子图2: 散点图
x_scatter = np.random.normal(0, 1, 100)
y_scatter = np.random.normal(0, 1, 100)
axes[0,1].scatter(x_scatter, y_scatter, alpha=0.6)
axes[0,1].set_title('随机散点图')

# 子图3: 直方图
data_hist = np.random.normal(0, 1, 1000)
axes[1,0].hist(data_hist, bins=30, alpha=0.7, edgecolor='black')
axes[1,0].set_title('数据分布直方图')

# 子图4: 箱线图
data_box = [np.random.normal(0, 1, 100) for _ in range(4)]
axes[1,1].boxplot(data_box, labels=['A', 'B', 'C', 'D'])
axes[1,1].set_title('多组数据箱线图')

plt.tight_layout()

# 输出处理
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
buf.seek(0)
image_base64 = base64.b64encode(buf.read()).decode('utf-8')
buf.close()
plt.close('all')

result = {
    "type": "image", 
    "title": "多图表分析面板",
    "image_base64": image_base64
}
print(json.dumps(result))
```

## 🎯 高级可视化技巧

### 商务风格图表
```python
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

# 设置商务风格
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

# 创建商务图表
def create_business_chart(data, chart_type='bar'):
    fig, ax = plt.subplots(figsize=(10, 6))
    
    if chart_type == 'bar':
        bars = ax.bar(data.index, data.values, color='#2E86AB', alpha=0.8)
        # 在柱子上添加数值标签
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                   f'{height:.1f}', ha='center', va='bottom')
    
    elif chart_type == 'line':
        ax.plot(data.index, data.values, marker='o', linewidth=2, markersize=6)
    
    ax.set_title('商务图表', fontsize=16, fontweight='bold', pad=20)
    ax.grid(True, alpha=0.3)
    return fig
```

## 🚀 Plotly 高级交互式可视化

### 复杂交互式图表
```python
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
import json

def create_advanced_plotly_dashboard():
    """创建高级 Plotly 交互式仪表板"""
    
    # 生成示例数据
    np.random.seed(42)
    n_points = 100
    
    # 主数据
    main_data = pd.DataFrame({
        'x': np.random.randn(n_points),
        'y': np.random.randn(n_points),
        'z': np.random.randn(n_points),
        'category': np.random.choice(['A', 'B', 'C'], n_points),
        'size': np.random.uniform(10, 100, n_points),
        'value': np.random.uniform(0, 1, n_points)
    })
    
    # 时间序列数据
    dates = pd.date_range('2024-01-01', periods=50, freq='D')
    time_series_data = pd.DataFrame({
        'date': dates,
        'series1': np.random.randn(50).cumsum() + 100,
        'series2': np.random.randn(50).cumsum() + 95,
        'series3': np.random.randn(50).cumsum() + 105
    })
    
    # 创建子图仪表板
    fig = make_subplots(
        rows=3, cols=2,
        subplot_titles=('3D散点图', '时间序列趋势', '平行坐标图', '热力图', '旭日图', '雷达图'),
        specs=[
            [{"type": "scatter3d"}, {"type": "scatter"}],
            [{"type": "parcoords"}, {"type": "heatmap"}],
            [{"type": "sunburst"}, {"type": "scatterpolar"}]
        ],
        vertical_spacing=0.08,
        horizontal_spacing=0.08
    )
    
    # 1. 3D散点图
    for category in main_data['category'].unique():
        category_data = main_data[main_data['category'] == category]
        fig.add_trace(
            go.Scatter3d(
                x=category_data['x'],
                y=category_data['y'],
                z=category_data['z'],
                mode='markers',
                marker=dict(
                    size=category_data['size']/20,
                    color=category_data['value'],
                    colorscale='Viridis',
                    opacity=0.7,
                    colorbar=dict(title="Value")
                ),
                name=f'Category {category}',
                text=[f'Value: {v:.2f}' for v in category_data['value']],
                hoverinfo='text'
            ),
            row=1, col=1
        )
    
    # 2. 时间序列图
    for i, col in enumerate(['series1', 'series2', 'series3']):
        fig.add_trace(
            go.Scatter(
                x=time_series_data['date'],
                y=time_series_data[col],
                mode='lines+markers',
                name=col,
                line=dict(width=2),
                marker=dict(size=4)
            ),
            row=1, col=2
        )
    
    # 3. 平行坐标图
    fig.add_trace(
        go.Parcoords(
            line=dict(
                color=main_data['value'],
                colorscale='Electric',
                showscale=True,
                colorbar=dict(title="Value")
            ),
            dimensions=[
                dict(label='X', values=main_data['x']),
                dict(label='Y', values=main_data['y']),
                dict(label='Z', values=main_data['z']),
                dict(label='Size', values=main_data['size']),
                dict(label='Value', values=main_data['value'])
            ]
        ),
        row=2, col=1
    )
    
    # 4. 热力图
    correlation_matrix = main_data[['x', 'y', 'z', 'size', 'value']].corr()
    fig.add_trace(
        go.Heatmap(
            z=correlation_matrix.values,
            x=correlation_matrix.columns,
            y=correlation_matrix.columns,
            colorscale='RdBu',
            zmid=0,
            colorbar=dict(title="Correlation")
        ),
        row=2, col=2
    )
    
    # 5. 旭日图
    sunburst_data = pd.DataFrame({
        'ids': ['Total', 'Total-A', 'Total-B', 'Total-C', 'A-1', 'A-2', 'B-1', 'B-2', 'C-1', 'C-2'],
        'labels': ['Total', 'A', 'B', 'C', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        'parents': ['', 'Total', 'Total', 'Total', 'Total-A', 'Total-A', 'Total-B', 'Total-B', 'Total-C', 'Total-C'],
        'values': [100, 35, 30, 35, 20, 15, 18, 12, 25, 10]
    })
    
    fig.add_trace(
        go.Sunburst(
            ids=sunburst_data['ids'],
            labels=sunburst_data['labels'],
            parents=sunburst_data['parents'],
            values=sunburst_data['values'],
            branchvalues="total",
            marker=dict(colors=px.colors.qualitative.Pastel)
        ),
        row=3, col=1
    )
    
    # 6. 雷达图
    categories = ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5']
    
    for category in main_data['category'].unique():
        category_data = main_data[main_data['category'] == category]
        radar_values = [
            category_data['x'].mean(),
            category_data['y'].mean(),
            category_data['z'].mean(),
            category_data['size'].mean(),
            category_data['value'].mean()
        ]
        
        fig.add_trace(
            go.Scatterpolar(
                r=radar_values + [radar_values[0]],  # 闭合雷达图
                theta=categories + [categories[0]],
                fill='toself',
                name=f'Category {category}'
            ),
            row=3, col=2
        )
    
    # 更新布局
    fig.update_layout(
        title_text="高级交互式可视化仪表板",
        height=1200,
        showlegend=True,
        template="plotly_white"
    )
    
    # 转换为JSON输出
    result = {
        "type": "plotly_advanced_dashboard",
        "title": "高级交互式可视化仪表板",
        "description": "包含3D散点图、时间序列、平行坐标、热力图、旭日图和雷达图的复杂仪表板",
        "note": "需要在前端使用Plotly.js进行渲染，此JSON包含完整的图表配置",
        "chart_config": fig.to_json()
    }
    print(json.dumps(result))

# create_advanced_plotly_dashboard()
```

### 动态交互式图表
```python
def create_dynamic_interactive_charts():
    """创建动态交互式图表"""
    
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
    
    # 创建动态数据
    np.random.seed(42)
    time_points = 100
    time_index = pd.date_range('2024-01-01', periods=time_points, freq='H')
    
    dynamic_data = pd.DataFrame({
        'timestamp': time_index,
        'temperature': 20 + 10 * np.sin(2 * np.pi * np.arange(time_points) / 24) + np.random.normal(0, 1, time_points),
        'humidity': 50 + 20 * np.cos(2 * np.pi * np.arange(time_points) / 12) + np.random.normal(0, 3, time_points),
        'pressure': 1013 + 5 * np.sin(2 * np.pi * np.arange(time_points) / 6) + np.random.normal(0, 0.5, time_points)
    })
    
    # 创建动态仪表板
    fig = make_subplots(
        rows=2, cols=2,
        subplot_titles=('温度趋势', '湿度分布', '压力变化', '多变量关系'),
        specs=[
            [{"secondary_y": False}, {"type": "histogram"}],
            [{"secondary_y": True}, {"type": "scatter"}]
        ]
    )
    
    # 1. 温度趋势（带滚动平均）
    fig.add_trace(
        go.Scatter(
            x=dynamic_data['timestamp'],
            y=dynamic_data['temperature'],
            mode='lines',
            name='实际温度',
            line=dict(color='red', width=1)
        ),
        row=1, col=1
    )
    
    # 添加滚动平均
    rolling_avg = dynamic_data['temperature'].rolling(window=6).mean()
    fig.add_trace(
        go.Scatter(
            x=dynamic_data['timestamp'],
            y=rolling_avg,
            mode='lines',
            name='6小时平均',
            line=dict(color='darkred', width=3)
        ),
        row=1, col=1
    )
    
    # 2. 湿度分布直方图
    fig.add_trace(
        go.Histogram(
            x=dynamic_data['humidity'],
            nbinsx=20,
            name='湿度分布',
            marker_color='lightblue',
            opacity=0.7
        ),
        row=1, col=2
    )
    
    # 3. 压力变化（双Y轴）
    fig.add_trace(
        go.Scatter(
            x=dynamic_data['timestamp'],
            y=dynamic_data['pressure'],
            mode='lines',
            name='气压',
            line=dict(color='green', width=2)
        ),
        row=2, col=1
    )
    
    # 添加压力变化率（次Y轴）
    pressure_change = dynamic_data['pressure'].diff().fillna(0)
    fig.add_trace(
        go.Scatter(
            x=dynamic_data['timestamp'],
            y=pressure_change,
            mode='lines',
            name='压力变化率',
            line=dict(color='orange', width=1, dash='dot')
        ),
        row=2, col=1,
        secondary_y=True
    )
    
    # 4. 多变量散点图
    fig.add_trace(
        go.Scatter(
            x=dynamic_data['temperature'],
            y=dynamic_data['humidity'],
            mode='markers',
            marker=dict(
                size=8,
                color=dynamic_data['pressure'],
                colorscale='Viridis',
                showscale=True,
                colorbar=dict(title="Pressure")
            ),
            text=[f"Time: {ts}" for ts in dynamic_data['timestamp']],
            name='温湿度关系'
        ),
        row=2, col=2
    )
    
    # 更新布局
    fig.update_layout(
        title_text="动态环境数据监控仪表板",
        height=800,
        showlegend=True,
        template="plotly_dark"
    )
    
    # 更新坐标轴标签
    fig.update_xaxes(title_text="时间", row=1, col=1)
    fig.update_yaxes(title_text="温度 (°C)", row=1, col=1)
    fig.update_xaxes(title_text="湿度 (%)", row=1, col=2)
    fig.update_yaxes(title_text="频次", row=1, col=2)
    fig.update_xaxes(title_text="时间", row=2, col=1)
    fig.update_yaxes(title_text="气压 (hPa)", row=2, col=1)
    fig.update_yaxes(title_text="变化率 (hPa/h)", secondary_y=True, row=2, col=1)
    fig.update_xaxes(title_text="温度 (°C)", row=2, col=2)
    fig.update_yaxes(title_text="湿度 (%)", row=2, col=2)
    
    result = {
        "type": "plotly_dynamic_dashboard",
        "title": "动态环境数据监控仪表板",
        "description": "实时数据监控仪表板，包含趋势分析、分布统计和多变量关系",
        "chart_config": fig.to_json()
    }
    print(json.dumps(result))

# create_dynamic_interactive_charts()
```

### 地理空间可视化
```python
def create_geospatial_visualizations():
    """创建地理空间可视化"""
    
    import plotly.express as px
    
    # 创建地理数据
    cities_data = pd.DataFrame({
        'city': ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安'],
        'lat': [39.9042, 31.2304, 23.1291, 22.5431, 30.2741, 30.5728, 30.5928, 34.3416],
        'lon': [116.4074, 121.4737, 113.2644, 114.0579, 120.1551, 104.0668, 114.3055, 108.9398],
        'population': [2171, 2428, 1530, 1303, 1036, 1658, 1121, 1299],  # 万人
        'gdp': [3610, 3870, 2510, 2767, 1560, 1770, 1560, 1000]  # 十亿元
    })
    
    # 1. 散点地图
    scatter_map = px.scatter_mapbox(
        cities_data,
        lat="lat",
        lon="lon",
        hover_name="city",
        hover_data={"population": True, "gdp": True},
        size="population",
        color="gdp",
        color_continuous_scale=px.colors.sequential.Viridis,
        size_max=30,
        zoom=3,
        height=600,
        title="中国主要城市人口与GDP分布"
    )
    
    scatter_map.update_layout(mapbox_style="open-street-map")
    
    # 2. 密度地图
    # 生成模拟密度数据
    np.random.seed(42)
    n_points = 1000
    density_data = pd.DataFrame({
        'lat': np.random.uniform(20, 45, n_points),
        'lon': np.random.uniform(100, 125, n_points),
        'value': np.random.exponential(2, n_points)
    })
    
    density_map = px.density_mapbox(
        density_data,
        lat='lat',
        lon='lon',
        z='value',
        radius=10,
        center=dict(lat=32, lon=110),
        zoom=3,
        mapbox_style="stamen-terrain",
        title="模拟数据密度分布图",
        height=600
    )
    
    result = {
        "type": "plotly_geospatial",
        "title": "地理空间可视化",
        "description": "包含散点地图和密度地图的地理空间分析",
        "scatter_map_config": scatter_map.to_json(),
        "density_map_config": density_map.to_json(),
        "note": "需要地图服务支持，建议使用OpenStreetMap或Mapbox"
    }
    print(json.dumps(result))

# create_geospatial_visualizations()
```

## 🎨 颜色和样式指南

### 颜色方案
```python
# 商务颜色方案
business_colors = ['#2E86AB', '#A23B72', '#F18F01', '#C73E1D', '#3B1F2B']

# 渐变色方案
gradient_colors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1']

# 分类颜色
categorical_colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']
```

### 字体和布局优化
```python
def optimize_chart_layout(fig):
    """优化图表布局"""
    fig.tight_layout()
    plt.subplots_adjust(top=0.9)  # 为标题留出空间
    return fig
```

这个matplotlib_cookbook文件现在提供了从基础Matplotlib图表到高级Plotly交互式可视化的完整指南，确保能够创建专业、美观且交互性强的数据可视化。
