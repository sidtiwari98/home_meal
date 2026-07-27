import { NextResponse } from "next/server";
import { isAllowedDateKey } from "@/lib/date";
import { isPerson } from "@/lib/family";
import { mutateDay, recordFinalized } from "@/lib/store";
import { Day, MealName, SkipReason, isMealName, isSkipReason } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_DISH_LENGTH = 60;
const MAX_SUGGESTIONS_PER_MEAL = 12;

type Action =
  | { type: "suggest"; dish: string }
  | { type: "vote"; id: string }
  | { type: "remove"; id: string }
  | { type: "skip"; target: string }
  | { type: "skipReason"; target: string; reason: SkipReason }
  | { type: "lock"; dish: string }
  | { type: "unlock" };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Could not read that request.");
  }

  const { date, meal, who } = body;

  if (!isAllowedDateKey(date)) return bad("You can only change today or tomorrow.");
  if (!isMealName(meal)) return bad("Unknown meal.");
  if (!isPerson(who)) return bad("Pick who you are first.");

  const action = parseAction(body, who);
  if (!action) return bad("Unknown action.");

  const day = await mutateDay(date, (draft) => apply(draft, meal, who, action));

  if (action.type === "lock") {
    await recordFinalized(meal, action.dish);
  }

  return NextResponse.json({ date, day }, { headers: { "Cache-Control": "no-store" } });
}

function parseAction(body: Record<string, unknown>, who: string): Action | null {
  const type = body.type;
  const id = typeof body.id === "string" ? body.id : "";
  const dish = typeof body.dish === "string" ? body.dish.trim().slice(0, MAX_DISH_LENGTH) : "";

  if (type === "suggest" && dish) return { type: "suggest", dish };
  if (type === "vote" && id) return { type: "vote", id };
  if (type === "remove" && id) return { type: "remove", id };
  // Anyone can mark anyone out — in practice one person updates for the whole house.
  if (type === "skip") return { type: "skip", target: isPerson(body.target) ? body.target : who };
  if (type === "skipReason" && isPerson(body.target) && isSkipReason(body.reason)) {
    return { type: "skipReason", target: body.target, reason: body.reason };
  }
  if (type === "lock" && dish) return { type: "lock", dish };
  if (type === "unlock") return { type: "unlock" };
  return null;
}

function apply(day: Day, mealName: MealName, who: string, action: Action): void {
  const meal = day[mealName];

  switch (action.type) {
    case "suggest": {
      const already = meal.suggestions.find(
        (s) => s.dish.toLowerCase() === action.dish.toLowerCase(),
      );
      // Suggesting something that's already up there is just a vote for it.
      if (already) {
        if (!already.votes.includes(who)) already.votes.push(who);
        return;
      }
      if (meal.suggestions.length >= MAX_SUGGESTIONS_PER_MEAL) return;
      meal.suggestions.push({
        id: Math.random().toString(36).slice(2, 10),
        dish: action.dish,
        by: who,
        votes: [who],
        at: Date.now(),
      });
      return;
    }

    case "vote": {
      const target = meal.suggestions.find((s) => s.id === action.id);
      if (!target) return;
      const at = target.votes.indexOf(who);
      if (at === -1) target.votes.push(who);
      else target.votes.splice(at, 1);
      return;
    }

    case "remove": {
      // You can only take back your own suggestion, and only while it stands alone.
      const target = meal.suggestions.find((s) => s.id === action.id);
      if (!target || target.by !== who || target.votes.length > 1) return;
      meal.suggestions = meal.suggestions.filter((s) => s.id !== action.id);
      return;
    }

    case "skip": {
      const at = meal.skipping.findIndex((s) => s.name === action.target);
      if (at === -1) meal.skipping.push({ name: action.target, reason: "Skipping" });
      else meal.skipping.splice(at, 1);
      return;
    }

    case "skipReason": {
      const entry = meal.skipping.find((s) => s.name === action.target);
      if (entry) entry.reason = action.reason;
      return;
    }

    case "lock":
      meal.locked = action.dish;
      return;

    case "unlock":
      meal.locked = null;
      return;
  }
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
