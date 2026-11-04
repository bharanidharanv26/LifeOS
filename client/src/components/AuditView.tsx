import { useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { api, auditSchema, dateLabel, type AuditEntry } from '../api';
import { notifyError, useWorkspace } from '../store';

const entities = ['all', 'session', 'step', 'memory', 'calendar_event', 'note', 'email_draft'];
const actors: Record<AuditEntry['actor'], string> = {
  user: 'You',
  agent: 'LifeOS',
  system: 'System',
};
function summarize(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    return Object.entries(detail as Record<string, unknown>)
      .slice(0, 4)
      .map(
        ([key, value]) =>
          `${key}: ${typeof value === 'string' ? value : (JSON.stringify(value) ?? '')}`,
      )
      .join(' · ');
  }
  return '';
}

export function AuditView() {
  const { libraryVersion } = useWorkspace();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entity, setEntity] = useState('all');
  const [action, setAction] = useState('');
  const [appliedAction, setAppliedAction] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (entity !== 'all') params.set('entity', entity);
    if (appliedAction) params.set('action', appliedAction);
    api(`/audit?${params.toString()}`, auditSchema)
      .then((data) => setEntries(data.entries))
      .catch((error: unknown) => notifyError(error))
      .finally(() => setLoading(false));
  }, [entity, appliedAction, libraryVersion]);
  return (
    <section className="library-view" aria-labelledby="audit-title">
      <div>
        <h2 id="audit-title" className="text-sm font-semibold">
          Audit timeline
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Every proposal, review, edit, rejection, and local execution is recorded here.
        </p>
      </div>
      <div className="filter-bar mt-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by entity">
          {entities.map((item) => (
            <button
              key={item}
              className={`chip ${entity === item ? 'selected' : ''}`}
              onClick={() => setEntity(item)}
            >
              {item === 'all' ? 'Everything' : item.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedAction(action.trim());
          }}
        >
          <label className="search-field">
            <Search size={14} />
            <input
              aria-label="Filter by action"
              placeholder="Filter actions"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            />
          </label>
          <button className="button small">Filter</button>
          {appliedAction && (
            <button
              type="button"
              className="button small quiet"
              onClick={() => {
                setAction('');
                setAppliedAction('');
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>
      {loading && <p className="mt-8 text-xs text-muted">Loading audit trail…</p>}
      {!loading && entries.length === 0 && (
        <div className="empty-state mt-8">
          <Activity size={28} />
          <h2>No matching events</h2>
          <p>Adjust the filters, or create and review a plan to start the timeline.</p>
        </div>
      )}
      <ol className="mt-5 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="audit-entry">
            <span className={`actor-badge actor-${entry.actor}`}>{actors[entry.actor]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                {entry.action}
                <span className="ml-2 font-normal text-muted">
                  {entry.entity} · {entry.entity_id.slice(0, 8)}
                </span>
              </p>
              {summarize(entry.detail) && (
                <p className="mt-1 truncate text-[11px] text-muted">{summarize(entry.detail)}</p>
              )}
            </div>
            <time className="shrink-0 text-[10px] tabular-nums text-muted" dateTime={entry.ts}>
              {dateLabel(entry.ts)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
