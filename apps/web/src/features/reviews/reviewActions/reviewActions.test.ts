import { describe, expect, test } from "bun:test";
import { githubActionItems, mergeMenuActions } from "./reviewActions";

const groupLabelsOf = (groups: ReturnType<typeof githubActionItems>) => groups.map((group) => group.label ?? "");
const itemLabelsOf = (groups: ReturnType<typeof githubActionItems>) =>
	groups.flatMap((group) => group.items.map((item) => item.label));
const actionNamesOf = (groups: ReturnType<typeof githubActionItems>) =>
	groups.flatMap((group) => group.items.map((item) => item.action));

describe("mergeMenuActions", () => {
	test("shows the action that changes each current state", () => {
		expect(mergeMenuActions({}, {})).toEqual([
			{ action: "merge", label: "Merge", confirm: true },
			{ action: "automerge", label: "Merge when ready" },
			{ action: "queue", label: "Add to merge queue" },
		]);
		expect(mergeMenuActions({ autoMergeRequest: {} }, { mergeQueueEntry: {} })).toEqual([
			{ action: "merge", label: "Merge", confirm: true },
			{ action: "disable-automerge", label: "Cancel merge when ready" },
			{ action: "dequeue", label: "Remove from merge queue" },
		]);
	});
});

describe("githubActionItems", () => {
	test("groups a draft pull request in the order a person uses it", () => {
		const groups = githubActionItems({ state: "OPEN", isDraft: true }, {}, "https://github.com/o/r/pull/1");
		expect(groupLabelsOf(groups)).toEqual(["", "Merge", "Branch", ""]);
		expect(itemLabelsOf(groups)).toEqual([
			"Open in GitHub",
			"Merge",
			"Merge when ready",
			"Add to merge queue",
			"Mark ready for review",
			"Update branch",
			"Close pull request",
		]);
	});

	test("uses the current merge queue and auto-merge states", () => {
		expect(
			itemLabelsOf(
				githubActionItems(
					{ state: "OPEN", autoMergeRequest: {} },
					{ mergeQueueEntry: {} },
					"https://github.com/o/r/pull/1",
				),
			),
		).toEqual([
			"Open in GitHub",
			"Merge",
			"Cancel merge when ready",
			"Remove from merge queue",
			"Update branch",
			"Close pull request",
		]);
	});

	test("keeps only the open action after the pull request closes", () => {
		expect(itemLabelsOf(githubActionItems({ state: "MERGED" }, {}, "https://github.com/o/r/pull/1"))).toEqual([
			"Open in GitHub",
		]);
		expect(itemLabelsOf(githubActionItems({ state: "CLOSED" }, {}, "https://github.com/o/r/pull/1"))).toEqual([
			"Open in GitHub",
		]);
	});

	test("exposes only the shared pull request actions", () => {
		expect(actionNamesOf(githubActionItems({ state: "OPEN" }, {}, "https://github.com/o/r/pull/1"))).toEqual([
			"open",
			"merge",
			"automerge",
			"queue",
			"update-branch",
			"close",
		]);
	});
});
