// src\static\js\agent\WorkflowUI.js
export class ModelSelectionDialog {
    constructor() {
        this.selectedModel = null;
        this.resolvePromise = null;
        this.dialog = null;
    }

    /**
     * 显示模型选择对话框
     * @returns {Promise<string>} 用户选择的模型名称
     */
    async show() {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.renderDialog();
        });
    }

    renderDialog() {
        // 创建对话框容器
        this.dialog = document.createElement('div');
        this.dialog.className = 'model-selection-dialog-overlay';
        this.dialog.innerHTML = `
            <div class="model-selection-dialog">
                <div class="dialog-header">
                    <h3>🎯 深度研究配置</h3>
                    <p>请选择报告模型并设置研究参数</p>
                </div>
                
                <div class="model-options">
                    <div class="model-option" data-model="deepseek-reasoner">
                        <div class="model-header">
                            <span class="model-name">Deepseek-reasoner</span>
                            <span class="model-badge premium">专业版</span>
                        </div>
                        <div class="model-description">
                            <ul>
                                <li>✅ 最高质量的内容生成</li>
                                <li>✅ 更强的逻辑推理能力</li>
                                <li>✅ 更准确的学术引用</li>
                                <li>⏱️ 响应速度稍慢</li>
                                <li>💎 适合深度研究、学术论文</li>
                            </ul>
                        </div>
                    </div>

                    <div class="model-option" data-model="models/gemini-2.5-flash">
                        <div class="model-header">
                            <span class="model-name">Gemini 2.5 Flash</span>
                            <span class="model-badge standard">标准版</span>
                        </div>
                        <div class="model-description">
                            <ul>
                                <li>✅ 极快的响应速度</li>
                                <li>✅ 良好的内容质量</li>
                                <li>✅ 成本效益更高</li>
                                <li>📊 适合标准报告、快速分析</li>
                                <li>💡 平衡速度与质量</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- 🆕 新增：迭代次数设置 -->
                <div class="iteration-settings">
                    <div class="setting-header">
                        <h4>⚙️ 研究参数设置</h4>
                    </div>
                    <div class="setting-row">
                        <label for="iteration-input">
                            <span class="setting-label">最大迭代次数：</span>
                            <span class="setting-description">控制研究的深入程度 (范围: 3-12)</span>
                        </label>
                        <div class="iteration-control">
                            <input 
                                type="number" 
                                id="iteration-input"
                                min="3" 
                                max="12" 
                                value="8"
                                class="iteration-input"
                            >
                            <div class="iteration-hints">
                                <div class="hint-item">
                                    <span class="hint-icon">🔍</span>
                                    <span class="hint-text">快速探索: 3-5次</span>
                                </div>
                                <div class="hint-item">
                                    <span class="hint-icon">🎯</span>
                                    <span class="hint-text">标准研究: 5-8次 (默认)</span>
                                </div>
                                <div class="hint-item">
                                    <span class="hint-icon">🧠</span>
                                    <span class="hint-text">深度研究: 8-12次</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="iteration-note">
                        💡 迭代次数越多，研究越深入，但耗时也更长
                    </div>
                </div>

                <div class="dialog-footer">
                    <button class="btn-secondary" id="cancel-btn">取消研究</button>
                    <button class="btn-primary" id="confirm-btn" disabled>开始研究</button>
                </div>

                <div class="selection-hint">
                    💡 请先选择一个模型选项
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);

        // 绑定事件
        this.bindEvents();
        this.addStyles();
    }

    bindEvents() {
        // 模型选项点击事件
        const options = this.dialog.querySelectorAll('.model-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                // 移除其他选项的选中状态
                options.forEach(opt => opt.classList.remove('selected'));
                // 设置当前选项为选中状态
                option.classList.add('selected');
                
                this.selectedModel = option.dataset.model;
                this.dialog.querySelector('#confirm-btn').disabled = false;
                
                // 更新提示
                const hint = this.dialog.querySelector('.selection-hint');
                hint.innerHTML = `✅ 已选择: <strong>${this.getModelDisplayName(this.selectedModel)}</strong>`;
            });
        });

        // 确认按钮
        this.dialog.querySelector('#confirm-btn').addEventListener('click', () => {
            if (this.selectedModel) {
                this.close(this.selectedModel);
            }
        });

        // 取消按钮
        this.dialog.querySelector('#cancel-btn').addEventListener('click', () => {
            this.close(null);
        });

        // 点击背景关闭
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.close(null);
            }
        });
        
        // 🔥 新增：迭代次数输入实时验证
        const iterationInput = this.dialog.querySelector('#iteration-input');
        if (iterationInput) {
            iterationInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value, 10);
                
                if (isNaN(value)) {
                    // 恢复为默认值
                    e.target.value = 8;
                    return;
                }
                
                // 限制在3-12范围内
                if (value < 3) value = 3;
                if (value > 12) value = 12;
                
                // 更新显示值
                if (value !== parseInt(e.target.value, 10)) {
                    e.target.value = value;
                }
                
                // 视觉反馈
                this._updateIterationVisualFeedback(value);
            });
            
            iterationInput.addEventListener('blur', (e) => {
                const value = parseInt(e.target.value, 10);
                if (isNaN(value) || value < 3 || value > 12) {
                    e.target.value = 8; // 重置为默认值
                    this._updateIterationVisualFeedback(8);
                }
            });
        }
    }

    addStyles() {
        const styles = `
            .model-selection-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .model-selection-dialog {
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                animation: dialogSlideIn 0.3s ease-out;
            }

            @keyframes dialogSlideIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .dialog-header {
                text-align: center;
                margin-bottom: 24px;
            }

            .dialog-header h3 {
                margin: 0 0 8px 0;
                color: #1a1a1a;
                font-size: 1.5em;
            }

            .dialog-header p {
                margin: 0;
                color: #666;
                font-size: 0.95em;
            }

            .model-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 24px;
            }

            .model-option {
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                background: #fafbfc;
            }

            .model-option:hover {
                border-color: #c1c7d0;
                background: #f5f7fa;
            }

            .model-option.selected {
                border-color: #1976d2;
                background: #e3f2fd;
                box-shadow: 0 0 0 1px #1976d2;
            }

            .model-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .model-name {
                font-weight: 600;
                color: #1a1a1a;
                font-size: 1.1em;
            }

            .model-badge {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.8em;
                font-weight: 600;
            }

            .model-badge.premium {
                background: #ffd700;
                color: #8b6b00;
            }

            .model-badge.standard {
                background: #e3f2fd;
                color: #1976d2;
            }

            .model-description ul {
                margin: 0;
                padding-left: 16px;
                color: #555;
                font-size: 0.9em;
                line-height: 1.4;
            }

            .model-description li {
                margin-bottom: 4px;
            }

            .dialog-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .btn-primary, .btn-secondary {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s ease;
            }

            .btn-primary {
                background: #1976d2;
                color: white;
            }

            .btn-primary:hover:not(:disabled) {
                background: #1565c0;
            }

            .btn-primary:disabled {
                background: #ccc;
                cursor: not-allowed;
            }

            .btn-secondary {
                background: #f5f5f5;
                color: #666;
            }

            .btn-secondary:hover {
                background: #e0e0e0;
            }

            .selection-hint {
                text-align: center;
                margin-top: 16px;
                color: #666;
                font-size: 0.9em;
            }
            
            /* 🆕 新增：迭代次数设置样式 */
            .iteration-settings {
                margin: 20px 0;
                padding: 16px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }
            
            .setting-header {
                margin-bottom: 12px;
            }
            
            .setting-header h4 {
                margin: 0;
                color: #343a40;
                font-size: 1.1em;
            }
            
            .setting-row {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .setting-label {
                font-weight: 600;
                color: #495057;
            }
            
            .setting-description {
                font-size: 0.85em;
                color: #6c757d;
                margin-left: 8px;
            }
            
            .iteration-control {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            
            .iteration-input {
                width: 80px;
                padding: 8px 12px;
                border: 2px solid #ced4da;
                border-radius: 6px;
                font-size: 1em;
                text-align: center;
                transition: border-color 0.2s;
            }
            
            .iteration-input:focus {
                outline: none;
                border-color: #1976d2;
            }
            
            .iteration-input.valid {
                border-color: #28a745;
                background-color: #f8fff9;
            }
            
            .iteration-input.invalid {
                border-color: #dc3545;
                background-color: #fff8f8;
            }
            
            .iteration-hints {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .hint-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.85em;
                color: #6c757d;
            }
            
            .hint-icon {
                font-size: 0.9em;
            }
            
            .hint-text {
                flex: 1;
            }
            
            .iteration-note {
                margin-top: 12px;
                padding: 8px 12px;
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 4px;
                color: #856404;
                font-size: 0.9em;
            }
            
            /* 添加加载动画 */
            @keyframes pulse {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
            
            .loading-hint {
                animation: pulse 1.5s infinite;
                color: #1976d2;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    getModelDisplayName(modelId) {
        const modelNames = {
            'deepseek-reasoner': 'Deepseek-reasoner (专业版)',
            'models/gemini-2.5-flash': 'Gemini 2.5 Flash (标准版)'
        };
        return modelNames[modelId] || modelId;
    }

    close(selectedModel) {
        if (!this.dialog) return;
        
        let selectedIterations = 8; // 默认值
        
        if (selectedModel) {
            // 获取用户设置的迭代次数（增强验证）
            const iterationInput = this.dialog.querySelector('#iteration-input');
            if (iterationInput) {
                let value = parseInt(iterationInput.value, 10);
                
                // 🔥 增强验证：处理无效输入
                if (isNaN(value)) {
                    console.warn(`[ModelSelectionDialog] 无效的迭代次数输入: "${iterationInput.value}"，使用默认值8`);
                    value = 8;
                }
                
                // 验证输入范围
                if (value < 3) {
                    console.warn(`[ModelSelectionDialog] 迭代次数 ${value} 小于最小值3，调整为3`);
                    value = 3;
                } else if (value > 12) {
                    console.warn(`[ModelSelectionDialog] 迭代次数 ${value} 大于最大值12，调整为12`);
                    value = 12;
                }
                
                selectedIterations = value;
                console.log(`[ModelSelectionDialog] 最终迭代次数: ${selectedIterations}`);
            }
        }
        
        if (this.dialog && this.dialog.parentNode) {
            this.dialog.parentNode.removeChild(this.dialog);
        }
        
        if (this.resolvePromise) {
            // 返回包含模型和迭代次数的对象
            this.resolvePromise(selectedModel ? {
                model: selectedModel,
                maxIterations: selectedIterations
            } : null);
        }
    }
    
    /**
     * 🔥 新增：更新迭代次数的视觉反馈
     */
    _updateIterationVisualFeedback(value) {
        const hintItem = this.dialog.querySelector('.selection-hint');
        if (!hintItem) return;
        
        let level = '';
        if (value <= 5) level = '快速探索';
        else if (value <= 10) level = '标准研究';
        else level = '深度研究';
        
        hintItem.innerHTML = `✅ 已选择: <strong>${this.getModelDisplayName(this.selectedModel)}</strong> | ⚙️ 迭代次数: <strong>${value}</strong> (${level})`;
    }
}

/**
 * 辅助函数：显示模型选择对话框并返回用户的选择。
 * @returns {Promise<Object|null>} 用户选择的模型和迭代次数对象，如果取消则返回 null。
 */
export async function promptModelSelection() {
    const dialog = new ModelSelectionDialog();
    const result = await dialog.show();
    return result; // 返回 {model, maxIterations} 或 null
}