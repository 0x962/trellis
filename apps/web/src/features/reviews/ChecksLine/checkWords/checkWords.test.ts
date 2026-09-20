import { describe, expect, test } from "bun:test";
import type { CheckBucket } from "@trellis/api";
import { checkWords } from "./checkWords";

const checks = (...buckets: CheckBucket[]) => buckets.map((bucket) => ({ bucket }));

describe("checkWords", () => {
	test("prints every nonzero bucket in review order", () => {
		expect(checkWords(checks("pass", "pass", "fail", "pending", "cancel", "skipping", "skipping"))).toBe(
			"1 failed · 1 pending · 1 canceled · 2 passed · 2 skipped",
		);
	});

	test("drops only zero buckets", () => {
		expect(checkWords(checks("cancel"))).toBe("1 canceled");
		expect(checkWords([])).toBe("");
	});
});
