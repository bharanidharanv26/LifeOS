import { randomUUID } from 'node:crypto';
import type { LifeDatabase } from '../db/index.js';
import { AppError } from '../errors.js';
import { toolArgsSchemas, type ToolName } from './schemas.js';

export interface ToolResult {
  kind: 'email_draft' | 'calendar_block' | 'note' | 'note_search';
  simulated: true;
  summary: string;
  [key: string]: unknown;
}

interface CalendarRow {
  id: string;
  title: string;
  start_ts: string;
  end_ts: string;
}

export function runTool(
  db: LifeDatabase,
  tool: ToolName,
  args: Record<string, unknown>,
  stepId: string,
): ToolResult {
  if (tool === 'draft_email') {
    const draft = toolArgsSchemas.draft_email.parse(args);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO email_drafts (id,to_addr,subject,body,created_by_step_id) VALUES (?,?,?,?,?)',
    ).run(id, draft.to, draft.subject, draft.body, stepId);
    return {
      kind: 'email_draft',
      simulated: true,
      summary: 'Draft saved locally. No email was sent.',
      id,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    };
  }
  if (tool === 'create_calendar_block') {
    const block = toolArgsSchemas.create_calendar_block.parse(args);
    const start = new Date(block.start);
    const end = new Date(block.end);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const conflict = db
      .prepare<[string, string], CalendarRow>(
        'SELECT id,title,start_ts,end_ts FROM calendar_events WHERE start_ts < ? AND end_ts > ? ORDER BY start_ts LIMIT 1',
      )
      .get(endIso, startIso);
    if (conflict)
      throw new AppError(
        409,
        'CALENDAR_OVERLAP',
        `This block overlaps “${conflict.title}” (${conflict.start_ts}–${conflict.end_ts}).`,
      );
    const id = randomUUID();
    db.prepare(
      'INSERT INTO calendar_events (id,title,start_ts,end_ts,notes,created_by_step_id) VALUES (?,?,?,?,?,?)',
    ).run(id, block.title, startIso, endIso, block.notes, stepId);
    return {
      kind: 'calendar_block',
      simulated: true,
      summary: 'Calendar block saved locally. No external calendar was changed.',
      id,
      title: block.title,
      start: startIso,
      end: endIso,
      notes: block.notes,
    };
  }
  if (tool === 'save_note') {
    const note = toolArgsSchemas.save_note.parse(args);
    const id = randomUUID();
    db.prepare('INSERT INTO notes (id,title,body,tags,created_by_step_id) VALUES (?,?,?,?,?)').run(
      id,
      note.title,
      note.body,
      JSON.stringify(note.tags),
      stepId,
    );
    return {
      kind: 'note',
      simulated: true,
      summary: 'Note saved to your local workspace.',
      id,
      title: note.title,
      body: note.body,
      tags: note.tags,
    };
  }
  const search = toolArgsSchemas.search_notes.parse(args);
  const like = `%${search.query}%`;
  const matches = db
    .prepare<[string, string, string], { id: string; title: string; body: string }>(
      'SELECT id,title,body FROM notes WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? ORDER BY rowid DESC LIMIT 20',
    )
    .all(like, like, like)
    .map((note) => ({
      id: note.id,
      title: note.title,
      excerpt: note.body.slice(0, 240),
    }));
  return {
    kind: 'note_search',
    simulated: true,
    summary: `${matches.length} local note${matches.length === 1 ? '' : 's'} matched.`,
    query: search.query,
    matches,
  };
}
