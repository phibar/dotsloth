# @phibar/dotsloth

## 0.2.0

### Minor Changes

- [#44](https://github.com/phibar/dotsloth/pull/44) [`dcf5684`](https://github.com/phibar/dotsloth/commit/dcf5684105c83c9d5dc9ecbcebebd5b8a3f39d4a) Thanks [@phibar](https://github.com/phibar)! - Remove the `dotsloth plugins` commands. They came from oclif scaffolding and let third parties install plugins into the CLI at runtime, which meant vendoring a full copy of npm — the source of all 24 production vulnerabilities, including a critical one. dotsloth exposes no hooks or plugin surface, so nothing could use them.

### Patch Changes

- [#44](https://github.com/phibar/dotsloth/pull/44) [`fcc1122`](https://github.com/phibar/dotsloth/commit/fcc1122903502525f960524ff3422d289cf22d17) Thanks [@phibar](https://github.com/phibar)! - Update runtime dependencies to @oclif/core 5, @oclif/plugin-help 7, chalk 6 and zod 4. Together with dropping the plugin host this takes the production audit to zero vulnerabilities.

- [#54](https://github.com/phibar/dotsloth/pull/54) [`02340f3`](https://github.com/phibar/dotsloth/commit/02340f3edc00c5c73d26ea5bb36442370cb8146b) Thanks [@phibar](https://github.com/phibar)! - Fix `dotsloth doctor` counting an untracked env file twice — once as an uncommitted change and once under env files — which meant it could never exit 0 and so could never actually gate a wipe.

## 0.1.2

### Patch Changes

- [#43](https://github.com/phibar/dotsloth/pull/43) [`d9342ed`](https://github.com/phibar/dotsloth/commit/d9342edeca7b94fb1bb502e5ff6a83d78ac650f2) Thanks [@phibar](https://github.com/phibar)! - Fix the README badges, which pointed at the unscoped `dotsloth` package and rendered as "package not found". Adds a LICENSE file to match the MIT license already declared in package.json.

## 0.1.1

### Patch Changes

- [#39](https://github.com/phibar/dotsloth/pull/39) [`2574244`](https://github.com/phibar/dotsloth/commit/2574244a63e74fd1300fc1c69f095bb7ce5a2ab9) Thanks [@phibar](https://github.com/phibar)! - Use `phibar` as the organization in all command examples and help text, replacing names from unrelated organizations.

## 0.1.0

### Minor Changes

- [#36](https://github.com/phibar/dotsloth/pull/36) [`ddfc1b2`](https://github.com/phibar/dotsloth/commit/ddfc1b2a253e934d4129127f790313c40961e889) Thanks [@phibar](https://github.com/phibar)! - Add env file backup, pre-reinstall audit, periodic sync and Claude Code sync.

  - `dotsloth env list|push|pull` backs up gitignored `.env` files and machine-local overrides, recursing into monorepo subdirectories.
  - `dotsloth doctor` reports anything that would be lost if the machine were wiped — uncommitted changes, stashes, branches whose commits exist on no remote, unsaved env files and pending iCloud uploads — and exits non-zero while anything is unsafe.
  - `dotsloth daemon install|uninstall|status` runs a periodic sync via launchd.
  - `dotsloth claude link|status|memory|history` shares Claude Code settings, project memory and conversation history between machines.
  - Every command that changes configuration now re-applies it immediately, so a new org's git identity takes effect without a manual `dotsloth sync`.
