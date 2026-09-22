import { describe, expect, test } from "bun:test";
import { defaultWave } from "./useComposerDefaults";

describe("defaultWave", () => {
	test("uses the epic current wave", () => {
		expect(defaultWave({ currentWave: { ref: "TRL/plan/wave-1" } })).toBe("TRL/plan/wave-1");
	});

	test("leaves the composer on No wave when the epic has no current wave", () => {
		expect(defaultWave({ currentWave: null })).toBeUndefined();
	});
});
