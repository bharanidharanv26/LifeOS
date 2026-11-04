import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BrainCircuit, Check, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { z } from 'zod';

const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('connected'),
  mockMode: z.boolean(),
  model: z.string(),
});
const memoriesSchema = z.object({
  total: z.number(),
  memories: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      value: z.string(),
      confidence: z.number(),
      source: z.enum(['seed', 'user', 'inferred']),
    }),
  ),
});
const errorSchema = z.object({ error: z.object({ message: z.string() }) });
const seedSchema = z.object({ inserted: z.number(), total: z.number() });
type Foundation = {
  health: z.infer<typeof healthSchema>;
  memories: z.infer<typeof memoriesSchema>;
};

async function fetchJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, options);
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'The server could not complete this request.',
    );
  }
  return body;
}

export default function App() {
  const [foundation, setFoundation] = useState<Foundation | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback((signal?: AbortSignal): Promise<void> => {
    const options = signal ? { signal } : {};
    return Promise.all([fetchJson('/api/health', options), fetchJson('/api/memories', options)])
      .then(([health, memories]) => {
        if (!signal?.aborted) {
          setFoundation({
            health: healthSchema.parse(health),
            memories: memoriesSchema.parse(memories),
          });
          setError(null);
        }
      })
      .catch(() => {
        if (!signal?.aborted) {
          setError('Could not connect to LifeOS. Check that the server is running, then retry.');
        }
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function loadDemo(): Promise<void> {
    setSeeding(true);
    setError(null);
    setNotice('');
    try {
      const result = seedSchema.parse(
        await fetchJson('/api/demo/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
      setNotice(
        result.inserted > 0
          ? `${result.inserted} demo memories added. Your foundation is ready.`
          : 'Demo data is already loaded. Your existing memories are preserved.',
      );
      setLoading(true);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not load demo data. Please retry.',
      );
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="min-h-screen px-5 py-8 sm:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-3 rounded-lg" aria-label="LifeOS home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <BrainCircuit size={23} aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            LifeOS<span className="text-accent">.</span>
          </span>
        </a>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
          Phase 01 · Foundation
        </span>
      </header>

      <main className="mx-auto max-w-5xl pb-12 pt-16 sm:pt-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Your work, remembered
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            A little context.
            <br />A better way to work.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
            LifeOS is a personal work agent that remembers how you work. Start with a few
            preferences, and build from there.
          </p>
        </div>

        <ol
          aria-label="The LifeOS agent loop"
          className="my-9 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm"
        >
          {['Remember', 'Plan', 'Ask', 'Act', 'Learn'].map((step, index) => (
            <li key={step} className="flex items-center gap-4">
              {index > 0 && <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />}
              <span className={index === 0 ? 'font-semibold text-accent' : 'text-slate-500'}>
                {step}
              </span>
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.65fr]">
          <section
            aria-labelledby="foundation-heading"
            className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-7"
          >
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-accent">
              <Database size={22} aria-hidden="true" />
            </div>
            <h2 id="foundation-heading" className="text-lg font-semibold tracking-tight">
              A place for your context
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your memory service and local database are ready to check. Load five preferences to
              explore the foundation.
            </p>
            <dl className="my-6 space-y-4 text-sm" aria-busy={loading}>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Database</dt>
                <dd className="font-medium">
                  {loading ? 'Checking…' : error ? 'Check connection' : 'Connected'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Model mode</dt>
                <dd className="font-medium">
                  {foundation
                    ? foundation.health.mockMode
                      ? 'Mock · offline'
                      : 'Live · configured'
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Active memories</dt>
                <dd className="font-medium tabular-nums">{foundation?.memories.total ?? '—'}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => {
                void loadDemo();
              }}
              disabled={loading || seeding}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {seeding ? 'Loading demo data…' : 'Load demo data'}
              {!seeding && <ArrowRight size={16} aria-hidden="true" />}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              Safe to load again. Existing memories are preserved.
            </p>
          </section>

          <section
            aria-labelledby="memories-heading"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="memories-heading" className="text-lg font-semibold tracking-tight">
                  What I know about you
                </h2>
                <p className="mt-1 text-sm text-slate-500">A read-only preview of your memory.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
                disabled={loading || seeding}
                aria-label="Refresh memory preview"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>

            {loading && !foundation ? (
              <div role="status" className="mt-7 space-y-4">
                <p className="text-sm text-slate-500">Checking your foundation…</p>
                {[1, 2, 3].map((key) => (
                  <div key={key} className="h-16 rounded-xl bg-slate-100" aria-hidden="true" />
                ))}
              </div>
            ) : foundation && foundation.memories.total > 0 ? (
              <ul className="mt-5 divide-y divide-slate-100" aria-busy={loading}>
                {foundation.memories.memories.map((memory) => (
                  <li key={memory.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <Check size={16} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
                      <p className="break-words text-sm font-medium leading-6">{memory.value}</p>
                    </div>
                    <div className="ml-7 mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-md bg-slate-100 px-2 py-1 capitalize">
                        {memory.type}
                      </span>
                      <span>
                        {memory.source === 'seed'
                          ? 'Demo seed'
                          : memory.source === 'user'
                            ? 'You'
                            : 'Inferred'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{Math.round(memory.confidence * 100)}% confidence</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="my-10 rounded-xl border border-dashed border-slate-200 px-5 py-9 text-center">
                <BrainCircuit
                  size={28}
                  className="mx-auto mb-3 text-slate-400"
                  aria-hidden="true"
                />
                <h3 className="text-sm font-medium">A fresh start</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
                  Load the demo preferences to see the context LifeOS will use to plan with you.
                </p>
              </div>
            )}
          </section>
        </div>

        <div aria-live="polite" role="status" className="mt-5 text-sm leading-6 text-slate-600">
          {notice}
        </div>
        {error && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
              disabled={loading}
              className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-4"
            >
              Retry connection
            </button>
          </div>
        )}

        <footer className="mt-9 flex flex-col justify-between gap-4 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-500 sm:flex-row">
          <p className="flex items-center gap-2">
            <ShieldCheck size={16} className="shrink-0 text-accent" aria-hidden="true" />
            Nothing runs without your approval.
          </p>
          <p>Phase 1: memory + API. Planning arrives in Phase 2.</p>
        </footer>
      </main>
    </div>
  );
}
