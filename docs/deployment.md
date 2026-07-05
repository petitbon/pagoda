# Deployment

Pagoda deploys as GitHub Packages and a GitHub release. It is not a hosted
service.

## Published Packages

Publish these public packages from the monorepo:

- `@petitbon/pagoda-core`
- `@petitbon/pagoda-adapter-sdk`
- `@petitbon/pagoda-runner`
- `@petitbon/pagoda-cli`

Do not publish the private root package or `@petitbon/pagoda-target-demo-agent`.

## GitHub Packages Registry

Pagoda uses the GitHub Packages npm registry:

```text
https://npm.pkg.github.com
```

All public package manifests set:

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

The repository-level `.npmrc` and `.yarnrc.yml` route the `@petitbon` scope to
GitHub Packages. Do not commit auth tokens. Local users configure package auth
in their user-level Yarn or npm config.

## Pagoda Workflow

`.github/workflows/pagoda.yml` is the only GitHub Actions workflow. It builds,
validates, and tests pull requests. On pushes to `main`, it also creates the
next patch tag and publishes packages. On manually pushed `vMAJOR.MINOR.PATCH`
tags, it publishes that tag version directly.

The workflow needs:

```yaml
permissions:
  contents: write
  packages: write
```

No npm organization, npm token, npm trusted publisher, or npm provenance setup is
required for this deployment path.

## Main Release Flow

On every push to `main`, `.github/workflows/pagoda.yml` finds the latest
`vMAJOR.MINOR.PATCH` tag, computes the next patch version, creates that tag,
checks out the tag, sets public package versions to the tag version in the
checked-out CI workspace, builds, validates, tests, and publishes that exact
package version.

Every deployment from `main` is tied to an immutable version tag. If the package
base version in `packages/pagoda-core/package.json` is greater than the latest
tag, the workflow uses that base version; otherwise it increments the latest
patch version.

Examples:

- latest tag `v0.1.0` -> next deployment tag `v0.1.1`
- latest tag `v0.1.9` -> next deployment tag `v0.1.10`
- package base version `0.2.0` and latest tag `v0.1.10` -> next deployment tag
  `v0.2.0`

The workflow also handles manually pushed version tags. It skips publish steps
for bot-created tag events so the automatic `main` release flow cannot
double-publish the same version.

## First Publish Access

After the first successful publish, verify each package in GitHub Packages:

1. The package is linked to `petitbon/pagoda`.
2. The package is public, or it inherits public access from the repository.
3. The repository has admin/write access to publish future versions.

Repeat this check for all four public packages. This is a GitHub Packages setup
step, not a code change, and it only needs to be corrected when package access
is wrong.

## Public CLI Release Asset

The workflow uploads a standalone CLI tarball to each GitHub release:

- `pagoda-cli-standalone-<version>.tgz`
- `pagoda-cli-standalone.tgz`

The stable filename lets the Homebrew formula install the CLI without GitHub
Packages registry configuration.

## Homebrew Tap

This repository also contains `Formula/pagoda.rb`, so users can install the
standalone CLI with Homebrew:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
```

The checked-in formula uses a versioned release asset URL and a pinned SHA256:

```text
https://github.com/petitbon/pagoda/releases/download/vX.Y.Z/pagoda-cli-standalone.tgz
```

The release workflow updates `Formula/pagoda.rb` on `main` after publishing a
release. It computes the SHA256 from the exact standalone tarball built in CI
and pushes a bot commit such as:

```text
chore(homebrew): update pagoda formula to vX.Y.Z [skip ci]
```

For manual backfills, update the formula version, URL, and checksum with:

```bash
node scripts/update-homebrew-formula.mjs vX.Y.Z
```

## GitHub Packages Auth

The four library packages are also published to GitHub Packages. Installing
from that registry requires registry configuration and authentication:

```bash
export GITHUB_PACKAGES_TOKEN=<github-pat-classic-with-read:packages>
export PAGODA_YARN_RC="$HOME/.config/pagoda/yarnrc.yml"
mkdir -p "$(dirname "$PAGODA_YARN_RC")"
cat > "$PAGODA_YARN_RC" <<EOF
npmScopes:
  petitbon:
    npmRegistryServer: "https://npm.pkg.github.com"
    npmAlwaysAuth: true
    npmAuthToken: "$GITHUB_PACKAGES_TOKEN"
EOF
```

## Release Checklist

Before tagging a release:

```bash
corepack enable
yarn install --immutable
yarn build
yarn validate
yarn test
```

Inspect package contents:

```bash
cd packages/pagoda-core && npm pack --dry-run && cd ../..
cd packages/pagoda-adapter-sdk && npm pack --dry-run && cd ../..
cd packages/pagoda-runner && npm pack --dry-run && cd ../..
cd packages/pagoda-cli && npm pack --dry-run && cd ../..
```

Confirm no public package manifest contains `workspace:*`.

The Pagoda workflow sets public package versions from the deployment version
inside the checked-out CI workspace before build and publish. They do not commit
version changes back to the repository.

## Release

Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow sets package versions from the tag, builds, validates, tests,
dry-runs package contents, and publishes packages in dependency order to GitHub
Packages.

Package versions are immutable; repeated publish attempts for the same version
will fail. Use a new patch version for fixes.

## Public Smoke Test

After the workflow publishes, test the Homebrew-installed CLI from an empty
directory:

```bash
mkdir /tmp/pagoda-public-smoke
cd /tmp/pagoda-public-smoke
brew update
brew reinstall pagoda
pagoda init
pagoda validate
pagoda check
pagoda run --scenario SMOKE-AGENT-SAFE-PROPOSAL-001 --adapter smoke-agent-local
```

Also verify package metadata:

```bash
npm view @petitbon/pagoda-core@<version> version --registry=https://npm.pkg.github.com
npm view @petitbon/pagoda-adapter-sdk@<version> version --registry=https://npm.pkg.github.com
npm view @petitbon/pagoda-runner@<version> version --registry=https://npm.pkg.github.com
npm view @petitbon/pagoda-cli@<version> version --registry=https://npm.pkg.github.com
```

## Next Patch Release

For the normal path, merge to `main`. The Pagoda workflow creates the next patch
tag automatically and publishes that exact version.

For a manual patch release, create and push a new version tag that has not been
published before:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## Recovery

Do not delete package versions as the normal rollback path. If a release is
broken, publish a patch version such as `0.1.1` and mark the GitHub release as
superseded.
