# @petitbon/pagoda-runner

Target-neutral Pagoda run lifecycle utilities.

## Install

For package consumers:

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
YARN_RC_FILENAME="$PAGODA_YARN_RC" yarn add @petitbon/pagoda-runner
```

From the repository root for framework development:

```bash
corepack enable
yarn install
yarn workspace @petitbon/pagoda-runner build
yarn workspace @petitbon/pagoda-runner test
```

## Owns

- run plan creation;
- artifact directory naming;
- artifact bundle writing and reading;
- run report rendering;
- file hashing for reproducibility.

The runner depends on target behavior only through `@petitbon/pagoda-adapter-sdk`.

## Artifact Roots

The CLI chooses the artifact root before calling the runner:

- standalone observed repo: `.pagoda/artifacts/runs/`
- Pagoda development workspace: `artifacts/runs/`

The runner writes the same reproducible artifact bundle in either mode.
