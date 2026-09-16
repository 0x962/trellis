import { z } from "zod";
import catalog from "./catalog.json" with { type: "json" };

export const HarnessEffortSchema = z.enum(["none", "off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
export type HarnessEffort = z.infer<typeof HarnessEffortSchema>;
const labels = { claude: "Effort", codex: "Reasoning effort", pi: "Thinking level", opencode: "Variant" };
const optionLabels: Record<HarnessEffort, string> = {
	none: "None",
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
	ultra: "Ultra",
};

export const effortForHarness = (preset: keyof typeof labels | "custom", model: string) => {
	if (preset === "custom") return null;
	const values = (catalog[preset] as Record<string, HarnessEffort[]>)[model];
	if (!values) return null;
	return { label: labels[preset], options: values.map((value) => ({ value, label: optionLabels[value] })) };
};
