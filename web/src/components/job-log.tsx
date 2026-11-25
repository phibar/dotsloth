import {useEffect, useRef} from 'react'

/**
 * Purpose: show what a running job is doing, as it does it.
 *
 * Intention: the job panels hand it their events as lines; a progress line
 * stands until the next line takes its place, as git draws it on a terminal.
 */
export type LogLine = string | {progress: true; text: string}

/** Live output of a running job, kept scrolled to the newest line. */
export function JobLog({lines}: {lines: LogLine[]}) {
  const end = useRef<HTMLDivElement>(null)
  const shown: string[] = []
  let rewrite = false
  for (const line of lines) {
    if (rewrite) shown.pop()
    shown.push(typeof line === 'string' ? line : line.text)
    rewrite = typeof line !== 'string'
  }

  useEffect(() => {
    end.current?.scrollIntoView?.({block: 'nearest'})
  }, [lines.length])

  if (lines.length === 0) return null
  return (
    <pre aria-live="polite" className="log">
      {shown.join('\n')}
      <div ref={end} />
    </pre>
  )
}

/** A line a process wrote, as the log shows it: progress stands only until the next line. */
export function outputLine({line, progress}: {line: string; progress: boolean}): LogLine {
  return progress ? {progress: true, text: line} : line
}
