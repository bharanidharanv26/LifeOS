import type { Memory } from '../memory/schemas.js';
import { toolArgsSchemas } from '../tools/schemas.js';
import type { PolicyWarning, ProposedStep } from './schemas.js';

export function earliestHour(memory: Pick<Memory, 'key' | 'value'>): number | null {
  const text = `${memory.key} ${memory.value}`.toLowerCase();
  if (/avoid.*morning|no.morning|morning.*avoid/.test(text)) return 12;
  if (!/meeting|block|start.time|earliest/.test(text)) return null;
  if (/noon/.test(text)) return 12;
  const match = /(?:before|after|at|earliest)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  if (!match?.[1]) return null;
  let hour = Number(match[1]);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  return hour <= 23 ? hour + Number(match[2] ?? 0) / 60 : null;
}

export function checkPolicy(step: ProposedStep, memories: Memory[]): PolicyWarning[] {
  if (step.tool !== 'create_calendar_block') return [];
  const args = toolArgsSchemas.create_calendar_block.parse(step.args);
  const start = new Date(args.start);
  const end = new Date(args.end);
  const hour = start.getUTCHours() + start.getUTCMinutes() / 60;
  const warnings: PolicyWarning[] = [];
  for (const memory of memories.filter(
    (item) => !item.archived && item.type === 'preference' && item.confidence >= 0.7,
  )) {
    const earliest = earliestHour(memory);
    const duration = /prep.*duration|duration.*prep/.test(memory.key)
      ? Number(/\d+/.exec(memory.value)?.[0])
      : 0;
    const friday = /friday.*(afternoon|focus)/i.test(`${memory.key} ${memory.value}`);
    const crossesFridayFocus =
      friday &&
      (() => {
        const day = new Date(start);
        day.setUTCHours(12, 0, 0, 0);
        for (let i = 0; i < 2; i++) {
          if (
            day.getUTCDay() === 5 &&
            day.getTime() < end.getTime() &&
            day.getTime() + 12 * 3600000 > start.getTime()
          )
            return true;
          day.setUTCDate(day.getUTCDate() + 1);
        }
        return false;
      })();
    if (
      (earliest !== null && hour < earliest) ||
      crossesFridayFocus ||
      (duration > 0 &&
        /prep/i.test(args.title) &&
        (end.getTime() - start.getTime()) / 60000 > duration)
    ) {
      warnings.push({
        memory_id: memory.id,
        message: `Conflicts with: ${memory.value}`,
        repaired: false,
        blocking: true,
      });
    }
  }
  return warnings;
}
