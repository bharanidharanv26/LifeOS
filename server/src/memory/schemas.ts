import { z } from 'zod';

export const memoryTypes = ['preference', 'decision', 'goal', 'fact', 'habit'] as const;
export const memorySources = ['user', 'inferred', 'seed'] as const;
export const memoryEventTypes = [
  'created',
  'reinforced',
  'weakened',
  'edited',
  'deleted',
  'used',
] as const;

const memoryFields = {
  type: z.enum(memoryTypes),
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((key) => key.toLowerCase().replace(/\s+/g, '_')),
  value: z.string().trim().min(1).max(4000),
  rationale: z.string().trim().max(4000),
  confidence: z.number().finite().min(0).max(1),
  source: z.enum(memorySources),
};

export const addMemorySchema = z
  .object({
    ...memoryFields,
    rationale: memoryFields.rationale.default(''),
    confidence: memoryFields.confidence.default(0.8),
    source: memoryFields.source.default('user'),
  })
  .strict();

export const editMemorySchema = z
  .object({
    ...memoryFields,
    archived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Provide at least one field to edit',
  });

export const memoryIdSchema = z.uuid();
export const listMemoriesSchema = z
  .object({
    type: z.enum(memoryTypes).optional(),
    source: z.enum(memorySources).optional(),
    search: z.string().trim().max(500).optional(),
    include_archived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const retrieveMemoriesSchema = z
  .object({
    query: z.string().trim().min(1).max(2000),
    k: z.coerce.number().int().min(1).max(50).default(8),
  })
  .strict();

export type MemoryType = (typeof memoryTypes)[number];
export type MemorySource = (typeof memorySources)[number];
export type MemoryEventType = (typeof memoryEventTypes)[number];
export type AddMemoryInput = z.input<typeof addMemorySchema>;
export type EditMemoryInput = z.input<typeof editMemorySchema>;
export type MemoryListOptions = z.output<typeof listMemoriesSchema>;

export interface Memory {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  rationale: string;
  confidence: number;
  source: MemorySource;
  times_confirmed: number;
  times_contradicted: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived: boolean;
}

export interface MemoryEvent {
  id: string;
  memory_id: string;
  event: MemoryEventType;
  detail: string;
  session_id: string | null;
  created_at: string;
}

export interface RetrievedMemory extends Memory {
  score: number;
  why_retrieved: string;
}
