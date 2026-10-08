#!/usr/bin/env bash
# Usage: prod-deps-changed.sh <base-ref>
#
# Exits 0 and prints the dependency name when HEAD changes a production
# dependency (package.json "dependencies") relative to <base-ref>; exits 1
# when it does not. Production dependencies install on users' machines, so
# bumping one changes what users run. devDependencies and GitHub Actions never
# reach the published package.
#
# The list is read from package.json rather than hardcoded so it cannot drift,
# and matched as a fixed string - a dependency name contains dots and slashes
# that would misbehave as a regex.
set -euo pipefail

base="$1"
# Changed lines only: the diff's context lines show untouched neighbours, and
# matching those would flag a devDependency bump next to "dependencies".
diff=$(git diff "${base}...HEAD" -- package.json | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' || true)

while IFS= read -r dep; do
  [ -z "$dep" ] && continue
  if grep -F -q "\"${dep}\"" <<< "$diff"; then
    echo "$dep"
    exit 0
  fi
done < <(git show "${base}:package.json" \
  | node -p "Object.keys(JSON.parse(require('fs').readFileSync(0)).dependencies||{}).join('\n')")

exit 1
