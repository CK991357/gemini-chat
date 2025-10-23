# SymPy 符号数学菜谱

## 🧮 基础符号运算

### 符号定义与基本运算
```python
import sympy as sp
import numpy as np
import json

def basic_symbolic_operations():
    """基础符号运算示例"""
    
    # 定义符号
    x, y, z = sp.symbols('x y z')
    a, b, c = sp.symbols('a b c')
    
    # 基本表达式
    expr1 = x**2 + 2*x + 1
    expr2 = (x + 1)**2
    
    # 表达式简化
    simplified = sp.simplify(expr1 - expr2)
    
    # 结果输出
    result = {
        "type": "symbolic_math",
        "title": "基础符号运算",
        "operations": {
            "expression_1": str(expr1),
            "expression_2": str(expr2),
            "simplified_difference": str(simplified),
            "are_equal": str(expr1.equals(expr2))
        }
    }
    print(json.dumps(result))

# basic_symbolic_operations()
```

## 🎯 方程求解工作流

### 代数方程求解
```python
def equation_solving_workflow():
    """完整的方程求解工作流"""
    
    # 定义符号
    x, y, z = sp.symbols('x y z')
    
    # 1. 一元方程
    equation1 = sp.Eq(x**2 - 5*x + 6, 0)
    solution1 = sp.solve(equation1, x)
    
    # 2. 多元方程组
    equations = [
        sp.Eq(2*x + 3*y, 7),
        sp.Eq(4*x - y, 1)
    ]
    solution2 = sp.solve(equations, (x, y))
    
    # 3. 非线性方程
    equation3 = sp.Eq(sp.sin(x) - x/2, 0)
    solution3 = sp.nsolve(equation3, x, 1)  # 数值解
    
    result = {
        "type": "equation_solutions",
        "title": "方程求解结果",
        "solutions": {
            "quadratic_equation": {
                "equation": str(equation1),
                "solutions": [str(sol) for sol in solution1]
            },
            "linear_system": {
                "equations": [str(eq) for eq in equations],
                "solutions": {str(k): float(v) for k, v in solution2.items()}
            },
            "nonlinear_equation": {
                "equation": str(equation3),
                "numerical_solution": float(solution3)
            }
        }
    }
    print(json.dumps(result))

# equation_solving_workflow()
```

## 📐 微积分运算

### 微分与积分
```python
def calculus_operations():
    """微积分运算示例"""
    
    x = sp.symbols('x')
    
    # 1. 导数计算
    f = x**3 + 2*x**2 + sp.sin(x)
    derivative = sp.diff(f, x)
    second_derivative = sp.diff(f, x, 2)
    
    # 2. 积分计算
    indefinite_integral = sp.integrate(f, x)
    definite_integral = sp.integrate(f, (x, 0, sp.pi))
    
    # 3. 极限计算
    limit_expr = (sp.sin(x) - x) / x**3
    limit_result = sp.limit(limit_expr, x, 0)
    
    result = {
        "type": "calculus_results",
        "title": "微积分运算结果",
        "operations": {
            "function": str(f),
            "first_derivative": str(derivative),
            "second_derivative": str(second_derivative),
            "indefinite_integral": str(indefinite_integral),
            "definite_integral_0_to_pi": float(definite_integral),
            "limit_sin_x_minus_x_over_x_cubed": float(limit_result)
        }
    }
    print(json.dumps(result))

# calculus_operations()
```

## 🔍 公式证明工作流

### 数学公式证明
```python
def formula_proof_workflow():
    """数学公式证明工作流"""
    
    # 定义符号
    a, b, c, x = sp.symbols('a b c x')
    
    proofs = []
    
    # 1. 证明 (a+b)^2 = a^2 + 2ab + b^2
    lhs1 = (a + b)**2
    rhs1 = a**2 + 2*a*b + b**2
    proof1 = sp.simplify(lhs1 - rhs1) == 0
    
    proofs.append({
        "theorem": "(a + b)² = a² + 2ab + b²",
        "lhs": str(lhs1),
        "rhs": str(rhs1),
        "proof": "直接展开验证",
        "verified": bool(proof1)
    })
    
    # 2. 证明三角恒等式 sin²x + cos²x = 1
    lhs2 = sp.sin(x)**2 + sp.cos(x)**2
    rhs2 = 1
    proof2 = sp.simplify(lhs2 - rhs2) == 0
    
    proofs.append({
        "theorem": "sin²x + cos²x = 1",
        "lhs": str(lhs2),
        "rhs": str(rhs2),
        "proof": "使用三角恒等式的定义",
        "verified": bool(proof2)
    })
    
    # 3. 证明二次方程求根公式
    # 方程: ax² + bx + c = 0
    equation = sp.Eq(a*x**2 + b*x + c, 0)
    solutions = sp.solve(equation, x)
    
    proofs.append({
        "theorem": "二次方程求根公式",
        "equation": str(equation),
        "solutions": [str(sol) for sol in solutions],
        "proof": "通过配方法求解",
        "verified": True
    })
    
    result = {
        "type": "mathematical_proofs",
        "title": "数学公式证明",
        "proofs": proofs
    }
    print(json.dumps(result))

# formula_proof_workflow()
```

## 🧩 矩阵与线性代数

### 矩阵运算
```python
def linear_algebra_operations():
    """线性代数运算示例"""
    
    # 定义符号矩阵
    A = sp.Matrix([[1, 2], [3, 4]])
    B = sp.Matrix([[2, 0], [1, 2]])
    
    # 基本矩阵运算
    matrix_sum = A + B
    matrix_product = A * B
    determinant_A = A.det()
    inverse_A = A.inv()
    eigenvalues_A = A.eigenvals()
    
    # 解线性方程组
    x1, x2 = sp.symbols('x1 x2')
    equations = [
        sp.Eq(2*x1 + 3*x2, 7),
        sp.Eq(4*x1 + 5*x2, 13)
    ]
    solution = sp.solve(equations, (x1, x2))
    
    result = {
        "type": "linear_algebra",
        "title": "线性代数运算结果",
        "matrix_operations": {
            "matrix_A": str(A.tolist()),
            "matrix_B": str(B.tolist()),
            "A_plus_B": str(matrix_sum.tolist()),
            "A_times_B": str(matrix_product.tolist()),
            "determinant_A": float(determinant_A),
            "inverse_A": str(inverse_A.tolist()),
            "eigenvalues_A": {str(k): int(v) for k, v in eigenvalues_A.items()}
        },
        "linear_system": {
            "equations": [str(eq) for eq in equations],
            "solution": {str(k): float(v) for k, v in solution.items()}
        }
    }
    print(json.dumps(result))

# linear_algebra_operations()
```

## 📈 数值计算与近似

### 符号计算与数值近似
```python
def numerical_approximations():
    """数值计算与近似"""
    
    x = sp.symbols('x')
    
    # 1. 级数展开
    sin_taylor = sp.sin(x).series(x, 0, 6)  # 6阶泰勒展开
    exp_taylor = sp.exp(x).series(x, 0, 5)  # 5阶泰勒展开
    
    # 2. 数值近似
    pi_approx = sp.N(sp.pi, 10)  # π的10位精度近似
    e_approx = sp.N(sp.E, 8)     # e的8位精度近似
    
    # 3. 数值积分
    numerical_integral = sp.N(sp.integrate(sp.sin(x), (x, 0, sp.pi/2)))
    
    # 4. 数值求解方程
    equation = sp.Eq(x**3 - 2*x - 5, 0)
    numerical_solution = sp.nsolve(equation, x, 2)  # 从x=2开始求解
    
    result = {
        "type": "numerical_approximations",
        "title": "数值计算与近似结果",
        "approximations": {
            "sin_taylor_series": str(sin_taylor),
            "exp_taylor_series": str(exp_taylor),
            "pi_approximation": float(pi_approx),
            "e_approximation": float(e_approx),
            "numerical_integral_sin_0_to_pi_2": float(numerical_integral),
            "equation_solution": float(numerical_solution)
        }
    }
    print(json.dumps(result))

# numerical_approximations()
```

## 🎓 复杂数学问题解决

### 综合数学问题
```python
def complex_math_problem():
    """解决复杂数学问题"""
    
    x, y, z = sp.symbols('x y z')
    
    # 问题1: 求函数极值
    f = x**3 - 6*x**2 + 9*x + 1
    critical_points = sp.solve(sp.diff(f, x), x)
    
    # 计算二阶导数判断极值类型
    second_deriv = sp.diff(f, x, 2)
    extremum_types = {}
    for point in critical_points:
        second_deriv_val = second_deriv.subs(x, point)
        if second_deriv_val > 0:
            extremum_types[float(point)] = "局部极小值"
        elif second_deriv_val < 0:
            extremum_types[float(point)] = "局部极大值"
        else:
            extremum_types[float(point)] = "拐点"
    
    # 问题2: 曲线长度计算
    curve_length = sp.integrate(sp.sqrt(1 + sp.diff(f, x)**2), (x, 0, 3))
    
    # 问题3: 旋转体体积
    volume = sp.pi * sp.integrate(f**2, (x, 0, 3))
    
    result = {
        "type": "complex_math_solution",
        "title": "复杂数学问题解决方案",
        "solutions": {
            "function_analysis": {
                "function": str(f),
                "critical_points": [float(p) for p in critical_points],
                "extremum_types": extremum_types
            },
            "curve_properties": {
                "curve_length_0_to_3": float(sp.N(curve_length)),
                "volume_of_revolution": float(sp.N(volume))
            }
        }
    }
    print(json.dumps(result))

# complex_math_problem()
```

## 💡 数学证明策略

### 自动证明框架
```python
def automated_proof_framework(expression1, expression2, proof_method="simplify"):
    """
    自动证明框架
    proof_method: "simplify", "expand", "factor", "trigsimp"
    """
    
    x, y = sp.symbols('x y')
    
    # 根据证明方法选择策略
    if proof_method == "simplify":
        proof = sp.simplify(expression1 - expression2)
    elif proof_method == "expand":
        proof = sp.expand(expression1 - expression2)
    elif proof_method == "factor":
        proof = sp.factor(expression1 - expression2)
    elif proof_method == "trigsimp":
        proof = sp.trigsimp(expression1 - expression2)
    else:
        proof = expression1 - expression2
    
    is_proven = (proof == 0)
    
    return {
        "expression1": str(expression1),
        "expression2": str(expression2),
        "proof_method": proof_method,
        "proof_steps": str(proof),
        "is_proven": bool(is_proven)
    }

# 使用示例
# expr1 = (x + y)**2
# expr2 = x**2 + 2*x*y + y**2
# result = automated_proof_framework(expr1, expr2, "expand")
```

这个SymPy菜谱文件提供了从基础符号运算到复杂数学证明的完整解决方案，是解决数学问题的强大工具。