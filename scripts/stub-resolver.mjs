// A fake Grok, so the whole AI path can be exercised without a key or a bill.
// Returns the shape the real function returns, for a couple of canned questions.
import { createServer } from 'node:http'

const ANSWERS = {
  guitar: {
    understood: true,
    label: 'guitar practice',
    phrase: 'practising guitar 5 hours a week',
    value: 5,
    unit: 'hours/week',
    population: 'people who play guitar',
    direction: 'high',
    more: 'more practised',
    less: 'less practised',
    anchors: [[1, 0.25], [2.5, 0.5], [6, 0.8], [14, 0.95]],
    zeroShare: 0.88,
    sourceName: 'Fender player research',
    sourceUrl: 'https://example.org/fender-player-report',
    basis: 'Median weekly practice among people who own a guitar, from a published player survey.',
    caveat: 'Counts only people who own a guitar. Most adults do not.',
    citations: [
      { url: 'https://example.org/fender-player-report', title: 'fender.com' },
      { url: 'https://example.org/music-participation', title: 'nea.gov' },
    ],
  },
  coffee: {
    understood: true,
    label: 'coffee',
    phrase: 'drinking 6 cups of coffee a day',
    value: 6,
    unit: 'cups/day',
    population: 'American coffee drinkers',
    direction: 'high',
    more: 'more caffeinated',
    less: 'less caffeinated',
    anchors: [[1, 0.2], [2, 0.45], [3, 0.7], [5, 0.93]],
    zeroShare: 0.34,
    sourceName: 'National Coffee Association',
    sourceUrl: 'https://example.org/nca-trends',
    basis: 'Cups per day among past-day coffee drinkers, from the annual consumption survey.',
    caveat: '',
    citations: [{ url: 'https://example.org/nca-trends', title: 'ncausa.org' }],
  },
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  let body = ''
  for await (const chunk of req) body += chunk
  const q = (JSON.parse(body || '{}').question || '').toLowerCase()

  await new Promise((r) => setTimeout(r, 700)) // let the pending state be visible

  const key = Object.keys(ANSWERS).find((k) => q.includes(k))
  res.setHeader('Content-Type', 'application/json')
  if (!key) {
    return res.end(JSON.stringify({ understood: false, reason: 'The stub only knows guitar and coffee.' }))
  }
  res.end(JSON.stringify(ANSWERS[key]))
}).listen(8788, () => console.log('stub resolver on http://localhost:8788'))
