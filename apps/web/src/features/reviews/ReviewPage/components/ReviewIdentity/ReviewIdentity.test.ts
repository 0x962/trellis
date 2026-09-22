import { expect, test } from "bun:test";
import type { LinkedPullRequest } from "@trellis/api";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasConflict, queuePositionText, queueTooltipText, ReviewIdentity } from "./ReviewIdentity";

const linked = (mergeable: LinkedPullRequest["mergeable"], state: LinkedPullRequest["state"] = "open") =>
	({ mergeable, state }) as LinkedPullRequest;

test("a linked pull request shows the merge state that the poller stored", () => {
	expect(hasConflict({ state: "OPEN", mergeable: "MERGEABLE" }, linked("conflicting"))).toBe(true);
	expect(hasConflict({ state: "OPEN", mergeable: "CONFLICTING" }, linked("mergeable"))).toBe(false);
	expect(hasConflict({ state: "OPEN" }, linked("unknown"))).toBe(false);
	expect(hasConflict(undefined, linked("conflicting"))).toBe(true);
});

test("a pull request that no ticket links shows the answer of gh pr view", () => {
	expect(hasConflict({ state: "OPEN", mergeable: "CONFLICTING" }, null)).toBe(true);
	expect(hasConflict({ state: "OPEN", mergeable: "UNKNOWN" }, null)).toBe(false);
});

test("a merged or closed pull request shows no conflict", () => {
	expect(hasConflict({ state: "OPEN" }, linked("conflicting", "merged"))).toBe(false);
	expect(hasConflict({ state: "CLOSED", mergeable: "CONFLICTING" }, null)).toBe(false);
	expect(hasConflict(undefined, null)).toBe(false);
});

test("a queued pull request prints the queue position beside the state", () => {
	const html = renderToStaticMarkup(
		createElement(ReviewIdentity, {
			pr: "https://github.com/acme/web/pull/12",
			revision: null,
			pullRequest: { title: "Fix the header", state: "OPEN", isDraft: false },
			isQueued: true,
			linkedPr: null,
			mergeQueuePosition: 1,
			onAction: () => {},
		}),
	);

	expect(html).toContain("Queued");
	expect(html).toContain("Position 1");
	expect(html).toContain("review-queue-position");
});

test("the queued state has compact and tooltip words", () => {
	expect(queuePositionText(1)).toBe("Position 1");
	expect(queuePositionText(null)).toBe("Position pending");
	expect(queuePositionText(undefined)).toBe("Position ...");
	expect(queueTooltipText(1)).toBe("In the merge queue · Position 1");
});
