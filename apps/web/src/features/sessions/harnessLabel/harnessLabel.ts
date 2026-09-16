import type { HarnessPreset } from "@trellis/api";

// The harness choices of a new session: the five native agent programs. A
// custom command needs the two command templates of a project setting, so
// the dialog does not offer it.
export const sessionHarnesses = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "pi", label: "pi" },
	{ value: "muse", label: "Muse" },
] as const;
export type SessionHarness = (typeof sessionHarnesses)[number]["value"];

export const harnessLabel = (preset: HarnessPreset) =>
	sessionHarnesses.find((item) => item.value === preset)?.label ?? "Custom command";
