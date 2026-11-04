import { create } from 'zustand';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  api,
  emptySchema,
  healthSchema,
  jsonRequest,
  memoriesSchema,
  memorySchema,
  sessionDetailSchema,
  sessionSummarySchema,
  stepSchema,
  type Memory,
  type SessionDetail,
  type Step,
} from './api';

export type View = 'Sessions' | 'Memory' | 'Calendar' | 'Notes' | 'Drafts' | 'Audit';
export function notifyError(error: unknown, retry?: () => void): void {
  toast.error(error instanceof Error ? error.message : 'Something went wrong. Please retry.', {
    duration: 8000,
    ...(retry ? { action: { label: 'Retry', onClick: retry } } : {}),
  });
}
interface Workspace {
  health: z.infer<typeof healthSchema> | null;
  memories: Memory[];
  sessions: z.infer<typeof sessionSummarySchema>[];
  active: SessionDetail | null;
  previous: SessionDetail | null;
  view: View;
  loading: boolean;
  planning: boolean;
  pending: string[];
  selectedStepId: string | null;
  highlightedMemoryId: string | null;
  load: () => Promise<void>;
  reloadMemories: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createPlan: (goal: string, demo?: boolean) => Promise<void>;
  review: (id: string, action: 'approve' | 'edit' | 'reject', body?: unknown) => Promise<boolean>;
  saveMemory: (id: string, value: string) => Promise<boolean>;
  removeMemory: (id: string) => Promise<void>;
  setView: (view: View) => void;
}

export const useWorkspace = create<Workspace>((set, get) => ({
  health: null,
  memories: [],
  sessions: [],
  active: null,
  previous: null,
  view: 'Sessions',
  loading: true,
  planning: false,
  pending: [],
  selectedStepId: null,
  highlightedMemoryId: null,
  setView: (view) => set({ view }),
  reloadMemories: async () => {
    const response = await api('/memories?limit=200', memoriesSchema);
    set({ memories: response.memories });
  },
  load: async () => {
    try {
      const [health, memories, sessions] = await Promise.all([
        api('/health', healthSchema),
        api('/memories?limit=200', memoriesSchema),
        api('/sessions', z.object({ sessions: z.array(sessionSummarySchema) })),
      ]);
      set({ health, memories: memories.memories, sessions: sessions.sessions, loading: false });
    } catch (error) {
      set({ loading: false });
      notifyError(error, () => {
        void get().load();
      });
    }
  },
  selectSession: async (id) => {
    try {
      const active = await api(`/sessions/${id}`, sessionDetailSchema);
      set({ active, selectedStepId: active.plan?.steps[0]?.id ?? null, view: 'Sessions' });
    } catch (error) {
      notifyError(error, () => {
        void get().selectSession(id);
      });
    }
  },
  createPlan: async (goal, demo = false) => {
    if (get().planning) return;
    set({ planning: true, view: 'Sessions' });
    try {
      const active = await api('/sessions', sessionDetailSchema, jsonRequest({ goal, demo }));
      set({ previous: get().active, active, selectedStepId: active.plan?.steps[0]?.id ?? null });
      await get().load();
      toast.success('Your plan is ready to review. Nothing has run.');
    } catch (error) {
      notifyError(error, () => {
        void get().createPlan(goal, demo);
      });
    } finally {
      set({ planning: false });
    }
  },
  review: async (id, action, body = {}) => {
    const step = get().active?.plan?.steps.find((item) => item.id === id);
    if (!step || get().pending.includes(id)) return false;
    const patchStep = (replacement: Step) =>
      set((state) => ({
        active: state.active?.plan
          ? {
              ...state.active,
              plan: {
                ...state.active.plan,
                steps: state.active.plan.steps.map((item) => (item.id === id ? replacement : item)),
              },
            }
          : state.active,
      }));
    set((state) => ({ pending: [...state.pending, id] }));
    if (action === 'approve')
      patchStep({ ...step, status: step.edited_args ? 'edited' : 'approved' });
    try {
      const response = await api(
        `/steps/${id}/${action}`,
        z.object({ step: stepSchema }),
        jsonRequest(body),
      );
      patchStep(response.step);
      return true;
    } catch (error) {
      patchStep(step);
      notifyError(error, () => {
        void get().review(id, action, body);
      });
      return false;
    } finally {
      set((state) => ({ pending: state.pending.filter((item) => item !== id) }));
    }
  },
  saveMemory: async (id, value) => {
    try {
      const response = await api(
        `/memories/${id}`,
        z.object({ memory: memorySchema }),
        jsonRequest({ value }, 'PATCH'),
      );
      set((state) => ({
        memories: state.memories.map((memory) => (memory.id === id ? response.memory : memory)),
      }));
      toast.success('Memory updated.');
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    }
  },
  removeMemory: async (id) => {
    const before = get().memories;
    set({ memories: before.filter((memory) => memory.id !== id) });
    try {
      await api(`/memories/${id}`, emptySchema, { method: 'DELETE' });
      toast('Memory deleted', {
        description: 'Removed from future plans. History is retained.',
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: () => {
            void api(`/memories/${id}/restore`, emptySchema, jsonRequest({}))
              .then(() => get().reloadMemories())
              .catch((error: unknown) => notifyError(error));
          },
        },
      });
    } catch (error) {
      await get().reloadMemories();
      notifyError(error);
    }
  },
}));

export type Theme = 'system' | 'light' | 'dark';
function initialTheme(): Theme {
  try {
    const value = localStorage.getItem('lifeos-theme');
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
}
export const usePreferences = create<{ theme: Theme; setTheme: (theme: Theme) => void }>((set) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem('lifeos-theme', theme);
    } catch {
      /* Theme still works when storage is unavailable. */
    }
    applyTheme(theme);
    set({ theme });
  },
}));
applyTheme(usePreferences.getState().theme);
