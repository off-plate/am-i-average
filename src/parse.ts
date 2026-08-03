// Turning "how average am I if I run 1km in 4 minutes" into a lookup.
//
// This is keyword scoring and unit matching. There is no model behind it, which
// is why it answers instantly, works offline, and can tell you exactly why it
// read your sentence the way it did.

import { extractQuantities, FX } from './units'
import type { Period, Quantity } from './units'
import { METRICS, segmentFor } from './data/metrics'
import type { Ctx, Metric, Segment, Sex } from './data/metrics'

export interface Reading {
  metric: Metric
  segment: Segment
  /** In the metric's canonical unit. */
  value: number
  ctx: Ctx
  quantity: Quantity
  /** We matched on units alone, with no confirming word in the sentence. */
  weak: boolean
  /** Other metrics that nearly won, offered to the user as a correction. */
  alternatives: Metric[]
}

export interface ParseResult {
  readings: Reading[]
  ctx: Ctx
  /** Set when nothing matched, to drive the "I did not follow" state. */
  unmatched: Quantity[]
}

const SEX_WORDS: [RegExp, Sex][] = [
  [/\b(?:a )?(?:man|male|guy|dude|bloke|boy|gentleman)\b|\bmen\b|\bhis\b/i, 'm'],
  [/\b(?:a )?(?:woman|female|girl|lady|gal)\b|\bwomen\b|\bher\b|\bshe\b/i, 'f'],
]

const COUNTRY_WORDS: [RegExp, string][] = [
  [/\b(?:the )?(?:us|usa|u\.s\.|america|american|americans|states)\b/i, 'us'],
  [/\b(?:czech(?:ia|\srepublic)?|cz|prague|praha|czechs?)\b/i, 'cz'],
  [/\b(?:uk|u\.k\.|britain|british|england|english|scotland)\b/i, 'uk'],
  [/\b(?:netherlands|dutch|holland)\b/i, 'nl'],
  [/\b(?:world|worldwide|globally|global|planet|earth|everyone alive|humanity)\b/i, 'world'],
]

function detectCtx(text: string): Ctx {
  const ctx: Ctx = {}
  for (const [re, sex] of SEX_WORDS) if (re.test(text)) { ctx.sex = sex; break }
  for (const [re, c] of COUNTRY_WORDS) if (re.test(text)) { ctx.country = c; break }
  return ctx
}

/** Numbers that describe the person, not the achievement. */
function claimContextQuantities(text: string, qs: Quantity[], ctx: Ctx): Quantity[] {
  const rest: Quantity[] = []
  for (const q of qs) {
    const before = text.slice(Math.max(0, q.start - 22), q.start).toLowerCase()
    const after = text.slice(q.end, q.end + 18).toLowerCase()

    if (q.kind === 'mass' && (/\b(weigh|weighing|weighs|bodyweight|bw)\W*$/.test(before) || /^\s*(bodyweight|bw|body\s*weight)\b/.test(after))) {
      ctx.bodyweightKg = q.value
      continue
    }
    if (
      q.kind === 'count' && q.bare && q.value >= 13 && q.value <= 99 &&
      (/^\s*(?:years?\s*old|y\.?o\.?\b|year-old)/.test(after) || /\b(?:i'?m|i am|im|aged|age|a)\W*$/.test(before) && /^\s*(?:year|and\b|,)/.test(after))
    ) {
      ctx.age = q.value
      continue
    }
    rest.push(q)
  }
  return rest
}

function hits(text: string, key: string): boolean {
  const k = key.toLowerCase()
  if (/[a-z]$/.test(k) && /^[a-z]/.test(k)) {
    return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text)
  }
  return text.includes(k)
}

interface Scored {
  metric: Metric
  score: number
  /** Score coming only from keywords, not from units. */
  wordScore: number
}

function scoreMetrics(text: string, qs: Quantity[]): Scored[] {
  const out: Scored[] = []
  for (const metric of METRICS) {
    let wordScore = 0
    for (const k of metric.keys) if (hits(text, k)) wordScore += k.includes(' ') ? 4 : 3
    for (const k of metric.weakKeys ?? []) if (hits(text, k)) wordScore += 1

    let unitScore = 0
    for (const q of qs) {
      if (!metric.accepts.includes(q.kind)) continue
      const v = toCanonical(metric, q)
      if (v === null) continue
      unitScore = Math.max(unitScore, inRange(metric, v) ? 2 : 0.5)
    }
    if (wordScore + unitScore > 0) out.push({ metric, score: wordScore + unitScore, wordScore })
  }
  return out.sort((a, b) => b.score - a.score)
}

function inRange(metric: Metric, v: number): boolean {
  return v >= metric.range[0] && v <= metric.range[1]
}

/** How many of each period fit in a year. Exact, so a monthly wage x12 is a yearly one. */
const PER_YEAR: Record<Period, number> = { day: 365.25, week: 52.1786, month: 12, year: 1 }

/** Rescale a per-period quantity into the metric's own period. */
function rebase(value: number, from: Period | undefined, to: Period | undefined): number {
  if (!to || !from || from === to) return value
  return (value * PER_YEAR[from]) / PER_YEAR[to]
}

function convert(metric: Metric, q: Quantity, value: number): number | null {
  switch (q.kind) {
    case 'length':
    case 'mass':
      return value
    case 'count':
    case 'percent':
      return rebase(value, q.period, metric.canonical.per)
    case 'duration':
      // For a race time the period is meaningless; for "2 hours a week" it is everything.
      return metric.canonical.per ? rebase(value, q.period ?? metric.canonical.per, metric.canonical.per) : value
    case 'money': {
      const want = metric.canonical.currency ?? 'usd'
      const have = q.currency ?? want
      const converted = have === want ? value : (value * FX[have]) / FX[want]
      return rebase(converted, q.period ?? metric.canonical.per, metric.canonical.per)
    }
  }
}

/**
 * Convert a parsed quantity into the metric's canonical unit, or null if it
 * does not fit. Ambiguous patterns get their second reading tried against the
 * metric's own range, which is how "3:45" becomes a marathon and not a 1K.
 */
export function toCanonical(metric: Metric, q: Quantity): number | null {
  if (!metric.accepts.includes(q.kind)) return null
  const primary = convert(metric, q, q.value)
  if (primary !== null && inRange(metric, primary)) return primary
  if (q.alt !== undefined) {
    const alt = convert(metric, q, q.alt)
    if (alt !== null && inRange(metric, alt)) return alt
  }
  return primary
}

export function parse(input: string): ParseResult {
  const text = input.toLowerCase().replace(/[’]/g, "'")
  const ctx = detectCtx(text)
  const all = extractQuantities(text)
  const quantities = claimContextQuantities(text, all, ctx)

  const scored = scoreMetrics(text, quantities)
  const readings: Reading[] = []
  const usedQuantities = new Set<Quantity>()
  const usedMetrics = new Set<string>()

  for (const s of scored) {
    if (readings.length >= 4) break
    if (usedMetrics.has(s.metric.id)) continue
    // A metric with no confirming word only wins if nothing better claimed the number.
    const candidates = quantities
      .filter((q) => !usedQuantities.has(q))
      .map((q) => ({ q, v: toCanonical(s.metric, q) }))
      .filter((c): c is { q: Quantity; v: number } => c.v !== null && inRange(s.metric, c.v))
    if (candidates.length === 0) continue

    // Prefer the number sitting closest to the words that chose this metric.
    const anchor = keywordPosition(text, s.metric)
    candidates.sort((a, b) => Math.abs(a.q.start - anchor) - Math.abs(b.q.start - anchor))
    const best = candidates[0]

    // A match on units alone is only allowed when it is the ONLY metric that
    // could take that number. "5 hours a week" fits a half marathon, sleep,
    // screen time and exercise, so guessing produces a confident wrong answer;
    // it is far better to admit the miss and let the web fallback take it.
    // "183 cm" fits nothing but height, so that one still answers instantly.
    if (s.wordScore === 0) {
      if (readings.length > 0) continue
      if (countAccepting(best.q) !== 1) continue
    }

    const segment = segmentFor(s.metric, ctx)
    readings.push({
      metric: s.metric,
      segment,
      value: best.v,
      ctx,
      quantity: best.q,
      weak: s.wordScore === 0,
      // Only offer a correction the sentence gives some reason to consider.
      // Without the wordScore test, "2 hours a week" offers 5K and 10K purely
      // because seven thousand seconds happens to fit inside a race time.
      alternatives: scored
        .filter(
          (o) =>
            o.metric.id !== s.metric.id &&
            o.wordScore > 0 &&
            toCanonical(o.metric, best.q) !== null &&
            inRange(o.metric, toCanonical(o.metric, best.q)!),
        )
        .slice(0, 3)
        .map((o) => o.metric),
    })
    usedQuantities.add(best.q)
    usedMetrics.add(s.metric.id)
  }

  return {
    readings,
    ctx,
    unmatched: quantities.filter((q) => !usedQuantities.has(q)),
  }
}

/** How many metrics in the whole library would accept this number as their own. */
function countAccepting(q: Quantity): number {
  let n = 0
  for (const m of METRICS) {
    const v = toCanonical(m, q)
    if (v !== null && inRange(m, v)) n++
  }
  return n
}

function keywordPosition(text: string, metric: Metric): number {
  let best = -1
  for (const k of metric.keys) {
    const i = text.indexOf(k.toLowerCase())
    if (i >= 0 && (best === -1 || i < best)) best = i
  }
  return best === -1 ? 0 : best
}

/** Re-read a sentence against one specific metric, for the "no, I meant..." buttons. */
export function reparseAs(input: string, metric: Metric): Reading | null {
  const text = input.toLowerCase()
  const ctx = detectCtx(text)
  const quantities = claimContextQuantities(text, extractQuantities(text), ctx)
  for (const q of quantities) {
    const v = toCanonical(metric, q)
    if (v !== null && inRange(metric, v)) {
      return {
        metric,
        segment: segmentFor(metric, ctx),
        value: v,
        ctx,
        quantity: q,
        weak: false,
        alternatives: [],
      }
    }
  }
  return null
}
