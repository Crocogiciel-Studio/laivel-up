# Documentation

The engine first, the studio around it second. Read top to bottom for the full
picture, or jump straight to what you need.

## Start here

| Doc | For |
| --- | --- |
| [Getting started](getting-started.md) | Every way to run this — CLI, viewer, full studio, Docker, tests |
| [Concepts](concepts.md) | The domain model and how a verdict is built, step by step |
| [Architecture](../ARCHITECTURE.md) | The monorepo map, the hexagonal boundary, what depends on what |

## Author your own

| Doc | For |
| --- | --- |
| [Authoring a profile](authoring-a-profile.md) | The input: what a developer's evidence looks like on disk |
| [Authoring a grid](authoring-a-grid.md) | The output shape: levels, axes, bundles, calibration |
| [Criteria reference](criteria/README.md) | Every built-in criterion — what it reads, what it decides |

## The studio (web app)

| Doc | For |
| --- | --- |
| [Studio overview](studio.md) | The web app: org model, data model, running it |
| [`packages/studio-server`](../packages/studio-server/README.md) | Backend routes and auth |
| [`packages/studio-web`](../packages/studio-web/README.md) | The SPA |
| [`packages/studio-db`](../packages/studio-db/supabase/README.md) | Schema, RLS, migrations |
| [`packages/viewer`](../packages/viewer/README.md) | The single-file offline viewer |

## For contributors

The `docs/agents/` folder documents this repo's own multi-agent code-review
pipeline (how a PR gets reviewed, the rule corpus, how to add a reviewer axis)
— a different audience, not part of the product story above. Start at
[`docs/agents/review-pipeline.md`](agents/review-pipeline.md) if that's what
you're touching.
