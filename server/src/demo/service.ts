import { applicationTables, type LifeDatabase } from '../db/index.js';
import { MemoryService, type Clock } from '../memory/service.js';
import type { AddMemoryInput } from '../memory/schemas.js';

export const demoMemories: ReadonlyArray<{ id: string; memory: AddMemoryInput }> = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    memory: {
      type: 'preference',
      key: 'meeting_start_time',
      value: 'No meetings before 11am.',
      rationale: 'Protect mornings for uninterrupted work. Meetings begin at 11:00 or later.',
      confidence: 0.95,
      source: 'seed',
    },
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    memory: {
      type: 'preference',
      key: 'email_style',
      value: 'Write short, bullet-style emails.',
      rationale: 'Keep email drafts brief, easy to scan, and action-oriented.',
      confidence: 0.9,
      source: 'seed',
    },
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    memory: {
      type: 'preference',
      key: 'friday_focus_time',
      value: 'Friday afternoons are focus time.',
      rationale: 'Protect Friday afternoon calendar blocks from meetings and interruptions.',
      confidence: 0.9,
      source: 'seed',
    },
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    memory: {
      type: 'preference',
      key: 'prep_duration_minutes',
      value: 'Prefer 25-minute prep blocks.',
      rationale: 'A focused 25-minute preparation block is enough to review an agenda.',
      confidence: 0.85,
      source: 'seed',
    },
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    memory: {
      type: 'habit',
      key: 'investor_update_day',
      value: 'Investor updates go out Thursdays.',
      rationale: 'Prepare the investor update on Thursday ahead of Friday investor calls.',
      confidence: 0.9,
      source: 'seed',
    },
  },
];

export function seedDemo(
  db: LifeDatabase,
  clock: Clock = () => new Date(),
): { inserted: number; skipped: number; total: number } {
  const memories = new MemoryService(db, clock);
  return db
    .transaction(() => {
      let inserted = 0;
      for (const entry of demoMemories) {
        // Respect user edits, archives, deletions, and memories entered before seeding.
        const exists = db
          .prepare(
            `
        SELECT 1 FROM memories WHERE id = ? OR (type = ? AND key = ?)
        UNION ALL SELECT 1 FROM memory_events WHERE memory_id = ? LIMIT 1
      `,
          )
          .get(entry.id, entry.memory.type, entry.memory.key, entry.id);
        if (exists) continue;
        memories.addMemory(
          entry.memory,
          { actor: 'system', reason: 'Loaded the LifeOS demo preferences.' },
          entry.id,
        );
        inserted += 1;
      }
      const total =
        db
          .prepare<[], { total: number }>(
            'SELECT count(*) AS total FROM memories WHERE archived = 0',
          )
          .get()?.total ?? 0;
      return { inserted, skipped: demoMemories.length - inserted, total };
    })
    .immediate();
}

/** Remove every application row atomically; keep the migration ledger intact. */
export function resetDemo(db: LifeDatabase): { reset: true; deleted: number } {
  return db
    .transaction(() => {
      let deleted = 0;
      for (const table of applicationTables) {
        // Table names are a compile-time allowlist, never request input.
        deleted += db.prepare(`DELETE FROM ${table}`).run().changes;
      }
      return { reset: true as const, deleted };
    })
    .immediate();
}
