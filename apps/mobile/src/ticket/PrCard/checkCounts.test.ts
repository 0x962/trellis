import { describe, expect, test } from "bun:test";
import type { Check, CheckBucket } from "@trellis/api";
import { checkCounts } from "./checkCounts";

const check = (name: string, bucket: CheckBucket): Check => ({ name, workflow: "ci", bucket, link: null });

describe("checkCounts", () => {
	// O8. Every bucket at least once.
	test("counts pass, fail, and pending and folds cancel into fail", () => {
		const checks = [
			check("lint", "pass"),
			check("typecheck", "pass"),
			check("test", "fail"),
			check("e2e", "cancel"),
			check("docs", "skipping"),
			check("build", "pending"),
		];
		expect(checkCounts(checks)).toEqual({
			pass: 2,
			fail: 2,
			pending: 1,
			state: "fail",
			label: "2 pass · 2 fail · 1 pending",
		});
	});

	// O9.
	test("a pull request without checks reports no checks", () => {
		expect(checkCounts([])).toEqual({ pass: 0, fail: 0, pending: 0, state: "none", label: "No checks" });
	});
});
