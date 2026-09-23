# Publishing

Releases are cut from CI, on demand.

1. Merge to `main`. CI runs build, typecheck and tests on every push and PR.
2. Add a section to `CHANGELOG.md` for the version you are about to release.
3. On GitHub, open Actions, pick "Release", click "Run workflow", and choose
   `patch`, `minor`, `major`, or type an exact version.

The workflow bumps `package.json`, commits `v<version>`, tags it, publishes to
npm with provenance, pushes the commit and tag to `main`, and creates a GitHub
release with generated notes.

## One-time setup

The account has 2FA on, so the first publish needs one of:

- Locally, with a one-time code from your authenticator:

  ```bash
  bun run build
  npm publish --access public --otp=<code>
  ```

- Or from CI: on npmjs.com create a granular access token with "bypass 2FA"
  and publish rights, add it as the `NPM_TOKEN` repository secret on GitHub,
  and run the Release workflow with the exact version `0.1.0`.

After the package exists, switch to Trusted Publishing: on npmjs.com open the
package, Settings, Trusted Publisher, GitHub Actions, repository
`mbilskilets/jevex`, workflow `release.yml`. Then delete the `NPM_TOKEN` secret.
The workflow uses OIDC when the secret is absent.

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
