# laivel-up UI

Static viewer for a laivel-up **evaluation** — the JSON that
`node dist/cli/main.js --profile <dir>` prints. Drop the file in, read the result.

> **Status: scaffold.** Today it parses an `evaluation.json` and echoes it. The
> rendered view — global verdict, per-axis confidence, criterion table,
> progression plan — lands with issue #41, which waits on the output schema
> (#21) and the i18n descriptor contract (#42).

## Why it is a separate package

The core is the evaluator. This viewer is a satellite: it depends on the core's
output shape, never the other way round. It keeps its **own** toolchain (npm,
`ui/package-lock.json`, Vite) so nothing here can destabilise the engine build.
`dependency-cruiser` forbids any `src/ -> ui/` import.

## Develop

```bash
cd ui
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # -> ui/dist/index.html, a single self-contained file
```

Everything is inlined (no CDN, no network at runtime): the built `index.html`
opens straight from `file://` on a machine with no internet, which is the
constraint the judges run under.

## Docker

```bash
docker build -t laivel-up-ui ui/
docker run --rm -p 8080:80 laivel-up-ui
# open http://localhost:8080
```

## Languages

FR / EN, switchable in the top-right, remembered in `localStorage`. The scaffold
only translates its own chrome. Engine sentences (`evidence`, `note`, `actions`)
become translatable with #42 and are resolved here afterwards.
