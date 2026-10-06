---
"@phibar/dotsloth": minor
---

Remove the `dotsloth plugins` commands. They came from oclif scaffolding and let third parties install plugins into the CLI at runtime, which meant vendoring a full copy of npm — the source of all 24 production vulnerabilities, including a critical one. dotsloth exposes no hooks or plugin surface, so nothing could use them.
