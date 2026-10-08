# CLAUDE.md - AI Assistant Guide for dotsloth

## Project Overview

**dotsloth** is a macOS-focused CLI tool for synchronizing development environment configurations across machines using iCloud Drive. It manages dotfiles, git identities per GitHub organization, and secrets via macOS Keychain.

- **Package**: `@phibar/dotsloth`
- **Binary names**: `dotsloth`, `.sloth`
- **Framework**: [oclif](https://oclif.io) (Heroku's Open CLI Framework)
- **Runtime**: Node.js >= 18, ESM modules
- **Platform**: macOS only (uses iCloud Drive, Keychain, ssh-agent)

## Architecture

### Core Concepts

1. **iCloud-based Config Storage**: All configurations are stored in `~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/` for automatic sync across devices
2. **Organization-based Git Identities**: Uses git's `includeIf` directive to automatically apply different identities based on repository location
3. **Keychain Secrets**: Environment variables with sensitive data are extracted from shell profiles and stored in macOS Keychain
4. **Symlinked Dotfiles**: Local dotfiles (`~/.gitconfig`, `~/.zprofile`, `~/.ssh/config`) are symlinked to iCloud versions

### Directory Structure

The CLI and the web UI share one implementation. Logic lives in `src/core`;
everything else is a front end to it.

```
src/
├── core/        # business logic: explicit inputs, typed results, StepEvent/job events
│                #   no prompts, no printing, no process.cwd(); errors are CoreError(code)
├── lib/         # low-level helpers: config, git, keychain, exec, fs, mail, claude, ...
├── cli/         # terminal formatting (chalk), BaseCommand (turns CoreError into an error)
├── commands/    # oclif commands: parse flags -> prompt (enquirer) -> core -> format
├── server/      # Hono API for `dotsloth ui`: security middleware, routes/, JobRunner (SSE)
├── types/       # Zod schemas (also bundled into the web app for validation)
└── index.ts
web/             # Vite + React app, built to dist/web and served by the server
test/
├── setup.ts     # points HOME at a temp dir before anything imports src/lib/paths.ts
├── helpers.ts   # resetHome(), fakeBinaries() and fakes for security/ssh-add/osascript
├── core/ lib/ server/
```

Rules that keep the layers honest (Biome enforces the first two):

- `src/lib` and `src/core` never import chalk, enquirer or @oclif/core and never use `console`.
- Every process call goes through `src/lib/exec.ts` with an argv array - never a shell string.
- Reading config is pure (`readConfig`); `loadConfig()` additionally regenerates org gitconfigs
  and is for CLI commands only. `saveConfig` validates and writes atomically.
- Core mutations that change git identities (`addOrg`, `updateOrg`, `removeOrg`) run `runSync`
  themselves and return its result, so CLI and web behave the same.
- The web app imports server and core types with `import type` only (plus the Zod schemas).

### Key Path Locations (defined in `src/lib/paths.ts`)

- **iCloud config**: `~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/config.json`
- **iCloud dotfiles**: `~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/dotfiles/`
- **Org gitconfigs**: `~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/organizations/`
- **GitHub repos root**: `~/github/`
- **Local symlink targets**: `~/.gitconfig`, `~/.zprofile`, `~/.ssh/config`

## Development Workflow

### Setup

```bash
npm install
npm run build
```

### Common Commands

```bash
npm run build      # Clean and compile TypeScript (shx rm -rf dist && tsc -b)
npm run lint       # Run Biome (lint, formatting, import order)
npm run test       # Run Mocha tests
npm run prepack    # Generate oclif manifest and readme (for releases)
```

### Running Locally

```bash
# Via bin scripts (uses tsx)
./bin/dev.js <command>

# Or after building
./bin/run.js <command>
```

### Testing

- Node code: Mocha + Chai, `test/**/*.test.ts`, run through the tsx loader (`.mocharc.json`)
- Web app: Vitest + Testing Library, `web/src/**/*.test.tsx` (jsdom)
- `npm test` runs both, then Biome
- Tests never touch the real machine: `test/setup.ts` gives every run a temp `HOME`, and
  `fakeBinaries()` puts stand-ins for `security`, `ssh-add`, `osascript` and `launchctl` first on
  `PATH` (`EMPTY_SYSTEM` covers the defaults). Keep it that way when adding tests.
- Tests run in CI on Ubuntu and macOS across Node LTS versions

## Code Conventions

### TypeScript

- Strict mode enabled
- Target: ES2022
- Module: Node16 (ESM)
- All imports use `.js` extension (required for ESM)

### oclif Patterns

Commands follow this structure:
```typescript
import {Command, Flags, Args} from '@oclif/core'

export default class MyCommand extends Command {
  static override description = 'Command description'
  static override examples = ['<%= config.bin %> <%= command.id %>']

  static override flags = {
    myFlag: Flags.boolean({char: 'f', description: '...'}),
  }

  static override args = {
    myArg: Args.string({description: '...', required: true}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(MyCommand)
    // Implementation
  }
}
```

### Console Output

- Use `chalk` for colored output
- Success: `chalk.green('✓')`
- Warning: `chalk.yellow('!')`
- Error: `chalk.red('✗')`
- Dim/secondary info: `chalk.dim('...')`
- Bold headers: `chalk.bold('...')`

### Error Handling

- Core throws `CoreError(code, message, details)`; codes are stable because the API maps them to
  HTTP status codes (`src/server/errors.ts`). Commands extend `BaseCommand`, which prints them.
- Use `this.error('message')` for fatal errors in commands (exits with code 1)
- Use `this.log(chalk.red(...))` for non-fatal errors

### Interactive Prompts

Use `enquirer` for user input:
```typescript
import Enquirer from 'enquirer'

const {value} = await Enquirer.prompt<{value: string}>({
  type: 'input', // or 'select', 'confirm', 'password'
  name: 'value',
  message: 'Prompt text:',
  validate: (input) => input.length > 0 ? true : 'Required',
})
```

### Schema Validation

Use Zod for config validation (`src/types/index.ts`):
```typescript
import {z} from 'zod'

export const MySchema = z.object({...})
export type MyType = z.infer<typeof MySchema>
```

## CI/CD Pipeline

### Workflows

1. **test.yml**: Runs on non-main branches
   - Matrix: Ubuntu/Windows x Node LTS-1/LTS/latest
   - Steps: install, build, test

2. **onPushToMain.yml**: Runs on main branch
   - Checks if version tag exists
   - Generates oclif README
   - Creates GitHub release

3. **onRelease.yml**: Runs on release publish
   - Builds and publishes to npm

## Important Implementation Details

### Keychain Operations (`src/lib/keychain.ts`)

Uses macOS `security` CLI:
- `security add-generic-password` - Store secrets
- `security find-generic-password` - Retrieve secrets
- `security delete-generic-password` - Remove secrets
- `security dump-keychain` - List all secrets

All secrets use account name `dotsloth` for grouping.

### Git Configuration Strategy

1. Main `~/.gitconfig` uses `includeIf` directives:
   ```ini
   [includeIf "gitdir:~/github/OrgName/"]
       path = ~/Library/Mobile Documents/.../organizations/orgname.gitconfig
   ```
2. Each org has its own gitconfig with user.name and user.email
3. SSH signing is configured globally with allowed_signers file

### Secret Extraction Patterns (`src/lib/secrets.ts`)

Detects these export patterns in shell profiles:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `*_API_KEY`, `*_API_TOKEN`, `*_SECRET`, `*_TOKEN`
- `OPENAI_*`, `ANTHROPIC_*`, `CLOUDFLARE_*`
- `*_ACCESS_KEY`, `*_SECRET_KEY`, `*CREDENTIALS`

## File Sync Behavior

The `sync` command:
1. Regenerates all org-specific gitconfigs from config.json
2. Regenerates main gitconfig with includeIf patterns
3. Updates allowed_signers file (for SSH commit signing)
4. Verifies/creates symlinks for dotfiles

## Common Patterns

### Reading Config
```typescript
import {getConfig} from '../core/config.js'

const config = getConfig() // throws CoreError CONFIG_MISSING / CONFIG_INVALID
```

### Creating Organizations
```typescript
import {addOrg} from '../core/orgs.js'

const result = await addOrg({gitEmail, gitUsername, name}) // config, gitconfig, folder, then sync
printAutoSync(this.log.bind(this), result.sync)
```

### Long-running Operations
Core reports progress through an `onEvent` callback. The CLI prints the events; the server runs
the operation as a job (`JobRunner`, one at a time) and streams them over SSE:
```typescript
runner.start('doctor', (emit) => runDoctor({offline}, emit))
```

### Safe Symlink Creation
```typescript
import {createSymlink} from '../lib/symlink.js'

const result = await createSymlink({
  source: '/path/in/icloud',
  target: '/path/local',
  backup: true,  // Backs up existing files
})
```

## Security Considerations

- Secrets are stored in macOS Keychain (encrypted, syncs via iCloud Keychain)
- SSH keys are added to agent with `--apple-use-keychain` for persistence
- The `secret load` command outputs to stdout for `eval` - be cautious with logging
- Config.json may contain email addresses but no secrets
- `dotsloth ui` listens on 127.0.0.1 only and checks Host, the session cookie and (for anything
  that changes state) Origin on every request (`src/server/security.ts`). New routes are covered
  automatically - do not add routes outside `createApp`.
- The API returns secret values one at a time (`POST /api/secrets/:name/reveal`) and never env
  file contents; core has no bulk secret read, keep it that way.
- Request bodies are validated with strict Zod schemas (`readBody`); unknown fields are a 400.
