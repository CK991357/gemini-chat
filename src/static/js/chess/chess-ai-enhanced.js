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
        const fileChar = square;
        const rankChar = square;
        const col = files.indexOf(fileChar);
        const row = 8 - parseInt(rankChar, 10);
        return { row, col };
    }

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
        return data.choices?.message?.content || data.content || '';
    }
}