import { Router } from 'express';
import { z } from 'zod';
import type { LifeDatabase } from '../db/index.js';

const limitSchema = z.coerce.number().int().min(1).max(500).default(100);

interface CalendarItem {
  id: string;
  title: string;
  start_ts: string;
  end_ts: string;
  notes: string;
  step_id: string | null;
  session_id: string | null;
  session_goal: string | null;
}
interface NoteItem {
  id: string;
  title: string;
  body: string;
  tags: string;
  step_id: string | null;
  session_id: string | null;
  session_goal: string | null;
}
interface DraftItem {
  id: string;
  to_addr: string;
  subject: string;
  body: string;
  step_id: string | null;
  session_id: string | null;
  session_goal: string | null;
}
interface AuditRow {
  id: string;
  ts: string;
  actor: 'user' | 'agent' | 'system';
  action: string;
  entity: string;
  entity_id: string;
  detail_json: string;
}

export function calendarRouter(db: LifeDatabase): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const limit = limitSchema.parse(request.query.limit);
    const events = db
      .prepare<[number], CalendarItem>(
        `
        SELECT c.id,c.title,c.start_ts,c.end_ts,c.notes,
          c.created_by_step_id AS step_id,s.id AS session_id,s.goal_text AS session_goal
        FROM calendar_events c
        LEFT JOIN plan_steps ps ON ps.id=c.created_by_step_id
        LEFT JOIN plans p ON p.id=ps.plan_id
        LEFT JOIN sessions s ON s.id=p.session_id
        ORDER BY c.start_ts LIMIT ?
      `,
      )
      .all(limit)
      .map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start_ts,
        end: event.end_ts,
        notes: event.notes,
        step_id: event.step_id,
        session_id: event.session_id,
        session_goal: event.session_goal,
      }));
    response.json({ events });
  });
  return router;
}

export function notesRouter(db: LifeDatabase): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const query = z.object({ q: z.string().trim().max(200).optional() }).parse(request.query);
    const limit = limitSchema.parse(request.query.limit);
    const like = query.q ? `%${query.q}%` : null;
    const rows = db
      .prepare<[string | null, string | null, string | null, number], NoteItem>(
        `
        SELECT n.id,n.title,n.body,n.tags,
          n.created_by_step_id AS step_id,s.id AS session_id,s.goal_text AS session_goal
        FROM notes n
        LEFT JOIN plan_steps ps ON ps.id=n.created_by_step_id
        LEFT JOIN plans p ON p.id=ps.plan_id
        LEFT JOIN sessions s ON s.id=p.session_id
        WHERE (? IS NULL OR n.title LIKE ? OR n.body LIKE ?)
        ORDER BY n.rowid DESC LIMIT ?
      `,
      )
      .all(like, like, like, limit)
      .map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        tags: z.array(z.string()).parse(JSON.parse(note.tags) as unknown),
        step_id: note.step_id,
        session_id: note.session_id,
        session_goal: note.session_goal,
      }));
    response.json({ notes: rows });
  });
  return router;
}

export function draftsRouter(db: LifeDatabase): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const limit = limitSchema.parse(request.query.limit);
    const drafts = db
      .prepare<[number], DraftItem>(
        `
        SELECT d.id,d.to_addr,d.subject,d.body,
          d.created_by_step_id AS step_id,s.id AS session_id,s.goal_text AS session_goal
        FROM email_drafts d
        LEFT JOIN plan_steps ps ON ps.id=d.created_by_step_id
        LEFT JOIN plans p ON p.id=ps.plan_id
        LEFT JOIN sessions s ON s.id=p.session_id
        ORDER BY d.rowid DESC LIMIT ?
      `,
      )
      .all(limit)
      .map((draft) => ({
        id: draft.id,
        to: draft.to_addr,
        subject: draft.subject,
        body: draft.body,
        step_id: draft.step_id,
        session_id: draft.session_id,
        session_goal: draft.session_goal,
      }));
    response.json({ drafts });
  });
  return router;
}

export function auditRouter(db: LifeDatabase): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const query = z
      .object({
        entity: z.string().trim().max(60).optional(),
        action: z.string().trim().max(80).optional(),
        limit: limitSchema,
      })
      .parse(request.query);
    const filters: string[] = [];
    const params: (string | number)[] = [];
    if (query.entity) {
      filters.push('entity = ?');
      params.push(query.entity);
    }
    if (query.action) {
      filters.push('action = ?');
      params.push(query.action);
    }
    params.push(query.limit);
    const rows = db
      .prepare<unknown[], AuditRow>(
        `SELECT * FROM audit_log ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY rowid DESC LIMIT ?`,
      )
      .all(...params)
      .map((entry) => ({
        id: entry.id,
        ts: entry.ts,
        actor: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entity_id,
        detail: JSON.parse(entry.detail_json) as unknown,
      }));
    response.json({ entries: rows });
  });
  return router;
}
