import { describe, expect, test } from "bun:test";
import { githubActionItems, liveBranchActions, mergeMenuActions } from "./reviewActions";

const labelsOf = (items: ReturnType<typeof githubActionItems>) => items.map((item) => item.label);

describe("mergeMenuActions", () => {
	test("shows the action that changes each current state", () => {
		expect(mergeMenuActions({}, {})).toEqual([
			{ action: "merge", label: "Merge", confirm: true },
			{ action: "admin-merge", label: "Admin merge", confirm: true },
			{ action: "automerge", label: "Enable auto-merge" },
			{ action: "queue", label: "Add to queue" },
		]);
		expect(mergeMenuActions({ autoMergeRequest: {} }, { mergeQueueEntry: {} })).toEqual([
			{ action: "merge", label: "Merge", confirm: true },
			{ action: "admin-merge", label: "Admin merge", confirm: true },
			{ action: "disable-automerge", label: "Disable auto-merge" },
			{ action: "dequeue", label: "Remove from queue" },
		]);
	});
});

describe("githubActionItems", () => {
	test("puts ready and merge in the same GitHub menu for a draft", () => {
		expect(labelsOf(githubActionItems({ state: "OPEN", isDraft: true }, {}, "https://github.com/o/r/pull/1"))).toEqual([
			"Mark ready for review",
			"Merge",
			"Admin merge",
			"Enable auto-merge",
			"Add to queue",
			"Update branch",
			"Close",
		]);
	});

	test("shows one deploy action before close", () => {
		expect(
			labelsOf(githubActionItems({ state: "OPEN" }, { autoDeployAvailable: true }, "https://github.com/o/r/pull/1")),
		).toContain("Enable deploy on merge");
		expect(
			labelsOf(
				githubActionItems(
					{ state: "OPEN", labels: [{ name: "00_AUTO_DEPLOY" }] },
					{ autoDeployAvailable: true },
					"https://github.com/o/r/pull/1",
				),
			),
		).toContain("Disable deploy on merge");
	});

	test("offers no GitHub action after the pull request closes", () => {
		expect(githubActionItems({ state: "MERGED" }, {}, "https://github.com/o/r/pull/1")).toEqual([]);
		expect(githubActionItems({ state: "CLOSED" }, {}, "https://github.com/o/r/pull/1")).toEqual([]);
	});
});

describe("liveBranchActions", () => {
	test("shows Live Branch actions only for an open Canary pull request", () => {
		expect(
			labelsOf(
				liveBranchActions(
					{ state: "OPEN", labels: [{ name: "Live Branch: Enabled" }, { name: "Live Branch: Persist" }] },
					"https://github.com/canary-technologies-corp/canary/pull/1",
				),
			),
		).toEqual([
			"Create Live Branch",
			"Deploy Live Branch",
			"Delete Live Branch",
			"Disable Live Branch on push",
			"Remove Live Branch persistence",
		]);
		expect(liveBranchActions({ state: "OPEN" }, "https://github.com/o/r/pull/1")).toEqual([]);
		expect(
			liveBranchActions(
				{ state: "OPEN", headRefName: "golem/task" },
				"https://github.com/canary-technologies-corp/canary/pull/1",
			),
		).toEqual([]);
	});
});
