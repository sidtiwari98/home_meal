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

export interface Meal {
  suggestions: Suggestion[];
  /** Names of people not eating this meal at home. */
  skipping: string[];
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
      skipping: Array.isArray(incoming.skipping) ? incoming.skipping : [],
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
