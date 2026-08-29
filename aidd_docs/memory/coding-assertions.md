# Coding Assertions

The checks that must pass for code to count as done. The walking skeleton wires these into `package.json` and the CI (no manifest yet).

## Before commit

The fast gate.

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm typecheck` | `tsc --noEmit`, strict |
| 2 | `pnpm lint` | ESLint, `typescript-eslint` strict-type-checked |
| 3 | `pnpm test` | Vitest — TDD unit tests + the four sample profiles as regression |

## Before push

The heavier gate.

| Order | Command | Checks |
| ----- | ------- | ------ |
| 1 | `pnpm depcruise` | dependency-cruiser: the core imports no adapter |
| 2 | `pnpm build` | production build |

## Behavior

If a fix is needed, spawn one agent per failing assertion (typecheck / lint / test / depcruise).
