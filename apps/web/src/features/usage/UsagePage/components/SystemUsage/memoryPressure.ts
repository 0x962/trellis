import { type MemoryPressureLevel, memoryIsRed } from "@trellis/api";
import type { UsageChartTone } from "@trellis/ui";

export type MemoryPressureDisplay = {
	label: "Normal" | "Warning" | "Critical" | "Unknown" | "Unavailable";
	tone: Extract<UsageChartTone, "faint" | "warning" | "danger" | "accent">;
	textClass: "text-fg-faint" | "text-warning" | "text-danger" | "text-accent";
	valueClass: "text-fg" | "text-warning" | "text-danger" | "text-accent";
};

export const memoryPressureLevel = (level: MemoryPressureLevel | null): MemoryPressureDisplay => {
	if (memoryIsRed(level))
		return { label: "Critical", tone: "danger", textClass: "text-danger", valueClass: "text-danger" };
	if (level === 2) return { label: "Warning", tone: "warning", textClass: "text-warning", valueClass: "text-warning" };
	if (level === null)
		return { label: "Unavailable", tone: "danger", textClass: "text-danger", valueClass: "text-danger" };
	if (level === 1) return { label: "Normal", tone: "faint", textClass: "text-fg-faint", valueClass: "text-fg" };
	return { label: "Unknown", tone: "accent", textClass: "text-accent", valueClass: "text-accent" };
};
