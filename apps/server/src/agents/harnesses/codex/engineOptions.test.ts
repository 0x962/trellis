import { describe, expect, test } from "bun:test";
import { engineOptions } from "./engineOptions.ts";

describe("engineOptions", () => {
	test("disables hooks for a worker", () => {
		expect(engineOptions(false, {})).toEqual(["--disable", "hooks"]);
	});

	test("keeps the manager policy and effort options", () => {
		expect(engineOptions(true, { "features.experimentalApps": true }, "high")).toEqual([
			"--disable",
			"hooks",
			"--strict-config",
			"-c",
			"features.experimentalApps=true",
			"-c",
			'model_reasoning_effort="high"',
		]);
	});
});
