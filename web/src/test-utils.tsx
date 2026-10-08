import {render} from '@testing-library/react'
import type {ReactElement} from 'react'
import {vi} from 'vitest'

import {ToastProvider} from './toast.js'

type Handler = (body: unknown) => [number, unknown]

/**
 * Answer fetch by "METHOD /path". Returns the recorded calls, so tests can
 * check what the page sent.
 */
export function mockApi(routes: Record<string, [number, unknown] | Handler>) {
  const calls: Array<{body: unknown; route: string}> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const route = `${init.method ?? 'GET'} ${url}`
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      calls.push({body, route})
      const handler = routes[route]
      if (!handler) return new Response(JSON.stringify({code: 'NOT_FOUND', message: route}), {status: 404})
      const [status, data] = typeof handler === 'function' ? handler(body) : handler
      return new Response(JSON.stringify(data), {status})
    }),
  )
  return calls
}

/** EventSource stand-in that a test drives by hand. */
export class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>()

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, {data: JSON.stringify(data)}))
    }
  }
}

export function installFakeEventSource() {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

export function renderWithToasts(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}
