CREATE TABLE IF NOT EXISTS worker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY CHECK(id=1),
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_slot INTEGER NOT NULL DEFAULT 0
);
