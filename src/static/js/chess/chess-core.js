/**
 * @fileoverview Core logic for the Chess FEN Recorder feature.
 * Handles chess board rendering, piece movement, and FEN generation.
 */

import { Logger } from '../utils/logger.js';
import { ChessAIEnhanced } from './chess-ai-enhanced.js';
import Chess from './chess.js';

// 棋子 Unicode 字符
const PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

class ChessGame {
    constructor(options = {}) {
        this.showToast = options.showToast || console.log;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        // DOM 元素引用
        this.boardElement = document.getElementById('chess-board');
        this.fenOutput = document.getElementById('fen-output');
        this.copyFenButton = document.getElementById('copy-fen-button');
        this.resetButton = document.getElementById('reset-chess-button');
        this.undoButton = document.getElementById('undo-move-button');
        this.toggleButton = document.getElementById('toggle-to-vision-button');
        this.chessFullscreen = document.getElementById('chess-fullscreen');
        this.visionChatFullscreen = document.getElementById('vision-chat-fullscreen');
        
        if (!this.boardElement) {
            console.error('Chess board element (#chess-board) not found');
            return;
        }
        
        // 核心游戏引擎
        this.game = new Chess();

        // UI 和应用状态
        this.selectedSquare = null;
        this.pendingPromotion = null;
        this.gameOver = false;
        this.fullGameHistory = [];
        this.chessAI = null;

        // 初始化流程
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
        this.createGameOverModal();
        this.createAIMoveChoiceModal();
        this.initializeAI();
        this.addAIButton();
    }

    initBoard() {
        this.boardElement.innerHTML = '';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `chess-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.addEventListener('click', () => this.handleSquareClick(row, col));
                square.addEventListener('dragover', (e) => e.preventDefault());
                square.addEventListener('drop', (e) => this.handleDrop(e, row, col));
                this.boardElement.appendChild(square);
            }
        }
    }

    setupInitialPosition() {
        this.game.reset();
        this.pendingPromotion = null;
        this.gameOver = false;
        this.selectedSquare = null;
        this.initializeFullHistory();
        this.renderBoard();
        this.updateFEN();
        this.saveGameToLocalStorage();
    }

    undoMove() {
        if (this.fullGameHistory.length > 1) {
            this.game.undo();
            this.removeLastMoveFromHistory();
            this.gameOver = false; // 撤销后游戏继续
            this.renderBoard();
            this.updateFEN();
            this.saveGameToLocalStorage();
        }
    }

    renderBoard() {
        if (!this.boardElement) return;

        const squares = this.boardElement.querySelectorAll('.chess-square');
        squares.forEach(square => {
            square.innerHTML = '';
            square.classList.remove('selected', 'highlight');
        });

        const board = this.game.board();
        board.forEach((rowArray, row) => {
            rowArray.forEach((piece, col) => {
                if (piece) {
                    const square = this.getSquareElement(row, col);
                    if (square) {
                        const pieceSymbol = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                        const pieceElement = document.createElement('div');
                        pieceElement.className = 'chess-piece';
                        pieceElement.textContent = PIECES[pieceSymbol];
                        pieceElement.draggable = true;
                        pieceElement.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text/plain', `${row},${col}`);
                        });
                        square.appendChild(pieceElement);
                    }
                }
            });
        });

        if (this.selectedSquare) {
            const [row, col] = this.selectedSquare;
            this.getSquareElement(row, col)?.classList.add('selected');
        }
    }

    handleSquareClick(row, col) {
        if (this.gameOver || this.pendingPromotion) return;
        
        const squareName = this.getSquareName(row, col);
        const piece = this.game.get(squareName);

        if (this.selectedSquare) {
            const [fromRow, fromCol] = this.selectedSquare;
            this.movePiece(fromRow, fromCol, row, col);
            this.selectedSquare = null;
        } else if (piece && piece.color === this.game.turn()) {
            this.selectedSquare = [row, col];
        } else if (piece) {
            this.showToast(`现在轮到${this.game.turn() === 'w' ? '白方' : '黑方'}走棋`);
        }
        
        this.renderBoard();
    }

    handleDrop(e, toRow, toCol) {
        e.preventDefault();
        if (this.gameOver || this.pendingPromotion) return;
        
        const data = e.dataTransfer.getData('text/plain');
        const [fromRow, fromCol] = data.split(',').map(Number);
        
        this.movePiece(fromRow, fromCol, toRow, toCol);
        this.selectedSquare = null;
        this.renderBoard();
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        if (this.gameOver) return false;

        const fromSquare = this.getSquareName(fromRow, fromCol);
        const toSquare = this.getSquareName(toRow, toCol);
        const piece = this.game.get(fromSquare);

        const isPromotion = piece && piece.type === 'p' && (toRow === 0 || toRow === 7);

        if (isPromotion) {
            this.pendingPromotion = { from: fromSquare, to: toSquare };
            this.showPromotionSelection();
            return true;
        }

        const move = this.game.move({ from: fromSquare, to: toSquare });

        if (move === null) {
            this.showToast('不合法的移动！');
            return false;
        }

        this.handleMoveSuccess(move);
        return true;
    }

    handleMoveSuccess(move) {
        this.renderBoard();
        this.recordMoveToHistory();
        this.updateFEN();
        this.checkGameEndConditions();
    }

    /**
     * 新增：通过SAN字符串移动棋子，专为AI模块提供接口
     */
    movePieceWithSAN(san) {
        if (this.gameOver) return false;

        // 使用 sloppy: true 来允许诸如 "gxf6" 这样的简写
        const move = this.game.move(san, { sloppy: true });

        if (move === null) {
            this.showToast(`AI提供的走法 '${san}' 不合法！`);
            return false;
        }

        this.showToast(`AI 走法: ${san}`);
        this.handleMoveSuccess(move);
        return true;
    }

    checkGameEndConditions() {
        if (this.game.isCheckmate()) {
            this.gameOver = true;
            const winner = this.game.turn() === 'w' ? '黑方' : '白方';
            this.showGameOverModal(`${winner}胜利 (将杀)！`);
        } else if (this.game.isStalemate()) {
            this.gameOver = true;
            this.showGameOverModal('和棋 (逼和)！');
        } else if (this.game.isThreefoldRepetition()) {
            this.gameOver = true;
            this.showGameOverModal('和棋 (三次重复局面)！');
        } else if (this.game.isInsufficientMaterial()) {
            this.gameOver = true;
            this.showGameOverModal('和棋 (子力不足)！');
        } else if (this.game.isDraw()) {
            this.gameOver = true;
            this.showGameOverModal('和棋 (50步规则)！');
        } else if (this.game.inCheck()) {
            this.showToast('将军！');
        }
    }

    showPromotionSelection() {
        const promotionPieces = this.game.turn() === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
        const pieceNames = {'Q': '后', 'R': '车', 'B': '象', 'N': '马', 'q': '后', 'r': '车', 'b': '象', 'n': '马'};
        
        const selectionUI = document.createElement('div');
        selectionUI.className = 'promotion-selection-ui';
        
        promotionPieces.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'chess-piece';
            btn.textContent = PIECES[p];
            btn.title = pieceNames[p];
            btn.onclick = () => {
                this.completePromotion(p);
                document.body.removeChild(selectionUI);
            };
            selectionUI.appendChild(btn);
        });
        
        document.body.appendChild(selectionUI);
        this.showToast('请选择要升变的棋子');
    }

    completePromotion(promotionPiece) {
        if (!this.pendingPromotion) return;

        const { from, to } = this.pendingPromotion;
        const move = this.game.move({ from, to, promotion: promotionPiece.toLowerCase() });

        if (move === null) {
            this.showToast('升变失败，这是一个不合法的走法。');
        } else {
            this.showToast(`兵升变为${this.getPieceName(promotionPiece)}`);
            this.handleMoveSuccess(move);
        }

        this.pendingPromotion = null;
    }

    getPieceName(piece) {
        const names = {'Q': '后', 'R': '车', 'B': '象', 'N': '马', 'q': '后', 'r': '车', 'b': '象', 'n': '马'};
        return names[piece.toUpperCase()] || '棋子';
    }

    generateFEN() {
        return this.game.fen();
    }

    updateFEN() {
        if (this.fenOutput) {
            this.fenOutput.value = this.generateFEN();
        }
    }

    loadFEN(fen) {
        try {
            if (!this.game.load(fen)) {
                 throw new Error('FEN格式不合法或局面无效');
            }
            this.gameOver = this.game.isGameOver();
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

    getSquareElement(row, col) {
        return document.querySelector(`.chess-square[data-row="${row}"][data-col="${col}"]`);
    }

    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    setupEventListeners() {
        this.copyFenButton?.addEventListener('click', () => {
            this.fenOutput?.select();
            navigator.clipboard.writeText(this.fenOutput.value);
        });
        this.resetButton?.addEventListener('click', () => {
            if (confirm('开始新游戏？当前进度将丢失。')) {
                this.setupInitialPosition();
            }
        });
        this.undoButton?.addEventListener('click', () => this.undoMove());
        this.toggleButton?.addEventListener('click', () => this.showChatView());
    }

    showChatView() {
        this.chessFullscreen?.classList.remove('active');
        this.visionChatFullscreen?.classList.add('active');
    }

    showChessView() {
        this.visionChatFullscreen?.classList.remove('active');
        this.chessFullscreen?.classList.add('active');
        requestAnimationFrame(() => this.renderBoard());
    }

    getCurrentFEN() {
        return this.generateFEN();
    }

    initializeFullHistory() {
        this.fullGameHistory = [this.generateFEN()];
    }

    recordMoveToHistory() {
        this.fullGameHistory.push(this.generateFEN());
        this.saveGameToLocalStorage();
    }

    removeLastMoveFromHistory() {
        if (this.fullGameHistory.length > 1) {
            this.fullGameHistory.pop();
        }
    }

    getFullGameHistory() {
        return [...this.fullGameHistory];
    }

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

    loadGameFromLocalStorage() {
        try {
            const savedState = localStorage.getItem('chessGameState');
            if (savedState) {
                const gameState = JSON.parse(savedState);
                if (gameState && gameState.fullGameHistory && gameState.currentFEN) {
                    this.fullGameHistory = gameState.fullGameHistory;
                    this.loadFEN(gameState.currentFEN);
                    this.showToast('已恢复您上次的棋局');
                }
            }
        } catch (error) {
            console.error('无法从localStorage加载游戏状态:', error);
            this.setupInitialPosition();
        }
    }

    initializeAI() {
        this.chessAI = new ChessAIEnhanced(this, {
            showToast: this.showToast,
            logMessage: (message, type = 'info') => {
                if (typeof chatUI !== 'undefined' && chatUI.logMessage) {
                    chatUI.logMessage(message, type);
                }
            },
            showMoveChoiceModal: (analysis, moves) => this.showAIMoveChoiceModal(analysis, moves),
            displayVisionMessage: (message) => {
                if (typeof window.displayVisionMessage === 'function') {
                    window.displayVisionMessage(message);
                }
            }
        });
    }

    addAIButton() {
        const fenActions = document.querySelector('.fen-actions');
        if (!fenActions || document.getElementById('ask-ai-button')) return;

        const aiButton = document.createElement('button');
        aiButton.id = 'ask-ai-button';
        aiButton.className = 'action-button chess-ai-button';
        aiButton.innerHTML = '<i class="fas fa-robot"></i> 问AI走法';
        aiButton.addEventListener('click', () => this.handleAskAI());
        fenActions.appendChild(aiButton);
    }

    async handleAskAI() {
        if (this.gameOver || this.pendingPromotion) {
            this.showToast(this.gameOver ? '游戏已结束' : '请先完成兵的升变');
            return;
        }
        
        const aiButton = document.getElementById('ask-ai-button');
        const originalText = aiButton.innerHTML;
        aiButton.disabled = true;
        aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI思考中...';

        try {
            await this.chessAI.askAIForMove();
        } catch (error) {
            console.error('AI走法处理异常:', error);
            this.showToast(`AI走法处理失败: ${error.message}`);
        } finally {
            aiButton.disabled = false;
            aiButton.innerHTML = originalText;
        }
    }

    createGameOverModal() {
        if (document.getElementById('chess-game-over-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'chess-game-over-modal';
        modal.className = 'chess-game-over-modal';
        modal.innerHTML = `
            <div class="chess-game-over-content">
                <h2>游戏结束</h2>
                <p id="chess-game-over-message"></p>
                <div class="chess-game-over-buttons">
                    <button id="chess-new-game-btn" class="chess-btn-primary">开始新游戏</button>
                    <button id="chess-close-modal-btn" class="chess-btn-secondary">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('chess-new-game-btn').addEventListener('click', () => {
            this.setupInitialPosition();
            modal.style.display = 'none';
        });
        document.getElementById('chess-close-modal-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    showGameOverModal(message) {
        const modal = document.getElementById('chess-game-over-modal');
        if (!modal) return;
        document.getElementById('chess-game-over-message').textContent = message;
        modal.style.display = 'flex';
        this.showToast(message);
    }

    createAIMoveChoiceModal() {
        if (document.getElementById('chess-ai-choice-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'chess-ai-choice-modal';
        modal.className = 'chess-ai-choice-modal';
        modal.innerHTML = `
            <div class="chess-ai-choice-content">
                <h2>AI 提供了多个建议</h2>
                <div class="ai-analysis-container">
                    <p><strong>AI 分析:</strong></p>
                    <div id="ai-analysis-text" class="ai-analysis-text"></div>
                </div>
                <div id="ai-move-choices" class="ai-move-choices"></div>
                <div class="chess-ai-choice-buttons">
                    <button id="chess-ai-confirm-btn" class="chess-btn-primary" disabled>确定</button>
                    <button id="chess-ai-cancel-btn" class="chess-btn-secondary">取消</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    showAIMoveChoiceModal(analysisText, moves) {
        return new Promise((resolve, reject) => {
            const modal = document.getElementById('chess-ai-choice-modal');
            const confirmBtn = document.getElementById('chess-ai-confirm-btn');
            const cancelBtn = document.getElementById('chess-ai-cancel-btn');
            
            document.getElementById('ai-analysis-text').textContent = analysisText;
            const choicesContainer = document.getElementById('ai-move-choices');
            choicesContainer.innerHTML = '<p><strong>请选择一个走法:</strong></p>';
            let selectedMove = null;

            moves.forEach((move, index) => {
                const label = document.createElement('label');
                label.className = 'ai-move-choice';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'ai-move-choice';
                input.value = move;
                input.id = `ai-move-${index}`;
                input.onchange = () => {
                    selectedMove = input.value;
                    confirmBtn.disabled = false;
                };
                label.append(input, ` ${move}`);
                choicesContainer.appendChild(label);
            });

            confirmBtn.disabled = true;
            modal.style.display = 'flex';

            const cleanup = (resolver) => {
                modal.style.display = 'none';
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolver();
            };

            confirmBtn.onclick = () => cleanup(() => resolve(selectedMove));
            cancelBtn.onclick = () => cleanup(() => reject(new Error('用户取消了选择')));
        });
    }
}

let chessGame = null;

export function initializeChessCore(options = {}) {
    if (chessGame) {
        Logger.info('Chess module already initialized. Updating configuration.');
        if (options.showToast) {
            chessGame.showToast = options.showToast;
        }
        return;
    }
    try {
        chessGame = new ChessGame(options);
        Logger.info('Chess module initialized successfully.');
        
        const toggleToChessButton = document.getElementById('toggle-to-chess-button');
        if (toggleToChessButton) {
            toggleToChessButton.addEventListener('click', () => {
                chessGame?.showChessView();
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
    return chessGame ? chessGame.loadFEN(fen) : false;
}

/**
 * 新增：导出供AI模块使用的SAN移动函数
 */
export function movePieceWithSAN(san) {
    return chessGame ? chessGame.movePieceWithSAN(san) : false;
}