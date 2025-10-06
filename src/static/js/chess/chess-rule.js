/**
 * @fileoverview International Chess Rules Module
 * Contains all chess rules logic including piece movement, special moves, and game state validation.
 * Extracted from chess-core.js for better modularity and maintainability.
 */


// 棋子 Unicode 字符
export const PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// 棋子标签（无障碍）
export const PIECE_LABELS = {
    'K': 'White King', 'Q': 'White Queen', 'R': 'White Rook', 
    'B': 'White Bishop', 'N': 'White Knight', 'P': 'White Pawn',
    'k': 'Black King', 'q': 'Black Queen', 'r': 'Black Rook', 
    'b': 'Black Bishop', 'n': 'Black Knight', 'p': 'Black Pawn'
};

// 合法的棋子字符
export const VALID_PIECES = 'KQRBNPkqrbnp';
export const VALID_CASTLING = 'KQkq';

export class ChessRules {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.lastMoveError = null;
    }

    /**
     * 验证棋子移动是否符合规则
     */
    isValidPieceMove(piece, fromRow, fromCol, toRow, toCol) {
        const pieceType = piece.toLowerCase();
        
        switch (pieceType) {
            case 'k': return this.isValidKingMove(fromRow, fromCol, toRow, toCol, piece);
            case 'q': return this.isValidQueenMove(fromRow, fromCol, toRow, toCol, piece);
            case 'r': return this.isValidRookMove(fromRow, fromCol, toRow, toCol, piece);
            case 'b': return this.isValidBishopMove(fromRow, fromCol, toRow, toCol, piece);
            case 'n': return this.isValidKnightMove(fromRow, fromCol, toRow, toCol, piece);
            case 'p': return this.isValidPawnMove(fromRow, fromCol, toRow, toCol, piece);
            default: return false;
        }
    }

    /**
     * 检查王的移动是否合法
     */
    isValidKingMove(fromRow, fromCol, toRow, toCol, piece) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 王只能移动一格
        if (rowDiff <= 1 && colDiff <= 1 && (rowDiff > 0 || colDiff > 0)) {
            this.lastMoveError = null;
            return true;
        }
        
        this.lastMoveError = '王每次只能移动一格';
        return false;
    }

    /**
     * 检查车的移动是否合法
     */
    isValidRookMove(fromRow, fromCol, toRow, toCol, piece) {
        // 车只能直线移动
        if (fromRow !== toRow && fromCol !== toCol) {
            this.lastMoveError = '车只能横向或纵向移动';
            return false;
        }
        
        // 检查路径上是否有其他棋子
        if (!this.isPathClear(fromRow, fromCol, toRow, toCol)) {
            this.lastMoveError = '车移动路径被其他棋子阻挡';
            return false;
        }
        
        this.lastMoveError = null;
        return true;
    }

    /**
     * 检查象的移动是否合法
     */
    isValidBishopMove(fromRow, fromCol, toRow, toCol, piece) {
        // 象只能斜线移动
        if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) {
            this.lastMoveError = '象只能沿对角线移动';
            return false;
        }
        
        // 检查路径是否畅通
        if (!this.isPathClear(fromRow, fromCol, toRow, toCol)) {
            this.lastMoveError = '象移动路径被其他棋子阻挡';
            return false;
        }
        
        this.lastMoveError = null;
        return true;
    }

    /**
     * 检查后的移动是否合法
     */
    isValidQueenMove(fromRow, fromCol, toRow, toCol, piece) {
        // 后可以直线或斜线移动
        const isStraight = (fromRow === toRow || fromCol === toCol);
        const isDiagonal = (Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol));
        
        if (!isStraight && !isDiagonal) {
            this.lastMoveError = '后只能直线或斜线移动';
            return false;
        }
        
        if (!this.isPathClear(fromRow, fromCol, toRow, toCol)) {
            this.lastMoveError = '后移动路径被其他棋子阻挡';
            return false;
        }
        
        this.lastMoveError = null;
        return true;
    }

    /**
     * 检查马的移动是否合法
     */
    isValidKnightMove(fromRow, fromCol, toRow, toCol, piece) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 马走"日"字：一个方向2格，另一个方向1格
        const isValid = (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
        
        if (!isValid) {
            this.lastMoveError = '马走"日"字：先走两格直线再走一格横线，或先走一格直线再走两格横线';
        } else {
            this.lastMoveError = null;
        }
        
        return isValid;
    }

    /**
     * 检查兵的移动是否合法 - 修复版本
     */
    isValidPawnMove(fromRow, fromCol, toRow, toCol, piece) {
        const isWhite = piece === 'P';
        const direction = isWhite ? -1 : 1; // 白兵向上，黑兵向下
        const startRow = isWhite ? 6 : 1;   // 初始行
        
        const rowDiff = toRow - fromRow;
        const colDiff = Math.abs(toCol - fromCol);
        
        // 1. 前进一格
        if (colDiff === 0 && rowDiff === direction) {
            if (this.game.pieces[`${toRow},${toCol}`]) {
                this.lastMoveError = isWhite ?
                    '白兵前进时不能吃子，只能斜走吃子' :
                    '黑兵前进时不能吃子，只能斜走吃子';
                return false;
            }
            this.lastMoveError = null;
            return true;
        }
        
        // 2. 前进两格（仅限初始位置）
        if (colDiff === 0 && rowDiff === 2 * direction && fromRow === startRow) {
            const intermediateRow = fromRow + direction;
            if (this.game.pieces[`${intermediateRow},${toCol}`]) {
                this.lastMoveError = '兵前进两格时路径被阻挡';
                return false;
            }
            if (this.game.pieces[`${toRow},${toCol}`]) {
                this.lastMoveError = '兵前进时目标格必须为空';
                return false;
            }
            this.lastMoveError = null;
            return true;
        }
        
        // 3. 斜吃子
        if (colDiff === 1 && rowDiff === direction) {
            // 普通吃子
            if (this.game.pieces[`${toRow},${toCol}`] &&
                this.isOpponentPiece(piece, this.game.pieces[`${toRow},${toCol}`])) {
                this.lastMoveError = null;
                return true;
            }
            
            // 吃过路兵
            if (this.game.enPassant !== '-') {
                const epRow = this.getEnPassantRow();
                const epCol = this.getEnPassantCol();
                if (toRow === epRow && toCol === epCol) {
                    // 验证过路兵：必须有一个敌方兵在过路兵起始位置
                    const epPieceRow = isWhite ? 3 : 4; // 过路兵当前位置
                    if (this.game.pieces[`${epPieceRow},${epCol}`] &&
                        this.game.pieces[`${epPieceRow},${epCol}`].toLowerCase() === 'p' &&
                        this.isOpponentPiece(piece, this.game.pieces[`${epPieceRow},${epCol}`])) {
                        this.lastMoveError = null;
                        return true;
                    }
                }
            }
            
            this.lastMoveError = '兵只能斜走一格吃子，且目标格必须有对方棋子';
            return false;
        }
        
        this.lastMoveError = isWhite ?
            '白兵走法：向前走一格，起始位置可走两格，吃子时斜走' :
            '黑兵走法：向前走一格，起始位置可走两格，吃子时斜走';
        return false;
    }

    /**
     * 检查移动路径是否畅通
     */
    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowStep = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
        const colStep = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);
        
        let currentRow = fromRow + rowStep;
        let currentCol = fromCol + colStep;
        
        // 检查路径上的每个格子（不包括目标格）
        while (currentRow !== toRow || currentCol !== toCol) {
            if (this.game.pieces[`${currentRow},${currentCol}`]) {
                return false; // 路径被阻挡
            }
            currentRow += rowStep;
            currentCol += colStep;
        }
        
        return true;
    }

    /**
     * 处理王车易位
     */
    handleCastling(fromRow, fromCol, toRow, toCol) {
        const isKingside = toCol > fromCol; // 短易位（王翼易位）
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? toCol - 1 : toCol + 1;
        
        const rookFromKey = `${fromRow},${rookFromCol}`;
        const rookToKey = `${fromRow},${rookToCol}`;
        const rookPiece = this.game.pieces[rookFromKey];

        // 检查车是否存在且未移动过
        if (!rookPiece || rookPiece.toLowerCase() !== 'r') {
            this.lastMoveError = '王车易位需要王和车都在初始位置且未被移动过';
            return false;
        }

        // 检查国王和车之间的路径是否被阻挡
        const pathStartCol = Math.min(fromCol, rookFromCol);
        const pathEndCol = Math.max(fromCol, rookFromCol);
        for (let col = pathStartCol + 1; col < pathEndCol; col++) {
            if (this.game.pieces[`${fromRow},${col}`]) {
                this.lastMoveError = '王车易位时王和车之间不能有其他棋子';
                return false; // 路径上有棋子阻挡
            }
        }

        const attackingColor = this.game.currentTurn === 'w' ? 'b' : 'w';

        // 检查国王的起始格是否被攻击
        if (this.isSquareAttacked(fromRow, fromCol, attackingColor)) {
            this.lastMoveError = '王车易位时王不能处于被将军状态';
            return false; // 国王当前被将军
        }

        // 检查国王移动的路径是否被攻击
        const kingPath = [];
        if (isKingside) { // 短易位
            kingPath.push([fromRow, fromCol + 1], [fromRow, fromCol + 2]);
        } else { // 长易位
            kingPath.push([fromRow, fromCol - 1], [fromRow, fromCol - 2]);
        }

        for (const [pathRow, pathCol] of kingPath) {
            if (this.isSquareAttacked(pathRow, pathCol, attackingColor)) {
                this.lastMoveError = '王车易位时王经过的格子不能被攻击';
                return false; // 国王移动路径被攻击
            }
        }

        // 检查是否有王车易位的权利
        const castlingRights = this.game.castling;
        const color = this.game.currentTurn;
        const castlingType = color === 'w' ? (isKingside ? 'K' : 'Q') : (isKingside ? 'k' : 'q');
        
        if (!castlingRights.includes(castlingType)) {
            this.lastMoveError = '已经失去该方向的王车易位权利';
            return false; // 没有易位权利
        }

        // 执行王车易位：移动国王和车
        delete this.game.pieces[`${fromRow},${fromCol}`]; // 移除原位置的国王
        delete this.game.pieces[rookFromKey]; // 移除原位置的车
        
        this.game.pieces[`${toRow},${toCol}`] = this.game.currentTurn === 'w' ? 'K' : 'k'; // 放置国王到新位置
        this.game.pieces[rookToKey] = this.game.currentTurn === 'w' ? 'R' : 'r'; // 放置车到新位置

        this.lastMoveError = null;
        return true;
    }

    isValidTurn(piece) {
        return (this.game.currentTurn === 'w' && piece === piece.toUpperCase()) ||
               (this.game.currentTurn === 'b' && piece === piece.toLowerCase());
    }

    isSameColor(piece1, piece2) {
        return (piece1 === piece1.toUpperCase() && piece2 === piece2.toUpperCase()) ||
               (piece1 === piece1.toLowerCase() && piece2 === piece2.toLowerCase());
    }

    isOpponentPiece(piece1, piece2) {
        return !this.isSameColor(piece1, piece2);
    }

    /**
     * 检查给定格子是否被指定颜色的敌方棋子攻击
     */
    isSquareAttacked(row, col, attackingColor) {
        // 1. 兵的攻击
        const pawnDirection = attackingColor === 'w' ? 1 : -1; // 白兵向上攻击，黑兵向下攻击
        const pawnAttacks = [
            [row + pawnDirection, col - 1],
            [row + pawnDirection, col + 1]
        ];
        for (const [pawnRow, pawnCol] of pawnAttacks) {
            if (pawnRow >= 0 && pawnRow < 8 && pawnCol >= 0 && pawnCol < 8) {
                const piece = this.game.pieces[`${pawnRow},${pawnCol}`];
                if (piece && piece.toLowerCase() === 'p' &&
                    ((attackingColor === 'w' && piece === 'P') || (attackingColor === 'b' && piece === 'p'))) {
                    return true;
                }
            }
        }

        // 2. 马的攻击
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of knightMoves) {
            const knightRow = row + dr;
            const knightCol = col + dc;
            if (knightRow >= 0 && knightRow < 8 && knightCol >= 0 && knightCol < 8) {
                const piece = this.game.pieces[`${knightRow},${knightCol}`];
                if (piece && piece.toLowerCase() === 'n' &&
                    ((attackingColor === 'w' && piece === 'N') || (attackingColor === 'b' && piece === 'n'))) {
                    return true;
                }
            }
        }

        // 3. 象、车、后、王的攻击 (直线和斜线)
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1], // 直线 (车, 后, 王)
            [-1, -1], [-1, 1], [1, -1], [1, 1]  // 斜线 (象, 后, 王)
        ];

        for (const [dr, dc] of directions) {
            for (let i = 1; i < 8; i++) {
                const targetRow = row + dr * i;
                const targetCol = col + dc * i;

                if (targetRow < 0 || targetRow >= 8 || targetCol < 0 || targetCol >= 8) {
                    break; // 超出棋盘范围
                }

                const piece = this.game.pieces[`${targetRow},${targetCol}`];
                if (piece) {
                    const pieceType = piece.toLowerCase();
                    const isAttackingColor = (attackingColor === 'w' && piece === piece.toUpperCase()) ||
                                             (attackingColor === 'b' && piece === piece.toLowerCase());

                    if (isAttackingColor) {
                        // 检查是否是攻击方的棋子
                        if (
                            // 车或后在直线上
                            (dr === 0 || dc === 0) && (pieceType === 'r' || pieceType === 'q') ||
                            // 象或后在斜线上
                            (dr !== 0 && dc !== 0) && (pieceType === 'b' || pieceType === 'q') ||
                            // 王在相邻格
                            (i === 1 && pieceType === 'k')
                        ) {
                            return true;
                        }
                    }
                    break; // 遇到棋子阻挡
                }
            }
        }

        return false;
    }

    /**
     * 检查指定颜色的王是否被将军
     */
    isKingInCheck(color) {
        // 找到王的位置
        let kingPosition = null;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.game.pieces[`${row},${col}`];
                if (piece && 
                    ((color === 'w' && piece === 'K') || 
                     (color === 'b' && piece === 'k'))) {
                    kingPosition = [row, col];
                    break;
                }
            }
            if (kingPosition) break;
        }
        
        if (!kingPosition) return false;
        
        // 检查王的位置是否被对方攻击
        const attackingColor = color === 'w' ? 'b' : 'w';
        return this.isSquareAttacked(kingPosition[0], kingPosition[1], attackingColor);
    }

    /**
     * 获取指定棋子的所有合法移动
     */
    getLegalMovesForPiece(row, col) {
        const piece = this.game.pieces[`${row},${col}`];
        if (!piece) return [];
        
        const legalMoves = [];
        
        // 遍历所有可能的终点格子
        for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
                // 跳过原地不动
                if (toRow === row && toCol === col) continue;
                
                // 检查基本移动规则（包括王车易位）
                if (this.isValidPieceMove(piece, row, col, toRow, toCol)) {
                    // 检查不能吃同色棋子
                    const targetPiece = this.game.pieces[`${toRow},${toCol}`];
                    if (targetPiece && this.isSameColor(piece, targetPiece)) {
                        continue;
                    }
                    
                    // 检查移动后是否会导致自己的王被将军
                    if (!this.wouldBeInCheckAfterMove(row, col, toRow, toCol, this.game.currentTurn)) {
                        legalMoves.push([toRow, toCol]);
                    }
                }
            }
        }
        
        return legalMoves;
    }

    /**
     * 模拟移动后检查指定颜色的王是否会被将军
     */
    wouldBeInCheckAfterMove(fromRow, fromCol, toRow, toCol, color) {
        // 保存当前状态
        const originalPieces = { ...this.game.pieces };
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const movingPiece = this.game.pieces[fromKey];
        
        // 执行模拟移动
        delete this.game.pieces[fromKey];
        this.game.pieces[toKey] = movingPiece;
        
        // 如果是吃过路兵，需要移除被吃的兵
        if (movingPiece.toLowerCase() === 'p' && this.game.enPassant !== '-' &&
            toRow === this.getEnPassantRow() && toCol === this.getEnPassantCol()) {
            const epRow = this.game.currentTurn === 'w' ? toRow + 1 : toRow - 1;
            delete this.game.pieces[`${epRow},${toCol}`];
        }
        
        // 检查是否被将军
        const inCheck = this.isKingInCheck(color);
        
        // 恢复状态
        this.game.pieces = originalPieces;
        
        return inCheck;
    }

    /**
     * 检查是否三次重复局面
     */
    isThreefoldRepetition() {
        if (this.game.positionHistory.length < 6) return false; // 至少需要3个重复局面
        
        const currentPosition = this.game.positionHistory[this.game.positionHistory.length - 1];
        let repetitionCount = 0;
        
        // 统计当前局面出现的次数
        for (let i = 0; i < this.game.positionHistory.length; i++) {
            if (this.game.positionHistory[i] === currentPosition) {
                repetitionCount++;
            }
        }
        
        return repetitionCount >= 3;
    }

    /**
     * 更新易位权利
     */
    updateCastlingRights(piece, fromRow, fromCol) {
        // 如果是王移动，移除该颜色的所有易位权利
        if (piece === 'K') {
            this.game.castling = this.game.castling.replace(/[KQ]/g, '');
        } else if (piece === 'k') {
            this.game.castling = this.game.castling.replace(/[kq]/g, '');
        }
        
        // 如果是车移动，移除对应的易位权利
        if (piece === 'R') {
            if (fromRow === 7 && fromCol === 0) { // 白方后翼车
                this.game.castling = this.game.castling.replace('Q', '');
            } else if (fromRow === 7 && fromCol === 7) { // 白方王翼车
                this.game.castling = this.game.castling.replace('K', '');
            }
        } else if (piece === 'r') {
            if (fromRow === 0 && fromCol === 0) { // 黑方后翼车
                this.game.castling = this.game.castling.replace('q', '');
            } else if (fromRow === 0 && fromCol === 7) { // 黑方王翼车
                this.game.castling = this.game.castling.replace('k', '');
            }
        }
        
        // 如果易位权利字符串为空，设置为 '-'
        if (!this.game.castling) {
            this.game.castling = '-';
        }
    }

    /**
     * 更新被吃车的易位权利
     */
    updateCastlingRightsForCapturedRook(row, col) {
        if (row === 0) { // 黑方底线
            if (col === 0) this.game.castling = this.game.castling.replace('q', '');
            else if (col === 7) this.game.castling = this.game.castling.replace('k', '');
        } else if (row === 7) { // 白方底线
            if (col === 0) this.game.castling = this.game.castling.replace('Q', '');
            else if (col === 7) this.game.castling = this.game.castling.replace('K', '');
        }
        
        if (!this.game.castling) this.game.castling = '-';
    }

    /**
     * 更新过路兵目标格
     */
    updateEnPassant(piece, fromRow, fromCol, toRow, toCol) {
        // 兵前进两格，设置过路兵目标格
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            const epRow = (fromRow + toRow) / 2;
            this.game.enPassant = this.getSquareName(epRow, toCol);
        } else {
            this.game.enPassant = '-';
        }
    }

    /**
     * 获取过路兵目标行
     */
    getEnPassantRow() {
        if (this.game.enPassant === '-') return -1;
        const rank = parseInt(this.game.enPassant[1]);
        return 8 - rank;
    }

    /**
     * 获取过路兵目标列
     */
    getEnPassantCol() {
        if (this.game.enPassant === '-') return -1;
        const file = this.game.enPassant[0];
        return 'abcdefgh'.indexOf(file);
    }

    /**
     * 生成合法的FEN字符串 - 最终修复版本
     */
    generateFEN() {
        try {
            let fen = '';
            
            // 1. 棋子布局部分 - 使用更安全的实现
            for (let row = 0; row < 8; row++) {
                let emptyCount = 0;
                let rowFen = '';
                
                for (let col = 0; col < 8; col++) {
                    const piece = this.game.pieces[`${row},${col}`];
                    
                    if (piece && VALID_PIECES.includes(piece)) {
                        if (emptyCount > 0) {
                            rowFen += emptyCount.toString();
                            emptyCount = 0;
                        }
                        rowFen += piece;
                    } else {
                        emptyCount++;
                    }
                }
                
                // 处理行末的空位
                if (emptyCount > 0) {
                    rowFen += emptyCount.toString();
                }
                
                // 强制验证和修正行长度
                const squareCount = this.countSquaresInFENRow(rowFen);
                if (squareCount !== 8) {
                    console.warn(`行${row}格子数不正确: ${squareCount}, 进行修正`);
                    rowFen = this.fixFENRowLength(rowFen);
                }
                
                fen += rowFen;
                if (row < 7) fen += '/';
            }

            // 2. 验证和清理易位权利
            let cleanCastling = '';
            if (this.game.castling && this.game.castling !== '-') {
                for (const char of this.game.castling) {
                    if (VALID_CASTLING.includes(char)) {
                        cleanCastling += char;
                    }
                }
            }
            if (!cleanCastling) cleanCastling = '-';

            // 3. 验证过路兵目标格
            let cleanEnPassant = '-';
            if (this.game.enPassant !== '-' && this.game.enPassant.length === 2) {
                const file = this.game.enPassant[0];
                const rank = this.game.enPassant[1];
                if ('abcdefgh'.includes(file) && '3456'.includes(rank)) {
                    cleanEnPassant = this.game.enPassant;
                }
            }

            // 4. 组装完整FEN
            const finalFEN = `${fen} ${this.game.currentTurn} ${cleanCastling} ${cleanEnPassant} ${Math.max(0, this.game.halfMoveClock)} ${Math.max(1, this.game.fullMoveNumber)}`;

            // 5. 最终验证 - 双重保险
            if (!this.validateFEN(finalFEN) || !this.validateFinalFEN(finalFEN)) {
                console.error('FEN验证失败，返回默认位置');
                return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            }

            return finalFEN;
        } catch (error) {
            console.error('FEN生成异常:', error);
            return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        }
    }

    /**
     * 计算FEN行中的格子数
     */
    countSquaresInFENRow(fenRow) {
        let count = 0;
        for (const char of fenRow) {
            if (VALID_PIECES.includes(char)) {
                count += 1;
            } else if (!isNaN(parseInt(char))) {
                count += parseInt(char);
            }
            // 忽略其他无效字符
        }
        return count;
    }

    /**
     * 修正FEN行长度到8格 - 完全修复版本
     */
    fixFENRowLength(fenRow) {
        let currentSquares = this.countSquaresInFENRow(fenRow);
        
        if (currentSquares === 8) {
            return fenRow;
        }
        
        if (currentSquares < 8) {
            // 添加缺失的空格
            const needed = 8 - currentSquares;
            return fenRow + needed.toString();
        } else {
            // 移除多余的空格 - 更安全的实现
            let newRow = '';
            let count = 0;
            
            for (let i = 0; i < fenRow.length; i++) {
                if (count >= 8) break;
                
                const char = fenRow[i];
                if (VALID_PIECES.includes(char)) {
                    newRow += char;
                    count++;
                } else if (!isNaN(parseInt(char))) {
                    const spaces = parseInt(char);
                    const remaining = 8 - count;
                    if (spaces <= remaining) {
                        newRow += char;
                        count += spaces;
                    } else {
                        newRow += remaining.toString();
                        count = 8;
                    }
                } else {
                    // 跳过无效字符
                    continue;
                }
            }
            
            // 如果仍然不足8格，补足空格
            if (count < 8) {
                newRow += (8 - count).toString();
            }
            
            return newRow;
        }
    }

    /**
     * 验证FEN字符串的合法性
     */
    validateFEN(fen) {
        try {
            const parts = fen.split(' ');
            if (parts.length !== 6) {
                return false;
            }

            // 验证棋盘部分
            const boardPart = parts[0];
            const rows = boardPart.split('/');
            if (rows.length !== 8) {
                return false;
            }

            // 验证每行正好8个格子且只包含合法棋子
            for (let i = 0; i < 8; i++) {
                const row = rows[i];
                let squareCount = 0;
                
                for (const char of row) {
                    if (isNaN(char)) {
                        if (!VALID_PIECES.includes(char)) {
                            return false;
                        }
                        squareCount++;
                    } else {
                        const num = parseInt(char);
                        if (num < 1 || num > 8) {
                            return false;
                        }
                        squareCount += num;
                    }
                }
                
                if (squareCount !== 8) {
                    return false;
                }
            }

            // 验证回合
            if (parts[1] !== 'w' && parts[1] !== 'b') {
                return false;
            }

            // 验证易位权利
            if (parts[2] !== '-') {
                for (const char of parts[2]) {
                    if (!VALID_CASTLING.includes(char)) {
                        return false;
                    }
                }
            }

            // 验证过路兵目标格
            if (parts[3] !== '-') {
                if (parts[3].length !== 2 || 
                    !'abcdefgh'.includes(parts[3][0]) || 
                    !'12345678'.includes(parts[3][1])) {
                    return false;
                }
            }

            // 验证半回合计数
            const halfMove = parseInt(parts[4]);
            if (isNaN(halfMove) || halfMove < 0) {
                return false;
            }

            // 验证完整回合数
            const fullMove = parseInt(parts[5]);
            if (isNaN(fullMove) || fullMove < 1) {
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    validateFinalFEN(fen) {
        const parts = fen.split(' ');
        if (parts.length !== 6) return false;
        
        // 检查每行格子数
        const rows = parts[0].split('/');
        for (let i = 0; i < 8; i++) {
            if (this.countSquaresInFENRow(rows[i]) !== 8) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * 获取棋子名称
     */
    getPieceName(piece) {
        const names = {
            'Q': '后', 'R': '车', 'B': '象', 'N': '马',
            'q': '后', 'r': '车', 'b': '象', 'n': '马'
        };
        return names[piece] || '棋子';
    }

    /**
     * 获取棋盘格子名称
     */
    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    /**
     * 获取最后一次移动的错误信息
     */
    getLastMoveError() {
        return this.lastMoveError;
    }

    /**
     * 清除最后一次移动的错误信息
     */
    clearLastMoveError() {
        this.lastMoveError = null;
    }
}