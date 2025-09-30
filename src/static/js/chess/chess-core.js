/**
 * @fileoverview Core logic for the Chess FEN Recorder feature.
 * Handles chess board rendering, piece movement, and FEN generation.
 */

import { Logger } from '../utils/logger.js';

// 棋子 Unicode 字符
const PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// 棋子标签（无障碍）
const PIECE_LABELS = {
    'K': 'White King', 'Q': 'White Queen', 'R': 'White Rook', 
    'B': 'White Bishop', 'N': 'White Knight', 'P': 'White Pawn',
    'k': 'Black King', 'q': 'Black Queen', 'r': 'Black Rook', 
    'b': 'Black Bishop', 'n': 'Black Knight', 'p': 'Black Pawn'
};

class ChessGame {
    constructor(options = {}) {
        this.showToast = options.showToast || console.log;
        
        // 等待DOM完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
            return;
        }
        this.initialize();
    }

    initialize() {
        // 直接使用全局DOM元素，不通过容器传递
        this.boardElement = document.getElementById('chess-board');
        this.fenOutput = document.getElementById('fen-output');
        this.copyFenButton = document.getElementById('copy-fen-button');
        this.resetButton = document.getElementById('reset-chess-button');
        this.undoButton = document.getElementById('undo-move-button');
        this.toggleButton = document.getElementById('toggle-to-vision-button');
        
        // 全屏元素引用
        this.chessFullscreen = document.getElementById('chess-fullscreen');
        this.visionChatFullscreen = document.getElementById('vision-chat-fullscreen');
        
        // 检查必要元素是否存在
        if (!this.boardElement) {
            console.error('Chess board element (#chess-board) not found');
            return;
        }
        
        console.log('Chess board element found:', this.boardElement);
        
        this.pieces = {};
        this.currentTurn = 'w';
        this.castling = 'KQkq';
        this.enPassant = '-';
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.selectedSquare = null;
        this.moveHistory = [];
        this.pendingPromotion = null; // 等待升变的棋子
        this.gameOver = false; // 新增：游戏结束状态
        
        // 初始化
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
        this.createPromotionModal();
        this.createGameOverModal(); // 新增：创建游戏结束模态框
    }

    initBoard() {
        if (!this.boardElement) {
            console.error('Chess board element not found');
            return;
        }

        console.log('Initializing chess board...');
        this.boardElement.innerHTML = '';

        // 创建棋盘格子
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `chess-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.addEventListener('click', () => this.handleSquareClick(row, col));
                
                // 添加拖放支持
                square.addEventListener('dragover', (e) => e.preventDefault());
                square.addEventListener('drop', (e) => this.handleDrop(e, row, col));
                
                this.boardElement.appendChild(square);
            }
        }
        
        console.log('Chess board initialized with', this.boardElement.children.length, 'squares');
    }

    setupInitialPosition() {
        // 初始棋盘设置 (FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1)
        const initialPosition = {
            // 黑方棋子
            '0,0': 'r', '0,1': 'n', '0,2': 'b', '0,3': 'q', '0,4': 'k', '0,5': 'b', '0,6': 'n', '0,7': 'r',
            '1,0': 'p', '1,1': 'p', '1,2': 'p', '1,3': 'p', '1,4': 'p', '1,5': 'p', '1,6': 'p', '1,7': 'p',
            // 白方棋子
            '6,0': 'P', '6,1': 'P', '6,2': 'P', '6,3': 'P', '6,4': 'P', '6,5': 'P', '6,6': 'P', '6,7': 'P',
            '7,0': 'R', '7,1': 'N', '7,2': 'B', '7,3': 'Q', '7,4': 'K', '7,5': 'B', '7,6': 'N', '7,7': 'R'
        };

        this.pieces = { ...initialPosition };
        this.moveHistory = [];
        this.castling = 'KQkq'; // 确保初始有所有易位权利
        this.enPassant = '-';
        this.currentTurn = 'w';
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.pendingPromotion = null;
        this.gameOver = false; // 重置游戏结束状态
        
        this.renderBoard();
        this.updateFEN();
    }

    undoMove() {
        if (this.moveHistory.length > 0) {
            const previousFEN = this.moveHistory.pop();
            this.loadFEN(previousFEN);
            // 移除撤销提示，只保留棋局相关提示
        }
        // 移除没有可撤销移动的提示
    }

    renderBoard() {
        if (!this.boardElement) return;

        // 清除所有棋子
        const squares = this.boardElement.querySelectorAll('.chess-square');
        squares.forEach(square => {
            square.innerHTML = '';
            square.classList.remove('selected', 'highlight');
        });

        // 渲染棋子
        Object.entries(this.pieces).forEach(([key, piece]) => {
            const [row, col] = key.split(',').map(Number);
            const square = this.getSquareElement(row, col);
            if (square && piece in PIECES) {
                const pieceElement = document.createElement('div');
                pieceElement.className = 'chess-piece';
                pieceElement.textContent = PIECES[piece];
                pieceElement.draggable = true;
                pieceElement.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', `${row},${col}`);
                });
                
                const label = document.createElement('span');
                label.className = 'chess-piece-label';
                label.textContent = piece;
                
                square.appendChild(pieceElement);
                square.appendChild(label);
            }
        });

        // 高亮选中的格子
        if (this.selectedSquare) {
            const [row, col] = this.selectedSquare;
            this.getSquareElement(row, col)?.classList.add('selected');
        }
    }

    handleSquareClick(row, col) {
        // 如果游戏已结束，不允许操作
        if (this.gameOver) {
            return;
        }

        // 如果有等待的升变，先处理升变
        if (this.pendingPromotion) {
            this.showToast('请先完成兵升变选择');
            return;
        }

        const piece = this.pieces[`${row},${col}`];
        
        if (this.selectedSquare) {
            // 已经有选中的棋子，尝试移动
            const [fromRow, fromCol] = this.selectedSquare;
            this.movePiece(fromRow, fromCol, row, col);
            this.selectedSquare = null;
        } else if (piece && this.isValidTurn(piece)) {
            // 选中一个棋子
            this.selectedSquare = [row, col];
        } else if (piece) {
            this.showToast(`现在轮到${this.currentTurn === 'w' ? '白方' : '黑方'}走棋`);
        }
        
        this.renderBoard();
    }

    handleDrop(e, toRow, toCol) {
        e.preventDefault();
        
        // 如果游戏已结束，不允许操作
        if (this.gameOver) {
            return;
        }
        
        // 如果有等待的升变，先处理升变
        if (this.pendingPromotion) {
            this.showToast('请先完成兵升变选择');
            return;
        }

        const data = e.dataTransfer.getData('text/plain');
        const [fromRow, fromCol] = data.split(',').map(Number);
        
        this.movePiece(fromRow, fromCol, toRow, toCol);
        this.selectedSquare = null;
        this.renderBoard();
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        // 如果游戏已结束，不允许移动
        if (this.gameOver) {
            return false;
        }

        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const piece = this.pieces[fromKey];

        if (!piece) {
            this.showToast('没有选中棋子');
            return false;
        }

        if (!this.isValidTurn(piece)) {
            this.showToast(`现在轮到${this.currentTurn === 'w' ? '白方' : '黑方'}走棋`);
            return false;
        }

        // 基本规则检查：不能吃己方棋子
        if (this.pieces[toKey] && this.isSameColor(piece, this.pieces[toKey])) {
            this.showToast('不能吃掉自己的棋子');
            return false;
        }

        // 新增：检查移动规则
        if (!this.isValidPieceMove(piece, fromRow, fromCol, toRow, toCol)) {
            this.showToast('移动不符合规则');
            return false;
        }

        // 在移动前保存当前 FEN 到历史记录
        this.moveHistory.push(this.generateFEN());

        // 保存被吃的棋子（用于易位权利更新）
        const capturedPiece = this.pieces[toKey];

        // 检查是否是王车易位
        if (piece.toLowerCase() === 'k' && Math.abs(fromCol - toCol) === 2) {
            // 王车易位：国王移动了两格
            if (!this.handleCastling(fromRow, fromCol, toRow, toCol)) {
                this.showToast('王车易位不符合规则');
                this.moveHistory.pop(); // 移除无效的历史记录
                return false;
            }
            // 王车易位后，直接更新游戏状态，因为 handleCastling 已经处理了棋子移动
            this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
            this.updateFEN();
            this.showToast(`${this.currentTurn === 'w' ? '白方' : '黑方'}完成了${toCol > fromCol ? '短' : '长'}易位`);
            return true;
        } else {
            // 普通移动
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;
        }

        // 检查被吃的棋子是否是车，更新易位权利
        if (capturedPiece && capturedPiece.toLowerCase() === 'r') {
            this.updateCastlingRightsForCapturedRook(toRow, toCol);
        }

        // 检查吃过路兵
        if (piece.toLowerCase() === 'p' && this.enPassant !== '-' && 
            toRow === this.getEnPassantRow() && toCol === this.getEnPassantCol()) {
            // 验证过路兵条件：必须是敌方兵刚刚移动两格
            const epRow = this.currentTurn === 'w' ? toRow + 1 : toRow - 1;
            const epPiece = this.pieces[`${epRow},${toCol}`];
            
            if (epPiece && epPiece.toLowerCase() === 'p' && this.isOpponentPiece(piece, epPiece)) {
                // 删除被吃的过路兵
                delete this.pieces[`${epRow},${toCol}`];
                this.showToast('吃过路兵！');
            }
        }

        // 检查兵升变
        if (piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7)) {
            // 设置等待升变状态，不立即升变
            this.pendingPromotion = { row: toRow, col: toCol, piece: piece };
            this.showPromotionModal(toRow, toCol);
            // 注意：这里不调用 promotePawn，而是等待用户选择
        } else {
            // 更新游戏状态（非升变情况）
            this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
        }

        this.updateFEN();
        return true;
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
            return true;
        }
        
        // 王车易位已经在 handleCastling 中处理
        return false;
    }

    /**
     * 检查车的移动是否合法
     */
    isValidRookMove(fromRow, fromCol, toRow, toCol, piece) {
        // 车只能直线移动
        if (fromRow !== toRow && fromCol !== toCol) {
            return false;
        }
        
        // 检查路径上是否有其他棋子
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 检查象的移动是否合法
     */
    isValidBishopMove(fromRow, fromCol, toRow, toCol, piece) {
        // 象只能斜线移动
        if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) {
            return false;
        }
        
        // 检查路径是否畅通
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 检查后的移动是否合法
     */
    isValidQueenMove(fromRow, fromCol, toRow, toCol, piece) {
        // 后可以直线或斜线移动
        const isStraight = (fromRow === toRow || fromCol === toCol);
        const isDiagonal = (Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol));
        
        if (!isStraight && !isDiagonal) {
            return false;
        }
        
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 检查马的移动是否合法
     */
    isValidKnightMove(fromRow, fromCol, toRow, toCol, piece) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        
        // 马走"日"字：一个方向2格，另一个方向1格
        return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
    }

    /**
     * 检查兵的移动是否合法
     */
    isValidPawnMove(fromRow, fromCol, toRow, toCol, piece) {
        const isWhite = piece === 'P';
        const direction = isWhite ? -1 : 1; // 白兵向上，黑兵向下
        const startRow = isWhite ? 6 : 1;   // 初始行
        
        const rowDiff = toRow - fromRow;
        const colDiff = Math.abs(toCol - fromCol);
        
        // 1. 前进一格
        if (colDiff === 0 && rowDiff === direction) {
            return !this.pieces[`${toRow},${toCol}`]; // 目标格必须为空
        }
        
        // 2. 前进两格（仅限初始位置）
        if (colDiff === 0 && rowDiff === 2 * direction && fromRow === startRow) {
            const intermediateRow = fromRow + direction;
            return !this.pieces[`${intermediateRow},${toCol}`] && 
                   !this.pieces[`${toRow},${toCol}`];
        }
        
        // 3. 斜吃子
        if (colDiff === 1 && rowDiff === direction) {
            // 普通吃子
            if (this.pieces[`${toRow},${toCol}`] && 
                this.isOpponentPiece(piece, this.pieces[`${toRow},${toCol}`])) {
                return true;
            }
            
            // 吃过路兵
            if (this.enPassant !== '-') {
                const epRow = this.getEnPassantRow();
                const epCol = this.getEnPassantCol();
                if (toRow === epRow && toCol === epCol) {
                    return true;
                }
            }
        }
        
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
            if (this.pieces[`${currentRow},${currentCol}`]) {
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
        const rookPiece = this.pieces[rookFromKey];

        // 检查车是否存在且未移动过
        if (!rookPiece || rookPiece.toLowerCase() !== 'r') {
            return false;
        }

        // 检查国王和车之间的路径是否被阻挡
        const pathStartCol = Math.min(fromCol, rookFromCol);
        const pathEndCol = Math.max(fromCol, rookFromCol);
        for (let col = pathStartCol + 1; col < pathEndCol; col++) {
            if (this.pieces[`${fromRow},${col}`]) {
                return false; // 路径上有棋子阻挡
            }
        }

        const attackingColor = this.currentTurn === 'w' ? 'b' : 'w';

        // 检查国王的起始格是否被攻击
        if (this.isSquareAttacked(fromRow, fromCol, attackingColor)) {
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
                return false; // 国王移动路径被攻击
            }
        }

        // 检查是否有王车易位的权利
        const castlingRights = this.castling;
        const color = this.currentTurn;
        const castlingType = color === 'w' ? (isKingside ? 'K' : 'Q') : (isKingside ? 'k' : 'q');
        
        if (!castlingRights.includes(castlingType)) {
            return false; // 没有易位权利
        }

        // 执行王车易位：移动国王和车
        delete this.pieces[`${fromRow},${fromCol}`]; // 移除原位置的国王
        delete this.pieces[rookFromKey]; // 移除原位置的车
        
        this.pieces[`${toRow},${toCol}`] = this.currentTurn === 'w' ? 'K' : 'k'; // 放置国王到新位置
        this.pieces[rookToKey] = this.currentTurn === 'w' ? 'R' : 'r'; // 放置车到新位置

        return true;
    }

    isValidTurn(piece) {
        return (this.currentTurn === 'w' && piece === piece.toUpperCase()) ||
               (this.currentTurn === 'b' && piece === piece.toLowerCase());
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
     * @param {number} row - 格子的行
     * @param {number} col - 格子的列
     * @param {string} attackingColor - 攻击方的颜色 ('w' 或 'b')
     * @returns {boolean} - 如果被攻击则返回 true，否则返回 false
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
                const piece = this.pieces[`${pawnRow},${pawnCol}`];
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
                const piece = this.pieces[`${knightRow},${knightCol}`];
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

                const piece = this.pieces[`${targetRow},${targetCol}`];
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
                const piece = this.pieces[`${row},${col}`];
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
     * 检查是否将死
     */
    isCheckmate(color) {
        // 如果不在将军状态，肯定不是将死
        if (!this.isKingInCheck(color)) {
            return false;
        }
        
        // 简化版本：这里应该检查是否有任何合法移动可以解除将军
        // 由于我们没有实现完整的走法规则，这里暂时返回false
        // 在实际实现中，需要遍历所有可能的移动来检查是否能解除将军
        return false;
    }

    /**
     * 检查是否逼和（无子可动）
     */
    isStalemate(color) {
        // 如果在将军状态，不是逼和
        if (this.isKingInCheck(color)) {
            return false;
        }
        
        // 简化版本：这里应该检查是否有任何合法移动
        // 由于我们没有实现完整的走法规则，这里暂时返回false
        return false;
    }

    updateGameState(piece, fromRow, fromCol, toRow, toCol) {
        // 切换回合
        this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w';
        
        // 更新完整回合数（黑方走完后）
        if (this.currentTurn === 'w') {
            this.fullMoveNumber++;
        }

        // 更新半回合计数（用于50步规则）
        if (piece.toLowerCase() === 'p' || this.pieces[`${toRow},${toCol}`]) {
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        // 处理王车易位权利
        this.updateCastlingRights(piece, fromRow, fromCol);

        // 处理过路兵
        this.updateEnPassant(piece, fromRow, fromCol, toRow, toCol);
        
        // 检查游戏结束条件
        this.checkGameEndConditions();
    }

    /**
     * 检查游戏结束条件
     */
    checkGameEndConditions() {
        const opponentColor = this.currentTurn; // 当前回合的玩家是刚刚移动的玩家的对手
        
        // 检查将死
        if (this.isCheckmate(opponentColor)) {
            const winner = this.currentTurn === 'w' ? '白方' : '黑方';
            this.showGameOverModal(`将死！${winner}获胜！`);
            this.gameOver = true;
            return;
        }
        
        // 检查逼和
        if (this.isStalemate(opponentColor)) {
            this.showGameOverModal('逼和！游戏平局。');
            this.gameOver = true;
            return;
        }
        
        // 检查50步规则（50个完整回合 = 100个半回合）
        if (this.halfMoveClock >= 100) {
            this.showGameOverModal('50步规则，和棋！');
            this.gameOver = true;
            return;
        }
        
        // 检查将军
        if (this.isKingInCheck(opponentColor)) {
            this.showToast('将军！');
        }
    }

    updateCastlingRights(piece, fromRow, fromCol) {
        // 如果是王移动，移除该颜色的所有易位权利
        if (piece === 'K') {
            this.castling = this.castling.replace(/[KQ]/g, '');
        } else if (piece === 'k') {
            this.castling = this.castling.replace(/[kq]/g, '');
        }
        
        // 如果是车移动，移除对应的易位权利
        if (piece === 'R') {
            if (fromRow === 7 && fromCol === 0) { // 白方后翼车
                this.castling = this.castling.replace('Q', '');
            } else if (fromRow === 7 && fromCol === 7) { // 白方王翼车
                this.castling = this.castling.replace('K', '');
            }
        } else if (piece === 'r') {
            if (fromRow === 0 && fromCol === 0) { // 黑方后翼车
                this.castling = this.castling.replace('q', '');
            } else if (fromRow === 0 && fromCol === 7) { // 黑方王翼车
                this.castling = this.castling.replace('k', '');
            }
        }
        
        // 如果易位权利字符串为空，设置为 '-'
        if (!this.castling) {
            this.castling = '-';
        }
    }

    /**
     * 更新被吃车的易位权利
     */
    updateCastlingRightsForCapturedRook(row, col) {
        if (row === 0) { // 黑方底线
            if (col === 0) this.castling = this.castling.replace('q', '');
            else if (col === 7) this.castling = this.castling.replace('k', '');
        } else if (row === 7) { // 白方底线
            if (col === 0) this.castling = this.castling.replace('Q', '');
            else if (col === 7) this.castling = this.castling.replace('K', '');
        }
        
        if (!this.castling) this.castling = '-';
    }

    updateEnPassant(piece, fromRow, fromCol, toRow, toCol) {
        // 兵前进两格，设置过路兵目标格
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            const epRow = (fromRow + toRow) / 2;
            this.enPassant = this.getSquareName(epRow, toCol);
        } else {
            this.enPassant = '-';
        }
    }

    /**
     * 创建兵升变模态框
     */
    createPromotionModal() {
        // 检查是否已存在模态框
        if (document.getElementById('promotion-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'promotion-modal';
        modal.className = 'promotion-modal';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="promotion-content">
                <h3>选择升变棋子</h3>
                <div class="promotion-options">
                    <button class="promotion-option" data-piece="q">♕ 后</button>
                    <button class="promotion-option" data-piece="r">♖ 车</button>
                    <button class="promotion-option" data-piece="b">♗ 象</button>
                    <button class="promotion-option" data-piece="n">♘ 马</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加事件监听器
        modal.querySelectorAll('.promotion-option').forEach(button => {
            button.addEventListener('click', (e) => {
                const pieceType = e.target.dataset.piece;
                this.completePromotion(pieceType);
            });
        });
    }

    /**
     * 创建游戏结束模态框
     */
    createGameOverModal() {
        // 检查是否已存在模态框
        if (document.getElementById('chess-game-over-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'chess-game-over-modal';
        modal.className = 'chess-game-over-modal';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="chess-game-over-content">
                <h2>游戏结束</h2>
                <p id="chess-game-over-message"></p>
                <div class="chess-game-over-buttons">
                    <button id="chess-new-game-btn" class="chess-btn-primary">开始新游戏</button>
                    <button id="chess-close-modal-btn" class="chess-btn-secondary">关闭</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加事件监听器
        document.getElementById('chess-new-game-btn').addEventListener('click', () => {
            this.setupInitialPosition();
            modal.style.display = 'none';
        });
        
        document.getElementById('chess-close-modal-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    /**
     * 显示游戏结束模态框
     */
    showGameOverModal(message) {
        const modal = document.getElementById('chess-game-over-modal');
        if (!modal) return;
        
        const messageElement = document.getElementById('chess-game-over-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        modal.style.display = 'flex';
        this.showToast(message);
    }

    /**
     * 显示兵升变选择界面
     */
    showPromotionModal(row, col) {
        const modal = document.getElementById('promotion-modal');
        if (!modal) return;
        
        // 根据棋子颜色设置选项
        const isWhite = this.pendingPromotion.piece === 'P';
        const options = modal.querySelectorAll('.promotion-option');
        
        options.forEach(option => {
            const pieceType = option.dataset.piece;
            const pieceChar = isWhite ? pieceType.toUpperCase() : pieceType;
            option.textContent = `${PIECES[pieceChar]} ${this.getPieceName(pieceChar)}`;
        });
        
        modal.style.display = 'flex';
        this.showToast('请选择兵升变的棋子');
    }

    /**
     * 完成兵升变
     */
    completePromotion(pieceType) {
        if (!this.pendingPromotion) return;
        
        const { row, col, piece } = this.pendingPromotion;
        const isWhite = piece === 'P';
        const newPiece = isWhite ? pieceType.toUpperCase() : pieceType;
        
        // 更新棋子
        this.pieces[`${row},${col}`] = newPiece;
        
        // 隐藏模态框
        const modal = document.getElementById('promotion-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // 更新游戏状态
        this.updateGameState(piece, row, col, row, col); // 使用相同的行列表示这是升变
        this.updateFEN();
        
        this.showToast(`兵升变为${this.getPieceName(newPiece)}`);
        this.pendingPromotion = null;
        this.renderBoard();
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
     * 获取过路兵目标行
     */
    getEnPassantRow() {
        if (this.enPassant === '-') return -1;
        const rank = parseInt(this.enPassant[1]);
        return 8 - rank;
    }

    /**
     * 获取过路兵目标列
     */
    getEnPassantCol() {
        if (this.enPassant === '-') return -1;
        const file = this.enPassant[0];
        return 'abcdefgh'.indexOf(file);
    }

    generateFEN() {
        let fen = '';

        // 棋子布局
        for (let row = 0; row < 8; row++) {
            let emptyCount = 0;
            for (let col = 0; col < 8; col++) {
                const piece = this.pieces[`${row},${col}`];
                if (piece) {
                    if (emptyCount > 0) {
                        fen += emptyCount;
                        emptyCount = 0;
                    }
                    fen += piece;
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) {
                fen += emptyCount;
            }
            if (row < 7) {
                fen += '/';
            }
        }

        // 添加其他FEN字段
        fen += ` ${this.currentTurn}`;
        fen += ` ${this.castling || '-'}`;
        fen += ` ${this.enPassant}`;
        fen += ` ${this.halfMoveClock}`;
        fen += ` ${this.fullMoveNumber}`;

        return fen;
    }

    updateFEN() {
        if (this.fenOutput) {
            this.fenOutput.value = this.generateFEN();
        }
    }

    getSquareElement(row, col) {
        return document.querySelector(`.chess-square[data-row="${row}"][data-col="${col}"]`);
    }

    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    setupEventListeners() {
        // 复制FEN按钮 - 移除提示
        if (this.copyFenButton) {
            this.copyFenButton.addEventListener('click', () => {
                if (this.fenOutput) {
                    this.fenOutput.select();
                    try {
                        navigator.clipboard.writeText(this.fenOutput.value);
                        // 移除成功提示
                    } catch (err) {
                        document.execCommand('copy');
                        // 移除信息提示
                    }
                }
            });
        }

        // 新游戏按钮
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                if (confirm('开始新游戏？当前进度将丢失。')) {
                    this.setupInitialPosition();
                    this.showToast('新游戏开始');
                }
            });
        }

        // 撤销按钮 - 移除提示
        if (this.undoButton) {
            this.undoButton.addEventListener('click', () => {
                this.undoMove();
            });
        }

        // 切换到聊天按钮 - 移除提示
        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', () => {
                this.showChatView();
            });
        }
    }

    // 显示聊天视图
    showChatView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.chessFullscreen.classList.remove('active');
            this.visionChatFullscreen.classList.add('active');
            // 移除切换提示
        }
    }

    // 显示棋盘视图
    showChessView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.visionChatFullscreen.classList.remove('active');
            this.chessFullscreen.classList.add('active');
            // 移除切换提示
            
            // 确保棋盘重新渲染
            requestAnimationFrame(() => {
                this.renderBoard();
                if (this.boardElement.children.length === 0) {
                    this.initBoard();
                    this.setupInitialPosition();
                }
            });
        }
    }

    // 公共方法，用于获取当前FEN
    getCurrentFEN() {
        return this.generateFEN();
    }

    // 加载FEN字符串
    loadFEN(fen) {
        try {
            const parts = fen.split(' ');
            if (parts.length < 6) {
                throw new Error('FEN格式不完整');
            }

            // 解析棋子布局
            this.pieces = {};
            const rows = parts[0].split('/');
            rows.forEach((row, rowIndex) => {
                let colIndex = 0;
                for (const char of row) {
                    if (isNaN(char)) {
                        this.pieces[`${rowIndex},${colIndex}`] = char;
                        colIndex++;
                    } else {
                        colIndex += parseInt(char);
                    }
                }
            });

            // 解析其他状态
            this.currentTurn = parts[1];
            this.castling = parts[2];
            this.enPassant = parts[3];
            this.halfMoveClock = parseInt(parts[4]) || 0;
            this.fullMoveNumber = parseInt(parts[5]) || 1;
            this.pendingPromotion = null;
            this.gameOver = false; // 重置游戏结束状态

            this.renderBoard();
            this.updateFEN();
            this.showToast('FEN加载成功');
            return true;
        } catch (error) {
            this.showToast('FEN格式错误，无法加载');
            Logger.error('FEN parsing error:', error);
            return false;
        }
    }
}

let chessGame = null;

/**
 * 初始化国际象棋功能
 */
export function initializeChessCore(options = {}) {
    try {
        chessGame = new ChessGame(options);
        Logger.info('Chess module initialized successfully.');
        
        // 添加切换到棋盘按钮的事件监听器
        const toggleToChessButton = document.getElementById('toggle-to-chess-button');
        if (toggleToChessButton) {
            toggleToChessButton.addEventListener('click', () => {
                if (chessGame) {
                    chessGame.showChessView();
                }
            });
        }
    } catch (error) {
        Logger.error('Failed to initialize chess module:', error);
    }
}

/**
 * 获取当前FEN字符串
 */
export function getCurrentFEN() {
    return chessGame ? chessGame.getCurrentFEN() : null;
}

/**
 * 加载FEN字符串
 */
export function loadFEN(fen) {
    if (chessGame) {
        return chessGame.loadFEN(fen);
    }
    return false;
}