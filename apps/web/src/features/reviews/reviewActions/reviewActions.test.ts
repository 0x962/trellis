import { describe, expect, test } from "bun:test";
import { mergeAction, mergeMenuActions, overflowActions, primaryReviewAction } from "./reviewActions";

describe("primaryReviewAction", () => {
	test("offers ready for review on an open draft", () => {
		expect(primaryReviewAction({ state: "OPEN", isDraft: true })).toBe("ready");
		expect(primaryReviewAction({ state: "open", isDraft: true })).toBe("ready");
	});

	test("offers merge on an open pull request", () => {
		expect(primaryReviewAction({ state: "OPEN", isDraft: false })).toBe("merge");
	});

	test("offers no primary action after the pull request closes", () => {
		expect(primaryReviewAction({ state: "MERGED", isDraft: false })).toBeNull();
		expect(primaryReviewAction({ state: "CLOSED", isDraft: false })).toBeNull();
	});
});

describe("mergeAction", () => {
	test("uses administrator privileges only when selected", () => {
		expect(mergeAction(false)).toBe("merge");
		expect(mergeAction(true)).toBe("admin-merge");
	});
});

describe("mergeMenuActions", () => {
	test("shows the action that changes each current state", () => {
		expect(mergeMenuActions({}, {})).toEqual([
			{ action: "automerge", label: "Enable auto-merge" },
			{ action: "queue", label: "Join the merge queue" },
		]);
		expect(mergeMenuActions({ autoMergeRequest: {} }, { mergeQueueEntry: {} })).toEqual([
			{ action: "disable-automerge", label: "Disable auto-merge" },
			{ action: "dequeue", label: "Leave the merge queue" },
		]);
	});
});

describe("overflowActions", () => {
	test("shows one deploy action and keeps close last", () => {
		expect(overflowActions({}, { autoDeployAvailable: true })).toEqual([
			{ action: "update-branch", label: "Update branch" },
			{ action: "deploy-on", label: "Enable deploy on merge" },
			{ action: "close", label: "Close pull request" },
		]);
		expect(overflowActions({ labels: [{ name: "00_AUTO_DEPLOY" }] }, { autoDeployAvailable: true })).toEqual([
			{ action: "update-branch", label: "Update branch" },
			{ action: "deploy-off", label: "Disable deploy on merge" },
			{ action: "close", label: "Close pull request" },
		]);
	});
});
