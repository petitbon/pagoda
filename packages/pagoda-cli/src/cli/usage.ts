export const usage = `Usage:
  pagoda init [--root <path>] [--name <name>] [--channel <channel>]
  pagoda update [--root <path>]
  pagoda validate [--root <path>]
  pagoda compile [--root <path>]
  pagoda check [--root <path>]
  pagoda adapter list [--root <path>]
  pagoda adapter check [--root <path>] [--adapter <id>] [--channel <channel>] [--scenario <id>]
  pagoda adapter create --id <id> [--root <path>] [--channel <channel>] [--name <name>] [--force]
  pagoda scenario create --id <id> [--root <path>] [--title <title>] [--channel <channel>] [--outcome <outcome>] [--domain <domain>] [--risk <risk>] [--interaction none|generated]
  pagoda codex install [--root <path>] [--force]
  pagoda run [--root <path>] [--adapter <id>] [--channel <channel>] [--seed <seed>] [--interaction-cases all] [--reporter default|json]
  pagoda run [--root <path>] [--adapter <id>] --scenario <id> [--channel <channel>] [--seed <seed>] [--interaction-case <case-id|index>] [--interaction-cases all] [--artifact-directory <path>] [--reporter default|json]
  pagoda replay [--root <path>] --artifact <path>
  pagoda report [--root <path>] --artifact <path>
  pagoda --help
  pagoda --version`;
