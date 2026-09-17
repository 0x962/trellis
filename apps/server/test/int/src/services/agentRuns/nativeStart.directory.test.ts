import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
beforeEach(async () => {
	await h.reset();
	home = mkdtempSync("/tmp/native-start-directory-");
	id = ulid();
	attemptId = randomUUID();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "DIRECTORY");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at) VALUES (${id},'Manager','native','Manager','manager','Work',${project},'DIRECTORY',${attemptId},now(),now())`,
		);
	});
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	rmSync(home, { recursive: true, force: true });
});

test("an empty root directory reports a configuration error before runtime launch", async () => {
	let runtimeCalled = false;
	await startNative(
		{
			...h.ctx(() => {}),
			newTx: h.read,
			home,
			now: () => new Date(),
			localUrl: "http://127.0.0.1:4521",
		} as unknown as Parameters<typeof startNative>[0],
		{
			run: await h.read((tx) => getRun(tx, id)),
			config: ProjectManagerConfigSchema.parse({ personaId: null, concurrency: 3, directory: "" }),
			resume: false,
			context: "Fixture",
			attempt: { id: attemptId, generation: 1, token: "fixture-token" },
		},
		{
			env: {},
			runtime: async () => {
				runtimeCalled = true;
				throw new Error("Unexpected runtime start");
			},
		},
	);
	expect(runtimeCalled).toBe(false);
	expect((await h.read((tx) => getRun(tx, id))).error).toBe(
		"Select the local repository directory before you start a native agent.",
	);
});
