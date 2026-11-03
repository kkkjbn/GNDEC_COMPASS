-- GNDEC Compass 2.0 — edge telemetry for official-source monitoring.
-- No student, staff or device data is ever stored here.

CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY,
  last_hash TEXT,
  last_changed_at TEXT,
  last_checked_at TEXT,
  last_ok INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS source_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  hash TEXT,
  changed INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_checks_at ON source_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_checks_source ON source_checks (source, checked_at DESC);

CREATE TABLE IF NOT EXISTS build_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  source TEXT NOT NULL,
  dispatched INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  detail TEXT
);
