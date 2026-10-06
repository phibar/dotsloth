import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {
    rules: {
      // This codebase consistently uses `import * as fs from 'node:fs'`. The
      // rule wants named imports, which would mean rewriting every module for
      // no functional gain — and a half-converted codebase reads worse than
      // either convention applied consistently.
      'unicorn/import-style': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // A test file legitimately groups several related suites; splitting one
      // module's tests across files to satisfy a counter helps nobody.
      'mocha/max-top-level-suites': 'off',
    },
  },
]
