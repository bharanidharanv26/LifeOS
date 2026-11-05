import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BrainCircuit, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

const steps = [
  {
    icon: BrainCircuit,
    title: 'A workspace that remembers you.',
    body: 'LifeOS keeps a local memory of your preferences, goals, and habits. You can edit or delete any of it, any time.',
  },
  {
    icon: ShieldCheck,
    title: 'Plans ask before they act.',
    body: 'Every step is a proposal. Approve it, edit the details, or reject it with a reason. Your preferences are checked again right before anything runs.',
  },
  {
    icon: Sparkles,
    title: 'It learns from your decisions.',
    body: 'Your edits and rejection reasons become context for the next plan. Start with the guided demo to see the whole loop in about three minutes.',
  },
];

export function Onboarding({
  open,
  busy,
  onClose,
  onStartDemo,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onStartDemo: () => void;
}) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);
  const step = steps[index] ?? steps[0]!;
  const Icon = step.icon;
  const last = index === steps.length - 1;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            className="onboarding-card"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow text-accent">Welcome to LifeOS</span>
              <button className="button small quiet" onClick={onClose}>
                Skip
              </button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                <span className="mini-brand mt-6">
                  <Icon size={19} />
                </span>
                <h2 id="onboarding-title" className="mt-4 text-xl font-semibold tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">{step.body}</p>
              </motion.div>
            </AnimatePresence>
            <div
              className="onboarding-dots mt-7"
              aria-label={`Step ${index + 1} of ${steps.length}`}
            >
              {steps.map((item, itemIndex) => (
                <button
                  key={item.title}
                  className={itemIndex === index ? 'active' : ''}
                  aria-label={`Go to step ${itemIndex + 1}`}
                  onClick={() => setIndex(itemIndex)}
                />
              ))}
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <button
                className="button small"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              {last ? (
                <>
                  <button className="button small" onClick={onClose}>
                    <Check size={14} />
                    Explore on my own
                  </button>
                  <button
                    className="button small primary ml-auto"
                    disabled={busy}
                    onClick={onStartDemo}
                  >
                    <Sparkles size={14} />
                    {busy ? 'Preparing demo…' : 'Start guided demo'}
                  </button>
                </>
              ) : (
                <button
                  className="button small primary ml-auto"
                  onClick={() => setIndex(index + 1)}
                >
                  Next
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted">
              Tool actions are local simulations. Mock mode stays offline; live mode sends goals and
              relevant context to your configured model endpoint.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
