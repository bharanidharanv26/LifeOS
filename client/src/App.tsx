import { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  ArrowUp,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  Mail,
  MessageSquare,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api, emptySchema, jsonRequest } from './api';
import { applyTheme, notifyError, usePreferences, useWorkspace, type View } from './store';
import { PlanCard } from './components/PlanCard';
import { MemoryPanel } from './components/MemoryPanel';
import { CalendarView } from './components/CalendarView';
import { NotesView } from './components/NotesView';
import { DraftsView } from './components/DraftsView';
import { AuditView } from './components/AuditView';

const navigation = [
  { name: 'Sessions', icon: MessageSquare },
  { name: 'Memory', icon: BrainCircuit },
  { name: 'Calendar', icon: CalendarDays },
  { name: 'Notes', icon: FileText },
  { name: 'Drafts', icon: Mail },
  { name: 'Audit', icon: Activity },
] satisfies { name: View; icon: typeof Activity }[];

export default function App() {
  const state = useWorkspace();
  const { theme, setTheme } = usePreferences();
  const [goal, setGoal] = useState('');
  const [seeding, setSeeding] = useState(false);
  useEffect(() => {
    void useWorkspace.getState().load();
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);

  async function seed(start = false) {
    setSeeding(true);
    try {
      await api('/demo/seed', emptySchema, jsonRequest({}));
      await state.load();
      if (start) await state.createPlan('Prepare for my Friday investor call.', true);
      else toast.success('Demo context loaded.');
    } catch (error) {
      notifyError(error);
    } finally {
      setSeeding(false);
    }
  }
  async function approveSafe() {
    for (const step of state.active?.plan?.steps ?? [])
      if (
        step.status === 'proposed' &&
        step.risk === 'low' &&
        !step.policy_warnings.some((warning) => warning.blocking)
      ) {
        if (!(await state.review(step.id, 'approve'))) break;
      }
  }
  const plan = state.active?.plan;
  const approved =
    plan?.steps.filter((step) => ['approved', 'edited'].includes(step.status)).length ?? 0;
  const reviewed = plan?.steps.filter((step) => step.status !== 'proposed').length ?? 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          Skip to workspace
        </a>
        <aside className="sidebar">
          <a href="/" className="brand">
            <span className="brand-mark">
              <BrainCircuit size={22} />
            </span>
            <span className="sidebar-label">
              LifeOS<span className="text-accent">.</span>
            </span>
          </a>
          <div className="workspace-label sidebar-label">PERSONAL WORKSPACE</div>
          <nav aria-label="Main navigation">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={`nav-item ${state.view === name ? 'active' : ''}`}
                aria-current={state.view === name ? 'page' : undefined}
                title={name}
                onClick={() => state.setView(name)}
              >
                <Icon size={18} />
                <span className="sidebar-label">{name}</span>
                {name === 'Memory' && (
                  <span className="sidebar-label nav-count">{state.memories.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-label mt-9">
            <div className="flex items-center justify-between px-3">
              <h2 className="eyebrow">Recent sessions</h2>
              <button
                className="icon-button compact"
                aria-label="New session"
                onClick={() => {
                  useWorkspace.setState({ active: null, view: 'Sessions' });
                  document.getElementById('goal-input')?.focus();
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {state.sessions.slice(0, 6).map((session) => (
                <button
                  key={session.id}
                  title={session.goal_text}
                  className={`session-link ${state.active?.session.id === session.id ? 'active' : ''}`}
                  onClick={() => {
                    void state.selectSession(session.id);
                  }}
                >
                  <span className="session-dot" />
                  <span className="truncate">{session.goal_text}</span>
                </button>
              ))}
              {state.sessions.length === 0 && (
                <p className="px-3 py-3 text-xs leading-5 text-muted">Your plans will live here.</p>
              )}
            </div>
          </div>
          <div className="sidebar-bottom">
            <div className="demo-context sidebar-label">
              <Sparkles size={17} className="text-accent" />
              <p className="mt-2 text-xs font-semibold">Make it feel like you.</p>
              <p className="my-2 text-[11px] leading-5 text-muted">
                Start with five everyday work preferences.
              </p>
              <button
                className="button small w-full justify-center"
                disabled={seeding}
                onClick={() => {
                  void seed();
                }}
              >
                Load demo data
              </button>
            </div>
            <div className="profile">
              <span className="avatar">Y</span>
              <div className="sidebar-label">
                <strong className="block text-xs">Your workspace</strong>
                <span className="text-[10px] text-muted">Private · stored locally</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="main-shell">
          <header className="topbar">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Workspace</span>
              <ChevronRight size={13} className="text-muted" />
              <strong className="font-medium">{state.view}</strong>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`mode-badge ${state.health?.mockMode ? 'mock' : ''}`}
                title={state.health?.model ?? 'Connecting'}
              >
                {!state.health
                  ? 'CONNECTING'
                  : state.health.mockMode
                    ? 'MOCK · SIMULATED'
                    : 'LIVE MODEL'}
              </span>
              <button
                className="icon-button"
                aria-label={`Theme: ${theme}. Switch theme`}
                title={`Theme: ${theme}`}
                onClick={() =>
                  setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')
                }
              >
                {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
            </div>
          </header>

          <main id="main-content" className="main-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow text-accent">A little context. A better plan.</p>
                <h1>
                  {state.view === 'Sessions'
                    ? 'Make room for what matters.'
                    : state.view === 'Memory'
                      ? 'Your context, in your control.'
                      : state.view === 'Calendar'
                        ? 'Your week, protected.'
                        : state.view === 'Notes'
                          ? 'What you chose to keep.'
                          : state.view === 'Drafts'
                            ? 'Written your way.'
                            : 'Nothing happens off the record.'}
                </h1>
                <p className="text-sm text-muted">
                  {state.view === 'Sessions'
                    ? 'Tell me the outcome. We’ll work out the steps together.'
                    : state.view === 'Calendar'
                      ? 'Prep blocks created only after you approve them.'
                      : state.view === 'Notes'
                        ? 'Context you approved, searchable when you need it.'
                        : state.view === 'Drafts'
                          ? 'Local drafts shaped by the style you taught me.'
                          : state.view === 'Audit'
                            ? 'Every proposal, correction, and local action—traceable.'
                            : 'Everything stays in your local workspace.'}
                </p>
              </div>
              <span className="trust-indicator">
                <ShieldCheck size={15} />
                Nothing runs without your approval
              </span>
            </div>

            <form
              className="command-bar"
              onSubmit={(event) => {
                event.preventDefault();
                if (goal.trim().length >= 3) {
                  void state.createPlan(goal.trim());
                  setGoal('');
                }
              }}
            >
              <Sparkles size={21} className="shrink-0 text-accent" />
              <label htmlFor="goal-input" className="sr-only">
                What do you want to get done?
              </label>
              <input
                id="goal-input"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                maxLength={2000}
                placeholder="What do you want to get done?"
                autoComplete="off"
                disabled={state.planning}
              />
              <span className="hidden text-xs text-muted xl:inline">
                Remember → Plan → Ask → Act → Learn
              </span>
              <button
                className="command-submit"
                aria-label="Create a plan"
                disabled={goal.trim().length < 3 || state.planning}
              >
                <ArrowUp size={19} />
              </button>
            </form>

            {state.view === 'Memory' ? (
              <MemoryPanel expanded />
            ) : state.view === 'Calendar' ? (
              <CalendarView />
            ) : state.view === 'Notes' ? (
              <NotesView />
            ) : state.view === 'Drafts' ? (
              <DraftsView />
            ) : state.view === 'Audit' ? (
              <AuditView />
            ) : (
              <div className="workspace-grid">
                <section className="goal-panel" aria-labelledby="goal-title">
                  <div className="panel-heading">
                    <h2 id="goal-title">The conversation</h2>
                    <MessageSquare size={16} className="text-muted" />
                  </div>
                  {state.active ? (
                    <>
                      <div className="goal-message">
                        <span className="avatar small">Y</span>
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-muted">You</p>
                          <p className="text-sm leading-6">{state.active.session.goal_text}</p>
                        </div>
                      </div>
                      <div className="agent-message">
                        <span className="mini-brand">
                          <BrainCircuit size={16} />
                        </span>
                        <div>
                          <p className="mb-2 text-[11px] font-semibold">LifeOS</p>
                          <p className="text-[13px] leading-6 text-muted">
                            {plan
                              ? `I brought ${state.active.memories.length} memories into this plan. Take a look and make it yours.`
                              : 'This session did not produce a plan. You can retry your goal above.'}
                          </p>
                        </div>
                      </div>
                      {state.active.session.demo_scenario && (
                        <div className="demo-note">
                          <Sparkles size={15} />
                          <p>
                            Guided demo. Contacts and meeting details are fictional. The first early
                            proposal is deliberately staged.
                          </p>
                        </div>
                      )}
                      {plan && (
                        <div className="loop-list">
                          {['Remember', 'Plan', 'Ask', 'Act', 'Learn'].map((name, index) => (
                            <div key={name} className={index < 3 ? 'done' : ''}>
                              <span>{index < 2 ? <Check size={12} /> : index + 1}</span>
                              <p>{name}</p>
                              {index === 2 && <small>YOUR TURN</small>}
                            </div>
                          ))}
                        </div>
                      )}
                      {plan && plan.questions_for_user.length > 0 && (
                        <div className="questions">
                          <h3 className="flex items-center gap-2 text-xs font-semibold">
                            <CircleHelp size={14} />A little more context?
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {plan.questions_for_user.map((question) => (
                              <li key={question} className="text-xs leading-5 text-muted">
                                {question}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-3 text-[11px] text-muted">
                            Include your answers in your next goal.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="goal-intro">
                      <span className="mini-brand mb-4">
                        <BrainCircuit size={19} />
                      </span>
                      <h3 className="text-sm font-semibold">A collaborator with context.</h3>
                      <p className="mt-3 text-[13px] leading-6 text-muted">
                        I remember the small things—how you write, when you focus, what matters
                        next.
                      </p>
                      <p className="mt-3 text-[13px] leading-6 text-muted">
                        You decide what happens. I learn from each decision.
                      </p>
                      <div className="mt-6 border-t border-line pt-4">
                        <span className="eyebrow">Try a goal</span>
                        {[
                          'Prepare for my Friday investor call.',
                          "Get ready for next week's board meeting.",
                        ].map((example) => (
                          <button
                            key={example}
                            className="example-goal"
                            onClick={() => {
                              setGoal(example);
                              document.getElementById('goal-input')?.focus();
                            }}
                          >
                            {example}
                            <ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="plan-panel" aria-labelledby="plan-title">
                  <div className="panel-heading">
                    <div className="flex items-center gap-2">
                      <h2 id="plan-title">Plan & approvals</h2>
                      {plan && <span className="count-badge">v{plan.version}</span>}
                    </div>
                    <span className="text-[11px] tabular-nums text-muted">
                      {plan ? `${reviewed}/${plan.steps.length} reviewed` : 'Built around you'}
                    </span>
                  </div>
                  <AnimatePresence mode="wait">
                    {state.planning ? (
                      <motion.div
                        key="planning"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="planning-state"
                        role="status"
                      >
                        <div className="flex items-center gap-3">
                          <span className="mini-brand">
                            <BrainCircuit size={20} />
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">Putting your context to work</h3>
                            <p className="mt-1 text-xs text-muted">Waiting for a validated plan</p>
                          </div>
                        </div>
                        <ol className="my-6 space-y-4">
                          {['Recalling memories…', 'Planning…', 'Checking your preferences…'].map(
                            (label, index) => (
                              <li
                                key={label}
                                className="flex items-center gap-3 text-sm text-muted"
                              >
                                <span className="count-badge">{index + 1}</span>
                                {label}
                              </li>
                            ),
                          )}
                        </ol>
                        {[1, 2].map((index) => (
                          <div key={index} className="skeleton-card" aria-hidden="true">
                            <div />
                            <div />
                            <div />
                          </div>
                        ))}
                      </motion.div>
                    ) : plan ? (
                      <motion.div
                        key={plan.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.18 }}
                      >
                        <p className="mb-5 text-sm leading-6 text-muted">{plan.summary}</p>
                        {plan.mode === 'fallback' && (
                          <div className="warning-box mb-4 rounded-xl p-3 text-xs">
                            Live model unavailable. This plan uses an explicitly enabled simulated
                            fallback.
                          </div>
                        )}
                        {plan.changed_since_last_time.length > 0 && (
                          <div className="change-summary">
                            <h3 className="flex items-center gap-2 text-xs font-semibold">
                              <Sparkles size={14} />
                              Changed since last time
                            </h3>
                            {plan.changed_since_last_time.map((change) => (
                              <p key={change.memory_id} className="mt-2 text-xs leading-5">
                                {change.key.replaceAll('_', ' ')} · {change.reason}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="space-y-4">
                          {plan.steps.map((step) => (
                            <PlanCard
                              key={step.id}
                              step={step}
                              locked={state.active?.session.status === 'reflected'}
                            />
                          ))}
                        </div>
                        {plan.steps.length === 0 && (
                          <div className="empty-small">
                            <CircleHelp size={24} />
                            <p>Answer the questions to make a more specific plan.</p>
                          </div>
                        )}
                        <div className="approval-footer">
                          <p className="mb-3 flex items-center gap-2 text-[11px] text-muted">
                            <ShieldCheck size={13} />
                            Local simulations only. No emails are sent.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="button"
                              disabled={
                                state.pending.length > 0 ||
                                state.executing ||
                                !plan.steps.some(
                                  (step) =>
                                    step.status === 'proposed' &&
                                    step.risk === 'low' &&
                                    !step.policy_warnings.some((warning) => warning.blocking),
                                )
                              }
                              onClick={() => {
                                void approveSafe();
                              }}
                            >
                              Approve all safe steps
                            </button>
                            <button
                              className="button primary ml-auto"
                              disabled={approved === 0 || state.executing}
                              onClick={() => {
                                void state.execute();
                              }}
                              title="Run approved local actions in this session"
                            >
                              {state.executing ? (
                                <>
                                  <span className="spinner" aria-hidden="true" />
                                  Running…
                                </>
                              ) : (
                                <>
                                  Run approved ({approved})<ArrowRight size={14} />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="plan-empty">
                        <div className="empty-art">
                          <BrainCircuit size={34} />
                          <span className="art-dot one" />
                          <span className="art-dot two" />
                          <span className="art-dot three" />
                        </div>
                        <span className="eyebrow text-accent">YOUR NEXT STEP, WITH CONTEXT</span>
                        <h2>
                          A plan that starts
                          <br />
                          with knowing you.
                        </h2>
                        <p>
                          Give me a goal. I’ll recall what matters, propose a few useful steps, and
                          ask before taking action.
                        </p>
                        <button
                          className="button primary mt-7"
                          disabled={seeding || state.planning}
                          onClick={() => {
                            void seed(true);
                          }}
                        >
                          <Sparkles size={15} />
                          Start guided demo
                          <ArrowRight size={14} />
                        </button>
                        <span className="mt-3 block text-[11px] text-muted">
                          Fictional investor-call scenario · about 2 minutes
                        </span>
                      </div>
                    )}
                  </AnimatePresence>
                </section>
                <MemoryPanel />
              </div>
            )}
          </main>
          <footer className="app-footer">
            <span>
              <span className="online-dot" />
              {state.health ? 'Local database connected' : 'Connecting to your workspace'}
            </span>
            <span>
              Built for your world. <span className="ml-2">All times UTC</span>
            </span>
          </footer>
        </div>
      </div>
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        toastOptions={{ style: { fontFamily: 'Inter, sans-serif' } }}
      />
    </MotionConfig>
  );
}
