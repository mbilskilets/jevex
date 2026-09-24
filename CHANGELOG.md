# Changelog

## 0.1.1

- Call Jev through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`), OpenRouter (`OPENROUTER_API_KEY`)
  or the Convex AI Gateway (`JEV_PROVIDER=convex`, no key). The provider comes from whichever key is
  set; `JEV_PROVIDER` picks one when several are. `TYPESAFE_API_KEY` is now optional.

## 0.1.0

First release.

- `Jevex` client with `index`, `judge`, `forget`, `get`, `getMany` and `top`.
- Write-time judging through convex-helpers triggers, batched up to 20 rows per Jev request.
- Content-hash cache, claim tokens for edits during a judgment, lease recovery cron.
- `@mbilskilets/jevex/test` helper for convex-test.
