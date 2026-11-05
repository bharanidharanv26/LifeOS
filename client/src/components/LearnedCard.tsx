import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ArrowDownRight, BrainCircuit, Sparkles } from 'lucide-react';
import type { Learned } from '../api';

export function LearnedCard({
  learned,
  demo,
  onNextGoal,
}: {
  learned: Learned;
  demo: boolean;
  onNextGoal: () => void;
}) {
  return (
    <section className="learned-card mb-5" aria-labelledby="learned-title">
      <div className="flex items-start gap-3">
        <span className="mini-brand">
          <Sparkles size={16} />
        </span>
        <div>
          <h3 id="learned-title" className="text-sm font-semibold">
            What I learned
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            From {learned.reviewed_steps} reviewed step
            {learned.reviewed_steps === 1 ? '' : 's'}. You can edit or delete any of it.
          </p>
        </div>
      </div>
      {learned.insights.length > 0 && (
        <ul className="mt-4 space-y-2">
          {learned.insights.map((insight) => (
            <li key={insight} className="text-xs leading-5 text-muted">
              {insight}
            </li>
          ))}
        </ul>
      )}
      {learned.new_memories.length > 0 && (
        <div className="mt-4 space-y-2">
          {learned.new_memories.map((memory, index) => (
            <motion.article
              key={memory.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.07, ease: [0.23, 1, 0.32, 1] }}
              className="learned-memory"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="source-badge">New</span>
                <strong className="text-xs">{memory.key.replaceAll('_', ' ')}</strong>
                <span className="ml-auto text-[10px] tabular-nums text-muted">
                  {Math.round(memory.confidence * 100)}% confident
                </span>
              </div>
              {learned.weakened
                .filter((older) => older.key === memory.key)
                .map((older) => (
                  <div
                    key={older.id}
                    className="mt-3 border-l-2 border-line pl-3 text-xs text-muted"
                  >
                    <span className="eyebrow">Before</span>
                    <p className="mt-1">{older.value}</p>
                  </div>
                ))}
              <p className="eyebrow mt-3">After · learned preference</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6">
                {memory.value}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-muted">{memory.rationale}</p>
            </motion.article>
          ))}
        </div>
      )}
      {(learned.reinforced.length > 0 || learned.weakened.length > 0) && (
        <div className="mt-4 space-y-1.5 border-t border-line pt-3">
          {learned.reinforced.map((memory) => (
            <p key={memory.id} className="flex items-center gap-2 text-[11px] text-muted">
              <ArrowUpRight size={13} className="text-accent" />
              <span className="font-medium text-ink">{memory.key.replaceAll('_', ' ')}</span>
              {Math.round(memory.confidence_before * 100)}% →{' '}
              {Math.round(memory.confidence_after * 100)}%
            </p>
          ))}
          {learned.weakened.map((memory) => (
            <p key={memory.id} className="flex items-center gap-2 text-[11px] text-muted">
              <ArrowDownRight size={13} />
              <span className="font-medium text-ink">{memory.key.replaceAll('_', ' ')}</span>
              {Math.round(memory.confidence_before * 100)}% →{' '}
              {Math.round(memory.confidence_after * 100)}%{memory.archived && ' · archived'}
            </p>
          ))}
        </div>
      )}
      {demo && (
        <button className="button small primary mt-4" onClick={onNextGoal}>
          Try the next goal
          <ArrowRight size={14} />
        </button>
      )}
      {demo && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
          <BrainCircuit size={12} />
          “Get ready for next week’s board meeting.” · compare the two plans
        </p>
      )}
    </section>
  );
}
