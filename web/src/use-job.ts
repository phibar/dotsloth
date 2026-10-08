import {useEffect, useState} from 'react'

import type {JobSnapshot} from './api.js'

export interface JobState<E, R> {
  error?: JobSnapshot['error']
  events: E[]
  result?: R
  status: 'idle' | JobSnapshot['status']
}

function idle<E, R>(): JobState<E, R> {
  return {events: [], status: 'idle'}
}

/**
 * Follow a job over Server-Sent Events. EventSource reconnects on its own and
 * sends Last-Event-ID, so the server resumes where the stream broke off.
 */
export function useJob<E = unknown, R = unknown>(id: null | string): JobState<E, R> {
  const [state, setState] = useState<JobState<E, R>>(idle)

  useEffect(() => {
    if (!id) {
      setState(idle())
      return
    }

    setState({events: [], status: 'running'})
    const source = new EventSource(`/api/jobs/${id}/events`)

    source.addEventListener('event', (message) => {
      const event = JSON.parse((message as MessageEvent).data) as E
      setState((current) => ({...current, events: [...current.events, event]}))
    })

    source.addEventListener('end', (message) => {
      const job = JSON.parse((message as MessageEvent).data) as JobSnapshot
      setState((current) => ({...current, error: job.error, result: job.result as R, status: job.status}))
      source.close()
    })

    return () => source.close()
  }, [id])

  return state
}
