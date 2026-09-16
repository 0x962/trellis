import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { collectBuilderStarts } from "../../../../../../src/services/manager/builderStarts/collect.ts";
import { seedActors, seedChild, seedRoot, seedStatuses } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticket: string;
const personaId = ulid();
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "COLLECT", {
			manager_config: { personaId: null, directory: "", builder: { personaId, harness: { preset: "claude" } } },
		});
		const statuses = await seedStatuses(tx, projectId);
		ticket = await seedTicket(tx, { projectId, rootId: projectId, statusId: statuses.started });
	});
	await h.rebuild();
});
const collect = () => h.run((ctx, tx) => collectBuilderStarts(ctx, tx));

test("collection queues an existing child ticket from inherited defaults once", async () => {
	const child = await h.read((tx) => seedChild(tx, projectId, projectId, "child"));
	await h.rows(sql`UPDATE tickets SET project_id=${child} WHERE id=${ticket}`);
	await h.rebuild();
	await collect();
	await collect();
	expect(await h.rows(sql`SELECT ticket_id FROM builder_start_requests`)).toEqual([{ ticket_id: ticket }]);
});

test.each(["disabled", "archived", "nativePaused"])("collection skips %s projects", async (state) => {
	if (state === "disabled")
		await h.rows(sql`UPDATE projects SET manager_config=manager_config - 'builder' WHERE id=${projectId}`);
	if (state === "archived") await h.rows(sql`UPDATE projects SET archived_at=now() WHERE id=${projectId}`);
	if (state === "nativePaused")
		await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',now())`);
	await collect();
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
});

test("a failed request prevents automatic retry on later controller ticks", async () => {
	const id = ulid();
	await h.rows(
		sql`INSERT INTO builder_start_requests (id,ticket_id,state,error,created_at) VALUES (${id},${ticket},'failed','Select a working harness',now())`,
	);
	await collect();
	expect(await h.rows(sql`SELECT id,state FROM builder_start_requests`)).toEqual([{ id, state: "failed" }]);
});

test("an active flow owns the ticket before its first worker starts", async () => {
	await h.rows(
		sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,default_persona_id,actor_kind,actor_name,request_id,request,doc,personas,state,revision,created_at,updated_at) VALUES (${ulid()},${ulid()},${ticket},${projectId},${personaId},'human','dana','flow-request','{}','{}','{}','{"status":"running"}',1,now(),now())`,
	);
	await collect();
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
});

test("collection retries a failed start after two minutes", async () => {
	const now = h.ctx(() => {}).now;
	await h.rows(
		sql`INSERT INTO builder_start_requests (id,ticket_id,state,error,created_at) VALUES (${ulid()},${ticket},'failed','Harness unavailable',${new Date(now.getTime() - 121_000)})`,
	);
	await collect();
	expect(await h.rows(sql`SELECT id FROM builder_start_requests WHERE state='pending'`)).toHaveLength(1);
});

test("collection does not replace a stopped builder with a saved conversation", async () => {
	const { reserve } = await import("../../../../../../src/services/agentRuns/reserve.ts");
	await h.rows(
		sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
	);
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	await h.rows(
		sql`UPDATE agent_runs SET closed_at=now(),session_id='saved',workspace_id='/saved/work' WHERE id=${run.run.id}`,
	);
	await collect();
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
});

test("a paused manager does not prevent collection of started tickets", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${projectId}`,
	);
	await collect();
	expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toHaveLength(1);
});

test.each(["exited", "unknown"])(
	"only a confirmed exited builder without a saved conversation gets replacement: %s",
	async (status) => {
		const { reserve } = await import("../../../../../../src/services/agentRuns/reserve.ts");
		await h.rows(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
		);
		const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
		const sessions = [{ id: run.run.terminalId, status, agent: null }] as RuntimeProcessStatus[];
		await h.run((ctx, tx) => collectBuilderStarts(ctx, tx, sessions));
		const row = await h.one<{ closed_at: unknown }>(sql`SELECT closed_at FROM agent_runs WHERE id=${run.run.id}`);
		if (status === "unknown") {
			expect(row.closed_at).toBeNull();
			expect(await h.rows(sql`SELECT id FROM builder_start_requests`)).toEqual([]);
		} else {
			expect(row.closed_at).not.toBeNull();
			expect(await h.rows(sql`SELECT state FROM builder_start_requests`)).toEqual([{ state: "failed" }]);
			await h.run((ctx, tx) => collectBuilderStarts(ctx, tx, sessions), {
				now: new Date(h.ctx(() => {}).now.getTime() + 121_000),
			});
			expect(await h.rows(sql`SELECT id FROM builder_start_requests WHERE state='pending'`)).toHaveLength(1);
		}
	},
);
