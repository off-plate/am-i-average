import { defineConfig } from 'vite'

// Netlify serves it from the root; GitHub Pages serves it from /am-i-average/.
// Netlify's build sets NETLIFY=true, so one repo produces both correctly.
export default defineConfig({
  base: process.env.NETLIFY ? '/' : '/am-i-average/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
})
