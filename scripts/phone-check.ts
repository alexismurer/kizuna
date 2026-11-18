// Phone-width layout check (not part of Vitest).
// Usage: `npm run build && npm run start` (or `npm run dev`), then
//   npx tsx scripts/phone-check.ts [outDir] [baseUrl]
// Signs in with DEV_TEST_EMAIL / DEV_TEST_PASSWORD from .env.local (needs
// NEXT_PUBLIC_DEV_LOGIN=true), screenshots key pages at 390x844 and fails if
// any page scrolls horizontally. Opens one Mix booster (free stock first,
// then currency). Also each /market tab, the market chat sheet, the social
// pages (profile, friends, a DM thread; needs a friend named player2) and the
// notifications sheet, /invite-friends, and (signed out) the join landing for
// player1's referral link (reads it with the service-role key; local DB only).
import path from 'node:path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

dotenv.config({ path: '.env.local', quiet: true })

const outDir = process.argv[2] ?? '.phone-check'
const base = process.argv[3] ?? 'http://localhost:3000'
const WIDTH = 390
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function check(page: Page, name: string, fullPage = true) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const file = path.resolve(outDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage })
  const ok = scrollWidth <= WIDTH
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: scrollWidth=${scrollWidth} -> ${file}`)
  return ok
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 } })
  let ok = true

  await page.goto(`${base}/login`)
  await page.fill('input[type=email]', process.env.DEV_TEST_EMAIL!)
  await page.fill('input[type=password]', process.env.DEV_TEST_PASSWORD!)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 })
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.waitFor({ timeout: 30_000 })
  await page.getByRole('heading', { name: 'Big pulls' }).waitFor({ timeout: 30_000 })

  ok = (await check(page, 'home')) && ok

  await nav.getByRole('button', { name: 'Open' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400) // slide-up
  await page.getByRole('dialog').getByRole('tablist').waitFor({ timeout: 30_000 }) // packs load on open
  ok = (await check(page, 'home-booster-sheet', false)) && ok
  await page.keyboard.press('Escape')

  await nav.getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400) // slide-up
  ok = (await check(page, 'home-more-sheet', false)) && ok
  await page.keyboard.press('Escape')

  await page.goto(`${base}/collection`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok = (await check(page, 'collection')) && ok

  const recycle = page.getByRole('button', { name: /recycle duplicates/i })
  if (await recycle.isEnabled()) {
    await recycle.click()
    ok = (await check(page, 'collection-recycle-confirm')) && ok
    await page.getByRole('button', { name: /cancel/i }).click()
  }

  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400) // slide-up
  ok = (await check(page, 'collection-filters', false)) && ok
  await page.keyboard.press('Escape')

  await page.goto(`${base}/collection?view=albums`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok = (await check(page, 'albums', false)) && ok // long list: viewport only

  await page.goto(`${base}/missions`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok = (await check(page, 'missions')) && ok

  for (const tab of ['buy', 'sell', 'auctions', 'trades', 'activity']) {
    await page.goto(`${base}/market?tab=${tab}`)
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.waitForTimeout(800) // tab data
    ok = (await check(page, `market-${tab}`)) && ok
  }

  // chat: the sheet opens from the floating button below lg
  await page.goto(`${base}/market?tab=buy`)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(1200) // slide-up + history
  ok = (await check(page, 'market-chat-sheet', false)) && ok
  await page.keyboard.press('Escape')

  // social pages
  for (const [name, route] of [
    ['profile', '/profile/player1'],
    ['friends', '/friends'],
    ['friends-requests', '/friends?tab=requests'],
    ['friends-find', '/friends?tab=find'],
    ['dm', '/messages/player2'],
    ['invite-friends', '/invite-friends'],
  ]) {
    await page.goto(`${base}${route}`)
    await page.waitForTimeout(1500) // data
    ok = (await check(page, name)) && ok
  }

  await page.getByRole('button', { name: /^Notifications/ }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400) // slide-up
  ok = (await check(page, 'market-notifications', false)) && ok
  await page.keyboard.press('Escape')

  // opening page: stage, mid-reveal, summary
  await page.goto(`${base}/open/mix`)
  const open = page.getByRole('button', { name: /^(Free · |Reward · |Open · |\d+ free \+ )/ })
  await open.waitFor({ timeout: 30_000 })
  ok = (await check(page, 'open-stage')) && ok

  await page.getByRole('button', { name: /Change booster/ }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400) // slide-up
  await page.getByRole('dialog').getByRole('tablist').waitFor({ timeout: 30_000 }) // packs load on open
  ok = (await check(page, 'open-booster-sheet', false)) && ok
  await page.keyboard.press('Escape')

  await open.click()
  const confirm = page.getByRole('alertdialog')
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirm.getByRole('button', { name: 'Confirm' }).click()
  }
  await page.getByRole('button', { name: 'Flip the card' }).waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Flip the card' }).click()
  await page.waitForTimeout(1200)
  ok = (await check(page, 'open-reveal')) && ok

  await page.getByRole('button', { name: 'Reveal all' }).click()
  await page.getByText('Best card').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)
  ok = (await check(page, 'open-summary')) && ok

  // signed-out pass: the join landing for player1's personal link
  const { data: inviter } = await admin.from('players').select('referral_code').eq('username', 'player1').single()
  const anon = await browser.newPage({ viewport: { width: WIDTH, height: 844 } })
  await anon.goto(`${base}/join/${inviter!.referral_code}`)
  await anon.getByRole('heading', { level: 1 }).waitFor({ timeout: 30_000 })
  await anon.waitForTimeout(800)
  ok = (await check(anon, 'join-landing')) && ok

  await browser.close()
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
