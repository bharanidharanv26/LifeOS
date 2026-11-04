import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rankMemories } from '../src/memory/retrieval.js';
import type { AddMemoryInput } from '../src/memory/schemas.js';
import { createFixture } from './helpers.js';

const preference: AddMemoryInput = {
  type: 'preference',
  key: 'meeting_start_time',
  value: 'No meetings before 11am.',
  rationale: 'Mornings are for focused work.',
  confidence: 0.8,
  source: 'user',
};

describe('memory service', () => {
  let fixture: ReturnType<typeof createFixture>;
  beforeEach(() => {
    fixture = createFixture();
  });
  afterEach(() => {
    fixture.close();
  });

  it('normalizes keys and records creation and its audit entry atomically', () => {
    const memory = fixture.memories.addMemory({ ...preference, key: ' Meeting Start Time ' });
    expect(memory).toMatchObject({
      key: 'meeting_start_time',
      archived: false,
      times_confirmed: 0,
      created_at: fixture.clock().toISOString(),
    });
    const event = fixture.memories.history(memory.id)[0];
    expect(event?.event).toBe('created');
    expect(JSON.parse(event?.detail ?? '{}')).toMatchObject({
      after: { id: memory.id, value: preference.value },
    });
    expect(fixture.db.prepare('SELECT actor, action FROM audit_log').get()).toEqual({
      actor: 'user',
      action: 'memory.created',
    });
  });

  it('retrieves matching memories, explains the match, and records actual use', () => {
    const relevant = fixture.memories.addMemory(preference);
    fixture.memories.addMemory({ type: 'fact', key: 'favorite_food', value: 'Pistachio gelato.' });
    const results = fixture.memories.retrieveRelevant('Schedule a meeting', 8);
    expect(results.map((memory) => memory.id)).toEqual([relevant.id]);
    expect(results[0]?.why_retrieved).toContain('Matched');
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(fixture.memories.getMemory(relevant.id).last_used_at).toBe(
      fixture.clock().toISOString(),
    );
    expect(fixture.memories.history(relevant.id)[0]?.event).toBe('used');
  });

  it('ranks identical keyword matches by confidence and then recency', () => {
    const base = fixture.memories.addMemory(preference);
    const recent = { ...base, id: 'recent', confidence: 0.9 };
    const stale = {
      ...base,
      id: 'stale',
      confidence: 0.9,
      created_at: '2025-01-01T00:00:00.000Z',
      // A maintenance write today must not count as recent use.
      updated_at: fixture.clock().toISOString(),
    };
    const uncertain = { ...base, id: 'uncertain', confidence: 0.2 };
    const ranked = rankMemories([uncertain, stale, recent], 'meeting', fixture.clock(), 8);
    expect(ranked.map((memory) => memory.id)).toEqual(['recent', 'stale', 'uncertain']);
  });

  it('uses domain aliases, obeys k, and excludes archived or unrelated memories', () => {
    const meeting = fixture.memories.addMemory(preference);
    const archived = fixture.memories.addMemory({
      ...preference,
      key: 'extra_meeting',
      confidence: 1,
    });
    fixture.memories.archive(archived.id);
    expect(
      fixture.memories.retrieveRelevant('investor call', 1).map((memory) => memory.id),
    ).toEqual([meeting.id]);
    expect(fixture.memories.retrieveRelevant('volcanoes')).toEqual([]);
    expect(fixture.memories.retrieveRelevant('the and my')).toEqual([]);
  });

  it('merges repeated evidence into one memory, increases confirmations, and caps confidence', () => {
    const first = fixture.memories.upsertMemory(preference);
    const second = fixture.memories.upsertMemory(preference);
    expect(second).toMatchObject({ id: first.id, confidence: 0.9, times_confirmed: 1 });
    fixture.memories.upsertMemory(preference);
    const fourth = fixture.memories.upsertMemory(preference);
    expect(fourth).toMatchObject({ confidence: 0.98, times_confirmed: 3 });
    expect(fixture.memories.list().total).toBe(1);
    expect(
      fixture.memories.history(first.id).filter((event) => event.event === 'reinforced'),
    ).toHaveLength(3);
  });

  it('weakens a conflicting value, creates its replacement, and retains before/after evidence', () => {
    const previous = fixture.memories.addMemory({ ...preference, confidence: 0.6 });
    const next = fixture.memories.upsertMemory(
      { ...preference, value: 'Meetings may start at 10am.', source: 'inferred' },
      { reason: 'The user explicitly changed their preferred start time.' },
    );
    expect(next.id).not.toBe(previous.id);
    expect(fixture.memories.getMemory(previous.id)).toMatchObject({
      confidence: 0.35,
      times_contradicted: 1,
      archived: false,
    });
    const weakened = fixture.memories.history(previous.id)[0];
    expect(weakened?.event).toBe('weakened');
    expect(JSON.parse(weakened?.detail ?? '{}')).toMatchObject({
      before: { confidence: 0.6 },
      after: { confidence: 0.35 },
    });
    expect(fixture.memories.history(next.id)[0]?.event).toBe('created');
  });

  it('archives below 0.15, clamps confidence at zero, and never retrieves archived evidence', () => {
    const old = fixture.memories.addMemory({ ...preference, confidence: 0.35 });
    expect(fixture.memories.weaken(old.id)).toMatchObject({ confidence: 0.1, archived: true });
    expect(fixture.memories.retrieveRelevant('meeting')).toEqual([]);
    const weak = fixture.memories.addMemory({ ...preference, confidence: 0.2 });
    expect(fixture.memories.weaken(weak.id)).toMatchObject({ confidence: 0, archived: true });
    expect(() => fixture.memories.reinforce(weak.id)).toThrow('Restore this memory');
  });

  it('does not archive a memory at exactly the 0.15 boundary', () => {
    const memory = fixture.memories.addMemory({ ...preference, confidence: 0.4 });
    expect(fixture.memories.weaken(memory.id)).toMatchObject({ confidence: 0.15, archived: false });
  });

  it('resolves named conflicts across keys and does not double-weaken same-key conflicts', () => {
    const old = fixture.memories.addMemory(preference);
    fixture.memories.resolveConflict(old.id, {
      ...preference,
      value: 'Meetings start after noon.',
    });
    expect(fixture.memories.getMemory(old.id).confidence).toBe(0.55);
    const replacement = fixture.memories.resolveConflict(old.id, {
      ...preference,
      key: 'no_morning_blocks',
      value: 'Avoid every morning block.',
    });
    expect(fixture.memories.getMemory(old.id).confidence).toBe(0.3);
    expect(replacement.key).toBe('no_morning_blocks');
  });

  it('rolls back memory changes when recording their evidence fails', () => {
    const memory = fixture.memories.addMemory(preference);
    expect(() =>
      fixture.memories.upsertMemory(
        { ...preference, value: 'Allow early meetings.' },
        { sessionId: randomUUID() },
      ),
    ).toThrow();
    expect(fixture.memories.getMemory(memory.id)).toMatchObject({
      confidence: 0.8,
      times_contradicted: 0,
    });
    expect(fixture.memories.list().total).toBe(1);
    expect(fixture.memories.history(memory.id)).toHaveLength(1);
  });

  it('supports editing, idempotent archiving, restoration, and historical deletion records', () => {
    const memory = fixture.memories.addMemory(preference);
    fixture.memories.edit(memory.id, { value: 'No meetings before noon.' });
    fixture.memories.archive(memory.id);
    const eventCount = fixture.memories.history(memory.id).length;
    fixture.memories.archive(memory.id);
    expect(fixture.memories.history(memory.id)).toHaveLength(eventCount);
    expect(fixture.memories.list().total).toBe(0);
    expect(fixture.memories.list({ include_archived: true }).total).toBe(1);
    fixture.memories.edit(memory.id, { archived: false });
    expect(fixture.memories.list().total).toBe(1);
    fixture.memories.delete(memory.id);
    expect(() => fixture.memories.getMemory(memory.id)).toThrow('could not be found');
    expect(fixture.memories.history(memory.id)[0]?.event).toBe('deleted');
  });

  it('validates core inputs and treats search wildcards literally', () => {
    expect(() => fixture.memories.addMemory({ ...preference, confidence: 1.1 })).toThrow();
    const memory = fixture.memories.addMemory({ ...preference, value: 'Use 100% focus time.' });
    fixture.memories.addMemory({ type: 'fact', key: 'other', value: 'Not a match.' });
    expect(fixture.memories.list({ search: '100%' }).memories.map((item) => item.id)).toEqual([
      memory.id,
    ]);
    expect(fixture.memories.list({ search: "' OR 1=1 --" }).total).toBe(0);
    expect(() => fixture.memories.edit(memory.id, {})).toThrow();
    expect(() => fixture.memories.retrieveRelevant('meeting', 0)).toThrow();
  });

  it('decays unused confidence slowly, without false contradictions or repeat decay', () => {
    const memory = fixture.memories.addMemory(preference);
    fixture.setTime('2027-02-03T12:00:00.000Z');
    expect(fixture.memories.decayUnusedMemories()).toBe(1);
    expect(fixture.memories.getMemory(memory.id)).toMatchObject({
      confidence: 0.78,
      times_contradicted: 0,
    });
    expect(fixture.memories.decayUnusedMemories()).toBe(0);
    expect(fixture.memories.getMemory(memory.id).confidence).toBe(0.78);
    expect(fixture.memories.history(memory.id)[0]?.detail).toContain('Time decay');
  });

  it('protects recently used memories from idle decay', () => {
    const memory = fixture.memories.addMemory(preference);
    fixture.setTime('2026-12-03T12:00:00.000Z');
    fixture.memories.retrieveRelevant('meeting');
    fixture.setTime('2027-01-02T12:00:00.000Z');
    expect(fixture.memories.decayUnusedMemories()).toBe(0);
    expect(fixture.memories.getMemory(memory.id).confidence).toBe(0.8);
  });
});
