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
        this.logMessage = options.logMessage || console.log;
        this.showMoveChoiceModal = options.showMoveChoiceModal || this.defaultMoveChoiceModal;
        // 新增：视觉聊天区消息显示函数
        this.displayVisionMessage = options.displayVisionMessage || console.log;
        this.chatApiHandler = options.chatApiHandler; // ✅ 接收注入的 handler
        // chess.js 实例，用于验证和解析走法
        this.chess = new Chess();

        // ====== 新增：代理 displayVisionMessage 支持按 id 更新同一条消息块 ======
        // 保存原始显示函数（通常由 main.js 注入）
        const originalDisplayVision = this.displayVisionMessage;

        // 缓存（id -> 文本）
        this._visionMsgCache = {};

        // helper: 定位容器
        const _getVisionContainer = () => {
            return document.getElementById('vision-message-history')
                || document.getElementById('message-history')
                || document.querySelector('.vision-container .vision-message-history')
                || document.querySelector('.vision-container')
                || document.body;
        };

        // helper: 立刻创建一个 AI 消息 DOM（与 vision-core 风格兼容）
        const _createAIMessageElement = (id, initialHtml = '') => {
            const container = _getVisionContainer();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ai';
            messageDiv.setAttribute('data-msg-id', id);

            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'avatar';
            avatarDiv.textContent = '🤖';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'content';

            const markdownContainer = document.createElement('div');
            markdownContainer.className = 'markdown-container';
            markdownContainer.innerHTML = initialHtml || '';

            contentDiv.appendChild(markdownContainer);
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);

            container.appendChild(messageDiv);
            return messageDiv;
        };

        // 代理函数：支持 { id, create, append } 三个选项
        this.displayVisionMessage = (content, opts = {}) => {
            const { id, create, append } = opts || {};

            // append 模式：尝试更新已有消息（若不存在则创建）
            if (append && id) {
                let existing = document.querySelector(`[data-msg-id="${id}"]`);
                if (!existing) {
                    // 直接同步创建占位 DOM（避免 race）
                    existing = _createAIMessageElement(id, content ? (typeof marked !== 'undefined' ? marked.parse(content) : content) : '');
                    this._visionMsgCache[id] = content || '';
                    return;
                } else {
                    const md = existing.querySelector('.markdown-container') || existing.querySelector('.content') || existing;
                    if (md) {
                        md.innerHTML = (typeof marked !== 'undefined') ? marked.parse(content) : content;
                    } else {
                        existing.innerHTML = (typeof marked !== 'undefined') ? marked.parse(content) : content;
                    }
                    this._visionMsgCache[id] = content;
                    return;
                }
            }

            // create 专用：立即创建占位（不调用原函数，避免 race）
            if (create && id) {
                _createAIMessageElement(id, content ? (typeof marked !== 'undefined' ? marked.parse(content) : content) : '');
                this._visionMsgCache[id] = content || '';
                return;
            }

            // 回退：调用原来的显示方法（保持兼容）
            if (typeof originalDisplayVision === 'function') {
                originalDisplayVision(content);
            } else {
                // 极端回退：简单创建 DOM
                _createAIMessageElement('fallback-' + Date.now(), (typeof marked !== 'undefined') ? marked.parse(content) : content);
            }
        };
    }

    /**
     * 辅助函数：从 localStorage 获取 API Key
     * @returns {string} API Key
     */
    _getApiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    }

    /**
     * 辅助函数：设置延时
     * @param {number} ms - 延时毫秒数
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 内部辅助函数：将 FEN 字符串转换为 ASCII 文本棋盘 - 修复版
     * @param {string} fen - FEN 字符串
     * @returns {string} ASCII 棋盘表示
     */
    _fenToAscii(fen) {
        // 验证 FEN 格式
        const fenParts = fen.split(' ');
        if (fenParts.length !== 6) {
            throw new Error(`无效的FEN格式: ${fen}`);
        }

        const [piecePlacement] = fenParts;
        let ascii = '  +------------------------+\n';
        const rows = piecePlacement.split('/');
        
        for (let i = 0; i < rows.length; i++) {
            let rowStr = `${8 - i} |`;
            let fileIndex = 0;
            
            for (const char of rows[i]) {
                if (isNaN(parseInt(char, 10))) {
                    // 棋子
                    rowStr += ` ${char} `;
                    fileIndex++;
                } else {
                    // 空格 - 逐个文件处理
                    const spaces = parseInt(char, 10);
                    for (let s = 0; s < spaces; s++) {
                        rowStr += ' . ';
                        fileIndex++;
                    }
                }
            }
            ascii += rowStr + '|\n';
        }
        ascii += '  +------------------------+\n';
        ascii += '    a  b  c  d  e  f  g  h\n';
        return ascii;
    }

    /**
     * 主方法：请求AI并执行其返回的最佳走法
     */
    async askAIForMove() {
        try {
            // 在获取FEN前确保影子引擎同步
            this.chessGame.forceShadowSync();
            
            const currentFEN = this.chessGame.getCurrentFEN();

            // --- 第一阶段：获取AI的详细分析 ---
            this.logMessage('第一阶段：向AI请求棋局分析...', 'system');
            const analysisPrompt = this.buildAnalysisPrompt(currentFEN);
            // 使用固定 id 来把流追加到同一条消息中（阶段一）
            const analysisId = `chess-analysis-${Date.now()}`;
            this.displayVisionMessage('**♟️ 国际象棋AI分析**', { id: analysisId, create: true });
            const analysisResponse = await this.sendToAI(analysisPrompt, 'models/gemini-2.5-flash', analysisId);
            const analysisLog = typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse, null, 2);
            this.logMessage(`AI分析响应: ${analysisLog}`, 'ai-analysis');

            // 🚨 关键：在两次模型请求之间设置延时，避免 429 速率限制
            const delayMs = 1000; // 1 秒延时
            this.logMessage(`等待 ${delayMs}ms 后进行第二次模型请求...`, 'system');
            await this._delay(delayMs);

            // --- 第二阶段：使用第二个AI精确提取最佳走法 ---
            this.logMessage('第二阶段：使用AI精确提取最佳走法...', 'system');
            const extractionPrompt = this.buildPreciseExtractionPrompt(analysisResponse);
            // 阶段二：走法提取，使用不同 id
            const extractionId = `chess-extract-${Date.now()}`;
            this.displayVisionMessage('**🎯 推荐走法**', { id: extractionId, create: true });
            const extractedResponse = await this.sendToAI(extractionPrompt, 'models/gemini-2.0-flash', extractionId);
            const extractionLog = typeof extractedResponse === 'string' ? extractedResponse : JSON.stringify(extractedResponse, null, 2);
            this.logMessage(`AI提取响应: "${extractionLog}"`, 'ai-extraction');

            // --- 第三阶段：验证并决策 ---
            this.logMessage('第三阶段：验证提取的走法并决策...', 'system');
            const finalMoves = this.extractAllSANFromText(extractedResponse);
            this.logMessage(`最终提取并验证了 ${finalMoves.length} 个走法: [${finalMoves.join(', ')}]`, 'debug');

            let chosenMove = null;

            if (finalMoves.length === 0) {
                throw new Error('AI未能提取出任何有效走法');
            } else {
                // 修改：无论有多少个选项，都显示选择模态框
                this.logMessage(`决策：找到 ${finalMoves.length} 个推荐走法，请求用户选择...`, 'system');
                
                // 在视觉聊天区显示选项
                const optionsText = finalMoves.length === 1 
                    ? `唯一推荐走法: **${finalMoves[0]}**`
                    : `请从以下走法中选择: ${finalMoves.join(', ')}`;
                this.displayVisionMessage(`**🤔 走法选择**\n\n${optionsText}`);
                
                try {
                    chosenMove = await this.showMoveChoiceModal(analysisResponse, finalMoves);
                    this.logMessage(`用户选择了走法: "${chosenMove}"`, 'user-choice');
                    this.displayVisionMessage(`**👤 用户确认**\n\n已确认执行走法: **${chosenMove}**`);
                } catch (error) {
                    this.showToast('用户取消了选择');
                    this.logMessage('用户取消了AI走法选择', 'info');
                    this.displayVisionMessage(`**❌ 操作取消**\n\n用户取消了走法选择`);
                    return false;
                }
            }

            // --- 第四阶段：执行 ---
            this.logMessage(`第四阶段：执行最终确定的走法 "${chosenMove}"`, 'system');
            const moveResult = await this.executeSANMove(chosenMove, currentFEN);
            
            // 新增：在视觉聊天区显示执行结果
            if (moveResult) {
                this.displayVisionMessage(`**🎊 执行成功**\n\n走法 **${chosenMove}** 已成功执行`);
            } else {
                this.displayVisionMessage(`**⚠️ 执行失败**\n\n走法 **${chosenMove}** 执行失败`);
            }
            
            return moveResult;

        } catch (error) {
            this.showToast(`AI走法获取失败: ${error.message}`);
            this.logMessage(`AI处理流程错误: ${error.message}`, 'error');
            // 新增：在视觉聊天区显示错误信息
            this.displayVisionMessage(`**💥 错误信息**\n\nAI走法获取失败: ${error.message}`);
            console.error('AI Error:', error);
            return false;
        }
    }

    /**
     * 第一阶段：构建分析提示词 - 修复版
     */
    buildAnalysisPrompt(currentFEN) {
        // 验证 FEN 格式
        const fenParts = currentFEN.split(' ');
        if (fenParts.length !== 6) {
            throw new Error(`无效的FEN格式: ${currentFEN}`);
        }

        const [piecePlacement, turnColor, castling, enPassant, halfMove, fullMove] = fenParts;
        const turn = turnColor === 'w' ? '白方 (White)' : '黑方 (Black)';
        const asciiBoard = this._fenToAscii(currentFEN);

        // ================== 修复：棋子数量和阶段判断逻辑 ==================
        // 计算棋子数量
        const pieceCount = piecePlacement.replace(/[^a-zA-Z]/g, '').length;
        
        // 计算子力价值
        const value = { p:1, n:3, b:3, r:5, q:9, k:0, P:1, N:3, B:3, R:5, Q:9, K:0 };
        let material = 0;
        for (const char of piecePlacement.replace(/\//g, '')) {
            if (value[char]) {
                material += value[char];
            }
        }

        // 简化的阶段判断逻辑
        let gamePhase;
        if (material > 60) {
            gamePhase = '开局 (Opening)';
        } else if (material > 25) {
            gamePhase = '中局 (Middlegame)';
        } else {
            gamePhase = '残局 (Endgame)';
        }
        
        // 🚨 明确棋子颜色与大小写规则
        const pieceConstraints = turnColor === 'w' 
            ? '🚨🚨 极其关键：当前为白方回合，所有推荐走法必须使用大写字母（K、Q、R、B、N、P），且必须是白方棋子的合法移动。'
            : '🚨🚨 极其关键：当前为黑方回合，所有推荐走法必须使用小写字母（k、q、r、b、n、p），且必须是黑方棋子的合法移动。';

        return `你是一位国际象棋特级大师兼规则验证专家。请基于精确的当前棋盘状态进行分析。

## 🎯 核心目标
1.  **首先，极其严格地确认当前回合方。**
2.  深度分析当前局面 → 评估优劣势 → 推荐**合法且最优的 1–2 个走法**。
3.  **绝对禁止推荐非当前回合方的走法。**

## 📋 输入信息

### 📊 当前棋盘 (ASCII 视图)
\`\`\`
${asciiBoard}
\`\`\`

🎯 当前局面 FEN: \`${currentFEN}\`
⚡ 当前回合方: ${turn}
📈 局面阶段: ${gamePhase} (基于棋子数量: ${pieceCount})
🏰 易位权利: ${castling || '无'}
🎯 吃过路兵目标格: ${enPassant !== '-' ? enPassant : '无'}

${pieceConstraints}

⚠️ 严格区分大小写。所有推荐走法必须符合当前颜色的棋子规则。（如 "Nf3" 或 "qf6"）。

---

## ✅ 验证要求（执行顺序）
1. **棋盘精确匹配**  
   - 必须对照ASCII棋盘并逐子验证起始位置有对应颜色的棋子，确保每个推荐走法的起始格确实有对应颜色的棋子。
   - 仔细解析 FEN 的棋子布局，确保每个推荐走法的起始位置确实有对应颜色的棋子。  
2. **合法性检查（推荐前必须验证）**  
   - 在推荐前，请先 mentally 模拟执行走法，确认它在该局面下是合法的。
   - 所有走法必须完全符合国际象棋规则  
   - 必须符合棋子的移动规则。  
   - 不得导致己方王被将军。  
   - 包含特殊规则（王车易位、吃过路兵、升变）。  
3. **格式标准化**  
   - 严格使用 SAN 记法（标准代数符号）。  
   - 确保大小写正确。
   - 包含所有必要符号（如 x、+、#、= 等）。
   - 确保所有必要信息都被包含。
---

## 🧠 深度分析框架

### 局面摘要
1. **核心优势**: [简述当前回合方最主要的优势，例如：空间、子力协调、兵形]
2. **主要弱点**: [简述当前回合方最需要注意的弱点或威胁，例如：王的安全、孤兵]
3. **战略目标**: [用一句话概括当前最主要的任务，例如：完成出子并王车易位、对f7格展开攻击]

### 走法推荐优先级
1. **强制战术**: 将军、得子、致命威胁
2. **战略发展**: 控制关键格、改善子力位置
3. **局面巩固**: 加强防御、消除弱点

---

## 📝 输出格式
请严格按照以下模板组织输出：

\`\`\`
### 局面分析
**当前回合方确认：${turn}**
**局面阶段判断**: ${gamePhase}
[基于上述深度分析框架的专业分析，简要总结局面倾向（如：白方稍优/均势），并点出关键的战术和战略要点。]

### 走法推荐
1. **最佳走法** [走法1的SAN格式, 如: Nf3]
   - 战略意图: [简要说明此走法的核心目标]
   - 预期效果: [此走法对局面的直接影响，例如：控制中心、准备易位]
   - 对手可能应对: [预测对手最可能的一步或两步强力应对，用逗号分隔并可附带简要说明，格式如: "2. c4 (进入后翼弃兵), 2. Nf3 (灵活发展)"]
   

2. **备选走法**: [走法2的SAN格式, 如: e4]
   - 战略意图: [简要说明此走法的核心目标]
   - 预期效果: [此走法对局面的直接影响，例如：控制中心、准备易位]
   - 对手可能应对: [预测对手最可能的几个应对。请直接列出走法，用逗号分隔并可附带简要说明，格式如: "c4 (进入后翼弃兵), Nf3 (灵活发展)"]
   
### 最终推荐
⚡ **此行必须唯一且严格遵守以下格式：**
最佳走法推荐: [走法1的SAN格式, 如: Nf3]
（不添加任何解释、符号或多余文字）
\`\`\`

---

## 🚫 严格禁止
- ❌ 推荐当前棋盘不存在的棋子移动  
- ❌ 建议非法或导致己方被将军的走法  
- ❌ 使用模糊描述代替 SAN 记法  
- ❌ 推荐错误颜色方的走法  
- ❌ 依赖历史局面信息 - 只基于当前FEN分析

请基于精确的棋盘验证与规则逻辑，输出专业、合法、可执行的最佳走法建议。`;
    }

    /**
     * 第二阶段：构建精确提取提示词 - 优化版本
     * 专门针对第一阶段输出的结构化格式设计
     */
    buildPreciseExtractionPrompt(analysisResponse) {
        return `你是一个专业的国际象棋走法提取引擎。你的任务是从下面的AI分析文本中，找出所有被明确推荐的走法。

## 🎯 提取目标
从以下结构化分析文本中提取**所有**被推荐的SAN走法：

### 提取范围包括：
1. **候选走法部分**：标记为"候选走法"中的所有走法（如 "Nf3", "e4" 等）
2. **最终推荐部分**：标记为"最佳走法推荐"后的走法

## 📋 输入文本
---
${analysisResponse}
---

## ✅ 提取规则

### 必须提取的走法类型：
- ✅ 标准棋子移动：Nf3, e4, Bb5, exd5
- ✅ 王车易位：O-O, O-O-O (保持原始大小写)
- ✅ 兵升变：e8=Q, a1=R (保持原始格式)
- ✅ 吃子走法：Nxf3, exd5
- ✅ 将军/将死：Qh5+, Rd8#
- ✅ 所有出现在"候选走法"和"最佳走法推荐"中的SAN走法

### 格式处理规则：
- 🔄 **保持原始大小写**：不要"纠正"大小写，原样保留
- 🔄 **保留完整符号**：包括x、+、#、=等所有符号
- 🔄 **王车易位特殊处理**：O-O和O-O-O必须作为一个整体提取
- 🔄 **去重处理**：如果同一走法多次出现，只保留一次

### 严格禁止：
- ❌ 不要提取分析中提到的历史走法或对方走法
- ❌ 不要提取被评价为"不好"、"劣势"的走法
- ❌ 不要修改任何走法的原始格式
- ❌ 不要添加分析文本中不存在的走法

## 🎪 特殊情形处理

### 遇到以下情况时：
1. **多个候选走法**：提取所有编号的候选走法（1. 2. 3.）
2. **最终推荐与候选重复**：仍然保留在列表中
3. **分析中散落的推荐**：如果明确用"推荐"、"好着"、"可以考虑"等词语，则提取
4. **格式略有偏差**：如"Nf3"写为"N f3"，尝试修正为"Nf3"

## 📝 输出格式

**必须且仅返回**一个逗号分隔的SAN走法列表。

示例输出：
Nf3, e4, Bb5, O-O, exd5

text

或（如果只有一个走法）：
Nf3

text

## 🚨 关键检查点
在输出前，请确认：
1. 已提取所有"候选走法"中的走法
2. 已提取"最佳走法推荐"的走法  
3. 已检查分析正文中的明确推荐
4. 所有走法保持原始大小写和格式
5. 输出是纯SAN列表，没有其他文字

现在，请从上面的分析文本中提取所有推荐的SAN走法：`;
    }

    /**
     * 解析并执行AI返回的SAN走法（含智能降级和详细诊断）
     */
    async executeSANMove(sanMove, currentFEN) {
        if (!sanMove) {
            throw new Error('最终确定的走法为空');
        }

        // 初始清理
        let cleanedMove = sanMove.replace(/^["'\s]+|["'\s.,;:]+$/g, '').trim();
        this.logMessage(`执行走法: 原始="${sanMove}" -> 清理="${cleanedMove}"`, 'debug');

        // 王车易位标准化
        cleanedMove = cleanedMove
            .replace(/\b0-0-0\b/g, 'O-O-O')
            .replace(/\b0-0\b/g, 'O-O')
            .replace(/\bo-o-o\b/gi, 'O-O-O')
            .replace(/\bo-o\b/gi, 'O-O');

        // 特殊处理：单独的"O"自动修正
        if (cleanedMove === 'O') {
            this.logMessage('检测到单独"O"，尝试自动修正为王车易位', 'warn');
            this.chess.load(currentFEN); // 确保内部棋局状态正确
            
            let foundCastlingMove = false;
            // 检查短易位 O-O 是否合法
            if (this.chess.moves({ verbose: true }).some(m => m.san === 'O-O')) {
                cleanedMove = 'O-O';
                this.logMessage(`自动修正: "O" -> "${cleanedMove}" (短易位)`, 'info');
                foundCastlingMove = true;
            } else if (this.chess.moves({ verbose: true }).some(m => m.san === 'O-O-O')) { // 检查长易位 O-O-O 是否合法
                cleanedMove = 'O-O-O';
                this.logMessage(`自动修正: "O" -> "${cleanedMove}" (长易位)`, 'info');
                foundCastlingMove = true;
            }
            
            if (!foundCastlingMove) {
                 this.logMessage('无法将单独"O"修正为合法的王车易位', 'warn');
                 // 如果修正失败，就让它继续尝试原始的 'O'，因为后续的降级策略可能会处理
            }
        }

        // 加载局面并尝试执行
        this.chess.load(currentFEN);
        let moveObject = this.chess.move(cleanedMove, { sloppy: true });

        // 如果失败，启动智能降级尝试
        if (moveObject === null) {
            this.logMessage(`初始执行失败: "${cleanedMove}"，启动降级策略...`, 'warn');
            
            const alternativeMoves = this.generateAlternativeMoves(cleanedMove, currentFEN);
            
            for (const altMove of alternativeMoves) {
                this.logMessage(`尝试替代走法: "${altMove}"`, 'debug');
                this.chess.load(currentFEN); // 重置局面
                moveObject = this.chess.move(altMove, { sloppy: true });
                
                if (moveObject !== null) {
                    cleanedMove = altMove;
                    this.logMessage(`降级成功: 使用"${cleanedMove}"`, 'info');
                    break;
                }
            }
        }

        // 最终验证
        if (moveObject === null) {
            const availableMoves = this.chess.moves();
            this.logMessage(`所有执行尝试失败。可用走法: [${availableMoves.join(', ')}]`, 'error');
            throw new Error(`无法执行走法: "${sanMove}"。请检查走法是否合法。`);
        }

        // 执行物理移动
        const from = this.squareToIndices(moveObject.from);
        const to = this.squareToIndices(moveObject.to);

        this.showToast(`AI走法: ${cleanedMove} (${moveObject.from} → ${moveObject.to})`);

        const moveResult = this.chessGame.movePiece(from.row, from.col, to.row, to.col);
        this.chessGame.renderBoard();

        return moveResult;
    }

    /**
     * 使用健壮的正则从文本中提取所有SAN走法，并进行全面规范化
     */
    extractAllSANFromText(text) {
        if (!text || typeof text !== 'string') {
            this.logMessage('提取走法：输入文本为空或非字符串', 'warn');
            return [];
        }

        this.logMessage(`原始提取文本: ${text.substring(0, 200)}...`, 'debug');

        // 全面文本预处理
        let normalized = text
            // ✅ 合并优点：从您的版本中借鉴的增强预处理
            .replace(/[\uFEFF\xA0]/g, ' ')             // 清理不可见字符
            .replace(/[🤖🤔👤🎊]/g, ' ')                // 移除特定 Emoji
            .replace(/[，、；：]/g, ',')                // 标准化中文标点
            // 保留现有版本的优点
            .replace(/（/g, '(').replace(/）/g, ')')    // 全角括号转半角
            .replace(/\b0-0-0\b/g, 'O-O-O')            // 数字零写法标准化
            .replace(/\b0-0\b/g, 'O-O')
            .replace(/\b(o-o-o)\b/gi, 'O-O-O')         // 小写字母标准化
            .replace(/\b(o-o)\b/gi, 'O-O')
            // 移除常见注释和标点
            .replace(/\([^)]*\)/g, ' ')                // 移除括号内容
            .replace(/\[[^\]]*\]/g, ' ')               // 移除方括号内容
            .replace(/[!?{}]/g, ' ')                   // 移除特殊标点
            // 压缩空白
            .replace(/\s+/g, ' ')
            .trim();

        this.logMessage(`预处理后文本: ${normalized.substring(0, 200)}...`, 'debug');

        // 进一步优化的SAN正则表达式，避免重复匹配 (✅ 合并优点：增加 i 标志变为大小写不敏感)
        const sanPattern = /\b(?:O-O-O|O-O|(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)|[a-h][1-8])\b/gi;

        const rawMatches = normalized.match(sanPattern) || [];
        this.logMessage(`原始匹配: [${rawMatches.join(', ')}]`, 'debug');

        // 深度清理和规范化
        const cleaned = rawMatches.map(s => {
            let move = s
                .replace(/^[,.;:"'!?()\s]+|[,.;:"'!?()\s]+$/g, '') // 移除两端标点
                .trim()
                // 二次标准化（保险）
                .replace(/\b0-0-0\b/g, 'O-O-O')
                .replace(/\b0-0\b/g, 'O-O')
                .replace(/\bo-o-o\b/gi, 'O-O-O')
                .replace(/\bo-o\b/gi, 'O-O');

            return move;
        }).filter(move => {
            // 过滤掉明显无效的走法
            if (!move || move.length === 0) return false;
            if (move.length === 1 && move !== 'O') return false; // 单独的字符（除了O）都无效
            if (move === '-' || move === 'x') return false; // 单独的符号无效
            return true;
        });

        // 去重并保留顺序
        const seen = new Set();
        const unique = [];
        for (const mv of cleaned) {
            if (mv && !seen.has(mv)) {
                seen.add(mv);
                unique.push(mv);
            }
        }

        this.logMessage(`最终提取走法: [${unique.join(', ')}]`, 'info');
        return unique;
    }

    /**
     * 将棋盘坐标（如 'e4'）转换为行列索引 (已修复)
     */
    squareToIndices(square) {
        const files = 'abcdefgh';
        // 修复：从 square 字符串的不同部分提取 file 和 rank
        const fileChar = square.charAt(0);
        const rankChar = square.charAt(1);
        const col = files.indexOf(fileChar);
        const row = 8 - parseInt(rankChar, 10);
        if (isNaN(col) || isNaN(row) || col < 0 || row < 0 || row > 7) {
            console.error(`无效的棋盘坐标: ${square}`);
            // 提供一个安全的回退值，尽管理论上不应发生
            return { row: 0, col: 0 };
        }
        return { row, col };
    }

    /**
     * 改进版：SSE 流式解析，支持按 messageId 更新同一条消息（避免重复气泡）
     * @param {string} prompt
     * @param {string} model
     * @param {string|null} messageId - 可选：用于将流追加到已有消息块
     */
    async sendToAI(prompt, model = 'models/gemini-2.5-flash', messageId = null) {
        try {
            this.logMessage(`发送AI请求 (模型: ${model}): ${prompt.substring(0, 120)}...`, 'debug');

            // ==== 占位消息安全创建 ====
            const msgId = messageId || `ai-${Date.now()}`;
            const existingMsg = document.querySelector(`[data-msg-id="${msgId}"]`);
            if (!existingMsg) {
                this.displayVisionMessage('', { id: msgId, create: true });
            }

            const requestBody = {
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                enableReasoning: true,  // ✅ 改成 worker.mjs 能识别的字段
                temperature: 1.0,
                top_p: 0.9
            };

            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`API请求失败: ${response.status} ${errText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            let buffer = '';
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 处理片段（可能不是完整 JSON）
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // 将 buffer 按 SSE 的空行分段，保留最后一段（可能不完整）
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // 不完整部分留给下轮

                for (const part of parts) {
                    if (!part || !part.startsWith('data: ')) continue;
                    const dataStr = part.slice(6).trim();
                    if (dataStr === '[DONE]') {
                        // 流结束
                        break;
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta;
                        // delta 里可能是 content、reasoning_content 等
                        const newText = delta?.content || delta?.reasoning_content || '';
                        if (newText) {
                            accumulatedText += newText;
                            // 立即更新同一个消息块（不会创建新气泡）
                            this.displayVisionMessage(accumulatedText, { id: msgId, append: true });
                        }
                    } catch (e) {
                        // 忽略解析错误（可能是分片）
                    }
                }
            }

            // 流结束之后，buffer 里可能有尾部
            if (buffer && buffer.startsWith('data: ')) {
                const tail = buffer.slice(6).trim();
                if (tail !== '[DONE]') {
                    try {
                        const data = JSON.parse(tail);
                        const delta = data.choices?.[0]?.delta;
                        const newText = delta?.content || delta?.reasoning_content || '';
                        if (newText) {
                            accumulatedText += newText;
                            this.displayVisionMessage(accumulatedText, { id: msgId, append: true });
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }

            return accumulatedText.trim();
        } catch (error) {
            this.logMessage(`AI请求错误: ${error.message}`, 'error');
            // 显示错误到该占位（如果没指定 id，就创建一个新消息显示错误）
            const errId = `ai-err-${Date.now()}`;
            this.displayVisionMessage(`💥 AI请求失败: ${error.message}`, { id: errId, create: true });
            throw error;
        }
    }

    /**
     * 默认的模态框处理器（修复版，支持单个选项）
     */
    defaultMoveChoiceModal(analysis, moves) {
        return new Promise((resolve, reject) => {
            // 对于单个选项，提供更友好的提示
            if (moves.length === 1) {
                const confirmMessage = `AI分析:\n${analysis}\n\nAI推荐唯一走法: ${moves[0]}\n\n点击"确定"执行此走法，或"取消"放弃。`;
                const confirmed = confirm(confirmMessage);
                if (confirmed) {
                    resolve(moves[0]);
                } else {
                    reject(new Error('用户取消了选择'));
                }
            } else {
                // 多个选项的原始逻辑
                const choice = prompt(
                    `AI分析:\n${analysis}\n\nAI提供了多个选项，请输入您想执行的走法:\n${moves.join(', ')}`,
                    moves[0] // 默认选择第一个
                );
                if (choice && moves.includes(choice)) {
                    resolve(choice);
                } else {
                    reject(new Error('用户取消或输入了无效的选择'));
                }
            }
        });
    }

    /**
     * 生成可能的替代走法（降级策略）
     */
    generateAlternativeMoves(originalMove, currentFEN) {
        const alternatives = new Set();

        // 1. 移除后缀符号
        const withoutSuffix = originalMove.replace(/[+#!?]$/g, '');
        if (withoutSuffix !== originalMove) alternatives.add(withoutSuffix);

        // 2. 大小写修正
        alternatives.add(originalMove.toUpperCase());
        alternatives.add(originalMove.toLowerCase());

        // 3. 移除空格
        const noSpaces = originalMove.replace(/\s+/g, '');
        if (noSpaces !== originalMove) alternatives.add(noSpaces);

        // 提前加载 FEN 以便复用
        this.chess.load(currentFEN);
        const legalMoves = this.chess.moves({ verbose: true });

        // 4. 自然语言解析 (改进版，基于合法走法)
        const moveLower = originalMove.toLowerCase();
        if (/castle|king.?side|queen.?side/i.test(moveLower)) {
            const canCastleShort = legalMoves.some(m => m.san === 'O-O');
            const canCastleLong = legalMoves.some(m => m.san === 'O-O-O');

            if (/queen.?side/i.test(moveLower) && canCastleLong) {
                alternatives.add('O-O-O');
            } else if (/king.?side/i.test(moveLower) && canCastleShort) {
                alternatives.add('O-O');
            } else if (/castle/i.test(moveLower)) { // 通用 "castle"
                if (canCastleShort) alternatives.add('O-O');
                if (canCastleLong) alternatives.add('O-O-O');
            }
        }

        // 5. 基于当前局面的智能建议
        // 尝试匹配类似的合法走法
        legalMoves.forEach(legalMove => {
            const legalSAN = legalMove.san;
            // 简单的相似度匹配
            if (legalSAN.includes(originalMove) ||
                originalMove.includes(legalSAN) ||
                this.moveSimilarity(originalMove, legalSAN) > 0.7) {
                alternatives.add(legalSAN);
            }
        });

        // 移除原始走法（已经失败）和空值
        alternatives.delete(originalMove);
        alternatives.delete('');

        return Array.from(alternatives);
    }

    /**
     * 简单的走法相似度计算（基于字符交集比例）
     */
    moveSimilarity(move1, move2) {
        const longer = move1.length > move2.length ? move1 : move2;
        const shorter = move1.length > move2.length ? move2 : move1;

        if (longer.length === 0) return 1.0;

        let matches = 0;
        for (let i = 0; i < shorter.length; i++) {
            if (longer.includes(shorter[i])) {
                matches++;
            }
        }

        // 返回相似度比例（0~1）
        return matches / longer.length;
    }
}

let chessAIEnhancedInstance = null;

/**
 * 初始化国际象棋AI增强模块（单例模式）
 * @param {ChessGame} chessGame - 国际象棋游戏核心实例
 * @param {object} options - 配置选项
 */
export function initializeChessAIEnhanced(chessGame, options = {}) {
    if (chessAIEnhancedInstance) {
        console.warn('ChessAIEnhanced 模块已初始化。正在更新配置。');
        // 可以在这里添加更新逻辑，例如更新 showToast
        if (options.showToast) {
            chessAIEnhancedInstance.showToast = options.showToast;
        }
        if (options.chatApiHandler) {
            chessAIEnhancedInstance.chatApiHandler = options.chatApiHandler;
        }
        return;
    }
    chessAIEnhancedInstance = new ChessAIEnhanced(chessGame, options);
    console.log('ChessAIEnhanced 模块初始化成功。');
}

/**
 * 获取国际象棋AI增强模块实例
 * @returns {ChessAIEnhanced|null}
 */
export function getChessAIEnhancedInstance() {
    if (!chessAIEnhancedInstance) {
        console.error('ChessAIEnhanced 模块尚未初始化！');
    }
    return chessAIEnhancedInstance;
}