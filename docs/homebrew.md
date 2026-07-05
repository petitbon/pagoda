# Homebrew

Pagoda ships a Homebrew formula that installs the standalone CLI release asset.
It does not require GitHub Packages npm registry authentication.

Because this repository is not named `homebrew-pagoda`, pass the repository URL
when tapping it:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
pagoda --help
```

Homebrew may refuse to load formulae from newly added third-party taps until
the tap is trusted. To trust only the Pagoda formula instead of the whole tap,
run:

```bash
brew trust --formula petitbon/pagoda/pagoda
```

Upgrade after the tap formula is updated for a new Pagoda release:

```bash
brew update
brew upgrade pagoda
```

The formula downloads a versioned standalone CLI release asset and pins the
expected SHA256. For example:

```text
https://github.com/petitbon/pagoda/releases/download/v0.1.17/pagoda-cli-standalone.tgz
```

The release workflow updates the formula URL, version, and SHA after each
release. Until that bot commit reaches the tap, Homebrew will keep installing
the older formula version.

## Pinned Formula Releases

Maintainers can manually pin `Formula/pagoda.rb` to a specific release asset
and SHA256:

```bash
node scripts/update-homebrew-formula.mjs v0.1.1
```

The script downloads
`https://github.com/petitbon/pagoda/releases/download/v0.1.1/pagoda-cli-standalone.tgz`,
computes its SHA256, and updates the formula URL, version, and checksum.

During CI, pass the already-built tarball path to avoid a network download:

```bash
node scripts/update-homebrew-formula.mjs v0.1.1 /path/to/pagoda-cli-standalone-0.1.1.tgz
```
