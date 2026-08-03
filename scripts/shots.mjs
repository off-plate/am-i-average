import { chromium } from '/Users/michaelflorianrvltdigital/Claude Helpers/Mission Control/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173/am-i-average/'
const OUT = process.env.OUT ?? '/tmp/aia-shots'
mkdirSync(OUT, { recursive: true })

const VIEWS = [
  { name: 'desktop', width: 2560, height: 1440, dsf: 1 },
  { name: 'laptop', width: 1440, height: 900, dsf: 2 },
  { name: 'mobile', width: 390, height: 844, dsf: 2 },
]

const browser = await chromium.launch()
const errors = []

for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dsf,
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${v.name}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${v.name}] ${e.message}`))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${v.name}-1-empty.png`, fullPage: true })

  await page.fill('#q', 'I run 1 km in 4 minutes')
  await page.click('#ask button')
  await page.waitForTimeout(1100)
  await page.screenshot({ path: `${OUT}/${v.name}-2-answer.png`, fullPage: true })

  for (const q of ['I am 183 cm tall, Czech guy', 'I make $1000 a month in the US', 'I train basketball 2 hours a week']) {
    await page.fill('#q', q)
    await page.click('#ask button')
    await page.waitForTimeout(950)
  }
  await page.screenshot({ path: `${OUT}/${v.name}-3-stack.png`, fullPage: true })

  await page.fill('#q', 'am I average at competitive yodelling')
  await page.click('#ask button')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${v.name}-4-miss.png`, fullPage: true })

  await ctx.close()
}

// Dark scheme, one pass.
const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const dp = await dark.newPage()
await dp.goto(BASE + '?q=I%20bench%20100kg%20at%2085kg%20bodyweight', { waitUntil: 'networkidle' })
await dp.waitForTimeout(1100)
await dp.screenshot({ path: `${OUT}/dark-answer.png`, fullPage: true })
await dark.close()

await browser.close()
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors')
console.log('shots in ' + OUT)
