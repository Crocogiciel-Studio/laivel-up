# laivel-up UI

Static viewer for a laivel-up **evaluation** — the JSON that
`node dist/cli/main.js --profile <dir>` prints. Drop the file in, read the result.

> **Status.** Renders the global verdict, per-axis confidence and readings, and
> the progression plan, with the raw JSON behind a toggle. Level and axis labels
> come from a bundled copy of `presets/aidd.json`; an evaluation scored against
> another grid falls back to raw ids. Engine sentences (`evidence`, `note`,
> `actions`) show in English until the i18n descriptor contract (#42) lands —
> everything the UI itself labels is already FR/EN.

## Why it is a separate package

The core is the evaluator. This viewer is a satellite: it depends on the core's
output shape, never the other way round. It is a `pnpm` workspace package with
its **own** Vite / Vitest toolchain, and `dependency-cruiser` forbids any
`src/ -> ui/` import — so the engine build cannot be destabilised from here.

## One command

```bash
pnpm install     # from the repo root
pnpm viz         # evaluates examples/dev-sample and opens the viewer
pnpm viz -p test/fixtures/profiles/arthur      # any profile dir
pnpm viz -p <dir> -g <preset.json>
```

`pnpm viz` builds the core if needed, evaluates the profile, writes the JSON
where the dev server serves it, and opens the browser on the rendered result —
no drag-and-drop.

## Develop

```bash
pnpm -C ui run dev      # viewer alone, http://localhost:5173 (drop a file in)
```

The viewer auto-loads `evaluation.json` if the server has one (what `pnpm viz`
writes) or `?src=<url>`; otherwise it waits for a dropped file.

## Build

```bash
pnpm -C ui run build    # -> ui/dist/index.html, a single self-contained file
```

Everything is inlined (no CDN, no network at runtime): the built `index.html`
opens straight from `file://` on a machine with no internet, which is the
constraint the judges run under.

## Test

```bash
pnpm -C ui test         # parseEvaluation + i18n resolver
```

## Docker

```bash
docker build -f ui/Dockerfile -t laivel-up-ui .   # context is the repo root
docker run --rm -p 8080:80 laivel-up-ui
# open http://localhost:8080
```

## Languages

FR / EN, switchable in the top-right, remembered in `localStorage`. The scaffold
only translates its own chrome. Engine sentences (`evidence`, `note`, `actions`)
become translatable with #42 and are resolved here afterwards.
