import { ArrowRight, GitCompare } from 'lucide-react';
import { dateLabel, type SessionDetail, type Step } from '../api';

function describe(step: Step): string {
  const args = step.edited_args ?? step.args;
  if (step.tool === 'create_calendar_block')
    return `${dateLabel(String(args.start))} UTC · ${Math.round((Date.parse(String(args.end)) - Date.parse(String(args.start))) / 60000)} min`;
  if (step.tool === 'draft_email')
    return `To: ${String(args.to || 'recipient needed')} · ${String(args.subject)}`;
  if (step.tool === 'save_note') return String(args.title ?? 'Local note');
  return `Search: “${String(args.query ?? '')}”`;
}

function Column({ detail, changedIds }: { detail: SessionDetail; changedIds: Set<string> }) {
  return (
    <div className="compare-column">
      <p className="eyebrow mb-3">
        v{detail.plan?.version} · {detail.session.goal_text}
      </p>
      <ol className="space-y-2">
        {detail.plan?.steps.map((step) => (
          <li
            key={step.id}
            className={`compare-step ${step.memory_ids.some((id) => changedIds.has(id)) ? 'changed-step' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[11px]">{step.title}</strong>
              <span className="status">{step.status}</span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted">{describe(step)}</p>
          </li>
        ))}
      </ol>
      {detail.plan?.changed_since_last_time.map((change) => (
        <p key={change.memory_id} className="mt-3 text-[10px] leading-4 text-accent">
          {change.key.replaceAll('_', ' ')} changed
        </p>
      ))}
    </div>
  );
}

export function PlanComparison({
  previous,
  current,
}: {
  previous: SessionDetail;
  current: SessionDetail;
}) {
  if (!previous.plan || !current.plan) return null;
  const changedIds = new Set(
    current.plan.changed_since_last_time.map((change) => change.memory_id),
  );
  return (
    <details className="plan-compare mb-5">
      <summary className="flex items-center gap-2 text-xs font-medium">
        <GitCompare size={14} className="text-accent" />
        Compare v{previous.plan.version} <ArrowRight size={12} /> v{current.plan.version}
        <span className="count-badge ml-auto">
          {changedIds.size} learned change{changedIds.size === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="compare-grid mt-3">
        <Column detail={previous} changedIds={changedIds} />
        <Column detail={current} changedIds={changedIds} />
      </div>
    </details>
  );
}
