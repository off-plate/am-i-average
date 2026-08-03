// Percentile maths. No dependencies, no magic.
//
// Everything reduces to one number: cdf(x) = the fraction of the reference
// population sitting below x. Every verdict on the site is derived from that.

/** Abramowitz & Stegun 7.1.26. Good to ~1e-7, which is far past what we display. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/** Inverse normal CDF (Acklam's rational approximation). */
export function probit(p: number): number {
  if (p <= 0) return -8
  if (p >= 1) return 8
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924]
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857]
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878]
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742]
  const pl = 0.02425
  let q: number, r: number
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  q = p - 0.5
  r = q * q
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
}

// ---------------------------------------------------------------------------

export type Dist =
  /** Fitted normal. mean and sd in the metric's canonical unit. */
  | { kind: 'normal'; mean: number; sd: number }
  /** Fitted lognormal. `median` in canonical units, `sigma` is the sd of ln(x). */
  | { kind: 'lognormal'; median: number; sigma: number }
  /**
   * Published percentile anchors: [value, cdf] pairs, value-ascending.
   * Interpolated linearly in (log-value, z) space, which is what makes a
   * four-anchor table behave sensibly instead of kinking at every point.
   * `zeroMass` is the share of the population sitting at exactly zero
   * (people who do none of the thing at all).
   */
  | { kind: 'anchors'; points: [number, number][]; log?: boolean; zeroMass?: number }

/** Fraction of the population below x. Always returns 0..1. */
export function cdf(dist: Dist, x: number): number {
  switch (dist.kind) {
    case 'normal':
      return clamp01(normalCdf((x - dist.mean) / dist.sd))
    case 'lognormal':
      if (x <= 0) return 0
      return clamp01(normalCdf((Math.log(x) - Math.log(dist.median)) / dist.sigma))
    case 'anchors':
      return clamp01(anchorCdf(dist, x))
  }
}

function anchorCdf(
  dist: { points: [number, number][]; log?: boolean; zeroMass?: number },
  x: number,
): number {
  const zeroMass = dist.zeroMass ?? 0
  if (zeroMass > 0 && x <= 0) return zeroMass / 2 // sitting inside the pile at zero

  const useLog = dist.log !== false
  // Transform anchors into (t, z) space so interpolation is smooth and the
  // tails extrapolate along a straight line instead of falling off a cliff.
  const pts = dist.points
    .filter((p) => (useLog ? p[0] > 0 : true) && p[1] > 0 && p[1] < 1)
    .map((p) => [useLog ? Math.log(p[0]) : p[0], probit(p[1])] as [number, number])
    .sort((a, b) => a[0] - b[0])

  if (pts.length === 0) return 0.5
  if (pts.length === 1) return clamp01(normalCdf(pts[0]![1]))

  const t = useLog ? Math.log(Math.max(x, 1e-9)) : x

  // Below the first anchor / above the last: continue the outermost slope.
  const first = pts[0]!
  const second = pts[1]!
  if (t <= first[0]) {
    const slope = (second[1] - first[1]) / (second[0] - first[0])
    return clamp01(normalCdf(first[1] + slope * (t - first[0])))
  }
  const last = pts[pts.length - 1]!
  const penult = pts[pts.length - 2]!
  if (t >= last[0]) {
    const slope = (last[1] - penult[1]) / (last[0] - penult[0])
    return clamp01(normalCdf(last[1] + slope * (t - last[0])))
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (t >= a[0] && t <= b[0]) {
      const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0])
      return clamp01(normalCdf(a[1] + f * (b[1] - a[1])))
    }
  }
  return 0.5
}

/** Fit a lognormal through two published percentile anchors. */
export function fitLognormal(
  v1: number,
  p1: number,
  v2: number,
  p2: number,
): { kind: 'lognormal'; median: number; sigma: number } {
  const z1 = probit(p1)
  const z2 = probit(p2)
  const sigma = (Math.log(v2) - Math.log(v1)) / (z2 - z1)
  const median = Math.exp(Math.log(v1) - z1 * sigma)
  return { kind: 'lognormal', median, sigma }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// ---------------------------------------------------------------------------
// The scores the site actually shows.

/**
 * How average you are, 0 to 100. Dead median is 100. Either extreme is 0.
 * This is the whole point of the site: percentile tells you where you rank,
 * averageness tells you how unremarkable that rank is.
 */
export function averageness(cdfValue: number): number {
  return (1 - Math.abs(cdfValue - 0.5) * 2) * 100
}

/** Share of the population further from the middle than you, on your side. */
export function tailShare(cdfValue: number): number {
  return Math.min(cdfValue, 1 - cdfValue)
}

/** "1 in N people are further out than you." Returns null when you are near the middle. */
export function oneInN(cdfValue: number): number | null {
  const tail = tailShare(cdfValue)
  if (tail <= 0) return null
  const n = 1 / tail
  if (n < 3) return null
  return n
}

/**
 * Position out of 100 for the pictogram, 1..100. Uses the rank direction so
 * "you" always reads left-to-right the way the metric is worded.
 */
export function pictogramIndex(cdfValue: number): number {
  return Math.min(100, Math.max(1, Math.round(cdfValue * 100 + 0.5)))
}

/** Combine several averageness scores into one honest overall figure. */
export function overallAverageness(scores: number[]): number {
  if (scores.length === 0) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}
