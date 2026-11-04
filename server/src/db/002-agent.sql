-- Additive migration 2. Migration 1 remains immutable.
ALTER TABLE sessions ADD COLUMN understanding_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(understanding_json));
ALTER TABLE sessions ADD COLUMN learned_json TEXT CHECK(learned_json IS NULL OR json_valid(learned_json));
ALTER TABLE sessions ADD COLUMN demo_scenario INTEGER NOT NULL DEFAULT 0 CHECK(demo_scenario IN (0,1));
ALTER TABLE sessions ADD COLUMN error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json));
ALTER TABLE plans ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(questions_json));
ALTER TABLE plans ADD COLUMN changes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(changes_json));
ALTER TABLE plans ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(context_json));
ALTER TABLE plans ADD COLUMN mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live','fallback'));
ALTER TABLE plan_steps ADD COLUMN risk TEXT NOT NULL DEFAULT 'low' CHECK(risk IN ('low','medium'));
ALTER TABLE plan_steps ADD COLUMN policy_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(policy_json));
ALTER TABLE plan_steps ADD COLUMN demo_fixture INTEGER NOT NULL DEFAULT 0 CHECK(demo_fixture IN (0,1));
ALTER TABLE llm_calls ADD COLUMN mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('mock','live','fallback'));
ALTER TABLE llm_calls ADD COLUMN error_code TEXT;
