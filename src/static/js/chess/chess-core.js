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
    constructor() {
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
        
        // 初始化
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
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
        
        this.renderBoard();
        this.updateFEN();
    }

    undoMove() {
        if (this.moveHistory.length > 0) {
            const previousFEN = this.moveHistory.pop();
            this.loadFEN(previousFEN);
            Logger.info('Undid last move.');
        } else {
            Logger.warn('No moves to undo.');
        }
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
        const piece = this.pieces[`${row},${col}`];
        
        if (this.selectedSquare) {
            // 已经有选中的棋子，尝试移动
            const [fromRow, fromCol] = this.selectedSquare;
            this.movePiece(fromRow, fromCol, row, col);
            this.selectedSquare = null;
        } else if (piece && this.isValidTurn(piece)) {
            // 选中一个棋子
            this.selectedSquare = [row, col];
        }
        
        this.renderBoard();
    }

    handleDrop(e, toRow, toCol) {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        const [fromRow, fromCol] = data.split(',').map(Number);
        
        this.movePiece(fromRow, fromCol, toRow, toCol);
        this.selectedSquare = null;
        this.renderBoard();
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const piece = this.pieces[fromKey];

        if (!piece || !this.isValidTurn(piece)) {
            return false;
        }

        // 在移动前保存当前 FEN 到历史记录
        this.moveHistory.push(this.generateFEN());

        // 基本规则检查：不能吃己方棋子
        if (this.pieces[toKey] && this.isSameColor(piece, this.pieces[toKey])) {
            return false;
        }

        // 检查是否是王车易位
        if (piece.toLowerCase() === 'k' && Math.abs(fromCol - toCol) === 2) {
            // 王车易位：国王移动了两格
            if (!this.handleCastling(fromRow, fromCol, toRow, toCol)) {
                return false;
            }
            // 王车易位后，直接更新游戏状态，因为 handleCastling 已经处理了棋子移动
            this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
            this.updateFEN();
            return true;
        } else {
            // 普通移动
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;
        }

        // 更新游戏状态
        this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
        this.updateFEN();

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

    /**
     * 检查给定格子是否被指定颜色的敌方棋子攻击
     * @param {number} row - 格子的行
     * @param {number} col - 格子的列
     * @param {string} attackingColor - 攻击方的颜色 ('w' 或 'b')
     * @returns {boolean} - 如果被攻击则返回 true，否则返回 false
     */
    isSquareAttacked(row, col, attackingColor) {
        // 实现各种棋子的攻击逻辑
        // 1. 兵的攻击
        // 2. 马的攻击
        // 3. 象的攻击
        // 4. 车的攻击
        // 5. 后的攻击
        // 6. 王的攻击
        
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
            [1, -2],, [2, -1],
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
            [-1, 0],, [0, -1],, // 直线 (车, 后, 王)
            [-1, -1], [-1, 1], [1, -1],  // 斜线 (象, 后, 王)
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
        this.updateCastlingRights(piece, fromRow, fromCol, toRow, toCol); // 传递 toRow, toCol

        // 处理过路兵
        this.updateEnPassant(piece, fromRow, fromCol, toRow, toCol);
    }

    updateCastlingRights(piece, fromRow, fromCol, toRow, toCol) { // 添加 toRow, toCol 参数
        // 如果是王车易位，直接移除所有易位权利
        if (piece.toLowerCase() === 'k' && Math.abs(fromCol - toCol) === 2) {
            if (piece === 'K') {
                this.castling = this.castling.replace(/[KQ]/g, '');
            } else { // piece === 'k'
                this.castling = this.castling.replace(/[kq]/g, '');
            }
        } else if (piece === 'K') {
            this.castling = this.castling.replace(/[KQ]/g, '');
        } else if (piece === 'k') {
            this.castling = this.castling.replace(/[kq]/g, '');
        } else if (piece === 'R') {
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

    updateEnPassant(piece, fromRow, fromCol, toRow, toCol) {
        // 兵前进两格，设置过路兵目标格
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            const epRow = (fromRow + toRow) / 2;
            this.enPassant = this.getSquareName(epRow, toCol);
        } else {
            this.enPassant = '-';
        }
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
        // 复制FEN按钮
        if (this.copyFenButton) {
            this.copyFenButton.addEventListener('click', () => {
                if (this.fenOutput) {
                    this.fenOutput.select();
                    try {
                        navigator.clipboard.writeText(this.fenOutput.value).then(() => {
                            Logger.info('FEN copied to clipboard!');
                        });
                    } catch (err) {
                        document.execCommand('copy');
                        Logger.info('FEN selected - press Ctrl+C to copy');
                    }
                }
            });
        }

        // 新游戏按钮
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                if (confirm('开始新游戏？当前进度将丢失。')) {
                    this.setupInitialPosition();
                }
            });
        }

        // 撤销按钮
        if (this.undoButton) {
            this.undoButton.addEventListener('click', () => {
                this.undoMove();
            });
        }

        // 切换到聊天按钮
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
            Logger.info('切换到聊天视图');
        }
    }

    // 显示棋盘视图
    showChessView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.visionChatFullscreen.classList.remove('active');
            this.chessFullscreen.classList.add('active');
            Logger.info('切换到棋盘视图');
            
            // 确保棋盘重新渲染 - 使用requestAnimationFrame确保DOM更新后执行
            requestAnimationFrame(() => {
                this.renderBoard();
                // 如果棋盘元素仍然为空，重新初始化
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
        const parts = fen.split(' ');
        if (parts.length < 6) return false;

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

        this.renderBoard();
        this.updateFEN();
        return true;
    }
}

let chessGame = null;

/**
 * 初始化国际象棋功能
 */
export function initializeChessCore() {
    try {
        chessGame = new ChessGame();
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