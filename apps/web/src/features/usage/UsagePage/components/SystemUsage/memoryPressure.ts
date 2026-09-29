import { type MemoryPressureLevel, memoryIsRed, memoryPressureName } from "@trellis/api";
import type { UsageChartTone } from "@trellis/ui";

export type MemoryPressureDisplay = {
	label: "Normal" | "Warning" | "Critical" | "Unknown" | "Unavailable";
	tone: Extract<UsageChartTone, "faint" | "danger">;
	// The color of the word "Normal" or "Critical" on the detail line under
	// the figure.
	textClass: "text-fg-faint" | "text-danger";
	// The color of the memory figure itself. It stays the plain text color
	// until the kernel reports level 4, so the memory figure and the CPU
	// figure beside it look the same.
	valueClass: "text-fg" | "text-danger";
};

// The XNU sysctl uses 1 for normal, 2 for warning, and 4 for critical. Another
// integer reads "Unknown". A missing sysctl reads "Unavailable". Only critical
// pressure changes the color of the memory figure.
export const memoryPressureLevel = (level: MemoryPressureLevel | null): MemoryPressureDisplay => {
	if (memoryIsRed(level))
		return { label: "Critical", tone: "danger", textClass: "text-danger", valueClass: "text-danger" };
	return {
		label: memoryPressureName(level),
		tone: "faint",
		textClass: "text-fg-faint",
		valueClass: "text-fg",
	};
};
