# VCS

## Setup

- Main branch: `main`
- Platform: `github` — `Crocogiciel-Studio/laivel-up`, public, MIT

## Branches

- **Always open a GitHub issue before creating a branch** — the issue is the unit of tracking; the branch and PR reference it.
- Format: `type/short-description`
- Types in use: `feat`, `fix`, `chore`, `docs`

## Commits

- Convention: Conventional Commits
- Format: `type(scope): description`
- Rules: imperative mood, lowercase subject, concise

## Commit Strategy

AI should auto commit: never

- No AI-attribution in history: commit messages carry no `Co-Authored-By` trailer, and PR / issue bodies carry no "generated with" line. Commits are authored by the human only.

## Platform rules

- `main` is protected: PR required (0 approvals — solo), linear history, no force-push, conversation resolution required, `enforce_admins=false`.
- Merge is squash + rebase only; the head branch is auto-deleted on merge.
- A `vX.Y.Z` tag triggers CD — see `deployment.md`.
