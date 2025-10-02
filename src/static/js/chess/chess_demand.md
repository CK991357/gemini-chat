# 国际象棋AI走棋功能需求文档

## 1. 项目概述

### 1.1 目标
在国际象棋功能基础上，增加AI走棋功能，实现用户点击"问AI"按钮后，AI根据当前对局历史返回最佳走法并自动执行。

### 1.2 核心功能
- 完整对局历史记录保存
- AI走法建议获取与解析
- 自动执行AI建议走法
- 简单调试信息显示

## 2. 功能需求

### 2.1 历史记录管理
**位置**: `chess-core.js`
**职责**: 管理从开局到当前的所有FEN记录

**需求**:
- 维护完整对局历史数组 `fullGameHistory`
- 每次成功移动后记录当前FEN到历史
- 撤销操作时同步移除历史记录
- 提供获取完整历史的方法

**接口**:
```javascript
// 记录移动后的状态
recordMoveToHistory()

// 移除最后一步（撤销时）
removeLastMoveFromHistory()

// 获取完整历史
getFullGameHistory()
```

### 2.2 AI功能模块
**位置**: `chess-ai-enhanced.js` (新建文件)
**依赖**: chess.js库

**职责**:
- 构建AI提示词
- 调用API获取AI响应
- 解析SAN走法格式
- 验证并执行走法

**核心方法**:
```javascript
// 主方法：获取并执行AI走法
askAIForMove()

// 构建提示词
buildSANMovePrompt(history, currentFEN)

// 解析和执行SAN走法
executeSANMove(response)
```

### 2.3 用户界面
**位置**: `chess-core.js` 中的UI集成部分

**需求**:
- 在棋盘信息面板添加"问AI"按钮
- 按钮点击触发AI走法获取
- 显示简单的执行状态提示
- 不区分黑白方，通用AI走法

## 3. 技术实现方案

### 3.1 文件结构
```
src/
├── chess/
│   ├── chess-core.js          # 主要棋盘逻辑（修改）
│   ├── chess-ai-enhanced.js   # AI功能模块（新建）
│   └── ...
└── main.js                    # 应用入口
```

### 3.2 核心代码实现

#### 3.2.1 历史记录管理 (chess-core.js)
```javascript
// 在ChessGame类中新增
constructor(options = {}) {
    // ... 原有代码
    this.fullGameHistory = []; // 完整对局历史
    this.initializeFullHistory();
}

initializeFullHistory() {
    this.fullGameHistory = [this.generateFEN()];
}

recordMoveToHistory() {
    const currentFEN = this.generateFEN();
    this.fullGameHistory.push(currentFEN);
}

removeLastMoveFromHistory() {
    if (this.fullGameHistory.length > 1) {
        this.fullGameHistory.pop();
    }
}

getFullGameHistory() {
    return [...this.fullGameHistory];
}
```

#### 3.2.2 AI功能模块 (chess-ai-enhanced.js)
```javascript
export class ChessAIEnhanced {
    constructor(chessGame, options = {}) {
        this.chessGame = chessGame;
        this.showToast = options.showToast;
        this.chess = new Chess();
    }

    async askAIForMove() {
        try {
            const history = this.chessGame.getFullGameHistory();
            const currentFEN = this.chessGame.generateFEN();
            
            const prompt = this.buildSANMovePrompt(history, currentFEN);
            const response = await this.sendToAI(prompt);
            
            return await this.executeSANMove(response);
        } catch (error) {
            this.showToast('AI走法获取失败: ' + error.message);
            return false;
        }
    }

    buildSANMovePrompt(history, currentFEN) {
        return `你是一个国际象棋引擎。基于以下对局历史，请给出当前局面的最佳走法。

对局历史（从开局到当前）：
${history.map((fen, index) => `步骤 ${index}: ${fen}`).join('\n')}

当前局面FEN：${currentFEN}

当前轮到：${this.chessGame.currentTurn === 'w' ? '白方' : '黑方'}

请只返回标准代数记谱法（SAN）的走法，例如：Nf3、e4、O-O等。
不要返回任何其他文字，只返回走法字符串。`;
    }

    async executeSANMove(response) {
        const sanMove = response.trim();
        if (!sanMove) throw new Error('AI未返回有效走法');

        // 使用chess.js验证和解析走法
        const currentFEN = this.chessGame.generateFEN();
        this.chess.load(currentFEN);
        
        const moves = this.chess.moves({ verbose: true });
        const validMove = moves.find(move => move.san === sanMove);
        
        if (!validMove) throw new Error(`无效的SAN走法: ${sanMove}`);

        const from = this.squareToIndices(validMove.from);
        const to = this.squareToIndices(validMove.to);

        // 显示调试信息
        this.showToast(`AI建议: ${sanMove} (${validMove.from}→${validMove.to})`);

        return this.chessGame.movePiece(from.row, from.col, to.row, to.col);
    }

    squareToIndices(square) {
        const files = 'abcdefgh';
        const fileChar = square[0];
        const rankChar = square[1];
        const col = files.indexOf(fileChar);
        const row = 8 - parseInt(rankChar);
        return { row, col };
    }

    async sendToAI(prompt) {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) throw new Error('请先设置API Key');

        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-2.0-flash-exp',
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
        
        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    }
}
```

#### 3.2.3 UI集成 (chess-core.js)
```javascript
// 在ChessGame类中新增
initializeAI() {
    this.chessAI = new ChessAIEnhanced(this, {
        showToast: this.showToast
    });
}

addAIButton() {
    const infoPanel = document.querySelector('.chess-info-panel');
    if (!infoPanel) return;

    const aiButton = document.createElement('button');
    aiButton.id = 'ask-ai-button';
    aiButton.className = 'action-button chess-ai-button';
    aiButton.innerHTML = '<i class="fa-solid fa-robot"></i> 问AI走法';
    aiButton.addEventListener('click', () => this.askAIForMove());

    const fenActions = infoPanel.querySelector('.fen-actions');
    if (fenActions) {
        fenActions.appendChild(aiButton);
    }
}

async askAIForMove() {
    if (!this.chessAI) {
        this.showToast('AI功能初始化中...');
        this.initializeAI();
        return;
    }

    if (this.gameOver) {
        this.showToast('游戏已结束，无法询问AI');
        return;
    }

    this.showToast('正在获取AI建议的走法...');
    const success = await this.chessAI.askAIForMove();
    
    if (success) {
        this.showToast('AI走法执行成功');
    }
}
```

### 3.3 提示词优化
为确保AI返回正确的SAN格式，提示词强调：
- 只返回SAN走法，不包含其他文字
- 提供对局历史和当前局面信息
- 明确当前轮次方
- 提供正确的格式示例

## 4. 集成步骤

### 4.1 依赖引入
在index.html中添加chess.js：
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>
```

### 4.2 文件修改顺序
1. 修改`chess-core.js` - 添加历史记录管理
2. 创建`chess-ai-enhanced.js` - AI功能模块
3. 修改`chess-core.js` - 集成AI功能和UI
4. 更新`main.js` - 确保正确初始化

### 4.3 CSS样式
```css
.chess-ai-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 8px;
    width: 100%;
}

.chess-ai-button:hover {
    background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.chess-ai-button:disabled {
    background: #ccc;
    cursor: not-allowed;
}
```

## 5. 测试方案

### 5.1 功能测试点
- [ ] 历史记录正确保存和撤销
- [ ] "问AI"按钮正常显示和点击
- [ ] AI返回SAN走法正确解析
- [ ] 棋盘正确执行AI走法
- [ ] 调试信息正确显示
- [ ] 黑白方通用性测试

### 5.2 边界情况
- 游戏结束时禁用AI功能
- API调用失败处理
- 无效SAN走法处理
- 网络超时处理

## 6. 风险评估与应对

### 6.1 技术风险
- **chess.js兼容性**: 使用CDN稳定版本
- **SAN解析失败**: 使用chess.js内置验证
- **API响应格式**: 严格的响应解析和错误处理

### 6.2 用户体验风险
- **AI响应延迟**: 显示加载状态
- **走法执行失败**: 提供清晰的错误信息
- **界面阻塞**: 异步执行AI调用

## 7. 后续优化方向

### 7.1 短期优化
- AI走法执行动画
- 走法历史查看功能
- 多种AI强度选择

### 7.2 长期规划
- 本地AI引擎集成
- 对局分析和复盘功能
- 开局库和残局库支持

## 8. 验收标准

### 8.1 核心功能
- [x] 点击"问AI"按钮能获取并执行走法
- [x] 棋盘状态正确更新
- [x] 历史记录完整准确
- [x] 基本错误处理完善

### 8.2 用户体验
- [x] 操作响应及时
- [x] 状态提示清晰
- [x] 界面布局合理
- [x] 黑白方通用

本需求文档基于现有代码架构设计，确保最小化修改现有功能的同时实现完整的AI走棋功能。