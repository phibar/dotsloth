#!/bin/sh
# Purpose: Stand in for the runner's config.sh, so tests register and
# deregister a runner without reaching GitHub.
# Intention: copied by the fake tar of test/core/runners.test.ts; logs its
# arguments to $FAKE_LOG, fails where $FAKE_CONFIG_FAIL is set, and writes
# .runner and an svc.sh from svc.sh.template, as the real one does.

echo "config.sh $*" >> "$FAKE_LOG"

if [ "$1" = remove ]; then
  rm -f .runner
  echo "Runner removed"
  exit 0
fi

if [ -n "$FAKE_CONFIG_FAIL" ]; then
  echo "Http response code: NotFound"
  exit 1
fi

name=""
while [ $# -gt 0 ]; do
  [ "$1" = --name ] && name=$2
  shift
done

echo "Runner successfully added"
echo "{\"agentName\":\"$name\"}" > .runner
sed "s/{{SvcNameVar}}/actions.runner.acme.$name/" "$FAKE_RUNNER_FIXTURE/svc.sh.template" > svc.sh
chmod +x svc.sh
