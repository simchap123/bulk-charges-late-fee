import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SchedulerRun {
  id: string;
  timestamp: string;
  trigger: 'cron' | 'manual';
  mode: 'live' | 'test';
  status: 'success' | 'error' | 'dry-run';
  totalRows: number;
  validRows: number;
  submittedRows: number;
  skippedRows: number;
  missingV0Count: number;
  totalAmount: number;
  duration: number;
  warnings: string[];
  error?: string;
}

interface SchedulerState {
  // History of runs (persisted to localStorage)
  history: SchedulerRun[];

  // UI state
  isRunning: boolean;
  runMode: 'live' | 'test';

  // Actions
  addRun: (run: SchedulerRun) => void;
  setRunning: (running: boolean) => void;
  setRunMode: (mode: 'live' | 'test') => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 50;

export const useSchedulerStore = create<SchedulerState>()(
  persist(
    (set) => ({
      history: [],
      isRunning: false,
      runMode: 'live',

      addRun: (run) =>
        set((state) => ({
          history: [run, ...state.history].slice(0, MAX_HISTORY),
        })),

      setRunning: (running) => set({ isRunning: running }),

      setRunMode: (mode) => set({ runMode: mode }),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'scheduler-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        history: state.history,
        runMode: state.runMode,
      }),
    }
  )
);
