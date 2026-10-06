---
"@phibar/dotsloth": patch
---

Fix `dotsloth claude history pull` restoring nothing on a fresh machine. It listed only the local project directory, so with an empty `~/.claude` it iterated nothing — the exact case history sync exists for.
