// Parser and maths checks. Run with: npm run test
import { parse } from '../src/parse'
import { averageness, cdf, pictogramIndex } from '../src/stats'
import { distFor, METRICS } from '../src/data/metrics'

interface Case {
  q: string
  metric: string
  value?: number
  ctx?: { sex?: string; country?: string; bodyweightKg?: number; age?: number }
}

const CASES: Case[] = [
  { q: 'I run 1 km in 4 minutes', metric: 'run_1k', value: 240 },
  { q: 'how average am I if I train basketball 2 hours a week', metric: 'exercise', value: 7200 },
  { q: 'I make $1000 a month in the US', metric: 'income_us', value: 12000 },
  { q: 'I make $85,000 a year', metric: 'income_us', value: 85000 },
  { q: "I'm 183 cm tall, Czech guy", metric: 'height', value: 183, ctx: { sex: 'm', country: 'cz' } },
  { q: "I'm 6 foot 2", metric: 'height' },
  { q: 'I bench 100kg at 85kg bodyweight', metric: 'bench_press', value: 100, ctx: { bodyweightKg: 85 } },
  { q: 'I can do 12 pull ups', metric: 'pull_ups', value: 12 },
  { q: 'I sleep 6 hours a night', metric: 'sleep', value: 21600 },
  { q: 'my chess rating is 1450', metric: 'chess', value: 1450 },
  { q: 'I read 20 books a year', metric: 'books', value: 20 },
  { q: 'I run 5k in 22:30', metric: 'run_5k', value: 1350 },
  { q: "I'm 32 and I run 5k in 22 minutes", metric: 'run_5k', value: 1320, ctx: { age: 32 } },
  { q: 'I earn 60000 Kč a month', metric: 'income_cz', value: 60000 },
  { q: 'I walk 12000 steps a day', metric: 'steps', value: 12000 },
  { q: 'I type 90 wpm', metric: 'typing', value: 90 },
  { q: 'marathon in 3:45', metric: 'run_marathon', value: 13500 },
  { q: 'I squat 140 kg', metric: 'squat', value: 140 },
  { q: '5 hours of screen time a day', metric: 'screen_time', value: 18000 },
  { q: 'am I rich globally on $40,000 a year', metric: 'income_world', value: 40000 },
]

let fails = 0
const rows: string[] = []

for (const c of CASES) {
  const r = parse(c.q)
  const first = r.readings[0]
  if (!first) {
    fails++
    rows.push(`FAIL  no reading                     <- ${c.q}`)
    continue
  }
  const problems: string[] = []
  if (first.metric.id !== c.metric) problems.push(`metric ${first.metric.id} != ${c.metric}`)
  if (c.value !== undefined && Math.abs(first.value - c.value) > Math.max(0.5, c.value * 0.001)) {
    problems.push(`value ${first.value} != ${c.value}`)
  }
  for (const [k, v] of Object.entries(c.ctx ?? {})) {
    if ((first.ctx as Record<string, unknown>)[k] !== v) problems.push(`${k} ${(first.ctx as Record<string, unknown>)[k]} != ${v}`)
  }

  const dist = distFor(first.segment, first.ctx)
  const p = cdf(dist, first.value)
  const rank = first.metric.direction === 'low' ? 1 - p : p
  const line = `${Math.round(averageness(p)).toString().padStart(3)}% avg  fig ${pictogramIndex(rank).toString().padStart(3)}  ${first.metric.id.padEnd(14)} ${first.metric.phrase(first.value)}`

  if (problems.length) {
    fails++
    rows.push(`FAIL  ${problems.join(', ')}  <- ${c.q}`)
  } else {
    rows.push(`ok    ${line}`)
  }
}

console.log(rows.join('\n'))

// Every metric must round-trip its own examples and stay inside 0..100.
for (const m of METRICS) {
  for (const seg of m.segments) {
    const d = distFor(seg, { bodyweightKg: 85 })
    for (const v of [m.range[0], (m.range[0] + m.range[1]) / 2, m.range[1]]) {
      const p = cdf(d, v)
      if (!(p >= 0 && p <= 1) || Number.isNaN(p)) {
        fails++
        console.log(`FAIL  ${m.id}/${seg.id} cdf(${v}) = ${p}`)
      }
    }
  }
  for (const ex of m.examples ?? []) {
    const r = parse(ex)
    if (!r.readings.some((x) => x.metric.id === m.id)) {
      fails++
      console.log(`FAIL  ${m.id} does not parse its own example: "${ex}"`)
    }
  }
}

// Monotonicity: the cdf must never go backwards.
for (const m of METRICS) {
  const d = distFor(m.segments[0], { bodyweightKg: 85 })
  let prev = -1
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const v = m.range[0] + ((m.range[1] - m.range[0]) * i) / steps
    const p = cdf(d, v)
    if (p < prev - 1e-9) {
      fails++
      console.log(`FAIL  ${m.id} cdf not monotonic at ${v}: ${p} < ${prev}`)
      break
    }
    prev = p
  }
}

console.log(fails === 0 ? `\nall ${CASES.length} sentences + ${METRICS.length} metrics pass` : `\n${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
