-- Migration 1: the complete LifeOS local data model.
-- Once applied, this migration is immutable (its SHA-256 is recorded on boot).
-- Dates are UTC ISO-8601 strings. Booleans are SQLite integers constrained to 0/1.

CREATE TABLE memories (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('preference', 'decision', 'goal', 'fact', 'habit')),
  key TEXT NOT NULL CHECK (length(trim(key)) BETWEEN 1 AND 120),
  value TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 4000),
  rationale TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL CHECK (source IN ('user', 'inferred', 'seed')),
  times_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (times_confirmed >= 0),
  times_contradicted INTEGER NOT NULL DEFAULT 0 CHECK (times_contradicted >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);

-- Contradicting values can coexist with different confidence levels. Exact active
-- duplicates cannot. The service merges by type+key and records both sides of conflicts.
CREATE UNIQUE INDEX memories_active_value ON memories(type, key, value COLLATE NOCASE) WHERE archived = 0;
CREATE INDEX memories_lookup ON memories(archived, type, key);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  goal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'proposed', 'reviewing', 'executing', 'completed', 'reflected', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE memory_events (
  id TEXT PRIMARY KEY NOT NULL,
  -- Deliberately a historical identifier, not a cascading FK: deleting a memory
  -- preserves its timeline. A full reset erases both the memories and this history.
  memory_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('created', 'reinforced', 'weakened', 'edited', 'deleted', 'used')),
  detail TEXT NOT NULL CHECK (json_valid(detail)),
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX memory_events_timeline ON memory_events(memory_id, created_at);
CREATE INDEX memory_events_session ON memory_events(session_id);

CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, version)
);

CREATE TABLE plan_steps (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  order_idx INTEGER NOT NULL CHECK (order_idx >= 0),
  title TEXT NOT NULL,
  tool TEXT NOT NULL CHECK (tool IN ('draft_email', 'create_calendar_block', 'save_note', 'search_notes')),
  args_json TEXT NOT NULL CHECK (json_valid(args_json)),
  rationale TEXT NOT NULL,
  memory_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(memory_ids_json)),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'edited', 'rejected', 'executed', 'failed')),
  reject_reason TEXT,
  edited_args_json TEXT CHECK (edited_args_json IS NULL OR json_valid(edited_args_json)),
  executed_at TEXT,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  UNIQUE(plan_id, order_idx)
);
CREATE INDEX plan_steps_status ON plan_steps(plan_id, status);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  end_ts TEXT NOT NULL CHECK (end_ts > start_ts),
  notes TEXT NOT NULL DEFAULT '',
  created_by_step_id TEXT UNIQUE REFERENCES plan_steps(id) ON DELETE SET NULL
);
CREATE INDEX calendar_events_time ON calendar_events(start_ts, end_ts);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  created_by_step_id TEXT UNIQUE REFERENCES plan_steps(id) ON DELETE SET NULL
);

CREATE TABLE email_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_step_id TEXT UNIQUE REFERENCES plan_steps(id) ON DELETE SET NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'agent', 'system')),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json))
);
CREATE INDEX audit_log_timeline ON audit_log(ts);
CREATE INDEX audit_log_entity ON audit_log(entity, entity_id);

CREATE TABLE llm_calls (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  retries INTEGER NOT NULL DEFAULT 0 CHECK (retries >= 0),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX llm_calls_timeline ON llm_calls(created_at);
