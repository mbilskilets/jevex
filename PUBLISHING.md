# Publishing

Releases are cut from CI, on demand, by the repository owner only.

1. Open a PR that bumps `version` in `package.json` and adds a matching
   section to `CHANGELOG.md`. CI runs build, typecheck and tests on every PR.
2. Merge it to `main` (squash merge, CI must be green; `main` accepts no
   direct pushes).
3. On GitHub, open Actions, pick "Release", click "Run workflow", then approve
   the `npm-release` environment deployment when prompted.

The workflow refuses to run for anyone but the owner, and the environment
requires the owner's approval before any secret is exposed. It checks that no
tag exists for the version yet, builds, tests, publishes to npm with
provenance, pushes the `v<version>` tag, and creates a GitHub release with
generated notes.

## One-time setup

The account has 2FA on, so the first publish needs one of:

- Locally, with a one-time code from your authenticator:

  ```bash
  bun run build
  npm publish --access public --otp=<code>
  ```

- Or from CI: on npmjs.com create a granular access token with "bypass 2FA"
  and publish rights, add it as the `NPM_TOKEN` secret on the `npm-release`
  environment (Settings, Environments), and run the Release workflow.

After the package exists, switch to Trusted Publishing: on npmjs.com open the
package, Settings, Trusted Publisher, GitHub Actions, repository
`mbilskilets/jevex`, workflow `release.yml`, environment `npm-release`. Then
delete the `NPM_TOKEN` secret. The workflow uses OIDC when the secret is absent.

## Local checks

`build:clean` regenerates `_generated/` and needs a Convex deployment
(`bunx convex dev` once to create a local one). CI uses `bun run build` only,
because the generated files are committed.

```bash
bun install
bun run link
bun run build:clean
bun run typecheck
bun run test
```

The package ships `dist/` only. Consumers import `@mbilskilets/jevex`, `@mbilskilets/jevex/convex.config`,
`@mbilskilets/jevex/_generated/component` and `@mbilskilets/jevex/test`.
