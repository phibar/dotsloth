dotsloth
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/dotsloth.svg)](https://npmjs.org/package/dotsloth)
[![Downloads/week](https://img.shields.io/npm/dw/dotsloth.svg)](https://npmjs.org/package/dotsloth)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g dotsloth
$ dotsloth COMMAND
running command...
$ dotsloth (--version)
dotsloth/0.0.0 darwin-arm64 node-v25.2.0
$ dotsloth --help [COMMAND]
USAGE
  $ dotsloth COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`dotsloth hello PERSON`](#dotsloth-hello-person)
* [`dotsloth hello world`](#dotsloth-hello-world)
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

## `dotsloth hello PERSON`

Say hello

```
USAGE
  $ dotsloth hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ dotsloth hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/phibar/dotsloth/blob/v0.0.0/src/commands/hello/index.ts)_

## `dotsloth hello world`

Say hello world

```
USAGE
  $ dotsloth hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ dotsloth hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/phibar/dotsloth/blob/v0.0.0/src/commands/hello/world.ts)_

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
