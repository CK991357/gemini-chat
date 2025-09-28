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
    constructor(containerElement) {
        this.container = containerElement;
        this.boardElement = containerElement.querySelector('#chess-board');
        this.fenOutput = containerElement.querySelector('#fen-output');
        this.copyFenButton = containerElement.querySelector('#copy-fen-button');
        this.resetButton = containerElement.querySelector('#reset-chess-button');
        this.toggleButton = containerElement.querySelector('#toggle-to-vision-button');
        
        this.pieces = {};
        this.currentTurn = 'w';
        this.castling = 'KQkq';
        this.enPassant = '-';
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.selectedSquare = null;
        
        this.initBoard();
        this.setupEventListeners();
        this.setupInitialPosition();
    }

    initBoard() {
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
        this.renderBoard();
        this.updateFEN();
    }

    renderBoard() {
        // 清除所有棋子
        this.container.querySelectorAll('.chess-square').forEach(square => {
            square.innerHTML = '';
            square.classList.remove('selected', 'highlight');
        });

        // 渲染棋子
        Object.entries(this.pieces).forEach(([key, piece]) => {
            const [row, col] = key.split(',').map(Number);
            const square = this.getSquareElement(row, col);
            if (square) {
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

        // 基本规则检查：不能吃己方棋子
        if (this.pieces[toKey] && this.isSameColor(piece, this.pieces[toKey])) {
            return false;
        }

        // 执行移动
        delete this.pieces[fromKey];
        this.pieces[toKey] = piece;

        // 更新游戏状态
        this.updateGameState(piece, fromRow, fromCol, toRow, toCol);
        this.updateFEN();

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
        this.fenOutput.value = this.generateFEN();
    }

    getSquareElement(row, col) {
        return this.container.querySelector(`.chess-square[data-row="${row}"][data-col="${col}"]`);
    }

    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    setupEventListeners() {
        // 复制FEN按钮
        this.copyFenButton.addEventListener('click', () => {
            this.fenOutput.select();
            try {
                navigator.clipboard.writeText(this.fenOutput.value).then(() => {
                    Logger.info('FEN copied to clipboard!');
                });
            } catch (err) {
                // 降级方案
                document.execCommand('copy');
                Logger.info('FEN selected - press Ctrl+C to copy');
            }
        });

        // 新游戏按钮
        this.resetButton.addEventListener('click', () => {
            if (confirm('开始新游戏？当前进度将丢失。')) {
                this.setupInitialPosition();
            }
        });

        // 切换视图按钮
        this.toggleButton.addEventListener('click', () => {
            const chessContainer = document.getElementById('chess-container');
            const visionInputArea = document.getElementById('vision-input-area');
            
            if (chessContainer && visionInputArea) {
                chessContainer.style.display = 'none';
                visionInputArea.style.display = 'flex';
            }
        });
    }

    // 公共方法，用于获取当前FEN
    getCurrentFEN() {
        return this.generateFEN();
    }

    // 公共方法，用于加载FEN
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
    const chessContainer = document.getElementById('chess-container');
    const toggleToChessButton = document.getElementById('toggle-to-chess-button');
    
    if (chessContainer) {
        chessGame = new ChessGame(chessContainer);
        Logger.info('Chess module initialized.');
    }
    
    // 添加按钮事件监听器
    if (toggleToChessButton) {
        toggleToChessButton.addEventListener('click', () => {
            const chessContainer = document.getElementById('chess-container');
            const visionInputArea = document.getElementById('vision-input-area');
            
            if (chessContainer && visionInputArea) {
                chessContainer.style.display = 'block';
                visionInputArea.style.display = 'none';
            }
        });
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