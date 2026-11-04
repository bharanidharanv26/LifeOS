import { useEffect, useState } from 'react';
import { CornerDownRight, FileText, Search } from 'lucide-react';
import { api, notesSchema, type Note } from '../api';
import { notifyError, useWorkspace } from '../store';

export function NotesView() {
  const { libraryVersion, openStep } = useWorkspace();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/notes?limit=200', notesSchema)
      .then((data) => setNotes(data.notes))
      .catch((error: unknown) => notifyError(error))
      .finally(() => setLoading(false));
  }, [libraryVersion]);
  const filtered = notes.filter((note) =>
    `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="library-view" aria-labelledby="notes-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="notes-title" className="text-sm font-semibold">
            Local notes
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Saved by approved steps. Search matches titles, bodies, and tags.
          </p>
        </div>
        <label className="search-field w-full sm:w-64">
          <Search size={15} />
          <input
            aria-label="Search local notes"
            placeholder="Search notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {loading && <p className="mt-8 text-xs text-muted">Loading notes…</p>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state mt-8">
          <FileText size={28} />
          <h2>{query ? 'No matching notes' : 'No local notes yet'}</h2>
          <p>
            {query
              ? 'Try a different word, or clear the search.'
              : 'Approve a note step and run the plan to keep context here.'}
          </p>
        </div>
      )}
      <div className="library-grid mt-5">
        {filtered.map((note) => (
          <article key={note.id} className="library-card">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[15px] font-semibold leading-6">{note.title}</h3>
              <span className="source-badge">Local</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-muted">
              {note.body}
            </p>
            {note.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span key={tag} className="badge">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            {note.session_goal && note.session_id && note.step_id && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-[11px] leading-5 text-muted">From “{note.session_goal}”</p>
                <button
                  className="button small mt-2"
                  onClick={() => {
                    void openStep(note.session_id!, note.step_id!);
                  }}
                >
                  <CornerDownRight size={14} />
                  View the approving step
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
