import type { HarnessPreset } from "@trellis/api";

// A harness that trellis knows how to launch by itself. The `custom` preset
// is not one: it carries the commands a person typed, and no name of its own.
export type NativePreset = Exclude<HarnessPreset, "custom">;

// The name each harness carries in the interface. Every control that offers
// the harnesses reads this one list, so the Assign dialog, the session
// composer and the flow fields print the same words in the same order.
export const harnessPresets: readonly { value: NativePreset; label: string }[] = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "pi", label: "pi" },
	{ value: "muse", label: "Muse" },
];

export const harnessLabel = (preset: NativePreset) => harnessPresets.find((harness) => harness.value === preset)!.label;
