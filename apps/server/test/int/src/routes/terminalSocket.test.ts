import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { websocket } from "hono/bun";
import WebSocket from "ws";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: TestDb;
let t: TestApp;
let runtime: Server;
let http: ReturnType<typeof Bun.serve>;
const sockets = new Set<Socket>();
const browsers = new Set<WebSocket>();
let subscription: Socket;
let subscriptionId: string;
let forbidDatabase = false;
let calls: string[];
let commands: { method: string; params: Record<string, unknown> }[];
const token = "socket-test-token";
const runId = "01M2HGY58VB4J2AYRVGDFHHB3P";
const path = `/api/agent-runs/${runId}/terminal/socket?attemptId=attempt&sessionId=conversation`;
const session = { id: "attempt", mode: "pty", status: "running", controllable: true };
const send = (socket: Socket, id: string, result: unknown) => socket.write(`${JSON.stringify({ id, result })}\n`);
// What the runtime process answers to `hello`. A test sets it to an empty
// list to act as a runtime binary that is too old to send terminal output.
let capabilities: string[];

beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	forbidDatabase = false;
	capabilities = ["terminal-stream"];
	calls = [];
	commands = [];
	t = await createTestApp({
		db: h,
		authToken: token,
		wrapTransport: (inner) => ({
			...inner,
			call: (...args) => {
				if (forbidDatabase) throw new Error("Terminal input reached the database");
				calls.push(args[0]);
				return inner.call(...args);
			},
		}),
	});
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_path,terminal_id,session_id,created_at,updated_at)
		VALUES (${runId},'Hana','Manager','manager','Manage','TRL','attempt','conversation',now(),now())`);
	});
	mkdirSync(join(t.home, "runtime"), { recursive: true });
	runtime = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer.split("\n")[0]!);
			if (request.method === "hello") {
				send(socket, request.id, { capabilities });
				socket.end();
			} else if (request.method === "subscribe") {
				subscription = socket;
				subscriptionId = request.id;
				send(socket, request.id, { type: "session", session });
				const bytes = Buffer.from("A😀B");
				send(socket, request.id, {
					type: "output",
					data: bytes.subarray(request.params.offset).toString("base64"),
					startOffset: request.params.offset,
					nextOffset: bytes.length,
					truncated: false,
				});
			} else {
				commands.push({ method: request.method, params: request.params });
				send(socket, request.id, null);
				socket.end();
			}
		});
	});
	await new Promise<void>((resolve) => runtime.listen(join(t.home, "runtime", "runtime.sock"), resolve));
	http = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request, server) => t.app.fetch(request, server),
		websocket,
	});
});
afterEach(async () => {
	for (const browser of browsers) browser.close();
	browsers.clear();
	http.stop(true);
	for (const socket of sockets) socket.destroy();
	await new Promise<void>((resolve) => runtime.close(() => resolve()));
	await t.serverTx((tx) => assertStatusInvariant(tx));
	await t.close();
});

const waitUntil = async (ready: () => boolean) => {
	const deadline = Date.now() + 3000;
	while (!ready() && Date.now() < deadline) await Bun.sleep(5);
	expect(ready()).toBe(true);
};

const connect = () => {
	const socket = new WebSocket(`ws://127.0.0.1:${http.port}${path}&offset=1`, {
		headers: { authorization: `Bearer ${token}`, origin: `http://127.0.0.1:${http.port}` },
	});
	browsers.add(socket);
	socket.binaryType = "arraybuffer";
	const messages: (string | ArrayBuffer)[] = [];
	socket.onmessage = (event) => messages.push(event.data as string | ArrayBuffer);
	return { socket, messages };
};

test("socket rejects unauthenticated, foreign-origin, and obsolete attempts before runtime access", async () => {
	const base = `http://127.0.0.1:${http.port}`;
	const headers = { authorization: `Bearer ${token}` };
	expect((await fetch(base + path)).status).toBe(401);
	expect((await fetch(base + path, { headers: { ...headers, origin: "https://foreign.test" } })).status).toBe(403);
	expect((await fetch(base + path.replace("attemptId=attempt", "attemptId=old"), { headers })).status).toBe(400);
	expect((await fetch(base + path.replace("sessionId=conversation", "sessionId=old"), { headers })).status).toBe(400);
	expect((await fetch(`${base}${path}&offset=-1`, { headers })).status).toBe(400);
	expect(sockets.size).toBe(0);
});

// The socket route and the stream route read the same runtime output, so
// both answer the same 503 when the runtime binary is too old to send it.
test("socket answers 503 when the runtime cannot send terminal output", async () => {
	capabilities = [];
	const response = await fetch(`http://127.0.0.1:${http.port}${path}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({
		defined: true,
		code: "RUNNER_UNAVAILABLE",
		status: 503,
		message: "The execution service requires an update before it can stream this terminal.",
		data: { reason: "outdated" },
	});
});

test("WebSocket upgrades reject missing credentials and an obsolete attempt", async () => {
	for (const authenticated of [false, true]) {
		const url = `ws://127.0.0.1:${http.port}${authenticated ? path.replace("attemptId=attempt", "attemptId=old") : path}`;
		await new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(url, { headers: authenticated ? { authorization: `Bearer ${token}` } : {} });
			socket.on("error", () => {
				socket.close();
				resolve();
			});
			socket.on("open", () => {
				socket.close();
				reject(new Error("Invalid terminal upgrade succeeded"));
			});
		});
	}
	expect(sockets.size).toBe(0);
});

test("socket streams binary bytes and sends ordered input and resize without further database calls", async () => {
	const { socket, messages } = connect();
	await waitUntil(() => messages.length === 2);
	expect(JSON.parse(messages[0] as string)).toEqual({ type: "session", session });
	const output = messages[1] as ArrayBuffer;
	expect(new DataView(output).getFloat64(0)).toBe(1);
	expect(new DataView(output).getFloat64(8)).toBe(6);
	expect(new TextDecoder().decode(new Uint8Array(output, 17))).toBe("😀B");
	forbidDatabase = true;
	for (const data of ["a", "b", "\x03"]) socket.send(JSON.stringify({ type: "input", data, userInput: true }));
	socket.send(JSON.stringify({ type: "input", data: "\x1b[1;1R", userInput: false }));
	socket.send(JSON.stringify({ type: "resize", cols: 90, rows: 28 }));
	await waitUntil(() => commands.length === 5);
	expect(commands.map((command) => command.method)).toEqual(["input", "input", "input", "input", "resize"]);
	expect(
		commands.slice(0, 4).map((command) => Buffer.from(command.params.data as string, "base64").toString()),
	).toEqual(["a", "b", "\x03", "\x1b[1;1R"]);
	expect(commands[3]!.params.userInput).toBe(false);
	expect(commands.every((command) => command.params.id === "attempt")).toBe(true);
	expect(calls).toEqual(["agentRuns.terminalTarget"]);
	socket.close();
	await waitUntil(() => subscription.destroyed);
});

test("process exit closes the socket after its final bytes", async () => {
	const { socket, messages } = connect();
	await waitUntil(() => messages.length === 2);
	send(subscription, subscriptionId, {
		type: "session",
		session: { ...session, status: "exited", controllable: false },
	});
	subscription.end();
	await waitUntil(() => socket.readyState === WebSocket.CLOSED);
	expect(JSON.parse(messages[2] as string).session.status).toBe("exited");
});
