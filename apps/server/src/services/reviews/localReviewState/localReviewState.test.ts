import { afterAll, beforeAll, expect, test } from "bun:test";
import { askedForReview, PullRequestSchema, ReviewPrSchema, TicketSummarySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { open } from "../prs.ts";
import { localReviewFixture } from "./fixture.ts";

let h: Awaited<ReturnType<typeof localReviewFixture>>;
beforeAll(async () => {
	h = await localReviewFixture();
});
afterAll(async () => {
	await h.close();
});

test("new links and unlinked reviews require a saved local ready mark", async () => {
	const initial = await h.read();
	expect(initial.linked.localState).toBe("not-ready");
	expect(initial.status.localState).toBe("not-ready");
	expect(askedForReview(initial.ticket.prRows[0]!)).toBe(false);
	const opened = await h.run((tx) => open(h.ctx(h.human), tx, { pr: "fixture/review#2" }));
	const rows = await h.db.execute(sql`SELECT local_state FROM pull_requests WHERE id = ${opened.id}`);
	expect(rows.rows[0]).toEqual({ local_state: "not-ready" });
});

test("all consumers retain the local mark despite GitHub draft, approval and failed gates", async () => {
	await h.mark("ready");
	for (const isDraft of [true, false]) {
		await h.db.execute(sql`UPDATE pull_requests SET is_draft = ${isDraft}, is_queued = true,
			review_state = 'approved', mergeable = 'conflicting',
			checks = '[{"name":"CI","workflow":null,"bucket":"fail","link":null}]', ci_state = 'fail'
			WHERE id = ${h.id}`);
		const result = await h.read();
		expect(PullRequestSchema.parse(result.linked).localState).toBe("ready");
		expect(ReviewPrSchema.parse(result.index).localState).toBe("ready");
		expect(result.status.localState).toBe("ready");
		expect(askedForReview(result.ticket.prRows[0]!)).toBe(true);
		expect(askedForReview(result.ticket.pr!)).toBe(true);
		expect(result.linked.localVerdict).toBeNull();
		expect(result.ticket.pr?.locallyApproved).toBe(false);
	}
});

test("only the human's local verdict changes approval across all readers", async () => {
	await h.submit(h.agent, "approve");
	let result = await h.read();
	expect(result.linked.reviewState).toBe("approved");
	expect(result.linked.localVerdict).toBeNull();
	expect(result.index.localVerdict).toBeNull();
	expect(result.ticket.prRows[0]?.verdict).toBeNull();
	expect(result.ticket.pr?.locallyApproved).toBe(false);

	await h.submit(h.human, "approve");
	await h.submit(h.human, "comment");
	await h.submit(h.agent, "request_changes");
	result = await h.read();
	expect(result.linked.localVerdict).toBe("approved");
	expect(result.index.localVerdict).toBe("approved");
	expect(result.status.prRow?.verdict).toBe("approved");
	expect(TicketSummarySchema.parse(result.ticket).pr?.locallyApproved).toBe(true);
	expect(h.events.some((event) => event.type === "reviews.changed")).toBe(true);
	expect(h.events.some((event) => event.type === "pr.updated")).toBe(true);

	await h.mark("not-ready");
	result = await h.read();
	expect(result.linked.localVerdict).toBe("approved");
	expect(askedForReview(result.ticket.pr!)).toBe(false);
	await h.submit(h.human, "request_changes");
	result = await h.read();
	expect(result.linked.localVerdict).toBe("changes_requested");
	expect(result.index.localVerdict).toBe("changes_requested");
	expect(result.ticket.pr?.locallyApproved).toBe(false);
});
