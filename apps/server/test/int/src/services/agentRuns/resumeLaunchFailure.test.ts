import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { prepareStop } from "../../../../../src/services/agentRuns/lifecycle.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { assertCurrentAttempt, reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
let first: Awaited<ReturnType<typeof reserveAttempt>>;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "RESUME");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('persona','Manager','manager','Manage.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_id,persona_name,kind,instruction,project_id,project_path,created_at,updated_at) VALUES ('manager','Manager','native','persona','Manager','manager','Manage.',${project},'RESUME',now(),now())`,
		);
		first = await reserveAttempt({ now: new Date() }, tx, { runId: "manager" });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${first.id} WHERE id='manager'`);
	});
	await h.rebuild();
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});
const context = () =>
	({
		...h.ctx(() => {}),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:12345",
	}) as unknown as Parameters<typeof startNative>[0];
const dependencies = () => ({
	workspace: async () => fixture.home,
	runtime: async () => fixture.client,
	env: { ...process.env, PATH: join(fixture.home, "bin") },
});
const reserveResume = () =>
	h.run((ctx, tx) => reserve(ctx, tx, { project: "RESUME", personaId: "persona" }, [first.id]));

test.each(["trust", "workspace", "missing harness"] as const)(
	"a %s failure before resume preserves the previous conversation for a corrected start",
	async (failure) => {
		const ctx = context();
		const config = ProjectManagerConfigSchema.parse({
			personaId: null,
			concurrency: 1,
			directory: fixture.home,
			trustedDirectory: true,
			harness: { preset: "claude", startCommand: "/bin/false", resumeCommand: "/bin/false" },
		});
		await startNative(
			ctx,
			{
				run: await h.read((tx) => getRun(tx, "manager")),
				config,
				resume: false,
				context: "Manage the project",
				attempt: first,
			},
			dependencies(),
		);
		const host = nativeHost(fixture.home, dependencies().env, fixture.client);
		const previous = await host.waitFor(first.id, (state) => state.activity?.state === "idle");
		await prepareStop(ctx, { id: "manager" });
		const reserved = await reserveResume();
		if (reserved.replay) throw new Error("Expected a new attempt");
		expect(reserved.resume).toBe(true);
		const deps = dependencies();
		if (failure === "workspace")
			deps.workspace = async () => {
				throw new Error("Missing workspace");
			};
		if (failure === "missing harness") {
			deps.env.PATH = join(fixture.home, "empty-bin");
			await mkdir(deps.env.PATH);
		}
		await startNative(ctx, { ...reserved, config: { ...config, trustedDirectory: failure !== "trust" } }, deps);
		const failed = await h.read((tx) => getRun(tx, "manager"));
		expect(failed.terminalId).toBe(first.id);
		expect(failed.sessionId).toBe(previous.agent!.sessionId);
		expect(failed.closedAt).not.toBeNull();
		expect(failed.error).toBeTruthy();
		expect((await fixture.client.list()).map((session) => session.id)).toEqual([first.id]);
		for (const attemptToken of [first.token, reserved.attempt.token])
			await expect(
				h.read((tx) => assertCurrentAttempt({ actor: { kind: "agent", name: "manager" }, attemptToken }, tx)),
			).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		const corrected = await reserveResume();
		if (corrected.replay) throw new Error("Expected a corrected attempt");
		expect(corrected.resume).toBe(true);
		expect(corrected.previousAttemptId).toBe(first.id);
		await startNative(ctx, { ...corrected, config }, dependencies());
		const resumed = await host.status(corrected.attempt.id);
		expect(resumed.status).toBe("running");
		expect(resumed.agent?.sessionId).toBe(previous.agent!.sessionId);
		const descriptor = JSON.parse(
			await readFile(join(fixture.home, "harness-attempts", corrected.attempt.id, "launch.json"), "utf8"),
		);
		expect(descriptor.spec.args).toContain("--resume");
		expect(descriptor.spec.args).toContain(previous.agent!.sessionId);
		await prepareStop(ctx, { id: "manager" });
	},
	15000,
);
