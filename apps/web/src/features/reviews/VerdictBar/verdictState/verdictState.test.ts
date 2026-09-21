import { expect, test } from "bun:test";
import type { ReviewDelivery, ReviewSubmission } from "@trellis/api";
import { deliveryWords, verdictState } from "./verdictState";

const head = "b2c3d4e5";
const delivery = (facts: Partial<ReviewDelivery>): ReviewDelivery => ({
	id: "01D",
	reviewId: "01S",
	runId: "01R",
	state: "sent",
	error: null,
	readAt: null,
	...facts,
});
const submission = (facts: Partial<ReviewSubmission>): ReviewSubmission => ({
	id: "01S",
	prId: "01P",
	url: "https://github.com/o/r/pull/1",
	author: "navid",
	verdict: "approved",
	body: "",
	revisionId: "01V",
	headSha: head,
	byPerson: true,
	threads: [],
	createdAt: "2026-09-21T10:00:00.000Z",
	deliveries: [delivery({})],
	...facts,
});

test("an approval on the head commit is current", () => {
	expect(verdictState([submission({})], head)).toEqual({
		id: "01S",
		kind: "approved",
		current: true,
		headline: "You approved",
		createdAt: "2026-09-21T10:00:00.000Z",
		delivery: "sent to the agent",
	});
});

test("a request for changes on an older head commit is stale", () => {
	const state = verdictState([submission({ verdict: "changes_requested", headSha: "a1b2c3d4" })], head);

	expect(state).toMatchObject({
		kind: "stale",
		current: false,
		headline: "You asked for changes on an older commit",
	});
});

test("a comment alone shows as the last note and sets no verdict", () => {
	const state = verdictState([submission({ id: "01C", verdict: "commented" })], head);

	expect(state).toMatchObject({ id: "01C", kind: "note", current: false, headline: "You commented" });
});

test("a verdict wins over a newer comment", () => {
	const state = verdictState(
		[submission({ id: "01C", verdict: "commented", createdAt: "2026-09-21T11:00:00.000Z" }), submission({ id: "01A" })],
		head,
	);

	expect(state).toMatchObject({ id: "01A", kind: "approved" });
});

test("a submission by an agent shows nothing", () => {
	expect(verdictState([submission({ byPerson: false })], head)).toBeNull();
	expect(verdictState([], head)).toBeNull();
});

test("the delivery words name the best state of any delivery", () => {
	expect(deliveryWords([])).toBe("no agent run took it");
	expect(deliveryWords([delivery({ state: "failed" }), delivery({ readAt: "2026-09-21T10:01:00.000Z" })])).toBe(
		"the agent read it",
	);
	expect(deliveryWords([delivery({ state: "failed" }), delivery({ state: "sent" })])).toBe("sent to the agent");
	expect(deliveryWords([delivery({ state: "pending" })])).toBe("sending to the agent");
	expect(deliveryWords([delivery({ state: "failed" })])).toBe("delivery failed");
	expect(deliveryWords([delivery({ state: "unknown" })])).toBe("delivery state unknown");
});
