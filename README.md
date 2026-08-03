# Am I average?

Type a sentence with a number in it. Find out how ordinary you are.

**Live:** https://off-plate.github.io/am-i-average/

```
Am I average?  if I run 1 km in 4 minutes

  Running 1 km in 4:00
  8% average · Statistically strange
  Faster than 96 of every 100 race finishers.
  1 in 26 is further faster than you.
  RunRepeat, 35M race results / fitted
```

Twenty-two measures, fifteen public datasets. Every card cites its source and says how
confident the distribution is. No AI, no backend, no tracking, 104KB.

## How it works

The sentence is read by keyword scoring and unit matching, in your browser. It finds the
numbers, works out what they measure, converts them, and looks the value up against a
published distribution. Then it draws a hundred people and colours in the one that is you.

The headline number is **averageness**, not percentile: 100 if you are dead median, 0 at
either extreme. That is the question the site is named after, and no other percentile site
answers it.

## Data

Every metric names its source and stamps how it was turned into a distribution:

- `measured` the source publishes the percentiles
- `fitted` fitted to two or more published anchors
- `modelled` one published average plus an assumed spread

Sources include RunRepeat (35M race results), StrengthLevel (48M logged lifts), IPUMS CPS via
DQYDJ, NCD-RisC, the Czech Statistical Office, Lichess, CDC NHIS, Gallup and Pew.

## Running it

```bash
npm install
npm run dev
npm run test     # 20 sentence cases + distribution sanity checks
npm run build    # -> docs/
```

Deployed from `docs/` on the default branch.

## Credits

Set in [Bespoke Slab and Tabular](https://fontshare.com) from the Indian Type Foundry.
Figures after Otto Neurath's Isotype, drawn for this page.
