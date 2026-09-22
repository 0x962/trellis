import { expect, test } from "bun:test";
import type { LinkedPullRequest } from "@trellis/api";
import { hasConflict } from "./ReviewIdentity";

const linked = (mergeable: LinkedPullRequest["mergeable"]) => ({ mergeable }) as LinkedPullRequest;

test("a linked pull request shows the merge state that the poller stored", () => {
	expect(hasConflict({ state: "OPEN", mergeable: "MERGEABLE" }, linked("conflicting"))).toBe(true);
	expect(hasConflict({ state: "OPEN", mergeable: "CONFLICTING" }, linked("mergeable"))).toBe(false);
	expect(hasConflict({ state: "OPEN" }, linked("unknown"))).toBe(false);
});

test("a pull request that no ticket links shows the answer of gh pr view", () => {
	expect(hasConflict({ state: "OPEN", mergeable: "CONFLICTING" }, null)).toBe(true);
	expect(hasConflict({ state: "OPEN", mergeable: "UNKNOWN" }, null)).toBe(false);
});

test("a merged or closed pull request shows no conflict", () => {
	expect(hasConflict({ state: "MERGED" }, linked("conflicting"))).toBe(false);
	expect(hasConflict({ state: "CLOSED", mergeable: "CONFLICTING" }, null)).toBe(false);
	expect(hasConflict(undefined, null)).toBe(false);
});
