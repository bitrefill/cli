# Releasing `@bitrefill/cli` to npm

Publishing runs automatically when a **GitHub Release** is published (see [npm-publish.yml](./workflows/npm-publish.yml)).

## Prerelease (e.g. `0.2.0-beta.0`)

1. Merge the version bump on `master` (or your release branch). `package.json` must use a **semver prerelease** (a hyphen in the version, e.g. `0.2.0-beta.0`, `0.2.0-rc.1`).
2. Create and push an annotated tag matching the version:

   ```bash
   git checkout master && git pull
   git tag -a v0.2.0-beta.0 -m "v0.2.0-beta.0"
   git push origin v0.2.0-beta.0
   ```

3. On GitHub: **Releases → Draft a new release → Choose tag `v0.2.0-beta.0` →** describe changes → check **Set as a pre-release** (optional but recommended) → **Publish release**.

4. The workflow publishes to npm with the **`beta`** dist-tag so `latest` stays on the last stable version. Install with:

   ```bash
   npm install -g @bitrefill/cli@beta
   ```

## Stable release (e.g. `0.2.0`)

1. Merge `package.json` version **`0.2.0`** (no prerelease suffix). The CLI reads this version at runtime from `src/version.ts` (no separate bump in `src/`).
2. Tag and push:

   ```bash
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

3. **Publish release** on GitHub (not marked as pre-release). The workflow publishes as **latest**.

## Requirements

- **npm:** [Trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) for this repo, or a valid `NPM_TOKEN` if your org uses classic tokens instead.
- **Version:** The tag should match the commit that contains the same `version` in `package.json` as what you intend to ship.
