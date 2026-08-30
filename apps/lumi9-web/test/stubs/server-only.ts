/**
 * `server-only` throws the moment it is imported outside a Next server, which
 * is correct in an app and useless in a test runner: it makes every module that
 * declares the boundary — and every pure helper living beside one — untestable.
 *
 * Aliased in vitest.config.mts. femi9-web carries the identical stub for the
 * identical reason; the two are separate files because neither app depends on
 * the other's test tree.
 */
export {}
