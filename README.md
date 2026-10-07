dotsloth
=================

**Sync your dots, be a sloth.** A macOS CLI that keeps your development
environment — git identities, dotfiles, secrets, env files and Claude Code
config — in sync across machines via iCloud Drive and the macOS Keychain.

[![npm](https://img.shields.io/npm/v/@phibar/dotsloth)](https://www.npmjs.com/package/@phibar/dotsloth)
[![downloads](https://img.shields.io/npm/dw/@phibar/dotsloth)](https://www.npmjs.com/package/@phibar/dotsloth)
[![release](https://img.shields.io/github/actions/workflow/status/phibar/dotsloth/release.yml?branch=main&label=release)](https://github.com/phibar/dotsloth/actions/workflows/release.yml)
[![node](https://img.shields.io/node/v/@phibar/dotsloth)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@phibar/dotsloth)](./LICENSE)
[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

## What it does

- **Git identities per organization.** Generates `~/.gitconfig` with `includeIf`
  rules so repos under `~/github/<org>/` automatically use the right name, email
  and signing key. Every command that changes config re-applies it immediately.
- **Dotfiles via iCloud.** `~/.gitconfig`, `~/.zprofile` and `~/.ssh/config` are
  symlinked to versions stored in iCloud Drive.
- **Secrets in the Keychain.** Sensitive exports are pulled out of shell
  profiles and stored encrypted, never in a synced plaintext file.
- **Env files.** `.env` and friends are gitignored by design, so git never saves
  them. `dotsloth env` backs them up and restores them after a reinstall.
- **Claude Code.** Share `settings.json`, project memory and conversation
  history between machines.
- **Mail.** Back up Mail rules and signatures and recreate them on a new
  machine, with a checklist for the accounts that need a manual sign-in.
- **Pre-reinstall safety.** `dotsloth doctor` refuses to say "safe to wipe"
  while anything would be lost.
- **Periodic sync.** A launchd agent keeps everything current.

## Quick start

```sh
npm install -g @phibar/dotsloth
dotsloth init
dotsloth org add phibar --email you@phibar.work --username phibar
dotsloth clone git@github.com:phibar/some-repo.git
```

## Reinstalling your Mac

See **[BOOTSTRAP.md](./BOOTSTRAP.md)** for the full ordered procedure. The short
version — before you wipe:

```sh
dotsloth doctor          # exits non-zero while anything would be lost
dotsloth env push
dotsloth claude memory push
brctl log --wait --shorten   # a file in iCloud is not a backup until uploaded
```

And on the new machine: Homebrew → node → iCloud sign-in → dotsloth → SSH key →
`dotsloth sync` → clone → `dotsloth env pull`.

## Where things live

| What | Where |
|---|---|
| Config | `~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/config.json` |
| Dotfiles | `.../development/dotsloth/dotfiles/` |
| Org gitconfigs | `.../development/dotsloth/organizations/` |
| Env files | `.../development/dotsloth/envs/<org>/<repo>/` |
| Claude Code | `.../development/dotsloth/claude/` |
| Secrets | macOS Keychain, account `dotsloth` |
| Repos | `~/github/<org>/<repo>` |

## Development

```sh
npm install
npm run build
npm test          # mocha + eslint
./bin/run.js <command>
```

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @phibar/dotsloth
$ dotsloth COMMAND
running command...
$ dotsloth (--version)
@phibar/dotsloth/0.2.1 linux-x64 node-v24.21.0
$ dotsloth --help [COMMAND]
USAGE
  $ dotsloth COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`dotsloth help [COMMAND]`](#dotsloth-help-command)

## `dotsloth help [COMMAND]`

Display help for dotsloth.

```
USAGE
  $ dotsloth help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for dotsloth.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/7.0.2/src/commands/help.ts)_
<!-- commandsstop -->
