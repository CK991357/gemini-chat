/**
 * @fileoverview Core logic for the Chess FEN Recorder feature.
 * Handles chess board rendering, piece movement, and FEN generation.
 * Refactored to use separate ChessRules module for game rules.
 */

import { Logger } from '../utils/logger.js';
import { getChessAIEnhancedInstance, initializeChessAIEnhanced } from './chess-ai-enhanced.js';
import { initializeChessPersistence } from './chess-persistence.js';
import { ChessRules, PIECES, VALID_CASTLING, VALID_PIECES } from './chess-rule.js';

// 风险缓解：确保 chess.js 已加载
if (typeof window.Chess === 'undefined') {
   throw new Error('chess.js 库未正确加载，请检查CDN链接');
}
const Chess = window.Chess;

class ChessGame {
    constructor(options = {}) {
        this.showToast = options.showToast || console.log;
        this.chatApiHandler = options.chatApiHandler || null; // ✅ 保存 handler
        
        // 等待DOM完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize(this.chatApiHandler));
            return;
        }
        this.initialize(this.chatApiHandler);
    }

    initialize(chatApiHandler) {
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

        this.fullGameHistory = []; // 完整对局历史
        this.chessAI = null; // AI实例
        this.persistence = null; // 初始化 persistence

        // 第一阶段重构：引入chess.js作为影子引擎
        this.game = new Chess(); // chess.js 实例

        // 初始化规则引擎
        this.chessRules = new ChessRules(this);

        // 初始化
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
        this.createGameOverModal(); // 新增：创建游戏结束模态框
        this.createAIMoveChoiceModal(); // 新增：创建AI走法选择模态框
        this.initializeAI(chatApiHandler);
        this.addAIButton();
        
        // 新增：持久化功能初始化
        this.createLoadGameModal();
        this.addPersistenceButtons();
        this.persistence = initializeChessPersistence(this, this.showToast);
        if (this.persistence) {
            Logger.info('Chess persistence integrated successfully');
        }
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
        this.selectedSquare = null; // 新增：重置选中的棋子
 
        // 在所有状态设置完成后，调用专门的方法初始化历史
        this.initializeFullHistory();
        
        this.renderBoard();
        this.updateFEN();

        // 同步影子引擎
        try {
            this.game.load(this.getCurrentFEN());
            console.log('影子引擎已同步至初始状态。');
        } catch (e) {
            console.error('影子引擎同步失败:', e);
        }

        this.saveGameToLocalStorage(); // 保存新游戏状态
    }

    undoMove() {
        if (this.moveHistory.length > 0) {
            const previousFEN = this.moveHistory.pop();
            this.loadFEN(previousFEN);
            this.removeLastMoveFromHistory(); // 同步完整历史记录
            this.saveGameToLocalStorage(); // 保存撤销后的状态
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
        } else if (piece && this.chessRules.isValidTurn(piece)) {
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
     * 修改兵移动逻辑 - 修复版本
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

        if (!this.chessRules.isValidTurn(piece)) {
            this.showToast(`现在轮到${this.currentTurn === 'w' ? '白方' : '黑方'}走棋`);
            return false;
        }

        // 修复：提前获取目标格子上的棋子，这对所有移动都至关重要
        const capturedPiece = this.pieces[toKey];

        // 基本规则检查
        if (capturedPiece && this.chessRules.isSameColor(piece, capturedPiece)) {
            this.showToast('不能吃掉自己的棋子');
            return false;
        }

        // 检查是否为王车易位 (必须是王，且在同一行上移动2格)
        const isCastlingAttempt = piece.toLowerCase() === 'k' && fromRow === toRow && Math.abs(toCol - fromCol) === 2;

        if (isCastlingAttempt) {
            this.moveHistory.push(this.generateFEN());
            if (this.chessRules.handleCastling(fromRow, fromCol, toRow, toCol)) {
                this.showToast('王车易位！');
                // 王车易位成功，更新游戏状态
                // 王车易位没有吃子，capturedPiece 必须为 null
                this.updateGameState(piece, fromRow, fromCol, toRow, toCol, null, false);
                this.recordMoveToHistory();
                this.chessRules.clearLastMoveError();
                this.updateFEN();
                this.renderBoard();
                // 修复：在状态更新后同步影子引擎
                this.syncAndVerifyShadowEngine({ from: this.getSquareName(fromRow, fromCol), to: this.getSquareName(toRow, toCol) });
                return true;
            } else {
                // 王车易位失败，显示错误信息
                this.moveHistory.pop(); // 恢复历史记录
                const error = this.chessRules.getLastMoveError();
                this.showToast(error || '王车易位不符合规则');
                this.chessRules.clearLastMoveError();
                return false;
            }
        }

        // 检查移动规则
        if (!this.chessRules.isValidPieceMove(piece, fromRow, fromCol, toRow, toCol)) {
            const error = this.chessRules.getLastMoveError();
            if (error) {
                this.showToast(error);
                this.chessRules.clearLastMoveError();
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
            
            // 设置等待升变状态 - 修复：使用提前获取的 capturedPiece
            this.pendingPromotion = {
                fromRow: fromRow,
                fromCol: fromCol,
                row: toRow,
                col: toCol,
                piece: piece,
                capturedPiece: capturedPiece || null
            };
            
            console.log('触发兵升变:', this.pendingPromotion);
            
            // 显示升变选择
            this.showPromotionSelection(toRow, toCol);
            
            this.renderBoard();
            // 升变是一个两步过程，我们等到 completePromotion 时再同步影子引擎
            console.warn('升变已触发，影子引擎将等待升变完成后一次性同步。');
            return true;
        } else {
            // 普通移动
            let isEnPassantCapture = false;

            // 检查并处理吃过路兵
            if (piece.toLowerCase() === 'p' && this.enPassant !== '-' && toRow === this.chessRules.getEnPassantRow() && toCol === this.chessRules.getEnPassantCol()) {
                const capturedPawnRow = this.currentTurn === 'w' ? toRow + 1 : toRow - 1;
                const capturedPawnKey = `${capturedPawnRow},${toCol}`;
                delete this.pieces[capturedPawnKey]; // 移除被吃掉的兵
                isEnPassantCapture = true;
                this.showToast('吃过路兵！');
            }
            
            delete this.pieces[fromKey];
            this.pieces[toKey] = piece;
            
            // 更新游戏状态 - 使用提前获取的 capturedPiece
            this.updateGameState(piece, fromRow, fromCol, toRow, toCol, capturedPiece, isEnPassantCapture);
            this.recordMoveToHistory();
            
            // 更新易位权利
            if (capturedPiece && capturedPiece.toLowerCase() === 'r') {
                this.chessRules.updateCastlingRightsForCapturedRook(toRow, toCol);
            }
        }

        this.chessRules.clearLastMoveError();
        this.updateFEN();
        // 修复：在所有状态更新完成后，再同步影子引擎
        this.syncAndVerifyShadowEngine({ from: this.getSquareName(fromRow, fromCol), to: this.getSquareName(toRow, toCol) });
        this.renderBoard();
        return true;
    }

    /**
     * 更新游戏状态 - 修复版本：移除 isCastling 参数
     */
    updateGameState(piece, fromRow, fromCol, toRow, toCol, capturedPiece = null, enPassantCapture = false) {
        // 切换回合
        this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w';
        
        // 更新完整回合数（黑方走完后）
        if (this.currentTurn === 'w') {
            this.fullMoveNumber++;
        }

        // 更新半回合计数（用于50步规则）
        // 兵走法、吃子、吃过路兵都会重置半步计数器
        if (piece.toLowerCase() === 'p' || capturedPiece || enPassantCapture) {
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        // 处理王车易位权利
        this.chessRules.updateCastlingRights(piece, fromRow, fromCol);

        // 处理过路兵
        this.chessRules.updateEnPassant(piece, fromRow, fromCol, toRow, toCol);
        
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
        if (this.chessRules.isThreefoldRepetition()) {
            this.showGameOverModal('三次重复局面，和棋！');
            this.gameOver = true;
            return;
        }
        
        // 保留将军提示（但不作为结束条件）
        const opponentColor = this.currentTurn;
        if (this.chessRules.isKingInCheck(opponentColor)) {
            this.showToast('将军！');
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
            this.completelyResetGame();
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
    * 新增：完全重置游戏状态，确保事件监听器被重新附加
    */
   completelyResetGame() {
       this.initBoard(); // 重新创建棋盘格子并附加事件监听器
       this.setupInitialPosition(); // 设置初始棋子位置并重置所有游戏状态
       this.showToast('新游戏开始！');
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
     * 简化的完成升变 - 修复版本
     */
    completePromotion(pieceType) {
        if (!this.pendingPromotion) {
            console.error('没有等待的升变！');
            return;
        }
        
        const { fromRow, fromCol, row, col, piece, capturedPiece } = this.pendingPromotion;
        const isWhite = piece === 'P';
        const newPiece = isWhite ? pieceType.toUpperCase() : pieceType.toLowerCase();
        
        console.log('完成兵升变:', {
            fromPosition: `${fromRow},${fromCol}`,
            toPosition: `${row},${col}`,
            fromPiece: piece,
            toPiece: newPiece,
            capturedPiece: capturedPiece
        });
        
        // 更新棋子
        this.pieces[`${row},${col}`] = newPiece;
        
        // 清除升变状态
        this.pendingPromotion = null;
        
        // 清除升变选择显示
        this.clearPromotionDisplay();
        
        // 修复：使用原始的兵 'piece'，而不是 'newPiece'，以确保 halfMoveClock 逻辑正确
        this.updateGameState(piece, fromRow, fromCol, row, col, capturedPiece, false);
        this.recordMoveToHistory();
        
        this.updateFEN();
        this.renderBoard();
        
        this.showToast(`兵升变为${this.chessRules.getPieceName(newPiece)}`);
        
        // 升变完成，此时一次性将完整的带升变信息的走法同步到影子引擎
        console.log('正在向影子引擎同步完整的升变走法...');
        this.syncAndVerifyShadowEngine({
            from: this.getSquareName(fromRow, fromCol),
            to: this.getSquareName(row, col),
            promotion: newPiece.toLowerCase()
        });

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
     * 生成FEN字符串
     */
    generateFEN() {
        return this.chessRules.generateFEN();
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
                    this.completelyResetGame();
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
            if (!this.chessRules.validateFEN(fen)) {
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

            // 同步影子引擎
            try {
                this.game.load(fen);
                console.log('影子引擎已通过 loadFEN 同步。');
            } catch (e) {
                console.error('影子引擎同步失败:', e);
            }

            return true;
        } catch (error) {
            this.showToast('FEN格式错误，无法加载: ' + error.message);
            Logger.error('FEN parsing error:', error);
            return false;
        }
    }

    // --- 历史记录管理 (集成增强日志) ---
    initializeFullHistory() {
        this.fullGameHistory = [this.generateFEN()];
        console.log('完整对局历史已初始化，初始FEN:', this.fullGameHistory);
    }

    recordMoveToHistory() {
        const currentFEN = this.generateFEN();
        this.fullGameHistory.push(currentFEN);
        console.log(`记录历史步数: ${this.fullGameHistory.length}, FEN: ${currentFEN}`);
        this.saveGameToLocalStorage(); // 每次移动后保存游戏
    }

    removeLastMoveFromHistory() {
        if (this.fullGameHistory.length > 1) {
            const removed = this.fullGameHistory.pop();
            console.log(`撤销历史记录，剩余步数: ${this.fullGameHistory.length}, 移除的FEN: ${removed}`);
        }
    }

    getFullGameHistory() {
        return [...this.fullGameHistory];
    }

    // --- 本地存储 ---
    /**
     * 将当前游戏状态保存到localStorage
     */
    saveGameToLocalStorage() {
        try {
            const gameState = {
                fullGameHistory: this.getFullGameHistory(),
                currentFEN: this.getCurrentFEN()
            };
            localStorage.setItem('chessGameState', JSON.stringify(gameState));
        } catch (error) {
            console.error('无法保存游戏状态到localStorage:', error);
        }
    }

    /**
     * 从localStorage加载游戏状态
     */
    loadGameFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('chessGameState');
            if (savedState) {
                const gameState = JSON.parse(savedState);
                if (gameState && gameState.fullGameHistory && gameState.currentFEN) {
                    this.fullGameHistory = gameState.fullGameHistory;
                    this.loadFEN(gameState.currentFEN);
                    console.log('成功从localStorage加载游戏状态。');
                    this.showToast('已恢复您上次的棋局');
                }
            }
        } catch (error) {
            console.error('无法从localStorage加载游戏状态:', error);
            // 如果加载失败，确保开始一个新游戏
            this.setupInitialPosition();
        }
    }

    // --- AI 功能集成 (集成增强的按钮状态管理) ---
    initializeAI(chatApiHandler = null) { // ✅ 接收 chatApiHandler
        // 使用新的单例初始化方法
        initializeChessAIEnhanced(this, {
            showToast: this.showToast,
            logMessage: Logger.info.bind(Logger), // 修复：绑定Logger上下文
            showMoveChoiceModal: (analysis, moves) => this.showAIMoveChoiceModal(analysis, moves),
            displayVisionMessage: (content, opts) => {
                // 确保 displayVisionMessage 函数存在
                if (typeof window.displayVisionMessage === 'function') {
                    window.displayVisionMessage(content, opts);
                } else {
                    console.warn('displayVisionMessage not found on window object.');
                }
            },
            chatApiHandler: chatApiHandler // ✅ 将其传递给 AI 模块
        });
        console.log('Chess AI Enhanced module initialized via singleton.');
    }

    addAIButton() {
        const fenActions = document.querySelector('.fen-actions');
        if (!fenActions) {
            console.error('.fen-actions container not found for AI button.');
            return;
        }

        // --- 原有的 "问AI走法" 按钮 ---
        if (!document.getElementById('ask-ai-button')) {
            const aiButton = document.createElement('button');
            aiButton.id = 'ask-ai-button';
            aiButton.className = 'action-button chess-ai-button';
            aiButton.innerHTML = '<i class="fas fa-robot"></i> 问AI走法';
            aiButton.title = '让AI选择并执行一步棋';
            aiButton.addEventListener('click', () => this.handleAskAI());
            fenActions.appendChild(aiButton);
        }

        // --- 新增的 "问AI最优解" 按钮 ---
        if (!document.getElementById('ask-ai-best-move-button')) {
            const bestMoveButton = document.createElement('button');
            bestMoveButton.id = 'ask-ai-best-move-button';
            bestMoveButton.className = 'action-button chess-ai-button';
            bestMoveButton.innerHTML = '<i class="fas fa-brain"></i> 问AI最优解';
            bestMoveButton.title = '切换到聊天视图并请求AI进行详细局面分析';
            bestMoveButton.addEventListener('click', () => this.handleAskAIBestMove());
            fenActions.appendChild(bestMoveButton);
        }
    }

    async handleAskAI() {
        if (this.gameOver) {
            this.showToast('游戏已结束，无法询问AI');
            return;
        }
        if (this.pendingPromotion) {
            this.showToast('请先完成兵的升变选择');
            return;
        }
        
        const aiButton = document.getElementById('ask-ai-button');
        const originalText = aiButton.innerHTML;
        
        aiButton.disabled = true;
        aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI思考中...';

        try {
            this.showToast('正在获取AI建议的走法...');
            const chessAI = getChessAIEnhancedInstance(); // 修复：从单例获取AI实例
            const success = await chessAI.askAIForMove();
            
            if (success) {
                this.showToast('AI走法执行成功！');
            } else {
                // 具体的失败原因已在 askAIForMove 内部 toast
            }
        } catch (error) {
            console.error('AI走法处理异常:', error);
            this.showToast(`AI走法处理失败: ${error.message}`);
        } finally {
            // 确保按钮状态在任何情况下都能恢复
            aiButton.disabled = false;
            aiButton.innerHTML = originalText;
        }
    }

    /**
     * [新增] 处理"问AI最优解"按钮点击事件，采纳您的优化方案
     */
    async handleAskAIBestMove() {
        if (this.gameOver) {
            this.showToast('游戏已结束，无法进行分析');
            return;
        }
        if (this.pendingPromotion) {
            this.showToast('请先完成兵的升变选择');
            return;
        }

        const currentFEN = this.getCurrentFEN();
        if (!currentFEN) {
            this.showToast('无法获取当前棋局信息');
            return;
        }

        // 构建分析消息
        const analysisMessage = `分析以下局面并给出Top 3 走法分析。\n\n当前FEN: \`${currentFEN}\``;

        // 切换到Vision视图
        this.showChatView();
        
        // 延迟执行，确保视图切换和Vision模块的UI已准备就绪
        setTimeout(() => {
            this.sendMessageToVision(analysisMessage);
        }, 500); // 500ms 延迟通常足够
        
        this.showToast('已切换到AI分析视图，正在发送请求...');
    }

    /**
     * [新增] 辅助函数，用于将消息发送到Vision模块
     */
    sendMessageToVision(message) {
        // 优先使用全局函数，这是最直接可靠的方式
        if (typeof window.sendVisionMessageDirectly === 'function') {
            window.sendVisionMessageDirectly(message);
            return;
        }
        
        // 如果全局函数不存在，则使用您建议的备用方案：手动填充输入框并点击
        const visionInput = document.getElementById('vision-input-text');
        const sendButton = document.getElementById('vision-send-button');
        
        if (visionInput && sendButton) {
            console.warn('全局函数 sendVisionMessageDirectly 未找到，执行备用方案。');
            visionInput.value = message;
            sendButton.disabled = false; // 确保按钮可用
            sendButton.click();
        } else {
            console.error('Vision模块UI元素未找到，无法发送消息。');
            this.showToast('AI分析模块未就绪，请稍后重试');
        }
    }

    /**
     * 创建AI走法选择模态框
     */
    createAIMoveChoiceModal() {
        if (document.getElementById('chess-ai-choice-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'chess-ai-choice-modal';
        modal.className = 'chess-ai-choice-modal';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="chess-ai-choice-content">
                <h2>AI 提供了多个建议</h2>
                <div class="ai-analysis-container">
                    <p><strong>AI 分析:</strong></p>
                    <div id="ai-analysis-text" class="ai-analysis-text"></div>
                </div>
                <div id="ai-move-choices" class="ai-move-choices">
                    <p><strong>请选择一个走法:</strong></p>
                </div>
                <div class="chess-ai-choice-buttons">
                    <button id="chess-ai-confirm-btn" class="chess-btn-primary" disabled>确定</button>
                    <button id="chess-ai-cancel-btn" class="chess-btn-secondary">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    /**
     * 显示AI走法选择模态框，并返回一个Promise
     */
    showAIMoveChoiceModal(analysisText, moves) {
        return new Promise((resolve, reject) => {
            const modal = document.getElementById('chess-ai-choice-modal');
            const analysisElement = document.getElementById('ai-analysis-text');
            const choicesContainer = document.getElementById('ai-move-choices');
            const confirmBtn = document.getElementById('chess-ai-confirm-btn');
            const cancelBtn = document.getElementById('chess-ai-cancel-btn');

            if (!modal || !analysisElement || !choicesContainer || !confirmBtn || !cancelBtn) {
                return reject(new Error('AI选择模态框的必要元素未找到'));
            }

            // 填充内容
            analysisElement.textContent = analysisText;
            
        // 清空旧选项并创建新选项
        choicesContainer.innerHTML = '<p><strong>请选择一个走法:</strong></p>';
        let selectedMove = null;

        // 修复：确保显示完整的走法，而不是分割的字符
        const validMoves = moves.filter(move => {
            // 过滤掉无效的单个字符（除非是合法的王车易位）
            if (move.length === 1 && move !== 'O') {
                return false;
            }
            return true;
        });

        validMoves.forEach((move, index) => {
            const label = document.createElement('label');
            label.className = 'ai-move-choice';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'ai-move-choice';
            input.value = move;
            input.id = `ai-move-${index}`;
            
            input.addEventListener('change', () => {
                selectedMove = input.value;
                confirmBtn.disabled = false;
            });

            label.appendChild(input);
            
            // 修复：显示完整的走法描述
            const moveText = document.createElement('span');
            moveText.textContent = ` ${move}`;
            if (move === 'O-O' || move === 'O-O-O') {
                const desc = document.createElement('small');
                desc.textContent = ` (${move === 'O-O' ? '短易位' : '长易位'})`;
                desc.style.color = '#666';
                label.appendChild(moveText);
                label.appendChild(desc);
            } else {
                label.appendChild(moveText);
            }
            
            choicesContainer.appendChild(label);
            
            // 如果只有一个选项，自动选择
            if (validMoves.length === 1 && index === 0) {
                input.checked = true;
                selectedMove = move;
                confirmBtn.disabled = false;
            }
        });

        // 重置并显示
        confirmBtn.disabled = true;
        modal.style.display = 'flex';

            // --- 事件处理 ---
            const onConfirm = () => {
                cleanup();
                if (selectedMove) {
                    resolve(selectedMove);
                } else {
                    // 理论上不会发生，因为按钮被禁用
                    reject(new Error('没有选择任何走法'));
                }
            };

            const onCancel = () => {
                cleanup();
                reject(new Error('用户取消了选择'));
            };

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    // --- 影子引擎同步与验证 ---
    /**
     * 将走法同步到影子引擎并验证FEN是否一致
     */
    syncAndVerifyShadowEngine(moveObject) {
        // 在执行移动前，确保影子引擎处于上一步的正确状态
        const history = this.getFullGameHistory();
        if (history.length > 1) {
            const previousFEN = history[history.length - 2]; // 获取移动前的FEN
            if (this.game.fen() !== previousFEN) {
                console.warn('影子引擎状态与预期不符，正在从上一步历史强制同步...');
                this.game.load(previousFEN);
            }
        }

        try {
            const moveResult = this.game.move(moveObject);
            if (moveResult === null) {
                console.error('影子引擎移动失败!', moveObject);
                console.warn('自定义引擎FEN:', this.getCurrentFEN());
                console.warn('影子引擎FEN (失败前):', this.game.fen());
                // 尝试从当前FEN加载，看看是否能恢复
                this.game.load(this.getCurrentFEN());
                return;
            }

            const customFEN = this.getCurrentFEN();
            const shadowFEN = this.game.fen();

            if (customFEN === shadowFEN) {
                console.log('%cFEN一致性验证通过', 'color: green;', { move: `${moveObject.from}${moveObject.to}`, fen: customFEN });
            } else {
                console.error('%cFEN不一致!', 'color: red;', { move: `${moveObject.from}${moveObject.to}` });
                console.warn('自定义引擎FEN:', customFEN);
                console.warn('影子引擎FEN:', shadowFEN);
                
                // 方案1A: 使用chess.js的FEN作为权威
                const authoritativeFEN = this.game.fen();
                if (this.chessRules.validateFEN(authoritativeFEN)) {
                    console.warn('使用chess.js的权威FEN覆盖自定义引擎');
                    this.loadFEN(authoritativeFEN); // 用chess.js的FEN重置自定义引擎
                } else {
                    // 回退到自定义引擎
                    console.warn('chess.js的FEN也无效，回退到自定义引擎的FEN');
                    this.game.load(customFEN);
                }
            }
        } catch (e) {
            console.error('同步影子引擎时发生异常:', e);
        }
    }

    /**
     * 强制同步影子引擎到当前自定义引擎状态
     */
    forceShadowSync() {
      try {
        const currentFEN = this.generateFEN();
        if (this.chessRules.validateFEN(currentFEN)) {
          this.game.load(currentFEN);
          console.log('强制同步影子引擎完成');
          return true;
        } else {
          console.error('当前FEN无效，无法同步影子引擎');
          return false;
        }
      } catch (error) {
        console.error('强制同步失败:', error);
        return false;
      }
    }

    // ========== 新增：持久化功能 ==========
    
    /**
     * 添加持久化按钮（保存和加载）
     */
    addPersistenceButtons() {
        const fenActions = document.querySelector('.fen-actions');
        if (!fenActions) {
            console.error('.fen-actions container not found for persistence buttons.');
            return;
        }

        // 只添加保存和加载按钮，不删除任何现有按钮
        const buttons = [
            { 
                id: 'save-game-button', 
                icon: 'fa-save', 
                text: '保存棋局', 
                title: '保存当前棋局进度', 
                handler: () => this.handleSaveGame() 
            },
            { 
                id: 'load-game-button', 
                icon: 'fa-folder-open', 
                text: '加载棋局', 
                title: '加载已保存的棋局', 
                handler: () => this.handleLoadGame() 
            }
        ];

        buttons.forEach(btnInfo => {
            // 检查按钮是否已存在
            if (!document.getElementById(btnInfo.id)) {
                const button = document.createElement('button');
                button.id = btnInfo.id;
                button.className = 'action-button';
                button.innerHTML = `<i class="fas ${btnInfo.icon}"></i> ${btnInfo.text}`;
                button.title = btnInfo.title;
                button.addEventListener('click', btnInfo.handler);
                fenActions.appendChild(button);
            }
        });
    }

    /**
     * 处理保存棋局
     */
    async handleSaveGame() {
        if (this.gameOver) {
            this.showToast('游戏已结束，无需保存');
            return;
        }

        if (!this.persistence) {
            this.showToast('保存功能未初始化');
            return;
        }

        const gameName = prompt('请输入棋局名称:', `棋局 - ${new Date().toLocaleString()}`);
        if (!gameName || gameName.trim() === '') {
            this.showToast('取消保存');
            return;
        }

        const saveButton = document.getElementById('save-game-button');
        const originalHtml = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

        try {
            await this.persistence.saveGame(gameName.trim());
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalHtml;
        }
    }

    /**
     * 处理加载棋局
     */
    async handleLoadGame() {
        if (!this.persistence) {
            this.showToast('加载功能未初始化');
            return;
        }

        const loadButton = document.getElementById('load-game-button');
        const originalHtml = loadButton.innerHTML;
        loadButton.disabled = true;
        loadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';

        try {
            const games = await this.persistence.loadGameList();
            this.showGameLoadModal(games);
        } finally {
            loadButton.disabled = false;
            loadButton.innerHTML = originalHtml;
        }
    }

    /**
     * 创建加载棋局的模态框
     */
    createLoadGameModal() {
        if (document.getElementById('chess-load-game-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'chess-load-game-modal';
        modal.className = 'chess-modal';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="chess-modal-content">
                <h2>加载棋局</h2>
                <div class="search-container">
                    <input type="text" id="chess-load-search" placeholder="搜索棋局名称..." />
                </div>
                <div id="chess-load-list" class="chess-load-list"></div>
                <div class="chess-modal-buttons">
                    <button id="chess-load-close-btn" class="chess-btn-secondary">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 关闭按钮事件
        document.getElementById('chess-load-close-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    /**
     * 显示加载棋局模态框
     */
    showGameLoadModal(games = []) {
        const modal = document.getElementById('chess-load-game-modal');
        const listContainer = document.getElementById('chess-load-list');
        if (!modal || !listContainer) return;

        // 渲染游戏列表
        this.renderGameList(listContainer, games);
        
        // 搜索功能
        const searchInput = document.getElementById('chess-load-search');
        searchInput.value = '';
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredGames = games.filter(game => 
                game.name.toLowerCase().includes(searchTerm)
            );
            this.renderGameList(listContainer, filteredGames);
        });

        modal.style.display = 'flex';
        searchInput.focus();
    }

    /**
     * 渲染游戏列表
     */
    renderGameList(container, games) {
        container.innerHTML = '';

        if (games.length === 0) {
            container.innerHTML = '<p class="no-games">没有找到保存的棋局。</p>';
            return;
        }

        games.forEach(game => {
            const item = document.createElement('div');
            item.className = 'chess-load-item';
            // 添加重命名和删除按钮
            item.innerHTML = `
                <div class="game-info">
                    <span class="game-name">${this.escapeHtml(game.name)}</span>
                    <span class="game-date">保存于: ${new Date(game.updated_at).toLocaleString()}</span>
                </div>
                <div class="game-actions">
                    <button class="load-game-btn chess-btn-primary" data-id="${game.id}">加载</button>
                    <button class="rename-game-btn chess-btn-secondary" data-id="${game.id}">重命名</button>
                    <button class="delete-game-btn chess-btn-danger" data-id="${game.id}">删除</button>
                </div>
            `;
            
            // 绑定加载按钮事件
            const loadBtn = item.querySelector('.load-game-btn');
            loadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleLoadSelectedGame(game.id);
            });

            // 【新增】绑定重命名按钮事件
            const renameBtn = item.querySelector('.rename-game-btn');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleRenameGame(game.id, game.name, item);
            });

            // 【新增】绑定删除按钮事件
            const deleteBtn = item.querySelector('.delete-game-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteGame(game.id, item);
            });

            // 整个项目点击也可加载 (保留原逻辑，但点击按钮时已阻止冒泡)
            item.addEventListener('click', () => {
                this.handleLoadSelectedGame(game.id);
            });

            container.appendChild(item);
        });
    }

    /**
     * HTML转义防止XSS
     */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * 加载选中的棋局
     */
    async handleLoadSelectedGame(gameId) {
        const modal = document.getElementById('chess-load-game-modal');
        
        if (modal) {
            modal.style.display = 'none';
        }

        if (confirm('确定要加载这个棋局吗？当前进度将丢失。')) {
            const loadButton = document.getElementById('load-game-button');
            const originalHtml = loadButton.innerHTML;
            loadButton.disabled = true;
            loadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';

            try {
                await this.persistence.loadGame(gameId);
            } finally {
                loadButton.disabled = false;
                loadButton.innerHTML = originalHtml;
            }
        }
    }
/**
 * 【新增】处理删除棋局
 */
async handleDeleteGame(gameId, itemElement) {
    if (!this.persistence) {
        this.showToast('删除功能未初始化');
        return;
    }

    if (confirm(`确定要永久删除棋局 "${itemElement.querySelector('.game-name').textContent}" 吗？此操作无法撤销。`)) {
        const success = await this.persistence.deleteGame(gameId);
        if (success) {
            // 从UI上移除该项
            itemElement.remove();
            this.showToast('棋局已删除');
        }
    }
}

/**
 * 【新增】处理重命名棋局
 */
async handleRenameGame(gameId, currentName, itemElement) {
    if (!this.persistence) {
        this.showToast('重命名功能未初始化');
        return;
    }

    const newName = prompt('请输入新的棋局名称:', currentName);

    if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
        const success = await this.persistence.renameGame(gameId, newName.trim());
        if (success) {
            // 更新UI上的名称
            itemElement.querySelector('.game-name').textContent = newName.trim();
            this.showToast('重命名成功');
        }
    } else if (newName !== null) {
        this.showToast('名称无效或未更改');
    }
}
}

let chessGame = null;

/**
 * 初始化国际象棋功能
 */
export function initializeChessCore(options = {}) {
    // 优化单例模式：如果实例已存在，则更新其配置，特别是UI回调
    if (chessGame) {
        Logger.info('Chess module already initialized. Updating configuration.');
        // 确保 showToast 函数被更新，以恢复UI提示
        if (options.showToast) {
            chessGame.showToast = options.showToast;
        }
        // 新增：确保 chatApiHandler 被更新
        if (options.chatApiHandler && chessGame.chatApiHandler !== options.chatApiHandler) {
            Logger.info('Updating chatApiHandler for existing chess module.');
            chessGame.chatApiHandler = options.chatApiHandler;
            // 重新初始化AI模块以传递新的handler
            chessGame.initializeAI(options.chatApiHandler);
        }
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

// src/static/js/chess/chess-core.js

// ... 在文件末尾添加 ...

/**
 * 获取国际象棋游戏实例（供其他模块使用）
 */
export function getChessGameInstance() {
    return chessGame;
}

// 同时暴露到全局，作为备用访问方式
window.getChessGameInstance = getChessGameInstance;
window.chessGameInstance = chessGame;