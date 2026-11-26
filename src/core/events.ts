import type {SymlinkStatus} from '../types/index.js'

/**
 * Purpose: a long operation reports its progress in one shape, whether a
 * terminal prints it or the web UI streams it.
 *
 * Intention: the core operations emit it; cli/format and the web UI's job
 * log read it.
 */

/**
 * Progress of a multi-step operation, reported as it happens so the CLI can
 * print each line and the web UI can stream it.
 */
export type StepEvent =
  | {detail?: string; label: string; status: 'error' | 'ok' | 'warning'; type: 'step'}
  /** Secondary information, shown dimmed. */
  | {label: string; type: 'info'}
  /** Starts a group of related steps. */
  | {label: string; type: 'section'}
  | {result: SymlinkStatus; type: 'link'}

export type OnEvent<E> = (event: E) => void

/** Default for callers that do not follow progress. */
export const ignoreEvents = (): void => undefined
