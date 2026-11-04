import { z } from 'zod';

export const toolNames = [
  'draft_email',
  'create_calendar_block',
  'save_note',
  'search_notes',
] as const;
export type ToolName = (typeof toolNames)[number];
export const toolArgsSchemas = {
  draft_email: z
    .object({
      to: z.union([z.email(), z.literal('')]),
      subject: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(12_000),
    })
    .strict(),
  create_calendar_block: z
    .object({
      title: z.string().trim().min(1).max(300),
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
      notes: z.string().max(4000).default(''),
    })
    .strict()
    .refine(
      (args) =>
        Date.parse(args.end) > Date.parse(args.start) &&
        Date.parse(args.end) - Date.parse(args.start) <= 24 * 60 * 60 * 1000,
      { message: 'End must follow start, within 24 hours.' },
    ),
  save_note: z
    .object({
      title: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(12_000),
      tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
    })
    .strict(),
  search_notes: z.object({ query: z.string().trim().min(1).max(500) }).strict(),
};
export type ToolArgs = Record<string, unknown>;
export function validateArgs(tool: ToolName, args: unknown): ToolArgs {
  return toolArgsSchemas[tool].parse(args);
}
