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

```
src/
├── commands/           # oclif command implementations
│   ├── clone.ts       # Clone repos to correct org folder
│   ├── init.ts        # Initialize dotsloth on a machine
│   ├── status.ts      # Show current configuration status
│   ├── sync.ts        # Sync configurations from iCloud
│   ├── org/           # Organization management subcommands
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── remove.ts
│   │   └── update.ts
│   └── secret/        # Secret management subcommands
│       ├── add.ts
│       ├── export.ts
│       ├── get.ts
│       ├── list.ts
│       ├── load.ts    # Outputs shell export statements
│       └── remove.ts
├── lib/               # Core library modules
│   ├── config.ts      # Config loading/saving, org management
│   ├── git.ts         # Gitconfig generation, URL parsing
│   ├── keychain.ts    # macOS Keychain operations via `security` CLI
│   ├── paths.ts       # Centralized path definitions
│   ├── secrets.ts     # Secret extraction from shell profiles
│   └── symlink.ts     # Symlink creation and verification
├── types/
│   └── index.ts       # Zod schemas and TypeScript types
└── index.ts           # Main export
```

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
npm run lint       # Run ESLint
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

- Test framework: Mocha with Chai
- Test files: `test/**/*.test.ts` (currently no tests exist)
- Config: `.mocharc.json` with the tsx loader
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

- Use `this.error('message')` for fatal errors (exits with code 1)
- Use `this.log(chalk.red(...))` for non-fatal errors
- Catch errors from external commands and provide user-friendly messages

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

### Loading Config with Auto-sync
```typescript
const config = loadConfig() // Also syncs org gitconfigs
if (!config) {
  this.error('No configuration found. Run "dotsloth init" first.')
}
```

### Creating Organizations
```typescript
import {addOrganization} from '../lib/config.js'
import {writeOrgGitconfig} from '../lib/git.js'

addOrganization(org)     // Updates config.json
writeOrgGitconfig(org)   // Creates org-specific gitconfig
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
