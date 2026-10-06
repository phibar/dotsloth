---
"@phibar/dotsloth": patch
---

Fix `dotsloth doctor` counting an untracked env file twice — once as an uncommitted change and once under env files — which meant it could never exit 0 and so could never actually gate a wipe.
