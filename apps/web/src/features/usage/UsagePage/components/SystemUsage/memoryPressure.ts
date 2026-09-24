import { type MemoryPressureLevel, memoryIsRed } from "@trellis/api";
import type { UsageChartTone } from "@trellis/ui";

export type MemoryPressureDisplay = {
	label: "Normal" | "Warning" | "Critical" | "Unavailable";
	tone: Extract<UsageChartTone, "faint" | "danger">;
	// The color of the word "Normal" or "Critical" on the detail line under
	// the figure.
	textClass: "text-fg-faint" | "text-danger";
	// The color of the memory figure itself. It stays the plain text color
	// until the kernel reports level 4, so the figure reads as loud as the
	// CPU figure beside it.
	valueClass: "text-fg" | "text-danger";
};

// The XNU kernel names level 1 normal, level 2 warning and level 4 critical.
// Only level 4 takes a colour: a Mac passes through level 2 many times an hour
// and recovers on its own, so a colour there teaches the reader to ignore it.
// A computer that publishes no level reads "Unavailable", because a level that
// nobody reports must not be drawn as a normal one.
export const memoryPressureLevel = (level: MemoryPressureLevel | null): MemoryPressureDisplay => {
	if (memoryIsRed(level))
		return { label: "Critical", tone: "danger", textClass: "text-danger", valueClass: "text-danger" };
	const label = level === 2 ? "Warning" : level === 1 ? "Normal" : "Unavailable";
	return { label, tone: "faint", textClass: "text-fg-faint", valueClass: "text-fg" };
};
