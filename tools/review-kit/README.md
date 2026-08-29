# review-kit

A multi-agent pull request review you can drop into any repository.

Several specialist reviewers read the same diff in parallel, blind to each other, each answering one
question about the change. Their findings are merged, deduplicated by a pass that cannot add
anything of its own, and posted as **one GitHub review with many inline comments — by a script,
never by a model**.

The kit ships the parts that are the same everywhere. It does not ship the part that isn't: which
reviewers this repo needs, what routes them, and what each one owns. That is authored at install
time, from the repo, by you or by an agent following `review-onboarding.md`.

## Install

The kit is a self-contained directory with no dependencies. Copy it, clone it, or vendor it — all
three work, and `install.mjs` locates its own `runtime/` and `templates/` either way.

```bash
# it is its own repository
git clone git@github.com:<you>/review-kit.git ~/src/review-kit
node ~/src/review-kit/install.mjs --target /path/to/repo --corpus aidd

# or straight from GitHub, nothing to clone
npx github:<you>/review-kit --target /path/to/repo --corpus aidd

# or vendored: every repo the kit installs gets a copy at tools/review-kit,
# so it can install the next one
node tools/review-kit/install.mjs --target ../other-repo
```

```bash
node /path/to/review-kit/install.mjs --target /path/to/repo

# options
#   --docs-root docs/agents      where the review docs live
#   --agents-root .claude/agents where the agent files live
#   --review-dir .review         where a run writes its artefacts
#   --trigger "@claude deep-review"   the PR comment that starts a CI review
#   --corpus native|aidd|none    where the rules live (see below). default: native
#   --no-workflow                local /review-pr only, no GitHub Actions
#   --no-vendor                  do not copy the kit into <target>/tools/review-kit
#   --force                      overwrite existing files
#   --dry-run                    print what would happen
```

Re-running is safe: existing files are left alone unless `--force`, which is also how you take an
update to the runtime without losing your agent files.

Then, and this is the half that matters:

```
/review-kit                                                  # in Claude Code
"read docs/agents/review-onboarding.md and execute it"       # any other coding agent
```

It surveys the repo, proposes the axes, writes the config, authors one agent file per axis, and
calibrates the result against a pull request whose review you already know.

Finally: `node .github/scripts/review-doctor.js --all`.

Until the onboarding is done, that gate stays green and only warns — a rule nobody owns yet is an
unfinished install, not a broken pipeline. Once the agent files carry local knowledge, the same
finding means drift, and drift fails the build.

## What lands in the repo

| Path | What it is | Who edits it |
|------|------------|--------------|
| `.github/scripts/review-*.js` | the pipeline: context, routing, corpus, merge, publish, doctor | nobody, normally |
| `.github/workflows/review-kit-check.yml` | CI guard: the wiring and the corpus, on every PR that touches them | nobody, normally |
| `.github/workflows/pull-request-review-pipeline.yml` | the CI entry point | nobody, normally |
| `<docsRoot>/review-pipeline.md` | how a review is produced, stage by stage | nobody, normally |
| `<docsRoot>/review-contract.md` | how a reviewer judges and reports | two repo-specific blocks |
| `<docsRoot>/review-onboarding.md` | the procedure for fitting this to a repo | nobody, normally |
| `<docsRoot>/schemas/*.json` | the input, output and integration shapes | nobody, normally |
| **`<docsRoot>/review.config.json`** | **axes, routing, exclusions — the repo's shape** | **you** |
| **`<docsRoot>/review-ownership.json`** | **one rule anchor, one owning reviewer** | **you** |
| **`<agentsRoot>/*-reviewer.md`** | **one file per axis: what it owns, what it doesn't, how it works** | **you** |
| `<docsRoot>/review-templates/` | the axis template, the catalogue, a rules-doc skeleton | — |
| **`<docsRoot>/INDEX.md`** | **the map: which rule doc to read when** | **you** |
| **`<docsRoot>/routing.yml`** | **task type → docs to read, paths touched, gotchas** | **you** |
| **`<docsRoot>/glossary.md`** | **the words this codebase uses for two different things** | **you** |
| `.claude/skills/dev-context/` | loads the rules that govern a task, before code is written | — |
| `.claude/skills/doc-lint/` | the doc tree's invariant checker | — |
| `.claude/skills/review-pr/` | run a review from a session, printed to chat, never posted | — |
| `.claude/skills/review-kit/` | install, add an axis, tune a noisy one | — |
| `tools/review-kit/` | the kit itself, so this repo can install the next one | — |

## Using it

```bash
# CI: comment the trigger phrase on a pull request
@claude deep-review

# locally, in Claude Code
/review-pr            # current branch vs the default branch
/review-pr 1234       # a pull request, by number
/review-pr --only security,database
```

The local run prints the review to the chat and posts nothing. Posting is the workflow's job.

## For agents that are not Claude Code

Nothing here depends on Claude Code except the two `SKILL.md` files, which are thin wrappers. The
procedures they wrap are plain documents:

- run a review → `.claude/skills/review-pr/SKILL.md`
- install or extend one → `<docsRoot>/review-onboarding.md`

Point any agent at those. The CI side is a GitHub Actions workflow calling `anthropics/claude-code-action`;
swapping that for another runner means changing one step, and the scripts on either side of it are
plain Node with no dependencies.

## Two layers, one corpus

The review is the visible half. Under it sits the corpus it cites:

```
                 rule docs, anchored
                   │              │
     routing.yml ──┘              └── review-ownership.json
          │                                    │
     dev-context                       the reviewer agents
     (write time)                       (review time)
```

The same anchored rule is loaded by a coding agent **before** it writes and cited by a reviewer
**after**. That symmetry is what makes the comments feel fair rather than arbitrary: nothing is
enforced at review time that was not offered at write time.

`--corpus none` installs the review half alone — for a repo that wants the reviewers before the
rules. They still work; they just report fewer anchored findings and more unanchored ones.

### Two shapes of corpus

|  | `--corpus native` | `--corpus aidd` |
|---|---|---|
| Shape | one doc per topic, one rule per heading | one rule per file |
| Cited as | `<doc>.md#<anchor>` | the rule file's path |
| Scope | the routing table maps a kind of work to the docs | declared **in each rule's own frontmatter** |
| Written by | hand, in this repo | a generator — [AIDD](https://github.com/ai-driven-dev/framework), `.claude/rules`, `.cursor/rules`, `.github/instructions` |
| The kit | scaffolds and lints it | **never writes to it** |

A filed rule already declares the globs it applies to — `paths`, `globs` or `applyTo`, depending on
the tool. So the run reads them and hands each reviewer the rules its axis owns **that this diff
actually engages**. No second mapping to maintain, and no reviewer left guessing which rule governs
a file it was given.

```bash
node .github/scripts/review-corpus.js                          # what the corpus resolves to
node .github/scripts/review-corpus.js --match src/api/A.ts     # what a change engages
```

With a generated corpus, own it **by pattern** — `".claude/rules/03-security/**"` survives a
regeneration; a line per file does not. What you then watch is drift, and `doc-lint` reports it from
both sides: a rule no axis owns (new or moved), and a pattern that matches nothing (deleted or
renamed). A rule you disagree with is fixed in the generator's input, never in the file it wrote.

### One invariant, one checker

| Tool | Owns | Run it |
|------|------|--------|
| `.claude/skills/doc-lint/check.mjs` | the doc tree: anchors defined and owned, references resolving, routing targets existing, agents pinned, stray edit damage | before a PR touching the docs |
| `.github/scripts/review-doctor.js` | the wiring: axes ↔ agent files, schemas, workflow trigger, gitignore | after changing the config or an agent |

`review-doctor.js --all` runs both. Where they would overlap, the doctor defers and says so; with no
`doc-lint` installed it falls back to a shallow anchor check and warns that it is shallow. **Never
add the same invariant to both** — a check in two places is a check that will disagree with itself.

`doc-lint` labels findings `fix` (one correct answer, apply it) or `ask` (a decision, report and
stop). `review-ownership.json` is the source of truth; an agent's `## You own` block is a view of
it, which is why a mismatch is a `fix`.

## In CI

Two workflows, and they are deliberately separate.

**`pull-request-review-pipeline.yml`** — the review itself, on a trigger comment. One job per axis,
each pinned and holding `contents: read`; one job that can write and holds no model.

**`review-kit-check.yml`** — the guard, on every pull request that touches the pipeline, the agent
files, the rules or the docs. No model, no secrets, no network: `review-doctor.js --all`, plus a
step that prints the rules that PR's own changes engage. It exists because every way this pipeline
breaks is silent — an axis whose agent file was renamed simply stops running, a rule the corpus
regenerated away simply stops being cited, and the review that comes back looks exactly like a
review that found nothing.

Everything either workflow runs is plain Node with no dependencies, so any other CI can run the same
two commands:

```bash
node .github/scripts/review-doctor.js --all
node .github/scripts/review-corpus.js --match $(git diff --name-only origin/main...HEAD)
```

## Verify an install without spending a token

```bash
node tools/review-kit/selftest.mjs
```

Installs into a throwaway directory and drives stages 1, 4 and 5 against a fake GitHub API — real
scripts, invented pull request. It asserts the properties that would otherwise only fail in front of
a reviewer: the merge base, the exclusions, the anchorable ranges, the routing, the minted ids, and a
finding off a changed line landing in the review body instead of the bin.

Run it after changing anything under `.github/scripts/`, and on any machine where you are not sure
the copy arrived intact.

## Adopting it in a repo that already has a hand-rolled version

Do not `--force` over it. The runtime here is the same pipeline with the repo-specific parts lifted
out into `review.config.json`, so the migration is:

1. Install with `--no-vendor` into a scratch clone, and diff the scripts against yours. Anything you
   had that is missing is either a repo specific that belongs in the config, or an improvement that
   belongs upstream in the kit.
2. Move your hardcoded exclusion and routing regexes into `exclude` and `axes`.
3. Keep your agent files as they are — they are the expensive part and the kit does not touch them.
   Check the frontmatter is pinned and that `review-ownership.json` still passes the doctor.
4. Run `selftest.mjs`, then one calibration run against a pull request you already know.

## The seven things not to break

1. **Reviewers are blind to each other.** Two independent readings are the product.
2. **One anchor, one owner.** Two axes citing one rule produce two comments, and readers start
   skimming.
3. **Scripts post, agents don't.** In CI that is enforced by the tokens: model jobs get
   `contents: read`; the job that can write has no model.
4. **Pins live in the agent file.** Model and effort are per-axis constants, never per-run choices.
5. **Nothing builds.** CI already compiles, formats and typechecks.
6. **Evidence is mandatory.** A finding quotes the code, so nobody reports what they have not read.
7. **Silence is never coverage.** Excluded files, skipped files, failed axes and missing metrics are
   all stated in the output.

`review-doctor.js` checks what can be checked mechanically. The rest is on whoever edits the agent
files.

## Cost, roughly

One run is one session per axis plus a cheap integration pass — five axes on a medium diff lands in
the low hundreds of thousands of tokens. The lever is the pins in the agent files, not the number of
comments. An axis that reliably finds nothing on this repo should be deleted, not downgraded.
