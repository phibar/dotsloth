/*
 * Purpose: How the Runners page acts on the server — a click's failure shown
 * as a toast, and an add or remove job followed to its end as lines of steps.
 * Intention: uses useJob and useToast; the lines match what `dotsloth runner`
 * prints for the same StepEvents. Speaks to the Runners page's cards.
 */

import {useEffect, useState} from 'react'

import type {StepEvent} from '../../api.js'
import {useToast} from '../../toast.js'
import {useJob} from '../../use-job.js'

/** One line per progress event, as the CLI prints them. */
export function stepLine(event: StepEvent): string {
  if (event.type === 'step') {
    const mark = {error: '✗', ok: '✓', warning: '!'}[event.status]
    return `${mark} ${event.label}${event.detail ? ` — ${event.detail}` : ''}`
  }

  return event.type === 'link' ? event.result.target : `  ${event.label}`
}

/** A click handler whose failure becomes a toast instead of an unhandled rejection. */
export function useGuarded() {
  const toast = useToast()
  return (action: () => Promise<unknown>) => async () => {
    try {
      await action()
    } catch (error) {
      toast.error(error)
    }
  }
}

/** Follow a job to its end; `onEnd` runs once, with whether it succeeded. */
export function useRunnerJob(onEnd: (ok: boolean) => void) {
  const toast = useToast()
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob<StepEvent>(jobId)

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'The runner job failed'))
    if (job.status === 'failed' || job.status === 'succeeded') onEnd(job.status === 'succeeded')
    // onEnd is a new function each render; the job's end is what counts.
  }, [job.status])

  return {job, lines: job.events.map(stepLine), setJobId}
}
