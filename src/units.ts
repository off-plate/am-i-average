// Pulling numbers with units out of an English sentence, without a model.
//
// The rule: find the most specific patterns first, mark the characters they
// consumed, and never let a later pattern re-use them. That is what stops
// "I'm 32 and I run 5k in 22 minutes" turning the 32 into a run time.

export type UnitKind = 'length' | 'mass' | 'money' | 'duration' | 'count' | 'percent'
export type Period = 'day' | 'week' | 'month' | 'year'
export type Currency = 'usd' | 'eur' | 'czk' | 'gbp'

export interface Quantity {
  kind: UnitKind
  /** Canonical: length=cm, mass=kg, duration=seconds, money=currency units, count/percent=as written. */
  value: number
  raw: string
  start: number
  end: number
  currency?: Currency
  /** Set when the sentence says "a week", "per day", and so on. */
  period?: Period
  /** True when the number arrived bare, with no unit attached to it. */
  bare?: boolean
  /**
   * Second reading of an ambiguous pattern. "3:45" is 3m45s for a 5K and
   * 3h45m for a marathon; the metric decides which one is in range.
   */
  alt?: number
  /** The unit word that was matched, for echoing back. */
  unit?: string
}

/** Static, and deliberately so: an offline toy should not depend on an FX API. */
export const FX: Record<Currency, number> = { usd: 1, eur: 1.08, gbp: 1.27, czk: 0.043 }
export const FX_NOTE = 'converted at a fixed rate, not a live one'

const NUM = String.raw`(\d{1,3}(?:[  ,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)`

function num(s: string): number {
  let t = s.replace(/[  ]/g, '')
  // 1,234 is thousands; 1,5 is a Czech decimal.
  if (/,\d{3}\b/.test(t) && !/,\d{1,2}$/.test(t)) t = t.replace(/,/g, '')
  else t = t.replace(',', '.')
  return parseFloat(t)
}

interface Rule {
  re: RegExp
  build: (m: RegExpExecArray) => Omit<Quantity, 'raw' | 'start' | 'end'> | null
}

const RULES: Rule[] = [
  // 5'11", 5 ft 11, 6 foot 2
  {
    re: new RegExp(String.raw`\b(\d)\s*(?:'|ft\b|feet\b|foot\b)\s*(\d{1,2})?\s*(?:"|''|in\b|inch(?:es)?\b)?`, 'gi'),
    build: (m) => ({ kind: 'length', value: +m[1]! * 30.48 + (m[2] ? +m[2] * 2.54 : 0), unit: 'ft' }),
  },
  // 1h 30m 12s, 1:30:45, 22:30
  {
    re: new RegExp(String.raw`\b(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\b`, 'g'),
    build: (m) =>
      m[3]
        ? { kind: 'duration', value: +m[1]! * 3600 + +m[2]! * 60 + +m[3], unit: 'h:m:s' }
        : { kind: 'duration', value: +m[1]! * 60 + +m[2]!, alt: +m[1]! * 3600 + +m[2]! * 60, unit: 'm:s' },
  },
  {
    re: new RegExp(String.raw`\b(\d{1,2})\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?\b`, 'gi'),
    build: (m) => ({ kind: 'duration', value: +m[1]! * 3600 + +m[2]! * 60, unit: 'h' }),
  },
  // money with a symbol or code. Note the lookahead rather than \b: JavaScript's
  // \b does not fire after "kč", because č is not a word character to it.
  {
    re: new RegExp(String.raw`([$€£]|kč|czk|usd|eur|gbp)\s*` + NUM + String.raw`\s*([km])?(?![a-z])`, 'gi'),
    build: (m) => ({ kind: 'money', value: num(m[2]!) * mult(m[3]), currency: cur(m[1]!) }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*([km])?\s*(dollars?|bucks?|usd|\$|euros?|eur|€|pounds?|gbp|£|korun|kč|czk|crowns?)(?![a-z])`, 'gi'),
    build: (m) => ({ kind: 'money', value: num(m[1]!) * mult(m[2]), currency: cur(m[3]!) }),
  },
  // length
  {
    re: new RegExp(NUM + String.raw`\s*(cm|centimet(?:er|re)s?)\b`, 'gi'),
    build: (m) => ({ kind: 'length', value: num(m[1]!), unit: 'cm' }),
  },
  {
    re: new RegExp(String.raw`\b(1[.,]\d{1,2}|2[.,]\d{1,2})\s*(m|met(?:er|re)s?)\b`, 'gi'),
    build: (m) => ({ kind: 'length', value: num(m[1]!) * 100, unit: 'm' }),
  },
  // mass
  {
    re: new RegExp(NUM + String.raw`\s*(kgs?|kilos?|kilograms?)\b`, 'gi'),
    build: (m) => ({ kind: 'mass', value: num(m[1]!), unit: 'kg' }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*(lbs?|pounds?)\b`, 'gi'),
    build: (m) => ({ kind: 'mass', value: num(m[1]!) * 0.45359237, unit: 'lb' }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*(stone|st)\b`, 'gi'),
    build: (m) => ({ kind: 'mass', value: num(m[1]!) * 6.35029, unit: 'stone' }),
  },
  // duration with a single unit word
  {
    re: new RegExp(NUM + String.raw`\s*(hours?|hrs?|h)\b`, 'gi'),
    build: (m) => ({ kind: 'duration', value: num(m[1]!) * 3600, unit: 'hours' }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*(minutes?|mins?|m)\b(?!\s*(tall|high))`, 'gi'),
    build: (m) => ({ kind: 'duration', value: num(m[1]!) * 60, unit: 'minutes' }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*(seconds?|secs?|s)\b`, 'gi'),
    build: (m) => ({ kind: 'duration', value: num(m[1]!), unit: 'seconds' }),
  },
  {
    re: new RegExp(NUM + String.raw`\s*%`, 'g'),
    build: (m) => ({ kind: 'percent', value: num(m[1]!) }),
  },
  // bare number, possibly with a k/m magnitude suffix
  {
    re: new RegExp(String.raw`\b` + NUM + String.raw`\s*([km])?\b`, 'gi'),
    build: (m) => ({ kind: 'count', value: num(m[1]!) * mult(m[2]), bare: true }),
  },
]

function mult(s: string | undefined): number {
  if (!s) return 1
  const c = s.toLowerCase()
  return c === 'k' ? 1e3 : c === 'm' ? 1e6 : 1
}

function cur(s: string): Currency {
  const c = s.toLowerCase()
  if (c === '$' || c.startsWith('dollar') || c === 'usd' || c.startsWith('buck')) return 'usd'
  if (c === '€' || c.startsWith('euro') || c === 'eur') return 'eur'
  if (c === '£' || c.startsWith('pound') || c === 'gbp') return 'gbp'
  return 'czk'
}

const PERIODS: [RegExp, Period][] = [
  [/\b(?:per|a|each|every)\s*day\b|\bdaily\b|\ba night\b|\bper night\b|\beach night\b|\bnightly\b/i, 'day'],
  [/\b(?:per|a|each|every)\s*week\b|\bweekly\b|\bwk\b/i, 'week'],
  [/\b(?:per|a|each|every)\s*month\b|\bmonthly\b|\bmo\b/i, 'month'],
  [/\b(?:per|a|each|every)\s*year\b|\byearly\b|\bannually\b|\bp\.?a\.?\b/i, 'year'],
]

/** Find the period marker that follows a quantity most closely. */
function periodFor(text: string, from: number): Period | undefined {
  const tail = text.slice(from, from + 40)
  let best: { p: Period; at: number } | null = null
  for (const [re, p] of PERIODS) {
    const m = re.exec(tail)
    if (m && (best === null || m.index < best.at)) best = { p, at: m.index }
  }
  return best?.p
}

export function extractQuantities(text: string): Quantity[] {
  const consumed = new Array<boolean>(text.length).fill(false)
  const out: Quantity[] = []

  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text)) !== null) {
      const start = m.index
      const end = m.index + m[0].length
      if (m[0].trim() === '') continue
      let overlaps = false
      for (let i = start; i < end; i++) if (consumed[i]) overlaps = true
      if (overlaps) continue
      const built = rule.build(m)
      if (!built || !isFinite(built.value)) continue
      for (let i = start; i < end; i++) consumed[i] = true
      out.push({
        ...built,
        raw: m[0].trim(),
        start,
        end,
        period: periodFor(text, end),
      })
    }
  }

  return out.sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// Formatting back out

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function fmtMoney(v: number, currency: Currency): string {
  const n = Math.round(v)
  const grouped = n.toLocaleString('en-US')
  if (currency === 'usd') return `$${grouped}`
  if (currency === 'eur') return `€${grouped}`
  if (currency === 'gbp') return `£${grouped}`
  return `${grouped} Kč`
}

export function fmtNumber(v: number, dp = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
