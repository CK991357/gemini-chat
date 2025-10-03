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
        // chess.js 实例，用于验证和解析走法
        this.chess = new Chess();
    }

    /**
     * 主方法：请求AI并执行其返回的最佳走法
     */
    async askAIForMove() {
        try {
            const history = this.chessGame.getFullGameHistory();
            const currentFEN = this.chessGame.getCurrentFEN();
            
            // --- 第一阶段：获取AI分析 ---
            this.logMessage('第一阶段：向AI请求棋局分析...', 'system');
            const analysisPrompt = this.buildAnalysisPrompt(history, currentFEN);
            const analysisResponse = await this.sendToAI(analysisPrompt, 'models/gemini-2.5-flash');
            this.logMessage(`AI分析响应: ${analysisResponse}`, 'ai-analysis');

            // --- 第二阶段：智能提取与决策 ---
            this.logMessage('第二阶段：从分析中提取所有可能的走法...', 'system');
            let moves = this.extractAllSANFromText(analysisResponse);
            this.logMessage(`提取到 ${moves.length} 个可能的走法: [${moves.join(', ')}]`, 'debug');

            let finalMove = null;

            if (moves.length === 1) {
                // 情况A：找到唯一走法，直接使用
                this.logMessage('决策：找到唯一走法，将自动执行。', 'system');
                finalMove = moves;
            } else if (moves.length > 1) {
                // 情况B：找到多个走法，弹出用户选择框
                this.logMessage('决策：找到多个走法，请求用户选择...', 'system');
                try {
                    finalMove = await this.showMoveChoiceModal(analysisResponse, moves);
                    this.logMessage(`用户选择了走法: "${finalMove}"`, 'user-choice');
                } catch (error) {
                    this.showToast('用户取消了选择');
                    this.logMessage('用户取消了AI走法选择', 'info');
                    return false; // 用户取消，操作结束
                }
            } else {
                // 情况C：未找到任何走法，启动智能降级
                this.logMessage('决策：未从分析中提取到走法，启动AI降级提取...', 'system');
                this.showToast('AI分析较复杂，正在进行深度提取...');
                
                const extractionPrompt = this.buildExtractionPrompt(analysisResponse);
                const extractedResponse = await this.sendToAI(extractionPrompt, 'models/gemini-2.0-flash');
                this.logMessage(`AI降级提取响应: "${extractedResponse}"`, 'ai-extraction');

                // 再次尝试提取
                moves = this.extractAllSANFromText(extractedResponse);
                this.logMessage(`降级后提取到 ${moves.length} 个走法: [${moves.join(', ')}]`, 'debug');

                if (moves.length === 1) {
                    finalMove = moves;
                } else if (moves.length > 0) {
                    // 如果降级后仍然有多个选项，再次让用户选择
                    this.logMessage('降级后仍有多个选项，再次请求用户选择...', 'system');
                    try {
                        finalMove = await this.showMoveChoiceModal(analysisResponse, moves);
                        this.logMessage(`用户最终选择了走法: "${finalMove}"`, 'user-choice');
                    } catch (error) {
                        this.showToast('用户取消了选择');
                        this.logMessage('用户取消了AI走法选择', 'info');
                        return false;
                    }
                } else {
                    throw new Error('AI降级提取后仍未找到有效走法');
                }
            }

            // --- 第三阶段：执行 ---
            this.logMessage(`第三阶段：执行最终确定的走法 "${finalMove}"`, 'system');
            return await this.executeSANMove(finalMove, currentFEN);

        } catch (error) {
            this.showToast(`AI走法获取失败: ${error.message}`);
            this.logMessage(`AI处理流程错误: ${error.message}`, 'error');
            console.error('AI Error:', error);
            return false;
        }
    }

    /**
     * 第一阶段：构建分析提示词 (已修复和优化)
     */
    buildAnalysisPrompt(history, currentFEN) {
        // 修复：正确从FEN中获取当前走棋方
        const turnColor = currentFEN.split(' ')?.[index];
        const turn = turnColor === 'w' ? '白方 (White)' : '黑方 (Black)';

        // 优化：为AI提供更清晰的上下文和指令
        const historyText = history.length > 1
            ? `这是一个完整的对局历史，从开局到现在共有 ${history.length} 步。请聚焦于分析最后一个局面。
对局历史（FEN格式）:
${history.join('\n')}`
            : `这是一个新的棋局。`;

        return `你是一位国际象棋特级大师。请分析以下棋局。

${historyText}

当前局面 (最后一个FEN): ${currentFEN}
现在轮到: ${turn}

请你深入分析当前局面，评估双方的优劣势，并推荐1-2个最佳走法。请简要说明推荐这些走法的战略意图。
请务必使用标准代数记谱法（SAN）来表示所有提到的走法，例如：Nf3, e4, O-O, exd5, a8=Q 等。`;
    }

    /**
     * 第二阶段（降级）：构建提取提示词
     */
    buildExtractionPrompt(analysisResponse) {
        return `你是一个国际象棋走法提取器。请从以下国际象棋分析文本中，提取出最主要推荐的标准代数记谱法（SAN）走法。

分析文本：
"${analysisResponse}"

请只返回最主要推荐的那个走法的SAN字符串，不要返回任何其他解释、评论或多余的文字。
例如，如果分析中说"我认为Nf3是最好的选择"，则只返回"Nf3"。
如果分析中推荐了多个走法，请只选择第一个也是最主要推荐的那个走法。`;
    }

    /**
     * 解析并执行AI返回的SAN走法
     */
    async executeSANMove(sanMove, currentFEN) {
        if (!sanMove) {
            throw new Error('最终确定的走法为空');
        }

        // 清理走法字符串
        const cleanedMove = sanMove.replace(/^["']|["'.,]$/g, '').trim();
        this.logMessage(`清理后的SAN: "${cleanedMove}"`, 'debug');

        // 使用chess.js加载当前局面以验证走法
        this.chess.load(currentFEN);
        
        const moveObject = this.chess.move(cleanedMove, { sloppy: true });
        
        if (moveObject === null) {
            this.logMessage(`chess.js 验证失败。 FEN: ${currentFEN}, SAN: "${cleanedMove}"`, 'error');
            throw new Error(`AI返回了无效或不合法的走法: "${cleanedMove}"`);
        }

        const from = this.squareToIndices(moveObject.from);
        const to = this.squareToIndices(moveObject.to);

        this.showToast(`AI 走法: ${cleanedMove} (${moveObject.from} → ${moveObject.to})`);

        // 调用核心逻辑来移动棋子
        return this.chessGame.movePiece(from.row, from.col, to.row, to.col);
    }

    /**
     * 使用正则表达式从文本中提取所有SAN走法
     */
    extractAllSANFromText(text) {
        // 综合性的SAN正则表达式，能处理大多数情况
        const sanPattern = /\b([O-O-O|O-O]|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)\b/g;
        const matches = text.match(sanPattern);
        
        if (!matches) {
            return [];
        }
        
        // 去重并返回
        return [...new Set(matches)];
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
     * 向后端API发送请求
     */
    async sendToAI(prompt, model = 'models/gemini-2.5-flash') {
        try {
            this.logMessage(`发送AI请求 (模型: ${model}): ${prompt.substring(0, 120)}...`, 'debug');
            
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: false
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
                throw new Error(`API请求失败: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
            
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || data.content || data.choices?.[0]?.text || '';
            if (!content) {
                 this.logMessage('AI响应内容为空', 'warning');
            }
            return content;
        } catch (error) {
            this.logMessage(`AI请求错误: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * 默认的模态框处理器（以防外部未提供）
     */
    defaultMoveChoiceModal(analysis, moves) {
        return new Promise((resolve, reject) => {
            // 在实际项目中，这里应该是一个更美观的UI组件
            const choice = prompt(
                `AI分析:\n${analysis}\n\nAI提供了多个选项，请输入您想执行的走法:\n${moves.join(', ')}`,
                moves
            );
            if (choice && moves.includes(choice)) {
                resolve(choice);
            } else {
                reject(new Error('用户取消或输入了无效的选择'));
            }
        });
    }
}