-- schema.sql
-- 国际象棋棋局保存表
CREATE TABLE IF NOT EXISTS chess_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fen TEXT NOT NULL,
  full_history TEXT NOT NULL,
  move_history TEXT NOT NULL,
  current_turn TEXT(1) NOT NULL,
  castling VARCHAR(4) NOT NULL,
  en_passant VARCHAR(2) NOT NULL,
  half_move_clock INTEGER NOT NULL,
  full_move_number INTEGER NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_chess_games_updated ON chess_games(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chess_games_name ON chess_games(name);