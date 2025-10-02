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

// 合法的棋子字符
const VALID_PIECES = 'KQRBNPkqrbnp';
const VALID_CASTLING = 'KQkq';

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
        this.positionHistory = []; // 存储历史局面（用于重复检测）
        this.lastMoveError = null; // 新增：存储最后一次移动的错误信息
        
        // 初始化音效
        this.whiteMoveSound = new Audio('asset/白棋-在棋盘上落子.mp3'); // 修正路径
        this.isSoundEnabled = false; // 新增：音效开关状态
        this.isAudioUnlocked = false; // 新增：用于跟踪音频是否已由用户交互解锁
        this.blackMoveSound = new Audio('asset/黑棋-在棋盘上落子.mp3'); // 修正路径

        // 初始化
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
        this.setupSoundToggle(); // 新增：设置音效切换按钮
        this.createGameOverModal(); // 新增：创建游戏结束模态框
    }

    setupSoundToggle() {
        // 如果按钮已存在，则不重复创建
        if (document.getElementById('sound-toggle-btn')) {
            return;
        }
        const soundToggleButton = document.createElement('button');
        soundToggleButton.id = 'sound-toggle-btn';
        soundToggleButton.textContent = '🔊 音效: 关'; // 使用图标和文字
        soundToggleButton.className = 'chess-btn-secondary';

        // 找到标题容器并添加按钮
        // 假设标题栏有一个 class="chess-header"
        const header = document.querySelector('.chess-header');
        if (header) {
            header.appendChild(soundToggleButton);
        } else {
            console.warn('未找到 .chess-header 元素，音效按钮将不会显示。');
        }

        soundToggleButton.addEventListener('click', () => {
            // 第一次点击时，需要先解锁音频
            if (!this.isAudioUnlocked) {
                this.whiteMoveSound.play().catch(() => {});
                this.whiteMoveSound.pause();
                this.blackMoveSound.play().catch(() => {});
                this.blackMoveSound.pause();
                this.isAudioUnlocked = true;
            }

            // 切换音效状态
            this.isSoundEnabled = !this.isSoundEnabled;

            // 更新按钮文本和提示信息
            soundToggleButton.textContent = this.isSoundEnabled ? '🔊 音效: 开' : '🔊 音效: 关';
            this.showToast(`音效已${this.isSoundEnabled ? '启用' : '禁用'}`);
        });
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

    /**
     * 简化的兵升变处理
     */
    handleSquareClick(row, col) {
        // 如果游戏已结束，不允许操作
        if (this.gameOver) {
            return;
        }

        // 如果有等待的升变，先处理升变
        if (this.pendingPromotion) {
            this.handlePromotionClick(row, col);
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
        
        // 如果有等待的升变，阻止所有其他操作
        if (this.pendingPromotion) {
            this.showToast('请先完成兵升变选择');
            // 修复：改为调用 showPromotionSelection
            this.showPromotionSelection(this.pendingPromotion.row, this.pendingPromotion.col);
            return;
        }
        
        const data = e.dataTransfer.getData('text/plain');
        const [fromRow, fromCol] = data.split(',').map(Number);
        
        this.movePiece(fromRow, fromCol, toRow, toCol);
        this.selectedSquare = null;
        this.renderBoard();
    }

    /**
     * 修改兵移动逻辑 - 简化版本
     */
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

        // 基本规则检查
        if (this.pieces[toKey] && this.isSameColor(piece, this.pieces[toKey])) {
            this.showToast('不能吃掉自己的棋子');
            return false;
        }

        // 检查是否为王车易位 (必须是王，且在同一行上移动2格)
        const isCastlingAttempt = piece.toLowerCase() === 'k' && fromRow === toRow && Math.abs(toCol - fromCol) === 2;

        if (isCastlingAttempt) {
            this.moveHistory.push(this.generateFEN());
            if (this.handleCastling(fromRow, fromCol, toRow, toCol)) {
                this.showToast('王车易位！');
                // 王车易位成功，更新游戏状态
                this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
                this.lastMoveError = null;
                this.playMoveSound(piece);
                this.updateFEN();
                this.renderBoard();
                return true;
            } else {
                // 王车易位失败，显示错误信息
                this.moveHistory.pop(); // 恢复历史记录
                this.showToast(this.lastMoveError || '王车易位不符合规则');
                this.lastMoveError = null;
                return false;
            }
        }

        // 检查移动规则
        if (!this.isValidPieceMove(piece, fromRow, fromCol, toRow, toCol)) {
            if (this.lastMoveError) {
                this.showToast(this.lastMoveError);
                this.lastMoveError = null;
            } else {
                const pieceType = piece.toLowerCase();
                const genericMessages = {
                    'p': '兵走法：向前走一格，起始位置可走两格，吃子时斜走',
                    'n': '马走"日"字',
                    'b': '象走斜线',
                    'r': '车走直线',
                    'q': '后走直线或斜线',
                    'k': '王走一格'
                };
                this.showToast(genericMessages[pieceType] || '移动不符合规则');
            }
            return false;
        }

        // 保存当前 FEN 到历史记录
        this.moveHistory.push(this.generateFEN());

        // 检查兵升变
        const isPromotion = piece.toLowerCase() === 'p' && (toRow === 0 || toRow === 7);
        
        if (isPromotion) {
            // 执行移动
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;
            
            // 设置等待升变状态 - 修复：添加 fromRow 和 fromCol
            this.pendingPromotion = {
                fromRow: fromRow,    // 添加这行
                fromCol: fromCol,    // 添加这行
                row: toRow,
                col: toCol,
                piece: piece
            };
            
            console.log('触发兵升变:', this.pendingPromotion);
            
            // 显示升变选择
            this.showPromotionSelection(toRow, toCol);
            
            this.renderBoard();
            return true;
        } else {
            // 普通移动
            const capturedPiece = this.pieces[toKey];
            let isEnPassantCapture = false;

            // 检查并处理吃过路兵
            if (piece.toLowerCase() === 'p' && this.enPassant !== '-' && toRow === this.getEnPassantRow() && toCol === this.getEnPassantCol()) {
                const capturedPawnRow = this.currentTurn === 'w' ? toRow + 1 : toRow - 1;
                const capturedPawnKey = `${capturedPawnRow},${toCol}`;
                delete this.pieces[capturedPawnKey]; // 移除被吃掉的兵
                isEnPassantCapture = true;
                this.showToast('吃过路兵！');
            }
            
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;
            
            // 更新游戏状态
            this.updateGameState(piece, fromRow, fromCol, toRow, toCol, isEnPassantCapture);
            
            // 更新易位权利
            if (capturedPiece && capturedPiece.toLowerCase() === 'r') {
                this.updateCastlingRightsForCapturedRook(toRow, toCol);
            }
        }

        this.lastMoveError = null;
        this.playMoveSound(piece); // 播放音效
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
        // 1. 前进一格
        if (colDiff === 0 && rowDiff === direction) {
            if (this.pieces[`${toRow},${toCol}`]) {
                this.lastMoveError = isWhite ?
                    '白兵前进时不能吃子，只能斜走吃子' :
                    '黑兵前进时不能吃子，只能斜走吃子';
                return false;
            }
            this.lastMoveError = null;
            return true;
        }
        
        // 2. 前进两格（仅限初始位置）
        // 2. 前进两格（仅限初始位置）
        if (colDiff === 0 && rowDiff === 2 * direction && fromRow === startRow) {
            const intermediateRow = fromRow + direction;
            if (this.pieces[`${intermediateRow},${toCol}`]) {
                this.lastMoveError = '兵前进两格时路径被阻挡';
                return false;
            }
            if (this.pieces[`${toRow},${toCol}`]) {
                this.lastMoveError = '兵前进时目标格必须为空';
                return false;
            }
            this.lastMoveError = null;
            return true;
        }
        
        // 3. 斜吃子
        if (colDiff === 1 && rowDiff === direction) {
            // 普通吃子
            if (this.pieces[`${toRow},${toCol}`] &&
                this.isOpponentPiece(piece, this.pieces[`${toRow},${toCol}`])) {
                this.lastMoveError = null;
                return true;
            }
            
            // 吃过路兵
            if (this.enPassant !== '-') {
                const epRow = this.getEnPassantRow();
                const epCol = this.getEnPassantCol();
                if (toRow === epRow && toCol === epCol) {
                    // 验证过路兵：必须有一个敌方兵在过路兵起始位置
                    const epPieceRow = isWhite ? 3 : 4; // 过路兵当前位置
                    if (this.pieces[`${epPieceRow},${epCol}`] &&
                        this.pieces[`${epPieceRow},${epCol}`].toLowerCase() === 'p' &&
                        this.isOpponentPiece(piece, this.pieces[`${epPieceRow},${epCol}`])) {
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
            this.lastMoveError = '王车易位需要王和车都在初始位置且未被移动过';
            return false;
        }

        // 检查国王和车之间的路径是否被阻挡
        const pathStartCol = Math.min(fromCol, rookFromCol);
        const pathEndCol = Math.max(fromCol, rookFromCol);
        for (let col = pathStartCol + 1; col < pathEndCol; col++) {
            if (this.pieces[`${fromRow},${col}`]) {
                this.lastMoveError = '王车易位时王和车之间不能有其他棋子';
                return false; // 路径上有棋子阻挡
            }
        }

        const attackingColor = this.currentTurn === 'w' ? 'b' : 'w';

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
        const castlingRights = this.castling;
        const color = this.currentTurn;
        const castlingType = color === 'w' ? (isKingside ? 'K' : 'Q') : (isKingside ? 'k' : 'q');
        
        if (!castlingRights.includes(castlingType)) {
            this.lastMoveError = '已经失去该方向的王车易位权利';
            return false; // 没有易位权利
        }

        // 执行王车易位：移动国王和车
        delete this.pieces[`${fromRow},${fromCol}`]; // 移除原位置的国王
        delete this.pieces[rookFromKey]; // 移除原位置的车
        
        this.pieces[`${toRow},${toCol}`] = this.currentTurn === 'w' ? 'K' : 'k'; // 放置国王到新位置
        this.pieces[rookToKey] = this.currentTurn === 'w' ? 'R' : 'r'; // 放置车到新位置

        this.lastMoveError = null;
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
     * 获取指定棋子的所有合法移动
     */
    getLegalMovesForPiece(row, col) {
        const piece = this.pieces[`${row},${col}`];
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
                    const targetPiece = this.pieces[`${toRow},${toCol}`];
                    if (targetPiece && this.isSameColor(piece, targetPiece)) {
                        continue;
                    }
                    
                    // 检查移动后是否会导致自己的王被将军
                    if (!this.wouldBeInCheckAfterMove(row, col, toRow, toCol, this.currentTurn)) {
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
        const originalPieces = { ...this.pieces };
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const movingPiece = this.pieces[fromKey];
        
        // 执行模拟移动
        delete this.pieces[fromKey];
        this.pieces[toKey] = movingPiece;
        
        // 如果是吃过路兵，需要移除被吃的兵
        if (movingPiece.toLowerCase() === 'p' && this.enPassant !== '-' &&
            toRow === this.getEnPassantRow() && toCol === this.getEnPassantCol()) {
            const epRow = this.currentTurn === 'w' ? toRow + 1 : toRow - 1;
            delete this.pieces[`${epRow},${toCol}`];
        }
        
        // 检查是否被将军
        const inCheck = this.isKingInCheck(color);
        
        // 恢复状态
        this.pieces = originalPieces;
        
        return inCheck;
    }


    /**
     * 检查是否三次重复局面
     */
    isThreefoldRepetition() {
        if (this.positionHistory.length < 6) return false; // 至少需要3个重复局面
        
        const currentPosition = this.positionHistory[this.positionHistory.length - 1];
        let repetitionCount = 0;
        
        // 统计当前局面出现的次数
        for (let i = 0; i < this.positionHistory.length; i++) {
            if (this.positionHistory[i] === currentPosition) {
                repetitionCount++;
            }
        }
        
        return repetitionCount >= 3;
    }

    /**
     * 更新游戏状态
     */
    updateGameState(piece, fromRow, fromCol, toRow, toCol, enPassantCapture = false) {
        // 切换回合
        this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w';
        
        // 更新完整回合数（黑方走完后）
        if (this.currentTurn === 'w') {
            this.fullMoveNumber++;
        }

        // 更新半回合计数（用于50步规则）
        if (piece.toLowerCase() === 'p' || this.pieces[`${toRow},${toCol}`] || enPassantCapture) {
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        // 处理王车易位权利
        this.updateCastlingRights(piece, fromRow, fromCol);

        // 处理过路兵
        this.updateEnPassant(piece, fromRow, fromCol, toRow, toCol);
        
        // 记录局面历史用于重复检测
        const currentPosition = this.generateFEN().split(' ');
        this.positionHistory.push(currentPosition);

        // 只保留最近20个局面
        if (this.positionHistory.length > 20) {
            this.positionHistory.shift();
        }

        // 检查游戏结束条件
        this.checkGameEndConditions();
    }

    /**
     * 检查游戏结束条件 - 简化版本（只检查王被吃掉）
     */
    checkGameEndConditions() {
        // 检查王是否被吃掉
        let whiteKingExists = false;
        let blackKingExists = false;
        
        // 遍历棋盘查找王
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.pieces[`${row},${col}`];
                if (piece === 'K') {
                    whiteKingExists = true;
                } else if (piece === 'k') {
                    blackKingExists = true;
                }
            }
        }
        
        // 王被吃掉判定胜利
        if (!whiteKingExists) {
            this.showGameOverModal('黑方胜利！白王被吃掉。');
            this.gameOver = true;
            return;
        }
        
        if (!blackKingExists) {
            this.showGameOverModal('白方胜利！黑王被吃掉。');
            this.gameOver = true;
            return;
        }
        
        // 检查50步规则（50个完整回合 = 100个半回合）
        if (this.halfMoveClock >= 100) {
            this.showGameOverModal('50步规则，和棋！');
            this.gameOver = true;
            return;
        }
        
        // 检查三次重复局面
        if (this.isThreefoldRepetition()) {
            this.showGameOverModal('三次重复局面，和棋！');
            this.gameOver = true;
            return;
        }
        
        // 保留将军提示（但不作为结束条件）
        const opponentColor = this.currentTurn;
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
     * 简化的兵升变处理
     */
    handlePromotionClick(row, col) {
        if (!this.pendingPromotion) return;
        
        const isWhite = this.pendingPromotion.piece === 'P';
        const optionRow = isWhite ? 1 : 6;
        
        if (row === optionRow && col >= 0 && col <= 3) {
            // 修正：按照后、车、象、马的顺序排列
            const promotionPieces = this.currentTurn === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
            const selectedPiece = promotionPieces[col];
            
            this.completePromotion(selectedPiece);
        }
    }

    /**
     * 简化的兵升变显示 - 修正顺序
     */
    showPromotionSelection(row, col) {
        // 修正：按照后、车、象、马的顺序排列（国际象棋标准顺序）
        const promotionPieces = this.currentTurn === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
        const pieceNames = {
            'Q': '后', 'R': '车', 'B': '象', 'N': '马',
            'q': '后', 'r': '车', 'b': '象', 'n': '马'
        };
        
        const isWhite = this.currentTurn === 'w';
        const selectionRow = isWhite ? 1 : 6;
        
        for (let i = 0; i < 4; i++) {
            const selectionCol = i;
            
            const square = this.getSquareElement(selectionRow, selectionCol);
            if (square) {
                square.innerHTML = '';
                square.classList.add('promotion-option');
                
                const pieceElement = document.createElement('div');
                pieceElement.className = 'chess-piece promotion-piece';
                pieceElement.textContent = PIECES[promotionPieces[i]];
                pieceElement.dataset.piece = promotionPieces[i];
                
                const label = document.createElement('span');
                label.className = 'chess-piece-label';
                label.textContent = pieceNames[promotionPieces[i]];
                
                square.appendChild(pieceElement);
                square.appendChild(label);
            }
        }
        
        this.showToast('请点击选择升变棋子：后、车、象、马');
    }

    /**
     * 简化的完成升变
     */
    completePromotion(pieceType) {
        if (!this.pendingPromotion) {
            console.error('没有等待的升变！');
            return;
        }
        
        const { fromRow, fromCol, row, col, piece } = this.pendingPromotion;
        const isWhite = piece === 'P';
        const newPiece = isWhite ? pieceType.toUpperCase() : pieceType.toLowerCase();
        
        console.log('完成兵升变:', {
            fromPosition: `${fromRow},${fromCol}`,
            toPosition: `${row},${col}`,
            fromPiece: piece,
            toPiece: newPiece
        });
        
        // 更新棋子
        this.pieces[`${row},${col}`] = newPiece;
        
        // 清除升变状态
        this.pendingPromotion = null;
        
        // 清除升变选择显示
        this.clearPromotionDisplay();
        
        // 修复：使用标准的 updateGameState
        this.updateGameState(piece, fromRow, fromCol, row, col, false);
        
        this.updateFEN();
        this.renderBoard();
        
        this.showToast(`兵升变为${this.getPieceName(newPiece)}`);
        this.playMoveSound(newPiece); // 播放音效
        
        console.log('升变完成');
    }

    /**
     * 清除升变选择显示
     */
    clearPromotionDisplay() {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = this.getSquareElement(row, col);
                if (square) {
                    square.classList.remove('promotion-option');
                }
            }
        }
    }


    /**
     * 播放落子音效
     */
    playMoveSound(piece) {
        // 如果音效未启用，则不播放
        if (!this.isSoundEnabled) return;

        const isWhite = piece === piece.toUpperCase();
        const sound = isWhite ? this.whiteMoveSound : this.blackMoveSound;
        
        sound.currentTime = 0; // 允许快速重复播放
        sound.play().catch(error => {
            console.warn('无法播放音效:', error);
            // 在某些浏览器中，用户需要先与页面交互才能播放音频
        });
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
                    const piece = this.pieces[`${row},${col}`];
                    
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
            if (this.castling && this.castling !== '-') {
                for (const char of this.castling) {
                    if (VALID_CASTLING.includes(char)) {
                        cleanCastling += char;
                    }
                }
            }
            if (!cleanCastling) cleanCastling = '-';

            // 3. 验证过路兵目标格
            let cleanEnPassant = '-';
            if (this.enPassant !== '-' && this.enPassant.length === 2) {
                const file = this.enPassant[0];
                const rank = this.enPassant[1];
                if ('abcdefgh'.includes(file) && '3456'.includes(rank)) {
                    cleanEnPassant = this.enPassant;
                }
            }

            // 4. 组装完整FEN
            const finalFEN = `${fen} ${this.currentTurn} ${cleanCastling} ${cleanEnPassant} ${Math.max(0, this.halfMoveClock)} ${Math.max(1, this.fullMoveNumber)}`;

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
                        navigator.clipboard.writeText(this.fenOutput.value);
                    } catch (err) {
                        document.execCommand('copy');
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
        }
    }

    // 显示棋盘视图
    showChessView() {
        if (this.chessFullscreen && this.visionChatFullscreen) {
            this.visionChatFullscreen.classList.remove('active');
            this.chessFullscreen.classList.add('active');
            
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

    // 加载FEN字符串 - 修复版本
    loadFEN(fen) {
        try {
            // 首先验证FEN格式
            if (!this.validateFEN(fen)) {
                throw new Error('FEN格式不合法');
            }

            const parts = fen.split(' ');
            
            // 解析棋子布局
            this.pieces = {};
            const rows = parts[0].split('/');
            rows.forEach((row, rowIndex) => {
                let colIndex = 0;
                for (const char of row) {
                    if (isNaN(char)) {
                        // 只允许合法棋子字符
                        if (VALID_PIECES.includes(char)) {
                            this.pieces[`${rowIndex},${colIndex}`] = char;
                        }
                        colIndex++;
                    } else {
                        colIndex += parseInt(char);
                    }
                }
            });

            // 解析其他状态
            this.currentTurn = parts[1];
            
            // 清理易位权利
            if (parts[2] !== '-') {
                let cleanCastling = '';
                for (const char of parts[2]) {
                    if (VALID_CASTLING.includes(char)) {
                        cleanCastling += char;
                    }
                }
                this.castling = cleanCastling || '-';
            } else {
                this.castling = '-';
            }
            
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
            this.showToast('FEN格式错误，无法加载: ' + error.message);
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
    // 防止重复初始化
    if (chessGame) {
        return;
    }
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