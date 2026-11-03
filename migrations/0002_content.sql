-- GNDEC Compass 2.0 — editorial content and campus route reports.
-- Applied after 0001_init.sql.

CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'update',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_kind ON content(kind, published);
CREATE INDEX IF NOT EXISTS idx_content_updated ON content(updated_at DESC);

CREATE TABLE IF NOT EXISTS route_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_place TEXT NOT NULL DEFAULT '',
  to_place TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_route_reports_status ON route_reports(status, created_at DESC);
