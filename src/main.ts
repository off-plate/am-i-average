import './styles.css'
import { parse, reparseAs } from './parse'
import type { Reading } from './parse'
import { averageness, cdf, oneInN, pictogramIndex } from './stats'
import { distFor, METRICS, BY_ID } from './data/metrics'
import type { Metric } from './data/metrics'
import { bandFor, CONFIDENCE_TEXT, rankSentence, rarityLine, verdictLine } from './verdicts'
import { injectFigure, pictogram } from './ui/pictogram'

const EXAMPLES = [
  'I run 1 km in 4 minutes',
  'I train basketball 2 hours a week',
  'I make $1000 a month in the US',
  "I'm 183 cm tall, Czech guy",
  'I bench 100kg at 85kg bodyweight',
  'I sleep 6 hours a night',
  'my chess rating is 1450',
  'I read 20 books a year',
]

interface Answer {
  id: number
  reading: Reading
  input: string
  cdfValue: number
  rankFraction: number
  score: number
}

let nextId = 1
const answers: Answer[] = []

const form = document.querySelector<HTMLFormElement>('#ask')!
const input = document.querySelector<HTMLInputElement>('#q')!
const results = document.querySelector<HTMLElement>('#results')!
const tally = document.querySelector<HTMLElement>('#tally')!
const chips = document.querySelector<HTMLElement>('#examples')!

injectFigure()

const sourceCount = new Set(METRICS.map((m) => m.source.name)).size
document.querySelector<HTMLElement>('#count')!.textContent =
  `${METRICS.length} measures, ${sourceCount} public datasets`

chips.innerHTML = EXAMPLES.map(
  (e) => `<button type="button" class="chip" data-q="${attr(e)}">${esc(e)}</button>`,
).join('')

chips.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip')
  if (!b) return
  input.value = b.dataset.q ?? ''
  ask(input.value)
})

form.addEventListener('submit', (e) => {
  e.preventDefault()
  ask(input.value)
})

results.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-instead]')
  if (target) {
    const metric = BY_ID.get(target.dataset.instead!)
    const sentence = target.dataset.for ?? ''
    if (!metric) return
    const reading = reparseAs(sentence, metric)
    const cardId = Number(target.dataset.card)
    if (reading) replaceAnswer(cardId, reading, sentence)
    return
  }
  const seg = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-seg]')
  if (seg) {
    const id = Number(seg.dataset.card)
    const a = answers.find((x) => x.id === id)
    const next = a?.reading.metric.segments.find((s) => s.id === seg.dataset.seg)
    if (a && next) {
      const updated = toAnswer({ ...a.reading, segment: next }, a.input)
      updated.id = a.id
      answers[answers.indexOf(a)] = updated
      document.getElementById(`card-${a.id}`)!.outerHTML = card(updated)
      renderTally()
    }
    return
  }
  const drop = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-drop]')
  if (drop) {
    const id = Number(drop.dataset.drop)
    const i = answers.findIndex((a) => a.id === id)
    if (i >= 0) answers.splice(i, 1)
    document.getElementById(`card-${id}`)?.remove()
    renderTally()
  }
})

function ask(raw: string): void {
  const sentence = raw.trim()
  if (!sentence) return
  const result = parse(sentence)

  if (result.readings.length === 0) {
    results.insertAdjacentHTML('afterbegin', missCard(sentence, result.unmatched.length > 0))
    input.select()
    reveal()
    return
  }

  for (const reading of result.readings.slice().reverse()) {
    const answer = toAnswer(reading, sentence)
    answers.unshift(answer)
    results.insertAdjacentHTML('afterbegin', card(answer))
  }
  renderTally()
  input.select()
  reveal()
}

/** The answer lands below the fold on a phone. Take the reader to it. */
function reveal(): void {
  const el = results.firstElementChild
  if (!el) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

function replaceAnswer(id: number, reading: Reading, sentence: string): void {
  const i = answers.findIndex((a) => a.id === id)
  if (i < 0) return
  const answer = toAnswer(reading, sentence)
  answers[i] = answer
  const el = document.getElementById(`card-${id}`)
  if (el) el.outerHTML = card(answer)
  renderTally()
}

function toAnswer(reading: Reading, sentence: string): Answer {
  const dist = distFor(reading.segment, reading.ctx)
  const cdfValue = cdf(dist, reading.value)
  const rankFraction = reading.metric.direction === 'low' ? 1 - cdfValue : cdfValue
  return {
    id: nextId++,
    reading,
    input: sentence,
    cdfValue,
    rankFraction,
    score: averageness(cdfValue),
  }
}

function card(a: Answer): string {
  const { metric, segment } = a.reading
  const band = bandFor(a.score)
  const you = pictogramIndex(a.rankFraction)
  const rank = rankSentence(a.rankFraction, metric.more, metric.less, segment.label)
  const rarity = rarityLine(oneInN(a.cdfValue), metric.more, metric.less, a.rankFraction > 0.5)
  const verdict = verdictLine(band, metric.id + a.reading.value)
  const alts = a.reading.alternatives.filter((m) => m.id !== metric.id)

  return `
<article class="card" id="card-${a.id}">
  <div class="card__lead">
    <h2 class="card__what">${esc(cap(metric.phrase(a.reading.value)))}</h2>
    <p class="score"><b>${Math.round(a.score)}</b><span>% average</span></p>
    <p class="band">${esc(band.title)}</p>
    <p class="verdict">${esc(verdict)}</p>
  </div>

  <div class="card__chart">
    ${pictogram({ you, label: `${rank} You are figure ${you} of 100.` })}
    <p class="rank">${esc(rank)}</p>
    ${rarity ? `<p class="rarity">${esc(rarity)}</p>` : ''}
  </div>

  <footer class="card__foot">
    <p class="stamp">
      <a href="${attr(metric.source.url)}" target="_blank" rel="noopener">${esc(metric.source.name)}</a>
      <span class="dot">/</span>${esc(metric.source.note)}
      <span class="dot">/</span><span class="conf conf--${metric.source.confidence}">${esc(metric.source.confidence)}</span>,
      ${esc(CONFIDENCE_TEXT[metric.source.confidence] ?? '')}
    </p>
    ${metric.caveat ? `<p class="caveat">${esc(metric.caveat)}</p>` : ''}
    ${a.reading.weak ? `<p class="caveat">Read as ${esc(metric.label)} from the units alone, with nothing in the sentence to confirm it.</p>` : ''}
    <div class="controls">
      ${
        otherSegments(a).length
          ? `<p class="control"><span>Compared with ${esc(segment.label)}. Try</span>${otherSegments(a)
              .map((s) => `<button type="button" data-seg="${attr(s.id)}" data-card="${a.id}">${esc(s.label)}</button>`)
              .join('')}</p>`
          : ''
      }
      ${
        alts.length
          ? `<p class="control"><span>Meant something else?</span>${alts
              .map(
                (m) =>
                  `<button type="button" data-instead="${attr(m.id)}" data-for="${attr(a.input)}" data-card="${a.id}">${esc(m.label)}</button>`,
              )
              .join('')}</p>`
          : ''
      }
      <button type="button" class="drop" data-drop="${a.id}">Remove</button>
    </div>
  </footer>
</article>`
}

/**
 * Which other populations are worth offering. Swapping sex first, because that
 * is the assumption the site most often makes without being told.
 */
function otherSegments(a: Answer) {
  const cur = a.reading.segment
  const all = a.reading.metric.segments.filter((s) => s.id !== cur.id)
  const sameCountry = all.filter((s) => s.country === cur.country)
  const rest = all.filter((s) => s.country !== cur.country && (!cur.sex || s.sex === cur.sex))
  return [...sameCountry, ...rest].slice(0, 3)
}

function missCard(sentence: string, hadNumber: boolean): string {
  const suggestions = METRICS.filter((m) => m.examples?.length)
    .slice(0, 6)
    .map((m) => `<button type="button" class="chip" data-q="${attr(m.examples![0])}">${esc(m.examples![0])}</button>`)
    .join('')
  return `
<article class="card card--miss">
  <div class="card__lead">
    <h2 class="card__what">No idea, sorry</h2>
    <p class="verdict">${
      hadNumber
        ? `There is a number in ${esc(quote(sentence))} but nothing in the library measures it yet.`
        : `${esc(quote(sentence))} has no number in it. Give it one.`
    }</p>
  </div>
  <div class="card__chart">
    <p class="rank">The library covers ${METRICS.length} things so far. These all work:</p>
    <div class="chips">${suggestions}</div>
  </div>
</article>`
}

function renderTally(): void {
  const unique = new Map<string, Answer>()
  for (const a of answers) if (!unique.has(a.reading.metric.id)) unique.set(a.reading.metric.id, a)
  const list = [...unique.values()]
  if (list.length < 2) {
    tally.hidden = true
    tally.innerHTML = ''
    return
  }
  const overall = list.reduce((s, a) => s + a.score, 0) / list.length
  const band = bandFor(overall)
  const most = list.reduce((a, b) => (a.score > b.score ? a : b))
  const least = list.reduce((a, b) => (a.score < b.score ? a : b))
  tally.hidden = false
  tally.innerHTML = `
    <p class="tally__score"><b>${Math.round(overall)}</b><span>% average overall</span></p>
    <p class="tally__band">${esc(band.title)}, across ${list.length} things</p>
    <p class="tally__spread">
      Most ordinary: ${esc(most.reading.metric.label)}, ${Math.round(most.score)}%.
      Least: ${esc(least.reading.metric.label)}, ${Math.round(least.score)}%.
    </p>`
}

// Delegate clicks on the suggestion chips inside a miss card too.
results.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip')
  if (!chip) return
  input.value = chip.dataset.q ?? ''
  ask(input.value)
})

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function attr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function quote(s: string): string {
  return `“${s.length > 60 ? s.slice(0, 60) + '…' : s}”`
}

// Deep link: /?q=I+run+5k+in+22:30
const q = new URLSearchParams(location.search).get('q')
if (q) {
  input.value = q
  ask(q)
}

export type { Metric }
