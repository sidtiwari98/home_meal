/**
 * The only file you need to edit to make this yours.
 *
 * Keep names short — they show up on small buttons.
 * Order here is the order they appear on screen.
 */
export const FAMILY = ["Sid", "DT", "JT", "Tanya", "Meethi"] as const;

export type Person = (typeof FAMILY)[number];

export function isPerson(value: unknown): value is Person {
  return typeof value === "string" && (FAMILY as readonly string[]).includes(value);
}

/** Initials shown inside the vote pills. */
export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
