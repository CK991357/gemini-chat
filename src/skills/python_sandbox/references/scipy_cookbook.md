# SciPy 科学计算指南 (v2.2)

## 🎯 工具概述
**环境特性**：基于 SciPy 的科学计算环境，支持优化、积分、信号处理等
**输出原则**：系统自动处理结果输出，无需手动编码

## 🔧 核心模块概览

### 主要功能模块：
- **优化算法** (`scipy.optimize`) - 函数最小化、方程求解
- **积分计算** (`scipy.integrate`) - 数值积分、微分方程
- **信号处理** (`scipy.signal`) - 滤波器、频谱分析
- **线性代数** (`scipy.linalg`) - 矩阵运算、线性系统
- **统计函数** (`scipy.stats`) - 概率分布、统计检验
- **空间算法** (`scipy.spatial`) - 空间数据、距离计算

## 🎯 优化与方程求解

### 函数最小化
```python
import numpy as np
from scipy import optimize
import matplotlib.pyplot as plt

# 1. 单变量函数优化
def single_variable_func(x):
    return (x - 3)**2 * np.sin(x) + x**2

result = optimize.minimize_scalar(single_variable_func, bounds=(0, 10), method='bounded')
print(f"最优解: x = {result.x:.4f}, 函数值: {result.fun:.4f}")

# 可视化
x_plot = np.linspace(0, 10, 100)
y_plot = single_variable_func(x_plot)
plt.figure(figsize=(10, 6))
plt.plot(x_plot, y_plot, label='f(x)')
plt.axvline(result.x, color='red', linestyle='--', label=f'最优解 x={result.x:.3f}')
plt.title('单变量函数优化')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
```

### 多变量优化
```python
import numpy as np
from scipy import optimize
import matplotlib.pyplot as plt

# Rosenbrock 函数优化
def rosenbrock(x):
    return sum(100.0 * (x[1:] - x[:-1]**2)**2 + (1 - x[:-1])**2)

x0 = np.array([-1.2, 1.0])
result = optimize.minimize(rosenbrock, x0, method='BFGS')

print(f"初始点: {x0}")
print(f"最优点: {result.x}")
print(f"最优值: {result.fun:.6f}")
print(f"迭代次数: {result.nit}")

# 可视化
x = np.linspace(-2, 2, 100)
y = np.linspace(-1, 3, 100)
X, Y = np.meshgrid(x, y)
Z = np.zeros_like(X)

for i in range(X.shape[0]):
    for j in range(X.shape[1]):
        Z[i,j] = rosenbrock([X[i,j], Y[i,j]])

plt.figure(figsize=(10, 8))
contour = plt.contour(X, Y, Z, levels=50)
plt.clabel(contour, inline=True, fontsize=8)
plt.plot(result.x[0], result.x[1], 'ro', markersize=10, label='最优解')
plt.title('Rosenbrock 函数优化')
plt.legend()
plt.show()
```

### 约束优化
```python
import numpy as np
from scipy import optimize
import matplotlib.pyplot as plt

# 带约束的优化问题
def objective(x):
    return x[0]**2 + x[1]**2

def constraint1(x):
    return x[0] + x[1] - 1  # x + y >= 1

constraints = [{'type': 'ineq', 'fun': constraint1}]
bounds = [(0, None), (0, None)]

result = optimize.minimize(objective, [0.5, 0.5], 
                         method='SLSQP', bounds=bounds, 
                         constraints=constraints)

print(f"约束优化结果:")
print(f"最优点: {result.x}")
print(f"最优值: {result.fun:.4f}")
print(f"约束满足: {result.success}")

# 可视化约束区域
x_const = np.linspace(0, 2, 100)
y_const = np.linspace(0, 2, 100)
X, Y = np.meshgrid(x_const, y_const)
Z = objective([X, Y])

plt.figure(figsize=(10, 8))
plt.contourf(X, Y, Z, levels=20, alpha=0.6)
plt.contour(X, Y, Z, levels=10, colors='black', alpha=0.4)

# 绘制约束条件
y_constraint = 1 - x_const
plt.plot(x_const, y_constraint, 'r-', linewidth=2, label='x + y = 1')
plt.fill_between(x_const, y_constraint, 2, alpha=0.3, color='gray', label='可行域')

plt.plot(result.x[0], result.x[1], 'go', markersize=10, label='最优解')
plt.xlim(0, 2)
plt.ylim(0, 2)
plt.title('约束优化问题')
plt.legend()
plt.show()
```

## 📐 数值积分

### 定积分计算
```python
from scipy import integrate
import numpy as np
import matplotlib.pyplot as plt

# 1. 单变量积分
def func1(x):
    return np.exp(-x**2) * np.sin(x)

integral1, error1 = integrate.quad(func1, 0, np.inf)

print(f"积分结果: {integral1:.6f}")
print(f"估计误差: {error1:.2e}")

# 可视化被积函数
x_plot = np.linspace(0, 3, 100)
y_plot = func1(x_plot)

plt.figure(figsize=(10, 6))
plt.plot(x_plot, y_plot, 'b-', linewidth=2, label='被积函数')
plt.fill_between(x_plot, y_plot, alpha=0.3)
plt.xlabel('x')
plt.ylabel('f(x)')
plt.title(f'定积分: ∫e^(-x²)sin(x)dx = {integral1:.4f}')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
```

### 微分方程求解
```python
from scipy import integrate
import numpy as np
import matplotlib.pyplot as plt

# Lotka-Volterra 捕食者-被捕食者模型
def ode_system(t, y):
    alpha, beta, delta, gamma = 1.0, 0.1, 0.075, 1.5
    prey, predator = y
    dprey_dt = alpha * prey - beta * prey * predator
    dpredator_dt = delta * prey * predator - gamma * predator
    return [dprey_dt, dpredator_dt]

# 求解微分方程
t_span = (0, 50)
y0 = [10, 5]  # 初始种群
t_eval = np.linspace(0, 50, 1000)
solution = integrate.solve_ivp(ode_system, t_span, y0, t_eval=t_eval, method='RK45')

print(f"求解成功: {solution.success}")
print(f"最终被捕食者数量: {solution.y[0, -1]:.2f}")
print(f"最终捕食者数量: {solution.y[1, -1]:.2f}")

# 可视化种群动态
plt.figure(figsize=(12, 5))
plt.plot(solution.t, solution.y[0], 'g-', label='被捕食者', linewidth=2)
plt.plot(solution.t, solution.y[1], 'r-', label='捕食者', linewidth=2)
plt.xlabel('时间')
plt.ylabel('种群数量')
plt.title('Lotka-Volterra 捕食者-被捕食者模型')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
```

## 📡 信号处理

### 信号滤波与频谱分析
```python
from scipy import signal
from scipy.fft import fft, fftfreq
import numpy as np
import matplotlib.pyplot as plt

# 生成测试信号
t = np.linspace(0, 1, 1000, endpoint=False)
original_signal = (np.sin(2 * np.pi * 5 * t) + 
                  0.5 * np.sin(2 * np.pi * 20 * t) + 
                  0.2 * np.sin(2 * np.pi * 50 * t))

# 添加噪声
noisy_signal = original_signal + 0.3 * np.random.normal(size=len(t))

# 设计低通滤波器
nyquist = 500  # 采样频率1000Hz，奈奎斯特频率500Hz
cutoff = 15 / nyquist
b, a = signal.butter(4, cutoff, btype='low')
filtered_signal = signal.filtfilt(b, a, noisy_signal)

print("信号处理完成")
print(f"信号长度: {len(t)}")
print(f"采样频率: 1000 Hz")

# 可视化信号
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))

# 时域信号
ax1.plot(t, original_signal, 'b-', alpha=0.7, label='原始信号')
ax1.plot(t, noisy_signal, 'r-', alpha=0.5, label='带噪声信号')
ax1.plot(t, filtered_signal, 'g-', linewidth=2, label='滤波后信号')
ax1.set_xlabel('时间 (s)')
ax1.set_ylabel('幅度')
ax1.set_title('时域信号')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 频域分析
fft_original = fft(original_signal)
fft_noisy = fft(noisy_signal)
fft_filtered = fft(filtered_signal)
freqs = fftfreq(len(t), t[1] - t[0])
positive_freq_idx = np.where(freqs > 0)

ax2.plot(freqs[positive_freq_idx], np.abs(fft_original[positive_freq_idx]), 'b-', label='原始频谱')
ax2.plot(freqs[positive_freq_idx], np.abs(fft_noisy[positive_freq_idx]), 'r-', alpha=0.5, label='噪声频谱')
ax2.plot(freqs[positive_freq_idx], np.abs(fft_filtered[positive_freq_idx]), 'g-', label='滤波频谱')
ax2.set_xlabel('频率 (Hz)')
ax2.set_ylabel('幅度')
ax2.set_title('频域分析')
ax2.legend()
ax2.grid(True, alpha=0.3)
ax2.set_xlim(0, 100)

plt.tight_layout()
plt.show()
```

## 🧮 线性代数

### 矩阵运算与分解
```python
from scipy import linalg
import numpy as np

# 矩阵运算示例
A = np.array([[4, 2, 1], 
              [2, 5, 3], 
              [1, 3, 6]])
b = np.array([1, 2, 3])

print("矩阵 A:")
print(A)
print(f"\n向量 b: {b}")

# 矩阵性质
det_A = linalg.det(A)
cond_A = linalg.cond(A)
print(f"\n行列式: {det_A:.2f}")
print(f"条件数: {cond_A:.2f}")

# 线性方程组求解
x = linalg.solve(A, b)
print(f"\n方程解: {x}")

# 验证解
print(f"验证: A*x = {A.dot(x)}")
print(f"目标: b = {b}")

# 特征值分解
eigenvalues, eigenvectors = linalg.eig(A)
print(f"\n特征值: {eigenvalues}")
print("特征向量:")
print(eigenvectors)
```

### 空间算法
```python
from scipy import spatial
import numpy as np
import matplotlib.pyplot as plt

# 空间点集
points = np.array([[0, 0], [1, 1], [2, 2], [3, 3], [0, 3], [1, 2]])
print(f"空间点集: {points}")

# 计算凸包
hull = spatial.ConvexHull(points)
print(f"\n凸包顶点索引: {hull.vertices}")
print(f"凸包体积: {hull.volume:.2f}")
print(f"凸包面积: {hull.area:.2f}")

# 最近邻搜索
tree = spatial.KDTree(points)
distances, indices = tree.query(points, k=2)  # 每个点找2个最近邻
print(f"\n最近邻距离: {distances}")
print(f"最近邻索引: {indices}")

# 可视化空间点与凸包
plt.figure(figsize=(10, 8))
plt.scatter(points[:,0], points[:,1], c='red', s=100, label='数据点', zorder=5)

# 绘制凸包
for simplex in hull.simplices:
    plt.plot(points[simplex, 0], points[simplex, 1], 'b-', linewidth=2, label='凸包' if simplex[0]==0 else "")

plt.title('空间点集与凸包')
plt.legend()
plt.grid(True, alpha=0.3)
plt.axis('equal')
plt.show()
```

## ⚠️ 使用注意事项

### ✅ 推荐做法：
- 正常导入 SciPy 模块：`from scipy import optimize, integrate, linalg`
- 使用标准的 SciPy 函数接口
- 通过 `print()` 输出数值结果
- 使用 `plt.show()` 显示图表

### ❌ 避免的操作：
- 不要手动使用 `base64` 编码
- 不要创建 `io.BytesIO` 对象
- 不要手动构建 JSON 输出格式

### 🔧 错误处理：
```python
try:
    from scipy import optimize
    result = optimize.minimize_scalar(lambda x: x**2, bounds=(0, 1))
    print(f"优化成功: {result.x}")
except ImportError:
    print("SciPy 优化模块不可用")
except Exception as e:
    print(f"优化失败: {e}")
```

**记住**：系统会自动处理所有输出格式，您只需要专注于科学计算逻辑！
