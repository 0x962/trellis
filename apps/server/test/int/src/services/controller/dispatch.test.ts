import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { dispatch } from "../../../../../src/services/controller/dispatch.ts";
import { seedRoot } from "../../../../fixtures/projects.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let server: Server;
let session = controllerSession();
let onInspect: () => void;
let busyOnDelivery: boolean;
let deliveries: Array<{ messageId: string; requireIdle?: boolean; data: string }>;
const sockets = new Set<Socket>();
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	home = mkdtempSync("/tmp/trl-dispatch-");
	mkdirSync(join(home, "runtime"));
	session = controllerSession();
	onInspect = () => {};
	busyOnDelivery = false;
	deliveries = [];
	await h.run(
		async (ctx, tx) => {
			const project = await seedRoot(tx, "DSP", { manager_config: { personaId: "persona" } });
			await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Hana','Manager','manager','Manage',${project},'DSP','attempt','conversation',${NOW},${NOW})`);
			await collect(ctx, tx, { sessions: [session] });
		},
		{ now: secondsAfter(60) },
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
				if (busyOnDelivery) {
					socket.end(
						`${JSON.stringify({ id: request.id, error: { code: "RUNTIME_BUSY", message: "The process is busy" } })}\n`,
					);
					return;
				}
				session.acknowledgedMessageIds.push(request.params.messageId);
			}
			const result =
				request.method === "subscribe"
					? { type: "session", session }
					: request.method === "list"
						? [session]
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
	dispatch({ ...testCtx({ db: h.db, home, now: () => secondsAfter(61) }).ctx, publicUrl: "http://trellis.test" });
const queue = () => h.one(sql`SELECT state,generation FROM manager_dispatches`);

test("a manager that starts a turn after claim keeps its heartbeat pending without input", async () => {
	onInspect = () => {
		session.activity = { state: "working", updatedAt: secondsAfter(61).toISOString() };
	};
	await send();
	expect((await queue()).state).toBe("pending");
	expect(deliveries).toHaveLength(0);
});

test("an atomic runtime busy rejection defers the heartbeat without an unknown receipt", async () => {
	busyOnDelivery = true;
	await send();
	expect((await queue()).state).toBe("pending");
	expect(deliveries).toHaveLength(1);
	expect(deliveries[0]?.requireIdle).toBe(true);
});

test("a live manager receives one heartbeat and confirms its durable message receipt", async () => {
	await send();
	expect((await queue()).state).toBe("sent");
	expect(deliveries).toHaveLength(1);
	expect(deliveries[0]?.requireIdle).toBe(true);
	expect(Buffer.from(deliveries[0]!.data, "base64").toString()).toContain("Manager heartbeat");
	expect(session.acknowledgedMessageIds).toEqual([session.id, deliveries[0]!.messageId]);
	await send();
	expect(deliveries).toHaveLength(1);
});
