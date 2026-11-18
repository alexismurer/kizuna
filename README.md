# Anicards

A private web game for a small group of friends: open booster packs, collect
anime characters, complete series, and trade cards with each other.

Built with Next.js (App Router), TypeScript, Tailwind CSS, next-intl and
Supabase (Postgres, Auth, Realtime, pg_cron). Character data comes from the
public AniList API.

---

## What you can do

**Boosters**
- 5-card boosters with a floor per slot (the last slot is Rare or better).
- Free boosters refill by 1 every 10 minutes, up to 10.
- Themed boosters (Shōnen, Seinen, Isekai, Sports, …), a free themed daily
  pack, and shop boosters bought with currency (Hall of Fame, Chest, …).
- Pity (a Mythic within 250 boosters), a golden booster every 10th (Epic or
  better guaranteed) and a rare divine booster.
- A full-screen opening: tear the pack or tap and hold, then reveal the
  cards one by one from the least to the most rare, with rarity glows,
  sound and a summary you can share as an image. Open ×1, ×5 or ×10.

**Collection**
- Every series is an album with a completion bar and a per-rarity
  breakdown. Card detail pages, duplicate counts, a wishlist.
- Recycle duplicates into currency (you always keep one copy).

**Progression**
- A 7-day login streak (day 7 makes your next booster golden).
- First-steps onboarding, 3 daily and 3 weekly missions, ~30 achievements.
- Reward boosters (a bonus booster, a Chest) granted by missions.

**Market**
- Fixed-price listings, auctions (1 h / 6 h / 24 h, last-minute bids extend
  the end), buy orders and direct trade offers between players.
- Cards and currency in a listing, bid, order or offer are held in escrow
  until it resolves. 5 % fee on sales.
- Live updates and in-app notifications (sold, outbid, auction won, trade
  received…). Each card shows an estimated value from recent sales.

**In progress:** market chat, friends, direct messages and public profiles.
See [Roadmap](#roadmap).

---

## How it is built

- **Every game action is a Postgres function** called through Supabase RPC.
  Each one runs in a single transaction, checks ownership and balances, uses
  server-side randomness and writes a row to an append-only `ledger` for
  every currency or card movement. The browser can read what it is allowed
  to see but never writes game tables directly (Row Level Security).
- **Realtime** pushes market changes and notifications to open pages.
- **pg_cron** settles ended auctions and expires old trade offers every
  minute.
- **Character data is swappable**: only `scripts/import-anilist/` knows about
  AniList. The catalog is frozen once players own cards (imports only add).
- **Every interface string** goes through `messages/en.json`, ready for more
  languages.

```
src/app/[locale]/(main)/        pages with the top bar (home, collection, market, missions, card)
src/app/[locale]/(fullscreen)/  the booster opening page
src/components/                 UI by area (home, opening, market, missions, mobile, card)
src/lib/                        pure helpers (odds, gestures, reveal, market fees…) and Supabase clients
supabase/migrations/            schema and every game function, in order
scripts/                        catalog import, invite codes, phone-width check
tests/db/                       database tests against the local Supabase
tests/ui/                       component and unit tests
```

---

## Getting started

**Prerequisites:** Node.js 20+ and Docker Desktop (for the local Supabase
stack).

```bash
npm install
npx supabase start
```

Copy `.env.example` to `.env.local` and fill in the URL, anon key and service
role key printed by `npx supabase status`. Set `NEXT_PUBLIC_DEV_LOGIN=true`
to get the email/password login used in development.

```bash
npm run catalog:dev   # reset the database and import the 5,000-card catalog
npm run invite        # print a fresh invite code
npm run dev           # http://localhost:3000
```

Sign in, then join with the invite code and pick a username.

**Local test players** (dev login, password in `DEV_TEST_PASSWORD`):
`player1@anicards.test` (also `DEV_TEST_EMAIL`) and `player2@anicards.test`
for trying the market with two accounts. Create them with the invite flow,
then set their currency with SQL on the local database only.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build and server |
| `npm run catalog:dev` | Reset the database and import the real catalog |
| `npm run import` | Import or extend the catalog (adds only, never changes existing cards) |
| `npm run invite` | Create an invite code |
| `npm run db:reset` | Reset the database to the 120-card test seed |
| `npm run test:db` | Database tests |
| `npm run test:ui` | Component and unit tests |
| `npm run lint` | ESLint |

---

## Testing

```bash
npm run db:reset && npm run test:db   # database tests (need the 120-card seed)
npm run test:ui                       # component and unit tests
npx tsc --noEmit                      # type check
```

The database tests replace the real catalog with the seed. Run
`npm run catalog:dev` afterwards to get it back (AniList responses are
cached, so it is quick).

Phone-width check (needs `npm run build && npm run start` and a test player
in `DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD`): it opens every page at 390 px,
fails if any page scrolls sideways, and saves screenshots.

```bash
npx tsx scripts/phone-check.ts <screenshot-dir>
```

---

## Roadmap

1. Core: catalog, boosters, collection, recycling — **done**
2. Look and feel: opening page, card design, home, mobile — **done**
3. Progression: login streak, missions, achievements, wishlist — **done**
4. Market: listings, auctions, buy orders, trades, notifications — **done**
5. Social: market chat, friends, direct messages, public profiles — **in progress**
6. Launch: admin page, seasonal boosters, Discord login, deploy, installable app

### Before a hosted deploy

Follow the step-by-step runbook in [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Credits

Character names and images come from [AniList](https://anilist.co) and are
used for a private, non-commercial game. Images are linked, not re-hosted.
