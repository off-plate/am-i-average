// Checks the guard rails on the AI path. Everything here is a payload the model
// could plausibly hand us, and everything bad must be refused rather than
// rendered as a confident answer.
import { validate, readPayload } from '../netlify/functions/resolve.mjs'

const GOOD = {
  understood: true,
  label: 'guitar practice',
  phrase: 'practising guitar 5 hours a week',
  value: 5,
  unit: 'hours/week',
  population: 'people who play guitar',
  direction: 'high',
  more: 'more practised',
  less: 'less practised',
  anchors: [[1, 0.25], [3, 0.5], [10, 0.85]],
  zero_share: 0.9,
  source_name: 'Fender player survey',
  source_url: 'https://example.org/report',
  basis: 'Median weekly practice from a published player survey.',
  caveat: '',
}

const CASES = [
  ['a well formed payload', GOOD, true],
  ['understood: false', { ...GOOD, understood: false }, false],
  ['one anchor only', { ...GOOD, anchors: [[3, 0.5]] }, false],
  ['shares going backwards', { ...GOOD, anchors: [[1, 0.6], [3, 0.5], [10, 0.85]] }, false],
  ['values going backwards', { ...GOOD, anchors: [[10, 0.25], [3, 0.5], [1, 0.85]] }, false],
  ['share of exactly 0', { ...GOOD, anchors: [[1, 0], [3, 0.5], [10, 0.85]] }, false],
  ['share above 1', { ...GOOD, anchors: [[1, 0.25], [3, 0.5], [10, 1.4]] }, false],
  ['duplicate values', { ...GOOD, anchors: [[3, 0.25], [3, 0.5], [10, 0.85]] }, false],
  ['NaN in the anchors', { ...GOOD, anchors: [[1, 0.25], ['x', 0.5], [10, 0.85]] }, false],
  ['no value', { ...GOOD, value: undefined }, false],
  ['value absurdly far outside the anchors', { ...GOOD, value: 1e9 }, false],
  ['bad direction falls back', { ...GOOD, direction: 'sideways' }, true],
  ['fabricated non-url is dropped', { ...GOOD, source_url: 'the fender survey' }, true],
  ['zero_share above 1 is clamped', { ...GOOD, zero_share: 4 }, true],
]

let fails = 0
for (const [name, payload, shouldPass] of CASES) {
  const got = validate(payload) !== null
  if (got !== shouldPass) {
    fails++
    console.log(`FAIL  ${name}: expected ${shouldPass ? 'accept' : 'reject'}, got ${got ? 'accept' : 'reject'}`)
  } else {
    console.log(`ok    ${name}`)
  }
}

const bad = validate({ ...GOOD, source_url: 'the fender survey' })
if (bad.sourceUrl !== '') {
  fails++
  console.log('FAIL  a non-url survived into sourceUrl')
}
const clamped = validate({ ...GOOD, zero_share: 4 })
if (clamped.zeroShare !== 0.99) {
  fails++
  console.log(`FAIL  zero_share not clamped: ${clamped.zeroShare}`)
}

// The Responses API puts the JSON in different places depending on tool use.
const SHAPES = [
  ['output_text', { output_text: JSON.stringify(GOOD) }],
  ['output[].content[].text', { output: [{ content: [{ text: JSON.stringify(GOOD) }] }] }],
  ['output_json', { output: [{ content: [{ type: 'output_json', json: GOOD }] }] }],
  ['prose wrapped around json', { output_text: 'Here you go:\n' + JSON.stringify(GOOD) + '\nHope that helps.' }],
]
for (const [name, shape] of SHAPES) {
  const got = readPayload(shape)
  if (!got || got.label !== GOOD.label) {
    fails++
    console.log(`FAIL  could not read shape: ${name}`)
  } else {
    console.log(`ok    reads ${name}`)
  }
}

console.log(fails === 0 ? `\nresolver guards hold` : `\n${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
