import type { Priority } from "@trellis/api";

// The priorities in sheet order, highest first, with their labels.
export const priorityOrder: readonly Priority[] = ["urgent", "high", "medium", "low", "none"];

export const priorityLabels: Record<Priority, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
	none: "None",
};
