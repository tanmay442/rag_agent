// Port interfaces have moved to @app/domain so that infrastructure
// can implement them without depending on @app/application. This file
// re-exports them for backwards compatibility — prefer importing
// directly from '@app/domain' in new code.
export * from '@app/domain';
