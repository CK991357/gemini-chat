// src/static/js/chess/chess-ai-enhanced.js

// 风险缓解：确保 chess.js 已加载
if (typeof window.Chess === 'undefined') {
    throw new Error('chess.js 库未正确加载，请检查CDN链接');
}
const Chess = window.Chess;

// ✅ 新增：引入普通聊天的流式处理逻辑
import { ChatApiHandler } from '../chat/chat-api-handler.js';

// ✅ 提供一个安全的空依赖对象，避免 undefined 报错
const chatApiHandler = new ChatApiHandler({
    toolManager: null,
    historyManager: null,
    state: {},
    libs: {},
    config: { API: { AVAILABLE_MODELS: [] } } // 避免 .config.API 报错
});

export class ChessAIEnhanced {
    constructor(chessGame, options = {}) {
        this.chessGame = chessGame;
        this.showToast = options.showToast || console.log;
        this.logMessage = options.logMessage || console.log;
        this.showMoveChoiceModal = options.showMoveChoiceModal || this.defaultMoveChoiceModal;
        // 新增：视觉聊天区消息显示函数
        this.displayVisionMessage = options.displayVisionMessage || console.log;
        // chess.js 实例，用于验证和解析走法
        this.chess = new Chess();
    }

    /**
     * 主方法：请求AI并执行其返回的最佳走法
     */
    async askAIForMove() {
        try {
            // 在获取FEN前确保影子引擎同步
            this.chessGame.forceShadowSync();
            
            const history = this.chessGame.getFullGameHistory();
            const currentFEN = this.chessGame.getCurrentFEN();

            // --- 第一阶段：获取AI的详细分析 ---
            this.logMessage('第一阶段：向AI请求棋局分析...', 'system');
            const analysisPrompt = this.buildAnalysisPrompt(history, currentFEN);
            const analysisResponse = await this.sendToAI(analysisPrompt, 'models/gemini-2.5-flash');
            const analysisLog = typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse, null, 2);
            this.logMessage(`AI分析响应: ${analysisLog}`, 'ai-analysis');
            
            // 新增：在视觉聊天区显示详细分析
            this.displayVisionMessage(`**♟️ 国际象棋AI分析**\n\n${analysisResponse}`);

            // --- 第二阶段：使用第二个AI精确提取最佳走法 ---
            this.logMessage('第二阶段：使用AI精确提取最佳走法...', 'system');
            const extractionPrompt = this.buildPreciseExtractionPrompt(analysisResponse);
            const extractedResponse = await this.sendToAI(extractionPrompt, 'models/gemini-2.0-flash');
            const extractionLog = typeof extractedResponse === 'string' ? extractedResponse : JSON.stringify(extractedResponse, null, 2);
            this.logMessage(`AI提取响应: "${extractionLog}"`, 'ai-extraction');
            
            // 新增：在视觉聊天区显示提取的走法
            this.displayVisionMessage(`**🎯 推荐走法**\n\n${extractedResponse}`);

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
     * 第一阶段：构建分析提示词 (已修复和优化)
     */
    buildAnalysisPrompt(history, currentFEN) {
        // 修复：正确从FEN中获取当前走棋方
        const turnColor = currentFEN.split(' ')?.[1];
        const turn = turnColor === 'w' ? '白方 (White)' : '黑方 (Black)';

        // 优化：为AI提供更清晰的上下文和指令
        const historyText = history.length > 1
            ? `这是一个完整的对局历史，从开局到现在共有 ${history.length} 步。请聚焦于分析最后一个局面。
对局历史（FEN格式）:
${history.join('\n')}`
            : `这是一个新的棋局。`;

        // 明确棋子颜色标识
        const pieceColorExplanation = turnColor === 'w'
            ? '注意：当前是白方回合，所有推荐的走法都应使用大写字母表示白方棋子（K、Q、R、B、N、P）'
            : '注意：当前是黑方回合，所有推荐的走法都应使用小写字母表示黑方棋子（k、q、r、b、n、p）';

        return `你是一位国际象棋特级大师。请分析以下棋局。

${historyText}

当前局面 (最后一个FEN): ${currentFEN}
现在轮到: ${turn}

${pieceColorExplanation}

**重要规则：**
- 白方棋子使用大写字母：K, Q, R, B, N, P
- 黑方棋子使用小写字母：k, q, r, b, n, p
- 棋盘列用字母 a-h 表示，行用数字 1-8 表示
- 走法使用标准代数记谱法 (SAN)：
- 棋子缩写：K（王）、Q（后）、R（车）、B（象）、N（马）、P（兵，通常省略）
- 普通走法格式：${turnColor === 'w' ? 'Nf3, e4, Bb4, O-O' : 'nf6, e5, bb4, o-o'}等
- 王车易位使用：${turnColor === 'w' ? 'O-O（短易位）或 O-O-O（长易位）' : 'o-o（短易位）或 o-o-o（长易位）'}
- 兵升变格式：${turnColor === 'w' ? 'e8=Q, a1=Q' : 'e1=q, a1=q'}等
- 吃子使用 "x"：${turnColor === 'w' ? 'Nxf3, exd5' : 'nxf3, exd5'}
- 将军使用 "+"，将死使用 "#"
- 给出推荐走法前，请检查棋盘最新的布局，不要返回任何无效的走法，只推荐合法的走法

**分析要求：**
1.请你明确当前回合方，深入分析当前局面，评估双方的优劣势。
2.推荐1-3个最佳走法。请简要说明每一个推荐走法的战略意图。
3. 在分析的最后，明确给出你认为的**最佳走法**，并用"**最佳走法推荐: [走法]**"的格式标出。

请务必使用标准代数记谱法（SAN）来表示所有提到的走法，例如：Nf3, e4, O-O, exd5, a8=Q 等，同时确保推荐走法的字母与当前回合方一致。`;
    }

    /**
     * 第二阶段：构建精确提取提示词 (修复王车易位解析问题)
     */
    buildPreciseExtractionPrompt(analysisResponse) {
        return `你是一个专业的国际象棋走法提取引擎。你的任务是从下面的分析文本中，找出所有被明确推荐为"最佳"或"推荐"的走法。

**重要规则：**
1. **提取所有推荐走法**：找出文本中所有被正面推荐的走法。通常会用"最佳走法推荐"、"...是最佳选择"、"或者...也是一个好选择"等词语来标识。
   - 当前回合的最佳走法
   - 备选走法或替代方案  
   - 未来回合的战略建议
   - 通常会用"推荐"、"最佳"、"好选择"、"或者"、"也可以考虑"等词语标识
   - 严格按照分析文本中的表述提取，不要添加文本中没有明确推荐的走法
2. **保持原始格式**：不要修改走法的大小写，保持分析文本中的原始格式
3. **特殊走法处理**：
   - 王车易位必须保持完整："O-O" 或 "O-O-O"，不能分割
   - 兵升变必须保持完整："e8=Q"、"a1=R" 等
   - 吃子走法："Nxf3"、"exd5" 等
   - 将军和将死："Qh5+"、"Rd8#" 等
   - 保持原始大小写格式，不要"纠正"大小写
   - 如果遇到"O-O"或"O-O-O"，必须原样保留
   - 确保走法格式完整，包括所有必要的符号（x, +, #, =），不要修改任何部分。
4. **逗号分隔格式**：将所有找到的SAN走法以一个半角逗号分隔的列表形式返回。例如："Nf6, O-O, exd5, e8=Q"。
5. **只返回SAN列表**：你的输出必须是且仅是这个逗号分隔的SAN字符串列表。不要添加任何解释、编号、前缀或多余的文字。
6. **忽略负面走法**：不要提取那些被评价为"不可取"、"劣势"或仅用于分析目的的走法。


**分析文本如下：**
---
${analysisResponse}
---

**你的输出应该是一个逗号分隔的SAN字符串列表，例如 "Nf6, O-O, exd5, O-O-O, Nxf3, exd5"。**`;
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
        const moveResult = this.chessGame.movePiece(from.row, from.col, to.row, to.col);
        
        // 强制UI刷新以确保棋子移动在视觉上同步
        this.chessGame.renderBoard();
        
        return moveResult;
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
 * ✅ 改进版：支持流式返回（与普通聊天机制对齐）
 */
async sendToAI(prompt, model = 'models/gemini-2.5-flash') {
    try {
        this.logMessage(`发送AI请求 (模型: ${model}): ${prompt.substring(0, 120)}...`, 'debug');

        let finalText = '';
        await chatApiHandler.sendStreamMessage({
            model,
            prompt,
            onDelta: (chunk) => {
                // 每接收到新块时更新视觉聊天内容
                if (chunk && typeof chunk === 'string') {
                    finalText += chunk;
                    if (this.displayVisionMessage) {
                        this.displayVisionMessage(chunk);
                    }
                }
            },
            onComplete: (full) => {
                finalText = full || finalText;
            },
            onError: (err) => {
                console.error('AI流错误:', err);
                this.displayVisionMessage(`⚠️ 流接收异常: ${err.message}`);
            },
        });

        return finalText.trim();
    } catch (error) {
        this.logMessage(`AI请求错误: ${error.message}`, 'error');
        this.displayVisionMessage(`💥 AI请求失败: ${error.message}`);
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