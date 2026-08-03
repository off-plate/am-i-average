// The copy engine. Dry, short, never congratulatory.
//
// Lines are picked by hashing the metric and the value, so the same question
// always gets the same answer and reloading does not reroll the joke.

export interface Band {
  id: string
  min: number
  title: string
  lines: string[]
}

export const BANDS: Band[] = [
  {
    id: 'dead-centre',
    min: 92,
    title: 'Dead centre',
    lines: [
      'You are the middle of the graph. Somebody had to be.',
      'If a statistician needed one person to stand in for everyone, it would be you.',
      'This is the most ordinary answer you could have given.',
      'Textbook average. Genuinely, the textbook would use you.',
    ],
  },
  {
    id: 'normal',
    min: 75,
    title: 'Comfortably normal',
    lines: [
      'Slightly off the middle, not enough for anyone to notice.',
      'You would not stand out in a room of a hundred people.',
      'Normal, with a rounding error.',
      'Close enough to the middle that nobody is going to ask about it.',
    ],
  },
  {
    id: 'off-centre',
    min: 50,
    title: 'Off centre',
    lines: [
      'Far enough out that a friend might mention it.',
      'You are noticeably not in the middle, and only just.',
      'This is where "a bit above average" actually lives.',
      'Out of the crowd, nowhere near the edge.',
    ],
  },
  {
    id: 'unusual',
    min: 25,
    title: 'Unusual',
    lines: [
      'Most rooms you walk into, you are the outlier on this.',
      'This one is a fact about you, not a fact about people.',
      'Unusual enough to be worth a sentence at a party.',
      'You have left the middle behind.',
    ],
  },
  {
    id: 'rare',
    min: 8,
    title: 'Rare',
    lines: [
      'You would need a full stadium to find people like you.',
      'This is the tail of the curve, and you are in it.',
      'Rare. Not once-in-a-generation rare, but rare.',
      'Whatever you did to get here, most people did not do it.',
    ],
  },
  {
    id: 'strange',
    min: 0,
    title: 'Statistically strange',
    lines: [
      'You have fallen off the end of the chart.',
      'The data barely has room for you out here.',
      'At this point the curve is mostly empty and you are standing in it.',
      'This is the answer people came to the site hoping to get.',
    ],
  },
]

export function bandFor(averagenessScore: number): Band {
  return BANDS.find((b) => averagenessScore >= b.min) ?? BANDS[BANDS.length - 1]
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function verdictLine(band: Band, seed: string): string {
  return band.lines[hash(seed) % band.lines.length]
}

/** "Taller than 74 of every 100 men in Czechia." */
export function rankSentence(
  cdfValue: number,
  more: string,
  less: string,
  segmentLabel: string,
): string {
  const above = Math.round(cdfValue * 100)
  if (above >= 50) {
    return `${cap(more)} than ${above} of every 100 ${segmentLabel}.`
  }
  return `${cap(less)} than ${100 - above} of every 100 ${segmentLabel}.`
}

export function rarityLine(n: number | null, more: string, less: string, high: boolean): string | null {
  if (n === null) return null
  const rounded = n >= 100 ? Math.round(n / 10) * 10 : Math.round(n)
  return `1 in ${rounded.toLocaleString('en-US')} is further ${high ? more : less} than you.`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const CONFIDENCE_TEXT: Record<string, string> = {
  measured: 'the source publishes these percentiles',
  fitted: 'fitted to published anchor points',
  modelled: 'one published average, spread assumed',
}
