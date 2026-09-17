# Models

Trellis uses Vercel AI Gateway IDs, such as `anthropic/claude-sonnet-4.6` and `openai/gpt-6-astra`.
The UI, API, CLI, project settings, and manager tools use these IDs.
The catalog includes tool-capable language models from Google, Anthropic, Meta, and OpenAI.

`trellis models list` and the manager's `models.list` tool return the catalog.
Use `trellis models list --harness codex` to restrict the choices to a harness. Use `--harness muse` for the Muse Spark models.
The settings page uses a model selector.
An omitted model uses the harness default for a new session and the saved model for a resume.

The launch adapter converts a canonical ID to the harness's model name.
Claude uses its native model IDs. Codex uses its OpenAI model IDs.
Muse uses the bare Muse Spark name, so `meta/muse-spark-1.3` becomes `muse-spark-1.3`. Its default is `meta/muse-spark-1.3`.
The `-contributor` variants share content with Meta for product improvement, so a project selects one on purpose.
OpenCode uses `vercel/<canonical-id>`. Pi uses `vercel-ai-gateway/<canonical-id>`.
These two harnesses require a configured Vercel AI Gateway account.
Catalog membership does not grant account access to a model.
Harness observations and saved settings convert native names to canonical IDs.
An incompatible model fails before an active worker stops.

The checked-in catalog comes from the [Vercel models endpoint](https://vercel.com/docs/ai-gateway/openai-compat/rest-api).
It does not require a network request when Trellis starts or displays the selector.
Run `bun scripts/update-model-catalog.ts` to refresh the catalog, then review the diff and run its tests.
Native harness mappings remain explicit application code.

# Proposed model guide

Navid supplied these preference orders on 2026-09-16.
The [Artificial Analysis leaderboard](https://artificialanalysis.ai/leaderboards/models) provides supporting benchmark data.
Reasoning levels remain separate from model IDs.
This guide does not change the manager instruction or set a harness's reasoning level.

| Intelligence preference | Canonical ID | Reasoning |
| --- | --- | --- |
| 1 | `anthropic/claude-fable-5.1` | Not specified |
| 2 | `openai/gpt-6-astra` | max |
| 3 | `anthropic/claude-opus-5` | max |
| 4 | `meta/muse-spark-1.3` | max |
| 5 | `zai/glm-5.3` | max |
| 6 | `spacexai/grok-4.6` | high |

| Speed preference | Canonical ID | Reasoning |
| --- | --- | --- |
| 1 | `google/gemini-3.8-flash` | high |
| 2 | `meta/muse-spark-1.3` | max |
| 3 | `openai/gpt-5.6-luna` | max |

GLM and Grok are reference choices outside the four-provider catalog.

Proposed assignment policy:

- Use the speed list for clear, bounded work with a quick verification step.
- Use the intelligence list for ambiguous work, difficult diagnosis, consequential review, or failed attempts.
- Choose the highest-ranked model with a compatible harness and available account capacity.
- Change the model when the worker repeats a failed approach or needs stronger analysis.
- Optimize total time to verified completion, including reasoning, tool calls, tests, and review cycles.

Output tokens per second do not measure total response time.
On the cited leaderboard, Luna at max reports 115 tokens/s but 130.71 seconds for total response time.
Gemini 3.8 Flash at high reports 332 tokens/s and 17.07 seconds.
These benchmark measurements do not predict the completion time of a Trellis ticket.
