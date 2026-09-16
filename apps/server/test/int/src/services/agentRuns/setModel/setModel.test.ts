import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../../../../../src/agents/native/harnessHost.ts";
import { startNative } from "../../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../../src/services/agentRuns/reserve.ts";
import { prepareSetModel } from "../../../../../../src/services/agentRuns/setModel/setModel.ts";
import type { IoCtx } from "../../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { harnessHostFixture } from "../../../../../helpers/harnessHostFixture.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
let ticket: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	fixture = await harnessHostFixture({ nestedRuntime: true });
	await h.read(async (tx) => {
		await seedActors(tx);
		const projectId = await seedRoot(tx, "MODEL");
		const statuses = await seedStatuses(tx, projectId);
		ticket = await seedTicket(tx, { projectId, rootId: projectId, statusId: statuses.todo });
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES ('builder','Builder','builder','Build',now(),now())`);
	});
	await h.rebuild();
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});
const context = (): IoCtx =>
	({
		...h.ctx(() => {}),
		core: h.ctx(() => {}),
		newTx: h.read,
		home: fixture.home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:12345",
	}) as unknown as IoCtx;
const dependencies = (busy = false) => ({
	workspace: async () => fixture.home,
	runtime: async () => fixture.client,
	env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_BEHAVIOR: busy ? "busy" : undefined },
});
const start: typeof startNative = (ctx, input) => startNative(ctx, input, dependencies());

test.each(["claude", "codex"] as const)(
	"a busy %s worker changes model within the same ticket and conversation",
	async (preset) => {
		await h.rows(
			sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{harness}',${JSON.stringify({ preset })}::jsonb)`,
		);
		const reserved = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", model: "first-model" }));
		if (reserved.replay) throw new Error("Expected a new assignment");
		await startNative(context(), reserved, dependencies(true));
		const host = nativeHost(fixture.home, dependencies().env, fixture.client);
		const before = await host.waitFor(reserved.attempt.id, (state) => state.activity?.state === "working");
		const input = {
			id: reserved.run.id,
			model: "second-model",
			expectedTerminalId: reserved.attempt.id,
			requestId: "switch",
		};
		await expect(prepareSetModel(context(), { ...input, expectedTerminalId: "stale" }, start)).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
		});
		await h.rows(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',now())`);
		await expect(prepareSetModel(context(), input, start)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		expect((await host.status(reserved.attempt.id)).activity?.state).toBe("working");
		await h.rows(sql`DELETE FROM settings WHERE key='nativeWorkPaused'`);
		await prepareSetModel(context(), input, start);
		const run = await h.read((tx) => getRun(tx, input.id));
		const after = await host.waitFor(run.terminalId!, (state) => state.activity?.state === "idle");
		expect(after.agent?.model).toBe("second-model");
		expect(after.agent?.sessionId).toBe(before.agent?.sessionId);
		expect(run.ticketId).toBe(ticket);
		expect(run.workspaceId).toBe(fixture.home);
		expect(run.closedAt).toBeNull();
		expect((await host.status(reserved.attempt.id)).status).toBe("exited");
		await prepareSetModel(context(), input, start);
		expect(await fixture.client.list()).toHaveLength(2);
	},
	15000,
);
