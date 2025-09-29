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
        this.statusElement = document.getElementById('chess-status');
        
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
        this.gameOver = false;
        this.promotionPending = null;
        
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
        this.castling = 'KQkq';
        this.enPassant = '-';
        this.currentTurn = 'w';
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.gameOver = false;
        this.promotionPending = null;
        
        this.renderBoard();
        this.updateFEN();
        this.updateStatus();
    }

    undoMove() {
        if (this.moveHistory.length > 0) {
            const previousFEN = this.moveHistory.pop();
            this.loadFEN(previousFEN);
            this.gameOver = false;
            Logger.info('Undid last move.');
            this.updateStatus();
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
            square.classList.remove('selected', 'highlight', 'check');
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

        // 高亮被将军的王
        if (this.isInCheck(this.currentTurn)) {
            const kingPos = this.findKing(this.currentTurn);
            if (kingPos) {
                this.getSquareElement(kingPos.row, kingPos.col)?.classList.add('check');
            }
        }
    }

    handleSquareClick(row, col) {
        if (this.gameOver) return;
        
        // 处理兵的升变
        if (this.promotionPending) {
            this.handlePromotion(row, col);
            return;
        }

        const piece = this.pieces[`${row},${col}`];
        
        if (this.selectedSquare) {
            // 已经有选中的棋子，尝试移动
            const [fromRow, fromCol] = this.selectedSquare;
            if (this.isValidMove(fromRow, fromCol, row, col)) {
                this.movePiece(fromRow, fromCol, row, col);
            }
            this.selectedSquare = null;
        } else if (piece && this.isValidTurn(piece)) {
            // 选中一个棋子
            this.selectedSquare = [row, col];
        }
        
        this.renderBoard();
    }

    handleDrop(e, toRow, toCol) {
        e.preventDefault();
        if (this.gameOver || this.promotionPending) return;
        
        const data = e.dataTransfer.getData('text/plain');
        const [fromRow, fromCol] = data.split(',').map(Number);
        
        if (this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            this.movePiece(fromRow, fromCol, toRow, toCol);
        }
        this.selectedSquare = null;
        this.renderBoard();
    }

    /**
     * 验证移动是否合法
     */
    isValidMove(fromRow, fromCol, toRow, toCol) {
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const piece = this.pieces[fromKey];

        if (!piece || !this.isValidTurn(piece)) {
            return false;
        }

        // 不能吃己方棋子
        if (this.pieces[toKey] && this.isSameColor(piece, this.pieces[toKey])) {
            return false;
        }

        // 根据棋子类型验证移动
        const pieceType = piece.toLowerCase();
        switch (pieceType) {
            case 'p': return this.isValidPawnMove(fromRow, fromCol, toRow, toCol);
            case 'r': return this.isValidRookMove(fromRow, fromCol, toRow, toCol);
            case 'n': return this.isValidKnightMove(fromRow, fromCol, toRow, toCol);
            case 'b': return this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
            case 'q': return this.isValidQueenMove(fromRow, fromCol, toRow, toCol);
            case 'k': return this.isValidKingMove(fromRow, fromCol, toRow, toCol);
            default: return false;
        }
    }

    /**
     * 兵的移动验证
     */
    isValidPawnMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.pieces[`${fromRow},${fromCol}`];
        const isWhite = piece === 'P';
        const direction = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;

        // 前进一格
        if (fromCol === toCol && toRow === fromRow + direction && !this.pieces[`${toRow},${toCol}`]) {
            return true;
        }

        // 前进两格（起始位置）
        if (fromCol === toCol && fromRow === startRow && 
            toRow === fromRow + 2 * direction && 
            !this.pieces[`${fromRow + direction},${toCol}`] &&
            !this.pieces[`${toRow},${toCol}`]) {
            return true;
        }

        // 吃子（包括吃过路兵）
        if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction) {
            // 普通吃子
            if (this.pieces[`${toRow},${toCol}`]) {
                return true;
            }
            // 吃过路兵
            if (this.enPassant !== '-') {
                const [epFile, epRank] = this.enPassant.split('');
                const epCol = 'abcdefgh'.indexOf(epFile);
                const epRow = 8 - parseInt(epRank);
                if (toRow === epRow && toCol === epCol) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 车的移动验证
     */
    isValidRookMove(fromRow, fromCol, toRow, toCol) {
        // 必须同行或同列
        if (fromRow !== toRow && fromCol !== toCol) return false;
        
        // 检查路径是否被阻挡
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 马的移动验证
     */
    isValidKnightMove(fromRow, fromCol, toRow, toCol) {
        const rowDiff = Math.abs(fromRow - toRow);
        const colDiff = Math.abs(fromCol - toCol);
        return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
    }

    /**
     * 象的移动验证
     */
    isValidBishopMove(fromRow, fromCol, toRow, toCol) {
        // 必须是对角线移动
        if (Math.abs(fromRow - toRow) !== Math.abs(fromCol - toCol)) return false;
        
        // 检查路径是否被阻挡
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 后的移动验证
     */
    isValidQueenMove(fromRow, fromCol, toRow, toCol) {
        // 车或象的移动方式
        return this.isValidRookMove(fromRow, fromCol, toRow, toCol) || 
               this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
    }

    /**
     * 王的移动验证
     */
    isValidKingMove(fromRow, fromCol, toRow, toCol) {
        const rowDiff = Math.abs(fromRow - toRow);
        const colDiff = Math.abs(fromCol - toCol);
        
        // 普通移动（一格）
        if (rowDiff <= 1 && colDiff <= 1) {
            // 检查目标位置是否被攻击
            return !this.isSquareAttacked(toRow, toCol, this.currentTurn);
        }
        
        // 王车易位
        if (rowDiff === 0 && colDiff === 2) {
            return this.isValidCastling(fromRow, fromCol, toRow, toCol);
        }
        
        return false;
    }

    /**
     * 检查路径是否清晰
     */
    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowStep = fromRow === toRow ? 0 : (fromRow < toRow ? 1 : -1);
        const colStep = fromCol === toCol ? 0 : (fromCol < toCol ? 1 : -1);
        
        let currentRow = fromRow + rowStep;
        let currentCol = fromCol + colStep;
        
        while (currentRow !== toRow || currentCol !== toCol) {
            if (this.pieces[`${currentRow},${currentCol}`]) {
                return false;
            }
            currentRow += rowStep;
            currentCol += colStep;
        }
        
        return true;
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        if (this.gameOver) return false;

        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const piece = this.pieces[fromKey];

        if (!piece || !this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            return false;
        }

        // 在移动前保存当前 FEN 到历史记录
        this.moveHistory.push(this.generateFEN());

        // 检查是否是王车易位
        if (piece.toLowerCase() === 'k' && Math.abs(fromCol - toCol) === 2) {
            if (!this.handleCastling(fromRow, fromCol, toRow, toCol)) {
                return false;
            }
        } else {
            // 普通移动
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;

            // 处理吃过路兵
            if (piece.toLowerCase() === 'p' && this.enPassant !== '-' && 
                Math.abs(fromCol - toCol) === 1 && !this.pieces[toKey]) {
                const [epFile, epRank] = this.enPassant.split('');
                const epCol = 'abcdefgh'.indexOf(epFile);
                const epRow = 8 - parseInt(epRank);
                delete this.pieces[`${epRow},${epCol}`];
            }

            // 处理兵的升变
            if (piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7)) {
                this.promotionPending = { row: toRow, col: toCol, piece: piece };
                this.showPromotionDialog();
                return true;
            }
        }

        // 更新游戏状态
        this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
        this.updateFEN();
        
        // 检查游戏是否结束
        this.checkGameEnd();
        
        return true;
    }

    /**
     * 处理王车易位
     */
    handleCastling(fromRow, fromCol, toRow, toCol) {
        const isKingside = toCol > fromCol;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? toCol - 1 : toCol + 1;
        
        const rookFromKey = `${fromRow},${rookFromCol}`;
        const rookToKey = `${fromRow},${rookToCol}`;
        const rookPiece = this.pieces[rookFromKey];

        // 检查车是否存在且未移动过
        if (!rookPiece || rookPiece.toLowerCase() !== 'r') {
            return false;
        }

        // 检查路径是否被阻挡
        const step = isKingside ? 1 : -1;
        for (let col = fromCol + step; col !== toCol; col += step) {
            if (this.pieces[`${fromRow},${col}`]) {
                return false;
            }
        }

        // 检查是否有王车易位的权利
        const castlingRights = this.castling;
        const color = this.currentTurn;
        const castlingType = color === 'w' ? (isKingside ? 'K' : 'Q') : (isKingside ? 'k' : 'q');
        
        if (!castlingRights.includes(castlingType)) {
            return false;
        }

        // 检查王是否经过被攻击的格子
        for (let col = fromCol; col !== toCol + step; col += step) {
            if (this.isSquareAttacked(fromRow, col, this.currentTurn)) {
                return false;
            }
        }

        // 执行王车易位
        delete this.pieces[`${fromRow},${fromCol}`];
        delete this.pieces[rookFromKey];
        this.pieces[`${toRow},${toCol}`] = this.currentTurn === 'w' ? 'K' : 'k';
        this.pieces[rookToKey] = this.currentTurn === 'w' ? 'R' : 'r';

        return true;
    }

    /**
     * 验证王车易位是否合法
     */
    isValidCastling(fromRow, fromCol, toRow, toCol) {
        const isKingside = toCol > fromCol;
        const rookFromCol = isKingside ? 7 : 0;
        
        // 基本检查
        const rookPiece = this.pieces[`${fromRow},${rookFromCol}`];
        if (!rookPiece || rookPiece.toLowerCase() !== 'r') {
            return false;
        }

        // 检查路径
        const step = isKingside ? 1 : -1;
        for (let col = fromCol + step; col !== toCol; col += step) {
            if (this.pieces[`${fromRow},${col}`]) {
                return false;
            }
        }

        // 检查权利
        const castlingType = this.currentTurn === 'w' ? (isKingside ? 'K' : 'Q') : (isKingside ? 'k' : 'q');
        if (!this.castling.includes(castlingType)) {
            return false;
        }

        // 检查王是否被攻击或经过被攻击的格子
        for (let col = fromCol; col !== toCol + step; col += step) {
            if (this.isSquareAttacked(fromRow, col, this.currentTurn)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 检查格子是否被攻击
     */
    isSquareAttacked(row, col, color) {
        // 检查所有对方棋子的攻击范围
        const opponentColor = color === 'w' ? 'b' : 'w';
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.pieces[`${r},${c}`];
                if (piece && this.isSameColor(piece, opponentColor === 'w' ? 'K' : 'k')) {
                    // 临时设置目标位置有棋子来测试攻击
                    const originalPiece = this.pieces[`${row},${col}`];
                    this.pieces[`${row},${col}`] = opponentColor === 'w' ? 'K' : 'k';
                    
                    const canAttack = this.isValidMove(r, c, row, col);
                    
                    // 恢复原状
                    if (originalPiece) {
                        this.pieces[`${row},${col}`] = originalPiece;
                    } else {
                        delete this.pieces[`${row},${col}`];
                    }
                    
                    if (canAttack) return true;
                }
            }
        }
        
        return false;
    }

    /**
     * 检查是否被将军
     */
    isInCheck(color) {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;
        
        return this.isSquareAttacked(kingPos.row, kingPos.col, color);
    }

    /**
     * 寻找王的位置
     */
    findKing(color) {
        const king = color === 'w' ? 'K' : 'k';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.pieces[`${row},${col}`] === king) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    /**
     * 检查是否被将死
     */
    isCheckmate(color) {
        if (!this.isInCheck(color)) return false;
        
        // 检查是否有任何合法移动可以解除将军
        return !this.hasLegalMoves(color);
    }

    /**
     * 检查是否逼和
     */
    isStalemate(color) {
        if (this.isInCheck(color)) return false;
        
        // 检查是否有任何合法移动
        return !this.hasLegalMoves(color);
    }

    /**
     * 检查是否有合法移动
     */
    hasLegalMoves(color) {
        // 遍历所有棋子
        for (let fromRow = 0; fromRow < 8; fromRow++) {
            for (let fromCol = 0; fromCol < 8; fromCol++) {
                const piece = this.pieces[`${fromRow},${fromCol}`];
                if (piece && this.isValidTurn(piece)) {
                    // 遍历所有可能的目标位置
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove(fromRow, fromCol, toRow, toCol)) {
                                // 模拟移动检查是否解除将军
                                const fromKey = `${fromRow},${fromCol}`;
                                const toKey = `${toRow},${toCol}`;
                                const originalPiece = this.pieces[toKey];
                                const movingPiece = this.pieces[fromKey];
                                
                                // 执行模拟移动
                                delete this.pieces[fromKey];
                                this.pieces[toKey] = movingPiece;
                                
                                const stillInCheck = this.isInCheck(color);
                                
                                // 恢复原状
                                delete this.pieces[toKey];
                                this.pieces[fromKey] = movingPiece;
                                if (originalPiece) {
                                    this.pieces[toKey] = originalPiece;
                                }
                                
                                if (!stillInCheck) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * 检查游戏是否结束
     */
    checkGameEnd() {
        if (this.isCheckmate(this.currentTurn)) {
            const winner = this.currentTurn === 'w' ? '黑方' : '白方';
            this.gameOver = true;
            this.updateStatus(`将死！${winner}获胜！`);
        } else if (this.isStalemate(this.currentTurn)) {
            this.gameOver = true;
            this.updateStatus('逼和！游戏结束。');
        } else if (this.isInCheck(this.currentTurn)) {
            this.updateStatus('将军！');
        } else {
            this.updateStatus(`${this.currentTurn === 'w' ? '白方' : '黑方'}回合`);
        }
    }

    /**
     * 显示兵的升变对话框
     */
    showPromotionDialog() {
        // 创建升变选择界面
        const promotionDiv = document.createElement('div');
        promotionDiv.className = 'promotion-dialog';
        promotionDiv.innerHTML = `
            <div class="promotion-options">
                <div class="promotion-title">选择升变棋子：</div>
                <button data-piece="q">后</button>
                <button data-piece="r">车</button>
                <button data-piece="b">象</button>
                <button data-piece="n">马</button>
            </div>
        `;
        
        document.body.appendChild(promotionDiv);
        
        // 添加事件监听器
        promotionDiv.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const newPiece = e.target.dataset.piece;
                const piece = this.promotionPending.piece;
                const promotedPiece = piece === 'P' ? newPiece.toUpperCase() : newPiece;
                
                this.pieces[`${this.promotionPending.row},${this.promotionPending.col}`] = promotedPiece;
                this.promotionPending = null;
                document.body.removeChild(promotionDiv);
                
                this.updateGameState(promotedPiece, -1, -1, this.promotionPending.row, this.promotionPending.col);
                this.updateFEN();
                this.checkGameEnd();
                this.renderBoard();
            });
        });
    }

    /**
     * 处理兵的升变选择
     */
    handlePromotion(row, col) {
        // 这里通过对话框处理，这个方法作为备用
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
    }

    updateCastlingRights(piece, fromRow, fromCol) {
        if (piece === 'K') {
            this.castling = this.castling.replace(/[KQ]/g, '');
        } else if (piece === 'k') {
            this.castling = this.castling.replace(/[kq]/g, '');
        } else if (piece === 'R') {
            if (fromRow === 7 && fromCol === 0) {
                this.castling = this.castling.replace('Q', '');
            } else if (fromRow === 7 && fromCol === 7) {
                this.castling = this.castling.replace('K', '');
            }
        } else if (piece === 'r') {
            if (fromRow === 0 && fromCol === 0) {
                this.castling = this.castling.replace('q', '');
            } else if (fromRow === 0 && fromCol === 7) {
                this.castling = this.castling.replace('k', '');
            }
        }
        
        if (!this.castling) {
            this.castling = '-';
        }
    }

    updateEnPassant(piece, fromRow, fromCol, toRow, toCol) {
        // 兵前进两格，设置过路兵目标格
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            const epRow = fromRow + (toRow - fromRow) / 2;
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

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message || `${this.currentTurn === 'w' ? '白方' : '黑方'}回合`;
        }
    }

    getSquareElement(row, col) {
        return document.querySelector(`.chess-square[data-row="${row}"][data-col="${col}"]`);
    }

    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    isValidTurn(piece) {
        return (this.currentTurn === 'w' && piece === piece.toUpperCase()) ||
               (this.currentTurn === 'b' && piece === piece.toLowerCase());
    }

    isSameColor(piece1, piece2) {
        return (piece1 === piece1.toUpperCase() && piece2 === piece2.toUpperCase()) ||
               (piece1 === piece1.toLowerCase() && piece2 === piece2.toLowerCase());
    }

    setupEventListeners() {
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

        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                if (confirm('开始新游戏？当前进度将丢失。')) {
                    this.setupInitialPosition();
                }
            });
        }

        if (this.undoButton) {
            this.undoButton.addEventListener('click', () => {
                this.undoMove();
            });
        }

        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', () => {
                this.showChatView();
            });
        }
    }

    showChatView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.chessFullscreen.classList.remove('active');
            this.visionChatFullscreen.classList.add('active');
            Logger.info('切换到聊天视图');
        }
    }

    showChessView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.visionChatFullscreen.classList.remove('active');
            this.chessFullscreen.classList.add('active');
            Logger.info('切换到棋盘视图');
            
            requestAnimationFrame(() => {
                this.renderBoard();
                if (this.boardElement.children.length === 0) {
                    this.initBoard();
                    this.setupInitialPosition();
                }
            });
        }
    }

    getCurrentFEN() {
        return this.generateFEN();
    }

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

        this.currentTurn = parts[1];
        this.castling = parts[2];
        this.enPassant = parts[3];
        this.halfMoveClock = parseInt(parts[4]) || 0;
        this.fullMoveNumber = parseInt(parts[5]) || 1;
        this.gameOver = false;
        this.promotionPending = null;

        this.renderBoard();
        this.updateFEN();
        this.updateStatus();
        return true;
    }
}

let chessGame = null;

export function initializeChessCore() {
    try {
        chessGame = new ChessGame();
        Logger.info('Chess module initialized successfully.');
        
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

export function getCurrentFEN() {
    return chessGame ? chessGame.getCurrentFEN() : null;
}

export function loadFEN(fen) {
    if (chessGame) {
        return chessGame.loadFEN(fen);
    }
    return false;
}