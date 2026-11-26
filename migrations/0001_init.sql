-- KĀRA online: accounts, sessions, profiles and rated games.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL DEFAULT '',
  bio            TEXT NOT NULL DEFAULT '',
  has_avatar     INTEGER NOT NULL DEFAULT 0,
  avatar_version INTEGER NOT NULL DEFAULT 0,
  rating         INTEGER NOT NULL DEFAULT 1200,
  peak_rating    INTEGER NOT NULL DEFAULT 1200,
  games_played   INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  losses         INTEGER NOT NULL DEFAULT 0,
  draws          INTEGER NOT NULL DEFAULT 0,
  active_game_id TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_users_rating ON users (rating DESC);

-- Profile photos are kept out of the users table so lists stay small.
CREATE TABLE avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,          -- base64 (client resizes to ~256px JPEG)
  updated_at INTEGER NOT NULL
);

-- Only a SHA-256 hash of each session token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE games (
  id                 TEXT PRIMARY KEY,
  variant            TEXT NOT NULL,
  dawn_id            TEXT NOT NULL REFERENCES users (id),
  dusk_id            TEXT NOT NULL REFERENCES users (id),
  result             TEXT NOT NULL,          -- 'DAWN' | 'DUSK' | 'DRAW'
  reason             TEXT NOT NULL,
  dawn_rating_before INTEGER NOT NULL,
  dusk_rating_before INTEGER NOT NULL,
  dawn_rating_after  INTEGER NOT NULL,
  dusk_rating_after  INTEGER NOT NULL,
  move_count         INTEGER NOT NULL,
  moves              TEXT NOT NULL,          -- JSON array of move notations
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER NOT NULL
);

CREATE INDEX idx_games_dawn ON games (dawn_id, ended_at DESC);
CREATE INDEX idx_games_dusk ON games (dusk_id, ended_at DESC);
