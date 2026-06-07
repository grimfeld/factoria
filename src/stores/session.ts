import { create } from "zustand";
import { toast } from "sonner";
import type { AutoGrade, Grade } from "@/domain/types";
import type { StudyTask } from "@/domain/session";
import { autoGradeToGrade, checkAnswer } from "@/domain/modes";
import { gradeReviewState } from "@/lib/repos/review";

interface SessionState {
  queue: StudyTask[];
  index: number;
  revealed: boolean;
  /** Cram mode ignores the schedule and never writes Review state. */
  cram: boolean;
  graded: number;
  /**
   * Auto-grade result of the current `mcq`/`text-input` task once answered, and
   * the user's typed/picked input — held so the UI can show right/wrong and the
   * correct value before advancing. Null until answered; cleared on `next`.
   */
  result: AutoGrade | null;
  submitted: string | null;

  start: (queue: StudyTask[], cram: boolean) => void;
  reveal: () => void;
  grade: (grade: Grade) => Promise<void>;
  answer: (input: string) => Promise<void>;
  next: () => void;
  reset: () => void;
}

/**
 * Persist a grade for the current task unless we're cramming or the Question is
 * New (no Review state to update). Mirrors the write-then-warn contract: a
 * failed write never blocks the session — we advance anyway and warn that this
 * one card's schedule may not have saved.
 */
async function persistGrade(task: StudyTask, cram: boolean, grade: Grade) {
  if (cram || !task.reviewState) return;
  try {
    await gradeReviewState(task.reviewState, grade);
  } catch {
    toast.warning(
      "Couldn't save this card's progress — it may come up again sooner than expected.",
    );
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  queue: [],
  index: 0,
  revealed: false,
  cram: false,
  graded: 0,
  result: null,
  submitted: null,

  start: (queue, cram) =>
    set({
      queue,
      index: 0,
      revealed: false,
      cram,
      graded: 0,
      result: null,
      submitted: null,
    }),

  reveal: () => set({ revealed: true }),

  // Self-graded recall: persist then advance in one step.
  grade: async (grade) => {
    const { queue, index, cram } = get();
    const current = queue[index];
    if (!current) return;
    await persistGrade(current, cram, grade);
    set((s) => ({
      index: s.index + 1,
      revealed: false,
      result: null,
      submitted: null,
      graded: s.graded + 1,
    }));
  },

  // Auto-graded mcq/text-input: check the input, persist the mapped grade, and
  // hold the result for feedback. The UI calls `next` to advance.
  answer: async (input) => {
    const { queue, index, cram, result } = get();
    const current = queue[index];
    if (!current || result !== null) return; // ignore double-submit
    const auto = checkAnswer(current.question, input);
    set({ result: auto, submitted: input });
    await persistGrade(current, cram, autoGradeToGrade(auto));
  },

  next: () =>
    set((s) => ({
      index: s.index + 1,
      revealed: false,
      result: null,
      submitted: null,
      graded: s.graded + 1,
    })),

  reset: () =>
    set({
      queue: [],
      index: 0,
      revealed: false,
      cram: false,
      graded: 0,
      result: null,
      submitted: null,
    }),
}));
