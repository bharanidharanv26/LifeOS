import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LifeDatabase } from '../db/index.js';
import { AppError } from '../errors.js';
import { rankMemories } from './retrieval.js';
import {
  addMemorySchema,
  editMemorySchema,
  memoryIdSchema,
  retrieveMemoriesSchema,
  type AddMemoryInput,
  type EditMemoryInput,
  type Memory,
  type MemoryEvent,
  type MemoryEventType,
  type MemoryListOptions,
  type MemorySource,
  type RetrievedMemory,
} from './schemas.js';

type MemoryRow = Omit<Memory, 'archived'> & { archived: number };
type Actor = 'user' | 'agent' | 'system';
export type Clock = () => Date;

export interface MemoryContext {
  actor?: Actor;
  sessionId?: string;
  reason?: string;
}

interface EventDetail {
  reason: string;
  before?: Memory;
  after?: Memory;
  related_memory_id?: string;
  query?: string;
  score?: number;
  why_retrieved?: string;
}

const DAY_MS = 86_400_000;
const roundedConfidence = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
const fromRow = (row: MemoryRow): Memory => ({ ...row, archived: row.archived === 1 });
const defaultActor = (source: MemorySource): Actor =>
  source === 'inferred' ? 'agent' : source === 'seed' ? 'system' : 'user';
const sameValue = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export class MemoryService {
  constructor(
    private readonly db: LifeDatabase,
    private readonly clock: Clock = () => new Date(),
  ) {}

  getMemory(id: string): Memory {
    memoryIdSchema.parse(id);
    const row = this.db.prepare<[string], MemoryRow>('SELECT * FROM memories WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'MEMORY_NOT_FOUND', 'This memory could not be found.');
    return fromRow(row);
  }

  list(options: Partial<MemoryListOptions> = {}): {
    memories: Memory[];
    total: number;
    limit: number;
    offset: number;
  } {
    const { include_archived = false, limit = 100, offset = 0 } = options;
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (!include_archived) conditions.push('archived = 0');
    if (options.type) {
      conditions.push('type = ?');
      values.push(options.type);
    }
    if (options.source) {
      conditions.push('source = ?');
      values.push(options.source);
    }
    if (options.search) {
      conditions.push(
        "(key LIKE ? ESCAPE '!' OR value LIKE ? ESCAPE '!' OR rationale LIKE ? ESCAPE '!')",
      );
      const term = `%${options.search.replace(/[!%_]/g, '!$&')}%`;
      values.push(term, term, term);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total =
      this.db
        .prepare<(string | number)[], { total: number }>(
          `SELECT count(*) AS total FROM memories ${where}`,
        )
        .get(...values)?.total ?? 0;
    const rows = this.db
      .prepare<(string | number)[], MemoryRow>(
        `SELECT * FROM memories ${where} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset);
    return { memories: rows.map(fromRow), total, limit, offset };
  }

  addMemory(input: AddMemoryInput, context: MemoryContext = {}, id: string = randomUUID()): Memory {
    const data = addMemorySchema.parse(input);
    memoryIdSchema.parse(id);
    return this.db.transaction(() => {
      const now = this.clock().toISOString();
      const memory: Memory = {
        ...data,
        id,
        confidence: roundedConfidence(data.confidence),
        times_confirmed: 0,
        times_contradicted: 0,
        created_at: now,
        updated_at: now,
        last_used_at: null,
        archived: false,
      };
      this.db
        .prepare(
          `
        INSERT INTO memories (id, type, key, value, rationale, confidence, source,
          times_confirmed, times_contradicted, created_at, updated_at, last_used_at, archived)
        VALUES (@id, @type, @key, @value, @rationale, @confidence, @source,
          @times_confirmed, @times_contradicted, @created_at, @updated_at, @last_used_at, @archived)
      `,
        )
        .run({ ...memory, archived: 0 });
      this.recordEvent(
        memory.id,
        'created',
        { reason: context.reason ?? 'Memory added.', after: memory },
        {
          ...context,
          actor: context.actor ?? defaultActor(memory.source),
        },
      );
      return memory;
    })();
  }

  /** Same type+key+value confirms; a different value is an explicit contradiction. */
  upsertMemory(input: AddMemoryInput, context: MemoryContext = {}): Memory {
    const data = addMemorySchema.parse(input);
    return this.db.transaction(() => {
      const existing = this.db
        .prepare<[string, string], MemoryRow>(
          'SELECT * FROM memories WHERE type = ? AND key = ? AND archived = 0 ORDER BY created_at, id',
        )
        .all(data.type, data.key)
        .map(fromRow);
      const match = existing.find((memory) => sameValue(memory.value, data.value));
      const conflictContext = {
        ...context,
        actor: context.actor ?? defaultActor(data.source),
        reason: context.reason ?? `New evidence for “${data.key}”: ${data.value}`,
      };
      for (const memory of existing) {
        if (memory.id !== match?.id) this.weaken(memory.id, conflictContext);
      }
      if (match) return this.reinforce(match.id, conflictContext);
      return this.addMemory(data, conflictContext);
    })();
  }

  /** Reflection can name a conflicting memory even when its key differs. */
  resolveConflict(existingId: string, input: AddMemoryInput, context: MemoryContext = {}): Memory {
    const data = addMemorySchema.parse(input);
    return this.db.transaction(() => {
      const existing = this.requireActive(existingId);
      const conflictContext = {
        ...context,
        reason: context.reason ?? `Superseded by evidence for “${data.key}”: ${data.value}`,
      };
      // Same-key conflicts are already weakened by upsertMemory; never decrement twice.
      if (existing.type !== data.type || existing.key !== data.key)
        this.weaken(existing.id, conflictContext);
      return this.upsertMemory(data, conflictContext);
    })();
  }

  reinforce(id: string, context: MemoryContext = {}): Memory {
    return this.db.transaction(() => {
      const before = this.requireActive(id);
      const after = {
        ...before,
        confidence: roundedConfidence(Math.min(0.98, before.confidence + 0.1)),
        times_confirmed: before.times_confirmed + 1,
        updated_at: this.clock().toISOString(),
      };
      this.writeMemory(after);
      this.recordEvent(
        id,
        'reinforced',
        { reason: context.reason ?? 'Confirmed by a user decision.', before, after },
        { actor: 'agent', ...context },
      );
      return after;
    })();
  }

  weaken(id: string, context: MemoryContext = {}): Memory {
    return this.db.transaction(() => {
      const before = this.requireActive(id);
      const confidence = roundedConfidence(before.confidence - 0.25);
      const after = {
        ...before,
        confidence,
        archived: confidence < 0.15,
        times_contradicted: before.times_contradicted + 1,
        updated_at: this.clock().toISOString(),
      };
      this.writeMemory(after);
      this.recordEvent(
        id,
        'weakened',
        {
          reason: `${context.reason ?? 'Contradicted by a user decision.'}${after.archived ? ' Automatically archived below 0.15 confidence.' : ''}`,
          before,
          after,
        },
        { actor: 'agent', ...context },
      );
      return after;
    })();
  }

  edit(id: string, input: EditMemoryInput, context: MemoryContext = {}): Memory {
    const data = editMemorySchema.parse(input);
    return this.db.transaction(() => {
      const before = this.getMemory(id);
      const after: Memory = {
        ...before,
        type: data.type ?? before.type,
        key: data.key ?? before.key,
        value: data.value ?? before.value,
        rationale: data.rationale ?? before.rationale,
        confidence: data.confidence ?? before.confidence,
        source: data.source ?? before.source,
        archived: data.archived ?? before.archived,
        updated_at: this.clock().toISOString(),
      };
      this.writeMemory(after);
      this.recordEvent(
        id,
        'edited',
        { reason: context.reason ?? 'Memory edited by the user.', before, after },
        { actor: 'user', ...context },
      );
      return after;
    })();
  }

  archive(id: string, context: MemoryContext = {}): Memory {
    const memory = this.getMemory(id);
    if (memory.archived) return memory;
    return this.edit(
      id,
      { archived: true },
      { ...context, reason: context.reason ?? 'Memory archived; excluded from retrieval.' },
    );
  }

  delete(id: string, context: MemoryContext = {}): Memory {
    return this.db.transaction(() => {
      const before = this.getMemory(id);
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      this.recordEvent(
        id,
        'deleted',
        { reason: context.reason ?? 'Memory deleted by the user.', before },
        { actor: 'user', ...context },
      );
      return before;
    })();
  }

  history(id: string, limit = 100, offset = 0): MemoryEvent[] {
    memoryIdSchema.parse(id);
    z.number().int().min(1).max(200).parse(limit);
    z.number().int().nonnegative().parse(offset);
    const exists = this.db
      .prepare(
        'SELECT 1 FROM memories WHERE id = ? UNION ALL SELECT 1 FROM memory_events WHERE memory_id = ? LIMIT 1',
      )
      .get(id, id);
    if (!exists) throw new AppError(404, 'MEMORY_NOT_FOUND', 'This memory could not be found.');
    return this.db
      .prepare<[string, number, number], MemoryEvent>(
        'SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?',
      )
      .all(id, limit, offset);
  }

  retrieveRelevant(query: string, k = 8, context: MemoryContext = {}): RetrievedMemory[] {
    const validated = retrieveMemoriesSchema.parse({ query, k });
    return this.db.transaction(() => {
      this.decayUnusedMemories();
      const active = this.db
        .prepare<[], MemoryRow>('SELECT * FROM memories WHERE archived = 0')
        .all()
        .map(fromRow);
      const now = this.clock();
      const matches = rankMemories(active, validated.query, now, validated.k);
      for (const memory of matches) {
        this.db
          .prepare('UPDATE memories SET last_used_at = ? WHERE id = ?')
          .run(now.toISOString(), memory.id);
        this.recordEvent(
          memory.id,
          'used',
          {
            reason: context.reason ?? 'Retrieved to inform a plan.',
            query: validated.query,
            score: memory.score,
            why_retrieved: memory.why_retrieved,
          },
          { actor: 'agent', ...context },
        );
      }
      return matches.map((memory) => ({ ...memory, last_used_at: now.toISOString() }));
    })();
  }

  /** 30-day grace, then -0.01 per full 30 unused days. Reads never double-decay. */
  decayUnusedMemories(): number {
    return this.db.transaction(() => {
      const now = this.clock();
      const active = this.db
        .prepare<[], MemoryRow>('SELECT * FROM memories WHERE archived = 0')
        .all()
        .map(fromRow);
      let changed = 0;
      for (const before of active) {
        const graceEnds = Date.parse(before.last_used_at ?? before.created_at) + 30 * DAY_MS;
        const since = Math.max(graceEnds, Date.parse(before.updated_at));
        const periods = Math.floor((now.getTime() - since) / (30 * DAY_MS));
        if (periods < 1) continue;
        const confidence = roundedConfidence(before.confidence - periods * 0.01);
        const after = {
          ...before,
          confidence,
          archived: confidence < 0.15,
          updated_at: now.toISOString(),
        };
        this.writeMemory(after);
        this.recordEvent(
          before.id,
          'weakened',
          {
            reason: `Time decay: ${periods} unused 30-day period(s) after the grace period.${after.archived ? ' Automatically archived below 0.15 confidence.' : ''}`,
            before,
            after,
          },
          { actor: 'system' },
        );
        changed += 1;
      }
      return changed;
    })();
  }

  private requireActive(id: string): Memory {
    const memory = this.getMemory(id);
    if (memory.archived)
      throw new AppError(
        409,
        'MEMORY_ARCHIVED',
        'Restore this memory before changing its confidence.',
      );
    return memory;
  }

  private writeMemory(memory: Memory): void {
    this.db
      .prepare(
        `
      UPDATE memories SET type = @type, key = @key, value = @value, rationale = @rationale,
        confidence = @confidence, source = @source, times_confirmed = @times_confirmed,
        times_contradicted = @times_contradicted, updated_at = @updated_at,
        last_used_at = @last_used_at, archived = @archived WHERE id = @id
    `,
      )
      .run({ ...memory, archived: Number(memory.archived) });
  }

  private recordEvent(
    memoryId: string,
    event: MemoryEventType,
    detail: EventDetail,
    context: MemoryContext,
  ): void {
    const now = this.clock().toISOString();
    const serialized = JSON.stringify(detail);
    this.db
      .prepare(
        `
      INSERT INTO memory_events (id, memory_id, event, detail, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(randomUUID(), memoryId, event, serialized, context.sessionId ?? null, now);
    this.db
      .prepare(
        `
      INSERT INTO audit_log (id, ts, actor, action, entity, entity_id, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        randomUUID(),
        now,
        context.actor ?? 'system',
        `memory.${event}`,
        'memory',
        memoryId,
        serialized,
      );
  }
}
