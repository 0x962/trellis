import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: TestDb;
let t: TestApp;
let server: Server;
const sockets = new Set<Socket>();
let subscription: Socket;
let requestId: string;
let closeSubscription: Promise<void>;
const token = "terminal-test-token";
const runId = "01M2HGY58VB4J2AYRVGDFHHB3P";
const path = `/api/agent-runs/${runId}/terminal/stream?attemptId=attempt&sessionId=conversation`;
const headers = { authorization: `Bearer ${token}` };
const session = { id: "attempt", mode: "pty", status: "running", controllable: true };
const send = (socket: Socket, id: string, result: unknown) => socket.write(`${JSON.stringify({ id, result })}\n`);

beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h, authToken: token });
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_path,terminal_id,session_id,created_at,updated_at)
			VALUES (${runId},'Hana','Manager','manager','Manage','TRL','attempt','conversation',now(),now())`);
	});
	mkdirSync(join(t.home, "runtime"), { recursive: true });
	server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer.split("\n")[0]!);
			if (request.method === "hello") {
				send(socket, request.id, { capabilities: ["terminal-stream"] });
				socket.end();
			} else {
				subscription = socket;
				requestId = request.id;
				closeSubscription = new Promise((resolve) => socket.once("close", resolve));
				send(socket, request.id, { type: "session", session });
				const bytes = Buffer.from("retained");
				send(socket, request.id, {
					type: "output",
					data: bytes.subarray(request.params.offset).toString("base64"),
					startOffset: request.params.offset,
					nextOffset: bytes.length,
					truncated: false,
				});
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(join(t.home, "runtime", "runtime.sock"), resolve));
});
afterEach(async () => {
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await t.serverTx((tx) => assertStatusInvariant(tx));
	await t.close();
});

const readEvent = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
	const result = await reader.read();
	return new TextDecoder().decode(result.value);
};

test("terminal stream requires host authentication and the current attempt", async () => {
	expect((await t.app.request(`http://trellis.test${path}`)).status).toBe(401);
	expect(
		(await t.app.request(`http://trellis.test${path}`, { headers: { ...headers, origin: "https://foreign.test" } }))
			.status,
	).toBe(403);
	expect(
		(await t.app.request(`http://trellis.test${path.replace("attemptId=attempt", "attemptId=stale")}`, { headers }))
			.status,
	).toBe(400);
	expect(
		(
			await t.app.request(`http://trellis.test${path.replace("sessionId=conversation", "sessionId=stale")}`, {
				headers,
			})
		).status,
	).toBe(400);
	expect((await t.app.request(`http://trellis.test${path}&offset=-1`, { headers })).status).toBe(400);
	expect(sockets.size).toBe(0);
});

test("terminal stream replays from an offset, pushes live bytes, and closes after exit", async () => {
	const response = await t.app.request(`http://trellis.test${path}&offset=3`, { headers });
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/event-stream");
	const reader = response.body!.getReader();
	expect(await readEvent(reader)).toContain("event: session");
	const replay = await readEvent(reader);
	expect(replay).toContain('"startOffset":3');
	expect(replay).toContain(Buffer.from("ained").toString("base64"));
	send(subscription, requestId, {
		type: "output",
		data: Buffer.from("live").toString("base64"),
		startOffset: 8,
		nextOffset: 12,
		truncated: false,
	});
	expect(await readEvent(reader)).toContain('"nextOffset":12');
	send(subscription, requestId, { type: "session", session: { ...session, status: "exited" } });
	subscription.end();
	expect(await readEvent(reader)).toContain('"status":"exited"');
	expect((await reader.read()).done).toBe(true);
});

test("browser cancellation releases the runtime subscription", async () => {
	const response = await t.app.request(`http://trellis.test${path}`, { headers });
	const reader = response.body!.getReader();
	await reader.read();
	await reader.cancel();
	await closeSubscription;
	expect(subscription.destroyed).toBe(true);
});
