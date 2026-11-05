import { z } from 'zod';

export const memorySchema = z.object({
  id: z.string(),
  type: z.enum(['preference', 'decision', 'goal', 'fact', 'habit']),
  key: z.string(),
  value: z.string(),
  rationale: z.string(),
  confidence: z.number(),
  source: z.enum(['user', 'inferred', 'seed']),
  times_confirmed: z.number(),
  times_contradicted: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  last_used_at: z.string().nullable(),
  archived: z.boolean(),
});
export type Memory = z.infer<typeof memorySchema>;
export const memoriesSchema = z.object({ memories: z.array(memorySchema), total: z.number() });
export const healthSchema = z.object({
  status: z.literal('ok'),
  mockMode: z.boolean(),
  model: z.string(),
  mockFallback: z.boolean(),
  timezone: z.string(),
  phase: z.number(),
});
export const sessionSummarySchema = z.object({
  id: z.string(),
  goal_text: z.string(),
  status: z.string(),
  created_at: z.string(),
});
export const stepSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  order_idx: z.number(),
  title: z.string(),
  tool: z.enum(['draft_email', 'create_calendar_block', 'save_note', 'search_notes']),
  args: z.record(z.string(), z.unknown()),
  rationale: z.string(),
  memory_ids: z.array(z.string()),
  risk: z.enum(['low', 'medium']),
  status: z.enum(['proposed', 'approved', 'edited', 'rejected', 'executed', 'failed']),
  reject_reason: z.string().nullable(),
  edited_args: z.record(z.string(), z.unknown()).nullable(),
  executed_at: z.string().nullable(),
  result: z.unknown(),
  policy_warnings: z.array(
    z.object({
      memory_id: z.string(),
      message: z.string(),
      repaired: z.boolean(),
      blocking: z.boolean(),
    }),
  ),
  demo_fixture: z.boolean(),
});
export type Step = z.infer<typeof stepSchema>;
export const changeSchema = z.object({
  memory_id: z.string(),
  key: z.string(),
  before: z.string().nullable(),
  value: z.string(),
  reason: z.string(),
  confidence: z.number(),
});
export const learnedSchema = z.object({
  new_memories: z.array(memorySchema.extend({ evidence_step_ids: z.array(z.string()) })),
  reinforced: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      confidence_before: z.number(),
      confidence_after: z.number(),
    }),
  ),
  weakened: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      confidence_before: z.number(),
      confidence_after: z.number(),
      archived: z.boolean(),
    }),
  ),
  insights: z.array(z.string()),
  reviewed_steps: z.number(),
});
export type Learned = z.infer<typeof learnedSchema>;
export const sessionDetailSchema = z.object({
  session: sessionSummarySchema.extend({ demo_scenario: z.boolean() }),
  plan: z
    .object({
      id: z.string(),
      version: z.number(),
      summary: z.string(),
      created_at: z.string(),
      mode: z.enum(['mock', 'live', 'fallback']),
      questions_for_user: z.array(z.string()),
      changed_since_last_time: z.array(changeSchema),
      steps: z.array(stepSchema),
    })
    .nullable(),
  memories: z.array(memorySchema),
  learned: learnedSchema.nullable(),
  error: z.unknown(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
export const reflectionSchema = sessionDetailSchema.extend({ reflection: learnedSchema });
export const executionSchema = sessionDetailSchema.extend({
  execution: z.object({
    attempted: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    failures: z.array(z.object({ step_id: z.string(), code: z.string(), message: z.string() })),
  }),
});
export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  notes: z.string(),
  step_id: z.string().nullable(),
  session_id: z.string().nullable(),
  session_goal: z.string().nullable(),
});
export const calendarSchema = z.object({ events: z.array(calendarEventSchema) });
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  step_id: z.string().nullable(),
  session_id: z.string().nullable(),
  session_goal: z.string().nullable(),
});
export const notesSchema = z.object({ notes: z.array(noteSchema) });
export type Note = z.infer<typeof noteSchema>;
export const draftSchema = z.object({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  step_id: z.string().nullable(),
  session_id: z.string().nullable(),
  session_goal: z.string().nullable(),
});
export const draftsSchema = z.object({ drafts: z.array(draftSchema) });
export type Draft = z.infer<typeof draftSchema>;
export const auditEntrySchema = z.object({
  id: z.string(),
  ts: z.string(),
  actor: z.enum(['user', 'agent', 'system']),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string(),
  detail: z.unknown(),
});
export const auditSchema = z.object({ entries: z.array(auditEntrySchema) });
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const historySchema = z.object({
  events: z.array(
    z.object({ id: z.string(), event: z.string(), detail: z.string(), created_at: z.string() }),
  ),
});
export const emptySchema = z.unknown();

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Shown whenever the browser cannot get an answer from the local API. */
export const unreachableMessage =
  'Cannot reach the local API. Start it with `npm run demo`, then retry.';

/** True for failures where the request never reached the API or the API returned no usable body. */
export function isUnreachable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'API_UNAVAILABLE')
  );
}

/** Fetch a JSON API route and translate transport failures into readable errors. */
export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    // Browser network errors say only "Failed to fetch", which gives no hint about the cause.
    throw new ApiError('NETWORK_ERROR', unreachableMessage);
  }
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiResponse(path, options);
  let body: unknown;
  try {
    const raw = await response.text();
    body = raw.trim() === '' ? undefined : JSON.parse(raw);
  } catch {
    body = undefined;
  }
  if (body === undefined) {
    // A dev proxy with the API down answers 500 with an empty body, not JSON.
    throw new ApiError(
      response.ok ? 'INVALID_RESPONSE' : 'API_UNAVAILABLE',
      response.ok
        ? 'The API returned a response the app could not read. Please retry.'
        : unreachableMessage,
    );
  }
  if (!response.ok) {
    const failure = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(body);
    throw new ApiError(
      failure.success ? failure.data.error.code : 'REQUEST_FAILED',
      failure.success ? failure.data.error.message : 'Request failed. Please retry.',
    );
  }
  return schema.parse(body);
}
export const jsonRequest = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export function dateLabel(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}
