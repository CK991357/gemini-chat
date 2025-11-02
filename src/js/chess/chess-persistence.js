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
            
            console.log('准备保存棋局数据:', gameData); // 调试日志

            const response = await fetch('/api/chess/save', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(gameData)
            });

            const result = await response.json();
            console.log('保存响应:', result); // 调试日志

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
     * 【新增】删除指定棋局
     * @param {string|number} gameId - 棋局ID
     */
    async deleteGame(gameId) {
        try {
            const response = await fetch(`/api/chess/delete/${gameId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            return true;
        } catch (error) {
            Logger.error('Delete game failed:', error);
            this.showToast(`❌ 删除失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 【新增】重命名指定棋局
     * @param {string|number} gameId - 棋局ID
     * @param {string} newName - 新的棋局名称
     */
    async renameGame(gameId, newName) {
        try {
            const response = await fetch(`/api/chess/rename/${gameId}`, {
                method: 'PATCH', // 使用 PATCH 表示部分更新
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            return true;
        } catch (error) {
            Logger.error('Rename game failed:', error);
            this.showToast(`❌ 重命名失败: ${error.message}`);
            return false;
        }
    }


    /**
     * 准备游戏数据用于保存 - 修复版本
     */
    /**
     * 准备游戏数据用于保存 - 【已修复】
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

        // FIX: 统一使用驼峰命名(camelCase)，与JS对象保持一致
        return {
            name: gameName.substring(0, 100),
            fen: fen,
            fullHistory: this.chessGame.getFullGameHistory ? this.chessGame.getFullGameHistory() : [],
            moveHistory: this.chessGame.moveHistory || [],
            currentTurn: this.chessGame.currentTurn || 'w',
            castling: this.chessGame.castling || 'KQkq',
            enPassant: this.chessGame.enPassant || '-',
            halfMoveClock: this.chessGame.halfMoveClock || 0,
            fullMoveNumber: this.chessGame.fullMoveNumber || 1,
            metadata: { // metadata本身是一个对象
                saveTime: new Date().toISOString(),
                totalMoves: (this.chessGame.fullGameHistory ? this.chessGame.fullGameHistory.length - 1 : 0),
                gameVersion: '1.0'
            }
        };
    }

    /**
     * 从保存的数据恢复游戏 - 【已修复】
     */
    restoreGame(gameData) {
        try {
            console.log('恢复棋局数据:', gameData); // 调试日志

            // 使用 loadFEN 加载基础局面
            const success = this.chessGame.loadFEN(gameData.fen);
            
            if (!success) {
                throw new Error('FEN格式无效，无法恢复棋局');
            }

            // FIX: 后端返回的是下划线命名，在这里正确解析
            if (gameData.full_history) {
                this.chessGame.fullGameHistory = gameData.full_history; // 后端已解析
            }
            
            if (gameData.move_history) {
                this.chessGame.moveHistory = gameData.move_history; // 后端已解析
            }

            this.showToast(`✅ 棋局 "${gameData.name}" 加载成功`);
            return true;

        } catch (error) {
            Logger.error('Restore game failed:', error);
            // 将详细错误抛出，以便在 toast 中显示
            this.showToast(`❌ 恢复棋局失败: ${error.message}`);
            return false;
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