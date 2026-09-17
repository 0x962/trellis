import type { UsageChartTone } from "@trellis/ui";

export type MemoryPressureLevel = {
	label: "Normal" | "Elevated" | "High";
	tone: Extract<UsageChartTone, "success" | "warning" | "danger">;
	textClass: "text-success" | "text-warning" | "text-danger";
};

export const memoryPressureLevel = (percent: number): MemoryPressureLevel => {
	if (percent >= 80) return { label: "High", tone: "danger", textClass: "text-danger" };
	if (percent >= 50) return { label: "Elevated", tone: "warning", textClass: "text-warning" };
	return { label: "Normal", tone: "success", textClass: "text-success" };
};
