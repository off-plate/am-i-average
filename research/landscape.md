# What already exists, and the gap

Researched 2026-08-03, before any code was written.

## What is out there

The space is crowded, and almost all of it is SEO furniture.

**Single-metric calculator pages.** Hundreds of them, all built to rank for one search term.
`dqydj.com/income-percentile-calculator` (the best of them, and the source we use for US
income), `gigacalculator.com` for height, `iq-test.world` for IQ, plus a long tail of
`realtakehomepay.com`, `wealthvieu.com`, `calcinum.com` and similar. Each answers one
question, in a form, wrapped in 2,000 words of filler.

**Multi-metric hubs.** `percentilecalculator.us` and, the closest thing to a direct
competitor, **`findmypercentile.com`**: 22 topics across Body, Mind, Fitness, Lifestyle and
Fun, with a playful tone and emoji category headers.

## Where the gap is

Fetched findmypercentile.com and read it properly. Three things stand out:

1. **It is a grid of separate calculators.** You pick a tile, then fill a form. There is no
   single input, and nothing understands a sentence.
2. **It publishes no sources.** No methodology, no attribution, no dataset named anywhere on
   the page. The numbers may well be fine. There is no way to tell, and that is the point.
3. **It answers the wrong question.** Like every other site in the space, it tells you your
   **percentile**. Nobody asks "what percentile am I". They ask "am I normal".

## The three decisions that came out of this

**One sentence in, not a form.** The whole interaction is a single text field that continues
the headline. "Am I average? *if I run 1 km in 4 minutes*". Rule-based parsing, no model, so
it is instant and free. The parser is the product's front door and the thing nobody else has.

**Averageness, not percentile.** The headline number is 100 at the median and 0 at either
extreme. The percentile is still there, underneath, in the sentence. This reframes the whole
thing: on a percentile site being at the 96th is a win, and here it makes you *strange*, which
is funnier and much more shareable. It also makes the site answer the question in its name.

**Provenance is the feature.** Every card names its source, links it, says what the number
actually is, and stamps how honest the distribution is (`measured` / `fitted` / `modelled`).
This is the one thing the competition cannot copy without doing the work, and it is what makes
the answers worth screenshotting.

## What we did not build, and why

- **A live API layer.** Considered pulling income and running data at runtime. Rejected: CORS,
  rate limits, keys, and a site that breaks when someone else's server does. The data changes
  once a year at most. It is baked in with a date on it.
- **Sport-by-sport participation rates.** The plan was "9% of Americans play basketball at all,
  so 2 hours a week already puts you in the top few percent". The SFIA topline report publishes
  the aggregate (250 million active Americans, 32% clearing 150 minutes a week) but not the
  per-sport counts we would need, and the per-sport numbers floating around online are
  uncited. Left out rather than guessed. The generic exercise-hours metric covers the question
  honestly in the meantime. **This is the first thing to add when a real source turns up.**
- **An LLM fallback for unparsed sentences.** Tempting, and it would break the no-backend,
  no-key, works-offline promise for a handful of edge cases. The miss card offers working
  examples instead.
