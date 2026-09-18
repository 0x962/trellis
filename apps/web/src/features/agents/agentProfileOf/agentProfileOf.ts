import { effortForHarness, type Harness, MODEL_CATALOG } from "@trellis/api";
import type { AgentProfile } from "@trellis/ui";
import { modelProviderOf } from "../modelProviderOf";

export function agentProfileOf(harness: Harness | null | undefined): AgentProfile {
	if (!harness || harness.preset === "custom") return { provider: null, model: "Model not recorded" };
	if (!harness.model)
		return {
			provider:
				harness.preset === "claude"
					? "anthropic"
					: harness.preset === "codex"
						? "openai"
						: harness.preset === "muse"
							? "meta"
							: null,
			model: "Model not recorded",
			...(harness.effort === undefined ? {} : { effort: harness.effort }),
		};
	const model = harness.model;
	const provider = modelProviderOf(model);
	const effort = effortForHarness(harness.preset, model);
	return {
		provider,
		model: MODEL_CATALOG.find((item) => item.id === model)?.name ?? model.split("/").at(-1)!,
		...(effort
			? {
					effort:
						harness.effort === undefined
							? "Default"
							: (effort.options.find((option) => option.value === harness.effort)?.label ?? harness.effort),
				}
			: {}),
	};
}
