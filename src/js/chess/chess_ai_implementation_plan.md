# 国际象棋AI功能 - 最终实施方案 (已审查和优化)

本文档基于初始需求和专家的审查反馈，制定了最终的、可执行的技术实施方案。

## 1. 最终评估

**结论：完全正确且高度可行。**

此方案与项目现有架构完美契合，重用了后端的AI网关能力，并采用模块化的前端设计，实施风险低。集成的微调建议将进一步提升代码的健壮性和用户体验。

## 2. 最终落地指引

### 第1步：依赖与风险缓解

1.  **添加 `chess.js` 依赖**: 在 `src/static/index.html` 的 `</body>` 标签前，添加 `chess.js` 库的CDN链接。
    ```html
    <!-- chess.js for SAN move validation and parsing -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>
    ```
2.  **添加 `chess.js` 加载检查**: 在 `chess-ai-enhanced.js` 模块的顶部添加检查，防止库加载失败时程序崩溃。
    ```javascript
    if (typeof Chess === 'undefined') {
       throw new Error('chess.js 库未正确加载，请检查CDN链接');
    }
    ```

### 第2步：创建AI功能模块 (`chess-ai-enhanced.js`)

在 `src/static/js/chess/` 目录下新建文件 `chess-ai-enhanced.js`。此模块将包含所有与AI交互的逻辑，并集成所有优化建议。

```javascript
// src/static/js/chess/chess-ai-enhanced.js

// 风险缓解：确保 chess.js 已加载
if (typeof window.Chess === 'undefined') {
    throw new Error('chess.js 库未正确加载，请检查CDN链接');
}
const Chess = window.Chess;

export class ChessAIEnhanced {
    constructor(chessGame, options = {}) {
        this.chessGame = chessGame;
        this.showToast = options.showToast || console.log;
        this.chess = new Chess();
    }

    async askAIForMove() {
    }

    /**
     * 主方法：请求AI并执行其返回的最佳走法
     */
    async askAIForMove() {
        try {
            const history = this.chessGame.getFullGameHistory();
            const currentFEN = this.chessGame.getCurrentFEN();
            
            const prompt = this.buildSANMovePrompt(history, currentFEN);
            const response = await this.sendToAI(prompt);
            
            return await this.executeSANMove(response, currentFEN);
        } catch (error) {
            this.showToast(`AI走法获取失败: ${error.message}`);
            console.error('AI Error:', error);
            return false;
        }
    }

    /**
     * 构建发送给AI的提示词
     */

    buildSANMovePrompt(history, currentFEN) {
       const turn = currentFEN.split(' ')[1] === 'w' ? '白方' : '黑方';
        return `你是一个国际象棋引擎。基于以下对局历史，请给出当前局面的最佳走法。

对局历史（FEN格式，从开局到当前）：
${history.map((fen, index) => `步骤 ${index + 1}: ${fen}`).join('\n')}

当前局面FEN：${currentFEN}
当前轮到：${turn}

请只返回最佳走法的标准代数记谱法（SAN）字符串，例如：Nf3, e4, O-O, exd5, a8=Q 等。
不要返回任何其他解释、评论或多余的文字，只返回唯一的走法字符串。`;
    }

    /**
     * 解析并执行AI返回的SAN走法
     */
    async executeSANMove(response, currentFEN) {
const sanMove = response.trim();
        if (!sanMove) {
            throw new Error('AI未返回有效走法');
        }

        // 使用chess.js加载当前局面以验证走法
        this.chess.load(currentFEN);
        
        // 尝试执行走法，chess.js会自动验证
        const moveObject = this.chess.move(sanMove, { sloppy: true }); // sloppy: true 允许不严格的SAN
        
        if (moveObject === null) {
            console.error(`chess.js 验证失败。 FEN: ${currentFEN}, SAN: ${sanMove}`);
            throw new Error(`AI返回了无效或不合法的走法: "${sanMove}"`);
        }

        const from = this.squareToIndices(moveObject.from);
        const to = this.squareToIndices(moveObject.to);

        this.showToast(`AI 建议: ${sanMove} (${moveObject.from} → ${moveObject.to})`);

        // 调用核心逻辑来移动棋子
        return this.chessGame.movePiece(from.row, from.col, to.row, to.col);
    }

    /**
     * 将棋盘坐标（如 'e4'）转换为行列索引
     */

    squareToIndices(square) {
        const files = 'abcdefgh';
        const fileChar = square[0];
        const rankChar = square[1];
        const col = files.indexOf(fileChar);
        const row = 8 - parseInt(rankChar, 10);
        return { row, col };
    }

    /**
     * 向后端API发送请求
     */

    /**
     * 向后端API发送请求 (已根据审查建议优化)
     */
    async sendToAI(prompt) {
        // 使用项目主流的 /api/chat/completions 端点
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gemini-2.5-flash-preview-05-20', // 使用更强大的模型以获得更好的棋艺
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
            throw new Error(`API请求失败: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }
        
        const data = await response.json();
        // 灵活的响应解析
        return data.choices[0]?.message?.content || data.content || '';
    }
}
```

### 第3步：改造核心逻辑文件 (`chess-core.js`)

修改 `chess-core.js` 以集成历史记录管理、UI按钮和AI调用逻辑，并采纳所有优化建议。

1.  **导入新模块**:
    ```javascript
    import { ChessAIEnhanced } from './chess-ai-enhanced.js';
    ```

2.  **扩展 `ChessGame` 类**:
    *   **`constructor`**:
        ```javascript
        // ...
        this.fullGameHistory = [];
        this.chessAI = null;
        // ...
        ```
    *   **`initialize`**:
        ```javascript
        // ... 在末尾添加
        this.initializeAI();
        this.addAIButton();
        ```
    *   **`setupInitialPosition` (优化)**:
        ```javascript
        setupInitialPosition() {
            // ... 重置棋盘状态 ...
            this.pieces = { ...initialPosition };
            this.moveHistory = [];
            // ... 其他状态 ...
            this.gameOver = false;
            
            // 在所有状态设置完成后，调用专门的方法初始化历史
            this.initializeFullHistory();
            
            this.renderBoard();
            this.updateFEN();
        }
        ```
    *   **添加新方法和修改现有方法 (集成所有优化)**:
        ```javascript
        // --- 历史记录管理 (集成增强日志) ---
        initializeFullHistory() {
            this.fullGameHistory = [this.generateFEN()];
            console.log('完整对局历史已初始化，初始FEN:', this.fullGameHistory[0]);
        }

        recordMoveToHistory() {
            const currentFEN = this.generateFEN();
            this.fullGameHistory.push(currentFEN);
            console.log(`记录历史步数: ${this.fullGameHistory.length}, FEN: ${currentFEN}`);
        }

        removeLastMoveFromHistory() {
            if (this.fullGameHistory.length > 1) {
                const removed = this.fullGameHistory.pop();
                console.log(`撤销历史记录，剩余步数: ${this.fullGameHistory.length}, 移除的FEN: ${removed}`);
            }
        }

        getFullGameHistory() {
            return [...this.fullGameHistory];
        }
        
        // 在 movePiece, completePromotion, handleCastling 的成功路径末尾调用 recordMoveToHistory()
        
        // 在 undoMove 中调用 removeLastMoveFromHistory()

        // --- AI 功能集成 (集成增强的按钮状态管理) ---
        initializeAI() {
            this.chessAI = new ChessAIEnhanced(this, {
                showToast: this.showToast
            });
            console.log('Chess AI Enhanced module initialized.');
        }

        addAIButton() {
            const fenActions = document.querySelector('.fen-actions');
            if (!fenActions) return;
            if (document.getElementById('ask-ai-button')) return;

            const aiButton = document.createElement('button');
            aiButton.id = 'ask-ai-button';
            aiButton.className = 'action-button chess-ai-button';
            aiButton.innerHTML = '<i class="fas fa-robot"></i> 问AI走法';
            aiButton.addEventListener('click', () => this.handleAskAI());
            
            fenActions.appendChild(aiButton);
        }

        async handleAskAI() {
            if (this.gameOver) {
                this.showToast('游戏已结束，无法询问AI');
                return;
            }
            if (this.pendingPromotion) {
                this.showToast('请先完成兵的升变选择');
                return;
            }
            
            const aiButton = document.getElementById('ask-ai-button');
            const originalText = aiButton.innerHTML;
            
            aiButton.disabled = true;
            aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI思考中...';

            try {
                this.showToast('正在获取AI建议的走法...');
                const success = await this.chessAI.askAIForMove();
                
                if (success) {
                    this.showToast('AI走法执行成功！');
                } else {
                    // 具体的失败原因已在 askAIForMove 内部 toast
                }
            } catch (error) {
                console.error('AI走法处理异常:', error);
                this.showToast(`AI走法处理失败: ${error.message}`);
            } finally {
                // 确保按钮状态在任何情况下都能恢复
                aiButton.disabled = false;
                aiButton.innerHTML = originalText;
            }
        }
        ```

### 第4步：添加CSS样式

将以下CSS代码添加到 `src/static/css/style.css` 文件末尾。

```css
/* Chess AI Button Styles */
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
    transition: background 0.3s ease, opacity 0.3s ease;
}

.chess-ai-button:hover {
    background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.chess-ai-button:disabled {
    background: #999;
    cursor: not-allowed;
    opacity: 0.7;
}
```

### 第5步：测试验证清单

实施完成后，请务必验证以下功能点：

- [ ] "问AI"按钮在棋盘界面正确显示。
- [ ] 点击按钮后显示"AI思考中"状态且按钮被禁用。
- [ ] AI返回SAN走法后在控制台显示调试信息。
- [ ] 棋盘正确执行AI建议的走法。
- [ ] 历史记录随每一步移动（包括玩家和AI）正确更新。
- [ ] 撤销操作同步更新历史记录。
- [ ] 游戏结束时、兵升变时，点击AI按钮有正确的提示。
- [ ] API调用失败或AI返回非法走法时，有清晰的用户提示，且按钮状态恢复正常。