import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { apply } from "../../../../../src/services/nativeMigration/apply.ts";
import { inventory } from "../../../../../src/services/nativeMigration/inventory.ts";
import { rollback } from "../../../../../src/services/nativeMigration/rollback.ts";
import { seedChild, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
const requestId = "b932c824-3f5a-4528-8170-ece442342777";
const original = { personaId: null, concurrency: 2, directory: "/tmp/old", enabled: true, ade: "superset" };
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	project = await h.read((tx) => seedRoot(tx, "MIG", { manager_config: original }));
	await h.read((tx) =>
		seedStatus(tx, { projectId: project, name: "Todo", category: "todo", position: 0, isDefault: true }),
	);
	await h.rebuild();
});
const preview = () => h.run((ctx, tx) => inventory(ctx, tx, { project }));
const migrate = async () => {
	const before = await preview();
	return h.run((ctx, tx) =>
		apply(ctx, tx, { project, expectedVersion: before.version, directory: "/tmp/native", requestId }),
	);
};
test("apply starts paused and untrusted; rollback restores the exact original config", async () => {
	const result = await migrate();
	const current = await preview();
	expect(current.managerConfig).toMatchObject({
		ade: "native",
		dispatchPaused: true,
		trustedDirectory: false,
		directory: "/tmp/native",
	});
	const restored = await h.run((ctx, tx) =>
		rollback(ctx, tx, { migrationId: result.id, expectedVersion: current.version }),
	);
	expect(restored.rolledBackAt).not.toBeNull();
	expect((await preview()).originalConfig).toEqual(original);
});
test("apply rejects a stale inventory and an agent actor", async () => {
	const before = await preview();
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE projects SET manager_config=manager_config || '{"concurrency":3}'::jsonb WHERE id=${project}`,
		),
	);
	const input = { project, expectedVersion: before.version, directory: "/tmp/native", requestId };
	await expect(h.run((ctx, tx) => apply(ctx, tx, input))).rejects.toMatchObject({
		data: { issues: [{ message: expect.stringContaining("inventory") }] },
	});
	await expect(
		h.run((ctx, tx) => apply(ctx, tx, input), { actor: { kind: "agent", name: "worker" } }),
	).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("person") }] } });
});
test("concurrent apply replay creates one migration and rejects changed request bytes", async () => {
	const before = await preview();
	const input = { project, expectedVersion: before.version, directory: "/tmp/native", requestId };
	const [first, second] = await Promise.all([
		h.run((ctx, tx) => apply(ctx, tx, input)),
		h.run((ctx, tx) => apply(ctx, tx, input)),
	]);
	expect(first.id).toBe(second.id);
	expect((await preview()).migrations).toHaveLength(1);
	await expect(h.run((ctx, tx) => apply(ctx, tx, { ...input, directory: "/tmp/other" }))).rejects.toMatchObject({
		data: { issues: [{ message: expect.stringContaining(first.id) }] },
	});
});

test("descendant agents block apply with their IDs and retain both conversation references", async () => {
	const child = await h.read((tx) => seedChild(tx, project, project, "child"));
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO agent_sessions (id,project_id,role,runner,state,name,title,workspace_id,terminal_id,claude_session_id,created_at,updated_at) VALUES ('legacy',${child},'manager','superset','waiting','Fixture','Fixture','external-workspace','legacy-terminal','legacy-conversation',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,session_id,created_at,updated_at) VALUES ('persona','Fixture','Fixture','builder','',${child},'MIG.child','interrupted','superset','persona-workspace','persona-conversation',now(),now())`,
		);
	});
	await h.rebuild();
	const before = await preview();
	expect(before.agents).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: "legacy",
				conversationId: "legacy-conversation",
				workspaceId: "external-workspace",
			}),
			expect.objectContaining({ id: "persona", conversationId: "persona-conversation" }),
		]),
	);
	expect(before.blockers.map((item) => item.id)).toEqual(["legacy", "persona"]);
	await expect(migrate()).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining(child) }] } });
	await h.read((tx) => tx.execute(sql`UPDATE agent_sessions SET state='stopped' WHERE id='legacy'`));
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET state='stopped' WHERE id='persona'`));
	const childConfig = (await preview()).projects.find((item) => item.id === child)!.config;
	await migrate();
	const after = await preview();
	expect(after.projects.find((item) => item.id === child)!.config).toEqual(childConfig);
	expect(after.agents.map((item) => item.conversationId)).toEqual(["legacy-conversation", "persona-conversation"]);
});

test("unassigned events stay queued while an assigned unknown delivery blocks apply", async () => {
	await h.read((tx) =>
		tx.execute(
			sql`INSERT INTO manager_dispatches (id,project_id,events,due_at,created_at,updated_at) VALUES ('queued',${project},'[{"ticketId":"fixture","summary":"Pending work"}]'::jsonb,now(),now(),now())`,
		),
	);
	const before = await preview();
	expect(before.blockers).toEqual([]);
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE manager_dispatches SET state='unknown',run_id='old-manager',terminal_id='old-terminal' WHERE id='queued'`,
		),
	);
	expect((await preview()).blockers).toContainEqual(expect.objectContaining({ id: "queued", kind: "delivery" }));
	await expect(migrate()).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("queued") }] } });
	await h.read((tx) =>
		tx.execute(sql`UPDATE manager_dispatches SET state='pending',run_id=NULL,terminal_id=NULL WHERE id='queued'`),
	);
	await migrate();
	expect(
		await h.one<{ state: string; events: unknown[]; run_id: string | null }>(
			sql`SELECT state,events,run_id FROM manager_dispatches WHERE id='queued'`,
		),
	).toEqual({
		state: "pending",
		events: [{ ticketId: "fixture", summary: "Pending work" }],
		run_id: null,
	});
});

test("rollback preserves new files and evidence, then replay leaves later config changes intact", async () => {
	const folder = await mkdtemp(join(tmpdir(), "trellis-migration-"));
	const result = await migrate();
	await writeFile(join(folder, "result.ts"), "export const result = 42;\n");
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,terminal_id,session_id,created_at,updated_at) VALUES ('new-worker','Fixture','Fixture','builder','',${project},'MIG','running','native',${folder},'new-attempt','new-conversation',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO evidence_artifacts (id,run_id,attempt_id,path,document,created_at) VALUES ('artifact','new-worker','new-attempt','result.ts','{"sha256":"retained"}'::jsonb,now())`,
		);
	});
	const blocked = await preview();
	await expect(
		h.run((ctx, tx) => rollback(ctx, tx, { migrationId: result.id, expectedVersion: blocked.version })),
	).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("new-worker") }] } });
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET state='stopped' WHERE id='new-worker'`));
	const before = await preview();
	const input = { migrationId: result.id, expectedVersion: before.version };
	const [first, second] = await Promise.all([
		h.run((ctx, tx) => rollback(ctx, tx, input)),
		h.run((ctx, tx) => rollback(ctx, tx, input)),
	]);
	expect(first).toEqual(second);
	expect(await readFile(join(folder, "result.ts"), "utf8")).toBe("export const result = 42;\n");
	expect(
		await h.one<{ document: { sha256: string } }>(sql`SELECT document FROM evidence_artifacts WHERE id='artifact'`),
	).toEqual({
		document: { sha256: "retained" },
	});
	expect((await preview()).agents[0]).toMatchObject({ workspaceId: folder, conversationId: "new-conversation" });
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE projects SET manager_config=manager_config || '{"concurrency":4}'::jsonb WHERE id=${project}`,
		),
	);
	await h.run((ctx, tx) => rollback(ctx, tx, input));
	expect((await preview()).managerConfig.concurrency).toBe(4);
	await rm(folder, { recursive: true });
});

test("a native check with an unresolved process blocks rollback even after its agent stops", async () => {
	const result = await migrate();
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,created_at,updated_at) VALUES ('check-worker','Fixture','Fixture','builder','',${project},'MIG','stopped','native',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO evidence_checks (id,run_id,attempt_id,document,created_at) VALUES ('unresolved-check','check-worker','check-attempt','{"state":"unknown"}'::jsonb,now())`,
		);
	});
	const before = await preview();
	await expect(
		h.run((ctx, tx) => rollback(ctx, tx, { migrationId: result.id, expectedVersion: before.version })),
	).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("unresolved-check") }] } });
});

test("review delivery remains a blocker after its recipient reads it", async () => {
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,created_at,updated_at) VALUES ('review-worker','Fixture','Fixture','builder','',${project},'MIG','stopped','superset',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO pull_requests (id,owner,repo,number,url,state,created_at,updated_at) VALUES ('pr','fixture','fixture',1,'https://example.test/pr/1','open',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO review_submissions (id,pr_id,request_id,actor,document,created_at) VALUES ('review','pr','request','human:dana','{}'::jsonb,now())`,
		);
		await tx.execute(
			sql`INSERT INTO review_deliveries (id,review_id,run_id,state,read_at) VALUES ('review-delivery','review','review-worker','pending',now())`,
		);
	});
	const before = await preview();
	expect(before.blockers).toContainEqual(expect.objectContaining({ id: "review-delivery", kind: "delivery" }));
	await expect(migrate()).rejects.toMatchObject({
		data: { issues: [{ message: expect.stringContaining("review-delivery") }] },
	});
});

test("waiting flows and unfinished stop requests block a project migration", async () => {
	await h.read(async (tx) => {
		const status = (await tx.execute(sql`SELECT id FROM statuses WHERE project_id=${project}`)).rows[0]!.id as string;
		const ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		await tx.execute(
			sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,default_persona_id,actor_kind,actor_name,request_id,request,doc,personas,state,revision,created_at,updated_at) VALUES ('flow','flow-definition',${ticket},${project},'persona','human','dana','request','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{"status":"waiting","steps":[]}'::jsonb,1,now(),now())`,
		);
	});
	expect((await preview()).blockers).toContainEqual(expect.objectContaining({ id: "flow", kind: "flow" }));
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE flow_executions SET state='{"status":"canceled","steps":[{"needsStop":true}]}'::jsonb WHERE id='flow'`,
		),
	);
	await expect(migrate()).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("flow") }] } });
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE flow_executions SET state='{"status":"canceled","steps":[{"needsStop":false}]}'::jsonb WHERE id='flow'`,
		),
	);
	await migrate();
	expect((await preview()).managerConfig.ade).toBe("native");
});
