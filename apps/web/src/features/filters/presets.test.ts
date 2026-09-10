import { describe, expect, test } from "bun:test";
import { presets } from "./presets";

const viewOfPreset = (label: string) => {
	const preset = presets.find((entry) => entry.label === label);
	if (preset === undefined) throw new Error(`No preset ${label}`);
	return preset.view;
};

describe("features/filters/presets", () => {
	// Outcome 75. The four presets, in the order the filter picker lists them.
	test("maps each preset to its filter grammar", () => {
		expect(presets.map((preset) => preset.label)).toEqual([
			"Active",
			"Needs review",
			"Failing checks",
			"Updated by agents, last 24 hours",
		]);
		expect(viewOfPreset("Active")).toEqual({ category: ["todo", "started", "review"] });
		expect(viewOfPreset("Needs review")).toEqual({ category: ["review"] });
		expect(viewOfPreset("Failing checks")).toEqual({ ci: ["fail"] });
		expect(viewOfPreset("Updated by agents, last 24 hours")).toEqual({ actor: "@agent", updated: "24h" });
	});
});
