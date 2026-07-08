export const usage = `Usage:
  pagoda init [--root <path>] [--name <name>] [--channel <channel>]
  pagoda update [--root <path>]
  pagoda validate [--root <path>] [--target <id>]
  pagoda compile [--root <path>] [--target <id>]
  pagoda check [--root <path>] [--target <id>]
  pagoda adapter list [--root <path>] [--target <id>]
  pagoda adapter check [--root <path>] [--target <id>] [--adapter <id>] [--channel <channel>] [--scenario <id>]
  pagoda adapter create --id <id> [--root <path>] [--target <id>] [--channel <channel>] [--name <name>] [--force]
  pagoda scenario create --id <id> [--root <path>] [--target <id>] [--title <title>] [--channel <channel>] [--outcome <outcome>] [--domain <domain>] [--risk <risk>] [--interaction none|generated|agentic]
  pagoda codex install [--root <path>] [--target <id>] [--force]
  pagoda run [--root <path>] [--target <id>] [--adapter <id>] [--channel <channel>] [--seed <seed>] [--interaction-cases all] [--concurrency <n>] [--reporter default|json]
  pagoda run [--root <path>] [--target <id>] [--adapter <id>] --scenario <id> [--channel <channel>] [--seed <seed>] [--interaction-case <case-id|index>] [--interaction-cases all] [--artifact-directory <path>] [--concurrency <n>] [--reporter default|json]
  pagoda replay [--root <path>] [--target <id>] --artifact <path>
  pagoda report [--root <path>] [--target <id>] --artifact <path>
  pagoda --help
  pagoda --version`;
