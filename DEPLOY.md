# Switching the web search on

Four steps, about five minutes. Everything else is already deployed and tested.

## 1. Create the Netlify site

netlify.com → **Add new site** → **Import an existing project** → GitHub → `off-plate/am-i-average`.

Netlify reads `netlify.toml`, so leave the build settings alone. They should already read:

- Build command `npm run build`
- Publish directory `docs`
- Functions directory `netlify/functions`

## 2. Name it

**Site configuration → Change site name → `am-i-average`**

This matters. The GitHub Pages copy calls `https://am-i-average.netlify.app/api/resolve` by
name, and the function only accepts requests from origins it knows. A different name means
editing two files.

## 3. Add the key

**Site configuration → Environment variables → Add a variable**

| Key | Value |
|---|---|
| `XAI_API_KEY` | your xAI key, the one starting `xai-` |

Optional, only if you want to change the defaults:

| Key | Default | Does |
|---|---|---|
| `XAI_MODEL` | `grok-4.5` | which model answers |
| `RESOLVE_MONTHLY_CAP` | `400` | new web lookups allowed per month |

Then **Deploys → Trigger deploy → Clear cache and deploy site**, because env vars only reach
a fresh build.

## 4. Check it

Open the Netlify URL and ask something the library does not have:

> I practice guitar 5 hours a week

You should get a card stamped `estimated` in red, with a "Read:" line listing the pages it
found. Then ask the same thing on <https://off-plate.github.io/am-i-average/>, which proves
the cross-origin path works.

---

## On the money

**Do not add a payment method to xAI, and do not raise the invoiced billing limit above $0.**

That is the whole safety net. xAI ships with a $0 invoiced limit, so it spends your prepaid
credit and then starts refusing requests. With no card on file there is nothing for it to
charge. When the credit runs out the site says "The Grok credit behind this has run out. The
built-in measures still work." and carries on as a 22-metric toy.

What each new question costs, roughly: a cent or two, because web search is billed per call on
top of tokens. What makes the credit last:

- The 22 built-in measures answer for free, in the browser, and cover the common questions.
- Every web answer is cached **forever and shared by everyone**, in Netlify Blobs. A question
  is paid for once and is free for every visitor after that.
- The monthly cap stops new lookups at 400 and says so.

If you want to watch the spend: xAI console → Usage. If you want to slow it down, drop
`RESOLVE_MONTHLY_CAP`.

A thing worth knowing: the ongoing $150/month data-sharing credits people write about need $5
of spend first and exclude EU countries, so Czechia is out. The sign-up credit is the real one.

## If GitHub Pages should keep working

It does, automatically, and nothing needs doing. Both copies build from the same repo:
Netlify serves from the root, GitHub Pages from `/am-i-average/`, and the client works out
which endpoint to call at runtime. If you would rather retire the Pages copy, delete
`docs/` from the repo and turn Pages off in the GitHub settings.
