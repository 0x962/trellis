import type { ProjectColor } from "@trellis/api";
import { PROJECT_COLORS } from "../db/enums.ts";

// The rule that gives a project its color. Each name of `PROJECT_COLORS` is
// one slot, and one active project holds one slot, so a person reads two
// projects apart by their color. `taken` holds the colors the active projects
// hold now.

// The colors that no active project holds.
export const freeColors = (taken: readonly (ProjectColor | null)[]): ProjectColor[] => {
	const held = new Set(taken);
	return PROJECT_COLORS.filter((color) => !held.has(color));
};

// One free color, chosen with equal chance among the free ones. Two projects
// that a person creates one after the other take two colors that no order
// predicts. The answer is null when every slot is full, and a project with no
// color draws the grey mark.
export const pickColor = (
	taken: readonly (ProjectColor | null)[],
	random: () => number = Math.random,
): ProjectColor | null => {
	const free = freeColors(taken);
	if (free.length === 0) return null;
	return free[Math.floor(random() * free.length)]!;
};
