import react from '@vitejs/plugin-react'
import {defineConfig} from 'vitest/config'

/**
 * The web app lives in web/ and builds into dist/web, which `dotsloth ui`
 * serves. For development, run `dotsloth ui --no-open`, then
 *   DOTSLOTH_UI_URL=<the printed link> npm run dev:web
 * Vite proxies /api to that server and adds its session cookie and Origin.
 */
function devProxy() {
  const link = process.env.DOTSLOTH_UI_URL
  if (!link) return

  const url = new URL(link)
  return {
    '/api': {
      changeOrigin: true,
      headers: {cookie: `dotsloth_session_${url.port}=${url.searchParams.get('token')}`, origin: url.origin},
      target: url.origin,
    },
  }
}

export default defineConfig({
  build: {emptyOutDir: true, outDir: '../dist/web'},
  plugins: [react()],
  root: 'web',
  server: {proxy: devProxy()},
  test: {environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}']},
})
