---
"@phibar/dotsloth": minor
---

`dotsloth clone <org>` clones an organisation's repositories into its org folder, optionally only those with given topics (`--topic`, any of several). It lists the matching repositories to pick from, skips the ones already cloned, leaves out archived repositories and forks unless `--include-archived` / `--include-forks`, goes on when one fails, and links the new repositories under `~/github/topics/`. `--dry-run` only lists; `--yes` clones all without asking.
