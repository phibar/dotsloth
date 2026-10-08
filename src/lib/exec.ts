import {execFile, execFileSync, spawn} from 'node:child_process'

/**
 * Every external process goes through here, always as a command plus an argv
 * array and never as a shell string. With a shell string, a secret value,
 * repository URL or path containing `"`, `$(...)` or a backtick runs
 * arbitrary commands - harmless while only the CLI user typed the input, an
 * injection hole once a browser can send it.
 */

export interface ExecOptions {
  cwd?: string
  /** Written to the process's stdin. */
  input?: string
  /**
   * Connect the process to this terminal, so it can prompt (a passphrase) and
   * its output shows directly. {@link run} then returns an empty string.
   */
  interactive?: boolean
  maxBuffer?: number
  /** Milliseconds before the process is killed. */
  timeout?: number
}

export class ExecError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: null | number,
    readonly stderr: string,
  ) {
    super(stderr.trim() || `${command} failed${exitCode === null ? '' : ` with exit code ${exitCode}`}`)
    this.name = 'ExecError'
  }
}

const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024

function toExecError(command: string, error: unknown): ExecError {
  // execFileSync puts the exit code in `status`; `code` is an errno string like ENOENT.
  const {status, stderr} = error as {status?: null | number; stderr?: Buffer | string}
  return new ExecError(command, status ?? null, stderr ? String(stderr) : (error as Error).message)
}

/** Run synchronously and return stdout. Throws {@link ExecError} on a non-zero exit. */
export function run(command: string, args: readonly string[], options: ExecOptions = {}): string {
  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      input: options.input,
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      stdio: options.interactive ? 'inherit' : ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout,
    })
    return output ?? ''
  } catch (error) {
    throw toExecError(command, error)
  }
}

/** Like {@link run}, but returns null instead of throwing. */
export function tryRun(command: string, args: readonly string[], options: ExecOptions = {}): null | string {
  try {
    return run(command, args, options)
  } catch {
    return null
  }
}

/** Run without blocking the event loop and resolve with stdout. Rejects with {@link ExecError}. */
export function runAsync(
  command: string,
  args: readonly string[],
  options: Omit<ExecOptions, 'interactive'> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        encoding: 'utf8',
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        timeout: options.timeout,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new ExecError(command, typeof error.code === 'number' ? error.code : null, stderr || error.message))
          return
        }

        resolve(stdout)
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
  })
}

export interface StreamOptions extends Omit<ExecOptions, 'input' | 'interactive' | 'maxBuffer'> {
  /** Added to the inherited environment. */
  env?: Record<string, string>
  /** Called for every complete line on stdout or stderr. */
  onLine: (line: string, stream: 'stderr' | 'stdout') => void
}

/**
 * Run and report output line by line as it arrives - for long operations like
 * `git clone`, whose progress a terminal or browser shows live. Resolves with
 * the exit code; does not reject on a non-zero exit.
 */
export function runStreaming(command: string, args: readonly string[], options: StreamOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? {...process.env, ...options.env} : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout,
    })

    for (const stream of ['stdout', 'stderr'] as const) {
      let pending = ''
      child[stream].setEncoding('utf8')
      child[stream].on('data', (chunk: string) => {
        // git rewrites its progress line with \r, so treat it as a line end too.
        const parts = (pending + chunk).split(/\r\n|\r|\n/)
        pending = parts.pop() ?? ''
        for (const line of parts) if (line) options.onLine(line, stream)
      })
      child[stream].on('end', () => {
        if (pending) options.onLine(pending, stream)
      })
    }

    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}
