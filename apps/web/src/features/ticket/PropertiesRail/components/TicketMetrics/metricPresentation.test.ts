import { expect, test } from "bun:test";
import { ageRefreshDelay, metricText } from "./metricPresentation.ts";

test("metric text keeps request failures distinct from unavailable data", () => {
	expect(metricText("pending", 12, String)).toBe("Load…");
	expect(metricText("error", 12, String)).toBe("Failed to load");
	expect(metricText("success", null, String)).toBe("Unavailable");
	expect(metricText("success", 12, String)).toBe("12");
});

test("age refresh delay reaches each displayed duration boundary", () => {
	expect(ageRefreshDelay(59_999)).toBe(1);
	expect(ageRefreshDelay(60_000)).toBe(60_000);
	expect(ageRefreshDelay(3_599_999)).toBe(1);
	expect(ageRefreshDelay(3_600_000)).toBe(3_600_000);
	expect(ageRefreshDelay(86_400_000)).toBe(86_400_000);
});
