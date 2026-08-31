#!/usr/bin/env bash
# Local stacked-implementation runner.
#
# Implements a list of GitHub issues sequentially, each ON TOP OF the previous one's commits, on a
# single branch — so no two criteria ever touch the shared files (presets/aidd.json,
# src/criteria/index.ts, the regression test) from a stale base. One draft PR at the end.
#
# Runs `claude -p` per issue on your local plan auth. No CI secret involved. Stop with Ctrl-C or by
# killing this process; progress up to the last completed issue is kept on the branch.
#
#   scripts/build-criteria-stack.sh                 # run it
#   tail -f .criteria-stack.log                     # watch from another shell
#
# Re-running is safe: it resets the branch to main and redoes the list. To resume instead of
# restart, point BASE at the branch and trim ISSUES to what is left.

set -uo pipefail

REPO="Crocogiciel-Studio/laivel-up"
BRANCH="feat/axis-criteria-batch"
BASE="main"
REMOTE="gh-https"
# Stack order. Merge PR #15 (pr-correction-load) to $BASE before running, so the intervention
# criteria below build on it. Parallelism first, then the harness/intervention faisceaux, then the
# three that also touch the model/adapters.
ISSUES=(10 20 25 26 27 29 30 31 32 33 34 35 36 37 38 39)

LOG="$(git rev-parse --show-toplevel)/.criteria-stack.log"
exec > >(tee -a "$LOG") 2>&1
say() { printf '\n=== [%s] %s ===\n' "$(date -u +%H:%M:%SZ)" "$*"; }

say "start — issues: ${ISSUES[*]}"
git fetch -q "$REMOTE" "$BASE"
git checkout -B "$BRANCH" "$REMOTE/$BASE"

# Keep this script and its log out of every `git add -A` the per-issue runs do — a local,
# uncommitted exclude, so the committed .gitignore is untouched.
printf '%s\n' 'scripts/build-criteria-stack.sh' '.criteria-stack.log' > "$(git rev-parse --git-dir)/info/exclude"

done_issues=()
blocked_issues=()

for n in "${ISSUES[@]}"; do
  say "issue #$n"
  body=$(gh issue view "$n" --repo "$REPO" --json title,body --jq '"# " + .title + "\n\n" + .body')
  before=$(git rev-parse HEAD)

  claude -p --dangerously-skip-permissions "$(cat <<EOF
Implement GitHub issue #$n of this repository, working ON THE CURRENT GIT BRANCH ($BRANCH).
Do NOT create a branch. Do NOT push. Do NOT open a pull request. Do NOT run any gh command.

The issue, verbatim:
---
$body
---

Rules:
- Follow the spec exactly, including the fixture calibration table.
- Model a new criterion on src/criteria/pr-feature-size.ts and src/criteria/tooling-context-depth.ts;
  honour docs/agents/criterion-contract.md and docs/agents/hexagon.md.
- The prior criteria in this batch are already committed on this branch — read
  src/criteria/index.ts and presets/aidd.json as they are now and ADD to them; do not revert.
- When the code is written, run and make ALL of these pass:
    pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise && pnpm build
- Then commit everything: git add -A && git commit -m "feat: <concise summary>, closes #$n"
- If you genuinely cannot get the gate green, commit what you have with
  "wip(#$n): <reason>" and print a final line "BLOCKED: <reason>".
EOF
)"

  after=$(git rev-parse HEAD)
  if [ "$before" = "$after" ]; then
    say "#$n produced no commit — committing a marker and continuing"
    git commit --allow-empty -m "wip(#$n): run produced no commit"
    blocked_issues+=("$n")
  elif git log -1 --pretty=%s | grep -qi '^wip'; then
    say "#$n committed WIP"
    blocked_issues+=("$n")
  else
    say "#$n done"
    done_issues+=("$n")
  fi
done

say "pushing $BRANCH"
git push -u "$REMOTE" "$BRANCH"

closes=""
for n in "${ISSUES[@]}"; do closes="${closes}Closes #${n}"$'\n'; done
pr_body=$(cat <<EOF
Stacked batch — each criterion committed on top of the previous, so the shared files
(presets/aidd.json, src/criteria/index.ts, the regression test) never conflict.

- Done: ${done_issues[*]:-none}
- WIP / blocked (see the wip commits): ${blocked_issues[*]:-none}

${closes}
EOF
)

say "opening draft PR"
gh pr create --repo "$REPO" --draft --base "$BASE" --head "$BRANCH" \
  --title "feat: axis criteria faisceaux (stacked batch, ${#ISSUES[@]} criteria)" \
  --body "$pr_body"

say "finished — done: ${done_issues[*]:-none} | blocked: ${blocked_issues[*]:-none}"
