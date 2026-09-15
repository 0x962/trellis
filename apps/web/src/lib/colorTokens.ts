import type { ColorToken } from "@trellis/api";

// The palette token names a status or a persona may take. A token resolves
// through the theme, so one name draws right in light and dark mode.
export const colorTokens: { value: ColorToken; label: string }[] = [
	{ value: "fg", label: "Foreground" },
	{ value: "fg-muted", label: "Muted" },
	{ value: "fg-faint", label: "Faint" },
	{ value: "accent", label: "Accent" },
	{ value: "agent", label: "Agent" },
	{ value: "success", label: "Success" },
	{ value: "warning", label: "Warning" },
	{ value: "danger", label: "Danger" },
];

// Tailwind reads whole class names, so each token names its class in full.
export const colorTokenText: Record<ColorToken, string> = {
	fg: "!text-fg",
	"fg-muted": "!text-fg-muted",
	"fg-faint": "!text-fg-faint",
	accent: "!text-accent",
	agent: "!text-agent",
	success: "!text-success",
	warning: "!text-warning",
	danger: "!text-danger",
};
