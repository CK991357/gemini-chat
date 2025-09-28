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

export class ChessGame { // 添加 export
    constructor() {
        this.pieces = {};
        this.currentTurn = 'w';
        this.castling = 'KQkq';
        this.enPassant = '-';
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.moveHistory = [];
        this.currentMoveIndex = -1;
        this.selectedSquare = null;
        this.gameId = null;
    }

    init() { // 新增一个初始化方法，在 main.js 中调用
        this.initBoard();
        this.setupEventListeners();
        this.checkUrlParams();
        // 检查是否应该显示开始模态框
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('fen')) {
            // 尝试加载当前游戏
            const currentGameId = localStorage.getItem('currentGameId');
            if (currentGameId) {
                this.hideStartModal();
                this.loadGame(currentGameId);
            }
        }
    }

    initBoard() {
        const board = document.getElementById('chessBoard');
        board.innerHTML = '';

        // 创建棋盘格子
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.addEventListener('click', () => this.handleSquareClick(row, col));
                
                // 添加拖放支持
                square.addEventListener('dragover', (e) => e.preventDefault());
                square.addEventListener('drop', (e) => this.handleDrop(e, row, col));
                
                board.appendChild(square);
            }
        }

        this.setupInitialPosition();
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
        this.addToHistory(this.generateFEN());
    }

    renderBoard() {
        // 清除所有棋子
        document.querySelectorAll('.square').forEach(square => {
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
                label.className = 'piece-label';
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
        this.addToHistory(this.generateFEN());

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
        const fenOutput = document.getElementById('fenOutput');
        fenOutput.value = this.generateFEN();
    }

    addToHistory(fen) {
        this.currentMoveIndex++;
        this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex);
        this.moveHistory.push(fen);
        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        this.moveHistory.forEach((fen, index) => {
            const li = document.createElement('li');
            li.className = 'history-item';
            if (index === this.currentMoveIndex) {
                li.style.background = '#e3f2fd';
            }

            const moveNumber = Math.floor(index / 2) + 1;
            const movePrefix = index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`;

            li.innerHTML = `
                <span>${movePrefix} ${fen.split(' ')[0]}</span>
                <button class="delete-btn" onclick="game.deleteMove(${index})">×</button>
            `;

            li.addEventListener('click', () => this.loadMove(index));
            historyList.appendChild(li);
        });
    }

    loadMove(index) {
        this.currentMoveIndex = index;
        this.loadFromFEN(this.moveHistory[index]);
        this.renderBoard();
        this.updateHistoryDisplay();
    }

    deleteMove(index) {
        event.stopPropagation();
        if (this.moveHistory.length <= 1) return;

        this.moveHistory.splice(index, 1);
        this.currentMoveIndex = Math.min(this.currentMoveIndex, this.moveHistory.length - 1);
        this.loadFromFEN(this.moveHistory[this.currentMoveIndex]);
        this.renderBoard();
        this.updateHistoryDisplay();
    }

    loadFromFEN(fen) {
        const parts = fen.split(' ');
        if (parts.length < 6) return false;

        // 解析棋子布局
        this.pieces = {};
        const rows = parts.split('/');
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
        this.currentTurn = parts;
        this.castling = parts;
        this.enPassant = parts;
        this.halfMoveClock = parseInt(parts) || 0;
        this.fullMoveNumber = parseInt(parts) || 1;

        return true;
    }

    getSquareElement(row, col) {
        return document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
    }

    getSquareName(row, col) {
        const files = 'abcdefgh';
        return `${files[col]}${8 - row}`;
    }

    setupEventListeners() {
        // 复制FEN按钮
        document.getElementById('copyBtn').addEventListener('click', () => {
            const fenOutput = document.getElementById('fenOutput');
            fenOutput.select();
            try {
                navigator.clipboard.writeText(fenOutput.value).then(() => {
                    this.showToast('FEN copied to clipboard!');
                });
            } catch (err) {
                // 降级方案
                document.execCommand('copy');
                this.showToast('FEN selected - press Ctrl+C to copy');
            }
        });

        // 保存游戏按钮
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveGame();
        });

        // 新游戏按钮
        document.getElementById('resetBtn').addEventListener('click', () => {
            if (confirm('Start a new game? Current progress will be saved.')) {
                this.newGame();
            }
        });

        // 载入游戏按钮
        document.getElementById('loadBtn').addEventListener('click', () => {
            this.showGamesModal();
        });

        // 模态框按钮
        document.getElementById('newGameBtn').addEventListener('click', () => {
            this.hideStartModal();
            this.newGame();
        });

        document.getElementById('loadGameBtn').addEventListener('click', () => {
            this.hideStartModal();
            this.showGamesModal();
        });

        document.getElementById('closeGamesBtn').addEventListener('click', () => {
            this.hideGamesModal();
        });

        // 自动保存
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.debouncedSave();
            }
        });

        // 检查URL参数
        window.addEventListener('popstate', () => {
            this.checkUrlParams();
        });
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    debouncedSave = this.debounce(() => this.saveGame(), 1000);

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    hideStartModal() {
        document.getElementById('startModal').classList.add('hidden');
    }

    showGamesModal() {
        this.loadGamesList();
        document.getElementById('gamesModal').classList.remove('hidden');
    }

    hideGamesModal() {
        document.getElementById('gamesModal').classList.add('hidden');
    }

    newGame() {
        this.gameId = Date.now().toString();
        this.setupInitialPosition();
        this.saveGame();
        this.showToast('New game started!');
    }

    async saveGame() {
        const gameData = {
            id: this.gameId || Date.now().toString(),
            name: `Game ${new Date().toLocaleDateString()}`,
            fen: this.generateFEN(),
            history: this.moveHistory,
            currentMove: this.currentMoveIndex,
            timestamp: Date.now()
        };

        try {
            const games = await this.getGames();
            const index = games.findIndex(game => game.id === gameData.id);
            if (index !== -1) {
                games[index] = gameData;
            } else {
                games.push(gameData);
            }
            
            localStorage.setItem('chessGames', JSON.stringify(games));
            localStorage.setItem('currentGameId', gameData.id);
            
            this.gameId = gameData.id;
            this.showToast('Game saved!');
        } catch (error) {
            console.error('Error saving game:', error);
        }
    }

    async loadGame(gameId) {
        try {
            const games = await this.getGames();
            const game = games.find(g => g.id === gameId);
            
            if (game) {
                this.gameId = game.id;
                this.moveHistory = game.history || [];
                this.currentMoveIndex = game.currentMove || 0;
                
                if (this.loadFromFEN(game.fen)) {
                    this.renderBoard();
                    this.updateHistoryDisplay();
                    this.hideGamesModal();
                    this.showToast('Game loaded!');
                }
            }
        } catch (error) {
            console.error('Error loading game:', error);
        }
    }

    async getGames() {
        try {
            return JSON.parse(localStorage.getItem('chessGames')) || [];
        } catch {
            return [];
        }
    }

    async loadGamesList() {
        const gamesList = document.getElementById('gamesList');
        gamesList.innerHTML = '';

        const games = await this.getGames();
        
        if (games.length === 0) {
            gamesList.innerHTML = '<li class="history-item">No saved games</li>';
            return;
        }

        games.sort((a, b) => b.timestamp - a.timestamp).forEach(game => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div>
                    <strong>${game.name}</strong>
                    <div style="font-size: 0.8em; color: #666;">
                        ${new Date(game.timestamp).toLocaleString()}
                    </div>
                </div>
                <button class="delete-btn" onclick="game.deleteSavedGame('${game.id}')">×</button>
            `;
            
            li.addEventListener('click', () => this.loadGame(game.id));
            gamesList.appendChild(li);
        });
    }

    async deleteSavedGame(gameId) {
        event.stopPropagation();
        if (confirm('Delete this saved game?')) {
            try {
                const games = await this.getGames();
                const filteredGames = games.filter(game => game.id !== gameId);
                localStorage.setItem('chessGames', JSON.stringify(filteredGames));
                
                if (this.gameId === gameId) {
                    this.newGame();
                }
                
                this.loadGamesList();
            } catch (error) {
                console.error('Error deleting game:', error);
            }
        }
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const fenParam = urlParams.get('fen');
        
        if (fenParam) {
            this.hideStartModal();
            if (this.loadFromFEN(fenParam)) {
                this.renderBoard();
                this.updateFEN();
                this.addToHistory(fenParam);
            }
        }
    }
}