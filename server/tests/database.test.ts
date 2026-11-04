import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applicationTables,
  closeDatabase,
  migrate,
  migrationVersion,
  openDatabase,
} from '../src/db/index.js';
import { demoMemories, resetDemo, seedDemo } from '../src/demo/service.js';
import { createFixture } from './helpers.js';

describe('SQLite migrations and demo data', () => {
  let fixture: ReturnType<typeof createFixture>;
  beforeEach(() => {
    fixture = createFixture();
  });
  afterEach(() => {
    fixture.close();
  });

  it('creates every required table, enables foreign keys, and migrates idempotently', () => {
    migrate(fixture.db);
    const tables = fixture.db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining([...applicationTables, 'schema_migrations']));
    expect(fixture.db.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({
      count: migrationVersion,
    });
    expect(fixture.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(fixture.db.pragma('foreign_key_check')).toEqual([]);
  });

  it('detects edits to an already applied migration', () => {
    fixture.db
      .prepare("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1")
      .run();
    expect(() => migrate(fixture.db)).toThrow('changed after it was applied');
  });

  it('enforces enums, confidence bounds, foreign keys, and valid JSON in SQLite itself', () => {
    seedDemo(fixture.db, fixture.clock);
    const id = demoMemories[0]?.id;
    expect(() =>
      fixture.db.prepare('UPDATE memories SET confidence = 2 WHERE id = ?').run(id),
    ).toThrow();
    expect(() =>
      fixture.db.prepare("UPDATE memories SET type = 'unknown' WHERE id = ?").run(id),
    ).toThrow();
    expect(() =>
      fixture.db
        .prepare(
          "INSERT INTO plans (id,session_id,version,summary,created_at) VALUES ('plan', 'missing-session', 1, 'Invalid', '2026-11-04')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      fixture.db.prepare("UPDATE memory_events SET detail = 'not json'").run(),
    ).toThrow();
  });

  it('seeds exactly five memories and never duplicates evidence or confirmations', () => {
    expect(seedDemo(fixture.db, fixture.clock)).toEqual({ inserted: 5, skipped: 0, total: 5 });
    expect(seedDemo(fixture.db, fixture.clock)).toEqual({ inserted: 0, skipped: 5, total: 5 });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM memory_events').get()).toEqual({
      count: 5,
    });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM audit_log').get()).toEqual({
      count: 5,
    });
    expect(fixture.memories.list().memories.every((memory) => memory.times_confirmed === 0)).toBe(
      true,
    );
  });

  it('does not overwrite user edits or resurrect archived/deleted seed memories', () => {
    seedDemo(fixture.db, fixture.clock);
    const [first, second, third] = demoMemories;
    if (!first || !second || !third) throw new Error('Missing seed fixtures');
    fixture.memories.edit(first.id, { value: 'No meetings before noon.' });
    fixture.memories.archive(second.id);
    fixture.memories.delete(third.id);
    expect(seedDemo(fixture.db, fixture.clock)).toEqual({ inserted: 0, skipped: 5, total: 3 });
    expect(fixture.memories.getMemory(first.id).value).toBe('No meetings before noon.');
    expect(fixture.memories.getMemory(second.id).archived).toBe(true);
    expect(() => fixture.memories.getMemory(third.id)).toThrow();
  });

  it('respects an existing user preference at the same key before seeding', () => {
    fixture.memories.addMemory({
      type: 'preference',
      key: 'meeting_start_time',
      value: 'After noon.',
    });
    expect(seedDemo(fixture.db, fixture.clock)).toEqual({ inserted: 4, skipped: 1, total: 5 });
    expect(fixture.memories.list({ search: 'After noon' }).total).toBe(1);
  });

  it('resets the complete connected data graph, history, and model calls, then reseeds', () => {
    seedDemo(fixture.db, fixture.clock);
    fixture.db.exec(`
      INSERT INTO sessions (id,goal_text,status,created_at) VALUES ('session', 'Goal', 'completed', '2026-11-04');
      INSERT INTO plans (id,session_id,version,summary,created_at) VALUES ('plan', 'session', 1, 'Summary', '2026-11-04');
      INSERT INTO plan_steps (id, plan_id, order_idx, title, tool, args_json, rationale)
        VALUES ('step', 'plan', 0, 'Draft', 'draft_email', '{}', 'Reason');
      INSERT INTO calendar_events VALUES ('event', 'Meeting', '2026-11-04T11:00:00Z', '2026-11-04T11:25:00Z', '', 'step');
      INSERT INTO notes VALUES ('note', 'Note', 'Body', '[]', 'step');
      INSERT INTO email_drafts VALUES ('draft', 'person@example.com', 'Subject', 'Body', 'step');
      INSERT INTO llm_calls (id,purpose,model,latency_ms,prompt_tokens,completion_tokens,retries,ok,created_at) VALUES ('call', 'plan', 'mock', 1, 0, 0, 0, 1, '2026-11-04');
    `);
    expect(resetDemo(fixture.db)).toEqual({ reset: true, deleted: 22 });
    for (const table of applicationTables) {
      expect(fixture.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({
        count: 0,
      });
    }
    expect(fixture.db.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({
      count: migrationVersion,
    });
    expect(resetDemo(fixture.db)).toEqual({ reset: true, deleted: 0 });
    expect(seedDemo(fixture.db, fixture.clock).inserted).toBe(5);
  });

  it('persists across connections and checkpoints cleanly on shutdown', () => {
    const directory = mkdtempSync(
      path.join(fileURLToPath(new URL('../data/', import.meta.url)), '.test-'),
    );
    const file = path.join(directory, 'nested', 'lifeos.db');
    const first = openDatabase(file);
    try {
      expect(first.pragma('journal_mode', { simple: true })).toBe('wal');
      seedDemo(first, fixture.clock);
    } finally {
      closeDatabase(first);
    }
    const second = openDatabase(file);
    try {
      expect(second.prepare('SELECT count(*) AS count FROM memories').get()).toEqual({ count: 5 });
      expect(second.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      closeDatabase(second);
      closeDatabase(second);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
