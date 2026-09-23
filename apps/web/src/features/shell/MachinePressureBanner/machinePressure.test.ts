import { describe, expect, test } from "bun:test";
import { pressureWarning } from "./machinePressure";

describe("pressureWarning", () => {
	test("says nothing while both signals stay under their red line", () => {
		expect(pressureWarning({ memoryLevel: 1, thermal: "nominal" })).toBeNull();
		expect(pressureWarning({ memoryLevel: 2, thermal: "fair" })).toBeNull();
	});

	test("says nothing while a signal is unavailable", () => {
		expect(pressureWarning({ memoryLevel: null, thermal: null })).toBeNull();
	});

	test("names the memory consequence at the kernel critical level", () => {
		expect(pressureWarning({ memoryLevel: 4, thermal: "fair" })).toEqual({
			headline: "The Mac has run out of memory.",
			consequences: ["macOS can stop an agent run without warning."],
		});
	});

	test("names the thermal consequence at serious and at critical", () => {
		const expected = {
			headline: "macOS has cut the speed of the Mac.",
			consequences: ["macOS gives every agent run less processor time."],
		};
		expect(pressureWarning({ memoryLevel: 2, thermal: "serious" })).toEqual(expected);
		expect(pressureWarning({ memoryLevel: 2, thermal: "critical" })).toEqual(expected);
	});

	test("joins two red signals into one warning", () => {
		expect(pressureWarning({ memoryLevel: 4, thermal: "serious" })).toEqual({
			headline: "The Mac has run out of memory, and macOS has cut its speed.",
			consequences: [
				"macOS can stop an agent run without warning.",
				"macOS gives every agent run less processor time.",
			],
		});
	});

	test("says nothing again after the computer recovers", () => {
		expect(pressureWarning({ memoryLevel: 4, thermal: "serious" })).not.toBeNull();
		expect(pressureWarning({ memoryLevel: 1, thermal: "nominal" })).toBeNull();
	});
});
