import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { HARNESS_DEFAULT_MODELS, ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { prepareSend } from "../../../../../src/services/agentRuns/communication.ts";
import { prepareStop } from "../../../../../src/services/agentRuns/lifecycle.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import * as terminal from "../../../../../src/services/agentRuns/terminal.ts";
import { assertCurrentAttempt, reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
let attempt: Awaited<ReturnType<typeof reserveAttempt>>;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "HOST");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,created_at,updated_at) VALUES ('assignment','Manager','native','Manager','manager','Do the task',${project},'HOST',now(),now())`,
		);
		attempt = await reserveAttempt({ now: new Date() }, tx, { runId: "assignment" });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${attempt.id} WHERE id='assignment'`);
	});
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
	env: { ...process.env, PATH: join(fixture.home, "bin"), TRELLIS_AUTH_TOKEN: "fixture-host-token" },
});
const configFor = (harness: "claude" | "codex" | "pi" | "opencode" | "muse") =>
	ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 1,
		directory: fixture.home,
		harness: {
			preset: harness,
			model: HARNESS_DEFAULT_MODELS[harness],
			startCommand: "/bin/false",
			resumeCommand: "/bin/false",
		},
	});

test.each(["claude", "codex", "pi", "opencode", "muse"] as const)(
	"production %s start, send, terminal output, stop, and exact resume use the host",
	async (harness) => {
		if (harness === "codex") await h.rows(sql`UPDATE agent_runs SET kind='builder' WHERE id='assignment'`);
		const ctx = context();
		const config = configFor(harness);
		const first = attempt;
		await startNative(
			ctx,
			{
				run: await h.read((tx) => getRun(tx, "assignment")),
				config,
				resume: false,
				context: "Assignment details",
				attempt,
				deadlineAt: Date.now() + 60000,
			},
			dependencies(),
		);
		const host = nativeHost(fixture.home, dependencies().env, fixture.client);
		const idle = await host.waitFor(first.id, (state) => state.activity?.state === "idle");
		expect(idle.agent?.model).toBe(HARNESS_DEFAULT_MODELS[harness]);
		expect(idle.acknowledgedMessageIds).toContain(first.id);
		const stored = await h.read((tx) => getRun(tx, "assignment"));
		expect(stored.sessionId).toBe(idle.agent!.sessionId);
		const descriptor = JSON.parse(
			await readFile(join(fixture.home, "harness-attempts", first.id, "launch.json"), "utf8"),
		);
		expect(descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN).toBe(first.token);
		expect(descriptor.spec.env.TRELLIS_AUTH_TOKEN).toBe("fixture-host-token");
		expect(descriptor.spec.env.TRELLIS_ACTOR).toBe("agent:assignment");
		expect(descriptor.spec.env.TRELLIS_URL).toBe(ctx.localUrl);
		expect(descriptor.spec.timeoutMs).toBeGreaterThan(0);
		await h.read((tx) =>
			assertCurrentAttempt({ actor: { kind: "agent", name: "assignment" }, attemptToken: first.token }, tx),
		);
		await terminal.input(ctx, { id: "assignment", text: "", userInput: false });
		await prepareSend(ctx, { id: "assignment", text: "Follow up", messageId: "followup" });
		await host.waitFor(
			first.id,
			(state) => state.activity?.state === "idle" && state.acknowledgedMessageIds.includes("followup"),
		);
		expect((await terminal.session(ctx, { id: "assignment" }))?.acknowledgedMessageIds).toContain("followup");
		let visible = "";
		for await (const event of host.subscribe(first.id, 0, AbortSignal.timeout(1500))) {
			if (event.type === "output") visible += Buffer.from(event.data, "base64").toString();
			if (visible.includes("fixture response")) break;
		}
		expect(Buffer.from((await terminal.output(ctx, { id: "assignment" })).data, "base64").toString()).toContain(
			"fixture response",
		);
		await prepareStop(ctx, { id: "assignment" });
		expect((await host.status(first.id)).status).toBe("exited");
		attempt = await h.read(async (tx) => {
			const next = await reserveAttempt({ now: new Date() }, tx, { runId: "assignment" });
			await tx.execute(sql`UPDATE agent_runs SET terminal_id=${next.id},closed_at=NULL WHERE id='assignment'`);
			return next;
		});
		await startNative(
			ctx,
			{
				run: await h.read((tx) => getRun(tx, "assignment")),
				config,
				resume: true,
				previousAttemptId: first.id,
				context: "Resume assignment",
				attempt,
			},
			dependencies(),
		);
		expect((await host.status(attempt.id)).agent?.sessionId).toBe(idle.agent!.sessionId);
		expect((await host.status(attempt.id)).acknowledgedMessageIds).toContain(attempt.id);
		await prepareStop(ctx, { id: "assignment" });
	},
	15000,
);

test("a missing harness closes the unlaunched assignment and preserves its clear error", async () => {
	const empty = join(fixture.home, "empty-bin");
	await mkdir(empty);
	const deps = dependencies();
	deps.env.PATH = empty;
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, "assignment")),
			config: configFor("claude"),
			resume: false,
			context: "Task",
			attempt,
		},
		deps,
	);
	const run = await h.read((tx) => getRun(tx, "assignment"));
	expect(run.closedAt).not.toBeNull();
	expect(run.error).toContain("claude");
	expect(run.error).toContain("PATH");
	expect(run.terminalId).toBeNull();
	expect(await fixture.client.list()).toEqual([]);
	attempt = await h.read((tx) => reserveAttempt({ now: new Date() }, tx, { runId: "assignment" }));
	await h.rows(sql`UPDATE agent_runs SET terminal_id=${attempt.id},closed_at=NULL WHERE id='assignment'`);
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, "assignment")),
			config: configFor("claude"),
			resume: false,
			context: "Corrected configuration",
			attempt,
		},
		dependencies(),
	);
	expect((await fixture.client.inspect(attempt.id)).status).toBe("running");
});

test("the assignment token remains the runtime authentication token", async () => {
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, "assignment")),
			config: configFor("pi"),
			resume: false,
			context: "Task",
			attempt,
		},
		dependencies(),
	);
	await fixture.client.observe(attempt.id, attempt.token, { kind: "session", model: "observed-model" });
	expect((await fixture.client.inspect(attempt.id)).agent?.model).toBe("observed-model");
});

test.each(["claude", "codex", "pi", "opencode", "muse"] as const)(
	"production %s interrupt preserves the process and confirms native interruption",
	async (harness) => {
		if (harness === "codex") await h.rows(sql`UPDATE agent_runs SET kind='builder' WHERE id='assignment'`);
		const ctx = context();
		const deps = { ...dependencies(), env: { ...dependencies().env, HARNESS_FIXTURE_BEHAVIOR: "busy" } };
		await startNative(
			ctx,
			{
				run: await h.read((tx) => getRun(tx, "assignment")),
				config: configFor(harness),
				resume: false,
				context: "Task",
				attempt,
			},
			deps,
		);
		const before = await fixture.client.inspect(attempt.id);
		expect(before.activity?.state).toBe("working");
		await expect(
			terminal.interrupt(ctx, { id: "assignment", expectedTerminalId: "previous-attempt" }),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		await terminal.interrupt(ctx, { id: "assignment", expectedTerminalId: attempt.id });
		const after = await fixture.client.inspect(attempt.id);
		expect(after.pid).toBe(before.pid);
		expect(after.status).toBe("running");
		expect(after.activity?.state).toBe("idle");
		expect(after.agent?.outcome).toBe("interrupted");
	},
	15000,
);

test("a manager resume cannot create a second process for a live provider session", async () => {
	const ctx = context();
	const config = configFor("pi");
	const first = attempt;
	await startNative(
		ctx,
		{ run: await h.read((tx) => getRun(tx, "assignment")), config, resume: false, context: "Task", attempt },
		dependencies(),
	);
	attempt = await h.read(async (tx) => {
		const next = await reserveAttempt({ now: new Date() }, tx, { runId: "assignment" });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${next.id},closed_at=NULL WHERE id='assignment'`);
		return next;
	});
	await startNative(
		ctx,
		{
			run: await h.read((tx) => getRun(tx, "assignment")),
			config,
			resume: true,
			previousAttemptId: first.id,
			context: "Resume",
			attempt,
		},
		dependencies(),
	);
	expect((await h.read((tx) => getRun(tx, "assignment"))).error).toContain("Confirm the prior process stopped");
	expect((await h.read((tx) => getRun(tx, "assignment"))).sessionLost).toBe(false);
	expect((await fixture.client.list()).map((session) => session.id)).toEqual([first.id]);
});

test("a stopped legacy manager without native identity enables a new conversation", async () => {
	await fixture.client.start({ id: "legacy", command: "/bin/cat", args: [], cwd: fixture.home, mode: "pty" });
	await fixture.client.stop("legacy");
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, "assignment")),
			config: configFor("claude"),
			resume: true,
			previousAttemptId: "legacy",
			context: "Resume",
			attempt,
		},
		dependencies(),
	);
	const run = await h.read((tx) => getRun(tx, "assignment"));
	expect(run.sessionLost).toBe(true);
	expect(run.closedAt).not.toBeNull();
	expect(run.error).toContain("no confirmed session");
	expect((await fixture.client.list()).map((session) => session.id)).toEqual(["legacy"]);
});
