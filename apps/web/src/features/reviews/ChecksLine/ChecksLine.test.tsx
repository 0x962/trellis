import { expect, test } from "bun:test";
import type { Check } from "@trellis/api";
import { CheckResults } from "@trellis/ui/review";
import type { ComponentProps, ReactElement } from "react";
import { ChecksLine } from "./ChecksLine";

const checks: Check[] = [
	{ name: "merge_gatekeeper", workflow: "9.AUTO Merge gatekeeper", bucket: "fail", link: "https://example.com/1" },
	{ name: "Backend linters", workflow: "9.CAN.AUTO Check Canary", bucket: "pending", link: "https://example.com/2" },
	{ name: "old deploy", workflow: "Release", bucket: "cancel", link: "https://example.com/3" },
	{ name: "Types", workflow: "CI", bucket: "pass", link: "https://example.com/4" },
	{ name: "Preview", workflow: null, bucket: "skipping", link: null },
];

test("builds the word heading and all five check groups without a ring", () => {
	const element = ChecksLine({ checks, isCollapsed: () => false, onToggle: () => undefined }) as ReactElement<
		ComponentProps<typeof CheckResults>
	>;

	expect(element.type).toBe(CheckResults);
	expect(element.props.title).toBe("1 failed · 1 pending · 1 canceled · 1 passed · 1 skipped");
	expect(element.props.summary).toBeUndefined();
	expect(element.props.groups.map((group) => group.label)).toEqual([
		"Failed",
		"Pending",
		"Canceled",
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
		checks: checks.filter((check) => check.bucket === "pending"),
		isCollapsed: () => false,
		onToggle: () => undefined,
	}) as ReactElement<ComponentProps<typeof CheckResults>>;

	expect(element.props.title).toBe("1 pending");
	expect(element.props.groups.map((group) => group.label)).toEqual(["Pending"]);
});
