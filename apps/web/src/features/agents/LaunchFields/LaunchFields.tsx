import { effortForHarness, HARNESS_DEFAULT_MODELS, HARNESS_PRESETS, type Harness } from "@trellis/api";
import { Field, Select } from "@trellis/ui";
import { harnessPresets, type NativePreset } from "../harnessPresets";
import { ModelPicker } from "../ModelPicker";

type Common = { disabled?: boolean };

// With `allowDefault`, the harness select carries one more item, labelled
// with that text, and a choice of it reports null: the caller then falls
// back to a harness it owns, such as the harness of the flow.
export type LaunchFieldsProps = Common &
	(
		| { harness: Harness; onChange: (harness: Harness) => void; allowDefault?: undefined }
		| { harness: Harness | null; onChange: (harness: Harness | null) => void; allowDefault: string }
	);

export function LaunchFields({ harness, onChange, allowDefault, disabled = false }: LaunchFieldsProps) {
	const change = onChange as (harness: Harness | null) => void;
	const model =
		harness === null
			? undefined
			: (harness.model ?? (harness.preset === "custom" ? undefined : HARNESS_DEFAULT_MODELS[harness.preset]));
	const effort = harness === null || model === undefined ? null : effortForHarness(harness.preset, model);
	type Choice = NativePreset | "custom" | "default";
	const items: { value: Choice; label: string }[] = [
		...(allowDefault === undefined ? [] : [{ value: "default" as const, label: allowDefault }]),
		...harnessPresets,
		...(harness?.preset === "custom" ? [{ value: "custom" as const, label: "Custom" }] : []),
	];
	return (
		<>
			<Field label="Harness">
				<Select
					label="Harness"
					value={harness?.preset ?? "default"}
					items={items}
					disabled={disabled}
					onValueChange={(preset: Choice) => {
						if (preset === "default") change(null);
						else if (preset !== "custom") change({ preset, ...HARNESS_PRESETS[preset] });
					}}
				/>
			</Field>
			{harness !== null && harness.preset !== "custom" && (
				<Field label="Model">
					<ModelPicker
						harness={harness.preset}
						value={harness.model}
						disabled={disabled}
						onValueChange={(model) => change({ ...harness, model, effort: undefined })}
					/>
				</Field>
			)}
			{harness !== null && effort && (
				<Field label={effort.label}>
					<Select
						label={effort.label}
						value={harness.effort ?? "default"}
						disabled={disabled}
						items={[{ value: "default", label: "Harness default" }, ...effort.options]}
						onValueChange={(value) =>
							change({ ...harness, effort: value === "default" ? undefined : (value as Harness["effort"]) })
						}
					/>
				</Field>
			)}
		</>
	);
}
