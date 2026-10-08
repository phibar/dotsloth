import {randomUUID} from 'node:crypto'
import {CoreError} from '../core/errors.js'
import type {ApiError} from './errors.js'
import {toApiError} from './errors.js'

export type JobStatus = 'failed' | 'running' | 'succeeded'

export interface JobSnapshot {
  error?: ApiError
  /** Progress events in the order they happened. */
  events: unknown[]
  finishedAt?: string
  id: string
  kind: string
  result?: unknown
  startedAt: string
  status: JobStatus
}

export type JobUpdate = {event: unknown; index: number; type: 'event'} | {job: JobSnapshot; type: 'end'}

interface Job extends JobSnapshot {
  listeners: Set<(update: JobUpdate) => void>
}

const KEEP_FINISHED = 20

/**
 * Runs long operations (sync, clone, doctor, ...) in the background and keeps
 * their events, so a browser can follow along over SSE and catch up after a
 * reconnect. One job at a time: they all change the same files, keychain or
 * repositories, and two at once would interleave.
 */
export class JobRunner {
  private readonly jobs = new Map<string, Job>()

  get(id: string): JobSnapshot | undefined {
    const job = this.jobs.get(id)
    return job && snapshot(job)
  }

  start<E, R>(kind: string, run: (emit: (event: E) => void) => Promise<R> | R): JobSnapshot {
    const running = [...this.jobs.values()].find((j) => j.status === 'running')
    if (running) throw new CoreError('CONFLICT', `Another operation is still running (${running.kind})`)

    const job: Job = {
      events: [],
      id: randomUUID(),
      kind,
      listeners: new Set(),
      startedAt: new Date().toISOString(),
      status: 'running',
    }
    this.jobs.set(job.id, job)
    this.prune()

    const emit = (event: E) => {
      job.events.push(event)
      for (const listener of job.listeners) listener({event, index: job.events.length - 1, type: 'event'})
    }

    // Started on the next tick, so the caller has the id before the first event.
    setImmediate(async () => {
      try {
        job.result = await run(emit)
        job.status = 'succeeded'
      } catch (error) {
        job.error = toApiError(error).body
        job.status = 'failed'
        if (!(error instanceof CoreError)) console.error(`dotsloth ui: ${kind} failed:`, error)
      }

      job.finishedAt = new Date().toISOString()
      for (const listener of job.listeners) listener({job: snapshot(job), type: 'end'})
      job.listeners.clear()
    })

    return snapshot(job)
  }

  /** Follow a running job. Returns an unsubscribe function, or null when it already finished. */
  subscribe(id: string, listener: (update: JobUpdate) => void): (() => void) | null {
    const job = this.jobs.get(id)
    if (!job || job.status !== 'running') return null
    job.listeners.add(listener)
    return () => job.listeners.delete(listener)
  }

  private prune(): void {
    const finished = [...this.jobs.values()].filter((j) => j.status !== 'running')
    for (const job of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) this.jobs.delete(job.id)
  }
}

function snapshot(job: Job): JobSnapshot {
  const {listeners: _listeners, ...rest} = job
  return {...rest, events: [...job.events]}
}

/** Updates waiting to be written to one SSE stream, in order. */
export class UpdateQueue {
  private readonly items: JobUpdate[] = []
  private waiting: ((update: JobUpdate) => void) | undefined

  next(): Promise<JobUpdate> {
    const item = this.items.shift()
    if (item) return Promise.resolve(item)
    return new Promise((resolve) => {
      this.waiting = resolve
    })
  }

  push(update: JobUpdate): void {
    const {waiting} = this
    if (waiting) {
      this.waiting = undefined
      waiting(update)
    } else {
      this.items.push(update)
    }
  }
}
