import { defineConfig } from 'vite'

// Served from GitHub Pages at off-plate.github.io/am-i-average
export default defineConfig({
  base: '/am-i-average/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
})
