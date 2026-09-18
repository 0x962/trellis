---
"@trellis/server": patch
---

Record the model that an agent run launched with. A launch request can leave the model empty, and the harness program then selects its own model. The run row now stores the model the runtime reports, so the ticket and the board name it in place of "Model not recorded".
