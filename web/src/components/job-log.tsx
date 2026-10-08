import {useEffect, useRef} from 'react'

/** Live output of a running job, kept scrolled to the newest line. */
export function JobLog({lines}: {lines: string[]}) {
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView?.({block: 'nearest'})
  }, [lines.length])

  if (lines.length === 0) return null
  return (
    <pre aria-live="polite" className="log">
      {lines.join('\n')}
      <div ref={end} />
    </pre>
  )
}
