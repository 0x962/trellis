import { describe, expect, test } from "bun:test";
import { usageSearchSchema } from "./usage";

describe("usage search", () => {
	test.each([7, 30, 90] as const)("parses the %s-day query value", (days) => {
		const query = String(days);
		expect(usageSearchSchema.parse({ days }).days).toBe(days);
		expect(usageSearchSchema.parse({ days: query }).days).toBe(days);
	});

	test("drops an unsupported day query value", () => {
		expect(usageSearchSchema.parse({ days: "14" }).days).toBeUndefined();
	});
});
