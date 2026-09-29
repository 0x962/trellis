import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { flowReviewCredit, occurrenceV1Example, readyForReview } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { pullRequestRowLine } from "../../../../../packages/api/src/epicText/pullRequestRow.ts";
import type { Db } from "../client.ts";
import { openTestDb } from "../testDb.ts";
import { reviewFixture } from "./reviewReady.fixtures.ts";
import { flowAnsweredSql, notReadyForReviewSql } from "./reviewReady.ts";
import { linkedPullRequests, ticketSummary } from "./ticketGet.ts";

let db: Db;
beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name,kind,first_seen_at,last_seen_at)
		VALUES ('Policy','human',now(),now())`);
});
afterAll(async () => {
	await db.$client.close();
});

const answered = async (pull: string) => {
	const result = await db.execute(sql`SELECT ${flowAnsweredSql(sql`p`)} AS answered
		FROM pull_requests p WHERE p.id = ${pull}`);
	return result.rows[0]!.answered;
};

for (const engine of ["legacy", "langflow"] as const) {
	describe(`${engine} stored review policy`, () => {
		test("a push and a later failed run preserve credit across shared rows", async () => {
			const f = await reviewFixture(db);
			const success = await f.insertRun(engine, "succeeded");
			const failure = await f.insertRun(engine, "failed");
			await db.execute(sql`UPDATE pull_requests SET head_sha = 'new-head' WHERE id = ${f.pull}`);
			expect(await answered(f.pull)).toBe(true);
			expect(
				flowReviewCredit({
					diffId: f.pull,
					hasTicket: true,
					applicableFlowIds: [f.flow],
					waived: false,
					runs: [failure, success],
				}),
			).toBe(true);
			const ticket = await db.transaction((tx) => ticketSummary(tx, f.ticket));
			const [diff] = await db.transaction((tx) => linkedPullRequests(tx, f.ticket));
			expect(ticket.prRows[0]!.reviewGaps).toEqual([{ kind: "evidence", count: 1 }]);
			expect(diff!.reviewGaps).toEqual(ticket.prRows[0]!.reviewGaps);
			expect(ticket.prRows[0]!.flowRuns.map((run) => run.status)).toEqual(["failed", "succeeded"]);
			expect(pullRequestRowLine(ticket.prRows[0]!)).toContain("flow: failed");
		});

		test("credit follows the diff association and current catalog", async () => {
			const f = await reviewFixture(db);
			const other = await reviewFixture(db);
			const run = await f.insertRun(engine, "succeeded");
			const table = sql.raw(engine === "legacy" ? "flow_executions" : "langflow_executions");
			const idColumn = sql.raw(engine === "legacy" ? "id" : "execution_id");
			await db.execute(sql`UPDATE ${table} SET diff_id = NULL WHERE ${idColumn} = ${run.id}`);
			expect(await answered(f.pull)).toBe(false);
			await db.execute(sql`UPDATE ${table} SET diff_id = ${other.pull} WHERE ${idColumn} = ${run.id}`);
			expect(await answered(f.pull)).toBe(false);
			expect(await answered(other.pull)).toBe(false);
			await db.execute(sql`UPDATE flows SET project_id = NULL WHERE id = ${f.flow}`);
			expect(await answered(other.pull)).toBe(true);
			await db.execute(sql`UPDATE flows SET project_id = ${f.project} WHERE id = ${f.flow}`);
			await db.execute(sql`UPDATE ${table} SET diff_id = ${f.pull} WHERE ${idColumn} = ${run.id}`);
			await db.execute(sql`INSERT INTO flows (id,project_id,slug,name,created_at,updated_at)
				VALUES (${ulid()},${f.project},'other','Other',${f.at},${f.at})`);
			await db.execute(sql`DELETE FROM flows WHERE id = ${f.flow}`);
			expect(await answered(f.pull)).toBe(false);
			const retained = await db.execute(sql`SELECT count(*)::int AS count FROM ${table} WHERE ${idColumn} = ${run.id}`);
			expect(retained.rows[0]!.count).toBe(1);
			await db.execute(sql`DELETE FROM flows WHERE project_id = ${f.project}`);
			expect(await answered(f.pull)).toBe(true);
		});

		test("waivers and missing tickets preserve their exceptions", async () => {
			const f = await reviewFixture(db);
			await f.insertRun(engine, "waiting");
			expect(await answered(f.pull)).toBe(false);
			await db.execute(sql`INSERT INTO pr_flow_waivers
				(pull_request_id,head_sha,reason,actor_name,actor_kind,created_at,updated_at)
				VALUES (${f.pull},'old-head','This change needs no flow.','Policy','human',${f.at},${f.at})`);
			await db.execute(sql`UPDATE pull_requests SET head_sha = 'new-head' WHERE id = ${f.pull}`);
			expect(await answered(f.pull)).toBe(true);
			await db.execute(sql`DELETE FROM pr_flow_waivers WHERE pull_request_id = ${f.pull}`);
			await db.execute(sql`DELETE FROM ticket_pull_requests WHERE pull_request_id = ${f.pull}`);
			expect(await answered(f.pull)).toBe(true);
		});

		test("successful flows leave checks, findings, conflicts, and local requests independent", async () => {
			const f = await reviewFixture(db);
			await f.insertRun(engine, "succeeded");
			await db.execute(sql`UPDATE pull_requests SET ci_state = 'fail', mergeable = 'conflicting',local_state='not-ready',
				checks = ${JSON.stringify([{ name: "CI", workflow: null, bucket: "fail", link: null }])}::jsonb WHERE id = ${f.pull}`);
			await db.execute(sql`INSERT INTO review_threads (id,pr_id,document,updated_at)
				VALUES (${ulid()},${f.pull},${{ status: "open" }},${f.at})`);
			const ticket = await db.transaction((tx) => ticketSummary(tx, f.ticket));
			const [diff] = await db.transaction((tx) => linkedPullRequests(tx, f.ticket));
			expect(await answered(f.pull)).toBe(true);
			expect(ticket.prRows[0]!.reviewGaps.map((gap) => gap.kind)).toEqual([
				"not-asked",
				"checks-failed",
				"findings",
				"conflict",
			]);
			expect(diff!.reviewGaps).toEqual(ticket.prRows[0]!.reviewGaps);
			expect(readyForReview(ticket.prRows[0]!)).toBe(false);
			const sqlGap = await db.execute(
				sql`SELECT ${notReadyForReviewSql(sql`p`)} AS missing FROM pull_requests p WHERE p.id=${f.pull}`,
			);
			expect(sqlGap.rows[0]!.missing).toBe(true);
			expect(ticket.prRows[0]!.verdict).toBeNull();
		});

		test("ticket deletion cascades executions and diff deletion clears associations", async () => {
			const f = await reviewFixture(db);
			const run = await f.insertRun(engine, "succeeded");
			const table = sql.raw(engine === "legacy" ? "flow_executions" : "langflow_executions");
			const idColumn = sql.raw(engine === "legacy" ? "id" : "execution_id");
			await db.execute(sql`DELETE FROM pull_requests WHERE id=${f.pull}`);
			const retained = await db.execute(sql`SELECT diff_id FROM ${table} WHERE ${idColumn}=${run.id}`);
			expect(retained.rows[0]!.diff_id).toBeNull();
			await db.execute(sql`DELETE FROM tickets WHERE id=${f.ticket}`);
			const removed = await db.execute(sql`SELECT count(*)::int AS count FROM ${table} WHERE ${idColumn}=${run.id}`);
			expect(removed.rows[0]!.count).toBe(0);
		});
	});
}

test("V1 findings follow saved native sessions and count each thread once", async () => {
	const f = await reviewFixture(db);
	const run = await f.insertRun("langflow", "succeeded");
	const agentRunId = ulid();
	const occurrence = { ...occurrenceV1Example, attempts: [{ ...occurrenceV1Example.attempts[0]!, agentRunId }] };
	await db.execute(
		sql`UPDATE langflow_execution_projections SET view = ${{ ...run, occurrences: [occurrence, occurrence] }} WHERE execution_id=${run.id}`,
	);
	await db.execute(sql`INSERT INTO agent_runs (id,name,kind,instruction,project_id,project_key,ticket_id,ticket_identifier,session_id,created_at,updated_at)
		VALUES (${agentRunId},'Reviewer','flow','Review.',${f.project},${f.project},${f.ticket},'TST-1',${agentRunId},${f.at},${f.at})`);
	await db.execute(sql`INSERT INTO review_threads (id,pr_id,document,updated_at)
		VALUES (${ulid()},${f.pull},${{ status: "open", author: "Custom reviewer", session: agentRunId }},${f.at})`);
	const ticket = await db.transaction((tx) => ticketSummary(tx, f.ticket));
	expect(ticket.prRows[0]!.flowRuns).toEqual([{ name: "Review", status: "succeeded", findings: 1 }]);
	expect(ticket.prRows[0]!.verdict).toBeNull();
});
