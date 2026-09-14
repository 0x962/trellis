import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let id: string;
let attemptId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(async () => {
	await h.read(assertStatusInvariant);
	rmSync(home, { recursive: true, force: true });
});
beforeEach(async () => {
	await h.reset();
	home = mkdtempSync("/tmp/native-start-fence-");
	id = ulid();
	attemptId = randomUUID();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "FENCE");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,state,terminal_id,session_id,created_at,updated_at) VALUES (${id},'Manager','native','Manager','manager','Wait',${project},'FENCE','starting',${attemptId},${randomUUID()},now(),now())`,
		);
	});
});
test.each(["stopped", "replaced"])("a %s start cannot commit its workspace or launch", async (kind) => {
	const run = await h.read((tx) => getRun(tx, id));
	const ctx = {
		...h.ctx((event) => h.flushed.push(event)),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof startNative>[0];
	const config = ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 1,
		directory: "/tmp",
		ade: "native",
		trustedDirectory: true,
	});
	const replacement = kind === "replaced" ? randomUUID() : attemptId;
	await startNative(
		ctx,
		{
			run,
			config,
			resume: false,
			context: "Fixture",
			attempt: { id: attemptId, generation: 1, token: "fixture-token" },
		},
		{
			workspace: async () => {
				await h.rows(
					sql`UPDATE agent_runs SET terminal_id=${replacement},state=${kind === "stopped" ? "stopped" : "starting"} WHERE id=${id}`,
				);
				return "/tmp/retired-workspace";
			},
		},
	);
	const after = await h.read((tx) => getRun(tx, id));
	expect(after.terminalId).toBe(replacement);
	expect(after.workspaceId).toBeNull();
	expect(after.state).toBe(kind === "stopped" ? "stopped" : "starting");
	expect(existsSync(join(home, "runtime"))).toBe(false);
});
