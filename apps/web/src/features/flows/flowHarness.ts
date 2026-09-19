import { type FlowHarness, type Harness, HarnessSchema } from "@trellis/api";

// The stored harness of a flow or a step holds the preset, the model, and
// the effort. LaunchFields edits a full Harness with its commands, so the
// two sides convert here. HarnessSchema fills the commands of a preset.
export const harnessOfFlow = (value: FlowHarness | null | undefined): Harness | null =>
	value == null ? null : HarnessSchema.parse(value);

export const flowHarnessOf = (harness: Harness | null): FlowHarness | null =>
	harness === null || harness.preset === "custom"
		? null
		: {
				preset: harness.preset,
				...(harness.model === undefined ? {} : { model: harness.model }),
				...(harness.effort === undefined ? {} : { effort: harness.effort }),
			};

export const sameFlowHarness = (a: FlowHarness | null, b: FlowHarness | null | undefined) =>
	(a === null && b == null) ||
	(a !== null && b != null && a.preset === b.preset && a.model === b.model && a.effort === b.effort);
