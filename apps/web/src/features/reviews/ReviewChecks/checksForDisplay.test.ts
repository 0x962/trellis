import { expect, test } from "bun:test";
import { checksForDisplay } from "./checksForDisplay";

const times = { startedAt: null, endedAt: null };

test("uses the stored buckets and counts a cancellation as a failure", () => {
	const checks = checksForDisplay([
		{ name: "Build", workflow: "CI", bucket: "pass", link: null, ...times },
		{ name: "Deploy", workflow: "CI", bucket: "cancel", link: null, ...times },
		{ name: "Lint", workflow: "CI", bucket: "skipping", link: null, ...times },
	]);

	expect(checks.map((check) => check.bucket)).toEqual(["pass", "fail", "skipping"]);
	expect(checks[1]).toMatchObject({ name: "Deploy", bucket: "fail" });
});

test("the row carries the two times the duration comes from", () => {
	const checks = checksForDisplay([
		{
			name: "Build",
			workflow: "CI",
			bucket: "pass",
			link: null,
			startedAt: "2026-09-21T10:00:00.000Z",
			endedAt: "2026-09-21T10:02:14.000Z",
		},
	]);

	expect(checks[0]).toMatchObject({ startedAt: "2026-09-21T10:00:00.000Z", endedAt: "2026-09-21T10:02:14.000Z" });
});
