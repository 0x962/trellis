import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
let runId: string;
let attemptId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	runId = ulid();
	attemptId = randomUUID();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "MGR");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at) VALUES (${runId},'Manager','native','Manager','manager','Original assignment must not repeat',${project},'MGR',${attemptId},now(),now())`,
		);
	});
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await fixture.client.shutdown();
	await new Promise<void>((resolve) => fixture.daemon.once("exit", () => resolve()));
	await rm(fixture.home, { recursive: true, force: true });
});
const context = () =>
	({
		...h.ctx(() => {}),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	}) as unknown as Parameters<typeof startNative>[0];
const config = () =>
	ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 1,
		directory: fixture.home,
		trustedDirectory: true,
		harness: { preset: "claude" },
	});
const env = () => ({ ...process.env, PATH: join(fixture.home, "bin") });
const deps = () => ({ env: env(), workspace: async () => fixture.home, runtime: async () => fixture.client });
test("a new manager stores its actual private directory", async () => {
	const run = await h.read((tx) => getRun(tx, runId));
	await startNative(
		context(),
		{
			run,
			config: config(),
			resume: false,
			context: "Coordinate",
			attempt: { id: attemptId, token: "token", generation: 1 },
		},
		deps(),
	);
	const current = await h.read((tx) => getRun(tx, runId));
	expect(current.workspaceId).toBe(join(fixture.home, "harness-attempts", "manager-workspaces", runId));
	expect(current.workspaceId).toBe((await fixture.client.inspect(attemptId)).launch!.cwd);
});
test.each([false, true])("a resumed manager uses the observed directory when private=%s", async (privateDirectory) => {
	const host = nativeHost(fixture.home, env(), fixture.client);
	const previousId = randomUUID();
	const previous = await host.start({
		id: previousId,
		harness: "claude",
		...(privateDirectory
			? { kind: "manager" as const, managerId: runId, managerSystemPrompt: "Stored manager persona" }
			: { kind: "builder" as const }),
		cwd: fixture.home,
		prompt: "Original",
		token: "previous-token",
	});
	await host.stop(previousId);
	await h.rows(
		sql`UPDATE agent_runs SET workspace_id=${fixture.home}, session_id=${previous.process.agent!.sessionId} WHERE id=${runId}`,
	);
	const run = await h.read((tx) => getRun(tx, runId));
	await startNative(
		context(),
		{
			run,
			config: config(),
			resume: true,
			previousAttemptId: previousId,
			context: "",
			resumePrompt: "Trellis performed a system restart.",
			attempt: { id: attemptId, token: "token", generation: 2 },
		},
		deps(),
	);
	const current = await h.read((tx) => getRun(tx, runId));
	const resumed = await fixture.client.inspect(attemptId);
	expect(resumed.launch!.cwd).toBe(previous.process.launch!.cwd);
	expect(current.workspaceId).toBe(resumed.launch!.cwd);
	expect(resumed.agent!.sessionId).toBe(previous.process.agent!.sessionId);
	const descriptor = JSON.parse(
		await readFile(join(fixture.home, "harness-attempts", attemptId, "launch.json"), "utf8"),
	);
	expect(descriptor.spec.args[descriptor.spec.args.indexOf("--system-prompt") + 1]).toBe(run.instruction);
	expect(descriptor.prompt).toContain("Trellis performed a system restart.");
	expect(descriptor.prompt).not.toContain("Original assignment must not repeat");
	expect(descriptor.spec.args).toContain("--strict-mcp-config");
	expect(descriptor.spec.args).not.toContain("--dangerously-skip-permissions");
});
