# Harness effort options

`catalog.json` maps canonical model IDs to the effort values each harness accepts.
The snapshot date is 2026-09-23 for Claude and 2026-09-16 for Codex, pi, and OpenCode.

| Harness | Source |
| --- | --- |
| Claude | [Model configuration](https://code.claude.com/docs/en/model-config), effort support by model |
| Codex | Local `models_cache.json`, `supported_reasoning_levels` for each model |
| pi | Installed `@mariozechner/pi-ai`, `getModels("vercel-ai-gateway")` and `getSupportedThinkingLevels` |
| OpenCode | `opencode models vercel --verbose`, variant keys for each model |

Each entry uses a model ID from the shared model catalog.
A model without an entry has no effort control in Trellis.
