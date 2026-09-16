import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { prepareStop } from "../../../../../src/services/agentRuns/lifecycle.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { prepareResume } from "../../../../../src/services/agentRuns/resume.ts";
import { reserveRestart } from "../../../../../src/services/restartAgents/reserveRestart.ts";
import type { IoCtx } from "../../../../../src/services/support.ts";
import { create } from "../../../../../src/services/tickets.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
let runId: string;
let attemptId: string;
let sessionId: string;
let from: string;
let to: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
const ctx = (): IoCtx =>
	({
		...h.ctx(() => {}),
		core: h.ctx(() => {}),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:12345",
	}) as unknown as IoCtx;
const deps = () => ({
	workspace: async () => fixture.home,
	runtime: async () => fixture.client,
	env: { ...process.env, PATH: join(fixture.home, "bin") },
});
const start: typeof startNative = (context, input) => startNative(context, input, deps());
const request = () => ({ id: runId, accountId: "two", expectedTerminalId: attemptId, requestId: "account-switch" });
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	from = join(fixture.home, "one");
	to = join(fixture.home, "two");
	await mkdir(from);
	await mkdir(to);
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "SWITCH");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES ('builder','Builder','builder','Build.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO harness_accounts(id,name,harness,profile_path,created_at,updated_at) VALUES ('one','One','claude',${from},now(),now()),('two','Two','claude',${to},now(),now())`,
		);
	});
	await h.rebuild();
	const ticket = await h.run((context, tx) => create(context, tx, { project: "SWITCH", title: "Continue this work" }));
	const reserved = await h.run((context, tx) =>
		reserve(context, tx, { ticket: ticket.id, personaId: "builder", accountId: "one" }),
	);
	if (reserved.replay) throw new Error("Expected a new assignment");
	runId = reserved.run.id;
	attemptId = reserved.attempt.id;
	await start(ctx(), reserved);
	const previous = await nativeHost(fixture.home, deps().env, fixture.client).waitFor(
		attemptId,
		(state) => state.activity?.state === "idle",
	);
	sessionId = previous.agent!.sessionId!;
	await mkdir(join(from, "projects", "work"), { recursive: true });
	await writeFile(join(from, "projects", "work", `${sessionId}.jsonl`), "existing conversation\n");
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});
test("a stopped worker changes accounts with the same assignment, workspace, and conversation", async () => {
	await prepareStop(ctx(), { id: runId });
	await prepareResume(ctx(), request(), start);
	const resumed = await h.read((tx) => getRun(tx, runId));
	expect(resumed.accountId).toBe("two");
	expect(resumed.sessionId).toBe(sessionId);
	expect(resumed.workspaceId).toBe(fixture.home);
	expect(resumed.closedAt).toBeNull();
	expect(resumed.terminalId).not.toBe(attemptId);
	const launch = JSON.parse(
		await readFile(join(fixture.home, "harness-attempts", resumed.terminalId!, "launch.json"), "utf8"),
	);
	expect(launch.spec.env.CLAUDE_CONFIG_DIR).toBe(to);
	expect(launch.spec.args).toContain(sessionId);
	expect(await readFile(join(to, "projects", "work", `${sessionId}.jsonl`), "utf8")).toBe("existing conversation\n");
	await prepareResume(ctx(), request(), start);
	expect((await fixture.client.list()).map((process) => process.id)).toHaveLength(2);
	expect((await h.read((tx) => getRun(tx, runId))).terminalId).toBe(resumed.terminalId);
	await expect(prepareResume(ctx(), { ...request(), accountId: "one" }, start)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	await prepareStop(ctx(), { id: runId });
}, 15000);
test("a running worker and a stale attempt cannot be replaced", async () => {
	await expect(prepareResume(ctx(), request(), start)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await prepareStop(ctx(), { id: runId });
	await expect(prepareResume(ctx(), { ...request(), expectedTerminalId: "wrong" }, start)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect((await h.read((tx) => getRun(tx, runId))).accountId).toBe("one");
}, 15000);
test.each(["disabled", "other harness"])(
	"a %s account cannot resume the worker",
	async (reason) => {
		await prepareStop(ctx(), { id: runId });
		await h.read((tx) =>
			reason === "disabled"
				? tx.execute(sql`UPDATE harness_accounts SET enabled=false WHERE id='two'`)
				: tx.execute(sql`UPDATE harness_accounts SET harness='codex' WHERE id='two'`),
		);
		await expect(prepareResume(ctx(), request(), start)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		expect((await h.read((tx) => getRun(tx, runId))).accountId).toBe("one");
		expect(await fixture.client.list()).toHaveLength(1);
	},
	15000,
);

test("a failed transfer retains the previous account and conversation", async () => {
	await prepareStop(ctx(), { id: runId });
	await rm(join(from, "projects"), { recursive: true });
	await prepareResume(ctx(), request(), start);
	const failed = await h.read((tx) => getRun(tx, runId));
	expect(failed.terminalId).toBe(attemptId);
	expect(failed.accountId).toBe("one");
	expect(failed.sessionId).toBe(sessionId);
	expect(failed.closedAt).not.toBeNull();
	expect(failed.error).toContain("Cannot identify one saved claude session");
	expect(await fixture.client.list()).toHaveLength(1);
}, 15000);

test("a system restart retains the assigned account after the default changes", async () => {
	await fixture.client.stop(attemptId);
	await h.read((tx) => tx.execute(sql`UPDATE harness_accounts SET is_default=true WHERE id='two'`));
	const reserved = await h.run((core, tx) =>
		reserveRestart(
			core,
			tx,
			{
				runId,
				previousAttemptId: attemptId,
				attempt: { id: randomUUID(), token: "test-token" },
				providerSessionId: sessionId,
				workspace: fixture.home,
				harness: "claude",
				done: false,
			},
			true,
		),
	);
	expect(reserved!.run.accountId).toBe("one");
	await start(ctx(), {
		...reserved!,
		attempt: reserved!.attempt!,
		resume: true,
		previousAttemptId: attemptId,
		context: "Continue.",
	});
	const run = await h.read((tx) => getRun(tx, runId));
	expect(run.accountId).toBe("one");
	expect(run.sessionId).toBe(sessionId);
	const descriptor = JSON.parse(
		await readFile(join(fixture.home, "harness-attempts", run.terminalId!, "launch.json"), "utf8"),
	);
	expect(descriptor.spec.env.CLAUDE_CONFIG_DIR).toBe(from);
	await prepareStop(ctx(), { id: runId });
}, 15000);
