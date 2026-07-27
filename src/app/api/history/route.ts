import { NextResponse } from "next/server";
import { pastFinalized } from "@/lib/store";
import { MEALS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await Promise.all(MEALS.map((meal) => pastFinalized(meal)));
  const history = Object.fromEntries(MEALS.map((meal, i) => [meal, results[i]]));
  return NextResponse.json({ history }, { headers: { "Cache-Control": "no-store" } });
}
