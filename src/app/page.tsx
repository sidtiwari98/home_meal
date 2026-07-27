"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FAMILY, Person } from "@/lib/family";
import { humanDate, istDateKey, istHour } from "@/lib/date";
import { Day, MEALS, MealName, Suggestion, emptyDay, normalizeDay, winnerOf } from "@/lib/types";

const STORAGE_KEY = "kitchen.who";
const POLL_MS = 15_000;
const IDLE_MS = 10 * 60_000;

const MEAL_LABEL: Record<MealName, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/**
 * At 10 PM nobody is voting on today's dinner any more — they're deciding
 * tomorrow's breakfast. Open on whatever the family is most likely there for.
 */
function defaultView(): { offset: 0 | 1; meal: MealName } {
  const hour = istHour();
  if (hour >= 21) return { offset: 1, meal: "breakfast" };
  if (hour < 10) return { offset: 0, meal: "breakfast" };
  if (hour < 16) return { offset: 0, meal: "lunch" };
  return { offset: 0, meal: "dinner" };
}

export default function Page() {
  const [who, setWho] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(defaultView);
  const [day, setDay] = useState<Day>(emptyDay);
  const [history, setHistory] = useState<Record<MealName, string[]>>({
    breakfast: [],
    lunch: [],
    dinner: [],
  });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastTouch = useRef(Date.now());

  const date = istDateKey(view.offset);
  const meal = day[view.meal];

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (FAMILY as readonly string[]).includes(saved)) setWho(saved as Person);
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/day?date=${date}`, { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json();
      setDay(normalizeDay(payload.day));
    } catch {
      // Offline or flaky signal — keep showing the last good board.
    }
  }, [date]);

  useEffect(() => {
    if (!who) return;
    void load();
  }, [who, load]);

  useEffect(() => {
    if (!who) return;
    void fetch("/api/history")
      .then((res) => res.json())
      .then((payload) => payload.history && setHistory(payload.history))
      .catch(() => undefined);
  }, [who]);

  // Poll only while the tab is open and someone is actually around. Five idle
  // phones hammering the free tier all night would be the one way to break it.
  useEffect(() => {
    if (!who) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastTouch.current > IDLE_MS) return;
      void load();
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastTouch.current = Date.now();
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [who, load]);

  const send = useCallback(
    async (payload: Record<string, unknown>, optimistic?: (draft: Day) => void) => {
      if (!who) return;
      lastTouch.current = Date.now();

      if (optimistic) {
        setDay((current) => {
          const copy = structuredClone(current);
          optimistic(copy);
          return copy;
        });
      }

      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, date, meal: view.meal, who }),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error ?? "That didn't save. Try again.");
          void load();
          return;
        }
        setDay(normalizeDay(result.day));
      } catch {
        setError("No connection. That didn't save.");
        void load();
      }
    },
    [who, date, view.meal, load],
  );

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const leader = useMemo(() => winnerOf(meal), [meal]);
  const decided = meal.locked ?? leader?.dish ?? null;
  const headcount = FAMILY.length - meal.skipping.length;

  const ordered = useMemo(
    () =>
      [...meal.suggestions].sort(
        (a, b) => b.votes.length - a.votes.length || a.at - b.at,
      ),
    [meal.suggestions],
  );

  const pastWinners = useMemo(
    () =>
      history[view.meal].filter(
        (d) => !meal.suggestions.some((s) => s.dish.toLowerCase() === d.toLowerCase()),
      ),
    [history, view.meal, meal.suggestions],
  );

  function addDish(dish: string) {
    const clean = dish.trim();
    if (!clean || !who) return;
    setDraft("");
    void send({ type: "suggest", dish: clean }, (copy) => {
      const target = copy[view.meal];
      const existing = target.suggestions.find(
        (s) => s.dish.toLowerCase() === clean.toLowerCase(),
      );
      if (existing) {
        if (!existing.votes.includes(who)) existing.votes.push(who);
        return;
      }
      target.suggestions.push({
        id: `pending-${Date.now()}`,
        dish: clean,
        by: who,
        votes: [who],
        at: Date.now(),
      });
    });
  }

  if (!ready) return null;

  if (!who) {
    return (
      <main className="gate">
        <h1 className="gate-title">Who&rsquo;s this?</h1>
        {FAMILY.map((name) => (
          <button
            key={name}
            className="gate-option"
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, name);
              setWho(name);
            }}
          >
            {name}
          </button>
        ))}
        <p className="gate-note">This phone will remember. No password needed.</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="daypick">
          {([0, 1] as const).map((offset) => (
            <button
              key={offset}
              className="daypick-btn"
              data-on={view.offset === offset}
              onClick={() => setView((v) => ({ ...v, offset }))}
            >
              {offset === 0 ? "Today" : "Tomorrow"}
            </button>
          ))}
        </div>
        <span className="whoami">{who}</span>
      </div>

      <section className="verdict" data-locked={!!meal.locked}>
        <div className="verdict-eyebrow">
          {meal.locked ? "Final" : "Winning"} &middot; {MEAL_LABEL[view.meal]} &middot;{" "}
          {humanDate(date)}
        </div>
        <div className="verdict-dish" data-empty={!decided}>
          {decided ?? "Nothing suggested yet"}
        </div>
        <div className="verdict-count">
          {headcount === 0
            ? "Nobody eating at home"
            : `Cooking for ${headcount}${
                meal.skipping.length ? ` · ${meal.skipping.join(", ")} out` : ""
              }`}
        </div>

        {decided && (
          <div className="verdict-actions">
            {meal.locked ? (
              <button
                className="verdict-btn"
                onClick={() => void send({ type: "unlock" }, (c) => {
                  c[view.meal].locked = null;
                })}
              >
                Reopen
              </button>
            ) : (
              <button
                className="verdict-btn"
                data-primary="true"
                onClick={() => void send({ type: "lock", dish: decided }, (c) => {
                  c[view.meal].locked = decided;
                })}
              >
                Lock it in
              </button>
            )}
            <button
              className="verdict-btn"
              onClick={() => {
                const text = `${MEAL_LABEL[view.meal]}: ${decided} · cooking for ${headcount}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
              }}
            >
              Tell everyone
            </button>
          </div>
        )}
      </section>

      <nav className="tabs">
        {MEALS.map((name) => (
          <button
            key={name}
            className="tab"
            data-on={view.meal === name}
            onClick={() => setView((v) => ({ ...v, meal: name }))}
          >
            {MEAL_LABEL[name]}
          </button>
        ))}
      </nav>

      {ordered.length === 0 ? (
        <p className="empty">Nothing on the list. Type what you feel like eating.</p>
      ) : (
        <ul className="list">
          {ordered.map((item) => (
            <DishRow
              key={item.id}
              item={item}
              me={who}
              leading={!meal.locked && item.id === leader?.id}
              onVote={() =>
                void send({ type: "vote", id: item.id }, (c) => {
                  const target = c[view.meal].suggestions.find((s) => s.id === item.id);
                  if (!target) return;
                  const at = target.votes.indexOf(who);
                  if (at === -1) target.votes.push(who);
                  else target.votes.splice(at, 1);
                })
              }
              onRemove={() =>
                void send({ type: "remove", id: item.id }, (c) => {
                  c[view.meal].suggestions = c[view.meal].suggestions.filter(
                    (s) => s.id !== item.id,
                  );
                })
              }
            />
          ))}
        </ul>
      )}

      <section className="eating">
        <h2 className="eating-title">Eating at home</h2>
        <div className="people">
          {FAMILY.map((name) => {
            const out = meal.skipping.includes(name);
            return (
              <button
                key={name}
                className="person"
                data-out={out}
                onClick={() =>
                  void send({ type: "skip", target: name }, (c) => {
                    const list = c[view.meal].skipping;
                    const at = list.indexOf(name);
                    if (at === -1) list.push(name);
                    else list.splice(at, 1);
                  })
                }
              >
                {name}
              </button>
            );
          })}
        </div>
        <p className="stale">Tap a name to mark them out for this meal.</p>
      </section>

      {error && <div className="toast">{error}</div>}

      <div className="composer">
        <div className="composer-inner">
          {pastWinners.length > 0 && (
            <>
              <div className="chips-label">
                Made before for {MEAL_LABEL[view.meal].toLowerCase()}
              </div>
              <div className="chips">
                {pastWinners.slice(0, 8).map((dish) => (
                  <button key={dish} className="chip" onClick={() => addDish(dish)}>
                    {dish}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="entry">
            <input
              className="entry-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addDish(draft);
              }}
              placeholder={`What for ${MEAL_LABEL[view.meal].toLowerCase()}?`}
              enterKeyHint="send"
              maxLength={60}
              aria-label="Suggest a dish"
            />
            <button
              className="entry-send"
              disabled={!draft.trim()}
              onClick={() => addDish(draft)}
              aria-label="Add this dish"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function DishRow({
  item,
  me,
  leading,
  onVote,
  onRemove,
}: {
  item: Suggestion;
  me: string;
  leading: boolean;
  onVote: () => void;
  onRemove: () => void;
}) {
  const mine = item.votes.includes(me);
  const canRemove = item.by === me && item.votes.length <= 1;

  return (
    <li className="dish" data-leading={leading}>
      <div className="dish-main">
        <div className="dish-name">{item.dish}</div>
        <div className="dish-meta">
          {item.votes.length ? item.votes.join(", ") : `suggested by ${item.by}`}
        </div>
      </div>
      {canRemove && (
        <button className="undo" onClick={onRemove} aria-label={`Remove ${item.dish}`}>
          &times;
        </button>
      )}
      <button
        className="vote"
        data-mine={mine}
        onClick={onVote}
        aria-pressed={mine}
        aria-label={`${mine ? "Remove your vote for" : "Vote for"} ${item.dish}`}
      >
        <span aria-hidden="true">+</span>
        {item.votes.length}
      </button>
    </li>
  );
}
