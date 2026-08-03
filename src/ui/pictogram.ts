// One hundred people, drawn by hand.
//
// Otto Neurath's Isotype rule: to show more, draw more figures, never a bigger
// figure. So the whole chart is one glyph repeated 100 times and the only thing
// that changes is which one is you.

const FIGURE = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
  <symbol id="fig" viewBox="0 0 10 24">
    <circle cx="5" cy="3.6" r="3.1"/>
    <path d="M5 7.7c-2.8 0-3.9 1.4-3.9 3.6v4.4h1.5v8.1h1.8v-6.5h1.2v6.5h1.8v-8.1h1.5v-4.4c0-2.2-1.1-3.6-3.9-3.6z"/>
  </symbol>
</svg>`

let injected = false
export function injectFigure(): void {
  if (injected) return
  document.body.insertAdjacentHTML('afterbegin', FIGURE)
  injected = true
}

export interface PictogramOptions {
  /** 1..100, which figure is you. */
  you: number
  /** Reads out to a screen reader instead of the drawing. */
  label: string
}

export function pictogram({ you, label }: PictogramOptions): string {
  const cells: string[] = []
  for (let i = 1; i <= 100; i++) {
    const state = i === you ? 'you' : i < you ? 'below' : 'above'
    cells.push(
      `<svg class="fig fig--${state}" viewBox="0 0 10 24" style="--i:${i}" aria-hidden="true"><use href="#fig"/></svg>`,
    )
  }
  return `<div class="pictogram" role="img" aria-label="${escapeAttr(label)}">${cells.join('')}</div>`
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
