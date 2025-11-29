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


## 🏗️ 流程图与架构图生成指南

### 使用场景对比
| 需求类型 | 推荐工具 | 输出特点 | 适用场景 |
|----------|----------|----------|----------|
| 数据图表 | Matplotlib | 数据驱动，样式丰富 | 数据分析、统计图表 |
| 专业流程图 | Graphviz | 自动布局，样式统一 | 系统架构、流程图 |
| 网络关系图 | NetworkX | 复杂关系，算法支持 | 社交网络、拓扑图 |

### Graphviz 专业流程图

#### 基础流程图模板
```python
from graphviz import Digraph

def create_basic_flowchart():
    # 创建有向图
    dot = Digraph('BasicFlow', comment='基础流程图')
    dot.attr(rankdir='TB', size='8,5')  # 布局方向：TB(从上到下), LR(从左到右)
    
    # 添加节点（不同形状代表不同类型）
    dot.node('start', '开始', shape='ellipse', color='green')
    dot.node('process1', '数据处理', shape='box')
    dot.node('decision', '判断条件', shape='diamond', color='blue')
    dot.node('process2', '后续处理', shape='box')
    dot.node('end', '结束', shape='ellipse', color='red')
    
    # 添加连接线
    dot.edge('start', 'process1', label='输入')
    dot.edge('process1', 'decision', label='结果')
    dot.edge('decision', 'process2', label='是', color='green')
    dot.edge('decision', 'end', label='否', color='red')
    dot.edge('process2', 'end', label='完成')
    
    # 保存到工作区（重要：必须指定绝对路径）
    dot.render('/data/basic_flowchart', format='png', cleanup=True)
    print("流程图已保存到工作区：/data/basic_flowchart.png")

create_basic_flowchart()
```

#### 系统架构图模板
```python
from graphviz import Digraph

def create_system_architecture():
    dot = Digraph('SystemArch', comment='系统架构图')
    dot.attr(rankdir='LR', size='12,8')  # 从左到右布局
    
    # 定义节点组
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
    
    # 连接各层
    dot.edge('web', 'api', label='HTTP')
    dot.edge('mobile', 'api', label='REST')
    dot.edge('api', 'auth', label='验证')
    dot.edge('api', 'business', label='请求')
    dot.edge('business', 'db', label='查询')
    dot.edge('business', 'cache', label='读写')
    
    dot.render('/data/system_architecture', format='png', cleanup=True)
    print("系统架构图已保存到工作区")

create_system_architecture()
```

### NetworkX 网络关系图

#### 基础网络图模板
```python
import networkx as nx
import matplotlib.pyplot as plt

def create_network_diagram():
    # 创建有向图
    G = nx.DiGraph()
    
    # 添加节点和边
    G.add_edge('数据源', 'ETL处理')
    G.add_edge('ETL处理', '数据仓库')
    G.add_edge('数据仓库', '数据分析')
    G.add_edge('数据分析', '可视化')
    G.add_edge('可视化', '业务决策')
    
    # 设置绘图样式
    plt.figure(figsize=(12, 8))
    
    # 选择布局算法
    pos = nx.spring_layout(G, k=1, iterations=50)
    
    # 绘制节点和边
    nx.draw_networkx_nodes(G, pos, node_color='lightblue', 
                          node_size=2000, alpha=0.9)
    nx.draw_networkx_edges(G, pos, edge_color='gray', 
                          arrows=True, arrowsize=20)
    nx.draw_networkx_labels(G, pos, font_size=10, font_weight='bold')
    
    # 添加标题和调整布局
    plt.title('数据处理流水线网络图', size=16, pad=20)
    plt.axis('off')
    plt.tight_layout()
    
    # 保存到工作区
    plt.savefig('/data/network_pipeline.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("网络图已保存到工作区：/data/network_pipeline.png")

create_network_diagram()
```

#### 复杂网络分析模板
```python
import networkx as nx
import matplotlib.pyplot as plt
import numpy as np

def create_complex_network():
    # 创建随机网络
    G = nx.erdos_renyi_graph(30, 0.1)
    
    # 计算网络指标
    degrees = dict(G.degree())
    betweenness = nx.betweenness_centrality(G)
    
    # 设置节点大小和颜色基于中心性
    node_sizes = [v * 500 for v in degrees.values()]
    node_colors = list(betweenness.values())
    
    # 绘制图形
    plt.figure(figsize=(14, 10))
    pos = nx.spring_layout(G, seed=42)
    
    # 绘制网络
    nodes = nx.draw_networkx_nodes(G, pos, node_size=node_sizes,
                                 node_color=node_colors, 
                                 cmap=plt.cm.viridis, alpha=0.8)
    nx.draw_networkx_edges(G, pos, alpha=0.5)
    nx.draw_networkx_labels(G, pos, font_size=8)
    
    # 添加颜色条
    plt.colorbar(nodes, label='介数中心性')
    plt.title('复杂网络分析图（节点大小=度，颜色=中心性）', size=14)
    plt.axis('off')
    
    # 保存结果
    plt.savefig('/data/complex_network.png', dpi=150, bbox_inches='tight')
    plt.close()
    
    # 输出网络统计信息
    print(f"网络统计:")
    print(f"- 节点数: {G.number_of_nodes()}")
    print(f"- 边数: {G.number_of_edges()}")
    print(f"- 平均度: {np.mean(list(degrees.values())):.2f}")
    print("网络图已保存到工作区")

create_complex_network()
```

### 最佳实践与注意事项
✅ 推荐做法：
- Graphviz 用于：流程图、架构图、类图等需要专业布局的图表
- NetworkX + Matplotlib 用于：数据关系网络、社交网络、拓扑分析
- 纯 Matplotlib 用于：数据可视化、统计图表

⚠️ 重要提醒：
- Graphviz 必须指定绝对路径：`/data/文件名`
- 清理中间文件：使用 `cleanup=True` 删除临时文件
- 内存管理：复杂网络分析时注意节点数量
- 文件格式：支持 PNG、PDF、SVG 等格式

🔧 故障排除：
```python
# 验证 Graphviz 安装
def check_graphviz_installation():
    try:
        from graphviz import Digraph
        dot = Digraph()
        dot.node('test', 'Test')
        dot.render('/data/test_graphviz', format='png', cleanup=True)
        print("✅ Graphviz 工作正常")
        return True
    except Exception as e:
        print(f"❌ Graphviz 错误: {e}")
        return False

check_graphviz_installation()
```
**记住**：选择合适的工具可以让图表更加专业和清晰！
