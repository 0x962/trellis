import { describe, expect, test } from "bun:test";
import { type ChecksLineBucket, type ChecksLineCheck, checkWords } from "./checkWords";

const checksOf = (...buckets: ChecksLineBucket[]): ChecksLineCheck[] =>
	buckets.map((bucket, index) => ({ name: `Check ${index}`, workflow: null, bucket, link: null }));

describe("checkWords", () => {
	test("prints every nonzero bucket in review order", () => {
		expect(checkWords(checksOf("pass", "pass", "fail", "pending", "cancel", "skipping", "skipping"))).toBe(
			"1 failing, 1 in progress, 2 skipped, 2 successful checks, 1 canceled",
		);
	});

	test("drops only zero buckets", () => {
		expect(checkWords(checksOf("cancel"))).toBe("1 canceled");
		expect(checkWords([])).toBe("");
	});

	test("keeps an unknown row out of the pending count", () => {
		expect(
			checkWords([
				{ name: "Unknown", workflow: null, bucket: "pending", link: null, status: "unknown" },
				{ name: "Build", workflow: null, bucket: "pending", link: null, status: "running" },
			]),
		).toBe("1 in progress, 1 unknown");
	});
});
