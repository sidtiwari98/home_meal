export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type MealName = (typeof MEALS)[number];

export function isMealName(value: unknown): value is MealName {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

export interface Suggestion {
  id: string;
  dish: string;
  by: string;
  /** Names of everyone who has +1'd. The person who suggests it votes for it automatically. */
  votes: string[];
  at: number;
}

/** Why someone marked out isn't eating at home — never blank, defaults to "Skipping". */
export const SKIP_REASONS = ["Skipping", "Own meal", "Ordering", "Eating out"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export function isSkipReason(value: unknown): value is SkipReason {
  return typeof value === "string" && (SKIP_REASONS as readonly string[]).includes(value);
}

export interface Skip {
  name: string;
  reason: SkipReason;
}

export interface Meal {
  suggestions: Suggestion[];
  /** People not eating this meal at home, and why. */
  skipping: Skip[];
  /** Set once someone decides. Overrides the vote count. */
  locked: string | null;
}

export type Day = Record<MealName, Meal>;

export function emptyMeal(): Meal {
  return { suggestions: [], skipping: [], locked: null };
}

export function emptyDay(): Day {
  return { breakfast: emptyMeal(), lunch: emptyMeal(), dinner: emptyMeal() };
}

/** Old data was just a name; new data is { name, reason }. Reason is never blank. */
function normalizeSkip(raw: unknown): Skip | null {
  if (typeof raw === "string") return { name: raw, reason: "Skipping" };
  if (raw && typeof raw === "object" && "name" in raw) {
    const { name, reason } = raw as { name: unknown; reason: unknown };
    if (typeof name !== "string") return null;
    return { name, reason: isSkipReason(reason) ? reason : "Skipping" };
  }
  return null;
}

/** Redis gives back whatever we last wrote. Repair anything missing so the UI never crashes. */
export function normalizeDay(raw: unknown): Day {
  const source = (raw ?? {}) as Partial<Record<MealName, Partial<Meal>>>;
  const day = emptyDay();
  for (const meal of MEALS) {
    const incoming = source[meal];
    if (!incoming) continue;
    day[meal] = {
      suggestions: Array.isArray(incoming.suggestions)
        ? incoming.suggestions.filter((s): s is Suggestion => !!s && typeof s.dish === "string")
        : [],
      skipping: Array.isArray(incoming.skipping)
        ? incoming.skipping.map(normalizeSkip).filter((s): s is Skip => !!s)
        : [],
      locked: typeof incoming.locked === "string" ? incoming.locked : null,
    };
  }
  return day;
}

/**
 * Most votes wins. If several dishes are tied for the most votes, they're
 * all winning at once — earliest suggested first.
 */
export function winnersOf(meal: Meal): Suggestion[] {
  if (!meal.suggestions.length) return [];
  const sorted = [...meal.suggestions].sort(
    (a, b) => b.votes.length - a.votes.length || a.at - b.at,
  );
  const topVotes = sorted[0].votes.length;
  return sorted.filter((s) => s.votes.length === topVotes);
}

/** What the meal has actually settled on: the lock, or a comma-joined tie. */
export function decidedLabel(meal: Meal): string | null {
  if (meal.locked) return meal.locked;
  const winners = winnersOf(meal);
  return winners.length ? winners.map((w) => w.dish).join(", ") : null;
}
