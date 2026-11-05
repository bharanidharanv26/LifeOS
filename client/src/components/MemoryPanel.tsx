import { useState } from 'react';
import { BrainCircuit, Clock3, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api, dateLabel, historySchema, jsonRequest, memorySchema, type Memory } from '../api';
import { notifyError, useWorkspace } from '../store';

function MemoryItem({ memory, superseded }: { memory: Memory; superseded: boolean }) {
  const { highlightedMemoryId, saveMemory, removeMemory } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memory.value);
  const [events, setEvents] = useState<z.infer<typeof historySchema>['events'] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <article
      id={`memory-${memory.id}`}
      className={`memory-item ${superseded ? 'superseded' : ''} ${highlightedMemoryId === memory.id ? 'highlighted' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="source-badge">
          {memory.source === 'user' ? 'You' : memory.source === 'inferred' ? 'Inferred' : 'Seed'}
        </span>
        {superseded && <span className="source-badge">superseded</span>}
        <span className="text-[11px] tabular-nums text-muted">
          {Math.round(memory.confidence * 100)}%
        </span>
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void saveMemory(memory.id, value)
              .then((ok) => {
                if (ok) setEditing(false);
              })
              .finally(() => setBusy(false));
          }}
        >
          <label className="sr-only" htmlFor={`edit-${memory.id}`}>
            Memory value
          </label>
          <textarea
            id={`edit-${memory.id}`}
            autoFocus
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={4000}
          />
          <div className="mt-2 flex gap-2">
            <button className="button small primary" disabled={!value.trim() || busy}>
              Save
            </button>
            <button className="button small" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-6">{memory.value}</p>
      )}
      <div
        className="confidence-track mt-3"
        role="meter"
        aria-label={`Confidence in ${memory.key}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={memory.confidence}
      >
        <span style={{ width: `${memory.confidence * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          className="icon-button compact"
          title="Memory history"
          aria-label={`History for ${memory.key}`}
          onClick={() => {
            const open = !historyOpen;
            setHistoryOpen(open);
            if (open)
              void api(`/memories/${memory.id}/history`, historySchema)
                .then((data) => setEvents(data.events))
                .catch((error: unknown) => notifyError(error));
          }}
        >
          <Clock3 size={13} />
        </button>
        <span className="mr-auto text-[10px] text-muted">
          {memory.times_confirmed} confirmations
        </span>
        <button
          className="icon-button compact"
          aria-label={`Edit ${memory.key}`}
          onClick={() => {
            setValue(memory.value);
            setEditing(true);
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          className="icon-button compact"
          aria-label={`Delete ${memory.key}`}
          onClick={() => {
            void removeMemory(memory.id);
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {historyOpen && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-3 text-xs leading-5 text-muted">{memory.rationale}</p>
          {events ? (
            events.map((event) => {
              let reason = '';
              try {
                const parsed = z
                  .object({ reason: z.string() })
                  .safeParse(JSON.parse(event.detail) as unknown);
                if (parsed.success) reason = parsed.data.reason;
              } catch {
                /* Historic text remains available through export. */
              }
              return (
                <div key={event.id} className="timeline-item">
                  <p className="text-xs font-medium capitalize">
                    {event.event}{' '}
                    <span className="font-normal text-muted">· {dateLabel(event.created_at)}</span>
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">{reason}</p>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted">Loading history…</p>
          )}
        </div>
      )}
    </article>
  );
}

export function MemoryPanel({ expanded = false }: { expanded?: boolean }) {
  const { memories, reloadMemories } = useWorkspace();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<Memory['type']>('preference');
  const [busy, setBusy] = useState(false);
  const supersededIds = new Set(
    memories
      .filter(
        (memory) =>
          memory.times_contradicted > 0 &&
          memories.some(
            (other) =>
              other.type === memory.type &&
              other.key === memory.key &&
              other.value !== memory.value &&
              other.confidence > memory.confidence,
          ),
      )
      .map((memory) => memory.id),
  );
  const filtered = memories
    .filter((memory) => `${memory.key} ${memory.value}`.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(supersededIds.has(a.id)) - Number(supersededIds.has(b.id)) ||
        b.confidence - a.confidence ||
        a.key.localeCompare(b.key) ||
        a.value.localeCompare(b.value),
    );
  async function add() {
    setBusy(true);
    try {
      await api(
        '/memories',
        z.object({ memory: memorySchema }),
        jsonRequest({ type, key, value, source: 'user', confidence: 0.9 }),
      );
      await reloadMemories();
      setAdding(false);
      setKey('');
      setValue('');
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className={`memory-panel ${expanded ? 'expanded' : ''}`} aria-labelledby="memory-title">
      <div className="panel-heading">
        <span className="flex items-center gap-2">
          <BrainCircuit size={17} />
          <h2 id="memory-title">What I know about you</h2>
        </span>
        <span className="count-badge">{memories.length}</span>
      </div>
      <p className="mb-4 text-xs leading-5 text-muted">
        A little context makes every plan more yours.
      </p>
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="Search memories"
          placeholder="Search your memory"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <button
        className="button small quiet mt-3 w-full justify-center"
        onClick={() => setAdding(!adding)}
      >
        <Plus size={14} />
        Add a memory
      </button>
      {adding && (
        <form
          className="my-4 space-y-3 rounded-xl border border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label className="field-label">
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value as Memory['type'])}
            >
              {['preference', 'decision', 'goal', 'fact', 'habit'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Short key
            <input
              autoFocus
              value={key}
              maxLength={120}
              onChange={(event) => setKey(event.target.value)}
              placeholder="writing style"
            />
          </label>
          <label className="field-label">
            What should I remember?
            <textarea
              value={value}
              maxLength={4000}
              rows={3}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button className="button small primary" disabled={!key.trim() || !value.trim() || busy}>
            Save memory
          </button>
        </form>
      )}
      {['preference', 'goal', 'habit', 'decision', 'fact'].map((group) => {
        const items = filtered.filter((memory) => memory.type === group);
        return (
          items.length > 0 && (
            <section key={group} className="mt-5">
              <h3 className="eyebrow mb-3">
                {group}s <span className="ml-1 opacity-60">{items.length}</span>
              </h3>
              <div className={expanded ? 'memory-grid' : 'space-y-3'}>
                {items.map((memory) => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    superseded={supersededIds.has(memory.id)}
                  />
                ))}
              </div>
            </section>
          )
        );
      })}
      {filtered.length === 0 && (
        <div className="empty-small">
          <BrainCircuit size={24} />
          <p>
            {query ? 'No matching memories.' : 'A fresh start. Add a preference or load the demo.'}
          </p>
        </div>
      )}
      <p className="mt-6 border-t border-line pt-4 text-[11px] leading-5 text-muted">
        You can edit or delete any memory. Inferred preferences always include their evidence.
      </p>
    </aside>
  );
}
