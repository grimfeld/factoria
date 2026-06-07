/**
 * Factoria domain types — pure, framework-free.
 *
 * The unit of *entry* is a {@link Topic} (a plain-text Title + Fields).
 * The unit of *study* is a {@link Question}, *derived* from each non-empty
 * {@link Field} — "given the Title, recall this Field" (ADR-0005..0008).
 * Questions are never stored; only their {@link ReviewState} is persisted,
 * keyed by the Field's stable id (ADR-0006).
 */

/** What kind of content a Field holds (ADR-0007). */
export type FieldType = "text" | "image" | "audio";

/**
 * A Field's value, interpreted by its Type (ADR-0007):
 *   - text  → a Markdown string
 *   - image → a Media file id
 *   - audio → a Media file id
 * `null` means empty (yields no Question; kept dormant — ADR-0006).
 */
export type FieldValue = string | null;

/**
 * A first-class, identified piece of content within a Topic (ADR-0006). Its
 * identity is {@link id}, not its label: renaming the label keeps everything;
 * changing the value or type may reset Review state (user-confirmed).
 */
export interface Field {
  /** Stable, client-generated id; survives label/value/type edits. */
  id: string;
  label: string;
  type: FieldType;
  /** Markdown string for `text`; Media file id for `image`/`audio`; null = empty. */
  value: FieldValue;
  tags: string[];
  /** Deck ids this Field belongs to (ADR-0008). */
  decks: string[];
}

/**
 * The unit of entry (ADR-0005). A plain-text {@link title} naming the thing the
 * Topic is about, plus zero or more {@link Field}s. The Title is the prompt
 * context for every Question, never an answer.
 */
export interface Topic {
  id: string;
  owner: string;
  title: string;
  fields: Field[];
}

/**
 * A single recall task derived from a Field. Not persisted. Identified for
 * scheduling by the Field's id (ADR-0006). The prompt is the Topic Title plus
 * the Field label; the answer is the Field value (interpreted by type).
 */
export interface Question {
  topicId: string;
  fieldId: string;
  /** The Topic's Title — the prompt context, never the answer. */
  title: string;
  /** The Field label being recalled. */
  fieldLabel: string;
  type: FieldType;
  answer: string; // non-null value (markdown text or media id)
}

/** The 4-button self-grade (CONTEXT.md → Grading). */
export type Grade = "again" | "hard" | "good" | "easy";

/**
 * How a Question is presented and graded for a single review (ADR-0011).
 * Orthogonal to {@link FieldType} (what the content *is*): a `text` Field can be
 * drilled by `recall`, `mcq`, or `text-input`; `image`/`audio` Fields are always
 * `recall` (their value isn't machine-checkable). The mode is chosen per review,
 * never stored — it rotates with the Question's review count (CONTEXT.md →
 * Study mode).
 */
export type StudyMode = "recall" | "mcq" | "text-input";

/**
 * The outcome of an auto-checked answer (`mcq`/`text-input`). Maps to a
 * {@link Grade} for the scheduler: `correct → good`, `wrong → again`.
 */
export type AutoGrade = "correct" | "wrong";

/**
 * Spaced-repetition memory of a single Question, keyed by Field id (ADR-0006).
 * SM-2-lite. Dates are ISO strings to match PocketBase storage.
 */
export interface ReviewState {
  id: string;
  owner: string;
  topic: string; // topic id (kept for scoping / cascade)
  fieldId: string;
  interval: number; // days
  ease: number; // ease factor (>= 1.3)
  reps: number;
  lapses: number;
  due: string; // ISO date
  lastReviewed: string | null;
}

/** One Field shape inside a Template (ADR-0008): label + type + defaults. */
export interface TemplateField {
  label: string;
  type: FieldType;
  tags: string[];
  decks: string[];
}

/**
 * Reusable Topic shape — a cookie cutter, not a live link (ADR-0005, ADR-0008).
 * Carries ordered Field shapes; no Title and no values.
 */
export interface Template {
  id: string;
  owner: string;
  name: string;
  fields: TemplateField[];
}

/** A hand-picked, static, many-to-many collection of Fields (ADR-0008). */
export interface Deck {
  id: string;
  owner: string;
  name: string;
  fields: string[]; // field ids
}

/** The ways to start a study session (CONTEXT.md → Study entry point). */
export type StudyEntryPoint =
  | { kind: "all" }
  | { kind: "topic"; topicId: string }
  | { kind: "deck"; deckId: string }
  | { kind: "tag"; tag: string };
