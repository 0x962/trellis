import { type MemoryPressureLevel, memoryIsRed } from "@trellis/api";
import type { UsageChartTone } from "@trellis/ui";

export type MemoryPressureDisplay = {
	label: "Normal" | "Warning" | "Critical" | "Unavailable";
	tone: Extract<UsageChartTone, "faint" | "danger">;
	textClass: "text-fg-faint" | "text-danger";
};

// The XNU kernel names level 1 normal, level 2 warning and level 4 critical.
// Only level 4 takes a colour: a Mac passes through level 2 many times an hour
// and recovers on its own, so a colour there teaches the reader to ignore it.
// A computer that publishes no level reads "Unavailable", because a level that
// nobody reports must not be drawn as a normal one.
export const memoryPressureLevel = (level: MemoryPressureLevel | null): MemoryPressureDisplay => {
	if (memoryIsRed(level)) return { label: "Critical", tone: "danger", textClass: "text-danger" };
	const label = level === 2 ? "Warning" : level === 1 ? "Normal" : "Unavailable";
	return { label, tone: "faint", textClass: "text-fg-faint" };
};
