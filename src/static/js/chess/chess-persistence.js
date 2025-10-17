// static/js/chess/chess-persistence.js
/**
 * 国际象棋数据持久化模块
 * 使用 Cloudflare D1 进行棋局保存和加载
 */

import { Logger } from '../utils/logger.js';

class ChessPersistence {
    constructor(chessGame, showToast) {
        this.chessGame = chessGame;
        this.showToast = showToast;
    }

    /**
     * 保存当前棋局
     * @param {string} gameName - 棋局名称
     */
    async saveGame(gameName = '未命名棋局') {
        try {
            // 验证游戏状态
            if (this.chessGame.gameOver) {
                throw new Error('游戏已结束，无需保存');
            }

            const gameData = this.prepareGameData(gameName);

            const response = await fetch('/api/chess/save', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(gameData)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            this.showToast(`✅ 棋局 "${gameName}" 保存成功 (ID: ${result.gameId})`);
            Logger.info(`Game saved: ${gameName} with ID: ${result.gameId}`);
            return result.gameId;

        } catch (error) {
            Logger.error('Save game failed:', error);
            this.showToast(`❌ 保存失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 加载保存的棋局列表
     */
    async loadGameList() {
        try {
            const response = await fetch('/api/chess/list');
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '加载列表失败');
            }
            
            Logger.info(`Loaded ${result.games?.length || 0} games from server`);
            return result.games || [];

        } catch (error) {
            Logger.error('Load game list failed:', error);
            this.showToast(`❌ 加载列表失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 加载指定棋局
     * @param {string|number} gameId - 棋局ID
     */
    async loadGame(gameId) {
        try {
            const response = await fetch(`/api/chess/load/${gameId}`);
            const result = await response.json();

            if (!response.ok || !result.success || !result.game) {
                throw new Error(result.error || '加载棋局失败');
            }

            const success = this.restoreGame(result.game);
            if (success) {
                Logger.info(`Game loaded successfully: ${result.game.name}`);
            }
            return success;

        } catch (error) {
            Logger.error('Load game failed:', error);
            this.showToast(`❌ 加载棋局失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 准备游戏数据用于保存
     */
    prepareGameData(gameName) {
        // 数据验证
        if (!this.chessGame.getCurrentFEN) {
            throw new Error('游戏实例未正确初始化');
        }

        const fen = this.chessGame.getCurrentFEN();
        if (!fen || fen.split(' ').length !== 6) {
            throw new Error('当前棋局状态不完整，无法保存');
        }

        return {
            name: gameName.substring(0, 100), // 限制名称长度
            fen: fen,
            fullHistory: this.chessGame.getFullGameHistory ? this.chessGame.getFullGameHistory() : [],
            moveHistory: this.chessGame.moveHistory || [],
            currentTurn: this.chessGame.currentTurn || 'w',
            castling: this.chessGame.castling || 'KQkq',
            enPassant: this.chessGame.enPassant || '-',
            halfMoveClock: this.chessGame.halfMoveClock || 0,
            fullMoveNumber: this.chessGame.fullMoveNumber || 1,
            metadata: {
                saveTime: new Date().toISOString(),
                totalMoves: (this.chessGame.fullGameHistory ? this.chessGame.fullGameHistory.length - 1 : 0),
                gameVersion: '1.0'
            }
        };
    }

    /**
     * 从保存的数据恢复游戏
     */
    restoreGame(gameData) {
        try {
            // 使用 loadFEN 加载基础局面
            const success = this.chessGame.loadFEN(gameData.fen);
            
            if (!success) {
                throw new Error('FEN格式无效，无法恢复棋局');
            }

            // 恢复完整历史记录
            if (gameData.full_history && Array.isArray(gameData.full_history)) {
                this.chessGame.fullGameHistory = [...gameData.full_history];
            }
            
            if (gameData.move_history && Array.isArray(gameData.move_history)) {
                this.chessGame.moveHistory = [...gameData.move_history];
            }

            this.showToast(`✅ 棋局 "${gameData.name}" 加载成功`);
            return true;

        } catch (error) {
            Logger.error('Restore game failed:', error);
            throw new Error(`恢复棋局失败: ${error.message}`);
        }
    }
}

// 单例模式
let chessPersistenceInstance = null;

export function initializeChessPersistence(chessGame, showToast) {
    if (!chessPersistenceInstance) {
        chessPersistenceInstance = new ChessPersistence(chessGame, showToast);
        Logger.info('Chess persistence module initialized with CHAT_DB binding');
    }
    return chessPersistenceInstance;
}

export function getChessPersistenceInstance() {
    return chessPersistenceInstance;
}