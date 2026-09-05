import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // One client-side bundle by design: React, Base UI and dnd-kit are all needed
    // on first paint, so code-splitting would only add round trips. ~615 kB
    // (~205 kB gzipped) is expected; raise the bar so a real regression stands out.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
