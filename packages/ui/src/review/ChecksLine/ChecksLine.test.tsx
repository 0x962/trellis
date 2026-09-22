import { expect, test } from "bun:test";
import { checksLineResult } from "./checksLineResult/checksLineResult";
import type { ChecksLineCheck } from "./checkWords/checkWords";

const checks: ChecksLineCheck[] = [
	{ name: "merge_gatekeeper", workflow: "9.AUTO Merge gatekeeper", bucket: "fail", link: "https://example.com/1" },
	{ name: "Build", workflow: "CI", bucket: "pending", link: "https://example.com/2", status: "running" },
	{ name: "Backend linters", workflow: "9.CAN.AUTO Check Canary", bucket: "pending", link: "https://example.com/3" },
	{ name: "old deploy", workflow: "Release", bucket: "cancel", link: "https://example.com/4" },
	{ name: "future check", workflow: null, bucket: "pending", link: null, status: "unknown" },
	{ name: "Types", workflow: "CI", bucket: "pass", link: "https://example.com/5" },
	{ name: "Preview", workflow: null, bucket: "skipping", link: null },
];

test("puts a count for each bucket in the title and makes one group for each status", () => {
	const result = checksLineResult(checks);

	expect(result.title).toBe("Some checks were not successful");
	expect(result.description).toBe("1 failing, 2 in progress, 1 skipped, 1 successful check, 1 canceled, 1 unknown");
	expect(result.summaryStatus).toBe("failed");
	expect(result.groups.map((group) => group.label)).toEqual([
		"Failed",
		"In progress",
		"Queued",
		"Skipped",
		"Successful",
		"Canceled",
		"Unknown",
	]);
	expect(result.groups[0]?.checks[0]).toMatchObject({
		name: "merge_gatekeeper",
		workflow: "9.AUTO Merge gatekeeper",
		url: "https://example.com/1",
		outcome: "Failing",
	});
});

test("drops zero groups", () => {
	const result = checksLineResult(checks.filter((check) => check.bucket === "pending" && check.status === undefined));

	expect(result.title).toBe("Some checks are in progress");
	expect(result.description).toBe("1 in progress");
	expect(result.groups.map((group) => group.label)).toEqual(["Queued"]);
});
