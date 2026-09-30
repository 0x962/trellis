import { HARNESS_DEFAULT_MODELS, type Harness, MODEL_CATALOG } from "@trellis/api";
import { AgentLaunchPicker, ProviderIcon } from "@trellis/ui";
import { harnessLabel } from "../../../../agents/harnessPresets";
import { LaunchFields } from "../../../../agents/LaunchFields";
import { modelProviderOf } from "../../../../agents/modelProviderOf";

export function WaveLaunchFields({
	harness,
	onChange,
	disabled,
}: {
	harness: Harness;
	onChange: (harness: Harness) => void;
	disabled: boolean;
}) {
	const agent = harness.preset === "custom" ? "Custom" : harnessLabel(harness.preset);
	const model = harness.model ?? (harness.preset === "custom" ? "" : HARNESS_DEFAULT_MODELS[harness.preset]);
	const name = MODEL_CATALOG.find((entry) => entry.id === model)?.name ?? model;
	const provider = modelProviderOf(model);
	return (
		<AgentLaunchPicker
			agent={agent}
			model={name.replace(/^Claude /, "")}
			disabled={disabled}
			icon={provider && <ProviderIcon provider={provider} decorative />}
		>
			<LaunchFields harness={harness} onChange={onChange} disabled={disabled} />
		</AgentLaunchPicker>
	);
}
