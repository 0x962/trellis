---
"@trellis/api": minor
"@trellis/server": minor
"@trellis/ui": minor
"@trellis/web": minor
---

Add the Usage page. The server reads the Claude Code, Codex, Pi, and OpenCode transcripts on the machine, prices every turn at the API list rate, and joins each session to the agent run, ticket, persona, project, and account that produced it. The page shows the subscription quota of each account, the cost per day, and a breakdown by ticket, persona, project, agent kind, account, model, or harness, with the top sessions of the range. The report uses a five-minute cache and a separate scan worker, so large transcript sets do not delay other Trellis work.
