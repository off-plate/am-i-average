// The metric library.
//
// House rule, no exceptions: every metric carries a real published source, the
// population it describes, and how honest the distribution is. A metric with no
// source does not ship. The confidence stamp is printed on the card:
//
//   measured  the source publishes the percentiles; we interpolate between them
//   fitted    fitted to two or more published anchors
//   modelled  one published anchor plus an assumed spread. Treat as a party trick.
//   estimated came back from a live web search rather than this file. Nobody on
//             our side checked the table, so it is always stamped this way no
//             matter how good the source it found looks. See src/resolve.ts.

import type { Dist } from '../stats'
import { fitLognormal } from '../stats'
import { fmtDuration, fmtMoney, fmtNumber } from '../units'
import type { Currency, Period, UnitKind } from '../units'
import * as T from './tables'

export type Confidence = 'measured' | 'fitted' | 'modelled' | 'estimated'
export type Sex = 'm' | 'f'

export interface Source {
  name: string
  url: string
  /** What the number is and how it was turned into a distribution. */
  note: string
  confidence: Confidence
  /** Pages a live search actually read. Only ever set on `estimated` answers. */
  citations?: { url: string; title: string }[]
}

export interface Ctx {
  sex?: Sex
  country?: string
  bodyweightKg?: number
  age?: number
}

export interface Segment {
  id: string
  /** Reads inside a sentence: "taller than 74 of every 100 <label>". */
  label: string
  sex?: Sex
  country?: string
  dist: Dist | ((c: Ctx) => Dist)
}

export interface Metric {
  id: string
  label: string
  /** How the site refers to the thing you did: "running 5K in 22:30". */
  phrase: (v: number) => string
  /** What "more" means, for wording only. */
  more: string
  less: string
  direction: 'high' | 'low' | 'neutral'
  accepts: UnitKind[]
  /** Canonical unit the distributions are expressed in. */
  canonical: { unit: string; per?: Period; currency?: Currency }
  /** Words that make this metric the right answer. First array is worth more. */
  keys: string[]
  weakKeys?: string[]
  /** Refuse absurd values rather than confidently returning nonsense. */
  range: [number, number]
  segments: Segment[]
  source: Source
  format: (v: number) => string
  /** Shown under the source stamp when the metric needs a caveat. */
  caveat?: string
  needsBodyweight?: boolean
  examples?: string[]
}

const SD_H_M = 7.0
const SD_H_F = 6.4

/** StrengthLevel publishes 5 / 20 / 50 / 80 / 95 by bodyweight. */
function liftDist(rows: T.BwRow[], bw: number): Dist {
  const first = rows[0]
  const last = rows[rows.length - 1]
  const b = Math.min(Math.max(bw, first[0]), last[0])
  let lo = first
  let hi = last
  for (let i = 0; i < rows.length - 1; i++) {
    if (b >= rows[i][0] && b <= rows[i + 1][0]) {
      lo = rows[i]
      hi = rows[i + 1]
      break
    }
  }
  const f = hi[0] === lo[0] ? 0 : (b - lo[0]) / (hi[0] - lo[0])
  const at = (i: number) => lo[i] + f * (hi[i] - lo[i])
  const ps = [0.05, 0.2, 0.5, 0.8, 0.95]
  const points: [number, number][] = []
  for (let i = 0; i < 5; i++) {
    const v = at(i + 1)
    if (v > 0) points.push([v, ps[i]])
  }
  return { kind: 'anchors', points }
}

function repsDist(rows: T.BwRow[], bw: number): Dist {
  const d = liftDist(rows, bw)
  // Everyone who cannot do one is piled at zero.
  return d.kind === 'anchors' ? { ...d, zeroMass: 0.05 } : d
}

/** Lichess publishes a live histogram; turn it into percentile anchors. */
function lichessDist(): Dist {
  const total = T.LICHESS_BLITZ.reduce((a, b) => a + b, 0)
  const points: [number, number][] = []
  let cum = 0
  for (let i = 0; i < T.LICHESS_BLITZ.length; i++) {
    cum += T.LICHESS_BLITZ[i]
    const rating = T.LICHESS_BLITZ_START + (i + 1) * T.LICHESS_BLITZ_STEP
    const p = cum / total
    if (p > 0.005 && p < 0.995 && i % 4 === 0) points.push([rating, p])
  }
  return { kind: 'anchors', points, log: false }
}

// Riegel's endurance formula, the standard way to move a race time between
// distances: T2 = T1 * (D2/D1)^1.06.
const RIEGEL_5K_TO_1K = Math.pow(1 / 5, 1.06)
function scale(points: [number, number][], factor: number): [number, number][] {
  return points.map(([v, p]) => [v * factor, p])
}

const RUN_5K = {
  all: [[1120, 0.01], [1520, 0.1], [2077, 0.5], [3004, 0.9]] as [number, number][],
  m: [[1050, 0.01], [1406, 0.1], [1888, 0.5], [2743, 0.9]] as [number, number][],
  f: [[1299, 0.01], [1704, 0.1], [2248, 0.5], [3144, 0.9]] as [number, number][],
}
const RUN_10K = {
  all: [[2178, 0.01], [2891, 0.1], [3728, 0.5], [5278, 0.9]] as [number, number][],
  m: [[2064, 0.01], [2711, 0.1], [3435, 0.5], [4761, 0.9]] as [number, number][],
  f: [[2472, 0.01], [3215, 0.1], [4014, 0.5], [5594, 0.9]] as [number, number][],
}
const RUN_HALF = {
  all: [[5039, 0.01], [6430, 0.1], [8099, 0.5], [10758, 0.9]] as [number, number][],
  m: [[4717, 0.01], [6035, 0.1], [7188, 0.5], [9768, 0.9]] as [number, number][],
  f: [[5755, 0.01], [7021, 0.1], [8643, 0.5], [11301, 0.9]] as [number, number][],
}
const RUN_FULL = {
  all: [[10248, 0.01], [12706, 0.1], [15993, 0.5], [20505, 0.9]] as [number, number][],
  m: [[9858, 0.01], [12160, 0.1], [15269, 0.5], [19526, 0.9]] as [number, number][],
  f: [[11495, 0.01], [13762, 0.1], [16929, 0.5], [21391, 0.9]] as [number, number][],
}

const RUNREPEAT: Source = {
  name: 'RunRepeat, 35M race results',
  url: 'https://runrepeat.com/how-do-you-masure-up-the-runners-percentile-calculator',
  note: 'published percentiles from 28,000 races over 20 years',
  confidence: 'measured',
}
const RACE_CAVEAT = 'Everyone here entered a race. Compared with the whole population, including people who have never run 5K in their lives, you would rank far higher.'

function raceSegments(t: { all: [number, number][]; m: [number, number][]; f: [number, number][] }): Segment[] {
  return [
    { id: 'all', label: 'race finishers', dist: { kind: 'anchors', points: t.all } },
    { id: 'm', label: 'men who finish races', sex: 'm', dist: { kind: 'anchors', points: t.m } },
    { id: 'f', label: 'women who finish races', sex: 'f', dist: { kind: 'anchors', points: t.f } },
  ]
}

function liftMetric(
  id: string,
  label: string,
  verb: string,
  men: T.BwRow[],
  women: T.BwRow[],
  keys: string[],
): Metric {
  return {
    id,
    label,
    phrase: (v) => `${verb} ${fmtNumber(v)} kg`,
    more: 'stronger',
    less: 'weaker',
    direction: 'high',
    accepts: ['mass', 'count'],
    canonical: { unit: 'kg' },
    keys,
    range: [10, 500],
    needsBodyweight: true,
    segments: [
      { id: 'm', label: 'men who log lifts', sex: 'm', dist: (c) => liftDist(men, c.bodyweightKg ?? 85) },
      { id: 'f', label: 'women who log lifts', sex: 'f', dist: (c) => liftDist(women, c.bodyweightKg ?? 70) },
    ],
    source: {
      name: 'StrengthLevel, 48M logged lifts',
      url: `https://strengthlevel.com/strength-standards/${id.replace('_', '-')}/kg`,
      note: 'published 5th / 20th / 50th / 80th / 95th percentiles by bodyweight',
      confidence: 'measured',
    },
    caveat: 'These are people who log their lifts to a strength app, so the bar is set by people who train on purpose.',
    format: (v) => `${fmtNumber(v)} kg`,
  }
}

export const METRICS: Metric[] = [
  {
    id: 'height',
    label: 'height',
    phrase: (v) => `being ${fmtNumber(v)} cm tall`,
    more: 'taller',
    less: 'shorter',
    direction: 'neutral',
    accepts: ['length'],
    canonical: { unit: 'cm' },
    keys: ['tall', 'height', 'cm tall', 'my height'],
    weakKeys: ['am', 'i'],
    range: [120, 230],
    segments: [
      { id: 'world-m', label: 'men worldwide', sex: 'm', country: 'world', dist: { kind: 'normal', mean: 171.0, sd: SD_H_M } },
      { id: 'world-f', label: 'women worldwide', sex: 'f', country: 'world', dist: { kind: 'normal', mean: 159.5, sd: SD_H_F } },
      { id: 'us-m', label: 'men in the US', sex: 'm', country: 'us', dist: { kind: 'normal', mean: 177.1, sd: SD_H_M } },
      { id: 'us-f', label: 'women in the US', sex: 'f', country: 'us', dist: { kind: 'normal', mean: 163.5, sd: SD_H_F } },
      { id: 'cz-m', label: 'men in Czechia', sex: 'm', country: 'cz', dist: { kind: 'normal', mean: 180.3, sd: SD_H_M } },
      { id: 'cz-f', label: 'women in Czechia', sex: 'f', country: 'cz', dist: { kind: 'normal', mean: 167.2, sd: SD_H_F } },
      { id: 'nl-m', label: 'men in the Netherlands', sex: 'm', country: 'nl', dist: { kind: 'normal', mean: 183.8, sd: SD_H_M } },
      { id: 'nl-f', label: 'women in the Netherlands', sex: 'f', country: 'nl', dist: { kind: 'normal', mean: 170.4, sd: SD_H_F } },
      { id: 'uk-m', label: 'men in the UK', sex: 'm', country: 'uk', dist: { kind: 'normal', mean: 178.2, sd: SD_H_M } },
      { id: 'uk-f', label: 'women in the UK', sex: 'f', country: 'uk', dist: { kind: 'normal', mean: 164.4, sd: SD_H_F } },
    ],
    source: {
      name: 'NCD-RisC',
      url: 'https://ncdrisc.org/data-downloads-height.html',
      note: 'country means for adults born in 1996, normal curve at SD 7.0 cm (men) and 6.4 cm (women)',
      confidence: 'fitted',
    },
    format: (v) => `${fmtNumber(v)} cm`,
    examples: ['I am 183 cm tall', "I'm 5'11\" and American"],
  },

  {
    id: 'bodyweight',
    label: 'bodyweight',
    phrase: (v) => `weighing ${fmtNumber(v)} kg`,
    more: 'heavier',
    less: 'lighter',
    direction: 'neutral',
    accepts: ['mass'],
    canonical: { unit: 'kg' },
    // Deliberately narrow. "kg" and "bodyweight" appear in every lifting
    // sentence, and this metric must not steal them from the lift.
    keys: ['weigh', 'weighs', 'weighing', 'my weight', 'how heavy'],
    range: [30, 250],
    segments: [
      { id: 'us-m', label: 'men in the US', sex: 'm', country: 'us', dist: { kind: 'normal', mean: 90.6, sd: 21 } },
      { id: 'us-f', label: 'women in the US', sex: 'f', country: 'us', dist: { kind: 'normal', mean: 77.5, sd: 22 } },
    ],
    source: {
      name: 'CDC NHANES 2015–2018',
      url: 'https://www.cdc.gov/nchs/data/series/sr_03/sr03-046-508.pdf',
      note: 'published mean weight for US adults 20+, spread assumed',
      confidence: 'modelled',
    },
    format: (v) => `${fmtNumber(v, 1)} kg`,
  },

  {
    id: 'income_us',
    label: 'income',
    phrase: (v) => `earning ${fmtMoney(v, 'usd')} a year`,
    more: 'richer',
    less: 'poorer',
    direction: 'high',
    accepts: ['money'],
    canonical: { unit: '$/year', per: 'year', currency: 'usd' },
    keys: ['salary', 'income', 'earn', 'making', 'make', 'paid', 'wage', 'dollars', 'usd', '$'],
    range: [100, 50_000_000],
    segments: [{ id: 'us', label: 'American workers', country: 'us', dist: { kind: 'anchors', points: T.US_INCOME } }],
    source: {
      name: 'DQYDJ, from IPUMS CPS',
      url: 'https://dqydj.com/average-median-top-individual-income-percentiles/',
      note: 'every individual income percentile for 2025, income earned in 2024',
      confidence: 'measured',
    },
    format: (v) => fmtMoney(v, 'usd'),
    examples: ['I make $85,000 a year in the US'],
  },

  {
    id: 'income_cz',
    label: 'salary',
    phrase: (v) => `earning ${fmtMoney(v, 'czk')} a month`,
    more: 'richer',
    less: 'poorer',
    direction: 'high',
    accepts: ['money'],
    canonical: { unit: 'Kč/month', per: 'month', currency: 'czk' },
    keys: ['czk', 'kč', 'korun', 'czech', 'czechia', 'prague', 'crowns'],
    weakKeys: ['salary', 'income', 'earn', 'make', 'wage'],
    range: [1000, 5_000_000],
    segments: [
      { id: 'cz', label: 'Czech employees', country: 'cz', dist: fitLognormal(23282, 0.1, 45523, 0.5) },
    ],
    source: {
      name: 'Český statistický úřad',
      url: 'https://csu.gov.cz/zamestnanci-a-mzdy',
      note: 'gross monthly median 45,523 Kč and first decile 23,282 Kč, Q4 2025; lognormal through both',
      confidence: 'fitted',
    },
    format: (v) => fmtMoney(v, 'czk'),
    examples: ['I earn 60000 Kč a month'],
  },

  {
    id: 'income_world',
    label: 'income, worldwide',
    phrase: (v) => `living on ${fmtMoney(v, 'usd')} a year`,
    more: 'richer',
    less: 'poorer',
    direction: 'high',
    accepts: ['money'],
    canonical: { unit: '$/year', per: 'year', currency: 'usd' },
    keys: ['world', 'globally', 'global', 'planet', 'earth', 'everyone alive', 'worldwide'],
    weakKeys: ['income', 'earn', 'make', 'salary'],
    range: [50, 50_000_000],
    segments: [{ id: 'world', label: 'people on earth', country: 'world', dist: fitLognormal(3300, 0.5, 16400, 0.9) }],
    source: {
      name: 'World Bank PIP, via Our World in Data',
      url: 'https://ourworldindata.org/economic-inequality',
      note: 'global median near $9/day and a top-10% threshold near $45/day, PPP-adjusted; lognormal through both',
      confidence: 'fitted',
    },
    caveat: 'Purchasing-power adjusted, so it is not the same as converting your salary at today’s exchange rate.',
    format: (v) => fmtMoney(v, 'usd'),
    examples: ['am I rich globally on $40,000 a year'],
  },

  {
    id: 'run_1k',
    label: '1 km',
    phrase: (v) => `running 1 km in ${fmtDuration(v)}`,
    more: 'faster',
    less: 'slower',
    direction: 'low',
    accepts: ['duration'],
    canonical: { unit: 'seconds' },
    keys: ['1k', '1 km', 'one km', 'kilometre', 'kilometer', '1000 m', 'a km'],
    weakKeys: ['run', 'running', 'jog'],
    range: [120, 1800],
    segments: [
      { id: 'all', label: 'race finishers', dist: { kind: 'anchors', points: scale(RUN_5K.all, RIEGEL_5K_TO_1K) } },
      { id: 'm', label: 'men who finish races', sex: 'm', dist: { kind: 'anchors', points: scale(RUN_5K.m, RIEGEL_5K_TO_1K) } },
      { id: 'f', label: 'women who finish races', sex: 'f', dist: { kind: 'anchors', points: scale(RUN_5K.f, RIEGEL_5K_TO_1K) } },
    ],
    source: {
      name: 'RunRepeat 5K percentiles, converted',
      url: RUNREPEAT.url,
      note: 'the published 5K distribution moved to 1 km with Riegel’s formula, T2 = T1 x (D2/D1)^1.06',
      confidence: 'fitted',
    },
    caveat: RACE_CAVEAT,
    format: fmtDuration,
    examples: ['I run 1 km in 4 minutes'],
  },

  {
    id: 'run_5k',
    label: '5K',
    phrase: (v) => `running 5K in ${fmtDuration(v)}`,
    more: 'faster',
    less: 'slower',
    direction: 'low',
    accepts: ['duration'],
    canonical: { unit: 'seconds' },
    keys: ['5k', '5 km', 'five k', 'parkrun'],
    weakKeys: ['run', 'running'],
    range: [600, 7200],
    segments: raceSegments(RUN_5K),
    source: RUNREPEAT,
    caveat: RACE_CAVEAT,
    format: fmtDuration,
    examples: ['I run 5k in 24:30'],
  },
  {
    id: 'run_10k',
    label: '10K',
    phrase: (v) => `running 10K in ${fmtDuration(v)}`,
    more: 'faster',
    less: 'slower',
    direction: 'low',
    accepts: ['duration'],
    canonical: { unit: 'seconds' },
    keys: ['10k', '10 km', 'ten k'],
    weakKeys: ['run', 'running'],
    range: [1200, 14400],
    segments: raceSegments(RUN_10K),
    source: RUNREPEAT,
    caveat: RACE_CAVEAT,
    format: fmtDuration,
  },
  {
    id: 'run_half',
    label: 'half marathon',
    phrase: (v) => `running a half marathon in ${fmtDuration(v)}`,
    more: 'faster',
    less: 'slower',
    direction: 'low',
    accepts: ['duration'],
    canonical: { unit: 'seconds' },
    keys: ['half marathon', 'half-marathon', '21k', '21.1'],
    weakKeys: ['half', 'run'],
    range: [3000, 28800],
    segments: raceSegments(RUN_HALF),
    source: RUNREPEAT,
    caveat: RACE_CAVEAT,
    format: fmtDuration,
  },
  {
    id: 'run_marathon',
    label: 'marathon',
    phrase: (v) => `running a marathon in ${fmtDuration(v)}`,
    more: 'faster',
    less: 'slower',
    direction: 'low',
    accepts: ['duration'],
    canonical: { unit: 'seconds' },
    keys: ['marathon', '42k', '42.2'],
    weakKeys: ['run'],
    range: [7000, 43200],
    segments: raceSegments(RUN_FULL),
    source: RUNREPEAT,
    caveat: RACE_CAVEAT,
    format: fmtDuration,
    examples: ['marathon in 3:45'],
  },

  liftMetric('bench_press', 'bench press', 'benching', T.BENCH_PRESS_MEN, T.BENCH_PRESS_WOMEN, [
    'bench', 'bench press', 'benching', 'chest press',
  ]),
  liftMetric('squat', 'squat', 'squatting', T.SQUAT_MEN, T.SQUAT_WOMEN, ['squat', 'squatting', 'back squat']),
  liftMetric('deadlift', 'deadlift', 'pulling', T.DEADLIFT_MEN, T.DEADLIFT_WOMEN, ['deadlift', 'dead lift', 'pull off the floor']),
  liftMetric('overhead_press', 'overhead press', 'pressing', T.OVERHEAD_PRESS_MEN, T.OVERHEAD_PRESS_WOMEN, [
    'overhead press', 'ohp', 'shoulder press', 'military press',
  ]),

  {
    id: 'pull_ups',
    label: 'pull-ups',
    phrase: (v) => `doing ${fmtNumber(v)} pull-ups`,
    more: 'stronger',
    less: 'weaker',
    direction: 'high',
    accepts: ['count'],
    canonical: { unit: 'reps' },
    keys: ['pull up', 'pull-up', 'pullup', 'pull ups', 'pullups', 'chin up', 'chinup'],
    range: [0, 100],
    needsBodyweight: true,
    segments: [
      { id: 'm', label: 'men who log lifts', sex: 'm', dist: (c) => repsDist(T.PULL_UPS_MEN, c.bodyweightKg ?? 85) },
      { id: 'f', label: 'women who log lifts', sex: 'f', dist: (c) => repsDist(T.PULL_UPS_WOMEN, c.bodyweightKg ?? 70) },
    ],
    source: {
      name: 'StrengthLevel',
      url: 'https://strengthlevel.com/strength-standards/pull-ups/kg',
      note: 'published rep standards by bodyweight, 5th to 95th percentile',
      confidence: 'measured',
    },
    caveat: 'These are people who log their training. Among everyone, one clean pull-up already puts you a long way up.',
    format: (v) => `${fmtNumber(v)} reps`,
    examples: ['I can do 12 pull ups at 80kg'],
  },

  {
    id: 'chess',
    label: 'chess rating',
    phrase: (v) => `a blitz rating of ${fmtNumber(v)}`,
    more: 'better',
    less: 'worse',
    direction: 'high',
    accepts: ['count'],
    canonical: { unit: 'Elo' },
    keys: ['chess', 'elo', 'blitz rating', 'lichess', 'rating'],
    range: [400, 3200],
    segments: [{ id: 'all', label: 'rated blitz players', dist: lichessDist() }],
    source: {
      name: 'Lichess',
      url: 'https://lichess.org/stat/rating/distribution/blitz',
      note: 'the live blitz rating histogram, 657,000 rated players, snapshot 3 August 2026',
      confidence: 'measured',
    },
    caveat: 'Lichess ratings run a few hundred points above Chess.com for the same player.',
    format: (v) => fmtNumber(v),
    examples: ['my chess rating is 1450'],
  },

  {
    id: 'sleep',
    label: 'sleep',
    phrase: (v) => `sleeping ${fmtNumber(v / 3600, 1)} hours a night`,
    more: 'more rested',
    less: 'more tired',
    direction: 'neutral',
    accepts: ['duration'],
    canonical: { unit: 'hours/night', per: 'day' },
    keys: ['sleep', 'sleeping', 'asleep', 'a night', 'per night', 'in bed'],
    range: [3600, 57600],
    segments: [
      {
        id: 'us',
        label: 'US adults',
        country: 'us',
        dist: { kind: 'anchors', points: [[7 * 3600, 0.355], [9 * 3600, 0.92]], log: false },
      },
    ],
    source: {
      name: 'CDC, National Health Interview Survey',
      url: 'https://www.cdc.gov/sleep/data-research/facts-stats/',
      note: '35.5% of US adults sleep under 7 hours and about 8% sleep over 9; curve through both',
      confidence: 'fitted',
    },
    format: (v) => `${fmtNumber(v / 3600, 1)} h`,
    examples: ['I sleep 6 hours a night'],
  },

  {
    id: 'exercise',
    label: 'exercise',
    phrase: (v) => `training ${fmtNumber(v / 3600, 1)} hours a week`,
    more: 'more active',
    less: 'less active',
    direction: 'high',
    accepts: ['duration'],
    canonical: { unit: 'hours/week', per: 'week' },
    // No bare "practice" or "play": those belong to guitar, chess and piano just
    // as much as to sport, and the web search answers those far better than a
    // generic exercise curve would.
    keys: ['train', 'training', 'exercise', 'workout', 'work out', 'gym', 'sport', 'basketball', 'football', 'soccer', 'tennis', 'swim', 'cycling', 'climbing', 'boxing', 'yoga', 'running', 'lifting'],
    range: [600, 360000],
    segments: [
      {
        id: 'us',
        label: 'US adults',
        country: 'us',
        dist: { kind: 'anchors', points: [[2.5 * 3600, 0.54], [6 * 3600, 0.88]], zeroMass: 0.25 },
      },
    ],
    source: {
      name: 'CDC, National Health Interview Survey',
      url: 'https://www.cdc.gov/physical-activity/php/data/index.html',
      note: 'about 25% of US adults do no leisure-time exercise and 46% clear 150 minutes a week; upper tail assumed',
      confidence: 'modelled',
    },
    caveat: 'This is hours of any deliberate exercise, whatever the sport. It does not know how good you are at basketball, only how much of your week goes into it.',
    format: (v) => `${fmtNumber(v / 3600, 1)} h/week`,
    examples: ['I train basketball 2 hours a week', 'I go to the gym 5 hours a week'],
  },

  {
    id: 'steps',
    label: 'steps',
    phrase: (v) => `walking ${fmtNumber(v)} steps a day`,
    more: 'more active',
    less: 'less active',
    direction: 'high',
    accepts: ['count'],
    canonical: { unit: 'steps/day', per: 'day' },
    keys: ['steps', 'step count', 'walk', 'walking', 'pedometer'],
    range: [100, 60000],
    segments: [
      { id: 'world', label: 'people carrying a smartphone', country: 'world', dist: { kind: 'lognormal', median: 4400, sigma: 0.62 } },
      { id: 'us', label: 'Americans carrying a smartphone', country: 'us', dist: { kind: 'lognormal', median: 4200, sigma: 0.62 } },
    ],
    source: {
      name: 'Althoff et al., Nature 2017',
      url: 'https://www.nature.com/articles/nature23018',
      note: '717,000 people across 111 countries; global mean 4,961 and US mean 4,774 steps a day, spread assumed',
      confidence: 'modelled',
    },
    caveat: 'Phone-measured, so it misses steps taken without your phone and it skews towards people who own a smartphone.',
    format: (v) => `${fmtNumber(v)} steps`,
    examples: ['I walk 12000 steps a day'],
  },

  {
    id: 'books',
    label: 'books read',
    phrase: (v) => `reading ${fmtNumber(v)} books a year`,
    more: 'more read',
    less: 'less read',
    direction: 'high',
    accepts: ['count'],
    canonical: { unit: 'books/year', per: 'year' },
    keys: ['book', 'books', 'read', 'reading', 'novels'],
    range: [0, 1000],
    segments: [
      { id: 'us', label: 'US adults', country: 'us', dist: { kind: 'lognormal', median: 5, sigma: 1.36 } },
    ],
    source: {
      name: 'Gallup and Pew Research',
      url: 'https://news.gallup.com/poll/388541/americans-reading-fewer-books-past.aspx',
      note: 'Gallup gives a mean of 12.6 books and a median near 5; Pew finds 23% read none. Lognormal through the mean and median',
      confidence: 'fitted',
    },
    format: (v) => `${fmtNumber(v)} books`,
    examples: ['I read 20 books a year'],
  },

  {
    id: 'screen_time',
    label: 'screen time',
    phrase: (v) => `${fmtNumber(v / 3600, 1)} hours a day on your phone`,
    more: 'more online',
    less: 'less online',
    direction: 'neutral',
    accepts: ['duration'],
    canonical: { unit: 'hours/day', per: 'day' },
    keys: ['screen time', 'screentime', 'phone', 'scrolling', 'on my phone', 'tiktok', 'instagram'],
    range: [600, 72000],
    segments: [
      { id: 'world', label: 'smartphone owners', country: 'world', dist: { kind: 'lognormal', median: 4.6 * 3600, sigma: 0.45 } },
    ],
    source: {
      name: 'data.ai / Sensor Tower, State of Mobile',
      url: 'https://sensortower.com/state-of-mobile-2025',
      note: 'daily mobile use averaging near 5 hours in leading markets, spread assumed',
      confidence: 'modelled',
    },
    format: (v) => `${fmtNumber(v / 3600, 1)} h/day`,
    examples: ['5 hours of screen time a day'],
  },

  {
    id: 'typing',
    label: 'typing speed',
    phrase: (v) => `typing ${fmtNumber(v)} words a minute`,
    more: 'faster',
    less: 'slower',
    direction: 'high',
    accepts: ['count'],
    canonical: { unit: 'wpm' },
    keys: ['wpm', 'typing', 'type', 'words per minute', 'keyboard'],
    range: [5, 300],
    segments: [{ id: 'all', label: 'people who take a typing test', dist: { kind: 'normal', mean: 41, sd: 15 } }],
    source: {
      name: 'Dhakal et al., CHI 2018',
      url: 'https://userinterfaces.aalto.fi/136Mkeystrokes/',
      note: '136 million keystrokes from 168,000 people; mean 51.6 wpm on desktop, 41 wpm across the whole sample, spread assumed',
      confidence: 'modelled',
    },
    format: (v) => `${fmtNumber(v)} wpm`,
    examples: ['I type 90 wpm'],
  },
]

export const BY_ID = new Map(METRICS.map((m) => [m.id, m]))

export function segmentFor(metric: Metric, ctx: Ctx): Segment {
  const byBoth = metric.segments.find(
    (s) => (!s.sex || s.sex === ctx.sex) && (!s.country || s.country === ctx.country) && (s.sex || s.country),
  )
  if (byBoth && (!byBoth.sex || ctx.sex) && (!byBoth.country || ctx.country)) return byBoth
  const bySex = ctx.sex ? metric.segments.find((s) => s.sex === ctx.sex && !s.country) : undefined
  if (bySex) return bySex
  const byCountry = ctx.country ? metric.segments.find((s) => s.country === ctx.country && !s.sex) : undefined
  if (byCountry) return byCountry
  const sexOnly = ctx.sex ? metric.segments.find((s) => s.sex === ctx.sex) : undefined
  if (sexOnly) return sexOnly
  return metric.segments[0]
}

export function distFor(segment: Segment, ctx: Ctx): Dist {
  return typeof segment.dist === 'function' ? segment.dist(ctx) : segment.dist
}
