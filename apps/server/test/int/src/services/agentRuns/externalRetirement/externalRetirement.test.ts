import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { prepareManager, prepareReconcile, reconcile } from "../../../../../../src/services/agentManager.ts";
import { retireExternal } from "../../../../../../src/services/agentRuns/externalRetirement/externalRetirement.ts";
import { reserve } from "../../../../../../src/services/agentRuns/reserve.ts";
import type { AgentsCtx } from "../../../../../../src/services/agentSessions.ts";
import { prepareBuilder } from "../../../../../../src/services/agentStart.ts";
import { register, stop } from "../../../../../../src/services/agents.ts";
import { wake } from "../../../../../../src/services/agentWake.ts";
import { inventory } from "../../../../../../src/services/nativeMigration/inventory.ts";
import { seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let project: string;
const locator = {
	runtime: "superset" as const,
	workspaceId: "old-workspace",
	terminalId: "old-terminal",
	sessionId: "old-session",
	externalProcessStopped: true as const,
};
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	project = await h.read((tx) =>
		seedRoot(tx, "RET", {
			manager_config: { personaId: null, concurrency: 3, directory: "", ade: "superset", supersetHostId: "old-host" },
		}),
	);
	await h.read((tx) =>
		seedStatus(tx, { projectId: project, name: "Todo", category: "todo", position: 0, isDefault: true }),
	);
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('manager-persona','Manager','manager','Manage',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,terminal_id,session_id,created_at,updated_at) VALUES ('persona','Wren','manager-persona','Manager','manager','Manage',${project},'RET','running','superset','old-workspace','old-terminal','old-session',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_sessions (id,project_id,role,runner,state,name,title,workspace_id,terminal_id,claude_session_id,created_at,updated_at) VALUES ('legacy',${project},'manager','superset','waiting','Robin','RET manager','old-workspace','old-terminal','legacy-session',now(),now())`,
		);
	});
	await h.rebuild();
});
const retire = (source: "legacy" | "persona") =>
	h.run((ctx, tx) =>
		retireExternal(ctx, tx, {
			...locator,
			source,
			id: source,
			sessionId: source === "legacy" ? "legacy-session" : "old-session",
		}),
	);
test("retirement retains both external locators and removes both migration ownership blockers", async () => {
	expect((await h.run((ctx, tx) => inventory(ctx, tx, { project }))).blockers).toHaveLength(2);
	const persona = await retire("persona");
	await retire("legacy");
	expect(persona).toMatchObject({
		hostId: "old-host",
		sessionId: "old-session",
		actorName: "dana",
		runtime: "superset",
		workspaceId: "old-workspace",
		terminalId: "old-terminal",
	});
	expect(
		await h.one(sql`SELECT state,runtime,workspace_id,terminal_id,session_id,error FROM agent_runs WHERE id='persona'`),
	).toMatchObject({
		state: "failed",
		runtime: "superset",
		workspace_id: "old-workspace",
		terminal_id: "old-terminal",
		session_id: "old-session",
		error: expect.stringContaining("retired"),
	});
	expect((await h.run((ctx, tx) => inventory(ctx, tx, { project }))).blockers).toEqual([]);
	const audit = await h.rows(
		sql`SELECT actor_kind,meta FROM activity WHERE action='agent.external-retired' ORDER BY id`,
	);
	expect(audit).toHaveLength(2);
	expect(audit[0]).toMatchObject({
		actor_kind: "human",
		meta: { retirement: persona, previousState: "running", externalProcessStopped: true },
	});
});
test("retirement is idempotent but refuses changed locators and non-human actors", async () => {
	const input = { ...locator, source: "persona" as const, id: "persona" };
	await expect(
		h.run((ctx, tx) => retireExternal(ctx, tx, input), { actor: { kind: "agent", name: "worker" } }),
	).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("person") }] } });
	await expect(h.run((ctx, tx) => retireExternal(ctx, tx, { ...input, terminalId: "replacement" }))).rejects.toThrow();
	const [first, second] = await Promise.all([retire("persona"), retire("persona")]);
	expect(first).toEqual(second);
	expect(await h.rows(sql`SELECT id FROM activity WHERE action='agent.external-retired'`)).toHaveLength(1);
	await expect(h.run((ctx, tx) => retireExternal(ctx, tx, { ...input, workspaceId: null }))).rejects.toThrow();
});
test("a runtime change creates a distinct native manager row and conversation", async () => {
	await retire("persona");
	await retire("legacy");
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"ade":"native","directory":"/tmp/native","dispatchPaused":true}'::jsonb WHERE id=${project}`,
		),
	);
	const result = await h.run((ctx, tx) => reserve(ctx, tx, { project, personaId: "manager-persona" }));
	expect(result.run.id).not.toBe("persona");
	expect(result.run.sessionId).not.toBe("old-session");
	expect(result.run.runtime).toBe("native");
	expect(
		await h.one(sql`SELECT runtime,terminal_id,session_id,state FROM agent_runs WHERE id='persona'`),
	).toMatchObject({ runtime: "superset", terminal_id: "old-terminal", session_id: "old-session", state: "failed" });
});
test("an interrupted external manager cannot be replaced without retirement", async () => {
	await retire("legacy");
	await h.read(async (tx) => {
		await tx.execute(sql`UPDATE agent_runs SET state='interrupted' WHERE id='persona'`);
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"ade":"native","directory":"/tmp/native"}'::jsonb WHERE id=${project}`,
		);
	});
	await expect(h.run((ctx, tx) => reserve(ctx, tx, { project, personaId: "manager-persona" }))).rejects.toThrow();
	expect(await h.rows(sql`SELECT id FROM agent_runs`)).toHaveLength(1);
});

test("legacy missing terminals remain owned and cannot trigger an automatic manager replacement", async () => {
	await h.read((tx) =>
		tx.execute(
			sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents',${JSON.stringify({ runner: "superset", enabled: true, projects: [{ projectId: project, enabled: true, supersetHostId: "old-host", supersetProjectId: "old-project" }] })}::jsonb,now())`,
		),
	);
	let launches = 0;
	const ctx = {
		...h.ctx(() => {}),
		newTx: h.read,
		runner: {
			terminals: async () => [],
			ensureManager: async () => {
				launches++;
				throw new Error("Unexpected launch");
			},
		},
	} as unknown as AgentsCtx;
	const plan = await prepareReconcile(ctx);
	await h.run((core, tx) => reconcile({ ...ctx, ...core }, tx, plan));
	expect(await h.one(sql`SELECT state,error FROM agent_sessions WHERE id='legacy'`)).toMatchObject({
		state: "waiting",
		error: expect.stringContaining("unavailable"),
	});
	await expect(prepareManager(ctx, { project })).rejects.toThrow();
	expect(launches).toBe(0);
});
test("an old legacy observation cannot overwrite a retirement", async () => {
	const ctx = {
		...h.ctx(() => {}),
		newTx: h.read,
		runner: { terminals: async () => [{ terminalId: "old-terminal", exited: true }] },
	} as unknown as AgentsCtx;
	const plan = await prepareReconcile(ctx);
	await retire("legacy");
	await h.run((core, tx) => reconcile({ ...ctx, ...core }, tx, plan));
	expect((await h.one(sql`SELECT state FROM agent_sessions WHERE id='legacy'`)).state).toBe("failed");
});

test("retirement refuses a changed conversation and a launch still in progress", async () => {
	await expect(
		h.run((ctx, tx) =>
			retireExternal(ctx, tx, { ...locator, source: "persona", id: "persona", sessionId: "replacement-session" }),
		),
	).rejects.toThrow();
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET state='starting' WHERE id='persona'`));
	await expect(retire("persona")).rejects.toThrow();
	expect(await h.rows(sql`SELECT id FROM activity WHERE action='agent.external-retired'`)).toHaveLength(0);
});
test("manager retirement pauses project dispatch and legacy automation atomically", async () => {
	await h.read((tx) =>
		tx.execute(
			sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents',${JSON.stringify({ runner: "superset", enabled: true, projects: [{ projectId: project, enabled: true, supersetHostId: "legacy-host", supersetProjectId: "old-project" }] })}::jsonb,now())`,
		),
	);
	const result = await retire("legacy");
	expect(result.hostId).toBe("legacy-host");
	expect(await h.one(sql`SELECT manager_config FROM projects WHERE id=${project}`)).toMatchObject({
		manager_config: { dispatchPaused: true, supersetHostId: "old-host" },
	});
	expect(await h.one(sql`SELECT value FROM settings WHERE key='agents'`)).toMatchObject({
		value: {
			enabled: true,
			projects: [
				{ projectId: project, enabled: false, supersetHostId: "legacy-host", supersetProjectId: "old-project" },
			],
		},
	});
});

test("late legacy wake, stop, and registration cannot revive or relabel a retired assignment", async () => {
	await retire("legacy");
	await h.run((core, tx) => wake(core as AgentsCtx, tx, { kind: "woken", id: "legacy", terminalId: "replacement" }));
	await h.run((core, tx) => stop(core as AgentsCtx, tx, { id: "legacy", changed: true, removed: null }));
	await expect(
		h.run((core, tx) =>
			register(core, tx, {
				role: "manager",
				project,
				workspaceId: "old-workspace",
				terminalId: "old-terminal",
				claudeSessionId: "replacement",
			}),
		),
	).rejects.toThrow();
	expect(
		await h.one(sql`SELECT state,terminal_id,claude_session_id FROM agent_sessions WHERE id='legacy'`),
	).toMatchObject({ state: "failed", terminal_id: "old-terminal", claude_session_id: "legacy-session" });
});
test("a stopped external manager also gets a distinct row when execution moves to native", async () => {
	await retire("legacy");
	await h.read(async (tx) => {
		await tx.execute(sql`UPDATE agent_runs SET state='stopped' WHERE id='persona'`);
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"ade":"native","directory":"/tmp/native"}'::jsonb WHERE id=${project}`,
		);
	});
	const result = await h.run((core, tx) => reserve(core, tx, { project, personaId: "manager-persona" }));
	expect(result.run.id).not.toBe("persona");
	expect(result.run.sessionId).not.toBe("old-session");
});

test("a retired legacy builder without a workspace keeps its historical row", async () => {
	const status = await h.one<{ id: string }>(sql`SELECT id FROM statuses WHERE project_id=${project}`);
	const ticket = await h.read((tx) => seedTicket(tx, { projectId: project, rootId: project, statusId: status.id }));
	await h.read(async (tx) => {
		await tx.execute(
			sql`UPDATE agent_sessions SET role='builder',ticket_id=${ticket},state='failed',workspace_id=NULL,terminal_id=NULL WHERE id='legacy'`,
		);
		await tx.execute(
			sql`INSERT INTO settings (key,value,updated_at) VALUES ('agents',${JSON.stringify({ runner: "superset", enabled: true, projects: [{ projectId: project, enabled: true, supersetHostId: null, supersetProjectId: "old-project", baseBranch: "main", maxConcurrent: 3 }] })}::jsonb,now())`,
		);
	});
	await h.run((core, tx) =>
		retireExternal(core, tx, {
			source: "legacy",
			id: "legacy",
			runtime: "superset",
			workspaceId: null,
			terminalId: null,
			sessionId: "legacy-session",
			externalProcessStopped: true,
		}),
	);
	const ctx = {
		...h.ctx(() => {}),
		newTx: h.read,
		runner: {
			startBuilder: async () => ({
				workspaceId: "new-workspace",
				terminalId: "new-terminal",
				openUrl: "superset://new",
			}),
		},
	} as unknown as AgentsCtx;
	const plan = await prepareBuilder(ctx, { ticket });
	expect("id" in plan && plan.id).not.toBe("legacy");
	expect(await h.one(sql`SELECT state,workspace_id,error FROM agent_sessions WHERE id='legacy'`)).toMatchObject({
		state: "failed",
		workspace_id: null,
		error: expect.stringContaining("retired"),
	});
});
