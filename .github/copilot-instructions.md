# Copilot Instructions for dotsloth

## Project Overview

dotsloth is a macOS CLI tool for syncing dotfiles and development environment configuration via iCloud. It manages git configurations, SSH keys, and secrets using the macOS Keychain.

**Key features:**
- Sync dotfiles across macOS machines via iCloud Drive
- Manage multiple GitHub organizations with different git identities
- Store secrets in macOS Keychain instead of dotfiles
- Auto-configure SSH signing for git commits

## Tech Stack

- **Language**: TypeScript (ES2022, strict mode)
- **Runtime**: Node.js >= 18
- **CLI Framework**: [oclif](https://oclif.io/) - The Open CLI Framework
- **Package Manager**: npm
- **Schema Validation**: Zod
- **Testing**: Mocha with Chai
- **Linting**: ESLint with oclif config and Prettier

## Project Structure

```
src/
├── commands/      # CLI commands (oclif command classes)
│   ├── init.ts    # Initialize dotsloth on a machine
│   ├── clone.ts   # Clone repos to correct org folders
│   ├── sync.ts    # Sync configuration
│   ├── status.ts  # Show sync status
│   ├── org/       # Organization management commands
│   └── secret/    # Secret management commands
├── lib/           # Utility modules
│   ├── config.ts  # Configuration management
│   ├── git.ts     # Git configuration helpers
│   ├── keychain.ts # macOS Keychain integration
│   ├── paths.ts   # Path constants
│   ├── secrets.ts # Secret extraction/loading
│   └── symlink.ts # Symlink management
├── types/         # TypeScript types and Zod schemas
│   └── index.ts
└── index.ts       # Main entry point
```

## Development Commands

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript to dist/)
npm run build

# Run linting
npm run lint

# Run tests
npm test

# Run the CLI locally
./bin/run.js <command>
```

## Code Conventions

### TypeScript
- Use strict TypeScript with ES2022 target
- Use Zod schemas for runtime type validation
- Export types from `src/types/index.ts`

### CLI Commands
- Extend `Command` from `@oclif/core`
- Use static `description`, `examples`, `flags`, and `args` properties
- Use `chalk` for colored terminal output
- Use `Enquirer` for interactive prompts
- Follow oclif conventions for command structure

### Imports
- Use `node:` prefix for Node.js built-in modules (e.g., `node:fs`, `node:path`)
- When importing local TypeScript modules, use `.js` extension (not `.ts`). This is an ESM requirement where TypeScript compiles to JavaScript, so imports must reference the compiled output extension:
  ```typescript
  // Correct
  import { loadConfig } from '../lib/config.js'
  
  // Incorrect
  import { loadConfig } from '../lib/config.ts'
  import { loadConfig } from '../lib/config'
  ```

### Error Handling
- Use `this.error()` for fatal errors in commands
- Use `this.log()` with chalk for user feedback

## Testing

Tests use Mocha and are located in the `test/` directory. Test files should use the `.test.ts` extension.

## macOS-Specific Notes

This tool is designed for macOS and uses:
- iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/`)
- macOS Keychain (via `security` command)
- Homebrew paths (`/opt/homebrew/`)

When developing or testing, be aware that some functionality requires:
- iCloud Drive to be enabled and accessible
- macOS Keychain access permissions
- SSH keys to be set up
