import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { dispatch } from "../../../../../src/services/controller/dispatch.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let server: Server;
let session = controllerSession();
let workers: ReturnType<typeof controllerSession>[];
let onInspect: () => void;
let deliveryError: string | null;
let deliveries: Array<{ messageId: string; data: string }>;
const sockets = new Set<Socket>();
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	home = mkdtempSync("/tmp/trl-dispatch-");
	mkdirSync(join(home, "runtime"));
	mkdirSync(join(home, "harness-attempts", "attempt"), { recursive: true });
	writeFileSync(join(home, "harness-attempts", "attempt", "launch.json"), JSON.stringify({ harness: "claude" }));
	session = controllerSession();
	workers = [];
	onInspect = () => {};
	deliveryError = null;
	deliveries = [];
	await h.run(
		async (ctx, tx) => {
			const project = await seedRoot(tx, "DSP", { manager_config: { personaId: "persona" } });
			await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Hana','Manager','manager','Manage',${project},'DSP','attempt','conversation',${NOW},${NOW})`);
			await collect(ctx, tx, { sessions: [session] });
		},
		{ now: secondsAfter(121) },
	);
	server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer.split("\n")[0]!);
			if (request.method === "inspect") onInspect();
			if (request.method === "deliver") {
				deliveries.push(request.params);
				if (deliveryError) {
					socket.end(
						`${JSON.stringify({ id: request.id, error: { code: deliveryError, message: "The process exited" } })}\n`,
					);
					return;
				}
				session.acknowledgedMessageIds.push(request.params.messageId);
			}
			const result =
				request.method === "subscribe"
					? { type: "session", session }
					: request.method === "list"
						? [session, ...workers]
						: request.method === "deliver"
							? { messageId: request.params.messageId, status: "written" }
							: session;
			socket.end(`${JSON.stringify({ id: request.id, result })}\n`);
		});
	});
	await new Promise<void>((resolve) => server.listen(join(home, "runtime", "runtime.sock"), resolve));
});
afterEach(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	rmSync(home, { recursive: true, force: true });
	await h.read(assertStatusInvariant);
});
const send = () =>
	dispatch({ ...testCtx({ db: h.db, home, now: () => secondsAfter(122) }).ctx, publicUrl: "http://trellis.test" });
const queue = () => h.one(sql`SELECT state,generation FROM manager_dispatches`);

test.each(["working", "idle", "ready"] as const)("new %s activity after claim skips the heartbeat", async (state) => {
	onInspect = () => {
		session.activity = { state, updatedAt: secondsAfter(122).toISOString() };
	};
	await send();
	expect((await queue()).state).toBe("canceled");
	expect(deliveries).toHaveLength(0);
});

test("a changed turn at the transport boundary cancels the heartbeat", async () => {
	deliveryError = "RUNTIME_TURN_CHANGED";
	await send();
	expect((await queue()).state).toBe("canceled");
	expect(session.acknowledgedMessageIds).toEqual([session.id]);
	expect(deliveries[0]).toHaveProperty("expected.idleBefore", secondsAfter(2).toISOString());
});

test("a runtime error on delivery records an uncertain receipt", async () => {
	deliveryError = "RUNTIME_CLOSED";
	await send();
	expect((await queue()).state).toBe("unknown");
	expect(deliveries).toHaveLength(1);
});

test("a live manager receives one heartbeat and confirms its durable message receipt", async () => {
	await send();
	expect((await queue()).state).toBe("sent");
	expect(deliveries).toHaveLength(1);
	const text = Buffer.from(deliveries[0]!.data, "base64").toString();
	const payload = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
	expect(payload.type).toBe("trellis.manager.heartbeat");
	expect(payload.events).toEqual([]);
	expect(session.acknowledgedMessageIds).toEqual([session.id, deliveries[0]!.messageId]);
	await send();
	expect(deliveries).toHaveLength(1);
});

test("a heartbeat reports the current worker turn after the heartbeat enters the queue", async () => {
	await h.rows(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at)
		SELECT 'worker','Builder','Builder','builder','Build',project_id,project_path,'worker-attempt',${NOW},${NOW}
		FROM agent_runs WHERE id='manager'`);
	workers = [
		controllerSession("worker-attempt", {
			activity: { state: "idle", updatedAt: secondsAfter(121).toISOString() },
			checkedAt: secondsAfter(122).toISOString(),
			result: { id: "result-1", text: "The change is ready for review." },
		}),
	];
	await send();
	const message = Buffer.from(deliveries[0]!.data, "base64").toString();
	const context = JSON.parse(message.slice(message.indexOf("{"), message.lastIndexOf("}") + 1)).agentContext;
	expect(context.observedAt).toBe(secondsAfter(122).toISOString());
	expect(context.agents).toHaveLength(1);
	expect(context.agents[0]).toMatchObject({
		runId: "worker",
		processStatus: "running",
		activity: "idle",
		isWorking: false,
		lastActivityAt: secondsAfter(121).toISOString(),
	});
});

test("a timed wait reaches the native manager with its wake condition and assignment identity", async () => {
	const waitFor = { type: "time" as const, at: secondsAfter(121).toISOString() };
	const ticketId = await h.run(async (ctx, tx) => {
		const manager = await tx.execute(sql`SELECT project_id FROM agent_runs WHERE id='manager'`);
		const projectId = manager.rows[0]!.project_id as string;
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await tx.execute(sql`UPDATE manager_dispatches SET state='sent',events=${JSON.stringify([{ ticketId }])}::jsonb`);
		const result = await tx.execute(sql`SELECT id FROM manager_dispatches`);
		await handle(ctx, tx, {
			id: result.rows[0]!.id as string,
			generation: 0,
			outcomes: [{ ticketId, status: "blocked", reason: "Resume after the reset.", waitFor }],
		});
		return ticketId;
	});
	await h.run((ctx, tx) => collect(ctx, tx, { sessions: [session] }), { now: secondsAfter(122) });
	session.activity = { state: "working", updatedAt: secondsAfter(122).toISOString() };
	await send();
	expect(deliveries).toHaveLength(1);
	const message = Buffer.from(deliveries[0]!.data, "base64").toString();
	const payload = JSON.parse(message.slice(message.indexOf("{"), message.lastIndexOf("}") + 1));
	expect(payload.type).toBe("trellis.manager.dispatch");
	expect(payload.nextActions[0]).toMatchObject({ ticketId, wakeCondition: "time", waitFor });
	expect(payload.workItems).toEqual([{ ticketId, assignmentRequestId: payload.nextActions[0].assignmentRequestId }]);
	await send();
	expect(deliveries).toHaveLength(1);
});
