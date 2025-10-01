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
        
        if (!this.showLegalMoves) {
            console.log('走法提示已关闭');
            return;
        }
        
        const piece = this.chessGame.pieces[`${row},${col}`];
        if (!piece) {
            console.log('没有找到棋子');
            return;
        }
        
        if (!this.chessGame.isValidTurn(piece)) {
            console.log('不是当前回合的棋子');
            return;
        }
        
        console.log(`高亮棋子(${row},${col}) ${piece} 的合法移动`);
        this.legalMoves = this.getLegalMovesForPiece(row, col);
        
        this.legalMoves.forEach(([toRow, toCol]) => {
            const square = this.chessGame.getSquareElement(toRow, toCol);
            if (square) {
                const targetPiece = this.chessGame.pieces[`${toRow},${toCol}`];
                if (targetPiece) {
                    square.classList.add('legal-capture');
                    console.log(`  - 可吃子: (${toRow},${toCol}) ${targetPiece}`);
                } else {
                    square.classList.add('legal-move');
                    console.log(`  - 可移动: (${toRow},${toCol})`);
                }
            }
        });
        
        console.log(`总共高亮 ${this.legalMoves.length} 个合法移动`);
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
        
        // 遍历所有可能的终点格子
        for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
                // 跳过原地不动
                if (toRow === row && toCol === col) continue;
                
                // 使用主游戏的移动验证逻辑
                if (this.chessGame.isValidPieceMove(piece, row, col, toRow, toCol)) {
                    // 检查不能吃同色棋子
                    const targetPiece = this.chessGame.pieces[`${toRow},${toCol}`];
                    if (targetPiece && this.chessGame.isSameColor(piece, targetPiece)) {
                        continue;
                    }
                    
                    // 检查移动后是否会导致自己的王被将军
                    if (!this.wouldBeInCheckAfterMove(row, col, toRow, toCol)) {
                        legalMoves.push([toRow, toCol]);
                    }
                }
            }
        }
        
        console.log(`棋子(${row},${col}) ${piece} 的合法移动:`, legalMoves.length, '个');
        return legalMoves;
    }

    /**
     * 模拟移动后检查是否会被将军
     */
    wouldBeInCheckAfterMove(fromRow, fromCol, toRow, toCol) {
        // 保存当前状态
        const originalPieces = { ...this.chessGame.pieces };
        const fromKey = `${fromRow},${fromCol}`;
        const toKey = `${toRow},${toCol}`;
        const movingPiece = this.chessGame.pieces[fromKey];
        const movingColor = this.chessGame.currentTurn;
        
        // 执行模拟移动
        delete this.chessGame.pieces[fromKey];
        this.chessGame.pieces[toKey] = movingPiece;
        
        // 如果是吃过路兵，需要移除被吃的兵
        if (movingPiece.toLowerCase() === 'p' && this.chessGame.enPassant !== '-' &&
            toRow === this.chessGame.getEnPassantRow() && toCol === this.chessGame.getEnPassantCol()) {
            const epRow = movingColor === 'w' ? toRow + 1 : toRow - 1;
            delete this.chessGame.pieces[`${epRow},${toCol}`];
        }
        
        // 检查是否被将军（检查移动方的王是否被攻击）
        const inCheck = this.chessGame.isKingInCheck(movingColor);
        
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