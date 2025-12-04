# Matplotlib 图表生成指南 (v2.5 - 与后端完全匹配版)

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
- `plt.show()`（触发自动捕获的关键）

### 禁止操作：
- ❌ 不要使用`base64.b64encode()`
- ❌ 不要创建`io.BytesIO()`对象
- ❌ 不要手动构建JSON输出

### 最佳实践：
- 使用`plt.tight_layout()`自动调整布局
- 使用`plt.grid()`添加网格提高可读性
- 设置合适的`figsize`确保图表清晰

## 🔧 样式配置与中文支持 (关键)

本环境已预装开源中文字体，系统会自动应用最佳字体配置。

### ✅ 推荐的中文字体配置（可选）：
```python
import matplotlib.pyplot as plt

# 系统已自动配置中文字体，此配置为可选优化
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

## 🏗️ 流程图与架构图生成指南 (与后端完全匹配版)

### Graphviz 专业流程图

#### 基础流程图模板 - 必须赋值给变量
```python
from graphviz import Digraph

# 🎯 关键：必须将图表对象赋值给变量
dot = Digraph('BasicFlow', comment='基础流程图')
dot.attr(rankdir='TB', size='8,5')

dot.node('start', '开始', shape='ellipse', color='green')
dot.node('process1', '数据处理', shape='box')
dot.node('decision', '判断条件', shape='diamond', color='blue')
dot.node('process2', '后续处理', shape='box')
dot.node('end', '结束', shape='ellipse', color='red')

dot.edge('start', 'process1', label='输入')
dot.edge('process1', 'decision', label='结果')
dot.edge('decision', 'process2', label='是', color='green')
dot.edge('decision', 'end', label='否', color='red')
dot.edge('process2', 'end', label='完成')

# 🎯 系统会自动检测并捕获图表对象
# 无需额外代码！
```

#### 系统架构图模板
```python
from graphviz import Digraph

# 🎯 关键：必须创建并赋值图表对象
def create_system_architecture():
    dot = Digraph('SystemArch', comment='系统架构图')
    dot.attr(rankdir='LR', size='12,8')
    
    with dot.subgraph(name='cluster_frontend') as frontend:
        frontend.attr(label='前端层', style='filled', color='lightgrey')
        frontend.node('web', 'Web应用', shape='box')
        frontend.node('mobile', '移动端', shape='box')
    
    with dot.subgraph(name='cluster_backend') as backend:
        backend.attr(label='后端服务', style='filled', color='lightblue')
        backend.node('api', 'API网关', shape='box')
        backend.node('auth', '认证服务', shape='box')
        backend.node('business', '业务逻辑', shape='box')
    
    with dot.subgraph(name='cluster_data') as data:
        data.attr(label='数据层', style='filled', color='lightgreen')
        data.node('db', '数据库', shape='cylinder')
        data.node('cache', '缓存', shape='cylinder')
    
    dot.edge('web', 'api', label='HTTP')
    dot.edge('mobile', 'api', label='REST')
    dot.edge('api', 'auth', label='验证')
    dot.edge('api', 'business', label='请求')
    dot.edge('business', 'db', label='查询')
    dot.edge('business', 'cache', label='读写')
    
    return dot  # 🎯 返回图表对象即可被自动捕获

# 调用函数创建图表
arch_diagram = create_system_architecture()
```

### NetworkX 网络关系图

#### 基础网络图模板 - 通过Matplotlib显示
```python
import networkx as nx
import matplotlib.pyplot as plt

def create_network_diagram():
    G = nx.DiGraph()
    
    G.add_edge('数据源', 'ETL处理')
    G.add_edge('ETL处理', '数据仓库')
    G.add_edge('数据仓库', '数据分析')
    G.add_edge('数据分析', '可视化')
    G.add_edge('可视化', '业务决策')
    
    plt.figure(figsize=(12, 8))
    pos = nx.spring_layout(G, k=1, iterations=50)
    
    nx.draw_networkx_nodes(G, pos, node_color='lightblue', 
                          node_size=2000, alpha=0.9)
    nx.draw_networkx_edges(G, pos, edge_color='gray', 
                          arrows=True, arrowsize=20)
    nx.draw_networkx_labels(G, pos, font_size=10, font_weight='bold')
    
    plt.title('数据处理流水线网络图', size=16, pad=20)
    plt.axis('off')
    plt.tight_layout()
    
    # 🎯 关键：使用 plt.show() 触发自动捕获！
    plt.show()

create_network_diagram()
```

## 🔄 后端实际捕获机制说明

### 捕获优先级顺序：
1. **用户显式输出**：检查是否有标准JSON格式输出
2. **Matplotlib图表**：检测并捕获所有活动图形
3. **Graphviz图表**：扫描全局变量中的Digraph对象
4. **统一输出**：所有图表转换为标准JSON格式

### 实际技术要求：

| 图表类型 | 技术要求 | 自动捕获条件 |
|---------|----------|--------------|
| **Matplotlib** | 使用`plt.show()` | ✅ 完全自动 |
| **Graphviz** | 图表对象必须赋值给变量 | ✅ 变量检测 |
| **NetworkX** | 通过`plt.show()`显示 | ✅ Matplotlib捕获 |

### 错误处理机制：
- **分级捕获**：四种捕获方式独立运行
- **容错设计**：一种方式失败不影响其他
- **错误提示**：捕获失败会输出友好警告信息

## 🎯 现在完全匹配后端！

### 统一的自动捕获机制：

| 图表类型 | 正确使用方法 | 后端支持 |
|---------|----------|----------|
| **Matplotlib** | `plt.show()` | ✅ 完全支持 |
| **Graphviz** | 创建并赋值图表对象 | ✅ 变量检测 |
| **NetworkX** | `plt.show()` | ✅ Matplotlib通道 |

### 终极最佳实践：

```python
# 所有图表类型都遵循简单规则！

# Matplotlib - 自动捕获
import matplotlib.pyplot as plt
plt.plot([1,2,3], [1,4,2])
plt.title('我的图表')
plt.show()  # 🎯 关键触发点

# Graphviz - 自动捕获（必须赋值）  
from graphviz import Digraph
dot = Digraph()  # 🎯 关键：赋值给变量
dot.node('A', 'Node A')
dot.node('B', 'Node B') 
dot.edge('A', 'B')
# 无需额外代码！

# NetworkX - 通过Matplotlib自动捕获
import networkx as nx
G = nx.Graph()
G.add_edge('A', 'B')
nx.draw(G)
plt.show()  # 🎯 关键触发点
```

## ⚡ 故障排除

### 如果图表未显示：
1. **检查Graphviz变量**：确保图表对象赋值给了变量
2. **检查plt.show()**：Matplotlib和NetworkX必须调用此函数
3. **查看错误信息**：系统会输出详细的警告信息帮助诊断

### 字体显示问题：
- 系统已内置中文字体自动修正
- 如果仍有乱码，可手动设置字体配置
- 优先使用WenQuanYi系列字体

**记住**：系统会自动捕获所有图表并转换为标准格式，您只需要专注于绘图逻辑和遵循上述技术规范！
