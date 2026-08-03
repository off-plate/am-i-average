// The long tail. Anything the local library does not cover gets asked here.
//
// The contract that keeps this honest: Grok never tells us a percentile. It
// tells us a DISTRIBUTION, as anchor points, plus the sources it actually
// found. Our own maths turns that into a score, exactly as it does for the
// twenty-two hand-sourced metrics. The model cannot hand us an answer, only
// the shape of the data behind one.
//
// And whatever it claims about its own rigour, we stamp the result `estimated`,
// because nobody on our side checked the table.

const XAI_URL = 'https://api.x.ai/v1/responses'
const MODEL = process.env.XAI_MODEL || 'grok-4.5'

const ALLOWED_ORIGINS = [
  'https://off-plate.github.io',
  'https://am-i-average.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const SCHEMA = {
  type: 'object',
  properties: {
    understood: {
      type: 'boolean',
      description: 'False if the question has no measurable quantity in it.',
    },
    reason: {
      type: 'string',
      description: 'If not understood, one short sentence saying why. Otherwise empty.',
    },
    label: { type: 'string', description: 'Short name of what is measured, e.g. "guitar practice".' },
    phrase: {
      type: 'string',
      description:
        'The user\'s value as a gerund phrase for a headline, e.g. "practising guitar 5 hours a week". No capital letter, no full stop.',
    },
    value: { type: 'number', description: "The user's own value, in the unit named below." },
    unit: { type: 'string', description: 'Unit of value and of every anchor, e.g. "hours/week".' },
    population: {
      type: 'string',
      description:
        'Who the anchors describe, as it would read after "than 60 of every 100 ...", e.g. "adults who play guitar". Plural, lowercase.',
    },
    direction: {
      type: 'string',
      enum: ['high', 'low', 'neutral'],
      description: 'high if a bigger number is more of the thing, low if smaller is better (race times), neutral if neither.',
    },
    more: { type: 'string', description: 'Comparative for a bigger value, e.g. "more practised". Lowercase.' },
    less: { type: 'string', description: 'Comparative for a smaller value, e.g. "less practised". Lowercase.' },
    anchors: {
      type: 'array',
      description:
        'Points on the cumulative distribution, ascending by value. Each is [value, share_of_population_below_that_value]. Share is strictly between 0 and 1. Give 3 to 5 points spanning the range, and make the middle one the median.',
      items: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
      },
      minItems: 2,
      maxItems: 6,
    },
    zero_share: {
      type: 'number',
      description:
        'Share of the population who do none of this at all, 0 to 0.99. For example most people play no guitar. 0 if not applicable.',
    },
    source_name: { type: 'string', description: 'The single best source you actually read. Empty if none.' },
    source_url: { type: 'string', description: 'Its URL, exactly as retrieved. Empty if none.' },
    basis: {
      type: 'string',
      description:
        'One sentence: what the numbers are and where they came from. If you could not find real data and reasoned from adjacent figures, say that plainly.',
    },
    caveat: { type: 'string', description: 'One sentence on who is missing from this population, or empty.' },
  },
  required: [
    'understood', 'reason', 'label', 'phrase', 'value', 'unit', 'population',
    'direction', 'more', 'less', 'anchors', 'zero_share', 'source_name',
    'source_url', 'basis', 'caveat',
  ],
}

const SYSTEM = `You turn a question about a person into a statistical distribution.

Rules, in order of importance:

1. NEVER state a percentile, a rank, or how average the person is. That is computed
   elsewhere from the anchors you return. Your job is the distribution, not the verdict.
2. Search the web before answering. Prefer a source that publishes percentiles, deciles or
   quartiles. Failing that, a mean with a spread. Failing that, a participation rate.
3. Only ever put a URL in source_url if you actually retrieved that page in this session.
   Never reconstruct a plausible-looking URL from memory. An empty source_url is a fine
   answer; a fabricated one is not.
4. If you could not find real data, still give your best anchors, and say so explicitly in
   basis, in plain words: "No published distribution found; estimated from ...".
5. Anchors describe the population named in "population", not the whole human race. If the
   question is about a hobby, the natural population is people who do that hobby, and
   zero_share carries everyone who does not.
6. Anchors must be strictly ascending in value and strictly ascending in share, with every
   share strictly between 0 and 1. Put the median at share 0.5.
7. Convert the person's value into the same unit as the anchors before returning it.
8. If the question contains no measurable quantity, set understood to false and stop.

Be concrete and unsentimental. British spelling. Never use an em dash.`

export default async (req) => {
  const origin = req.headers.get('origin') || ''
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors)

  if (!process.env.XAI_API_KEY) {
    return json({ error: 'unconfigured', message: 'No XAI_API_KEY set on this deploy.' }, 503, cors)
  }

  let question = ''
  try {
    const body = await req.json()
    question = String(body.question ?? '').trim()
  } catch {
    return json({ error: 'bad request' }, 400, cors)
  }

  if (question.length < 3) return json({ error: 'too short' }, 400, cors)
  if (question.length > 240) return json({ error: 'too long', message: 'Keep it under 240 characters.' }, 400, cors)

  if (!allow(req)) {
    return json({ error: 'rate limited', message: 'Too many questions at once. Give it a minute.' }, 429, cors)
  }

  let upstream
  try {
    upstream = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: question },
        ],
        tools: [{ type: 'web_search' }],
        max_output_tokens: 2000,
        text: {
          format: { type: 'json_schema', name: 'distribution', schema: SCHEMA, strict: true },
        },
      }),
    })
  } catch (e) {
    return json({ error: 'upstream unreachable', message: String(e).slice(0, 200) }, 502, cors)
  }

  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 400)
    return json({ error: 'upstream error', status: upstream.status, message: detail }, 502, cors)
  }

  const data = await upstream.json()
  const parsed = readPayload(data)
  if (!parsed) return json({ error: 'unreadable', message: 'Grok did not return usable JSON.' }, 502, cors)

  const clean = validate(parsed)
  if (!clean) {
    return json({ understood: false, reason: parsed.reason || 'The answer did not hold together.' }, 200, cors)
  }

  return json({ ...clean, citations: citationsOf(data) }, 200, cors)
}

/** The Responses API can put the text in a few places depending on tool use. */
export function readPayload(data) {
  const candidates = []
  if (typeof data.output_text === 'string') candidates.push(data.output_text)
  for (const item of data.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === 'string') candidates.push(c.text)
      if (c.type === 'output_json' && c.json) return c.json
    }
  }
  for (const text of candidates) {
    try {
      return JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          return JSON.parse(m[0])
        } catch {
          /* keep looking */
        }
      }
    }
  }
  return null
}

function citationsOf(data) {
  const raw = data.citations ?? data.response?.citations ?? []
  const seen = new Set()
  const out = []
  for (const c of raw) {
    const url = typeof c === 'string' ? c : c?.url
    if (!url || seen.has(url) || !/^https?:\/\//.test(url)) continue
    seen.add(url)
    out.push({ url, title: (typeof c === 'object' && c.title) || hostOf(url) })
    if (out.length >= 4) break
  }
  return out
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Nothing reaches the browser without surviving this. A distribution that is
 * not monotonic, or a value a thousand times off its own anchors, is a wrong
 * answer wearing the same clothes as a right one.
 */
export function validate(p) {
  if (!p || p.understood === false) return null
  // Reject the whole payload on one bad anchor rather than quietly dropping it.
  // A share of 1.4 means the model lost the thread, and answering from the two
  // points that happened to survive is how a wrong answer gets a confident face.
  const raw = Array.isArray(p.anchors) ? p.anchors : []
  if (raw.length < 2 || raw.length > 8) return null
  for (const a of raw) {
    if (!Array.isArray(a) || a.length !== 2) return null
    if (!a.every((n) => typeof n === 'number' && isFinite(n))) return null
    if (!(a[1] > 0.001 && a[1] < 0.999)) return null
  }
  const anchors = raw.slice().sort((a, b) => a[0] - b[0])
  for (let i = 1; i < anchors.length; i++) {
    if (!(anchors[i][0] > anchors[i - 1][0])) return null
    if (!(anchors[i][1] > anchors[i - 1][1])) return null
  }

  const value = Number(p.value)
  if (!isFinite(value)) return null
  const lo = anchors[0][0]
  const hi = anchors[anchors.length - 1][0]
  const span = Math.max(hi, Math.abs(lo)) || 1
  if (value > hi + span * 100 || value < lo - span * 100) return null

  const dir = ['high', 'low', 'neutral'].includes(p.direction) ? p.direction : 'high'
  const url = typeof p.source_url === 'string' && /^https?:\/\/\S+$/.test(p.source_url) ? p.source_url : ''

  return {
    understood: true,
    label: str(p.label, 60) || 'this',
    phrase: str(p.phrase, 90) || 'this',
    value,
    unit: str(p.unit, 24),
    population: str(p.population, 70) || 'people',
    direction: dir,
    more: str(p.more, 30) || 'higher',
    less: str(p.less, 30) || 'lower',
    anchors,
    zeroShare: clamp(Number(p.zero_share) || 0, 0, 0.99),
    sourceName: str(p.source_name, 70),
    sourceUrl: url,
    basis: str(p.basis, 320),
    caveat: str(p.caveat, 320),
  }
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function clamp(v, lo, hi) {
  return !isFinite(v) ? lo : Math.min(hi, Math.max(lo, v))
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers })
}

// Best-effort throttle. Lambdas are not shared, so this catches a hammering tab
// rather than a determined attacker. The real ceiling is the spend cap on the key.
const buckets = new Map()
function allow(req) {
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'anon'
  const now = Date.now()
  const b = buckets.get(ip) ?? { count: 0, since: now }
  if (now - b.since > 60_000) {
    b.count = 0
    b.since = now
  }
  b.count++
  buckets.set(ip, b)
  if (buckets.size > 5000) buckets.clear()
  return b.count <= 12
}

export const config = { path: '/api/resolve' }
