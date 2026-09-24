import { effortForHarness, HARNESS_DEFAULT_MODELS, HARNESS_PRESETS, type Harness } from "@trellis/api";
import { cx, Field, Select } from "@trellis/ui";
import { harnessPresets, type NativePreset } from "../harnessPresets";
import { ModelPicker } from "../ModelPicker";

type Common = { disabled?: boolean; compact?: boolean };

// With `allowDefault`, the harness select carries one more item, labelled
// with that text, and a choice of it reports null: the caller then falls
// back to a harness it owns, such as the harness of the flow.
export type LaunchFieldsProps = Common &
	(
		| { harness: Harness; onChange: (harness: Harness) => void; allowDefault?: undefined }
		| { harness: Harness | null; onChange: (harness: Harness | null) => void; allowDefault: string }
	);

export function LaunchFields({
	harness,
	onChange,
	allowDefault,
	disabled = false,
	compact = false,
}: LaunchFieldsProps) {
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
			<Field label="Harness" hideLabel={compact} className={compact ? "max-w-full" : undefined}>
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
				<div className={cx("flex min-w-0 flex-col gap-2", compact && "max-w-full")}>
					<span className={cx("text-sm text-fg-muted", compact && "sr-only")}>Model</span>
					<ModelPicker
						harness={harness.preset}
						value={harness.model}
						compact={compact}
						className={compact ? "w-auto" : undefined}
						disabled={disabled}
						onValueChange={(model) => change({ ...harness, model, effort: undefined })}
					/>
				</div>
			)}
			{harness !== null && effort && (
				<Field label={effort.label} hideLabel={compact} className={compact ? "max-w-full" : undefined}>
					<Select
						label={effort.label}
						value={harness.effort ?? "default"}
						disabled={disabled}
						items={[{ value: "default", label: compact ? "Default effort" : "Harness default" }, ...effort.options]}
						onValueChange={(value) =>
							change({ ...harness, effort: value === "default" ? undefined : (value as Harness["effort"]) })
						}
					/>
				</Field>
			)}
		</>
	);
}
