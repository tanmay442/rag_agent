/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---- DOMAIN: pure types + zod, no I/O, no node APIs ----
    {
      name: 'no-domain-importing-other-packages',
      severity: 'error',
      comment: 'Domain is pure: it may only depend on zod.',
      from: { path: '^packages/domain' },
      to: { path: '^packages/(application|infrastructure|cli|pulsar-content)' },
    },
    {
      name: 'no-domain-importing-src',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: { path: '^src/' },
    },
    {
      name: 'no-domain-importing-banned-packages',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: {
        dependencyTypes: ['npm'],
        path: 'node_modules/(drizzle-orm|@ai-sdk|@clerk|next|pdf-parse|pdf-lib|pg|@neondatabase|drizzle-kit|ai/)',
      },
    },
    {
      name: 'no-domain-importing-node-builtins',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: { path: '^node:' },
    },

    // ---- APPLICATION: depends on Domain only, not Infrastructure ----
    {
      name: 'no-application-importing-infrastructure',
      severity: 'error',
      from: { path: '^packages/application' },
      to: { path: '^packages/infrastructure' },
    },
    {
      name: 'no-application-importing-src',
      severity: 'error',
      from: { path: '^packages/application' },
      to: { path: '^src/' },
    },
    {
      name: 'no-application-importing-banned-packages',
      severity: 'error',
      from: { path: '^packages/application' },
      to: {
        dependencyTypes: ['npm'],
        path: 'node_modules/(drizzle-orm|@ai-sdk|@clerk|next|pdf-parse|pdf-lib|pg|@neondatabase|drizzle-kit|ai/)',
      },
    },

    // ---- INFRASTRUCTURE: no Next, no src/app ----
    {
      name: 'no-infrastructure-importing-app',
      severity: 'error',
      from: { path: '^packages/infrastructure' },
      to: { path: '^src/(app|components|lib)' },
    },
    {
      name: 'no-infrastructure-importing-next',
      severity: 'error',
      from: { path: '^packages/infrastructure' },
      to: {
        dependencyTypes: ['npm'],
        path: 'node_modules/next/',
      },
    },

    // ---- CLI: cannot import from src/app|components (config schema import is allowed
    //            until commit 4 moves the schema into @app/domain) ----
    {
      name: 'cli-cannot-import-app-src',
      severity: 'error',
      from: { path: '^packages/cli' },
      to: { path: '^src/(app|components)' },
    },

    // ---- PULSAR-CONTENT: no internal deps ----
    {
      name: 'no-pulsar-content-internals',
      severity: 'error',
      from: { path: '^packages/pulsar-content' },
      to: { path: '^packages/(domain|application|infrastructure|cli)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
