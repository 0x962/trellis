import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "KEEP");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('persona','Manager','manager','Manage.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_id,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,workspace_id,closed_at,created_at,updated_at) VALUES ('manager','Manager','native','persona','Manager','manager','Manage.',${project},'KEEP','previous','conversation','/tmp/manager',now(),now(),now())`,
		);
	});
	await h.rebuild();
});
afterEach(() => h.read(assertStatusInvariant));

const agent = { kind: "agent" as const, name: "codex" };
const input = { project: "KEEP", personaId: "persona" };

test("an agent cannot reset an existing manager conversation after stop", async () => {
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { ...input, newSession: true }, ["previous"]), { actor: agent }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["newSession"], message: expect.stringContaining("Resume") }] },
	});
	const retained = await h.one<{ terminal_id: string; session_id: string; workspace_id: string }>(
		sql`SELECT terminal_id, session_id, workspace_id FROM agent_runs WHERE id='manager'`,
	);
	expect(retained).toEqual({
		terminal_id: "previous",
		session_id: "conversation",
		workspace_id: "/tmp/manager",
	});
	expect((await h.one(sql`SELECT count(*)::int AS count FROM agent_execution_attempts`)).count).toBe(0);
});

test("an agent can resume a stopped manager with a changed persona instruction", async () => {
	await h.rows(sql`UPDATE personas SET instruction='Updated manager rules.' WHERE id='persona'`);
	const result = await h.run((ctx, tx) => reserve(ctx, tx, input, ["previous"]), { actor: agent });
	expect(result).toMatchObject({
		replay: false,
		resume: true,
		previousAttemptId: "previous",
		run: { sessionId: "conversation", instruction: "Updated manager rules." },
	});
});

test("a person can explicitly reset a stopped manager conversation", async () => {
	const result = await h.run((ctx, tx) => reserve(ctx, tx, { ...input, newSession: true }, ["previous"]));
	expect(result).toMatchObject({ replay: false, resume: false, run: { sessionId: null } });
});

test("an agent can create the first manager conversation", async () => {
	await h.rows(sql`DELETE FROM agent_runs WHERE id='manager'`);
	const result = await h.run((ctx, tx) => reserve(ctx, tx, input), { actor: agent });
	expect(result).toMatchObject({ replay: false, resume: false, previousAttemptId: null });
});
