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
            
            const prompt = this.buildSANMovePrompt(history, currentFEN);
            const aiResponseText = await this.sendToAI(prompt);
            
            // 记录并解析AI的响应
            return await this.parseAndExecuteSAN(aiResponseText, currentFEN);
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
        const turn = currentFEN.split(' ') === 'w' ? '白方' : '黑方';
        return `你是一个国际象棋引擎。基于以下对局历史，请给出当前局面的最佳走法。

对局历史（FEN格式，从开局到当前）：
${history.map((fen, index) => `步骤 ${index + 1}: ${fen}`).join('\n')}

当前局面FEN：${currentFEN}
当前轮到：${turn}

请只返回最佳走法的标准代数记谱法（SAN）字符串，例如：Nf3, e4, O-O, exd5, a8=Q 等。
不要返回任何其他解释、评论或多余的文字，只返回唯一的走法字符串。`;
    }

    /**
     * [增强] 解析并执行AI返回的SAN走法，包含更强的解析逻辑和健壮性
     */
    async parseAndExecuteSAN(aiResponse, currentFEN) {
        // 增强1：检查无效输入
        if (!aiResponse) {
            throw new Error('AI未返回任何内容');
        }
        console.log("AI 原始响应:", aiResponse);

        // 增强2：使用更强大的正则表达式从文本中提取SAN走法
        const sanRegex = /\b([a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?|O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8])[+#]?\b/g;
        const matches = aiResponse.match(sanRegex);

        if (!matches || matches.length === 0) {
            throw new Error('AI响应中未找到有效的棋步格式');
        }
        
        const sanMove = matches; // 默认取第一个匹配项
        console.log(`从响应中提取的SAN走法: "${sanMove}"`);

        // 使用chess.js加载当前局面以验证走法
        this.chess.load(currentFEN);
        
        // 尝试执行走法，chess.js会自动验证
        const moveObject = this.chess.move(sanMove, { sloppy: true });
        
        if (moveObject === null) {
            console.error(`chess.js 验证失败。 FEN: ${currentFEN}, 提取的SAN: ${sanMove}, 原始响应: "${aiResponse}"`);
            throw new Error(`AI返回了无效或不合法的走法: "${sanMove}"`);
        }

        const from = this.squareToIndices(moveObject.from);
        const to = this.squareToIndices(moveObject.to);

        this.showToast(`AI 建议: ${sanMove} (${moveObject.from} → ${moveObject.to})`);

        // 调用核心逻辑来移动棋子
        return this.chessGame.movePiece(from.row, from.col, to.row, to.col);
    }

    /**
     * 将棋盘坐标（如 'e4'）转换为行列索引 (已修复)
     */
    squareToIndices(square) {
        const files = 'abcdefgh';
        const fileChar = square.charAt(0);
        const rankChar = square.charAt(1);
        const col = files.indexOf(fileChar);
        const row = 8 - parseInt(rankChar, 10);
        return { row, col };
    }

    /**
     * 向后端API发送请求 (已增强日志记录)
     */
    async sendToAI(prompt) {
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'models/gemini-2.5-flash-preview-05-20',
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
            throw new Error(`API请求失败: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        // 增强3：将完整的AI响应打印到系统日志
        this.showToast(`AI 原始响应 (JSON):\n<pre>${JSON.stringify(data, null, 2)}</pre>`);
        
        // 修复：添加 return 语句并使用正确的语法
        data.choices?.[0]?.message?.content
    }
}