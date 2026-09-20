import { expect, test } from "bun:test";
import { CheckResults } from "@trellis/ui/review";
import type { ComponentProps, ReactElement } from "react";
import { ChecksLine, type ChecksLineCheck } from "./ChecksLine";

const checks: ChecksLineCheck[] = [
	{ name: "merge_gatekeeper", workflow: "9.AUTO Merge gatekeeper", bucket: "fail", link: "https://example.com/1" },
	{ name: "Build", workflow: "CI", bucket: "pending", link: "https://example.com/2", status: "running" },
	{ name: "Backend linters", workflow: "9.CAN.AUTO Check Canary", bucket: "pending", link: "https://example.com/2" },
	{ name: "old deploy", workflow: "Release", bucket: "cancel", link: "https://example.com/3" },
	{ name: "future check", workflow: null, bucket: "pending", link: null, status: "unknown" },
	{ name: "Types", workflow: "CI", bucket: "pass", link: "https://example.com/4" },
	{ name: "Preview", workflow: null, bucket: "skipping", link: null },
];

test("builds the word heading and all check groups without a ring", () => {
	const element = ChecksLine({ checks, isCollapsed: () => false, onToggle: () => undefined }) as ReactElement<
		ComponentProps<typeof CheckResults>
	>;

	expect(element.type).toBe(CheckResults);
	expect(element.props.title).toBe("1 failed · 2 pending · 1 canceled · 1 unknown · 1 passed · 1 skipped");
	expect(element.props.summary).toBeUndefined();
	expect(element.props.groups.map((group) => group.label)).toEqual([
		"Failed",
		"In progress",
		"Pending",
		"Canceled",
		"Unknown",
		"Passed",
		"Skipped",
	]);
	expect(element.props.groups[0]?.checks[0]).toMatchObject({
		name: "merge_gatekeeper",
		workflow: "9.AUTO Merge gatekeeper",
		url: "https://example.com/1",
	});
});

test("drops zero groups", () => {
	const element = ChecksLine({
		checks: checks.filter((check) => check.bucket === "pending" && check.status === undefined),
		isCollapsed: () => false,
		onToggle: () => undefined,
	}) as ReactElement<ComponentProps<typeof CheckResults>>;

	expect(element.props.title).toBe("1 pending");
	expect(element.props.groups.map((group) => group.label)).toEqual(["Pending"]);
});
