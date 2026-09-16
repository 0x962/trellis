import { expect, test } from "bun:test";
import { cacheSavingsUsd, costUsd, matchModelRate } from "./pricing.ts";

test("the longest prefix wins and a vendor-qualified id matches on its last segment", () => {
	expect(matchModelRate("claude", "claude-opus-4-8-20260301")).toMatchObject({ inputPerM: 5, approximate: false });
	expect(matchModelRate("claude", "claude-opus-4-20250514")).toMatchObject({ inputPerM: 15, approximate: false });
	expect(matchModelRate("pi", "anthropic/claude-sonnet-5")).toMatchObject({ inputPerM: 2, approximate: false });
});

test("an unknown model takes the cheapest rate of its harness and is approximate", () => {
	const rate = matchModelRate("codex", "o9-preview");
	expect(rate.approximate).toBe(true);
	expect(rate.inputPerM).toBe(0.2);
});

test("a long prompt on a model with a long-context rate takes that rate", () => {
	expect(matchModelRate("opencode", "google/gemini-2.5-pro", 250_000)).toMatchObject({ inputPerM: 2.5 });
	expect(matchModelRate("opencode", "google/gemini-2.5-pro", 1_000)).toMatchObject({ inputPerM: 1.25 });
});

test("cost and savings apply the cache multipliers and the per-model cache read price", () => {
	const tokens = { uncachedInput: 1e6, cachedInput: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, output: 1e6 };
	const sonnet = matchModelRate("claude", "claude-sonnet-4");
	expect(costUsd(sonnet, tokens)).toBeCloseTo(3 + 15 + 0.3 + 3.75 + 6, 6);
	expect(cacheSavingsUsd(sonnet, tokens)).toBeCloseTo(2.7, 6);
	const fable = matchModelRate("claude", "claude-fable-5-1");
	expect(costUsd(fable, { ...tokens, uncachedInput: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 })).toBeCloseTo(
		0.25,
		6,
	);
});
