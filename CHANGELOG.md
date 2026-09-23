# Changelog

## 0.1.0

First release.

- `Jevex` client with `index`, `judge`, `forget`, `get`, `getMany` and `top`.
- Write-time judging through convex-helpers triggers, batched up to 20 rows per Jev request.
- Content-hash cache, claim tokens for edits during a judgment, lease recovery cron.
- `jevex/test` helper for convex-test.
