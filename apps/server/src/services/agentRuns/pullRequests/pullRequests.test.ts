import { afterAll, beforeAll, expect, test } from "bun:test";
import { AgentRunPullRequestSchema, AgentRunPullRequestsInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../../db/epicCancellation/fixture.ts";
import { pullRequests } from "./pullRequests.ts";

let h: Awaited<ReturnType<typeof fixture>>;
const runId = ulid();
const unrelated = ulid();
const otherProject = ulid();
const pullId = ulid();
const humanPullId = ulid();
beforeAll(async () => {
	h = await fixture();
	const epic = await h.create("Outputs");
	const first = await h.ticket(epic.id);
	const second = await h.ticket(epic.id);
	const at = h.ctx().now;
	await h.db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${otherProject}, 'OUT', 'out', 'Other', ${at}, ${at})`);
	for (const id of [runId, unrelated]) {
		await h.db.execute(sql`INSERT INTO agent_runs
			(id, name, kind, instruction, project_id, project_key, created_at, updated_at)
			VALUES (${id}, 'same display name', 'session', 'Build it.', ${h.projectId}, 'CAN', ${at}, ${at})`);
	}
	for (const kind of ["agent", "human"]) {
		await h.db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES (${runId}, ${kind}, ${at}, ${at})`);
	}
	for (const [index, id] of [pullId, humanPullId].entries()) {
		await h.db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
			VALUES (${id}, 'owner', 'repo', ${index + 1}, ${`https://github.com/owner/repo/pull/${index + 1}`}, 'open', ${at}, ${at})`);
	}
	for (const [ticketId, id, kind] of [
		[first.id, pullId, "agent"],
		[second.id, pullId, "agent"],
		[first.id, humanPullId, "human"],
	]) {
		await h.db.execute(sql`INSERT INTO ticket_pull_requests
			(ticket_id, pull_request_id, source, actor_id, actor_name, actor_kind, created_at)
			VALUES (${ticketId}, ${id}, 'manual',
				(SELECT id FROM actors WHERE name=${runId} AND kind=${kind}), ${runId}, ${kind}, ${at})`);
	}
	await h.run((tx) => h.cache.rebuild(tx));
});
afterAll(async () => h.db.$client.close());

const read = (ids: string[], project?: string) => h.run((tx) => pullRequests(h.ctx(null), tx, { ids, project }));

test("exact agent actors produce one PR edge across duplicate ticket links", async () => {
	const result = await read([runId, unrelated]);
	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({ runId, pullRequest: { id: pullId } });
	expect(AgentRunPullRequestSchema.safeParse(result[0]).success).toBe(true);
});

test("run and project filters exclude unrelated records", async () => {
	expect(await read([unrelated])).toEqual([]);
	expect(await read([])).toEqual([]);
	expect(await read([ulid()])).toEqual([]);
	expect(await read([runId], "OUT")).toEqual([]);
	expect(await read([runId], "CAN")).toHaveLength(1);
	await expect(read([runId], "MISSING")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("archived project outputs remain readable", async () => {
	await h.db.execute(sql`UPDATE projects SET archived_at=${h.ctx().now} WHERE id=${h.projectId}`);
	await h.run((tx) => h.cache.rebuild(tx));
	expect(await read([runId], "CAN")).toHaveLength(1);
});

test("the input contract bounds each request", () => {
	expect(AgentRunPullRequestsInputSchema.safeParse({ ids: Array.from({ length: 200 }, () => ulid()) }).success).toBe(
		true,
	);
	expect(AgentRunPullRequestsInputSchema.safeParse({ ids: Array.from({ length: 201 }, () => ulid()) }).success).toBe(
		false,
	);
});
