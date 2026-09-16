import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../src/agents/native/harnessHost.ts";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import * as personas from "../../../../../src/services/personas.ts";
import { prepareResumeRestart } from "../../../../../src/services/restartAgents/restartAgents.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
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
		const project = await seedRoot(tx, "PROMPT");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`UPDATE projects SET manager_config=${JSON.stringify({ personaId: null, concurrency: 3, directory: fixture.home, harness: { preset: "claude" } })}::jsonb WHERE id=${project}`,
		);
	});
	await h.rebuild();
});
afterEach(async () => {
	const exited = once(fixture.daemon, "exit");
	await fixture.client.shutdown();
	await exited;
	await h.read(assertStatusInvariant);
	await rm(fixture.home, { recursive: true, force: true });
});

test("automatic manager restart launches the current database persona as the exact system prompt", async () => {
	const persona = await h.run((ctx, tx) =>
		personas.create(ctx, tx, { name: "Manager", kind: "manager", instruction: "Original database policy." }),
	);
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, { personaId: persona.id, project: "PROMPT" }));
	if (reserved.replay) throw new Error("Expected a new manager");
	const ctx = {
		...h.ctx(() => {}),
		core: h.ctx(() => {}),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof prepareResumeRestart>[0];
	const env = { ...process.env, PATH: join(fixture.home, "bin") };
	const dependencies = { env, runtime: async () => fixture.client, workspace: async () => fixture.home };
	const host = nativeHost(fixture.home, env, fixture.client);
	await startNative(ctx, reserved, dependencies);
	const previous = await host.waitFor(reserved.attempt.id, (session) => session.activity?.state === "idle");
	const instruction = "Current saved manager policy.\n\nUse the project queue to coordinate work.";
	await h.run((core, tx) => personas.update(core, tx, { id: persona.id, name: "Updated manager", instruction }));
	await fixture.client.stop(previous.id);
	const restartId = randomUUID();
	const nextAttemptId = randomUUID();
	await writeRestartPlan(fixture.home, {
		version: 1,
		id: restartId,
		sourceReleaseId: "before",
		targetReleaseId: "after",
		createdAt: new Date().toISOString(),
		sessions: [
			{
				runId: reserved.run.id,
				previousAttemptId: previous.id,
				providerSessionId: previous.agent!.sessionId!,
				harness: "claude",
				workspace: fixture.home,
				processIdentity: previous.process!.identity,
				attempt: { id: nextAttemptId, token: "restart-token" },
			},
		],
	});
	expect(
		await prepareResumeRestart(
			ctx,
			{ restartId },
			{
				host: () => host,
				start: (context, input) => startNative(context, input, dependencies),
			},
		),
	).toEqual({ resumed: 1, skipped: 0 });
	const run = await h.read((tx) => getRun(tx, reserved.run.id));
	expect(run.instruction).toBe(instruction);
	expect(run.personaName).toBe("Updated manager");
	const descriptor = JSON.parse(
		await readFile(join(fixture.home, "harness-attempts", nextAttemptId, "launch.json"), "utf8"),
	);
	const args: string[] = descriptor.spec.args;
	expect(args[args.indexOf("--system-prompt") + 1]).toBe(instruction);
	expect(descriptor.prompt).not.toContain("Original database policy.");
	expect(JSON.parse(descriptor.prompt)).toMatchObject({ type: "trellis.system_restarted", restartId });
}, 15000);

test("a reserved restart attempt retains its database policy snapshot across a later persona edit", async () => {
	const { reserveRestart } = await import("../../../../../src/services/restartAgents/reserveRestart.ts");
	const persona = await h.run((ctx, tx) =>
		personas.create(ctx, tx, { name: "Manager", kind: "manager", instruction: "Original policy" }),
	);
	const first = await h.run((ctx, tx) => reserve(ctx, tx, { personaId: persona.id, project: "PROMPT" }));
	if (first.replay) throw new Error("Expected a new manager");
	const entry = {
		runId: first.run.id,
		previousAttemptId: first.attempt.id,
		providerSessionId: "provider",
		harness: "claude" as const,
		workspace: fixture.home,
		processIdentity: "identity",
		attempt: { id: randomUUID(), token: "next-token" },
	};
	await h.run((ctx, tx) =>
		personas.update(ctx, tx, { id: persona.id, name: "Manager", instruction: "Policy at reservation" }),
	);
	const next = await h.run((ctx, tx) => reserveRestart(ctx, tx, entry, true));
	expect(next!.run.instruction).toBe("Policy at reservation");
	await h.run((ctx, tx) =>
		personas.update(ctx, tx, { id: persona.id, name: "Manager", instruction: "Policy after reservation" }),
	);
	const retried = await h.run((ctx, tx) => reserveRestart(ctx, tx, entry, true));
	expect(retried!.run.instruction).toBe("Policy at reservation");
	expect(retried!.attempt!.id).toBe(next!.attempt!.id);
});

test("a deleted manager persona cannot supply a new restart prompt from an old assignment", async () => {
	const { reserveRestart } = await import("../../../../../src/services/restartAgents/reserveRestart.ts");
	const persona = await h.run((ctx, tx) =>
		personas.create(ctx, tx, { name: "Manager", kind: "manager", instruction: "Deleted policy" }),
	);
	const first = await h.run((ctx, tx) => reserve(ctx, tx, { personaId: persona.id, project: "PROMPT" }));
	if (first.replay) throw new Error("Expected a new manager");
	await h.run((ctx, tx) => personas.remove(ctx, tx, { id: persona.id }));
	const entry = {
		runId: first.run.id,
		previousAttemptId: first.attempt.id,
		providerSessionId: "provider",
		harness: "claude" as const,
		workspace: fixture.home,
		processIdentity: "identity",
		attempt: { id: randomUUID(), token: "next-token" },
	};
	await expect(h.run((ctx, tx) => reserveRestart(ctx, tx, entry, true))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect((await h.read((tx) => getRun(tx, first.run.id))).terminalId).toBe(first.attempt.id);
});
