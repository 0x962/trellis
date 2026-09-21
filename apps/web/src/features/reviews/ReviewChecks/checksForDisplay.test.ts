import { expect, test } from "bun:test";
import { checksForDisplay } from "./checksForDisplay";

test("uses the stored buckets and counts a cancellation as a failure", () => {
	const checks = checksForDisplay([
		{ name: "Build", workflow: "CI", bucket: "pass", link: null },
		{ name: "Deploy", workflow: "CI", bucket: "cancel", link: null },
		{ name: "Lint", workflow: "CI", bucket: "skipping", link: null },
	]);

	expect(checks.map((check) => check.bucket)).toEqual(["pass", "fail", "skipping"]);
	expect(checks[1]).toMatchObject({ name: "Deploy", bucket: "fail" });
});
