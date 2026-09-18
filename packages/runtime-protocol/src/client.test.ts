import { afterEach, expect, test } from "bun:test";
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

async function runtime(reply: (request: RuntimeRequest) => unknown) {
	const home = await mkdtemp(join(tmpdir(), "trellis-list-"));
	const path = join(home, "s");
	const requests: RuntimeRequest[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer) as RuntimeRequest;
			requests.push(request);
			const response = JSON.stringify({ id: request.id, result: reply(request) });
			socket.write(response.slice(0, 10));
			setImmediate(() => socket.end(`${response.slice(10)}\n`));
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	cleanups.push(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(home, { recursive: true });
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
	expect(await client.list(input)).toEqual([first, last]);
	expect(requests.map((request) => request.method)).toEqual(["hello", "listPage", "listPage", "listPage"]);
	expect(requests.slice(1).map((request) => request.params)).toEqual([
		input,
		{ ...input, cursor: "r:daemon:1" },
		{ ...input, cursor: "r:daemon:2" },
	]);
	await client.list({ ids: [] });
	expect(requests.filter((request) => request.method === "hello")).toHaveLength(1);
});

test("list uses the legacy method when hello omits paging support", async () => {
	const legacy = { ...session("legacy"), result: { id: "message", text: "Retained output" } };
	const { client, requests } = await runtime((request) => (request.method === "hello" ? {} : [legacy]));
	expect(await client.list({ ids: ["legacy"] })).toEqual([legacy]);
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
