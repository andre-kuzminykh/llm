/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// nr-launch/1: dist/nr-launch.json из NR_HOST_ORIGINS — паспорт для Neuronium (FR-CP-065)
import { nrLaunch } from './scripts/nr-launch.mjs'

export default defineConfig({
  base: './',
  plugins: [react(), nrLaunch()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
