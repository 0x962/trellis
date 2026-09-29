import { afterEach, expect, test } from "bun:test";
import { getEventListeners } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeClient } from "./client";
import type { RuntimeProcessStatus, RuntimeRequest } from "./index";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function runtime(reply: (request: RuntimeRequest, socket: Socket) => unknown) {
	const home = await mkdtemp(join(tmpdir(), "trellis-list-"));
	const path = join(home, "s");
	const requests: RuntimeRequest[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("data", async (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer) as RuntimeRequest;
			requests.push(request);
			const result = await reply(request, socket);
			// A reply of undefined leaves the request open, so the caller reaches
			// its own deadline with no answer.
			if (result === undefined) return;
			const response = JSON.stringify({ id: request.id, result });
			socket.write(response.slice(0, 10));
			setImmediate(() => socket.end(`${response.slice(10)}\n`));
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	// The directory goes first, so a socket that keeps the server open cannot
	// leave the directory in the temporary directory.
	cleanups.push(async () => {
		await rm(home, { recursive: true, force: true });
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return { client: new RuntimeClient(path), requests };
}

function session(id: string): RuntimeProcessStatus {
	return {
		id,
		daemonId: "daemon",
		pid: null,
		mode: "stdio",
		status: "exited",
		startedAt: "2026-09-17T00:00:00.000Z",
		endedAt: "2026-09-17T00:00:01.000Z",
		exitCode: 0,
		error: null,
		elapsedMs: 1000,
		agent: null,
		result: null,
		acknowledgedMessageIds: [],
		activity: null,
		checkedAt: "2026-09-17T00:00:02.000Z",
		controllable: false,
		process: null,
		launch: null,
	};
}

test("list collects pages, preserves filters and continues after an empty page", async () => {
	const first = { ...session("first"), result: { id: "message", text: "Full result" } };
	const last = { ...session("last"), acknowledgedMessageIds: ["a", "b"] };
	const { client, requests } = await runtime((request) => {
		if (request.method === "hello") return { capabilities: ["list-pages"] };
		const { cursor } = request.params as { cursor?: string };
		if (cursor === undefined) return { sessions: [first], nextCursor: "r:daemon:1" };
		if (cursor === "r:daemon:1") return { sessions: [], nextCursor: "r:daemon:2" };
		return { sessions: [last], nextCursor: null };
	});
	const input = { ids: ["first", "last"], status: "running" as const, hasError: false };
	expect(await client.list(input)).toEqual({ sessions: [first, last], complete: true });
	expect(requests.map((request) => request.method)).toEqual(["hello", "listPage", "listPage", "listPage"]);
	// The limit of a page is the room the earlier pages left.
	expect(requests.slice(1).map((request) => request.params)).toEqual([
		{ ...input, limit: 2 },
		{ ...input, limit: 1, cursor: "r:daemon:1" },
		{ ...input, limit: 1, cursor: "r:daemon:2" },
	]);
	await client.list({ ids: [] });
	expect(requests.filter((request) => request.method === "hello")).toHaveLength(1);
});

test("a page that passes the deadline ends the read and marks it short", async () => {
	const first = session("first");
	const { client, requests } = await runtime((request) => {
		if (request.method === "hello") return { capabilities: ["list-pages"] };
		const { cursor } = request.params as { cursor?: string };
		if (cursor === undefined) return { sessions: [first], nextCursor: "r:daemon:1" };
		return undefined;
	});
	const slow = new RuntimeClient(client.socketPath, 200);
	expect(await slow.list({})).toEqual({ sessions: [first], complete: false });
	expect(requests.map((request) => request.method)).toEqual(["hello", "listPage", "listPage"]);
});

test("list stops at the limit the caller names", async () => {
	const { client, requests } = await runtime((request) => {
		if (request.method === "hello") return { capabilities: ["list-pages"] };
		return { sessions: [session("one"), session("two")], nextCursor: "r:daemon:2" };
	});
	const answer = await client.list({ limit: 2 });
	expect(answer.sessions.map((entry) => entry.id)).toEqual(["one", "two"]);
	expect(answer.complete).toBe(true);
	expect(requests.filter((request) => request.method === "listPage")).toHaveLength(1);
});

test("list uses the legacy method when hello omits paging support", async () => {
	const legacy = { ...session("legacy"), result: { id: "message", text: "Retained output" } };
	const { client, requests } = await runtime((request) => (request.method === "hello" ? {} : [legacy]));
	expect(await client.list({ ids: ["legacy"] })).toEqual({ sessions: [legacy], complete: true });
	expect(requests.map((request) => request.method)).toEqual(["hello", "list"]);
	expect(requests[1]!.params).toEqual({ ids: ["legacy"] });
});

test("an explicit hello refreshes paging support after a runtime replacement", async () => {
	let supported = false;
	const { client, requests } = await runtime((request) => {
		if (request.method === "hello") return { capabilities: supported ? ["list-pages"] : [] };
		return request.method === "listPage" ? { sessions: [], nextCursor: null } : [];
	});
	await client.hello();
	await client.list();
	supported = true;
	await client.hello();
	await client.list();
	expect(requests.map((request) => request.method)).toEqual(["hello", "list", "hello", "listPage"]);
});

test("a default call completes after the former ten-second idle timeout", async () => {
	const result = session("slow");
	const { client } = await runtime(async () => {
		await Bun.sleep(10_100);
		return result;
	});
	expect(await client.inspect("slow")).toEqual(result);
}, 15_000);

test("a canceled signal prevents a connection", async () => {
	const client = new RuntimeClient("/not-a-runtime-socket");
	const reason = new Error("Caller canceled");
	await expect(client.call("hello", {}, AbortSignal.abort(reason))).rejects.toBe(reason);
});

test("cancellation closes the request socket and removes its listener", async () => {
	const received = Promise.withResolvers<void>();
	const closed = Promise.withResolvers<void>();
	const { client } = await runtime((_request, socket) => {
		socket.once("end", () => closed.resolve());
		received.resolve();
	});
	const controller = new AbortController();
	const reason = new Error("Caller canceled");
	const call = client.call("hello", {}, controller.signal);
	const rejection = call.catch((error: unknown) => error);
	await received.promise;
	controller.abort(reason);
	expect(await rejection).toBe(reason);
	await closed.promise;
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test("a caller deadline cancels its own call", async () => {
	const { client } = await runtime(() => undefined);
	await expect(client.call("hello", {}, AbortSignal.timeout(100))).rejects.toMatchObject({ name: "TimeoutError" });
});

test.each(["hello", "listPage"])("list cancellation rejects during %s", async (method) => {
	const received = Promise.withResolvers<void>();
	const { client, requests } = await runtime((request) => {
		if (request.method === method) {
			received.resolve();
			return undefined;
		}
		return { capabilities: ["list-pages"] };
	});
	const controller = new AbortController();
	const reason = new Error("List canceled");
	const rejection = client.list({}, controller.signal).catch((error: unknown) => error);
	await received.promise;
	controller.abort(reason);
	expect(await rejection).toBe(reason);
	expect(requests.at(-1)?.method).toBe(method);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test("a disconnect rejects an unanswered call and removes its listener", async () => {
	const { client } = await runtime((_request, socket) => {
		socket.end();
	});
	const controller = new AbortController();
	await expect(client.call("hello", {}, controller.signal)).rejects.toThrow("response is unknown: connection closed");
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

test("a successful call removes its cancellation listener", async () => {
	const { client } = await runtime(() => session("done"));
	const controller = new AbortController();
	expect(await client.call("inspect", { id: "done" }, controller.signal)).toEqual(session("done"));
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	controller.abort();
	expect(await client.inspect("done")).toEqual(session("done"));
});
