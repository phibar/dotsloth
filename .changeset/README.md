# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): a small
markdown file per pull request describing what changed and how the version
should move.

**Every merge to `main` publishes a release.** There is no separate release step
and no release PR — so a changeset is required on every PR, and CI blocks the
merge without one.

## Adding one

```sh
npm run changeset
```

Pick `patch`, `minor` or `major`, write a one-line summary, and commit the
generated file with your PR. The summary becomes the CHANGELOG entry and the
GitHub release notes, so write it for someone reading release notes, not for
the diff.

- **patch** — bug fix, no behaviour change for existing users
- **minor** — new command or flag, backwards compatible
- **major** — breaks an existing command, flag or config shape

## No user-facing change?

Refactors, CI tweaks and docs do not warrant a release:

```sh
npm run changeset -- --empty
```

That satisfies the check and publishes nothing.

## What the bot tells you

A comment on your PR shows **the exact version merging will publish**, for
example `0.1.0 → 0.2.0 (minor)`. It is calculated by actually running
`changeset version`, so it accounts for every changeset pending on `main` —
not just yours. Several pending `patch` changesets plus one `minor` produce a
single `minor` release.

## On merge

The release workflow bumps `package.json`, rewrites `CHANGELOG.md`,
regenerates the oclif README, commits that to `main`, publishes to npm and
cuts the GitHub release. The version is never edited by hand.

## Emergency bypass

The `skip-changeset` label on a PR skips the check. Use it only when a fix has
to land and the release can wait.
