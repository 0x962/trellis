import type { View } from "./grammar";

export type Preset = {
	label: string;
	// The fields the preset sets on the view.
	view: Partial<View>;
};

// The first section of the filter picker, in this order.
export const presets: readonly Preset[] = [
	{ label: "Active", view: { category: ["todo", "started", "review"] } },
	{ label: "Needs review", view: { category: ["review"] } },
	{ label: "Failing checks", view: { ci: ["fail"] } },
	{ label: "Updated by agents, last 24 hours", view: { actor: "@agent", updated: "24h" } },
];
