import { describe, expect, test } from "bun:test";
import { cacheSavingsUsd, costUsd, matchModelRate } from "./pricing.ts";

describe("usage pricing", () => {
	test("prices every Muse input token at the supplied input rate", () => {
		const rate = matchModelRate("muse", "muse-spark-1.3");
		expect(rate).toEqual({ inputPerM: 1.25, outputPerM: 4.25, cacheReadPerM: 1.25, approximate: false });
		expect(
			costUsd(rate, {
				uncachedInput: 1_000_000,
				cachedInput: 2_000_000,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: 1_000_000,
			}),
		).toBe(8);
	});

	test("takes the longest model prefix, so Opus 5.5 does not read the Opus 5 rate", () => {
		expect(matchModelRate("claude", "claude-opus-5-5")).toEqual({
			inputPerM: 4,
			outputPerM: 20,
			cacheReadPerM: 0.2,
			approximate: false,
		});
		expect(matchModelRate("claude", "claude-opus-5")).toEqual({ inputPerM: 5, outputPerM: 25, approximate: false });
	});

	test("subtracts cache write premiums from cache savings", () => {
		expect(
			cacheSavingsUsd(
				{ inputPerM: 10, outputPerM: 50, cacheReadPerM: 1 },
				{
					uncachedInput: 0,
					cachedInput: 1_000_000,
					cacheWrite5m: 2_000_000,
					cacheWrite1h: 1_000_000,
					output: 0,
				},
			),
		).toBe(-6);
	});
});
