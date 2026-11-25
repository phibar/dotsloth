import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type {CoreError} from '../../src/core/errors.js'

/**
 * Purpose: the git repositories and core errors that several suites build on.
 *
 * Intention: uses the real git binary, with a fixed identity so a commit
 * needs no configuration of the machine running the tests.
 */
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

/** A repository with one commit at `dir`. */
export function makeRepo(dir: string): void {
  fs.mkdirSync(dir, {recursive: true})
  git(dir, 'init', '-q')
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'initial')
}

/** The code of the CoreError the promise rejects with, or undefined when it resolves. */
export async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return (error as CoreError).code
  }

  return undefined
}
