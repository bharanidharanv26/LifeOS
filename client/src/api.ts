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
  learned: z.unknown(),
  error: z.unknown(),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
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
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body: unknown = await response.json();
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
