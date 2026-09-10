import type { View } from "./grammar";

export type Preset = {
	label: string;
	// The fields the preset sets on the view.
	view: Partial<View>;
};

// Skeleton for the web-table work item. presets.test.ts states the outcomes.
export const presets: readonly Preset[] = [];
