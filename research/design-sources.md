# Where design assets actually come from

Written 2026-08-03 while building **Am I Average?**. This is the companion to
`Jarvis/.claude/design/DESIGN.md`. That file says what NOT to make. This one says where the
raw material comes from when you want to make something that isn't slop.

Everything below was tested from the terminal on the date above. Where something does not
work, it says so, because a list of sources that half-work is worse than a short list that does.

---

## The blunt answer on Dribbble

**You cannot pull UI elements off Dribbble. Not technically, and not legally.**

Technically: the Dribbble API v2 was cut back to almost nothing. It returns *the authenticated
user's own* profile, shots and projects. There is no endpoint for browsing other people's work,
and their own help docs say the popular-shots feed is not available. Every "display Dribbble
shots on your site" tutorial you find is showing you how to display *your own* shots. So there
is no version of "fetch the trending UI shots and use the components" that exists as an API call.

Legally, and this matters more: a Dribbble shot is a **static image of someone's copyrighted
design**. There is no code in it. There is no license granting reuse. Reproducing one closely
is the same problem as copying any other piece of commercial artwork, and "an AI redrew it"
is not a defence.

**What Dribbble is actually for:** looking, by eye, to build taste, and then naming a specific
thing in a brief. "The vertical ticket-stub layout with the perforated edge" is a usable
instruction. "Make it look like Dribbble" is how you end up with the 2024 gradient again.

The same applies to Behance, Pinterest, Awwwards, Mobbin, and every "UI inspiration" gallery.
They are eyes-only. Treat them as a museum, not a warehouse.

### The trap on the other side

The obvious move when you want "components for free" is a copy-paste library. Searching that
phrase in 2026 returns, in order: Magic UI, Aceternity UI, Cult UI, Origin UI, shadcn registry.
**Those are the exact libraries DESIGN.md forbids by name.** They are not a shortcut past the
visual mean, they *are* the visual mean, and they are the reason every AI-built site since 2024
has the same border beam and the same bento grid. Pasting from them is the failure mode, not
the fix.

So: no galleries, no component libraries. What is left is better than both.

---

## What genuinely works, tested

The principle: take **raw material** (typefaces, public-domain artwork, real photographs,
licensed illustration) and do the composition yourself. Raw material is free, legal, endlessly
available, and carries no other project's fingerprints. Components carry someone else's taste
and everyone else's too.

### 1. Typefaces — Fontshare

The single highest-leverage source. One good typeface changes a page more than any component
will, and typeface choice is the number-one AI tell (Inter, Geist) which makes it the
number-one thing to fix.

100 families, all free for commercial use, all self-hostable, no key, no signup.

```bash
# full catalogue as JSON
curl -s "https://api.fontshare.com/v2/fonts?limit=100" | python3 -c "
import sys,json
for f in json.load(sys.stdin)['fonts']:
    print(f\"{f['name']:22} {f.get('category','')}\")"

# the CSS endpoint gives you the real file URLs
curl -s "https://api.fontshare.com/v2/css?f%5B%5D=bespoke-slab@400,700"
```

The JSON `styles[].file` field returns a URL **without an extension**. Append `.woff2`
yourself, or just parse the CSS endpoint, which has full URLs. Then download the woff2 and
commit it to `public/fonts/`. Do not hotlink the CDN: self-hosting is one less DNS lookup,
survives the CDN going down, and preloads properly.

Non-obvious ones worth knowing about, since everyone stops at Satoshi and Clash Display:
`Bespoke Slab`, `Tabular` (built for numbers), `Gambarino`, `Zodiak`, `Chubbo`, `Melodrama`,
`Erode`, `Boska`, `Rowan`, `Neco`, `Trench Slab`.

**Other type sources of the same quality:** Google Fonts (has an official API,
`https://www.googleapis.com/webfonts/v1/webfonts?key=...`, needs a free key; the good stuff
there is Literata, Newsreader, Fraunces, Bricolage Grotesque, not Inter),
Velvetyne (`velvetyne.fr`, French libre foundry, genuinely weird and free),
Collletttivo (`collletttivo.it`, Italian, open-source), and
Open Foundry / Uncut.wtf as catalogues of libre faces.

### 2. Public-domain artwork — museum open-access APIs

This is the one almost nobody uses and it is the best-looking free imagery on the internet.
Millions of scanned engravings, botanical plates, prints, diagrams and photographs, out of
copyright, high resolution, free of any stock-photo look.

```bash
# The Met — no key, CC0 on anything with isPublicDomain: true
curl -s "https://collectionapi.metmuseum.org/public/collection/v1/search?q=diagram&hasImages=true"
curl -s "https://collectionapi.metmuseum.org/public/collection/v1/objects/436535"
# -> primaryImage, isPublicDomain, artistDisplayName, objectDate
```

Others in the same family: Art Institute of Chicago (`api.artic.edu/api/v1/artworks`, no key,
excellent), Rijksmuseum (free key, superb Dutch prints), Smithsonian Open Access (free key,
4.5M CC0 items), Cleveland Museum of Art (no key), Library of Congress
(`loc.gov/...?fo=json`), NYPL Digital Collections, Biodiversity Heritage Library
(botanical and zoological plates, the best line art anywhere), NASA Image Library
(`images-api.nasa.gov`), and USGS / NOAA for maps and terrain.

Use these when a page needs an image with actual character. One 1890s engraving beats any
number of Unsplash laptops.

### 3. Openly-licensed photography and everything else — Openverse

WordPress's aggregator over ~800M CC-licensed and public-domain works. No key for basic use,
and **it returns the license and the required attribution string with every result**, which is
what makes it safe to use programmatically.

```bash
curl -s "https://api.openverse.org/v1/images/?q=pictogram&page_size=5&license_type=commercial"
# -> results[].license, .license_version, .attribution, .url
```

Always pass `license_type=commercial` (or `modification`) or you will pick up NC-licensed
work you cannot use on anything commercial. Read the `attribution` field and actually print it.

Direct sources worth going to instead when you know what you want: Unsplash and Pexels both
have real APIs with free keys, but both have a *very* recognisable house style that is its own
kind of slop. Prefer museums.

### 4. Illustration

- **unDraw** (`undraw.co`) — MIT, recolourable to one accent, no attribution required. The
  catch: it is extremely recognisable. If used, recolour hard and never use more than one.
- **Open Peeps**, **Humaaans**, **Blush** (some free packs) — CC0, hand-drawn, mixable.
- **Public-domain pictograms** — the actual right answer for anything statistical. Otto
  Neurath's Isotype work and the AIGA/DOT symbol set (public domain, released by the US DOT)
  are the ancestors of every icon you have seen. Free, timeless, no fingerprint.

Best of all, and cheapest: **draw the glyph yourself in SVG**. A single-figure pictogram is
about twelve path commands. This project's little person is 400 bytes of hand-written SVG and
it is the entire visual identity. Custom illustration beats an icon library, and at this scale
"custom" costs ten minutes.

### 5. Icons

Lucide is banned by DESIGN.md for a reason: default 1.5 stroke at 24px is the most
fingerprinted graphic on the web. If an icon set is genuinely needed, use one with a different
temperament and then change its stroke weight and corner treatment so it stops matching the
default: **Phosphor** (MIT, six weights), **Iconoir** (MIT), **Radix Icons** (15px grid),
**Nucleo free tier**, or the **AIGA/DOT** set above.

### 6. Colour, texture and motion, without downloading anything

- **Palettes with provenance:** pull an accent out of a real thing. A flag, a product, a
  photograph, a museum object. `ColorLisa` (old master paintings as palettes) and Coolors are
  fine for browsing, but "our orange is the orange off a 1972 Charger" is a defensible answer
  and "#6366F1" never is.
- **Texture:** paper grain, halftone and noise are all doable in pure CSS/SVG with
  `feTurbulence` and a repeating gradient. No image asset, no page weight, no license.
  Hero Patterns (MIT) if you want ready-made SVG tiles.
- **Motion:** the reference is `animations.dev` (Emil Kowalski) — the thesis being two easing
  curves and a small vocabulary. Read the ideas, write the CSS yourself. Do not install
  Framer Motion to fade something in.
- **Layout ideas:** Codrops demos are MIT-licensed and the code is genuinely readable, so it is
  the one "library" you can legitimately learn technique from. Learn the technique. Do not
  paste the demo.

---

## The working method

1. **Name the aesthetic family first.** Not adjectives. "1930s Isotype statistical pictogram",
   "Swiss editorial", "Penguin paperback 1962", "airline safety card". A named family tells you
   what the type, the colour and the illustration all have to be, at once.
2. **Pick the typeface before anything else.** From Fontshare or a libre foundry. Download it,
   self-host it, and let it set the tone of the whole page.
3. **Get the imagery from a museum, or draw it.** Not from a gallery, not from a component kit.
4. **One accent, tied to something real.**
5. **Compose it yourself.** This is the part nobody can give you for free, and it is also the
   only part that decides whether the page looks made or generated.

The reason this works is not moral. It is that every free component library has been used by
ten thousand other projects this month and every 1890s engraving has been used by roughly
nobody.

---

## Quick reference

| Need | Go to | Key? | License |
|---|---|---|---|
| Typeface | `api.fontshare.com/v2/fonts` | no | free commercial, self-host |
| Typeface (libre/odd) | velvetyne.fr, collletttivo.it, uncut.wtf | no | OFL |
| Public-domain art | `collectionapi.metmuseum.org`, `api.artic.edu` | no | CC0 |
| Public-domain art (more) | Rijksmuseum, Smithsonian, LoC, BHL | free key | CC0 / PD |
| CC-licensed anything | `api.openverse.org/v1/images` | no | check `license` field |
| Illustration | unDraw, Open Peeps, Humaaans | no | MIT / CC0 |
| Icons | Phosphor, Iconoir, AIGA-DOT | no | MIT / PD |
| Technique | Codrops, animations.dev | no | MIT / read-only |
| Inspiration only | Dribbble, Behance, Mobbin, Awwwards | n/a | **eyes only, never copy** |
