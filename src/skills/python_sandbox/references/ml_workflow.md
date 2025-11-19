# 机器学习工作流指南 (v2.2)

## 🎯 工具概述
**功能**：机器学习模型训练、评估、统计分析和可视化
**输出原则**：直接打印结果，系统自动处理输出格式

## 📊 基础机器学习模板

### 数据准备与预处理
```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
import matplotlib.pyplot as plt
import seaborn as sns

def prepare_ml_data():
    """机器学习数据准备示例"""
    
    # 创建示例数据集
    np.random.seed(42)
    n_samples = 1000
    
    # 回归问题数据
    X_reg = np.random.normal(0, 1, (n_samples, 5))
    y_reg = 2 * X_reg[:, 0] + 1.5 * X_reg[:, 1] - X_reg[:, 2] + np.random.normal(0, 0.5, n_samples)
    
    # 分类问题数据
    X_clf = np.random.normal(0, 1, (n_samples, 4))
    y_clf = (X_clf[:, 0] + X_clf[:, 1] > 0).astype(int)
    
    print("=== 数据准备完成 ===")
    print(f"样本数量: {n_samples}")
    print(f"回归特征维度: {X_reg.shape[1]}")
    print(f"分类特征维度: {X_clf.shape[1]}")
    print(f"分类标签分布: {np.unique(y_clf, return_counts=True)}")
    
    return X_reg, y_reg, X_clf, y_clf

# 使用示例
# X_reg, y_reg, X_clf, y_clf = prepare_ml_data()
```

### 标准机器学习工作流
```python
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, classification_report
from sklearn.model_selection import cross_val_score

def standard_ml_pipeline(X, y, problem_type='regression'):
    """标准机器学习流程"""
    
    print(f"=== 开始 {problem_type} 模型训练 ===")
    
    # 数据分割
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42,
        stratify=y if problem_type == 'classification' else None
    )
    
    print(f"训练集大小: {X_train.shape}")
    print(f"测试集大小: {X_test.shape}")
    
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
    
    # 模型评估
    if problem_type == 'regression':
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_test, y_pred)
        
        print(f"回归模型性能:")
        print(f"  MSE: {mse:.4f}")
        print(f"  RMSE: {rmse:.4f}")
        print(f"  R²: {r2:.4f}")
        
        metrics = {'mse': mse, 'rmse': rmse, 'r2': r2}
    else:
        accuracy = accuracy_score(y_test, y_pred)
        print(f"分类模型性能:")
        print(f"  准确率: {accuracy:.4f}")
        print("\n详细分类报告:")
        print(classification_report(y_test, y_pred))
        
        metrics = {'accuracy': accuracy}
    
    # 交叉验证
    cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=5, 
                               scoring='r2' if problem_type == 'regression' else 'accuracy')
    print(f"交叉验证平均得分: {cv_scores.mean():.4f} (±{cv_scores.std():.4f})")
    
    return {
        'model': model,
        'metrics': metrics,
        'X_test': X_test,
        'y_test': y_test,
        'y_pred': y_pred,
        'cv_scores': cv_scores
    }

# 使用示例
# X_reg, y_reg, X_clf, y_clf = prepare_ml_data()
# regression_results = standard_ml_pipeline(X_reg, y_reg, 'regression')
# classification_results = standard_ml_pipeline(X_clf, y_clf, 'classification')
```

## 📈 回归分析完整工作流

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score

def complete_regression_analysis():
    """完整的回归分析工作流"""
    
    print("=== 开始回归分析 ===")
    
    # 1. 数据生成
    np.random.seed(42)
    n_samples = 500
    
    # 创建有意义的特征
    feature1 = np.random.normal(50, 15, n_samples)  # 年龄
    feature2 = np.random.normal(100, 25, n_samples) # 收入
    feature3 = np.random.normal(10, 3, n_samples)   # 教育年限
    feature4 = np.random.normal(0, 1, n_samples)    # 噪声特征
    
    # 创建目标变量（模拟房价）
    target = (50 * feature1 + 80 * feature2 + 5000 * feature3 + 
              10 * feature1 * feature3 + np.random.normal(0, 10000, n_samples))
    
    df = pd.DataFrame({
        '年龄': feature1,
        '收入': feature2,
        '教育年限': feature3,
        '噪声特征': feature4,
        '房价': target
    })
    
    print("数据基本信息:")
    print(f"数据集形状: {df.shape}")
    print(f"特征列表: {list(df.columns[:-1])}")
    print(f"目标变量: {df.columns[-1]}")
    
    # 2. 数据探索
    print("\n=== 数据探索 ===")
    print("数值特征统计:")
    print(df.describe())
    
    # 相关性分析
    correlation = df.corr()['房价'].sort_values(ascending=False)
    print("\n特征与目标变量相关性:")
    for feature, corr in correlation.items():
        if feature != '房价':
            print(f"  {feature}: {corr:.3f}")
    
    # 3. 模型训练
    X = df.drop('房价', axis=1)
    y = df['房价']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    
    # 4. 模型评估
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_test, y_pred)
    
    print(f"\n=== 模型性能 ===")
    print(f"均方误差 (MSE): {mse:,.2f}")
    print(f"均方根误差 (RMSE): {rmse:,.2f}")
    print(f"决定系数 (R²): {r2:.4f}")
    
    # 5. 特征重要性
    feature_importance = pd.DataFrame({
        '特征': X.columns,
        '重要性': model.feature_importances_
    }).sort_values('重要性', ascending=False)
    
    print(f"\n=== 特征重要性 ===")
    for _, row in feature_importance.iterrows():
        print(f"  {row['特征']}: {row['重要性']:.4f}")
    
    # 6. 可视化分析
    plt.figure(figsize=(15, 10))
    
    # 实际值 vs 预测值
    plt.subplot(2, 3, 1)
    plt.scatter(y_test, y_pred, alpha=0.6)
    plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
    plt.xlabel('实际值')
    plt.ylabel('预测值')
    plt.title(f'预测效果 (R² = {r2:.3f})')
    plt.grid(True, alpha=0.3)
    
    # 残差分析
    plt.subplot(2, 3, 2)
    residuals = y_test - y_pred
    plt.scatter(y_pred, residuals, alpha=0.6)
    plt.axhline(y=0, color='r', linestyle='--')
    plt.xlabel('预测值')
    plt.ylabel('残差')
    plt.title('残差分析')
    plt.grid(True, alpha=0.3)
    
    # 特征重要性可视化
    plt.subplot(2, 3, 3)
    top_features = feature_importance.head(5)
    plt.barh(top_features['特征'], top_features['重要性'])
    plt.xlabel('重要性')
    plt.title('Top 5 特征重要性')
    plt.gca().invert_yaxis()
    
    # 误差分布
    plt.subplot(2, 3, 4)
    plt.hist(residuals, bins=30, alpha=0.7, edgecolor='black')
    plt.xlabel('残差')
    plt.ylabel('频数')
    plt.title('误差分布')
    plt.grid(True, alpha=0.3)
    
    # 相对误差
    plt.subplot(2, 3, 5)
    relative_error = np.abs(residuals / y_test) * 100
    plt.hist(relative_error, bins=30, alpha=0.7, edgecolor='black')
    plt.xlabel('相对误差 (%)')
    plt.ylabel('频数')
    plt.title('相对误差分布')
    plt.grid(True, alpha=0.3)
    
    # 预测误差箱线图
    plt.subplot(2, 3, 6)
    plt.boxplot(relative_error)
    plt.ylabel('相对误差 (%)')
    plt.title('预测误差分布')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
    
    # 7. 模型解释
    print(f"\n=== 模型解释 ===")
    print(f"模型性能: {'优秀' if r2 > 0.8 else '良好' if r2 > 0.6 else '一般'}")
    print(f"最重要的特征: {feature_importance.iloc[0]['特征']}")
    print(f"建议: 关注{feature_importance.iloc[0]['特征']}和{feature_importance.iloc[1]['特征']}的优化")
    
    return {
        'model': model,
        'metrics': {'mse': mse, 'rmse': rmse, 'r2': r2},
        'feature_importance': feature_importance,
        'predictions': y_pred
    }

# 使用示例
# regression_results = complete_regression_analysis()
```

## 🔍 分类分析完整工作流

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.datasets import make_classification

def complete_classification_analysis():
    """完整的分类分析工作流"""
    
    print("=== 开始分类分析 ===")
    
    # 1. 数据生成
    X, y = make_classification(
        n_samples=1000,
        n_features=8,
        n_informative=5,
        n_redundant=2,
        n_classes=3,
        random_state=42
    )
    
    feature_names = [f'特征_{i+1}' for i in range(X.shape[1])]
    df = pd.DataFrame(X, columns=feature_names)
    df['类别'] = y
    
    print("数据基本信息:")
    print(f"数据集形状: {df.shape}")
    print(f"特征数量: {X.shape[1]}")
    print(f"类别数量: {len(np.unique(y))}")
    print(f"类别分布: {np.unique(y, return_counts=True)}")
    
    # 2. 数据探索
    print("\n=== 数据探索 ===")
    print("数值特征统计:")
    print(df.describe())
    
    # 3. 模型训练
    X_data = df.drop('类别', axis=1)
    y_data = df['类别']
    
    X_train, X_test, y_train, y_test = train_test_split(
        X_data, y_data, test_size=0.2, random_state=42, stratify=y_data
    )
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    
    # 4. 模型评估
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n=== 模型性能 ===")
    print(f"准确率: {accuracy:.4f}")
    print("\n详细分类报告:")
    print(classification_report(y_test, y_pred))
    
    # 5. 特征重要性
    feature_importance = pd.DataFrame({
        '特征': X_data.columns,
        '重要性': model.feature_importances_
    }).sort_values('重要性', ascending=False)
    
    print(f"\n=== 特征重要性 ===")
    for _, row in feature_importance.iterrows():
        print(f"  {row['特征']}: {row['重要性']:.4f}")
    
    # 6. 可视化分析
    plt.figure(figsize=(15, 10))
    
    # 混淆矩阵
    plt.subplot(2, 3, 1)
    cm = confusion_matrix(y_test, y_pred)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.xlabel('预测标签')
    plt.ylabel('真实标签')
    plt.title('混淆矩阵')
    
    # 特征重要性
    plt.subplot(2, 3, 2)
    top_features = feature_importance.head(8)
    plt.barh(top_features['特征'], top_features['重要性'])
    plt.xlabel('重要性')
    plt.title('特征重要性排名')
    plt.gca().invert_yaxis()
    
    # 类别分布
    plt.subplot(2, 3, 3)
    unique, counts = np.unique(y, return_counts=True)
    plt.pie(counts, labels=[f'类别 {cls}' for cls in unique], autopct='%1.1f%%')
    plt.title('类别分布')
    
    # 分类报告热力图
    plt.subplot(2, 3, 4)
    report_dict = classification_report(y_test, y_pred, output_dict=True)
    report_df = pd.DataFrame(report_dict).transpose().iloc[:-3, :-1]
    sns.heatmap(report_df, annot=True, cmap='YlOrRd', fmt='.3f')
    plt.title('分类指标热力图')
    
    # 学习曲线（简化版）
    plt.subplot(2, 3, 5)
    train_sizes = np.linspace(0.1, 1.0, 10)
    train_scores = []
    test_scores = []
    
    for size in train_sizes:
        n_train = int(size * len(X_train))
        X_train_sub = X_train.iloc[:n_train]
        y_train_sub = y_train.iloc[:n_train]
        
        model_temp = RandomForestClassifier(n_estimators=50, random_state=42)
        model_temp.fit(X_train_sub, y_train_sub)
        
        train_score = model_temp.score(X_train_sub, y_train_sub)
        test_score = model_temp.score(X_test, y_test)
        
        train_scores.append(train_score)
        test_scores.append(test_score)
    
    plt.plot(train_sizes, train_scores, 'o-', label='训练得分')
    plt.plot(train_sizes, test_scores, 'o-', label='测试得分')
    plt.xlabel('训练样本比例')
    plt.ylabel('准确率')
    plt.title('学习曲线')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # 类别预测分布
    plt.subplot(2, 3, 6)
    pred_counts = pd.Series(y_pred).value_counts().sort_index()
    true_counts = pd.Series(y_test).value_counts().sort_index()
    
    x = np.arange(len(true_counts))
    width = 0.35
    
    plt.bar(x - width/2, true_counts, width, label='真实分布', alpha=0.7)
    plt.bar(x + width/2, pred_counts, width, label='预测分布', alpha=0.7)
    plt.xlabel('类别')
    plt.ylabel('样本数')
    plt.title('类别分布对比')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
    
    # 7. 模型解释
    print(f"\n=== 模型解释 ===")
    print(f"模型性能: {'优秀' if accuracy > 0.9 else '良好' if accuracy > 0.8 else '一般'}")
    print(f"最重要的特征: {feature_importance.iloc[0]['特征']}")
    print(f"最容易混淆的类别: 查看混淆矩阵对角线外的最大值")
    
    return {
        'model': model,
        'metrics': {'accuracy': accuracy},
        'feature_importance': feature_importance,
        'predictions': y_pred
    }

# 使用示例
# classification_results = complete_classification_analysis()
```

## 📊 统计建模分析

```python
import statsmodels.api as sm
import statsmodels.formula.api as smf

def statistical_modeling_analysis():
    """统计建模分析"""
    
    print("=== 开始统计建模分析 ===")
    
    # 创建示例数据
    np.random.seed(42)
    n_samples = 200
    
    data = pd.DataFrame({
        '广告投入': np.random.normal(1000, 300, n_samples),
        '价格': np.random.normal(50, 15, n_samples),
        '促销活动': np.random.choice([0, 1], n_samples, p=[0.7, 0.3]),
        '季节性': np.random.choice([0, 1], n_samples, p=[0.5, 0.5])
    })
    
    # 生成销售额（与特征有真实关系）
    data['销售额'] = (
        500 + 0.8 * data['广告投入'] - 5 * data['价格'] + 
        200 * data['促销活动'] + 150 * data['季节性'] + 
        np.random.normal(0, 100, n_samples)
    )
    
    print("数据基本信息:")
    print(f"样本数量: {len(data)}")
    print(f"特征: {list(data.columns[:-1])}")
    print("\n数据描述:")
    print(data.describe())
    
    # 1. OLS 回归分析
    print("\n=== OLS 回归分析 ===")
    model = smf.ols('销售额 ~ 广告投入 + 价格 + 促销活动 + 季节性', data=data).fit()
    
    print("回归结果摘要:")
    print(model.summary())
    
    # 2. 关键统计指标
    print(f"\n=== 关键统计指标 ===")
    print(f"R²: {model.rsquared:.4f}")
    print(f"调整R²: {model.rsquared_adj:.4f}")
    print(f"F统计量: {model.fvalue:.2f}")
    print(f"F统计量p值: {model.f_pvalue:.4f}")
    
    # 3. 系数解释
    print(f"\n=== 系数解释 ===")
    for feature, coef in model.params.items():
        p_value = model.pvalues[feature]
        significance = "***" if p_value < 0.001 else "**" if p_value < 0.01 else "*" if p_value < 0.05 else ""
        print(f"{feature}: {coef:.2f} {significance} (p值: {p_value:.4f})")
    
    # 4. 残差分析
    print(f"\n=== 残差分析 ===")
    residuals = model.resid
    print(f"残差均值: {residuals.mean():.4f}")
    print(f"残差标准差: {residuals.std():.4f}")
    
    # 5. 可视化分析
    plt.figure(figsize=(15, 10))
    
    # 实际值 vs 预测值
    plt.subplot(2, 3, 1)
    y_pred_ols = model.predict(data[['广告投入', '价格', '促销活动', '季节性']])
    plt.scatter(data['销售额'], y_pred_ols, alpha=0.6)
    plt.plot([data['销售额'].min(), data['销售额'].max()], 
             [data['销售额'].min(), data['销售额'].max()], 'r--', lw=2)
    plt.xlabel('实际销售额')
    plt.ylabel('预测销售额')
    plt.title(f'OLS预测效果 (R² = {model.rsquared:.3f})')
    plt.grid(True, alpha=0.3)
    
    # 残差图
    plt.subplot(2, 3, 2)
    plt.scatter(y_pred_ols, residuals, alpha=0.6)
    plt.axhline(y=0, color='r', linestyle='--')
    plt.xlabel('预测值')
    plt.ylabel('残差')
    plt.title('残差分析')
    plt.grid(True, alpha=0.3)
    
    # Q-Q图
    plt.subplot(2, 3, 3)
    sm.qqplot(residuals, line='45', ax=plt.gca())
    plt.title('Q-Q图（残差正态性检验）')
    
    # 特征与目标变量关系
    plt.subplot(2, 3, 4)
    plt.scatter(data['广告投入'], data['销售额'], alpha=0.6)
    plt.xlabel('广告投入')
    plt.ylabel('销售额')
    plt.title('广告投入 vs 销售额')
    plt.grid(True, alpha=0.3)
    
    plt.subplot(2, 3, 5)
    plt.scatter(data['价格'], data['销售额'], alpha=0.6)
    plt.xlabel('价格')
    plt.ylabel('销售额')
    plt.title('价格 vs 销售额')
    plt.grid(True, alpha=0.3)
    
    # 系数可视化
    plt.subplot(2, 3, 6)
    coefficients = model.params.iloc[1:]  # 排除截距项
    colors = ['green' if p < 0.05 else 'red' for p in model.pvalues.iloc[1:]]
    plt.barh(coefficients.index, coefficients.values, color=colors)
    plt.axvline(x=0, color='black', linestyle='-')
    plt.xlabel('系数值')
    plt.title('特征系数（绿色表示显著）')
    
    plt.tight_layout()
    plt.show()
    
    # 6. 业务解释
    print(f"\n=== 业务解释 ===")
    print(f"模型解释力: {'强' if model.rsquared > 0.7 else '中等' if model.rsquared > 0.5 else '弱'}")
    
    significant_features = []
    for feature in model.params.index[1:]:  # 排除截距
        if model.pvalues[feature] < 0.05:
            significant_features.append(feature)
    
    if significant_features:
        print(f"显著影响特征: {', '.join(significant_features)}")
    else:
        print("没有发现统计显著的特征")
    
    return {
        'model': model,
        'rsquared': model.rsquared,
        'significant_features': significant_features,
        'residuals': residuals
    }

# 使用示例
# stats_results = statistical_modeling_analysis()
```

## 🔧 模型优化与调参

```python
from sklearn.model_selection import GridSearchCV
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

def model_optimization_pipeline(X, y, problem_type='regression'):
    """模型超参数优化流程"""
    
    print(f"=== 开始 {problem_type} 模型优化 ===")
    
    # 数据分割
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # 选择模型和参数网格
    if problem_type == 'regression':
        model = RandomForestRegressor(random_state=42)
        param_grid = {
            'n_estimators': [50, 100, 200],
            'max_depth': [None, 10, 20],
            'min_samples_split': [2, 5, 10],
            'min_samples_leaf': [1, 2, 4]
        }
        scoring = 'r2'
    else:
        model = RandomForestClassifier(random_state=42)
        param_grid = {
            'n_estimators': [50, 100, 200],
            'max_depth': [None, 10, 20],
            'min_samples_split': [2, 5, 10],
            'min_samples_leaf': [1, 2, 4]
        }
        scoring = 'accuracy'
    
    # 网格搜索
    print("正在进行网格搜索...")
    grid_search = GridSearchCV(
        model, param_grid, cv=5, scoring=scoring, 
        n_jobs=-1, verbose=1
    )
    grid_search.fit(X_train, y_train)
    
    # 输出最优参数
    print(f"\n=== 最优参数 ===")
    for param, value in grid_search.best_params_.items():
        print(f"  {param}: {value}")
    
    print(f"最优模型得分: {grid_search.best_score_:.4f}")
    
    # 测试集性能
    best_model = grid_search.best_estimator_
    y_pred = best_model.predict(X_test)
    
    if problem_type == 'regression':
        test_score = r2_score(y_test, y_pred)
        print(f"测试集 R²: {test_score:.4f}")
    else:
        test_score = accuracy_score(y_test, y_pred)
        print(f"测试集准确率: {test_score:.4f}")
    
    return {
        'best_model': best_model,
        'best_params': grid_search.best_params_,
        'best_score': grid_search.best_score_,
        'test_score': test_score
    }

# 使用示例
# X_reg, y_reg, X_clf, y_clf = prepare_ml_data()
# optimized_regression = model_optimization_pipeline(X_reg, y_reg, 'regression')
# optimized_classification = model_optimization_pipeline(X_clf, y_clf, 'classification')
```

## ⚠️ 使用注意事项

### ✅ 推荐做法：
- 使用标准的 scikit-learn 和 statsmodels 接口
- 直接使用 `print()` 输出结果和指标
- 使用 `plt.show()` 显示图表
- 对数据进行适当的预处理和标准化

### ❌ 避免的操作：
- 不要手动构建 JSON 输出
- 不要使用 `base64` 编码
- 不要创建复杂的自定义输出格式

### 🔧 错误处理：
```python
try:
    from sklearn.ensemble import RandomForestRegressor
    # 模型训练代码
except ImportError:
    print("scikit-learn 不可用")

try:
    import statsmodels.api as sm
    # 统计建模代码
except ImportError:
    print("statsmodels 不可用")
```

### 💡 实用技巧：
```python
# 快速模型评估函数
def quick_model_evaluation(model, X_test, y_test, problem_type='regression'):
    """快速模型评估"""
    y_pred = model.predict(X_test)
    
    if problem_type == 'regression':
        r2 = r2_score(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        print(f"R²: {r2:.4f}, RMSE: {rmse:.4f}")
    else:
        accuracy = accuracy_score(y_test, y_pred)
        print(f"准确率: {accuracy:.4f}")
    
    return y_pred
```

**记住**：系统会自动处理所有输出格式，您只需要专注于机器学习建模和分析逻辑！
