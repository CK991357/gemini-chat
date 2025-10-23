# 机器学习工作流指南

## 🎯 标准机器学习流程

### 完整模型训练模板
```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler, LabelEncoder
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64
import json

def standard_ml_workflow(X, y, problem_type='regression'):
    """标准机器学习工作流"""
    
    # 数据预处理
    if problem_type == 'classification':
        le = LabelEncoder()
        y = le.fit_transform(y)
    
    # 分割数据
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if problem_type == 'classification' else None
    )
    
    # 特征标准化
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # 选择模型
    if problem_type == 'regression':
        model = RandomForestRegressor(n_estimators=100, random_state=42)
    else:
        model = RandomForestClassifier(n_estimators=100, random_state=42)
    
    # 训练模型
    model.fit(X_train_scaled, y_train)
    
    # 预测
    y_pred = model.predict(X_test_scaled)
    
    # 评估指标
    if problem_type == 'regression':
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_test, y_pred)
        metrics = {'mse': mse, 'rmse': rmse, 'r2_score': r2}
    else:
        accuracy = accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, output_dict=True)
        metrics = {'accuracy': accuracy, 'classification_report': report}
    
    # 特征重要性
    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    return {
        'model': model,
        'metrics': metrics,
        'feature_importance': feature_importance,
        'X_test': X_test,
        'y_test': y_test,
        'y_pred': y_pred
    }
```

## 📊 回归分析工作流

```python
def regression_analysis_workflow():
    """完整的回归分析工作流"""
    
    # 生成示例数据
    np.random.seed(42)
    n_samples = 1000
    
    # 创建特征
    feature1 = np.random.normal(50, 15, n_samples)
    feature2 = np.random.normal(100, 25, n_samples)
    feature3 = np.random.normal(10, 3, n_samples)
    feature4 = np.random.normal(0, 1, n_samples)  # 噪声特征
    
    # 创建目标变量（与特征有复杂关系）
    target = (2.5 * feature1 + 1.8 * feature2 - 3.2 * feature3 + 
              0.5 * feature1 * feature3 + np.random.normal(0, 20, n_samples))
    
    df = pd.DataFrame({
        'feature1': feature1,
        'feature2': feature2,
        'feature3': feature3,
        'feature4': feature4,
        'target': target
    })
    
    # 准备数据
    X = df[['feature1', 'feature2', 'feature3', 'feature4']]
    y = df['target']
    
    # 执行标准工作流
    results = standard_ml_workflow(X, y, 'regression')
    
    # 可视化结果
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    
    # 1. 实际值 vs 预测值
    axes[0,0].scatter(results['y_test'], results['y_pred'], alpha=0.6)
    axes[0,0].plot([results['y_test'].min(), results['y_test'].max()], 
                  [results['y_test'].min(), results['y_test'].max()], 'r--', lw=2)
    axes[0,0].set_xlabel('实际值')
    axes[0,0].set_ylabel('预测值')
    axes[0,0].set_title(f'预测效果 (R² = {results["metrics"]["r2_score"]:.3f})')
    axes[0,0].grid(True, alpha=0.3)
    
    # 2. 残差分析
    residuals = results['y_test'] - results['y_pred']
    axes[0,1].scatter(results['y_pred'], residuals, alpha=0.6)
    axes[0,1].axhline(y=0, color='r', linestyle='--')
    axes[0,1].set_xlabel('预测值')
    axes[0,1].set_ylabel('残差')
    axes[0,1].set_title('残差分析')
    axes[0,1].grid(True, alpha=0.3)
    
    # 3. 特征重要性
    top_features = results['feature_importance'].head(10)
    sns.barplot(data=top_features, x='importance', y='feature', ax=axes[0,2])
    axes[0,2].set_title('特征重要性排名')
    
    # 4. 误差分布
    axes[1,0].hist(residuals, bins=30, alpha=0.7, edgecolor='black', density=True)
    axes[1,0].set_xlabel('残差')
    axes[1,0].set_ylabel('密度')
    axes[1,0].set_title('误差分布')
    axes[1,0].grid(True, alpha=0.3)
    
    # 5. 预测误差箱线图
    error_percentage = np.abs(residuals / results['y_test']) * 100
    axes[1,1].boxplot(error_percentage)
    axes[1,1].set_ylabel('相对误差 (%)')
    axes[1,1].set_title('预测相对误差分布')
    axes[1,1].grid(True, alpha=0.3)
    
    # 6. 学习曲线（简化版）
    train_sizes = np.linspace(0.1, 1.0, 10)
    train_scores = []
    test_scores = []
    
    for size in train_sizes:
        n_train = int(size * len(X))
        X_train_sub = X.iloc[:n_train]
        y_train_sub = y.iloc[:n_train]
        
        model = RandomForestRegressor(n_estimators=50, random_state=42)
        model.fit(X_train_sub, y_train_sub)
        
        train_score = model.score(X_train_sub, y_train_sub)
        test_score = model.score(results['X_test'], results['y_test'])
        
        train_scores.append(train_score)
        test_scores.append(test_score)
    
    axes[1,2].plot(train_sizes, train_scores, 'o-', label='训练得分')
    axes[1,2].plot(train_sizes, test_scores, 'o-', label='测试得分')
    axes[1,2].set_xlabel('训练样本比例')
    axes[1,2].set_ylabel('R²得分')
    axes[1,2].set_title('学习曲线')
    axes[1,2].legend()
    axes[1,2].grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    # 生成模型报告
    result = {
        "type": "ml_report",
        "title": "回归分析模型报告",
        "problem_type": "regression",
        "model_performance": results["metrics"],
        "feature_importance": results["feature_importance"].to_dict('records'),
        "training_details": {
            "training_samples": len(X) - len(results['X_test']),
            "test_samples": len(results['X_test']),
            "features_used": list(X.columns),
            "model_type": "RandomForestRegressor"
        },
        "chart_preview": chart_base64,
        "interpretation": {
            "r2_interpretation": "R²值表示模型解释的目标变量方差比例",
            "best_features": top_features['feature'].head(3).tolist(),
            "recommendations": "建议关注重要性最高的特征进行进一步分析"
        }
    }
    print(json.dumps(result))

# regression_analysis_workflow()
```

## 🔍 分类分析工作流

```python
def classification_analysis_workflow():
    """完整的分类分析工作流"""
    
    from sklearn.datasets import make_classification
    
    # 生成分类数据
    X, y = make_classification(
        n_samples=1000, 
        n_features=10,
        n_informative=6,
        n_redundant=2,
        n_classes=3,
        random_state=42
    )
    
    feature_names = [f'feature_{i}' for i in range(X.shape[1])]
    X_df = pd.DataFrame(X, columns=feature_names)
    
    # 执行标准工作流
    results = standard_ml_workflow(X_df, y, 'classification')
    
    # 可视化结果
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    
    # 1. 混淆矩阵
    from sklearn.metrics import confusion_matrix
    cm = confusion_matrix(results['y_test'], results['y_pred'])
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0,0])
    axes[0,0].set_xlabel('预测标签')
    axes[0,0].set_ylabel('真实标签')
    axes[0,0].set_title('混淆矩阵')
    
    # 2. 特征重要性
    top_features = results['feature_importance'].head(10)
    sns.barplot(data=top_features, x='importance', y='feature', ax=axes[0,1])
    axes[0,1].set_title('特征重要性排名')
    
    # 3. 类别分布
    unique, counts = np.unique(y, return_counts=True)
    axes[0,2].pie(counts, labels=[f'Class {cls}' for cls in unique], autopct='%1.1f%%')
    axes[0,2].set_title('类别分布')
    
    # 4. ROC曲线（多分类简化）
    from sklearn.metrics import roc_curve, auc
    from sklearn.preprocessing import label_binarize
    
    y_test_bin = label_binarize(results['y_test'], classes=[0, 1, 2])
    y_pred_bin = label_binarize(results['y_pred'], classes=[0, 1, 2])
    
    for i in range(3):
        fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_pred_bin[:, i])
        roc_auc = auc(fpr, tpr)
        axes[1,0].plot(fpr, tpr, label=f'Class {i} (AUC = {roc_auc:.2f})')
    
    axes[1,0].plot([0, 1], [0, 1], 'k--')
    axes[1,0].set_xlabel('假正率')
    axes[1,0].set_ylabel('真正率')
    axes[1,0].set_title('ROC曲线')
    axes[1,0].legend()
    axes[1,0].grid(True, alpha=0.3)
    
    # 5. 精确率-召回率曲线
    from sklearn.metrics import precision_recall_curve
    
    for i in range(3):
        precision, recall, _ = precision_recall_curve(y_test_bin[:, i], y_pred_bin[:, i])
        axes[1,1].plot(recall, precision, label=f'Class {i}')
    
    axes[1,1].set_xlabel('召回率')
    axes[1,1].set_ylabel('精确率')
    axes[1,1].set_title('精确率-召回率曲线')
    axes[1,1].legend()
    axes[1,1].grid(True, alpha=0.3)
    
    # 6. 分类报告热力图
    report_df = pd.DataFrame(results['metrics']['classification_report']).transpose()
    sns.heatmap(report_df.iloc[:-3, :-1], annot=True, cmap='YlOrRd', ax=axes[1,2])
    axes[1,2].set_title('分类指标热力图')
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    # 生成分类报告
    result = {
        "type": "ml_report", 
        "title": "分类分析模型报告",
        "problem_type": "classification",
        "model_performance": results["metrics"],
        "feature_importance": results["feature_importance"].to_dict('records'),
        "training_details": {
            "training_samples": len(X) - len(results['X_test']),
            "test_samples": len(results['X_test']),
            "n_classes": len(np.unique(y)),
            "model_type": "RandomForestClassifier"
        },
        "chart_preview": chart_base64
    }
    print(json.dumps(result))

# classification_analysis_workflow()
```

## 📈 StatsModels 统计建模

```python
def statistical_analysis_with_statsmodels():
    """使用 statsmodels 进行统计建模"""
    import statsmodels.api as sm
    import statsmodels.formula.api as smf
    from statsmodels.tsa.seasonal import seasonal_decompose
    from statsmodels.stats.outliers_influence import variance_inflation_factor
    
    # 创建示例数据
    np.random.seed(42)
    n_samples = 200
    
    data = pd.DataFrame({
        'x1': np.random.normal(0, 1, n_samples),
        'x2': np.random.normal(0, 1, n_samples),
        'x3': np.random.normal(0, 1, n_samples),
        'group': np.random.choice(['A', 'B', 'C'], n_samples)
    })
    
    # 生成目标变量
    data['y'] = 2 + 1.5 * data['x1'] + 0.8 * data['x2'] + np.random.normal(0, 0.5, n_samples)
    
    # 1. OLS 回归分析
    model = smf.ols('y ~ x1 + x2 + x3', data=data).fit()
    
    # 回归结果汇总
    regression_summary = {
        'rsquared': model.rsquared,
        'rsquared_adj': model.rsquared_adj,
        'f_statistic': model.fvalue,
        'f_pvalue': model.f_pvalue,
        'coefficients': model.params.to_dict(),
        'pvalues': model.pvalues.to_dict(),
        'confidence_intervals': model.conf_int().to_dict()
    }
    
    # 2. 残差分析
    residuals = model.resid
    jarque_bera = sm.stats.jarque_bera(residuals)
    durbin_watson = sm.stats.durbin_watson(residuals)
    
    diagnostic_tests = {
        'jarque_bera_statistic': jarque_bera[0],
        'jarque_bera_pvalue': jarque_bera[1],
        'durbin_watson': durbin_watson
    }
    
    # 3. 多重共线性检查
    X_with_const = sm.add_constant(data[['x1', 'x2', 'x3']])
    vif_data = pd.DataFrame()
    vif_data["feature"] = X_with_const.columns
    vif_data["VIF"] = [variance_inflation_factor(X_with_const.values, i) for i in range(X_with_const.shape[1])]
    
    # 4. ANOVA 方差分析
    anova_model = smf.ols('y ~ group', data=data).fit()
    anova_table = sm.stats.anova_lm(anova_model, typ=2)
    
    # 5. 时间序列分析（示例）
    dates = pd.date_range('2024-01-01', periods=100, freq='D')
    ts_data = pd.DataFrame({
        'date': dates,
        'value': np.random.randn(100).cumsum() + 100
    })
    ts_data.set_index('date', inplace=True)
    
    # 季节性分解
    try:
        decomposition = seasonal_decompose(ts_data['value'], model='additive', period=7)
        decomposition_success = True
    except:
        decomposition_success = False
    
    result = {
        "type": "statistical_analysis",
        "title": "StatsModels 统计建模分析",
        "regression_summary": regression_summary,
        "diagnostic_tests": diagnostic_tests,
        "multicollinearity_check": vif_data.to_dict('records'),
        "anova_analysis": {
            "f_statistic": anova_table['F']['group'],
            "p_value": anova_table['PR(>F)']['group']
        },
        "time_series_analysis": {
            "decomposition_performed": decomposition_success
        },
        "model_interpretation": {
            "significant_features": [var for var, pval in model.pvalues.items() if pval < 0.05 and var != 'Intercept'],
            "model_strength": "强模型" if model.rsquared > 0.7 else "中等模型" if model.rsquared > 0.5 else "弱模型"
        }
    }
    print(json.dumps(result))

# statistical_analysis_with_statsmodels()
```

## 🔧 科学计算与优化（SciPy）

```python
def scipy_scientific_computing():
    """使用 SciPy 进行科学计算"""
    from scipy import optimize, integrate, interpolate, stats
    from scipy.fft import fft, fftfreq
    import matplotlib.pyplot as plt
    import io
    import base64
    import json
    
    results = {}
    
    # 1. 优化问题 - 函数最小化
    def objective_function(x):
        return (x[0] - 2)**2 + (x[1] - 3)**2 + (x[0] * x[1] - 1)**2
    
    initial_guess = [0, 0]
    optimization_result = optimize.minimize(objective_function, initial_guess, method='BFGS')
    results['optimization'] = {
        'optimal_point': optimization_result.x.tolist(),
        'optimal_value': float(optimization_result.fun),
        'success': bool(optimization_result.success)
    }
    
    # 2. 数值积分
    def integrand(x):
        return np.exp(-x**2) * np.sin(x)
    
    integral_result, integral_error = integrate.quad(integrand, 0, np.inf)
    results['integration'] = {
        'integral_value': integral_result,
        'estimated_error': integral_error
    }
    
    # 3. 插值
    x_known = np.linspace(0, 10, 10)
    y_known = np.sin(x_known)
    interpolation_function = interpolate.interp1d(x_known, y_known, kind='cubic')
    x_new = 5.5
    y_interpolated = interpolation_function(x_new)
    results['interpolation'] = {
        'known_points': len(x_known),
        'interpolated_value_at_5.5': float(y_interpolated),
        'actual_sin_5.5': float(np.sin(5.5))
    }
    
    # 4. 统计检验
    sample1 = np.random.normal(0, 1, 100)
    sample2 = np.random.normal(0.5, 1, 100)
    
    # t检验
    t_stat, t_pvalue = stats.ttest_ind(sample1, sample2)
    
    # 正态性检验
    normality_stat, normality_pvalue = stats.normaltest(sample1)
    
    results['statistical_tests'] = {
        't_test': {
            't_statistic': t_stat,
            'p_value': t_pvalue,
            'significant_difference': t_pvalue < 0.05
        },
        'normality_test': {
            'statistic': normality_stat,
            'p_value': normality_pvalue,
            'is_normal': normality_pvalue > 0.05
        }
    }
    
    # 5. 信号处理 - 傅里叶变换
    t = np.linspace(0, 1, 1000)
    signal = np.sin(2 * np.pi * 5 * t) + 0.5 * np.sin(2 * np.pi * 20 * t)
    fft_result = fft(signal)
    freqs = fftfreq(len(t), t[1] - t[0])
    
    # 找到主要频率
    positive_freq_idx = np.where(freqs > 0)
    dominant_freq_idx = np.argmax(np.abs(fft_result[positive_freq_idx]))
    dominant_freq = freqs[positive_freq_idx][dominant_freq_idx]
    
    results['signal_processing'] = {
        'dominant_frequency': dominant_freq,
        'expected_frequencies': [5, 20]
    }
    
    # 可视化部分结果
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # 优化函数可视化
    x1 = np.linspace(-1, 5, 100)
    x2 = np.linspace(-1, 5, 100)
    X1, X2 = np.meshgrid(x1, x2)
    Z = objective_function([X1, X2])
    
    contour = axes[0,0].contour(X1, X2, Z, levels=20)
    axes[0,0].clabel(contour, inline=True, fontsize=8)
    axes[0,0].plot(optimization_result.x[0], optimization_result.x[1], 'ro', markersize=10)
    axes[0,0].set_title('函数优化')
    axes[0,0].set_xlabel('x1')
    axes[0,0].set_ylabel('x2')
    
    # 积分函数可视化
    x_int = np.linspace(0, 3, 100)
    y_int = integrand(x_int)
    axes[0,1].plot(x_int, y_int)
    axes[0,1].fill_between(x_int, y_int, alpha=0.3)
    axes[0,1].set_title('数值积分')
    axes[0,1].set_xlabel('x')
    axes[0,1].set_ylabel('f(x)')
    
    # 插值可视化
    x_fine = np.linspace(0, 10, 100)
    y_fine = interpolation_function(x_fine)
    axes[1,0].plot(x_known, y_known, 'o', label='已知点')
    axes[1,0].plot(x_fine, y_fine, '-', label='插值曲线')
    axes[1,0].set_title('插值分析')
    axes[1,0].legend()
    
    # 信号处理可视化
    axes[1,1].plot(t, signal)
    axes[1,1].set_title('信号分析')
    axes[1,1].set_xlabel('时间')
    axes[1,1].set_ylabel('振幅')
    
    plt.tight_layout()
    
    # 输出图表
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    final_result = {
        "type": "scientific_computing",
        "title": "SciPy 科学计算分析",
        "results": results,
        "chart_preview": chart_base64
    }
    print(json.dumps(final_result))

# scipy_scientific_computing()
```

## 🧪 模型评估与优化

### 交叉验证与超参数调优
```python
from sklearn.model_selection import GridSearchCV

def optimize_model(X, y, problem_type='regression'):
    """模型超参数优化"""
    
    if problem_type == 'regression':
        model = RandomForestRegressor(random_state=42)
        param_grid = {
            'n_estimators': [50, 100, 200],
            'max_depth': [None, 10, 20],
            'min_samples_split': [2, 5, 10]
        }
        scoring = 'r2'
    else:
        model = RandomForestClassifier(random_state=42)
        param_grid = {
            'n_estimators': [50, 100, 200],
            'max_depth': [None, 10, 20],
            'min_samples_split': [2, 5, 10]
        }
        scoring = 'accuracy'
    
    grid_search = GridSearchCV(model, param_grid, cv=5, scoring=scoring, n_jobs=-1)
    grid_search.fit(X, y)
    
    return {
        'best_params': grid_search.best_params_,
        'best_score': grid_search.best_score_,
        'best_estimator': grid_search.best_estimator_
    }
```

这个机器学习工作流指南现在包含了统计建模和科学计算的完整解决方案，支持从基础机器学习到高级统计分析的全流程处理。