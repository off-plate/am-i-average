# Am I Average?

**WHAT** A one-input toy: type a sentence with a number in it, get told how average you are.
**WHO** Anyone who has ever wondered where they sit. Shareable, no signup, no account.
**WHY** Every percentile site answers "where do I rank". None answers "how ordinary am I", which is the funnier question.
**MUST** Real cited data on every card. The library answers in the browser; only a miss goes to the web. Under 200KB.
**DONE** A stranger types a sentence, gets a believable answer in under a second, and can see where the number came from.
**ASK** Before adding a metric with no published source, before adding a second accent colour, before adding a framework.

---

## The rule that matters most

**A metric with no real source does not ship.** Every entry in `src/data/metrics.ts` carries
`source: { name, url, note, confidence }` and the confidence stamp is printed on the card:

| stamp | means |
|---|---|
| `measured` | the source publishes the percentiles; we interpolate between them |
| `fitted` | fitted to two or more published anchors |
| `modelled` | one published average plus an assumed spread. A party trick, and it says so. |

If you cannot honestly pick one of those three, the metric is not ready. Do not invent a
percentile table and attribute it to a real organisation. The whole product rests on the
numbers being checkable, and one fabricated table would make the other twenty-one worthless.

Raw scrapes live in `research/raw/`. `src/data/tables.ts` is generated from them and says so
at the top. Do not hand-edit it.

## Architecture

Vanilla TypeScript on Vite. No framework, no state library, no component kit. There is one
screen and the whole app is six files.

```
src/units.ts        pulls quantities with units out of a sentence
src/parse.ts        scores metrics against the words, assigns the numbers
src/stats.ts        cdf, averageness, the anchor interpolation
src/data/metrics.ts the library. every metric, every source
src/data/tables.ts  GENERATED from research/raw/
src/verdicts.ts     the copy engine
src/ui/pictogram.ts the 100 figures
src/main.ts         render
```

```
src/resolve.ts             the web fallback, client side
netlify/functions/resolve.mjs   the proxy that holds the key
```

## The two-tier answer

**The library is the fast path and it must stay precise.** Keyword scoring and unit matching,
in the browser, instant and free. **Only a miss goes to the web**, where Grok searches and
returns a distribution.

The rule that keeps this honest: **the model never returns a percentile.** It returns anchor
points on a cumulative distribution plus the pages it read. Our own maths turns that into a
score, exactly as it does for the hand-sourced metrics. The model supplies the shape of the
data, never the answer.

Everything it sends is validated in `netlify/functions/resolve.mjs` before it reaches the
browser, and **one bad anchor rejects the whole payload** rather than being quietly dropped.
Answering from the two points that happened to survive is how a wrong answer gets a confident
face. AI answers are always stamped `estimated`, whatever the model claims about its own
rigour, because nobody on our side checked the table.

**Do not let a units-only match answer when several metrics could claim the number.**
"5 hours a week" fits a half marathon, sleep, screen time and exercise. Guessing produced
"I practice guitar 5 hours a week" → "Running a half marathon in 5:00:00", which is exactly
the failure the web fallback exists to remove. `parse()` enforces this; there are regression
tests for it, and they stay.

Widen the local keyword list when a *common* question misses. Do not widen it with generic
words like `play` or `practice`, which belong to guitar and chess as much as to sport.

## Design

Read `Jarvis/.claude/design/DESIGN.md` first. This project's own tokens, which override it:

- Named reference: **Otto Neurath's Isotype**, printed as a statistical almanac.
- Paper `#F3EEE3`, ink `#17140F`, one accent `#D8401C`. Dark scheme swaps the first two.
- **One accent. No second colour, no gradient, no shadow anywhere.**
- Type: Bespoke Slab 700 (display) and Tabular 400/700 (everything else), self-hosted from
  Fontshare. Two families, three files, 48KB. Do not add a third.
- Radius 3px maximum. Hairlines, never shadows.
- Two easing curves, both in `:root`. One signature motion: the figures stamp in and yours
  lands last. Nothing else animates.
- Charts are figures, never bars. To show more, draw more figures. Never a bigger figure.

## Working on it

```bash
npm run dev      # vite
npm run test     # parser + maths checks, run this before every commit
npm run test:ai  # the guard rails on the AI payload
npm run build    # -> docs/, which is what GitHub Pages serves

# exercise the web path with no key and no bill:
node scripts/stub-resolver.mjs &
VITE_RESOLVER="http://localhost:8788" npm run build && npm run preview
```

The key lives only in the Netlify env as `XAI_API_KEY`, never in the repo and never in the
bundle. `XAI_MODEL` overrides the model, default `grok-4.5`.

## Money

This runs on a prepaid xAI credit with **no card behind it**. xAI defaults to a $0 invoiced
limit, so when the credit is gone the API returns 403 and the site falls back to the library.
It cannot generate a bill. **Do not add a payment method or raise the invoiced limit.**

Web search is billed per call on top of tokens, so a new question costs roughly one to two
cents. Three things keep that in check, and all three must stay:

1. **The library answers first.** Every question it covers costs nothing.
2. **`aia-answers` in Netlify Blobs caches every answer forever, shared by all visitors.** A
   question is paid for once, ever. The browser has its own 30-day cache in front of that.
3. **`RESOLVE_MONTHLY_CAP`, default 400 new lookups a month**, counted in Blobs. Past the cap
   the site says so plainly and keeps working on the library.

If cost ever becomes a problem the first move is promoting the most-asked cached answers into
`src/data/metrics.ts` as properly sourced metrics, not turning off the cache.

`npm run test` checks that twenty real sentences parse to the right metric and value, that
every metric parses its own examples, and that no distribution is non-monotonic. Add a case to
`scripts/check.ts` whenever you add a metric or touch the parser.

## Adding a metric

1. Find a real published source. Percentile tables beat means. Write down the URL.
2. If it needs scraping, script it into `research/raw/` and regenerate `tables.ts`.
3. Add the metric with an honest `confidence`, a `range` that rejects nonsense, and `keys`
   specific enough not to steal numbers from a neighbouring metric. Generic units like `kg`
   must never be keys.
4. Add an `examples` entry. The test suite will hold you to it.
5. Run `npm run test`, then screenshot it.

## Memory

Save anything durable to Claude Code memory: decisions about sources, rejected approaches,
Michael's reactions to the design. Do not record what this file already says.
