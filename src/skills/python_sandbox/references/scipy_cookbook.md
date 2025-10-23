# SciPy 科学计算菜谱

## 🔧 SciPy 核心模块概览

SciPy 是基于 NumPy 的科学计算库，提供以下核心功能：
- **优化算法** (`scipy.optimize`) - 函数最小化、方程求解
- **积分计算** (`scipy.integrate`) - 数值积分、微分方程
- **插值方法** (`scipy.interpolate`) - 数据插值、曲线拟合
- **信号处理** (`scipy.signal`) - 滤波器、频谱分析
- **线性代数** (`scipy.linalg`) - 矩阵运算、线性系统
- **统计函数** (`scipy.stats`) - 概率分布、统计检验
- **空间算法** (`scipy.spatial`) - 空间数据、距离计算

## 🎯 优化与方程求解

### 函数优化
```python
import numpy as np
from scipy import optimize
import matplotlib.pyplot as plt
import io
import base64
import json

def optimization_examples():
    """优化问题求解示例"""
    
    results = {}
    
    # 1. 单变量函数最小化
    def single_variable_func(x):
        return (x - 3)**2 * np.sin(x) + x**2
    
    single_result = optimize.minimize_scalar(single_variable_func, bounds=(0, 10), method='bounded')
    results['single_variable'] = {
        'optimal_x': single_result.x,
        'optimal_value': single_result.fun,
        'success': single_result.success
    }
    
    # 2. 多变量函数最小化 (Rosenbrock函数)
    def rosenbrock(x):
        return sum(100.0 * (x[1:] - x[:-1]**2)**2 + (1 - x[:-1])**2)
    
    x0 = np.array([-1.2, 1.0, -1.5, 2.0])
    multi_result = optimize.minimize(rosenbrock, x0, method='BFGS')
    results['multivariable'] = {
        'initial_guess': x0.tolist(),
        'optimal_point': multi_result.x.tolist(),
        'optimal_value': multi_result.fun,
        'iterations': multi_result.nit
    }
    
    # 3. 约束优化
    def objective(x):
        return x[0]**2 + x[1]**2
    
    def constraint1(x):
        return x[0] + x[1] - 1  # x + y >= 1
    
    def constraint2(x):
        return x[0] - x[1] + 0.5  # x - y >= -0.5
    
    constraints = [
        {'type': 'ineq', 'fun': constraint1},
        {'type': 'ineq', 'fun': constraint2}
    ]
    
    bounds = [(0, None), (0, None)]
    constrained_result = optimize.minimize(objective, [0.5, 0.5], 
                                         method='SLSQP', bounds=bounds, 
                                         constraints=constraints)
    results['constrained_optimization'] = {
        'optimal_point': constrained_result.x.tolist(),
        'optimal_value': constrained_result.fun,
        'constraints_satisfied': constrained_result.success
    }
    
    # 4. 方程求解
    def equations(vars):
        x, y = vars
        eq1 = x**2 + y**2 - 1  # 单位圆
        eq2 = x - y - 0.5      # 直线
        return [eq1, eq2]
    
    root_result = optimize.root(equations, [1, 1])
    results['equation_solving'] = {
        'solution': root_result.x.tolist(),
        'residuals': root_result.fun.tolist(),
        'success': root_result.success
    }
    
    # 可视化优化结果
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # 单变量函数可视化
    x_plot = np.linspace(0, 10, 100)
    y_plot = single_variable_func(x_plot)
    axes[0,0].plot(x_plot, y_plot, label='f(x)')
    axes[0,0].axvline(single_result.x, color='red', linestyle='--', label=f'最优解 x={single_result.x:.3f}')
    axes[0,0].set_title('单变量函数优化')
    axes[0,0].legend()
    axes[0,0].grid(True, alpha=0.3)
    
    # Rosenbrock函数等高线
    x = np.linspace(-2, 2, 100)
    y = np.linspace(-1, 3, 100)
    X, Y = np.meshgrid(x, y)
    Z = np.zeros_like(X)
    for i in range(X.shape[0]):
        for j in range(X.shape[1]):
            Z[i,j] = rosenbrock([X[i,j], Y[i,j]])
    
    contour = axes[0,1].contour(X, Y, Z, levels=50)
    axes[0,1].clabel(contour, inline=True, fontsize=8)
    axes[0,1].plot(multi_result.x[0], multi_result.x[1], 'ro', markersize=8, label='最优解')
    axes[0,1].set_title('Rosenbrock函数优化')
    axes[0,1].legend()
    
    # 约束优化可视化
    x_const = np.linspace(0, 2, 100)
    y_const = np.linspace(0, 2, 100)
    X_const, Y_const = np.meshgrid(x_const, y_const)
    Z_const = objective([X_const, Y_const])
    
    axes[1,0].contourf(X_const, Y_const, Z_const, levels=20, alpha=0.6)
    axes[1,0].contour(X_const, Y_const, Z_const, levels=10, colors='black', alpha=0.4)
    
    # 绘制约束条件
    y_constraint1 = 1 - x_const  # x + y = 1
    y_constraint2 = x_const + 0.5  # x - y = -0.5
    axes[1,0].plot(x_const, y_constraint1, 'r-', linewidth=2, label='x + y = 1')
    axes[1,0].plot(x_const, y_constraint2, 'b-', linewidth=2, label='x - y = -0.5')
    axes[1,0].fill_between(x_const, np.maximum(y_constraint1, y_constraint2), 2, alpha=0.3, color='gray')
    
    axes[1,0].plot(constrained_result.x[0], constrained_result.x[1], 'go', markersize=10, label='最优解')
    axes[1,0].set_xlim(0, 2)
    axes[1,0].set_ylim(0, 2)
    axes[1,0].set_title('约束优化')
    axes[1,0].legend()
    
    # 方程求解可视化
    theta = np.linspace(0, 2*np.pi, 100)
    circle_x = np.cos(theta)
    circle_y = np.sin(theta)
    line_x = np.linspace(-1.5, 1.5, 100)
    line_y = line_x - 0.5
    
    axes[1,1].plot(circle_x, circle_y, 'b-', label='x² + y² = 1')
    axes[1,1].plot(line_x, line_y, 'r-', label='x - y = 0.5')
    axes[1,1].plot(root_result.x[0], root_result.x[1], 'go', markersize=8, label='交点')
    axes[1,1].set_xlim(-1.5, 1.5)
    axes[1,1].set_ylim(-1.5, 1.5)
    axes[1,1].set_title('方程求解')
    axes[1,1].legend()
    axes[1,1].grid(True, alpha=0.3)
    axes[1,1].set_aspect('equal')
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    final_result = {
        "type": "scipy_optimization",
        "title": "SciPy 优化与方程求解",
        "results": results,
        "chart_preview": chart_base64
    }
    print(json.dumps(final_result))

# optimization_examples()
```

## 📐 数值积分与微分方程

### 积分计算
```python
def integration_examples():
    """数值积分示例"""
    
    from scipy import integrate
    import numpy as np
    
    results = {}
    
    # 1. 定积分
    def func1(x):
        return np.exp(-x**2) * np.sin(x)
    
    integral1, error1 = integrate.quad(func1, 0, np.inf)
    results['definite_integral'] = {
        'integral_value': integral1,
        'estimated_error': error1,
        'function': 'e^(-x²) * sin(x) from 0 to ∞'
    }
    
    # 2. 二重积分
    def func2(x, y):
        return np.exp(-x**2 - y**2)
    
    integral2, error2 = integrate.dblquad(func2, -np.inf, np.inf, lambda x: -np.inf, lambda x: np.inf)
    results['double_integral'] = {
        'integral_value': integral2,
        'estimated_error': error2,
        'function': 'e^(-x²-y²) over entire plane'
    }
    
    # 3. 常微分方程求解
    def ode_system(t, y):
        """Lotka-Volterra 捕食者-被捕食者模型"""
        alpha, beta, delta, gamma = 1.0, 0.1, 0.075, 1.5
        prey, predator = y
        dprey_dt = alpha * prey - beta * prey * predator
        dpredator_dt = delta * prey * predator - gamma * predator
        return [dprey_dt, dpredator_dt]
    
    t_span = (0, 50)
    y0 = [10, 5]  # 初始种群数量
    t_eval = np.linspace(0, 50, 1000)
    
    solution = integrate.solve_ivp(ode_system, t_span, y0, t_eval=t_eval, method='RK45')
    results['ode_solution'] = {
        'time_points': len(solution.t),
        'final_prey': solution.y[0, -1],
        'final_predator': solution.y[1, -1],
        'success': solution.success
    }
    
    # 可视化结果
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    
    # 积分函数可视化
    x_plot = np.linspace(0, 3, 100)
    y_plot = func1(x_plot)
    axes[0].plot(x_plot, y_plot, 'b-', linewidth=2, label='被积函数')
    axes[0].fill_between(x_plot, y_plot, alpha=0.3)
    axes[0].set_xlabel('x')
    axes[0].set_ylabel('f(x)')
    axes[0].set_title('定积分: e^(-x²) * sin(x)')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    
    # 微分方程解可视化
    axes[1].plot(solution.t, solution.y[0], 'g-', label='被捕食者')
    axes[1].plot(solution.t, solution.y[1], 'r-', label='捕食者')
    axes[1].set_xlabel('时间')
    axes[1].set_ylabel('种群数量')
    axes[1].set_title('Lotka-Volterra 模型')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    final_result = {
        "type": "scipy_integration",
        "title": "SciPy 数值积分与微分方程",
        "results": results,
        "chart_preview": chart_base64
    }
    print(json.dumps(final_result))

# integration_examples()
```

## 📡 信号处理与频谱分析

### 信号处理
```python
def signal_processing_examples():
    """信号处理与频谱分析示例"""
    
    from scipy import signal
    from scipy.fft import fft, fftfreq
    import numpy as np
    import matplotlib.pyplot as plt
    
    results = {}
    
    # 1. 信号生成
    t = np.linspace(0, 1, 1000, endpoint=False)
    # 创建包含多个频率成分的信号
    original_signal = (np.sin(2 * np.pi * 5 * t) + 
                      0.5 * np.sin(2 * np.pi * 20 * t) + 
                      0.2 * np.sin(2 * np.pi * 50 * t))
    
    # 添加噪声
    noisy_signal = original_signal + 0.3 * np.random.normal(size=len(t))
    
    # 2. 滤波器设计
    # 低通滤波器，截止频率15Hz
    nyquist = 500  # 采样频率1000Hz，奈奎斯特频率500Hz
    cutoff = 15 / nyquist  # 归一化截止频率
    b, a = signal.butter(4, cutoff, btype='low')
    filtered_signal = signal.filtfilt(b, a, noisy_signal)
    
    # 3. 频谱分析
    fft_original = fft(original_signal)
    fft_noisy = fft(noisy_signal)
    fft_filtered = fft(filtered_signal)
    freqs = fftfreq(len(t), t[1] - t[0])
    
    # 找到主要频率成分
    positive_freq_idx = np.where(freqs > 0)
    original_peaks = []
    noisy_peaks = []
    filtered_peaks = []
    
    for i in range(3):  # 找前3个主要频率
        original_peak_idx = np.argmax(np.abs(fft_original[positive_freq_idx]))
        original_peak_freq = freqs[positive_freq_idx][original_peak_idx]
        original_peaks.append(original_peak_freq)
        
        noisy_peak_idx = np.argmax(np.abs(fft_noisy[positive_freq_idx]))
        noisy_peak_freq = freqs[positive_freq_idx][noisy_peak_idx]
        noisy_peaks.append(noisy_peak_freq)
        
        filtered_peak_idx = np.argmax(np.abs(fft_filtered[positive_freq_idx]))
        filtered_peak_freq = freqs[positive_freq_idx][filtered_peak_idx]
        filtered_peaks.append(filtered_peak_freq)
    
    results['signal_analysis'] = {
        'original_frequencies': original_peaks,
        'noisy_frequencies': noisy_peaks,
        'filtered_frequencies': filtered_peaks,
        'expected_frequencies': [5, 20, 50]
    }
    
    # 4. 谱图分析
    f, t_spec, Sxx = signal.spectrogram(original_signal, fs=1000, nperseg=100)
    
    results['spectrogram'] = {
        'frequency_bins': len(f),
        'time_segments': len(t_spec),
        'spectral_shape': Sxx.shape
    }
    
    # 可视化结果
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # 时域信号
    axes[0,0].plot(t, original_signal, 'b-', alpha=0.7, label='原始信号')
    axes[0,0].plot(t, noisy_signal, 'r-', alpha=0.5, label='带噪声信号')
    axes[0,0].plot(t, filtered_signal, 'g-', linewidth=2, label='滤波后信号')
    axes[0,0].set_xlabel('时间 (s)')
    axes[0,0].set_ylabel('幅度')
    axes[0,0].set_title('时域信号')
    axes[0,0].legend()
    axes[0,0].grid(True, alpha=0.3)
    
    # 频域分析
    axes[0,1].plot(freqs[positive_freq_idx], np.abs(fft_original[positive_freq_idx]), 'b-', label='原始频谱')
    axes[0,1].plot(freqs[positive_freq_idx], np.abs(fft_noisy[positive_freq_idx]), 'r-', alpha=0.5, label='噪声频谱')
    axes[0,1].plot(freqs[positive_freq_idx], np.abs(fft_filtered[positive_freq_idx]), 'g-', label='滤波频谱')
    axes[0,1].set_xlabel('频率 (Hz)')
    axes[0,1].set_ylabel('幅度')
    axes[0,1].set_title('频域分析')
    axes[0,1].legend()
    axes[0,1].grid(True, alpha=0.3)
    axes[0,1].set_xlim(0, 100)
    
    # 滤波器频率响应
    w, h = signal.freqz(b, a)
    axes[1,0].plot(w * nyquist / np.pi, 20 * np.log10(np.abs(h)), 'b-')
    axes[1,0].axvline(15, color='red', linestyle='--', label='截止频率 15Hz')
    axes[1,0].set_xlabel('频率 (Hz)')
    axes[1,0].set_ylabel('幅度 (dB)')
    axes[1,0].set_title('滤波器频率响应')
    axes[1,0].legend()
    axes[1,0].grid(True, alpha=0.3)
    
    # 谱图
    im = axes[1,1].pcolormesh(t_spec, f, 10 * np.log10(Sxx), shading='gouraud')
    plt.colorbar(im, ax=axes[1,1], label='功率谱密度 (dB)')
    axes[1,1].set_xlabel('时间 (s)')
    axes[1,1].set_ylabel('频率 (Hz)')
    axes[1,1].set_title('谱图分析')
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    final_result = {
        "type": "scipy_signal_processing",
        "title": "SciPy 信号处理与频谱分析",
        "results": results,
        "chart_preview": chart_base64
    }
    print(json.dumps(final_result))

# signal_processing_examples()
```

## 🧮 线性代数与空间算法

### 线性代数运算
```python
def linear_algebra_examples():
    """线性代数与空间算法示例"""
    
    from scipy import linalg, spatial
    import numpy as np
    
    results = {}
    
    # 1. 矩阵运算
    A = np.array([[4, 2, 1], [2, 5, 3], [1, 3, 6]])
    b = np.array([1, 2, 3])
    
    # 矩阵分解
    lu, piv = linalg.lu_factor(A)
    x_lu = linalg.lu_solve((lu, piv), b)
    
    # 特征值分解
    eigenvalues, eigenvectors = linalg.eig(A)
    
    # 矩阵求逆
    A_inv = linalg.inv(A)
    
    results['linear_algebra'] = {
        'matrix_shape': A.shape,
        'determinant': linalg.det(A),
        'condition_number': linalg.cond(A),
        'lu_solution': x_lu.tolist(),
        'eigenvalues': eigenvalues.tolist(),
        'matrix_invertible': not np.allclose(A_inv, 0)
    }
    
    # 2. 空间算法 - 距离计算
    points = np.array([[0, 0], [1, 1], [2, 2], [3, 3], [0, 3]])
    
    # 计算距离矩阵
    distance_matrix = spatial.distance_matrix(points, points)
    
    # 最近邻搜索
    tree = spatial.KDTree(points)
    distances, indices = tree.query(points, k=2)  # 每个点找2个最近邻（包括自身）
    
    # 凸包计算
    if len(points) >= 3:
        hull = spatial.ConvexHull(points)
        hull_volume = hull.volume
        hull_area = hull.area
    else:
        hull_volume = 0
        hull_area = 0
    
    results['spatial_algorithms'] = {
        'num_points': len(points),
        'distance_matrix_shape': distance_matrix.shape,
        'nearest_neighbors': indices.tolist(),
        'convex_hull_volume': hull_volume,
        'convex_hull_area': hull_area
    }
    
    # 3. 插值方法
    from scipy import interpolate
    
    x_known = np.linspace(0, 10, 10)
    y_known = np.sin(x_known) + 0.1 * np.random.normal(size=len(x_known))
    
    # 样条插值
    spline = interpolate.UnivariateSpline(x_known, y_known, s=0)
    x_fine = np.linspace(0, 10, 100)
    y_spline = spline(x_fine)
    
    # 线性插值
    linear_interp = interpolate.interp1d(x_known, y_known, kind='linear')
    y_linear = linear_interp(x_fine)
    
    results['interpolation'] = {
        'known_points': len(x_known),
        'interpolated_points': len(x_fine),
        'spline_accuracy': np.mean((y_spline - np.sin(x_fine))**2),
        'linear_accuracy': np.mean((y_linear - np.sin(x_fine))**2)
    }
    
    # 可视化结果
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # 矩阵特征向量可视化
    for i in range(min(3, len(eigenvalues))):
        axes[0,0].arrow(0, 0, eigenvectors[0,i].real, eigenvectors[1,i].real, 
                       head_width=0.1, head_length=0.1, fc='blue', ec='blue',
                       label=f'特征向量 {i+1}' if i == 0 else "")
    axes[0,0].set_xlim(-1, 1)
    axes[0,0].set_ylim(-1, 1)
    axes[0,0].set_title('矩阵特征向量')
    axes[0,0].legend()
    axes[0,0].grid(True, alpha=0.3)
    axes[0,0].set_aspect('equal')
    
    # 空间点与凸包
    axes[0,1].scatter(points[:,0], points[:,1], c='red', s=50, label='数据点')
    if len(points) >= 3:
        for simplex in hull.simplices:
            axes[0,1].plot(points[simplex, 0], points[simplex, 1], 'b-', linewidth=2)
    axes[0,1].set_title('空间点与凸包')
    axes[0,1].legend()
    axes[0,1].grid(True, alpha=0.3)
    axes[0,1].set_aspect('equal')
    
    # 插值比较
    axes[1,0].plot(x_known, y_known, 'ro', markersize=8, label='已知点')
    axes[1,0].plot(x_fine, np.sin(x_fine), 'k-', alpha=0.5, label='真实函数')
    axes[1,0].plot(x_fine, y_spline, 'b-', label='样条插值')
    axes[1,0].plot(x_fine, y_linear, 'g--', label='线性插值')
    axes[1,0].set_xlabel('x')
    axes[1,0].set_ylabel('y')
    axes[1,0].set_title('插值方法比较')
    axes[1,0].legend()
    axes[1,0].grid(True, alpha=0.3)
    
    # 距离矩阵热力图
    im = axes[1,1].imshow(distance_matrix, cmap='viridis', interpolation='nearest')
    plt.colorbar(im, ax=axes[1,1], label='距离')
    axes[1,1].set_title('点间距离矩阵')
    axes[1,1].set_xlabel('点索引')
    axes[1,1].set_ylabel('点索引')
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    final_result = {
        "type": "scipy_linear_algebra",
        "title": "SciPy 线性代数与空间算法",
        "results": results,
        "chart_preview": chart_base64
    }
    print(json.dumps(final_result))

# linear_algebra_examples()
```

这个 SciPy cookbook 文件提供了从基础科学计算到高级算法应用的完整指南，涵盖了优化、积分、信号处理、线性代数和空间算法等核心领域。