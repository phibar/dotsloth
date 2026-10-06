# Bootstrapping a fresh Mac

The order matters: each step depends on the one above it. Written to be followed
top to bottom on a machine with nothing installed.

## Before you wipe the old machine

```sh
dotsloth doctor          # must exit 0
dotsloth env push        # back up .env files and local overrides
dotsloth claude memory push
dotsloth claude history push
```

`dotsloth doctor` exits non-zero while anything would be lost. It checks for
uncommitted changes, **stashes** (invisible to `git status`), branches whose
commits exist on no remote, unsaved env files, and **pending iCloud uploads**.

Two things it catches that a manual check usually misses:

- A branch whose upstream was deleted (`[gone]`) still looks tracked, but its
  commits may exist nowhere else.
- A squash-merged PR leaves the original branch's commits on no remote, so git
  reports them as unpushed even though the work is safely merged. `doctor` asks
  GitHub which case it is instead of guessing.

**Wait for iCloud to finish uploading before erasing the disk.** A file in the
iCloud folder is not a backup until it has actually left the machine:

```sh
brctl log --wait --shorten
```

## On the new machine

### 1. Command line tools and Homebrew

```sh
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Node — from Homebrew, not a version manager

```sh
brew install node
```

Use a Homebrew node if you intend to run the periodic sync agent. launchd runs
with a minimal environment and no shell profile, so nvm's shims are not on
`PATH` and the LaunchAgent must name an absolute node binary. nvm's absolute
paths embed the version (`.nvm/versions/node/v24.12.0/bin/node`) and disappear
on your next upgrade, which leaves the agent **silently dead** rather than
visibly broken. `dotsloth daemon install` warns when it has to pin one.

### 3. Sign in to iCloud

System Settings → Apple ID → iCloud Drive. Wait for
`~/Library/Mobile Documents/com~apple~CloudDocs/development/dotsloth/` to appear
before continuing — everything below reads from it.

### 4. Install dotsloth

```sh
npm install -g @phibar/dotsloth
```

### 5. SSH keys

Keys are deliberately **not** synced. Generate a new one and add it to GitHub,
which is both safer and no slower than restoring one:

```sh
ssh-keygen -t ed25519 -C "you@example.com"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
gh auth login            # brew install gh, if needed
gh ssh-key add ~/.ssh/id_ed25519.pub
```

### 6. Restore configuration

```sh
dotsloth sync            # ~/.gitconfig, org includeIf rules, allowed_signers, dotfile symlinks
dotsloth org list        # confirm your identities came back
```

### 7. Clone your repos

```sh
dotsloth clone git@github.com:org/repo.git
```

`clone` syncs before cloning so the right git identity is in place by the time
the repo exists — otherwise the first commit gets the wrong author.

### 8. Restore env files

```sh
dotsloth env pull        # skips repos that are not cloned yet
dotsloth env list        # confirm
```

Run this *after* cloning. `env pull` will not scatter files into a tree that is
not there yet.

### 9. Claude Code

```sh
dotsloth claude link            # share settings.json and global CLAUDE.md
dotsloth claude memory pull     # project memory
dotsloth claude history pull    # conversation history
```

Claude Code auth lives in the macOS keychain, not in `~/.claude`, so you will
simply log in again.

### 10. Turn on periodic sync

```sh
dotsloth daemon install
dotsloth daemon status
```

## What is deliberately not restored

| Thing | Why |
|---|---|
| SSH private keys | Safer to regenerate and re-add to GitHub |
| AWS credentials | Re-authenticate |
| `mkcert` / localhost certs | `mkcert` regenerates them |
| `node_modules`, build output | Reinstall from the lockfile |
| `~/.claude` caches, shell snapshots, session env | Machine-local runtime state |

## Verify

```sh
dotsloth status
dotsloth doctor          # should be clean on a fresh machine
```
