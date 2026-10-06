dotsloth
=================

**Sync your dots, be a sloth.** A macOS CLI that keeps your development
environment — git identities, dotfiles, secrets, env files and Claude Code
config — in sync across machines via iCloud Drive and the macOS Keychain.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/dotsloth.svg)](https://npmjs.org/package/dotsloth)
[![Downloads/week](https://img.shields.io/npm/dw/dotsloth.svg)](https://npmjs.org/package/dotsloth)

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
@phibar/dotsloth/0.1.0 linux-x64 node-v24.21.0
$ dotsloth --help [COMMAND]
USAGE
  $ dotsloth COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`dotsloth help [COMMAND]`](#dotsloth-help-command)
* [`dotsloth plugins`](#dotsloth-plugins)
* [`dotsloth plugins add PLUGIN`](#dotsloth-plugins-add-plugin)
* [`dotsloth plugins:inspect PLUGIN...`](#dotsloth-pluginsinspect-plugin)
* [`dotsloth plugins install PLUGIN`](#dotsloth-plugins-install-plugin)
* [`dotsloth plugins link PATH`](#dotsloth-plugins-link-path)
* [`dotsloth plugins remove [PLUGIN]`](#dotsloth-plugins-remove-plugin)
* [`dotsloth plugins reset`](#dotsloth-plugins-reset)
* [`dotsloth plugins uninstall [PLUGIN]`](#dotsloth-plugins-uninstall-plugin)
* [`dotsloth plugins unlink [PLUGIN]`](#dotsloth-plugins-unlink-plugin)
* [`dotsloth plugins update`](#dotsloth-plugins-update)

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.36/src/commands/help.ts)_

## `dotsloth plugins`

List installed plugins.

```
USAGE
  $ dotsloth plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ dotsloth plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/index.ts)_

## `dotsloth plugins add PLUGIN`

Installs a plugin into dotsloth.

```
USAGE
  $ dotsloth plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into dotsloth.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the DOTSLOTH_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the DOTSLOTH_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ dotsloth plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ dotsloth plugins add myplugin

  Install a plugin from a github url.

    $ dotsloth plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ dotsloth plugins add someuser/someplugin
```

## `dotsloth plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ dotsloth plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ dotsloth plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/inspect.ts)_

## `dotsloth plugins install PLUGIN`

Installs a plugin into dotsloth.

```
USAGE
  $ dotsloth plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into dotsloth.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the DOTSLOTH_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the DOTSLOTH_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ dotsloth plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ dotsloth plugins install myplugin

  Install a plugin from a github url.

    $ dotsloth plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ dotsloth plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/install.ts)_

## `dotsloth plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ dotsloth plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ dotsloth plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/link.ts)_

## `dotsloth plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ dotsloth plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ dotsloth plugins unlink
  $ dotsloth plugins remove

EXAMPLES
  $ dotsloth plugins remove myplugin
```

## `dotsloth plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ dotsloth plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/reset.ts)_

## `dotsloth plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ dotsloth plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ dotsloth plugins unlink
  $ dotsloth plugins remove

EXAMPLES
  $ dotsloth plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/uninstall.ts)_

## `dotsloth plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ dotsloth plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ dotsloth plugins unlink
  $ dotsloth plugins remove

EXAMPLES
  $ dotsloth plugins unlink myplugin
```

## `dotsloth plugins update`

Update installed plugins.

```
USAGE
  $ dotsloth plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.54/src/commands/plugins/update.ts)_
<!-- commandsstop -->
