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
 * Most votes wins. Ties go to whoever suggested it first — the earlier idea
 * has usually already been half-agreed to out loud.
 */
export function winnerOf(meal: Meal): Suggestion | null {
  if (!meal.suggestions.length) return null;
  return [...meal.suggestions].sort(
    (a, b) => b.votes.length - a.votes.length || a.at - b.at,
  )[0];
}
