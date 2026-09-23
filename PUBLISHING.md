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

- Publish the first version by hand from a logged-in machine, because npm only
  lets you configure a trusted publisher on a package that already exists:

  ```bash
  bun run build:clean
  npm publish --access public
  ```

- On npmjs.com, open the package, Settings, Trusted Publisher, GitHub Actions.
  Repository `mbilskilets/jevex`, workflow `release.yml`. No npm token is stored
  in GitHub.

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

The package ships `dist/` only. Consumers import `jevex`, `jevex/convex.config`,
`jevex/_generated/component` and `jevex/test`.
