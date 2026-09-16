import { describe, expect, test } from "bun:test";
import { formatDayLabel, formatShare, formatTokens, formatUsd } from "./formatUsage";

describe("formatUsage", () => {
	test("dollars print two decimals under $100 and none above", () => {
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(0.004)).toBe("<$0.01");
		expect(formatUsd(0.85)).toBe("$0.85");
		expect(formatUsd(46.2)).toBe("$46.20");
		expect(formatUsd(19211.4)).toBe("$19,211");
	});

	test("tokens scale to K, M, B, and T", () => {
		expect(formatTokens(312)).toBe("312");
		expect(formatTokens(850_000)).toBe("850K");
		expect(formatTokens(4_200_000)).toBe("4.2M");
		expect(formatTokens(13_900_000_000)).toBe("13.9B");
		expect(formatTokens(1_240_000_000_000)).toBe("1.24T");
	});

	test("a day key prints as a short local date", () => {
		expect(formatDayLabel("2026-09-12")).toBe("Sep 12");
		expect(formatDayLabel("bad")).toBe("bad");
	});

	test("a share is a whole percent, or blank without a total", () => {
		expect(formatShare(1, 3)).toBe("33%");
		expect(formatShare(1, 0)).toBe("");
	});
});
