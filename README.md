# Anicards

An anime character card collecting web game for a small private group.
Players join with an invite code, open free, daily and shop booster packs,
and build a collection of characters imported from AniList.

Built with Next.js (App Router), next-intl, Tailwind CSS and Supabase.

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (runs the local Supabase stack)

## Setup

```bash
npm install
npx supabase start
```

Create `.env.local` from `.env.example` and fill in the URL, anon key and
service role key printed by `npx supabase status`. Set
`NEXT_PUBLIC_DEV_LOGIN=true` locally to get the email/password dev login.

```bash
npm run catalog:dev   # reset the DB and import the real 5,000-card catalog
npm run invite        # print a fresh invite code
npm run dev           # http://localhost:3000
```

Sign in, then join with the invite code.

Local test players (dev login, password in `DEV_TEST_PASSWORD`):
`player1@anicards.test` (`DEV_TEST_EMAIL`) and `player2@anicards.test`, the
second one for trying the market with two accounts. Create them with the
invite flow, then set their currency with SQL on the local database only.

## Testing

```bash
npm run db:reset && npm run test:db   # database tests (use the 120-card seed)
npm run test:ui                       # component and unit tests
```

The database tests need the seed catalog, so they replace the real one. Run
`npm run catalog:dev` again afterwards to get the real catalog back (AniList
responses are cached, so it is quick).

Optional phone-width check (needs `npm run build && npm run start` and a test
player in `DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD`):

```bash
npx tsx scripts/phone-check.ts <screenshot-dir>
```

## Before hosted deploy

- [ ] Enable the Discord auth provider and add the site's `/auth/callback`
      URL to the Supabase redirect URLs and the Discord app.
- [ ] Disable email signups and anonymous sign-ins in Supabase Auth.
- [ ] Set `NEXT_PUBLIC_DEV_LOGIN` to `false` (or leave it unset).
- [ ] Send `Cache-Control: no-store` on responses that refresh the session.
- [ ] If `scripts/import-anilist/.cache` predates the "never cache AniList
      errors" fix, clear it once before importing.
