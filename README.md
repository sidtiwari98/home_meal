# Kitchen

A one-screen web app for settling what to cook at home. Anyone suggests a dish,
everyone else taps `+1`, the top dish wins, and whoever's cooking can lock it in.
People who won't be eating tap their own name so the headcount stays honest.

Runs free on Vercel + Upstash. Keeps 7 days of history and forgets the rest by itself.

---

## Setting it up (about 10 minutes)

### 1. Put your family in the app

Open `src/lib/family.ts` and replace the five names. Keep them short — they sit on
small buttons.

```ts
export const FAMILY = ["Sid", "Papa", "Mummy", "Bhai", "Dadi"] as const;
```

### 2. Create the database

1. Sign up at [console.upstash.com](https://console.upstash.com) (free, no card).
2. Create a Redis database. Pick the region closest to India — Mumbai or Singapore.
3. From the database page, copy **UPSTASH_REDIS_REST_URL** and
   **UPSTASH_REDIS_REST_TOKEN**.

### 3. Run it on your laptop first

```bash
cp .env.example .env.local   # then paste the two values in
npm install
npm run dev
```

Open http://localhost:3000 on your phone using your laptop's local IP to see how
it actually feels in the hand.

### 4. Put it online

```bash
git init && git add -A && git commit -m "kitchen"
# push to a new private GitHub repo, then:
```

1. On [vercel.com](https://vercel.com), import the repo. Framework detection handles
   the rest — no build settings to change.
2. Under **Environment Variables**, add the same two Upstash values.
3. Deploy. You get a `something.vercel.app` URL.

### 5. Get it onto everyone's phone

Send the link on WhatsApp. On each phone open it once and use **Add to Home Screen**
(Chrome menu on Android, Share sheet on iPhone). It then opens like a normal app with
its own icon — which is the difference between your parents using this and forgetting
it exists.

Each phone asks "Who's this?" once and remembers.

---

## How it works

**Storage.** One Redis key per day (`day:2026-07-27`) holding all three meals as JSON,
written with an 8-day expiry. That expiry *is* your 7-day retention rule — old days
delete themselves, so there's no cleanup job and nothing that can silently stop running.

Reading the whole screen costs one Redis command, which is what keeps five people
polling all day inside the free tier. Writes take a short lock so two simultaneous
votes can't overwrite each other.

**Dates.** Everything is computed in `Asia/Kolkata`, never in the server's timezone.
Vercel runs in UTC; without this the day would roll over at 5:30 AM IST and you'd
lose the dinner you voted on the night before.

**Refreshing.** The screen re-checks every 15 seconds while the tab is open, and
immediately when you switch back to it. It stops polling after 10 idle minutes so
five forgotten tabs don't burn through the free tier overnight.

**No accounts.** Anyone with the link can vote. That's the right trade for a family
of five. If you ever want a gate, the smallest version is one shared passcode
checked in `src/app/api/action/route.ts`.

## Things you might want next

- **Nudge at 6 PM.** A Vercel cron hitting a route that posts to a WhatsApp group
  via a service like Twilio, if dinner has no votes yet.
- **"We had this on Tuesday."** The last 7 days are already in Redis — reading
  `day:*` keys would let you flag repeats.
- **Portion notes.** A free-text line per meal for "make it less spicy".
