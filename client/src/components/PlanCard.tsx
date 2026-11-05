import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  FileText,
  Mail,
  Pencil,
  Search,
  X,
} from 'lucide-react';
import { toolArgsSchemas } from '../../../server/src/tools/schemas';
import { dateLabel, type Step } from '../api';
import { useWorkspace } from '../store';

const icons = {
  draft_email: Mail,
  create_calendar_block: CalendarDays,
  save_note: FileText,
  search_notes: Search,
};
const toolLabels = {
  draft_email: 'Email draft',
  create_calendar_block: 'Calendar block',
  save_note: 'Local note',
  search_notes: 'Search notes',
};

export function StepPreview({ step }: { step: Step }) {
  const args = step.edited_args ?? step.args;
  if (step.tool === 'create_calendar_block')
    return (
      <div className="preview flex items-center gap-3">
        <CalendarDays size={18} className="text-accent" />
        <div>
          <strong className="block text-sm">
            {dateLabel(String(args.start))} –{' '}
            {new Date(String(args.end)).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'UTC',
            })}{' '}
            UTC
          </strong>
          <span className="text-xs text-muted">
            {Math.round((Date.parse(String(args.end)) - Date.parse(String(args.start))) / 60000)}{' '}
            minutes · {String(args.title)}
          </span>
        </div>
      </div>
    );
  return (
    <div className="preview">
      <p className="mb-2 text-xs text-muted">
        {step.tool === 'draft_email'
          ? `To: ${String(args.to || 'Recipient needed')} · ${String(args.subject)}`
          : String(args.title ?? 'Search query')}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">
        {String(args.body ?? args.query)}
      </p>
    </div>
  );
}

export function PlanCard({ step, locked }: { step: Step; locked: boolean }) {
  const [form, setForm] = useState<'edit' | 'reject' | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>(step.edited_args ?? step.args);
  const [reason, setReason] = useState('');
  const { active, memories, selectedStepId, pending, review, executing } = useWorkspace();
  const Icon = icons[step.tool];
  const blocked = step.policy_warnings.some((warning) => warning.blocking);
  const finished = locked || ['executed', 'failed'].includes(step.status);
  const busy = pending.includes(step.id) || executing;
  const validation = toolArgsSchemas[step.tool].safeParse(draft);
  const cited = step.memory_ids
    .map(
      (id) =>
        memories.find((memory) => memory.id === id) ??
        active?.memories.find((memory) => memory.id === id),
    )
    .filter((memory) => memory !== undefined);
  function beginEdit() {
    setDraft(step.edited_args ?? step.args);
    setForm('edit');
  }
  async function submitEdit() {
    if (validation.success && (await review(step.id, 'edit', { args: validation.data })))
      setForm(null);
  }
  async function submitReject() {
    if (await review(step.id, 'reject', { reason })) setForm(null);
  }
  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ stepId: string; action: string }>).detail;
      if (detail.stepId !== step.id || form) return;
      if (detail.action === 'approve' && !blocked && !finished && !busy) {
        void review(step.id, 'approve');
      }
      if (detail.action === 'edit' && !finished && !busy) {
        setDraft(step.edited_args ?? step.args);
        setForm('edit');
      }
      if (detail.action === 'reject' && !finished && !busy && step.status !== 'rejected')
        setForm('reject');
    };
    window.addEventListener('lifeos:step-action', onAction);
    return () => window.removeEventListener('lifeos:step-action', onAction);
  }, [step, form, blocked, finished, busy, review]);

  return (
    <article
      id={`step-${step.id}`}
      tabIndex={0}
      aria-label={`${step.title}, ${step.status}`}
      onFocus={() => useWorkspace.setState({ selectedStepId: step.id })}
      onClick={() => useWorkspace.setState({ selectedStepId: step.id })}
      className={`plan-card ${selectedStepId === step.id ? 'is-selected' : ''} ${step.status === 'rejected' ? 'is-rejected' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span className="tool-icon">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="eyebrow">
              {String(step.order_idx + 1).padStart(2, '0')} / {toolLabels[step.tool]}
            </span>
            <span className={`status status-${step.status}`}>{step.status}</span>
          </div>
          <h3 className="text-[15px] font-semibold leading-6">{step.title}</h3>
        </div>
        <span className="badge">{step.risk} risk</span>
      </div>
      <p className="my-3 text-sm leading-6 text-muted">{step.rationale}</p>
      {step.demo_fixture && (
        <p className="mb-3 text-xs font-medium text-muted">
          Guided demo fixture · intentionally early proposal
        </p>
      )}
      {step.policy_warnings.map((warning) => (
        <div
          key={warning.memory_id}
          className={`mb-3 rounded-xl px-3 py-2 text-xs leading-5 ${warning.blocking ? 'warning-box' : 'success-box'}`}
        >
          <span className="flex items-center gap-2 font-semibold">
            {warning.blocking ? <AlertTriangle size={14} /> : <Check size={14} />}
            {warning.repaired ? 'Policy conflict repaired by your edit' : 'Policy warning'}
          </span>
          {warning.message}
        </div>
      ))}
      {form !== 'edit' && <StepPreview step={step} />}
      {cited.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Based on:</span>
          {cited.map((memory) => (
            <button
              key={memory.id}
              type="button"
              title={memory.value}
              aria-label={`Highlight memory: ${memory.value}`}
              className="memory-chip"
              onClick={() => {
                useWorkspace.setState({ highlightedMemoryId: memory.id });
                document
                  .getElementById(`memory-${memory.id}`)
                  ?.scrollIntoView({ block: 'nearest' });
              }}
            >
              {memory.key.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      )}
      {form === 'edit' && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
        >
          <p className="text-xs text-muted">
            Saving this edit explicitly approves the corrected local action. Times use UTC.
          </p>
          {Object.entries(draft).map(([key, value]) => (
            <label key={key} className="field-label">
              {key.replaceAll('_', ' ')}
              {['body', 'notes'].includes(key) ? (
                <textarea
                  autoFocus={key === 'body'}
                  value={String(value)}
                  rows={key === 'body' ? 8 : 3}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              ) : (
                <input
                  value={
                    key === 'start' || key === 'end'
                      ? String(value).slice(0, 16)
                      : Array.isArray(value)
                        ? value.join(', ')
                        : String(value)
                  }
                  type={key === 'start' || key === 'end' ? 'datetime-local' : 'text'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [key]:
                        key === 'tags'
                          ? event.target.value
                              .split(',')
                              .map((tag) => tag.trim())
                              .filter(Boolean)
                          : key === 'start' || key === 'end'
                            ? `${event.target.value}:00.000Z`
                            : event.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
          {!validation.success && (
            <p role="status" className="text-xs text-red-600 dark:text-red-300">
              {validation.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(' · ')}
            </p>
          )}
          <div className="flex gap-2">
            <button className="button primary" disabled={!validation.success || busy}>
              Save & approve
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {form === 'reject' && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitReject();
          }}
        >
          <label className="field-label">
            What should I learn from this?
            <input
              autoFocus
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Tell me why this doesn't work for you"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['too early', 'too long', 'not my style', 'other'].map((item) => (
              <button
                key={item}
                type="button"
                className={`chip ${reason === item ? 'selected' : ''}`}
                onClick={() => setReason(item === 'other' ? '' : item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="button danger" disabled={reason.trim().length < 3 || busy}>
              Reject & remember why
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {!form && !finished && (
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
          <button
            data-action="approve"
            className={`button small ${['approved', 'edited'].includes(step.status) ? 'quiet' : 'primary'}`}
            disabled={busy || blocked || ['approved', 'edited'].includes(step.status)}
            onClick={() => {
              void review(step.id, 'approve');
            }}
            title={
              blocked
                ? 'Edit or reject the conflicting proposal first'
                : 'Approve this local action'
            }
          >
            <Check size={14} />
            {['approved', 'edited'].includes(step.status) ? 'Approved' : 'Approve'}
          </button>
          <button data-action="edit" className="button small" disabled={busy} onClick={beginEdit}>
            <Pencil size={13} />
            Edit
          </button>
          <button
            data-action="reject"
            className="button small quiet ml-auto"
            disabled={busy || step.status === 'rejected'}
            onClick={() => setForm('reject')}
          >
            <X size={14} />
            Reject
          </button>
        </div>
      )}
      {step.reject_reason && (
        <p className="mt-3 text-xs text-muted">Your feedback: “{step.reject_reason}”</p>
      )}
      {step.result !== null && (
        <details className="mt-3 text-xs">
          <summary>Execution result · local simulation</summary>
          <pre className="preview mt-2 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(step.result, null, 2)}
          </pre>
        </details>
      )}
    </article>
  );
}
