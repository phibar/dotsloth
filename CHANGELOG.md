# @phibar/dotsloth

## 0.1.0

### Minor Changes

- [#36](https://github.com/phibar/dotsloth/pull/36) [`ddfc1b2`](https://github.com/phibar/dotsloth/commit/ddfc1b2a253e934d4129127f790313c40961e889) Thanks [@phibar](https://github.com/phibar)! - Add env file backup, pre-reinstall audit, periodic sync and Claude Code sync.

  - `dotsloth env list|push|pull` backs up gitignored `.env` files and machine-local overrides, recursing into monorepo subdirectories.
  - `dotsloth doctor` reports anything that would be lost if the machine were wiped — uncommitted changes, stashes, branches whose commits exist on no remote, unsaved env files and pending iCloud uploads — and exits non-zero while anything is unsafe.
  - `dotsloth daemon install|uninstall|status` runs a periodic sync via launchd.
  - `dotsloth claude link|status|memory|history` shares Claude Code settings, project memory and conversation history between machines.
  - Every command that changes configuration now re-applies it immediately, so a new org's git identity takes effect without a manual `dotsloth sync`.
