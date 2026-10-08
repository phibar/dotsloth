/**
 * `npm run dev:ui`: work on the web app with hot reload.
 *
 * Starts `dotsloth ui` from source (bin/dev.js), waits for its sign-in link,
 * starts Vite with that link so /api is proxied with the session cookie, and
 * opens the Vite page. Ctrl+C stops both.
 */
import {execFile, spawn} from 'node:child_process'

const VITE_URL = 'http://localhost:5173/'
const children = []

function stop(code = 0) {
  for (const child of children) child.kill('SIGINT')
  process.exit(code)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

const server = spawn(process.execPath, ['bin/dev.js', 'ui', '--no-open'], {stdio: ['ignore', 'pipe', 'inherit']})
children.push(server)
server.on('exit', (code) => {
  console.error(`dotsloth ui exited (${code}).`)
  stop(code ?? 1)
})

let started = false
server.stdout.setEncoding('utf8')
server.stdout.on('data', (chunk) => {
  const link = /http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/.exec(chunk)?.[0]
  if (!link || started) return
  started = true

  console.log(`dotsloth ui is running; the web app is at ${VITE_URL} (Ctrl+C stops both)\n`)
  const vite = spawn('npx', ['vite', '--strictPort'], {env: {...process.env, DOTSLOTH_UI_URL: link}, stdio: 'inherit'})
  children.push(vite)
  vite.on('exit', (code) => stop(code ?? 0))

  setTimeout(() => execFile('open', [VITE_URL], () => undefined), 1500)
})
