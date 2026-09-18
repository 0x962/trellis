import { describe, expect, test } from "bun:test";
import { engineOptions } from "./engineOptions.ts";

describe("engineOptions", () => {
	test("disables hooks", () => {
		expect(engineOptions()).toEqual(["--disable", "hooks"]);
	});

	test("keeps the effort option", () => {
		expect(engineOptions("high")).toEqual(["--disable", "hooks", "-c", 'model_reasoning_effort="high"']);
	});
});
