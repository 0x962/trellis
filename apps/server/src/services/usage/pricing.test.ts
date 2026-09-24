import { describe, expect, test } from "bun:test";
import { cacheSavingsUsd, costUsd, matchModelRate } from "./pricing.ts";

const OPUS_5_5 = { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2, approximate: false };

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

	test("prices claude-opus-5-5 as Opus 5.5, not as Opus 5", () => {
		expect(matchModelRate("claude", "claude-opus-5-5")).toEqual(OPUS_5_5);
		expect(matchModelRate("claude", "claude-opus-5")).toEqual({ inputPerM: 5, outputPerM: 25, approximate: false });
	});

	test("reads a dot in a gateway ID as a dash, so opencode and pi pay the Opus 5.5 price", () => {
		expect(matchModelRate("opencode", "anthropic/claude-opus-5.5")).toEqual(OPUS_5_5);
		expect(matchModelRate("pi", "vercel-ai-gateway/anthropic/claude-opus-5.5")).toEqual(OPUS_5_5);
	});

	test("keeps a dotted ID on its own row after the dash conversion", () => {
		// claude-opus-4.8 must not reach the claude-opus-4 row, which prices at 15 and 75.
		expect(matchModelRate("opencode", "anthropic/claude-opus-4.8")).toEqual({
			inputPerM: 5,
			outputPerM: 25,
			approximate: false,
		});
		expect(matchModelRate("opencode", "google/gemini-3.1-pro").outputPerM).toBe(12);
		expect(matchModelRate("codex", "gpt-5.3-codex").outputPerM).toBe(14);
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
