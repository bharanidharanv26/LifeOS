import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CornerDownRight, Sparkles } from 'lucide-react';
import { api, calendarSchema, type CalendarEvent } from '../api';
import { notifyError, useWorkspace } from '../store';

function startOfWeek(value: Date): Date {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date;
}
const dayLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });

export function CalendarView() {
  const { libraryVersion, openStep } = useWorkspace();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/calendar?limit=200', calendarSchema)
      .then((data) => {
        setEvents(data.events);
        setSelectedId((current) => current ?? data.events[0]?.id ?? null);
        if (data.events[0]) setWeekStart(startOfWeek(new Date(data.events[0].start)));
      })
      .catch((error: unknown) => notifyError(error))
      .finally(() => setLoading(false));
  }, [libraryVersion]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setUTCDate(date.getUTCDate() + index);
        return date;
      }),
    [weekStart],
  );
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const end = days[6] ?? weekStart;
  function moveWeek(offset: number) {
    const next = new Date(weekStart);
    next.setUTCDate(next.getUTCDate() + offset * 7);
    setWeekStart(next);
  }
  return (
    <section className="library-view" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="calendar-title" className="text-sm font-semibold">
            {weekStart.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}{' '}
            –{' '}
            {end.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Local blocks created by approved steps. All times UTC.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="icon-button" aria-label="Previous week" onClick={() => moveWeek(-1)}>
            <ArrowLeft size={16} />
          </button>
          <button className="button small" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </button>
          <button className="icon-button" aria-label="Next week" onClick={() => moveWeek(1)}>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <div className="week-grid mt-5">
        {days.map((day) => {
          const key = dateKey(day);
          const dayEvents = events.filter((event) => event.start.slice(0, 10) === key);
          return (
            <div key={key} className={`week-day ${key === dateKey(new Date()) ? 'today' : ''}`}>
              <div className="week-day-head">
                <span>{dayLabel(day)}</span>
                <strong>{day.getUTCDate()}</strong>
              </div>
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    className={`event-pill ${selectedId === event.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(event.id)}
                  >
                    <span>{timeLabel(event.start)}</span>
                    <strong>{event.title}</strong>
                  </button>
                ))}
                {dayEvents.length === 0 && <span className="week-empty">—</span>}
              </div>
            </div>
          );
        })}
      </div>
      {loading && <p className="mt-6 text-xs text-muted">Loading local calendar…</p>}
      {!loading && events.length === 0 && (
        <div className="empty-state mt-6">
          <CalendarDays size={28} />
          <h2>No local blocks yet</h2>
          <p>Approve a calendar step, run the plan, and it will appear here.</p>
        </div>
      )}
      {selected && (
        <article className="library-card mt-6" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="source-badge">Local simulation</span>
            <span className="eyebrow">Calendar block</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{selected.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {timeLabel(selected.start)} – {timeLabel(selected.end)} UTC ·{' '}
            {Math.round((Date.parse(selected.end) - Date.parse(selected.start)) / 60000)} minutes
          </p>
          {selected.notes && <p className="mt-3 text-sm leading-6">{selected.notes}</p>}
          {selected.session_goal && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="flex items-center gap-2 text-[11px] text-muted">
                <Sparkles size={13} className="text-accent" />
                Created from “{selected.session_goal}”
              </p>
              {selected.session_id && selected.step_id && (
                <button
                  className="button small mt-3"
                  onClick={() => {
                    void openStep(selected.session_id!, selected.step_id!);
                  }}
                >
                  <CornerDownRight size={14} />
                  View the approving step
                </button>
              )}
            </div>
          )}
        </article>
      )}
      {events.length > 0 && (
        <p className="mt-6 text-[11px] text-muted">
          {events.length} local block{events.length === 1 ? '' : 's'} · Nothing syncs to an external
          calendar.
        </p>
      )}
    </section>
  );
}
