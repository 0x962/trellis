import { describe, expect, test } from "bun:test";
import { nameHue } from "./nameHue";

describe("nameHue", () => {
	test("the same seed gives the same hue, inside the circle", () => {
		for (const seed of ["dana", "01J8Z6X4Q3M2K1H0G9F8E7D6G1", "Careful reviewer", ""]) {
			const hue = nameHue(seed);
			expect(hue).toBe(nameHue(seed));
			expect(Number.isInteger(hue) && hue >= 0 && hue < 360).toBe(true);
		}
	});

	test("similar seeds spread apart", () => {
		expect(Math.abs(nameHue("Builder") - nameHue("Builder 2"))).toBeGreaterThan(20);
	});
});
