import { useEffect, useState } from 'react';
import { Copy, CornerDownRight, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api, draftsSchema, type Draft } from '../api';
import { notifyError, useWorkspace } from '../store';

export function DraftsView() {
  const { libraryVersion, openStep } = useWorkspace();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    api('/drafts?limit=200', draftsSchema)
      .then((data) => setDrafts(data.drafts))
      .catch((error: unknown) => notifyError(error));
  }, [libraryVersion]);
  return (
    <section className="library-view" aria-labelledby="drafts-title">
      <div>
        <h2 id="drafts-title" className="text-sm font-semibold">
          Local email drafts
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Drafts are simulated and saved locally. Nothing was sent or scheduled.
        </p>
      </div>
      {drafts.length === 0 && (
        <div className="empty-state mt-8">
          <Mail size={28} />
          <h2>No drafts yet</h2>
          <p>Approve an email step and run the plan to create a local draft.</p>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {drafts.map((draft) => {
          const open = expanded === draft.id;
          return (
            <article key={draft.id} className="library-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">To: {draft.to || 'Recipient not set'}</p>
                  <h3 className="mt-1 text-[15px] font-semibold">{draft.subject}</h3>
                </div>
                <span className="source-badge">Not sent</span>
              </div>
              <p
                className={`mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-muted ${open ? '' : 'max-h-24 overflow-hidden'}`}
              >
                {draft.body}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button
                  className="button small"
                  onClick={() => setExpanded(open ? null : draft.id)}
                  aria-expanded={open}
                >
                  {open ? 'Collapse draft' : 'Read full draft'}
                </button>
                <button
                  className="button small quiet"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      toast.error('Clipboard is unavailable in this browser.');
                      return;
                    }
                    void navigator.clipboard
                      .writeText(draft.body)
                      .then(() => toast.success('Draft copied.'))
                      .catch(() => toast.error('Clipboard is unavailable in this browser.'));
                  }}
                >
                  <Copy size={13} />
                  Copy body
                </button>
                {draft.session_goal && draft.session_id && draft.step_id && (
                  <button
                    className="button small quiet ml-auto"
                    onClick={() => {
                      void openStep(draft.session_id!, draft.step_id!);
                    }}
                  >
                    <CornerDownRight size={14} />
                    View the approving step
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
