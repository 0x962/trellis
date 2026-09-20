import { describe, expect, test } from "bun:test";
import { metricsWords } from "./metricsWords";

describe("metricsWords", () => {
	test("prints the elapsed time and the token count", () => {
		expect(metricsWords({ durationMs: 12 * 60 * 1000, tokenCount: 48120, ageMs: 0 })).toBe(
			"12m burned · 48,120 tokens",
		);
	});

	test("names each number that the server does not hold", () => {
		expect(metricsWords({ durationMs: null, tokenCount: null, ageMs: 0 })).toBe("no time burned · no tokens");
	});

	test("prints one sentence while the server counts the two numbers", () => {
		expect(metricsWords(null)).toBe("The time and the tokens are not counted.");
	});
});
