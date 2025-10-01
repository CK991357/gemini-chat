/**
 * @fileoverview 走法提示辅助模块
 * 独立处理合法移动的计算和显示
 */

export class LegalMovesHelper {
    constructor(chessGame) {
        this.chessGame = chessGame;
        this.showLegalMoves = true;
        this.legalMoves = [];
    }

    /**
     * 初始化走法提示功能
     */
    initialize() {
        this.setupCheckbox();
        return this;
    }

    /**
     * 设置走法提示开关
     */
    setupCheckbox() {
        const checkbox = document.getElementById('show-legal-moves-checkbox');
        if (checkbox) {
            checkbox.checked = this.showLegalMoves;
            checkbox.addEventListener('change', (e) => {
                this.showLegalMoves = e.target.checked;
                if (!this.showLegalMoves) {
                    this.clearLegalMovesHighlight();
                } else if (this.chessGame.selectedSquare) {
                    this.highlightLegalMoves(...this.chessGame.selectedSquare);
                }
                this.chessGame.renderBoard();
            });
        }
    }

    /**
     * 高亮合法移动
     */
    highlightLegalMoves(row, col) {
        this.clearLegalMovesHighlight();
        
        if (!this.showLegalMoves) return;
        
        const piece = this.chessGame.pieces[`${row},${col}`];
        if (!piece || !this.chessGame.isValidTurn(piece)) return;
        
        this.legalMoves = this.getLegalMovesForPiece(row, col);
        
        this.legalMoves.forEach(([toRow, toCol]) => {
            const square = this.chessGame.getSquareElement(toRow, toCol);
            if (square) {
                const targetPiece = this.chessGame.pieces[`${toRow},${toCol}`];
                if (targetPiece) {
                    square.classList.add('legal-capture');
                } else {
                    square.classList.add('legal-move');
                }
            }
        });
    }

    /**
     * 清除合法移动高亮
     */
    clearLegalMovesHighlight() {
        this.legalMoves = [];
        const squares = this.chessGame.boardElement?.querySelectorAll('.chess-square');
        if (squares) {
            squares.forEach(square => {
                square.classList.remove('legal-move', 'legal-capture');
            });
        }
    }

    /**
     * 检查点击是否为合法移动
     */
    isLegalMove(row, col) {
        return this.legalMoves.some(([legalRow, legalCol]) =>
            legalRow === row && legalCol === col
        );
    }

    /**
     * 获取指定棋子的所有合法移动
     */
    getLegalMovesForPiece(row, col) {
        const piece = this.chessGame.pieces[`${row},${col}`];
        if (!piece) return [];
        
        const legalMoves = [];
        
        for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
                if (toRow === row && toCol === col) continue;
                
                if (this.chessGame.isValidPieceMove(piece, row, col, toRow, toCol)) {
                    const targetPiece = this.chessGame.pieces[`${toRow},${toCol}`];
                    if (targetPiece && this.chessGame.isSameColor(piece, targetPiece)) {
                        continue;
                    }
                    
                    if (!this.wouldBeInCheckAfterMove(row, col, toRow, toCol)) {
                        legalMoves.push([toRow, toCol]);
                    }
                }
            }
        }
        
        return legalMoves;
    }

    /**
     * 模拟移动后检查是否会被将军
     */
    wouldBeInCheckAfterMove(fromRow, fromCol, toRow, toCol) {
        const originalPieces = { ...this.chessGame.pieces };
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const movingPiece = this.chessGame.pieces[fromKey];
        
        // 执行模拟移动
        delete this.chessGame.pieces[fromKey];
        this.chessGame.pieces[toKey] = movingPiece;
        
        // 如果是吃过路兵，需要移除被吃的兵
        if (movingPiece.toLowerCase() === 'p' && this.chessGame.enPassant !== '-' &&
            toRow === this.chessGame.getEnPassantRow() && toCol === this.chessGame.getEnPassantCol()) {
            const epRow = this.chessGame.currentTurn === 'w' ? toRow + 1 : toRow - 1;
            delete this.chessGame.pieces[`${epRow},${toCol}`];
        }
        
        // 检查是否被将军
        const inCheck = this.chessGame.isKingInCheck(this.chessGame.currentTurn);
        
        // 恢复状态
        this.chessGame.pieces = originalPieces;
        
        return inCheck;
    }

    /**
     * 在渲染棋盘时更新走法提示
     */
    onRenderBoard() {
        if (!this.showLegalMoves) {
            this.clearLegalMovesHighlight();
        }
    }
}