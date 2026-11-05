import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import { z } from 'zod';
import { api, dateLabel } from '../api';
import { notifyError } from '../store';
import { useDialogFocus } from './useDialogFocus';

const llmCallSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  model: z.string(),
  latency_ms: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  retries: z.number(),
  ok: z.number(),
  created_at: z.string(),
  mode: z.enum(['mock', 'live', 'fallback']),
  error_code: z.string().nullable(),
});
const callsSchema = z.object({ calls: z.array(llmCallSchema) });
type LlmCall = z.infer<typeof llmCallSchema>;

function Drawer({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.aside
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="drawer"
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="drawer-head">
              <div>
                <h2 id="drawer-title" className="text-sm font-semibold">
                  {title}
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-muted">{description}</p>
              </div>
              <button className="icon-button" aria-label="Close panel" onClick={onClose}>
                <X size={17} />
              </button>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function ModelDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [calls, setCalls] = useState<LlmCall[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    api('/llm-calls', callsSchema)
      .then((data) => setCalls(data.calls))
      .catch((error: unknown) => {
        notifyError(error);
        setCalls([]);
      });
  }, [open, refresh]);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Model activity"
      description="Every model call this workspace makes, including mock calls. No prompts or secrets are shown."
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">Latest 100 calls</span>
        <button className="button small" onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      {calls === null && <p className="text-xs text-muted">Loading model activity…</p>}
      {calls?.length === 0 && (
        <div className="empty-small">
          <Activity size={22} />
          <p>No model calls yet. Create a plan to see the activity.</p>
        </div>
      )}
      <ol className="space-y-2">
        {calls?.map((call) => (
          <li key={call.id} className="call-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`actor-badge actor-${call.mode === 'mock' ? 'system' : 'agent'}`}>
                {call.mode}
              </span>
              <strong className="text-xs capitalize">{call.purpose}</strong>
              <span
                className={`ml-auto text-[10px] font-semibold ${call.ok ? 'text-accent' : 'text-red-600 dark:text-red-300'}`}
              >
                {call.ok ? 'OK' : (call.error_code ?? 'FAILED')}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted">
              {call.model} · {call.latency_ms}ms · {call.prompt_tokens + call.completion_tokens}{' '}
              tokens · {call.retries} retr{call.retries === 1 ? 'y' : 'ies'}
            </p>
            <time
              className="mt-1 block text-[10px] tabular-nums text-muted"
              dateTime={call.created_at}
            >
              {dateLabel(call.created_at)}
            </time>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-[10px] leading-5 text-muted">
        Mock mode runs entirely offline. Live mode shows the configured model name. Token counts are
        only reported when the provider returns usage.
      </p>
    </Drawer>
  );
}

export function DemoDrawer({
  open,
  onClose,
  seeding,
  onSeed,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  seeding: boolean;
  onSeed: () => void;
  onStart: () => void;
}) {
  const script = [
    {
      title: 'Start the guided demo',
      body: 'Five fictional preferences load. The investor call is staged with an intentionally early 09:00 prep block.',
    },
    {
      title: 'Reject the 09:00 block',
      body: 'Choose “too early” or type your own reason. The deterministic policy checker blocks approval, so the demo cannot slide past the conflict.',
    },
    {
      title: 'Edit the agenda email',
      body: 'Click Edit, keep your structure, and save. Saving an edit approves the corrected local action.',
    },
    {
      title: 'Learn from this',
      body: 'The agent turns the rejection and edit into two inferred memories. Review the diff and confidence changes.',
    },
    {
      title: 'Run the next goal',
      body: '“Get ready for next week’s board meeting.” The new plan starts at noon and reuses your email structure. Compare v1 and v2.',
    },
    {
      title: 'Run approved steps',
      body: 'Approve safe steps and run them. Calendar, notes, drafts, and the audit trail update locally. Nothing is sent.',
    },
  ];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Demo script"
      description="A three-minute path through the whole loop. Simulations are labeled; contacts are fictional."
    >
      <ol className="space-y-3">
        {script.map((item, index) => (
          <li key={item.title} className="flex gap-3">
            <span className="count-badge mt-0.5 h-fit">{index + 1}</span>
            <div>
              <strong className="text-xs">{item.title}</strong>
              <p className="mt-1 text-[11px] leading-5 text-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
        <button className="button small" disabled={seeding} onClick={onSeed}>
          <Sparkles size={14} />
          Load demo data
        </button>
        <button className="button small primary" disabled={seeding} onClick={onStart}>
          <Play size={14} />
          {seeding ? 'Preparing…' : 'Start guided demo'}
        </button>
      </div>
    </Drawer>
  );
}
