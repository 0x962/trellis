import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { closeExitedAssignments } from "../../../../../src/services/agentRuns/closeExitedAssignments.ts";
import { prepareStop } from "../../../../../src/services/agentRuns/lifecycle.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { dana, seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "RESET");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('persona','Manager','manager','Original persona instruction.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,created_at,updated_at) VALUES ('worker','Worker','native','Builder','builder','Build the feature.',${project},'RESET',now(),now())`,
		);
	});
	await h.rebuild();
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	const exited = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await fixture.client.shutdown();
	await exited;
	await rm(fixture.home, { recursive: true, force: true });
});
const context = () =>
	({
		...h.ctx(() => {}, { actor: dana }),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:12345",
	}) as unknown as Parameters<typeof startNative>[0];
const config = () =>
	ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 2,
		directory: fixture.home,
		harness: { preset: "claude" },
	});
const dependencies = () => ({
	workspace: async () => fixture.home,
	runtime: async () => fixture.client,
	env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_SESSION_FROM_ARGS: "1" },
});
const host = () => nativeHost(fixture.home, dependencies().env, fixture.client);
const reserveManager = async (newSession?: boolean) => {
	const sessions = await closeExitedAssignments(context());
	return h.run(
		(ctx, tx) =>
			reserve(
				ctx,
				tx,
				{ project: "RESET", personaId: "persona", ...(newSession === undefined ? {} : { newSession }) },
				sessions.filter((session) => session.status === "exited").map((session) => session.id),
			),
		{ actor: dana },
	);
};
const startManager = async (newSession?: boolean) => {
	const reserved = await reserveManager(newSession);
	if (reserved.replay) throw new Error("Expected a new attempt");
	await startNative(context(), { ...reserved, config: config() }, dependencies());
	const process = await host().waitFor(reserved.attempt.id, (state) => state.activity?.state === "idle");
	return { run: await h.read((tx) => getRun(tx, reserved.run.id)), process };
};
const startWorker = async () => {
	const attempt = await h.read(async (tx) => {
		const attempt = await reserveAttempt({ now: new Date() }, tx, { runId: "worker" });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${attempt.id} WHERE id='worker'`);
		return attempt;
	});
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, "worker")),
			config: config(),
			resume: false,
			context: "Complete the feature.",
			attempt,
		},
		dependencies(),
	);
	return host().waitFor(attempt.id, (state) => state.activity?.state === "idle");
};

test.each([true, undefined])(
	"a human stops the manager before restart with newSession=%s and preserves the worker",
	async (newSession) => {
		const previous = await startManager();
		const worker = await startWorker();
		await h.read((tx) =>
			tx.execute(sql`UPDATE personas SET instruction='Latest saved persona instruction.' WHERE id='persona'`),
		);
		await prepareStop(context(), { id: previous.run.id });
		expect((await fixture.client.inspect(previous.process.id)).status).toBe("exited");
		expect(() => process.kill(previous.process.pid!, 0)).toThrow();
		const next = await startManager(newSession);
		expect(next.run.id).toBe(previous.run.id);
		expect(next.run.workspaceId).toBe(previous.run.workspaceId);
		expect(next.process.launch!.cwd).toBe(previous.process.launch!.cwd);
		expect(next.process.id).not.toBe(previous.process.id);
		expect(next.run.instruction).toBe("Latest saved persona instruction.");
		const descriptor = JSON.parse(
			await readFile(join(fixture.home, "harness-attempts", next.process.id, "launch.json"), "utf8"),
		);
		expect(descriptor.spec.args[descriptor.spec.args.indexOf("--system-prompt") + 1]).toBe(
			"Latest saved persona instruction.",
		);
		expect(descriptor.prompt).not.toContain("Latest saved persona instruction.");
		expect(descriptor.prompt).not.toContain("Original persona instruction.");
		if (newSession) {
			expect(descriptor.spec.args).toContain("--session-id");
			expect(descriptor.spec.args).not.toContain("--resume");
			expect(next.process.agent!.sessionId).not.toBe(previous.process.agent!.sessionId);
		} else {
			expect(descriptor.spec.args).toContain("--resume");
			expect(descriptor.spec.args).toContain(previous.process.agent!.sessionId);
			expect(next.process.agent!.sessionId).toBe(previous.process.agent!.sessionId);
		}
		expect(next.run.sessionId).toBe(next.process.agent!.sessionId);
		expect((await fixture.client.inspect(previous.process.id)).status).toBe("exited");
		const survivingWorker = await fixture.client.inspect(worker.id);
		expect(survivingWorker.status).toBe("running");
		expect(survivingWorker.pid).toBe(worker.pid);
		expect(survivingWorker.agent!.sessionId).toBe(worker.agent!.sessionId);
		const workerRun = await h.read((tx) => getRun(tx, "worker"));
		expect(workerRun.terminalId).toBe(worker.id);
		expect(workerRun.closedAt).toBeNull();
	},
	15000,
);

test("failed process cleanup refuses a fresh manager conversation", async () => {
	const previous = await startManager();
	const stop = spyOn(RuntimeClient.prototype, "stop").mockRejectedValueOnce(new Error("Cleanup failed"));
	await expect(prepareStop(context(), { id: previous.run.id })).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
	stop.mockRestore();
	expect((await fixture.client.inspect(previous.process.id)).status).toBe("running");
	await expect(reserveManager(true)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const current = await h.read((tx) => getRun(tx, previous.run.id));
	expect(current.terminalId).toBe(previous.process.id);
	expect(current.sessionId).toBe(previous.process.agent!.sessionId);
	expect((await fixture.client.list()).map((session) => session.id)).toEqual([previous.process.id]);
	expect(await h.rows(sql`SELECT id FROM agent_execution_attempts WHERE run_id=${previous.run.id}`)).toHaveLength(1);
}, 15000);
