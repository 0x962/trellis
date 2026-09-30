import { afterAll, beforeAll, expect, test } from "bun:test";
import { ReviewPrSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { monotonicFactory, ulid } from "ulid";
import { reviewFixture } from "../../../db/queries/reviewReady.fixtures.ts";
import { openTestDb } from "../../../db/testDb.ts";
import { prs } from "../prs.ts";
import { baselinePrs } from "./fixtures/baseline.ts";
import { reviewPrsContext } from "./fixtures/context.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const actorId = sql`(SELECT id FROM actors WHERE ARRAY[kind,name] = ARRAY['human','Policy'])`;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name,kind,first_seen_at,last_seen_at)
		VALUES ('Policy','human',now(),now()), ('Worker','agent',now(),now())`);
});
afterAll(async () => {
	await db.$client.close();
});

async function compare(input: { project?: string; all?: boolean } = { all: true }) {
	const ctx = await reviewPrsContext(db);
	const { actual, expected } = await db.transaction(async (tx) => ({
		actual: await prs(ctx, tx, input),
		expected: await baselinePrs(ctx, tx, input),
	}));
	expect(actual.map((row) => row.updatedAt)).toEqual(expected.map((row) => row.updatedAt));
	const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
	expect(actual.toSorted(byId)).toEqual(expected.toSorted(byId));
	for (const row of actual) expect(ReviewPrSchema.parse(row)).toEqual(row);
	return actual;
}

const hasFlowGap = (rows: Awaited<ReturnType<typeof prs>>, id: string) =>
	rows.find((row) => row.id === id)!.reviewGaps.some((gap) => gap.kind === "flow-run");

test("the complete list preserves filters, fields, thread totals and timestamp order", async () => {
	const first = await reviewFixture(db);
	const second = await reviewFixture(db);
	const unlinked = await reviewFixture(db);
	await db.execute(sql`DELETE FROM ticket_pull_requests WHERE pull_request_id = ${unlinked.pull}`);
	await db.execute(sql`INSERT INTO repos (id,project_id,owner,repo)
		SELECT ${ulid()},${first.project},owner,repo FROM pull_requests WHERE id=${unlinked.pull}`);
	await db.execute(sql`UPDATE pull_requests SET review_retained=true, is_draft=true, is_queued=true,
		mergeable='conflicting', checks='[{"name":"CI","workflow":null,"bucket":"cancel","link":null,"startedAt":null,"endedAt":null}]',
		ci_state='fail', local_state='not-ready', updated_at='2026-09-30T23:00:00Z' WHERE id=${first.pull}`);
	await db.execute(
		sql`UPDATE pull_requests SET state='merged', updated_at='2026-09-30T11:00:00Z' WHERE id=${second.pull}`,
	);
	await db.execute(sql`UPDATE pull_requests SET state='closed', review_retained=true,
		updated_at='2026-09-30T12:00:00Z' WHERE id=${unlinked.pull}`);
	await db.execute(sql`INSERT INTO review_threads (id,pr_id,document,updated_at) VALUES
		(${ulid()},${first.pull},'{"status":"open"}','2026-09-30T07:00:00Z'),
		(${ulid()},${first.pull},'{"status":"open"}','2026-09-30T08:00:00Z'),
		(${ulid()},${first.pull},'{"status":"resolved"}','2026-09-30T09:00:00Z'),
		(${ulid()},${first.pull},'{}','2026-09-30T10:00:00Z')`);
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_id,actor_name,actor_kind,created_at)
		VALUES (${second.ticket},${first.pull},'manual',${actorId},'Policy','human',now())`);
	const all = await compare();
	expect(all.find((row) => row.id === first.pull)).toMatchObject({
		open: 2,
		resolved: 1,
		updatedAt: "2026-09-30T10:00:00.000Z",
		isDraft: true,
		isQueued: true,
	});
	expect(all.find((row) => row.id === unlinked.pull)).toMatchObject({ open: 0, resolved: 0, reviewGaps: [] });
	expect(all.map((row) => row.id)).toEqual([unlinked.pull, second.pull, first.pull]);
	expect((await compare({})).map((row) => row.id)).toEqual([unlinked.pull, first.pull]);
	expect((await compare({ all: false })).map((row) => row.id)).toEqual([unlinked.pull, first.pull]);
	expect((await compare({ project: first.project })).map((row) => row.id)).toEqual([unlinked.pull, first.pull]);
	expect((await compare({ project: second.project, all: true })).map((row) => row.id)).toEqual([
		second.pull,
		first.pull,
	]);
	expect(hasFlowGap(all, first.pull)).toBe(true);
});

for (const engine of ["legacy", "langflow"] as const) {
	test(`${engine} success follows the diff and current flow scope across later failures and pushes`, async () => {
		const f = await reviewFixture(db);
		const other = await reviewFixture(db);
		const success = await f.insertRun(engine, "succeeded");
		await f.insertRun(engine, "failed");
		await db.execute(sql`UPDATE pull_requests SET head_sha='new-head' WHERE id=${f.pull}`);
		expect(hasFlowGap(await compare(), f.pull)).toBe(false);
		const table = sql.raw(engine === "legacy" ? "flow_executions" : "langflow_executions");
		const key = sql.raw(engine === "legacy" ? "id" : "execution_id");
		await db.execute(sql`UPDATE ${table} SET diff_id=NULL WHERE ${key}=${success.id}`);
		expect(hasFlowGap(await compare(), f.pull)).toBe(true);
		await db.execute(sql`UPDATE ${table} SET diff_id=${other.pull} WHERE ${key}=${success.id}`);
		expect(hasFlowGap(await compare(), other.pull)).toBe(true);
		await db.execute(sql`UPDATE flows SET project_id=NULL WHERE id=${f.flow}`);
		expect(hasFlowGap(await compare(), other.pull)).toBe(false);
		await db.execute(sql`UPDATE flows SET project_id=${f.project} WHERE id=${f.flow}`);
		await db.execute(sql`INSERT INTO ticket_pull_requests
			(ticket_id,pull_request_id,source,actor_id,actor_name,actor_kind,created_at)
			VALUES (${f.ticket},${other.pull},'manual',${actorId},'Policy','human',now())`);
		expect(hasFlowGap(await compare(), other.pull)).toBe(false);
		await db.execute(sql`DELETE FROM flows WHERE id=${f.flow}`);
		expect(hasFlowGap(await compare(), other.pull)).toBe(true);
	});

	test(`${engine} waiting runs, repeated waivers and PRs without tickets keep their exceptions`, async () => {
		const f = await reviewFixture(db);
		await f.insertRun(engine, "waiting");
		expect(hasFlowGap(await compare(), f.pull)).toBe(true);
		for (const head of ["first-head", "second-head"]) {
			await db.execute(sql`INSERT INTO pr_flow_waivers
				(pull_request_id,head_sha,reason,actor_id,actor_name,actor_kind,created_at,updated_at)
				VALUES (${f.pull},${head},'This change needs no flow.',${actorId},'Policy','human',now(),now())`);
		}
		expect(hasFlowGap(await compare(), f.pull)).toBe(false);
		await db.execute(sql`DELETE FROM pr_flow_waivers WHERE pull_request_id=${f.pull}`);
		await db.execute(sql`DELETE FROM ticket_pull_requests WHERE pull_request_id=${f.pull}`);
		await db.execute(sql`UPDATE flows SET project_id=NULL WHERE id=${f.flow}`);
		expect(hasFlowGap(await compare(), f.pull)).toBe(false);
		await db.execute(sql`DELETE FROM flows WHERE id=${f.flow}`);
	});
}

test("projects without flows and an empty selection need no history result", async () => {
	const f = await reviewFixture(db);
	await db.execute(sql`DELETE FROM flows WHERE id=${f.flow}`);
	expect(hasFlowGap(await compare({ project: f.project }), f.pull)).toBe(false);
	await db.execute(sql`DELETE FROM ticket_pull_requests WHERE pull_request_id=${f.pull}`);
	expect(await compare({ project: f.project })).toEqual([]);
});

test("the newest human verdict keeps timestamp and ID precedence", async () => {
	const f = await reviewFixture(db);
	const base = Date.parse("2026-09-30T01:00:00Z");
	const submissionId = monotonicFactory();
	for (const [actor, verdict, time] of [
		["Policy", "approved", base],
		["Policy", "changes_requested", base],
		["Policy", "comment", base + 1],
		["Worker", "approved", base + 2],
	] as const) {
		await db.execute(sql`INSERT INTO review_submissions (id,pr_id,request_id,actor,document,created_at)
			VALUES (${submissionId()},${f.pull},${crypto.randomUUID()},${actor},${{ verdict }},${new Date(time)})`);
	}
	expect((await compare()).find((row) => row.id === f.pull)!.localVerdict).toBe("changes_requested");
});
