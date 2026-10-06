# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): a small
markdown file per pull request describing what changed and how the version
should move.

## Adding one

```sh
npm run changeset
```

Pick `patch`, `minor` or `major`, write a one-line summary, and commit the
generated file with your PR. The summary becomes the CHANGELOG entry, so write
it for someone reading release notes, not for the diff.

- **patch** — bug fix, no behaviour change for existing users
- **minor** — new command or flag, backwards compatible
- **major** — breaks an existing command, flag or config shape

## What happens next

A bot comments on your PR saying whether a changeset is present. Once merged,
the release workflow collects every pending changeset into a single
**"Version Packages"** PR that bumps `package.json` and rewrites `CHANGELOG.md`.
Merging *that* PR publishes to npm and cuts the GitHub release.

So the version is never edited by hand, and nothing publishes until you merge
the release PR.

## No user-facing change?

Refactors, CI tweaks and docs do not need one. Run `npm run changeset -- --empty`
to record that deliberately and silence the bot.
