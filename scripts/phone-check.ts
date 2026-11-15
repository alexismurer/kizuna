// Phone-width layout check (not part of Vitest).
// Usage: start `npm run dev`, then
//   npx tsx scripts/phone-check.ts [outDir] [baseUrl]
// Signs in with DEV_TEST_EMAIL / DEV_TEST_PASSWORD from .env.local (needs
// NEXT_PUBLIC_DEV_LOGIN=true), screenshots key pages at 390x844 and fails if
// any page scrolls horizontally.
import path from 'node:path'
import dotenv from 'dotenv'
import { chromium, type Page } from 'playwright'

dotenv.config({ path: '.env.local', quiet: true })

const outDir = process.argv[2] ?? '.phone-check'
const base = process.argv[3] ?? 'http://localhost:3000'
const WIDTH = 390

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
  await page.getByRole('tab').first().waitFor()

  ok = (await check(page, 'home')) && ok

  await page.getByRole('button', { name: /^Free · / }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  ok = (await check(page, 'reveal')) && ok

  await page.goto(`${base}/collection`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok = (await check(page, 'collection')) && ok

  const recycle = page.getByRole('button', { name: /recycle duplicates/i })
  if (await recycle.isEnabled()) {
    await recycle.click()
    ok = (await check(page, 'collection-recycle-confirm')) && ok
    await page.getByRole('button', { name: /cancel/i }).click()
  }

  await page.goto(`${base}/collection?view=albums`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok = (await check(page, 'albums', false)) && ok // long list: viewport only

  await browser.close()
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
