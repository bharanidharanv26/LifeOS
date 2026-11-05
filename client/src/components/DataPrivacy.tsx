import { useEffect, useState } from 'react';
import { Download, ShieldCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, apiResponse, jsonRequest } from '../api';
import { notifyError, useWorkspace } from '../store';

const resetSchema = z.object({ reset: z.boolean(), deleted: z.number() });

export function DataPrivacy() {
  const load = useWorkspace((state) => state.load);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [forgetting, setForgetting] = useState(false);
  const canForget = phrase === 'FORGET EVERYTHING';
  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);
  async function exportJson() {
    setExporting(true);
    try {
      const response = await apiResponse('/export');
      if (!response.ok) throw new Error('The export could not be prepared. Please retry.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded. It includes every local table.');
    } catch (error) {
      notifyError(error);
    } finally {
      setExporting(false);
    }
  }
  async function forgetEverything() {
    setForgetting(true);
    try {
      await api('/demo/reset', resetSchema, jsonRequest({ confirm: 'FORGET EVERYTHING' }));
      setConfirming(false);
      setPhrase('');
      await load();
      toast.success('Everything deleted. The workspace is clean.');
    } catch (error) {
      notifyError(error);
    } finally {
      setForgetting(false);
    }
  }
  return (
    <section className="data-card" aria-labelledby="data-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Your data</p>
          <h2 id="data-title" className="mt-1 text-base font-semibold">
            Portable by default.
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-5 text-muted">
            Every memory, plan, draft, note, calendar block, and audit entry lives in one local
            SQLite file. Export it as JSON, or delete all of it here.
          </p>
        </div>
        <span className="trust-indicator">
          <ShieldCheck size={15} />
          No cloud copy
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="button small" disabled={exporting} onClick={() => void exportJson()}>
          <Download size={14} />
          {exporting ? 'Preparing…' : 'Export JSON'}
        </button>
        <button className="button small danger" onClick={() => setConfirming(true)}>
          <Trash2 size={14} />
          Forget everything
        </button>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-muted">
        Deletion removes the local database contents immediately. It cannot be undone. Exports never
        include API keys or prompts.
      </p>
      {confirming && (
        <div
          className="onboarding-overlay"
          role="presentation"
          onClick={() => setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forget-title"
            className="onboarding-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-red-600 dark:text-red-300">Permanent action</p>
                <h2 id="forget-title" className="mt-1 text-lg font-semibold">
                  Forget everything?
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Cancel deletion"
                onClick={() => setConfirming(false)}
              >
                <X size={17} />
              </button>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted">
              This deletes all memories, sessions, plans, drafts, notes, calendar blocks, and audit
              history from this device. Type <strong>FORGET EVERYTHING</strong> to continue.
            </p>
            <label className="field-label mt-4">
              Confirmation
              <input
                autoFocus
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder="FORGET EVERYTHING"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="button small" onClick={() => setConfirming(false)}>
                Keep my data
              </button>
              <button
                className="button small danger"
                disabled={!canForget || forgetting}
                onClick={() => void forgetEverything()}
              >
                <Trash2 size={14} />
                {forgetting ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
