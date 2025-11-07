// src/static/js/agent/specialized/ResearchPanel.js
export class ResearchPanel {
    constructor(containerId = 'research-panel-container') {
        this.containerId = containerId;
        this.container = null;
        this.isVisible = false;
        
        this.injectStyles();
        this.setupEventListeners();
    }

    show() {
        if (!this.container) this.createContainer();
        this.container.innerHTML = this.renderResearchForm();
        this.container.style.display = 'block';
        this.isVisible = true;
        this.attachFormEvents();
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
        this.isVisible = false;
    }

    createContainer() {
        // 创建研究面板容器
        this.container = document.createElement('div');
        this.container.id = this.containerId;
        this.container.className = 'research-panel-container';
        document.body.appendChild(this.container);
    }

    renderResearchForm() {
        return `
            <div class="research-panel">
                <div class="research-header">
                    <h3>🔍 深度研究助手</h3>
                    <button class="btn-close-research">×</button>
                </div>
                
                <form id="research-form" class="research-form">
                    <div class="form-section">
                        <label for="research-topic">研究主题 *</label>
                        <input type="text" id="research-topic" required 
                               placeholder="请输入您要研究的主题...">
                    </div>
                    
                    <div class="form-section">
                        <label for="research-requirements">具体需求</label>
                        <textarea id="research-requirements" rows="3"
                                  placeholder="请描述具体需求、关注点..."></textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-section">
                            <label for="research-language">报告语言</label>
                            <select id="research-language">
                                <option value="zh-CN">中文</option>
                                <option value="en-US">English</option>
                            </select>
                        </div>
                        
                        <div class="form-section">
                            <label for="research-depth">研究深度</label>
                            <select id="research-depth">
                                <option value="standard">标准深度</option>
                                <option value="deep">深度研究</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn-cancel">取消</button>
                        <button type="submit" class="btn-start-research primary">
                            🚀 开始深度研究
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    attachFormEvents() {
        const form = this.container.querySelector('#research-form');
        const cancelBtn = this.container.querySelector('.btn-cancel');
        const closeBtn = this.container.querySelector('.btn-close-research');
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.startResearch();
        });
        
        cancelBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('click', () => this.hide());
    }

    startResearch() {
        const formData = {
            topic: document.getElementById('research-topic').value,
            requirements: document.getElementById('research-requirements').value,
            language: document.getElementById('research-language').value,
            depth: document.getElementById('research-depth').value
        };
        
        // 触发研究开始事件
        window.dispatchEvent(new CustomEvent('research:start_requested', {
            detail: formData
        }));
        
        this.hide();
    }

    injectStyles() {
        const styles = `
            .research-panel-container {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 10000;
                display: none;
            }
            
            .research-panel {
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                padding: 24px;
                width: 500px;
                max-width: 90vw;
            }
            
            .research-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid #e1e5e9;
            }
            
            .research-form .form-section {
                margin-bottom: 16px;
            }
            
            .research-form label {
                display: block;
                margin-bottom: 6px;
                font-weight: 600;
                color: #2d3748;
            }
            
            .research-form input,
            .research-form textarea,
            .research-form select {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
            }
            
            .form-row {
                display: flex;
                gap: 16px;
            }
            
            .form-row .form-section {
                flex: 1;
            }
            
            .form-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                margin-top: 24px;
            }
            
            .btn-start-research {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    setupEventListeners() {
        // 监听显示研究面板的事件
        window.addEventListener('orchestrator:show_research_panel', (e) => {
            this.show();
            if (e.detail.initialTopic) {
                document.getElementById('research-topic').value = e.detail.initialTopic;
            }
        });
    }
}