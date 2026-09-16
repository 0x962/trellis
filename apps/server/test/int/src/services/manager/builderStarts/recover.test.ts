import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ensureNativeRuntime } from "../../../../../../src/agents/native/connection.ts";
import { reserve } from "../../../../../../src/services/agentRuns/reserve.ts";
import { recoverBuilderStart } from "../../../../../../src/services/manager/builderStarts/recover.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let home: string;
let runId: string;
let requestId: string;
let terminalId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true, force: true });
});
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "trellis-builder-recovery-"));
	const personaId = ulid();
	const ticket = await h.read(async (tx) => {
		await seedActors(tx);
		const projectId = await seedRoot(tx, "RECOVER");
		const statuses = await seedStatuses(tx, projectId);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
		);
		return seedTicket(tx, { projectId, rootId: projectId, statusId: statuses.started });
	});
	await h.rebuild();
	const claim = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	if (claim.replay) throw new Error("Expected a new reservation");
	runId = claim.run.id;
	terminalId = claim.attempt.id;
	requestId = ulid();
	await h.rows(
		sql`INSERT INTO builder_start_requests (id,ticket_id,state,run_id,created_at) VALUES (${requestId},${ticket},'launching',${runId},now())`,
	);
	const directory = join(home, "harness-attempts", terminalId);
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "launch.json"),
		JSON.stringify({ harness: "custom", spec: { id: terminalId, command: "fixture", args: [], cwd: home } }),
	);
});

test("a recovered exited builder stays open for heartbeat recovery", async () => {
	const ctx = { home, newTx: h.read, now: () => new Date() } as Parameters<typeof recoverBuilderStart>[0];
	await recoverBuilderStart(
		ctx,
		{ id: requestId, run_id: runId },
		async () =>
			({
				start: async () => {},
				inspect: async () => ({
					status: "exited",
					error: null,
					agent: { sessionId: "saved-conversation", error: null },
				}),
			}) as unknown as Awaited<ReturnType<typeof ensureNativeRuntime>>,
	);
	const run = await h.one<{ closed_at: unknown; session_id: string }>(
		sql`SELECT closed_at,session_id FROM agent_runs WHERE id=${runId}`,
	);
	expect(run.closed_at).toBeNull();
	expect(run.session_id).toBe("saved-conversation");
});

test("a manual stop before descriptor recovery prevents another launch", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${runId}`);
	let launched = false;
	const ctx = { home, newTx: h.read, now: () => new Date() } as Parameters<typeof recoverBuilderStart>[0];
	await recoverBuilderStart(ctx, { id: requestId, run_id: runId }, async () => {
		launched = true;
		throw new Error("Unexpected launch");
	});
	expect(launched).toBe(false);
	expect((await h.one(sql`SELECT state FROM builder_start_requests WHERE id=${requestId}`)).state).toBe("canceled");
});
