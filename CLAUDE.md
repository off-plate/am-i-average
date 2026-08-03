# Am I Average?

**WHAT** A one-input toy: type a sentence with a number in it, get told how average you are.
**WHO** Anyone who has ever wondered where they sit. Shareable, no signup, no account.
**WHY** Every percentile site answers "where do I rank". None answers "how ordinary am I", which is the funnier question.
**MUST** Real cited data on every card. No AI at runtime. No backend. Under 200KB. Works offline after first load.
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

**No AI at runtime, ever.** The parser is keyword scoring and unit matching. That is a
feature, not a limitation: it answers instantly, costs nothing, works offline, and can always
explain why it read a sentence the way it did. If it fails to understand something, widen the
keyword list or add a unit rule. Do not reach for a model.

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
npm run build    # -> docs/, which is what GitHub Pages serves
```

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
