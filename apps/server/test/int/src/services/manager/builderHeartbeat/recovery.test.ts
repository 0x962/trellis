import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { assertResumeTicket } from "../../../../../../src/services/agentRuns/assertResumeTicket.ts";
import { closeExitedAssignments } from "../../../../../../src/services/agentRuns/closeExitedAssignments.ts";
import { refreshNative } from "../../../../../../src/services/agentRuns/nativeLifecycle.ts";
import { getRun } from "../../../../../../src/services/agentRuns/queries.ts";
import { prepareResume } from "../../../../../../src/services/agentRuns/resume.ts";
import {
	collectRecovery,
	dispatchBuilderRecovery,
} from "../../../../../../src/services/manager/builderHeartbeat/recovery.ts";
import type { IoCtx } from "../../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../../helpers/ctx.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let ticketId: string;
const exited = () =>
	controllerSession("attempt", {
		status: "exited",
		controllable: false,
		endedAt: NOW.toISOString(),
		agent: { sessionId: "conversation" } as NonNullable<ReturnType<typeof controllerSession>["agent"]>,
	});
const ctx = (): IoCtx => ({
	...testCtx({ db: h.db, home: "/unused", now: () => secondsAfter(121) }).ctx,
	core: h.ctx(() => {}, { now: secondsAfter(121) }),
	publicUrl: "http://trellis.test",
	localUrl: "http://trellis.test",
});
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const projectId = await seedRoot(tx, "REC");
		await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const started = await seedStatus(tx, { projectId, name: "In Progress", category: "started", position: 1 });
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId: started });
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('builder','Builder','builder','Build',${NOW},${NOW})`,
		);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('worker','Builder','builder','Builder','builder','Build',${projectId},'REC',${ticketId},'native','attempt','conversation',${NOW},${NOW})`);
	});
	await h.rebuild();
});

test("recovery selects confirmed exited builders and keeps the saved attempt", async () => {
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toEqual([{ runId: "worker", terminalId: "attempt" }]);
	for (const session of [
		controllerSession("attempt"),
		{ ...exited(), status: "unknown" as const },
		{ ...exited(), agent: null },
	])
		expect(
			await h.run((context, tx) => collectRecovery(context, tx, { sessions: [session] }), { now: secondsAfter(121) }),
		).toEqual([]);
});

test("recovery resumes a stopped builder only while its ticket remains started", async () => {
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='worker'`));
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toEqual([{ runId: "worker", terminalId: "attempt" }]);
	await h.read((tx) =>
		tx.execute(sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE category='todo') WHERE id=${ticketId}`),
	);
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toEqual([]);
});

test("recovery uses one stable request and waits before another attempt", async () => {
	const requests: unknown[] = [];
	const resume: typeof prepareResume = async (_context, input) => {
		requests.push(input);
		return { id: input.id };
	};
	await dispatchBuilderRecovery(ctx(), [exited()], resume);
	await dispatchBuilderRecovery(ctx(), [exited()], resume);
	expect(requests).toEqual([
		{ id: "worker", expectedTerminalId: "attempt", requestId: "builder-recovery:attempt", automatic: true },
	]);
});

test("automatic resume permits a closed builder on a started ticket", async () => {
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='worker'`));
	await h.read(async (tx) => expect(assertResumeTicket(tx, await getRun(tx, "worker"), true)).resolves.toBeUndefined());
});

test("resume rejects Todo tickets before it reads the runtime", async () => {
	await h.read((tx) =>
		tx.execute(sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE category='todo') WHERE id=${ticketId}`),
	);
	await expect(
		prepareResume(ctx(), { id: "worker", expectedTerminalId: "attempt", requestId: "resume" }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		message: "Move the ticket out of Todo before you resume an agent.",
	});
});

test("runtime refresh preserves an exited in-progress builder for recovery", async () => {
	await refreshNative(ctx(), await h.read((tx) => getRun(tx, "worker")), async () => exited());
	expect((await h.read((tx) => getRun(tx, "worker"))).closedAt).toBeNull();
	await closeExitedAssignments(ctx(), async () => [exited()]);
	expect((await h.read((tx) => getRun(tx, "worker"))).closedAt).toBeNull();
	await h.read((tx) =>
		tx.execute(sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE category='todo') WHERE id=${ticketId}`),
	);
	await closeExitedAssignments(ctx(), async () => [exited()]);
	expect((await h.read((tx) => getRun(tx, "worker"))).closedAt).not.toBeNull();
});

test("automatic resume respects project archive before it reads the runtime", async () => {
	await h.read((tx) => tx.execute(sql`UPDATE projects SET archived_at=${NOW}`));
	await expect(
		prepareResume(ctx(), { id: "worker", expectedTerminalId: "attempt", requestId: "resume", automatic: true }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		message: "Automatic builder work is unavailable for an archived project.",
	});
});

test("one failed resume does not prevent another builder from resuming", async () => {
	await h.read((tx) =>
		tx.execute(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,session_id,created_at,updated_at)
		SELECT 'second',name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,'second-attempt',session_id,created_at,updated_at FROM agent_runs WHERE id='worker'`),
	);
	const resumed: string[] = [];
	const resume: typeof prepareResume = async (_context, input) => {
		resumed.push(input.id);
		if (input.id === "second") throw new Error("First resume failed");
		return { id: input.id };
	};
	await expect(
		dispatchBuilderRecovery(ctx(), [exited(), { ...exited(), id: "second-attempt" }], resume),
	).rejects.toThrow("First resume failed");
	expect(resumed.toSorted()).toEqual(["second", "worker"]);
});

test("recovery selects the latest saved builder when all ticket builders are stopped", async () => {
	await h.read(async (tx) => {
		await tx.execute(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='worker'`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,session_id,closed_at,created_at,updated_at)
		SELECT 'latest',name,persona_id,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,'latest-attempt',session_id,closed_at,${secondsAfter(1)},updated_at FROM agent_runs WHERE id='worker'`);
	});
	const sessions = [exited(), { ...exited(), id: "latest-attempt" }];
	expect(await h.run((context, tx) => collectRecovery(context, tx, { sessions }), { now: secondsAfter(121) })).toEqual([
		{ runId: "latest", terminalId: "latest-attempt" },
	]);
	sessions[1]!.endedAt = secondsAfter(100).toISOString();
	expect(await h.run((context, tx) => collectRecovery(context, tx, { sessions }), { now: secondsAfter(121) })).toEqual(
		[],
	);
});

test("a competing open builder prevents a stopped builder from resuming", async () => {
	await h.read(async (tx) => {
		await tx.execute(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='worker'`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,created_at,updated_at)
		SELECT 'active',name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,'active-attempt',created_at,updated_at FROM agent_runs WHERE id='worker'`);
	});
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toEqual([]);
	await expect(
		prepareResume(ctx(), { id: "worker", expectedTerminalId: "attempt", requestId: "resume", automatic: true }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED", message: "Another builder already owns this ticket." });
});

test("manager pause permits builder recovery while global native pause blocks it", async () => {
	await h.read((tx) =>
		tx.execute(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb`),
	);
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toHaveLength(1);
	await h.read(async (tx) => expect(assertResumeTicket(tx, await getRun(tx, "worker"), true)).resolves.toBeUndefined());
	await h.read((tx) =>
		tx.execute(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',${NOW})`),
	);
	expect(
		await h.run((context, tx) => collectRecovery(context, tx, { sessions: [exited()] }), { now: secondsAfter(121) }),
	).toEqual([]);
});
