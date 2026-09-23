import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LIST_LIMIT, type RuntimeListPageInput, type RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { SessionStore } from "../sessionStore";
import { writeSessionList } from "./writeSessionList";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function connection(
	entries: () => Generator<{ session: RuntimeProcessStatus | null; cursor: string }>,
	paged: boolean,
	input: RuntimeListPageInput = {},
) {
	const home = await mkdtemp(join(tmpdir(), "trellis-page-"));
	const path = join(home, "s");
	const completed = Promise.withResolvers<void>();
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.on("error", () => socket.destroy());
		const store = { entries } as unknown as SessionStore;
		void writeSessionList(socket, store, "request", input, paged).then(completed.resolve, () => {
			socket.destroy();
			completed.resolve();
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	const client = createConnection(path);
	cleanups.push(async () => {
		client.destroy();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(home, { recursive: true });
	});
	return { client, completed: completed.promise };
}

function receive(socket: Socket): Promise<{ id: string; result: unknown }> {
	return new Promise((resolve, reject) => {
		let text = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			text += chunk;
		});
		socket.once("error", reject);
		socket.once("end", () => resolve(JSON.parse(text)));
	});
}

const status = (id: string, text = "") => ({ id, result: { id: "result", text } }) as RuntimeProcessStatus;

test("legacy list preserves the complete array and lets other events run between records", async () => {
	const sessions = Array.from({ length: 40 }, (_, index) => status(String(index), "x".repeat(20_000)));
	let turns = 0;
	let finished = false;
	const tick = () => {
		if (!finished) {
			turns++;
			setImmediate(tick);
		}
	};
	setImmediate(tick);
	const { client, completed } = await connection(function* () {
		for (const session of sessions) yield { session, cursor: session.id };
	}, false);
	const response = await receive(client);
	await completed;
	finished = true;
	expect(response).toEqual({ id: "request", result: sessions });
	expect(turns).toBeGreaterThanOrEqual(sessions.length);
});

test("pages stop after 32 inspected records even when every filter rejects", async () => {
	let inspected = 0;
	const { client } = await connection(function* () {
		for (let index = 0; index < 1000; index++) {
			inspected++;
			yield { session: null, cursor: `r:daemon:${index + 1}` };
		}
	}, true);
	expect(await receive(client)).toEqual({ id: "request", result: { sessions: [], nextCursor: "r:daemon:32" } });
	expect(inspected).toBe(32);
});

test("a record larger than the byte target returns once and advances the cursor", async () => {
	const large = status("large", "x".repeat(300_000));
	const { client } = await connection(function* () {
		yield { session: large, cursor: "r:daemon:1" };
		yield { session: status("next"), cursor: "r:daemon:2" };
	}, true);
	expect(await receive(client)).toEqual({ id: "request", result: { sessions: [large], nextCursor: "r:daemon:1" } });
});

test("disconnect stops a filtered legacy scan", async () => {
	let inspected = 0;
	const { client, completed } = await connection(function* () {
		for (let index = 0; index < 10_000; index++) {
			inspected++;
			yield { session: null, cursor: `r:daemon:${index + 1}` };
		}
	}, false);
	client.once("data", () => client.destroy());
	await completed;
	expect(inspected).toBeLessThan(10_000);
});

test("a page stops at the limit of the request and names no next cursor", async () => {
	const { client } = await connection(
		function* () {
			for (let index = 0; index < 100; index++)
				yield { session: status(String(index)), cursor: `r:daemon:${index + 1}` };
		},
		true,
		{ limit: 3 },
	);
	const response = (await receive(client)) as {
		result: { sessions: RuntimeProcessStatus[]; nextCursor: string | null };
	};
	expect(response.result.sessions.map((session) => session.id)).toEqual(["0", "1", "2"]);
	expect(response.result.nextCursor).toBe(null);
});

test("a caller that names no limit gets at most the default", async () => {
	const { client } = await connection(function* () {
		for (let index = 0; index < 400; index++) yield { session: status(String(index)), cursor: `r:daemon:${index + 1}` };
	}, false);
	const response = (await receive(client)) as { result: RuntimeProcessStatus[] };
	expect(response.result).toHaveLength(DEFAULT_LIST_LIMIT);
});
