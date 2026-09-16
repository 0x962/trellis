import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	collect,
	heartbeatContext,
	recordHeartbeat,
} from "../../../../../../src/services/manager/builderHeartbeat/collect.ts";
import { dispatchBuilderHeartbeats } from "../../../../../../src/services/manager/builderHeartbeat/dispatch.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { seedComment, seedTicket } from "../../../../../fixtures/tickets.ts";
import { controllerSession, workingSession } from "../../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../../helpers/ctx.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticketId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "HB", {
			manager_config: { personaId: null, directory: "/tmp/trellis-test" },
		});
		await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const started = await seedStatus(tx, {
			projectId,
			name: "In Progress",
			category: "started",
			position: 1,
			wipLimit: 9,
		});
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId: started });
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
			VALUES ('builder','Builder','builder','Build',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('worker','Builder','Builder','builder','Build',${projectId},'HB',${ticketId},'native','w1','s1',${NOW},${NOW})`);
	});
	await h.rebuild();
});

test("collect finds the idle builder on the started ticket", async () => {
	const candidates = await h.run((ctx, tx) =>
		collect({ ...ctx, now: secondsAfter(121) }, tx, { sessions: [controllerSession("w1")] }),
	);
	expect(candidates).toHaveLength(1);
	expect(candidates[0]).toMatchObject({
		runId: "worker",
		terminalId: "w1",
		ticketId,
		projectId,
		activityState: "idle",
	});
});

test("collect skips builders on todo tickets and working sessions", async () => {
	const todo = await h.read(async (tx) => {
		const [status] = (await tx.execute(sql`SELECT id FROM statuses WHERE category='todo'`)).rows;
		const id = await seedTicket(tx, { projectId, rootId: projectId, statusId: status!.id as string });
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,created_at,updated_at)
			VALUES ('todo-worker','Builder','Builder','builder','Build',${projectId},'HB',${id},'native','w2',${NOW},${NOW})`);
		return id;
	});
	expect(todo).not.toBe(ticketId);
	const candidates = await h.run((ctx, tx) =>
		collect({ ...ctx, now: secondsAfter(121) }, tx, { sessions: [workingSession("w1"), controllerSession("w2")] }),
	);
	expect(candidates).toEqual([]);
});

test("heartbeat context carries the ticket, the column fill, and the latest comments", async () => {
	await h.read((tx) => seedComment(tx, ticketId, "Keep going."));
	const context = await h.read((tx) => heartbeatContext(tx, { ticketId }));
	expect(context.ticket).toMatchObject({ statusName: "In Progress", statusCategory: "started" });
	expect(context.inProgress).toEqual({ count: 1, limit: 9 });
	expect(context.comments).toHaveLength(1);
	expect(context.comments[0]).toMatchObject({ body: "Keep going.", actorKind: "human" });
});

test("a recorded heartbeat suppresses the next collect inside the window", async () => {
	const sessions = [controllerSession("w1")];
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(121) })).toHaveLength(1);
	await h.run((ctx, tx) => recordHeartbeat(ctx, tx, "worker"), { now: secondsAfter(121) });
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(122) })).toHaveLength(0);
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(242) })).toHaveLength(1);
});

test("collect excludes a builder until its idle activity exceeds the quiet window", async () => {
	const sessions = [controllerSession("w1")];
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }))).toEqual([]);
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(120) })).toEqual([]);
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(121) })).toHaveLength(1);
});

test("collect excludes closed assignments and archived projects", async () => {
	const sessions = [controllerSession("w1")];
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='worker'`));
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(121) })).toEqual([]);
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET closed_at=NULL WHERE id='worker'`));
	await h.read((tx) => tx.execute(sql`UPDATE projects SET archived_at=${NOW} WHERE id=${projectId}`));
	expect(await h.run((ctx, tx) => collect(ctx, tx, { sessions }), { now: secondsAfter(121) })).toEqual([]);
});

test("an uncertain heartbeat reports its error and delays another send", async () => {
	const context = testCtx({ db: h.db, home: "/unused", now: () => secondsAfter(121) }).ctx;
	let sends = 0;
	const send: Parameters<typeof dispatchBuilderHeartbeats>[2] = async () => {
		sends++;
		throw new Error("Unconfirmed delivery");
	};
	await expect(dispatchBuilderHeartbeats(context, [controllerSession("w1")], send)).rejects.toThrow(
		"Unconfirmed delivery",
	);
	await dispatchBuilderHeartbeats(context, [controllerSession("w1")], send);
	expect(sends).toBe(1);
});

test("a heartbeat uses a stable delivery id for the same idle activity and context", async () => {
	const context = testCtx({ db: h.db, home: "/unused", now: () => secondsAfter(121) }).ctx;
	const inputs: { messageId?: string; text: string }[] = [];
	const send: Parameters<typeof dispatchBuilderHeartbeats>[2] = async (_context, input) => {
		inputs.push(input);
		return { id: input.id };
	};
	await dispatchBuilderHeartbeats(context, [controllerSession("w1")], send);
	await dispatchBuilderHeartbeats({ ...context, now: () => secondsAfter(242) }, [controllerSession("w1")], send);
	expect(inputs).toHaveLength(2);
	expect(inputs[0]!.messageId).toMatch(/^builder-heartbeat:w1:/);
	expect(inputs[1]!.messageId).toBe(inputs[0]!.messageId);
	expect(inputs[1]!.text).toBe(inputs[0]!.text);
});

test("one failed heartbeat does not prevent another builder from receiving its heartbeat", async () => {
	await h.read((tx) =>
		tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,terminal_id,created_at,updated_at)
		SELECT 'second',name,persona_name,kind,instruction,project_id,project_path,ticket_id,runtime,'w2',created_at,updated_at FROM agent_runs WHERE id='worker'`),
	);
	const sent: string[] = [];
	const send: Parameters<typeof dispatchBuilderHeartbeats>[2] = async (_context, input) => {
		sent.push(input.id);
		if (input.id === "second") throw new Error("First delivery failed");
		return { id: input.id };
	};
	const context = testCtx({ db: h.db, home: "/unused", now: () => secondsAfter(121) }).ctx;
	await expect(
		dispatchBuilderHeartbeats(context, [controllerSession("w1"), controllerSession("w2")], send),
	).rejects.toThrow("First delivery failed");
	expect(sent.toSorted()).toEqual(["second", "worker"]);
});

test("a manager pause does not stop an in-progress builder heartbeat", async () => {
	await h.read((tx) =>
		tx.execute(sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb`),
	);
	expect(
		await h.run((ctx, tx) => collect(ctx, tx, { sessions: [controllerSession("w1")] }), { now: secondsAfter(121) }),
	).toHaveLength(1);
	await h.read((tx) =>
		tx.execute(sql`INSERT INTO settings (key,value,updated_at) VALUES ('nativeWorkPaused','true',${NOW})`),
	);
	expect(
		await h.run((ctx, tx) => collect(ctx, tx, { sessions: [controllerSession("w1")] }), { now: secondsAfter(121) }),
	).toEqual([]);
});
