import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type LifeDatabase = Database.Database;
export const migrationVersion = 3;

export const applicationTables = [
  'memory_embeddings',
  'memory_events',
  'calendar_events',
  'notes',
  'email_drafts',
  'plan_steps',
  'plans',
  'sessions',
  'memories',
  'audit_log',
  'llm_calls',
] as const;

export function migrate(db: LifeDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const migrations = [
    {
      version: 1,
      name: 'foundation',
      sql: readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
    },
    {
      version: 2,
      name: 'agent',
      sql: readFileSync(new URL('./002-agent.sql', import.meta.url), 'utf8'),
    },
    {
      version: 3,
      name: 'embeddings',
      sql: readFileSync(new URL('./003-embeddings.sql', import.meta.url), 'utf8'),
    },
  ];

  db.transaction(() => {
    for (const migration of migrations) {
      const checksum = createHash('sha256')
        .update(migration.sql.replace(/\r\n/g, '\n'))
        .digest('hex');
      const applied = db
        .prepare<[number], { checksum: string }>(
          'SELECT checksum FROM schema_migrations WHERE version = ?',
        )
        .get(migration.version);
      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(
            `Migration ${migration.version} changed after it was applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, checksum, new Date().toISOString());
    }
  }).immediate();
}

export function openDatabase(filename: string): LifeDatabase {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  try {
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeDatabase(db: LifeDatabase): void {
  if (!db.open) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}
