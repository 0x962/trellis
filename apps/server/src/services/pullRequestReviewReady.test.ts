import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openPullRequestLocalStateTest } from "./pullRequestLocalState.testSupport.ts";

let h: Awaited<ReturnType<typeof openPullRequestLocalStateTest>>;

beforeAll(async () => {
	h = await openPullRequestLocalStateTest();
}, 60_000);

afterAll(async () => {
	await h.close();
});

test("a failed check takes a ready pull request back, and a pass brings it again", async () => {
	const { ticket, id } = await h.readyPullRequest("Watch the checks", 106);

	await h.db.execute(sql`UPDATE pull_requests SET ci_state = 'fail',
		checks = '[{"name":"test","workflow":"ci","bucket":"fail","link":null}]'::jsonb WHERE id = ${id}`);
	const failed = await h.gapsOf(ticket.id);

	await h.db.execute(sql`UPDATE pull_requests SET ci_state = 'pass',
		checks = '[{"name":"test","workflow":"ci","bucket":"pass","link":null}]'::jsonb WHERE id = ${id}`);

	expect(failed).toEqual(["checks-failed"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
	expect(await h.inboxOf()).toContain(ticket.identifier);
});

test("a new commit keeps the explanation and takes the evidence away", async () => {
	const { ticket, id } = await h.readyPullRequest("Keep the explanation", 107);

	await h.db.execute(sql`UPDATE pull_requests SET head_sha = 'newsha' WHERE id = ${id}`);
	const pushed = await h.gapsOf(ticket.id);

	await h.db.execute(sql`UPDATE pr_evidence_documents SET head_sha = 'newsha' WHERE pull_request_id = ${id}`);

	expect(pushed).toEqual(["evidence"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
});

test("an open finding takes a ready pull request back until somebody resolves it", async () => {
	const { ticket, id } = await h.readyPullRequest("Resolve the finding", 108);
	const thread = ulid();

	await h.db.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at)
		VALUES (${thread}, ${id}, '{"status":"open"}'::jsonb, ${h.at})`);
	const open = await h.gapsOf(ticket.id);

	await h.db.execute(sql`UPDATE review_threads SET document = '{"status":"resolved"}'::jsonb WHERE id = ${thread}`);

	expect(open).toEqual(["findings"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
});

test("a conflict with the base branch takes a ready pull request back", async () => {
	const { ticket, id } = await h.readyPullRequest("Fix the conflict", 109);

	await h.db.execute(sql`UPDATE pull_requests SET mergeable = 'conflicting' WHERE id = ${id}`);
	const conflicting = await h.gapsOf(ticket.id);

	await h.db.execute(sql`UPDATE pull_requests SET mergeable = 'mergeable' WHERE id = ${id}`);

	expect(conflicting).toEqual(["conflict"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
});

test("a flow of the project asks for a run of the current commit", async () => {
	const { ticket, id } = await h.readyPullRequest("Run the flow", 110);

	await h.db.execute(sql`DELETE FROM flows`);
	await h.db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, ${h.root}, 'review', 'Review', 'Read the diff.', ${h.at}, ${h.at})`);
	const noRun = await h.gapsOf(ticket.id);

	await h.db.execute(sql`INSERT INTO pr_flow_waivers
		(pull_request_id, head_sha, reason, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, 'head110', 'No flow reads a migration.', 'claude-code', 'agent', ${h.at}, ${h.at})`);

	expect(noRun).toEqual(["flow-run"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
});

test("a flow of another project asks this pull request for nothing", async () => {
	await h.db.execute(sql`DELETE FROM flows`);
	const other = ulid();
	await h.db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${other}, 'OTH', 'oth', 'Other', ${h.at}, ${h.at})`);
	await h.db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, ${other}, 'other-review', 'Other review', 'Read the diff.', ${h.at}, ${h.at})`);

	const { ticket } = await h.readyPullRequest("Ignore another project's flow", 113);

	expect(await h.gapsOf(ticket.id)).toEqual([]);
});

test("a flow of every project asks this pull request for a run", async () => {
	await h.db.execute(sql`DELETE FROM flows`);
	await h.db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, NULL, 'every-project', 'Every project', 'Read the diff.', ${h.at}, ${h.at})`);

	const { ticket } = await h.readyPullRequest("Run the flow of every project", 114);

	expect(await h.gapsOf(ticket.id)).toEqual(["flow-run"]);
});
