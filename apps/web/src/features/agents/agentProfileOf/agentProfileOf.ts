import { effortForHarness, HARNESS_DEFAULT_MODELS, type Harness, MODEL_CATALOG } from "@trellis/api";
import type { AgentProfile } from "@trellis/ui";
import { modelProviderOf } from "../modelProviderOf";

export function agentProfileOf(harness: Harness | null | undefined): AgentProfile | undefined {
	if (!harness || harness.preset === "custom") return undefined;
	const model = harness.model ?? HARNESS_DEFAULT_MODELS[harness.preset];
	const provider = modelProviderOf(model);
	if (provider === null) return undefined;
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
