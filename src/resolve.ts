// Client side of the long tail.
//
// The remote answer is turned into an ordinary Metric before it touches the
// renderer, so an AI answer and a hand-sourced one go through the same maths
// and come out as the same card. The only difference the user sees is the
// `estimated` stamp and the list of pages it read.

import type { Metric, Segment } from './data/metrics'
import type { Reading } from './parse'
import type { Dist } from './stats'

export const ENDPOINT =
  (import.meta.env.VITE_RESOLVER as string | undefined) ?? 'https://am-i-average.netlify.app/api/resolve'

export interface Citation {
  url: string
  title: string
}

interface Payload {
  understood: boolean
  reason?: string
  label: string
  phrase: string
  value: number
  unit: string
  population: string
  direction: 'high' | 'low' | 'neutral'
  more: string
  less: string
  anchors: [number, number][]
  zeroShare: number
  sourceName: string
  sourceUrl: string
  basis: string
  caveat: string
  citations?: Citation[]
}

export type ResolveResult =
  | { ok: true; reading: Reading }
  | { ok: false; reason: string; retryable: boolean }

const CACHE_PREFIX = 'aia:v1:'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000

export async function resolveRemote(question: string): Promise<ResolveResult> {
  const key = CACHE_PREFIX + question.toLowerCase().replace(/\s+/g, ' ').trim()

  const cached = readCache(key)
  if (cached) return { ok: true, reading: toReading(cached, question) }

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    return { ok: false, reason: 'Could not reach the web search. Check your connection.', retryable: true }
  }

  let body: (Payload & { error?: string; message?: string }) | null = null
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: 'The search came back garbled.', retryable: true }
  }

  if (!res.ok || !body) {
    if (res.status === 503) {
      return { ok: false, reason: 'The web search is not switched on for this deploy yet.', retryable: false }
    }
    if (res.status === 429) {
      return { ok: false, reason: body?.message ?? 'Too many questions at once. Give it a minute.', retryable: true }
    }
    return { ok: false, reason: body?.message ?? 'The search failed.', retryable: true }
  }

  if (!body.understood) {
    return { ok: false, reason: body.reason || 'No measurable number in that one.', retryable: false }
  }

  writeCache(key, body)
  return { ok: true, reading: toReading(body, question) }
}

function toReading(p: Payload, question: string): Reading {
  const values = p.anchors.map((a) => a[0])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  // Log interpolation only where it is defined and the range is genuinely wide.
  const useLog = lo > 0 && hi / lo > 8

  const dist: Dist = {
    kind: 'anchors',
    points: p.anchors,
    log: useLog,
    ...(p.zeroShare > 0 ? { zeroMass: p.zeroShare } : {}),
  }

  const segment: Segment = { id: 'ai', label: p.population, dist }

  const metric: Metric = {
    id: 'ai:' + hash(question),
    label: p.label,
    phrase: () => p.phrase,
    more: p.more,
    less: p.less,
    direction: p.direction,
    accepts: [],
    canonical: { unit: p.unit },
    keys: [],
    range: [-Infinity, Infinity],
    segments: [segment],
    source: {
      name: p.sourceName || 'no published source found',
      url: p.sourceUrl,
      note: p.basis,
      confidence: 'estimated',
      citations: p.citations ?? [],
    },
    caveat: p.caveat || undefined,
    format: (v) => `${format(v)}${p.unit ? ' ' + p.unit : ''}`,
  }

  return {
    metric,
    segment,
    value: p.value,
    ctx: {},
    quantity: { kind: 'count', value: p.value, raw: question, start: 0, end: 0 },
    weak: false,
    alternatives: [],
  }
}

function format(v: number): string {
  const dp = Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : 1
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function readCache(key: string): Payload | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { at, payload } = JSON.parse(raw)
    if (Date.now() - at > CACHE_TTL) {
      localStorage.removeItem(key)
      return null
    }
    return payload
  } catch {
    return null
  }
}

function writeCache(key: string, payload: Payload): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), payload }))
  } catch {
    // Private mode, or full. The answer still works, it just will not be remembered.
  }
}
