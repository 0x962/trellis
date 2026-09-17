import { effortForHarness, HARNESS_DEFAULT_MODELS, HARNESS_PRESETS, type Harness } from "@trellis/api";
import { cx, Select } from "@trellis/ui";
import { ModelPicker } from "../ModelPicker";

const presets = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "pi", label: "pi" },
	{ value: "muse", label: "Muse" },
] as const;

export function LaunchFields({
	harness,
	onChange,
	disabled = false,
	compact = false,
}: {
	harness: Harness;
	onChange: (harness: Harness) => void;
	disabled?: boolean;
	compact?: boolean;
}) {
	const model = harness.model ?? (harness.preset === "custom" ? undefined : HARNESS_DEFAULT_MODELS[harness.preset]);
	const effort = model === undefined ? null : effortForHarness(harness.preset, model);
	return (
		<>
			<div className={cx("flex min-w-0 flex-col gap-2", compact && "max-w-full")}>
				<span className={cx("text-sm text-fg-muted", compact && "sr-only")}>Harness</span>
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
				<div className={cx("flex min-w-0 flex-col gap-2", compact && "max-w-full")}>
					<span className={cx("text-sm text-fg-muted", compact && "sr-only")}>Model</span>
					<ModelPicker
						harness={harness.preset}
						value={harness.model}
						compact={compact}
						className={compact ? "w-auto" : undefined}
						disabled={disabled}
						onValueChange={(model) => onChange({ ...harness, model, effort: undefined })}
					/>
				</div>
			)}
			{effort && (
				<div className={cx("flex min-w-0 flex-col gap-2", compact && "max-w-full")}>
					<span className={cx("text-sm text-fg-muted", compact && "sr-only")}>{effort.label}</span>
					<Select
						label={effort.label}
						value={harness.effort ?? "default"}
						disabled={disabled}
						items={[{ value: "default", label: compact ? "Default effort" : "Harness default" }, ...effort.options]}
						onValueChange={(value) =>
							onChange({ ...harness, effort: value === "default" ? undefined : (value as Harness["effort"]) })
						}
					/>
				</div>
			)}
		</>
	);
}
