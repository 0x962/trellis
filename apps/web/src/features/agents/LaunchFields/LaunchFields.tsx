import {
	effortForHarness,
	HARNESS_DEFAULT_MODELS,
	HARNESS_PRESETS,
	type Harness,
	modelsForHarness,
} from "@trellis/api";
import { Select } from "@trellis/ui";

const presets = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "pi", label: "pi" },
] as const;

export function LaunchFields({
	harness,
	onChange,
	disabled = false,
}: {
	harness: Harness;
	onChange: (harness: Harness) => void;
	disabled?: boolean;
}) {
	const model = harness.model ?? (harness.preset === "custom" ? undefined : HARNESS_DEFAULT_MODELS[harness.preset]);
	const effort = model === undefined ? null : effortForHarness(harness.preset, model);
	return (
		<>
			<div className="flex min-w-0 flex-col gap-2">
				<span className="text-sm text-fg-muted">Harness</span>
				<Select
					label="Harness"
					value={harness.preset}
					items={harness.preset === "custom" ? [...presets, { value: "custom", label: "Custom" }] : presets}
					disabled={disabled}
					onValueChange={(preset) => {
						if (preset !== "custom") onChange({ preset, ...HARNESS_PRESETS[preset] });
					}}
				/>
			</div>
			{harness.preset !== "custom" && (
				<div className="flex min-w-0 flex-col gap-2">
					<span className="text-sm text-fg-muted">Model</span>
					<Select
						label="Model"
						value={harness.model ?? "default"}
						disabled={disabled}
						alignItemWithTrigger={false}
						items={[
							{
								value: "default",
								label: `Default (${HARNESS_DEFAULT_MODELS[harness.preset]})`,
							},
							...modelsForHarness(harness.preset).map(({ id }) => ({ value: id, label: id })),
						]}
						onValueChange={(value) =>
							onChange({ ...harness, model: value === "default" ? undefined : value, effort: undefined })
						}
					/>
				</div>
			)}
			{effort && (
				<div className="flex min-w-0 flex-col gap-2">
					<span className="text-sm text-fg-muted">{effort.label}</span>
					<Select
						label={effort.label}
						value={harness.effort ?? "default"}
						disabled={disabled}
						items={[{ value: "default", label: "Harness default" }, ...effort.options]}
						onValueChange={(value) =>
							onChange({ ...harness, effort: value === "default" ? undefined : (value as Harness["effort"]) })
						}
					/>
				</div>
			)}
		</>
	);
}
