# SymPy 符号数学指南 (v2.2)

## 🎯 工具概述
**功能**：符号数学计算，包括方程求解、微积分、代数运算等
**输出原则**：直接打印结果，系统自动处理输出格式

## 🧮 基础符号运算

### 符号定义与基本操作
```python
import sympy as sp

# 定义符号变量
x, y, z = sp.symbols('x y z')
a, b, c = sp.symbols('a b c')

# 基本表达式操作
expr1 = x**2 + 2*x + 1
expr2 = (x + 1)**2

print("=== 基础符号运算 ===")
print(f"表达式1: {expr1}")
print(f"表达式2: {expr2}")
print(f"表达式1展开: {sp.expand(expr1)}")
print(f"表达式2因式分解: {sp.factor(expr2)}")
print(f"两个表达式是否相等: {expr1.equals(expr2)}")

# 表达式简化
complex_expr = (x**2 - 1)/(x - 1)
simplified = sp.simplify(complex_expr)
print(f"复杂表达式: {complex_expr}")
print(f"简化后: {simplified}")
```

## 🎯 方程求解

### 代数方程求解
```python
import sympy as sp

x, y, z = sp.symbols('x y z')

print("=== 代数方程求解 ===")

# 一元二次方程
eq1 = sp.Eq(x**2 - 5*x + 6, 0)
solutions1 = sp.solve(eq1, x)
print(f"方程: {eq1}")
print(f"解: {solutions1}")

# 线性方程组
eq2 = sp.Eq(2*x + 3*y, 7)
eq3 = sp.Eq(4*x - y, 1)
solutions2 = sp.solve([eq2, eq3], (x, y))
print(f"\n方程组:")
print(f"  {eq2}")
print(f"  {eq3}")
print(f"解: {solutions2}")

# 非线性方程数值解
eq4 = sp.Eq(sp.sin(x) - x/2, 0)
solution4 = sp.nsolve(eq4, x, 1)  # 从x=1开始数值求解
print(f"\n非线性方程: {eq4}")
print(f"数值解: {solution4}")
```

## 📐 微积分运算

### 微分计算
```python
import sympy as sp

x = sp.symbols('x')

print("=== 微分计算 ===")

# 定义函数
f = x**3 + 2*x**2 + sp.sin(x)
print(f"函数: f(x) = {f}")

# 一阶导数
f_prime = sp.diff(f, x)
print(f"一阶导数: f'(x) = {f_prime}")

# 二阶导数
f_double_prime = sp.diff(f, x, 2)
print(f"二阶导数: f''(x) = {f_double_prime}")

# 偏导数（多变量）
y = sp.symbols('y')
g = x**2 * y + sp.sin(x*y)
g_x = sp.diff(g, x)
g_y = sp.diff(g, y)
print(f"\n多变量函数: g(x,y) = {g}")
print(f"对x偏导: ∂g/∂x = {g_x}")
print(f"对y偏导: ∂g/∂y = {g_y}")
```

### 积分计算
```python
import sympy as sp

x = sp.symbols('x')

print("=== 积分计算 ===")

# 不定积分
f = x**2 + sp.sin(x)
indefinite = sp.integrate(f, x)
print(f"函数: f(x) = {f}")
print(f"不定积分: ∫f(x)dx = {indefinite} + C")

# 定积分
definite = sp.integrate(f, (x, 0, sp.pi))
print(f"定积分 [0,π]: ∫₀^π f(x)dx = {definite}")
print(f"数值结果: {definite.evalf()}")

# 多重积分
y = sp.symbols('y')
double_int = sp.integrate(x*y, (x, 0, 1), (y, 0, 2))
print(f"\n二重积分: ∫₀¹∫₀² xy dy dx = {double_int}")
```

### 极限计算
```python
import sympy as sp

x = sp.symbols('x')

print("=== 极限计算 ===")

# 基本极限
limit1 = sp.limit(sp.sin(x)/x, x, 0)
print(f"lim(x→0) sin(x)/x = {limit1}")

# 无穷极限
limit2 = sp.limit(1/x, x, 0, '+')  # 从正方向逼近
limit3 = sp.limit(1/x, x, 0, '-')  # 从负方向逼近
print(f"lim(x→0⁺) 1/x = {limit2}")
print(f"lim(x→0⁻) 1/x = {limit3}")

# 复杂极限
limit4 = sp.limit((1 + 1/x)**x, x, sp.oo)
print(f"lim(x→∞) (1 + 1/x)ˣ = {limit4}")
```

## 🔍 数学证明与恒等式

### 代数恒等式验证
```python
import sympy as sp

a, b, x = sp.symbols('a b x')

print("=== 数学恒等式验证 ===")

# 验证 (a+b)² = a² + 2ab + b²
lhs1 = (a + b)**2
rhs1 = a**2 + 2*a*b + b**2
identity1 = sp.simplify(lhs1 - rhs1) == 0
print(f"(a+b)² = a² + 2ab + b²: {identity1}")

# 验证三角恒等式 sin²x + cos²x = 1
lhs2 = sp.sin(x)**2 + sp.cos(x)**2
rhs2 = 1
identity2 = sp.simplify(lhs2 - rhs2) == 0
print(f"sin²x + cos²x = 1: {identity2}")

# 验证欧拉公式
theta = sp.symbols('theta')
euler_lhs = sp.exp(sp.I * theta)
euler_rhs = sp.cos(theta) + sp.I * sp.sin(theta)
euler_identity = sp.simplify(euler_lhs - euler_rhs) == 0
print(f"e^(iθ) = cosθ + i sinθ: {euler_identity}")
```

## 🧩 线性代数

### 矩阵运算
```python
import sympy as sp

print("=== 矩阵运算 ===")

# 定义符号矩阵
A = sp.Matrix([[1, 2], [3, 4]])
B = sp.Matrix([[2, 0], [1, 2]])

print(f"矩阵 A:\n{A}")
print(f"矩阵 B:\n{B}")

# 基本运算
print(f"\n矩阵加法 A+B:\n{A + B}")
print(f"矩阵乘法 A×B:\n{A * B}")
print(f"A的行列式: {A.det()}")
print(f"A的逆矩阵:\n{A.inv()}")

# 特征值和特征向量
eigenvals = A.eigenvals()
eigenvects = A.eigenvects()
print(f"\nA的特征值: {eigenvals}")
print(f"A的特征向量: {eigenvects}")

# 解线性方程组
x1, x2 = sp.symbols('x1 x2')
eq1 = sp.Eq(2*x1 + 3*x2, 7)
eq2 = sp.Eq(4*x1 + 5*x2, 13)
solution = sp.solve([eq1, eq2], (x1, x2))
print(f"\n方程组:")
print(f"  {eq1}")
print(f"  {eq2}")
print(f"解: {solution}")
```

## 📈 级数展开与数值计算

### 泰勒级数展开
```python
import sympy as sp

x = sp.symbols('x')

print("=== 级数展开 ===")

# 常用函数的泰勒展开
sin_series = sp.sin(x).series(x, 0, 6)  # 在0处展开到6阶
cos_series = sp.cos(x).series(x, 0, 6)
exp_series = sp.exp(x).series(x, 0, 5)

print(f"sin(x)的泰勒展开: {sin_series}")
print(f"cos(x)的泰勒展开: {cos_series}")
print(f"e^x的泰勒展开: {exp_series}")

# 数值近似
print(f"\n数值近似:")
print(f"π ≈ {sp.N(sp.pi, 10)}")  # 10位精度
print(f"e ≈ {sp.N(sp.E, 8)}")    # 8位精度
print(f"√2 ≈ {sp.N(sp.sqrt(2), 6)}")

# 符号表达式的数值计算
expr = sp.integrate(sp.sin(x), (x, 0, sp.pi/2))
numerical_result = sp.N(expr)
print(f"\n符号积分: ∫₀^(π/2) sin(x) dx = {expr}")
print(f"数值结果: {numerical_result}")
```

## 🎓 复杂数学问题

### 函数分析与极值
```python
import sympy as sp

x = sp.symbols('x')

print("=== 函数分析与极值 ===")

# 定义函数
f = x**3 - 6*x**2 + 9*x + 1
print(f"函数: f(x) = {f}")

# 求导找临界点
f_prime = sp.diff(f, x)
critical_points = sp.solve(f_prime, x)
print(f"一阶导数: f'(x) = {f_prime}")
print(f"临界点: {critical_points}")

# 二阶导数测试
f_double_prime = sp.diff(f, x, 2)
for point in critical_points:
    second_deriv_val = f_double_prime.subs(x, point)
    if second_deriv_val > 0:
        extremum_type = "局部极小值"
    elif second_deriv_val < 0:
        extremum_type = "局部极大值"
    else:
        extremum_type = "需要进一步分析"
    print(f"点 x = {point}: {extremum_type}")

# 函数值
for point in critical_points:
    func_val = f.subs(x, point)
    print(f"f({point}) = {func_val}")
```

### 曲线性质分析
```python
import sympy as sp

x = sp.symbols('x')

print("=== 曲线性质分析 ===")

f = x**2 * sp.sin(x)

# 曲线长度（弧长）
curve_length = sp.integrate(sp.sqrt(1 + sp.diff(f, x)**2), (x, 0, sp.pi))
print(f"函数: f(x) = {f}")
print(f"曲线在 [0,π] 上的长度: {sp.N(curve_length)}")

# 旋转体体积
volume = sp.pi * sp.integrate(f**2, (x, 0, sp.pi))
print(f"曲线绕x轴旋转的体积: {sp.N(volume)}")

# 曲率
f_prime = sp.diff(f, x)
f_double_prime = sp.diff(f, x, 2)
curvature = f_double_prime / (1 + f_prime**2)**(3/2)
print(f"曲率公式: κ(x) = {curvature}")
```

## 💡 实用工具函数

### 自动验证等式
```python
import sympy as sp

def verify_identity(expr1, expr2, method="simplify"):
    """
    验证两个表达式是否恒等
    method: "simplify", "expand", "factor", "trigsimp"
    """
    if method == "simplify":
        difference = sp.simplify(expr1 - expr2)
    elif method == "expand":
        difference = sp.expand(expr1 - expr2)
    elif method == "factor":
        difference = sp.factor(expr1 - expr2)
    elif method == "trigsimp":
        difference = sp.trigsimp(expr1 - expr2)
    else:
        difference = expr1 - expr2
    
    is_identity = (difference == 0)
    
    print(f"表达式1: {expr1}")
    print(f"表达式2: {expr2}")
    print(f"验证方法: {method}")
    print(f"是否恒等: {is_identity}")
    
    return is_identity

# 使用示例
x, y = sp.symbols('x y')
verify_identity((x + y)**2, x**2 + 2*x*y + y**2, "expand")
```

## ⚠️ 使用注意事项

### ✅ 推荐做法：
- 正常导入：`import sympy as sp`
- 使用标准的 SymPy 函数和语法
- 直接使用 `print()` 输出结果
- 对于复杂表达式，使用 `sp.N()` 获取数值结果

### ❌ 避免的操作：
- 不要手动构建 JSON 输出
- 不要使用复杂的自定义输出格式
- 不要混合使用 SymPy 和数值计算库（除非必要）

### 🔧 错误处理：
```python
try:
    import sympy as sp
    x = sp.symbols('x')
    result = sp.solve(x**2 - 1, x)
    print(f"方程解: {result}")
except ImportError:
    print("SymPy 不可用")
except Exception as e:
    print(f"计算错误: {e}")
```

**记住**：系统会自动处理所有输出格式，您只需要专注于符号数学计算！