import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LinkedPullRequest, ReviewRevision } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { barSlots } from "../../../../../lib/barSlots";
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

test("a queued pull request prints the queue position", () => {
	const html = renderToStaticMarkup(
		<ReviewIdentity
			pr="https://github.com/acme/web/pull/12"
			revision={null}
			pullRequest={{ title: "Fix the header", state: "OPEN", isDraft: false }}
			isQueued
			linkedPr={null}
			mergeQueuePosition={1}
			onAction={() => {}}
		/>,
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

const revision = {
	id: "01V",
	prId: "01AAAAAAAAAAAAAAAAAAAAAAA3",
	headSha: "abc",
	meta: { state: "OPEN", isDraft: false },
} as unknown as ReviewRevision;

// The reads behind the header answer seconds apart: the stored revision
// first, then the GitHub poll, then the ticket, then the merge queue. Each
// step below is the header as one more of them has answered.
const steps = {
	firstPaint: {
		revision: null,
		pullRequest: undefined,
		isQueued: false,
		linkedPr: null,
		mergeQueuePosition: undefined,
	},
	revisionArrived: {
		revision: revision,
		pullRequest: undefined,
		isQueued: false,
		linkedPr: null,
		mergeQueuePosition: undefined,
	},
	pollArrived: {
		revision: revision,
		pullRequest: {
			title: "Stop the header buttons from moving",
			state: "OPEN",
			isDraft: false,
			headRefName: "trl-370",
			baseRefName: "main",
		},
		isQueued: false,
		linkedPr: null,
		mergeQueuePosition: undefined,
	},
	ticketArrived: {
		revision: revision,
		pullRequest: {
			title: "Stop the header buttons from moving",
			state: "OPEN",
			isDraft: false,
			mergeable: "CONFLICTING",
			headRefName: "trl-370",
			baseRefName: "main",
		},
		isQueued: false,
		linkedPr: {
			id: "01AAAAAAAAAAAAAAAAAAAAAAA3",
			number: 370,
			state: "open",
			mergeable: "conflicting",
			localState: "not-ready",
			reviewGaps: [{ kind: "not-asked", count: 1 }],
			baseRef: "main",
		} as LinkedPullRequest,
		mergeQueuePosition: undefined,
	},
} as const;

// The GitHub button reads the merge queue and the branch protection only
// after a click opens its menu, so the render below needs the query options
// of that read and nothing more.
const queryClient = new QueryClient();
const app = {
	queryClient,
	orpc: {
		reviews: {
			metadata: {
				queryOptions: () => ({ queryKey: ["reviews.metadata"], queryFn: () => Promise.resolve(undefined) }),
				key: () => ["reviews.metadata"],
			},
		},
	},
} as unknown as AppContext;

const headerHtml = (step: keyof typeof steps) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<ReviewIdentity pr="https://github.com/acme/web/pull/370" {...steps[step]} onAction={() => {}} />
			</QueryClientProvider>
		</AppProvider>,
	);

test("the header holds every box from the first paint", () => {
	expect(barSlots(headerHtml("firstPaint"))).toEqual(["github", "local-state", "internal-link", "glyph", "conflict"]);
});

test("each answer fills a box and leaves the order of the header as it was", () => {
	const order = ["github", "local-state", "internal-link", "glyph", "conflict"];

	expect(barSlots(headerHtml("revisionArrived"))).toEqual(order);
	expect(barSlots(headerHtml("pollArrived"))).toEqual(order);
	expect(barSlots(headerHtml("ticketArrived"))).toEqual(order);
});

test("the GitHub button arrives into the box that waited for it", () => {
	expect(headerHtml("firstPaint")).not.toContain('aria-label="GitHub actions"');
	expect(headerHtml("revisionArrived")).toContain('aria-label="GitHub actions"');
	// The empty box and the filled box are the same box, so the button takes
	// the place the header already held for it.
	expect(barSlots(headerHtml("firstPaint")).indexOf("github")).toBe(
		barSlots(headerHtml("revisionArrived")).indexOf("github"),
	);
});

test("the ticket answer adds the ... menu without moving the GitHub button", () => {
	const before = barSlots(headerHtml("pollArrived"));
	const after = barSlots(headerHtml("ticketArrived"));

	expect(headerHtml("pollArrived")).not.toContain("Actions for PR #370");
	expect(headerHtml("ticketArrived")).toContain("Actions for PR #370");
	expect(before.indexOf("github")).toBe(after.indexOf("github"));
	expect(before).toEqual(after);
});

test("the stored revision adds the stable pull request link", () => {
	expect(headerHtml("firstPaint")).not.toContain('aria-label="Copy Trellis link"');
	expect(headerHtml("revisionArrived")).toContain('aria-label="Copy Trellis link"');
});

test("the merge conflict link arrives into the box that waited for it", () => {
	expect(headerHtml("pollArrived")).not.toContain("data-pr-conflict");
	expect(headerHtml("ticketArrived")).toContain("data-pr-conflict");
	expect(barSlots(headerHtml("ticketArrived")).indexOf("conflict")).toBe(
		barSlots(headerHtml("firstPaint")).indexOf("conflict"),
	);
});

test("the queue position ends the row, after the branch", () => {
	const html = renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<ReviewIdentity
					pr="https://github.com/acme/web/pull/370"
					{...steps.pollArrived}
					isQueued
					mergeQueuePosition={2}
					onAction={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

	expect(html.indexOf("review-branch")).toBeLessThan(html.indexOf("review-queue-position"));
	expect(html).toContain("Position 2");
});
