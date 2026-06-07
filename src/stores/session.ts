import { create } from "zustand";
import { toast } from "sonner";
import type { Grade } from "@/domain/types";
import type { ScheduledQuestion } from "@/domain/session";
import { gradeReviewState } from "@/lib/repos/review";

interface SessionState {
  queue: ScheduledQuestion[];
  index: number;
  revealed: boolean;
  /** Cram mode ignores the schedule and never writes Review state. */
  cram: boolean;
  graded: number;

  start: (queue: ScheduledQuestion[], cram: boolean) => void;
  reveal: () => void;
  grade: (grade: Grade) => Promise<void>;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  queue: [],
  index: 0,
  revealed: false,
  cram: false,
  graded: 0,

  start: (queue, cram) =>
    set({ queue, index: 0, revealed: false, cram, graded: 0 }),

  reveal: () => set({ revealed: true }),

  grade: async (grade) => {
    const { queue, index, cram } = get();
    const current = queue[index];
    if (!current) return;

    // Real sessions persist SM-2; cram leaves Review state untouched. If the
    // persist fails we still advance — blocking the session on a flaky write
    // would feel like the grade button is broken — and warn the user that this
    // one card's schedule may not have saved.
    if (!cram && current.reviewState) {
      try {
        await gradeReviewState(current.reviewState, grade);
      } catch {
        toast.warning(
          "Couldn't save this card's progress — it may come up again sooner than expected.",
        );
      }
    }

    set((s) => ({
      index: s.index + 1,
      revealed: false,
      graded: s.graded + 1,
    }));
  },

  reset: () =>
    set({ queue: [], index: 0, revealed: false, cram: false, graded: 0 }),
}));
