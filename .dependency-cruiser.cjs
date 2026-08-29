/**
 * Boundary enforcement for the hexagon. The core owns the model and the engine
 * and must never import an adapter, a criterion implementation, the CLI, or a
 * third-party runtime dependency. Adapters and criteria may depend on the core.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-stays-pure',
      comment:
        'src/core must not import adapters, criteria, or the CLI — only the model crosses the boundary.',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^src/(adapters|criteria|cli)' },
    },
    {
      name: 'core-has-no-runtime-deps',
      comment:
        'src/core must not import third-party packages — it depends on no stack, no format, no framework.',
      severity: 'error',
      from: { path: '^src/core' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'] },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies signal a leak in the layering.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Every module should be reachable from an entry point or a test.',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js'],
    },
  },
};
