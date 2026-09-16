import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { HARNESS_DEFAULT_MODELS } from "@trellis/api";
import { type RestartPlan, readRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { prepareResumeRestart } from "../../../../../src/services/restartAgents/restartAgents.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
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
});
afterEach(async () => {
	const exited = once(fixture.daemon, "exit");
	await fixture.client.shutdown();
	await exited;
	await h.read(assertStatusInvariant);
	await rm(fixture.home, { recursive: true, force: true });
});

test.each(["claude", "codex", "opencode", "pi", "muse"] as const)(
	"%s assignment resumes on a new runtime with one restart notice",
	async (harness) => {
		const { home, client } = fixture;
		const runId = ulid();
		const previousAttemptId = randomUUID();
		const env = { ...process.env, PATH: join(home, "bin"), TRELLIS_RUN_ID: runId };
		const host = nativeHost(home, env, client);
		const previous = (
			await host.start({
				id: previousAttemptId,
				harness,
				cwd: home,
				prompt: "Work on the assignment.",
				model: HARNESS_DEFAULT_MODELS[harness],
				token: "previous-token",
			})
		).process;
		await h.read(async (tx) => {
			await seedActors(tx);
			const project = await seedRoot(tx, "RST");
			await tx.execute(
				sql`UPDATE projects SET manager_config=${JSON.stringify({ personaId: null, concurrency: 3, directory: home })}::jsonb WHERE id=${project}`,
			);
			await tx.execute(
				sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES (${runId},'Worker','native','Builder','builder','Continue the assignment',${project},'RST',${previousAttemptId},${previous.agent!.sessionId},${home},now(),now())`,
			);
		});
		const plan: RestartPlan = {
			version: 1,
			id: randomUUID(),
			sourceReleaseId: "old",
			targetReleaseId: "new",
			createdAt: new Date().toISOString(),
			sessions: [
				{
					runId,
					previousAttemptId,
					providerSessionId: previous.agent!.sessionId!,
					harness,
					model: HARNESS_DEFAULT_MODELS[harness],
					workspace: home,
					processIdentity: previous.process!.identity,
					attempt: { id: randomUUID(), token: "restart-token" },
				},
			],
		};
		await writeRestartPlan(home, plan);
		const exited = once(fixture.daemon, "exit");
		await client.shutdown();
		await exited;
		fixture.daemon = spawn(
			process.env.TRELLIS_RUNTIME_NODE ?? "node",
			[resolve(import.meta.dir, "../../../../../../runtime/dist/index.js"), "--home", join(home, "runtime")],
			{ stdio: ["ignore", "pipe", "inherit"] },
		);
		await once(fixture.daemon.stdout!, "data");
		const ctx = {
			...h.ctx(() => {}),
			core: h.ctx(() => {}),
			home,
			newTx: h.read,
			now: () => new Date(),
			localUrl: "http://127.0.0.1:4521",
		} as unknown as Parameters<typeof prepareResumeRestart>[0];
		const deps = {
			host: () => host,
			start: (c: Parameters<typeof startNative>[0], input: Parameters<typeof startNative>[1]) =>
				startNative(c, input, { env, runtime: async () => client, workspace: async () => home }),
		};
		expect(await prepareResumeRestart(ctx, { restartId: plan.id, wait: true }, deps)).toMatchObject({
			resumed: 1,
			skipped: 0,
			failed: 0,
		});
		const sessions = await client.list({ status: "running" });
		expect(sessions).toHaveLength(1);
		expect(sessions[0]!.pid).not.toBe(previous.pid);
		expect(sessions[0]!.agent?.sessionId).toBe(previous.agent!.sessionId);
		expect(sessions[0]!.agent?.model).toBe(HARNESS_DEFAULT_MODELS[harness]);
		expect(sessions[0]!.launch!.cwd).toBe(home);
		expect(sessions[0]!.acknowledgedMessageIds).toEqual([plan.sessions[0]!.attempt.id]);
		const descriptor = JSON.parse(
			await readFile(join(home, "harness-attempts", plan.sessions[0]!.attempt.id, "launch.json"), "utf8"),
		);
		expect(descriptor.prompt).toContain("Trellis performed a system restart.");
		expect(descriptor.spec.env.TRELLIS_RUN_ID).toBe(runId);
		expect(descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN).toBe("restart-token");
		expect(await readRestartPlan(home)).toBeNull();
		expect(await prepareResumeRestart(ctx, { restartId: plan.id, wait: true }, deps)).toMatchObject({
			resumed: 0,
			skipped: 0,
			failed: 0,
		});
		expect((await client.list({ status: "running" }))[0]!.pid).toBe(sessions[0]!.pid);
	},
	20000,
);
