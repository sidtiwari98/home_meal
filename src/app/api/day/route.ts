import { NextResponse } from "next/server";
import { finalizeExpiredDay, getDay } from "@/lib/store";
import { isAllowedDateKey, istDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("date");
  const date = isAllowedDateKey(requested) ? requested : istDateKey(0);

  // Lazy end-of-day settlement: whoever opens the app for "today" also
  // finalizes yesterday's board, since nothing else ever visits it again.
  if (date === istDateKey(0)) {
    void finalizeExpiredDay(istDateKey(-1)).catch(() => undefined);
  }

  const day = await getDay(date);
  return NextResponse.json(
    { date, day },
    { headers: { "Cache-Control": "no-store" } },
  );
}
