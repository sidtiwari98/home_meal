import { redis } from "./redis";
import { Day, MEALS, MealName, decidedLabel, normalizeDay } from "./types";

/**
 * The whole day — all three meals — lives in a single JSON value.
 *
 * Two reasons:
 *  1. Reading the screen costs exactly one Redis command, which is what keeps
 *     five people polling all day comfortably inside a free tier.
 *  2. The TTL is the 7-day retention rule. Nothing to clean up, no cron job.
 *     We keep 8 days so "yesterday" is still intact at 11:59 PM tonight.
 */
const DAY_TTL_SECONDS = 60 * 60 * 24 * 8;

/** Finalized dishes per meal, so "what did we make last time" is one tap away. */
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 400;
const HISTORY_MAX = 20;

const dayKey = (date: string) => `day:${date}`;
const lockKey = (date: string) => `lock:${date}`;
const historyKey = (meal: MealName) => `history:${meal}`;

export async function getDay(date: string): Promise<Day> {
  return normalizeDay(await redis.get(dayKey(date)));
}

/**
 * Read, change, write — with a short Redis lock so two people voting at the
 * same instant can't overwrite each other.
 *
 * If the lock can't be taken in ~1 second we go ahead anyway. For a household
 * of five, a dropped vote is a smaller failure than a button that does nothing.
 */
export async function mutateDay(date: string, change: (day: Day) => void): Promise<Day> {
  const acquired = await acquireLock(date);
  try {
    const day = await getDay(date);
    change(day);
    await redis.set(dayKey(date), day, { ex: DAY_TTL_SECONDS });
    return day;
  } finally {
    if (acquired) await redis.del(lockKey(date));
  }
}

/**
 * Once a day is no longer today or tomorrow, nobody can vote on it any more —
 * so whatever was winning at that point is the de facto decision. Called
 * lazily (see /api/day) for yesterday's date whenever anyone opens the app,
 * since there's no cron to do it exactly at midnight.
 */
export async function finalizeExpiredDay(date: string): Promise<void> {
  const settled: { meal: MealName; dish: string }[] = [];
  await mutateDay(date, (day) => {
    for (const meal of MEALS) {
      const m = day[meal];
      if (m.locked) continue;
      const label = decidedLabel(m);
      if (label) {
        m.locked = label;
        settled.push({ meal, dish: label });
      }
    }
  });
  for (const { meal, dish } of settled) await recordFinalized(meal, dish);
}

async function acquireLock(date: string): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const got = await redis.set(lockKey(date), "1", { nx: true, px: 3000 });
    if (got === "OK") return true;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return false;
}

/** Log a dish as an actual decision for that meal, so it resurfaces next time. */
export async function recordFinalized(meal: MealName, dish: string, at = Date.now()): Promise<void> {
  const key = historyKey(meal);
  await redis.zadd(key, { score: at, member: dish });
  await redis.zremrangebyrank(key, 0, -HISTORY_MAX - 1);
  await redis.expire(key, HISTORY_TTL_SECONDS);
}

/** Past winners for one meal, most recent decision first. */
export async function pastFinalized(meal: MealName, limit = 10): Promise<string[]> {
  const rows = await redis.zrange<string[]>(historyKey(meal), 0, limit - 1, { rev: true });
  return Array.isArray(rows) ? rows.map(String) : [];
}
