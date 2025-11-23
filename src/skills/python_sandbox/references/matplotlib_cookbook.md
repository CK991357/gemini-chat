# Matplotlib 图表生成指南 (v2.2)

## 🚀 核心使用方法

**重要提示**：您只需要专注于绘图逻辑，系统会自动处理图像输出。

### 必须遵循的原则：
1. **正常导入**：`import matplotlib.pyplot as plt`
2. **正常绘图**：使用标准的matplotlib函数
3. **无需编码**：禁止使用`io.BytesIO`、`base64`等手动编码
4. **推荐使用**：在代码末尾调用`plt.show()`

## 📊 可直接使用的代码模板

### 模板1：基础条形图
```python
import matplotlib.pyplot as plt
import pandas as pd

# 准备数据
data = {'Category': ['A', 'B', 'C', 'D'], 'Values': [23, 45, 56, 33]}
df = pd.DataFrame(data)

# 绘图
plt.figure(figsize=(10, 6))
plt.bar(df['Category'], df['Values'], color=['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'])
plt.title('产品销售额对比')
plt.xlabel('产品类别')
plt.ylabel('销售额 (万元)')
plt.grid(True, linestyle='--', alpha=0.6)
plt.tight_layout()

plt.show()
```

### 模板2：折线图
```python
import matplotlib.pyplot as plt
import pandas as pd

# 时间序列数据
data = {'Time': [1, 2, 3, 4, 5], 'Value': [10, 20, 15, 25, 30]}
df = pd.DataFrame(data)

plt.figure(figsize=(10, 6))
plt.plot(df['Time'], df['Value'], marker='o', linestyle='-', linewidth=2)
plt.title('数据趋势分析')
plt.xlabel('时间')
plt.ylabel('数值')
plt.grid(True)
plt.tight_layout()

plt.show()
```

### 模板3：散点图
```python
import matplotlib.pyplot as plt
import numpy as np

# 生成示例数据
x = np.random.randn(100)
y = np.random.randn(100)

plt.figure(figsize=(10, 6))
plt.scatter(x, y, alpha=0.6)
plt.title('散点图示例')
plt.xlabel('X轴')
plt.ylabel('Y轴')
plt.grid(True, linestyle='--', alpha=0.6)
plt.tight_layout()

plt.show()
```

### 模板4：多子图布局
```python
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y1 = np.sin(x)
y2 = np.cos(x)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

ax1.plot(x, y1, 'b-', linewidth=2)
ax1.set_title('正弦函数')
ax1.grid(True)

ax2.plot(x, y2, 'r-', linewidth=2)
ax2.set_title('余弦函数')
ax2.grid(True)

plt.tight_layout()
plt.show()
```

## 🎨 图表类型选择指南

### 数据比较：
- **条形图**：比较不同类别的数值
- **水平条形图**：类别名称较长时使用

### 趋势分析：
- **折线图**：显示数据随时间的变化趋势
- **面积图**：显示累积效果

### 分布分析：
- **直方图**：显示数据分布
- **箱线图**：显示数据分布和异常值
- **散点图**：观察两个变量的关系

### 比例分析：
- **饼图**：显示各部分占比
- **环形图**：饼图的变体

## ⚠️ 重要注意事项

### 必须包含：
- `import matplotlib.pyplot as plt`
- 有意义的`plt.title()`（标题会被自动捕获）
- `plt.show()`（推荐但非必须）

### 禁止操作：
- ❌ 不要使用`base64.b64encode()`
- ❌ 不要创建`io.BytesIO()`对象
- ❌ 不要手动构建JSON输出

### 最佳实践：
- 使用`plt.tight_layout()`自动调整布局
- 使用`plt.grid()`添加网格提高可读性
- 设置合适的`figsize`确保图表清晰

## 🔧 样式配置与中文支持 (关键)

本环境已预装开源中文字体，请务必使用以下配置以避免中文乱码。

### ✅ 推荐的中文字体配置：
```python
import matplotlib.pyplot as plt

# 必须指定环境内真实存在的字体名
# 优先级：WenQuanYi Micro Hei > WenQuanYi Zen Hei
plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei', 'WenQuanYi Zen Hei']
plt.rcParams['axes.unicode_minus'] = False # 解决负号显示问题

# 设置全局样式（可选）
plt.style.use('seaborn-v0_8')
plt.rcParams['font.size'] = 12
plt.rcParams['figure.figsize'] = (10, 6)

# 您的绘图代码...
plt.plot([1, 2, 3, 4], [1, 4, 2, 3])
plt.title('带样式配置的图表')
plt.show()
```
### ❌ 禁止使用的字体 (环境内不存在)：
不要使用 SimHei
不要使用 Microsoft YaHei
不要使用 Songti

**记住**：系统会自动捕获所有图表并转换为标准格式，您只需要专注于绘图逻辑！
