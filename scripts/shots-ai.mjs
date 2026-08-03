import { chromium } from '/Users/michaelflorianrvltdigital/Claude Helpers/Mission Control/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173/am-i-average/'
const OUT = '/tmp/aia-ai'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

for (const v of [
  { name: 'laptop', width: 1440, height: 900, dsf: 2 },
  { name: 'mobile', width: 390, height: 844, dsf: 2 },
]) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${v.name}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${v.name}] ${e.message}`))

  await page.goto(BASE, { waitUntil: 'networkidle' })

  // Catch the pending state mid flight.
  await page.fill('#q', 'I practice guitar 5 hours a week')
  await page.click('#ask button')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${v.name}-pending.png`, fullPage: true })

  await page.waitForSelector('.card:not(.card--pending)', { timeout: 15000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${v.name}-ai-answer.png`, fullPage: true })

  // A local answer and an AI answer side by side, plus the combined tally.
  await page.fill('#q', 'I drink 6 coffees a day')
  await page.click('#ask button')
  await page.waitForTimeout(2200)
  await page.fill('#q', 'I run 5k in 24:30')
  await page.click('#ask button')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${v.name}-mixed.png`, fullPage: true })

  // Something the stub refuses.
  await page.fill('#q', 'am I average at competitive yodelling')
  await page.click('#ask button')
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${OUT}/${v.name}-refused.png`, fullPage: true })

  await ctx.close()
}

await browser.close()
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors')
