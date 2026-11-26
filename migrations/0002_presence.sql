-- Presence: when each player was last seen (used for the "players online" count).
ALTER TABLE users ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_last_seen ON users (last_seen_at);
CREATE INDEX idx_users_active_game ON users (active_game_id);
