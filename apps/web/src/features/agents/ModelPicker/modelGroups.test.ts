import { describe, expect, test } from "bun:test";
import { MODEL_CATALOG } from "@trellis/api";
import { modelFamily, modelGroups } from "./modelGroups";

describe("modelFamily", () => {
	test("uses the named model class before the product name", () => {
		expect(modelFamily("Claude Fable 5.1")).toBe("Fable");
		expect(modelFamily("GPT-6 Astra")).toBe("Astra");
		expect(modelFamily("GPT 5.6 Terra")).toBe("Terra");
	});

	test("groups general product families", () => {
		expect(modelFamily("Gemini 3.8 Flash")).toBe("Gemini");
		expect(modelFamily("GPT-4.1")).toBe("GPT");
		expect(modelFamily("o4-mini")).toBe("o-series");
	});
});

test("modelGroups keeps every model", () => {
	const groups = modelGroups(MODEL_CATALOG);
	expect(groups.flatMap(([, models]) => models)).toHaveLength(MODEL_CATALOG.length);
});
