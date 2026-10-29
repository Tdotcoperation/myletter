CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  font TEXT NOT NULL,
  paper TEXT NOT NULL,
  bg_asset TEXT,
  password_salt TEXT,
  password_hash TEXT,
  available_at TEXT,
  allow_reply INTEGER NOT NULL DEFAULT 1,
  manage_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_letter ON assets(letter_id);
CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  z INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_stickers_letter ON stickers(letter_id);
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0.65,
  y REAL NOT NULL DEFAULT 0.7,
  color TEXT NOT NULL DEFAULT 'yellow',
  author_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_replies_letter ON replies(letter_id);
CREATE TABLE IF NOT EXISTS access_sessions (
  token_hash TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_letter ON access_sessions(letter_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
