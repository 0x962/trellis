import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshHome } from "../test/helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../test/helpers/server.ts";
import { LOCK_FILE } from "./homeLock.ts";

// Two PGlite instances on one data directory corrupt it. So the production
// boot takes the lock on the data home first, then binds the port, and only
// then opens the database. A second server on a held home, or a server whose
// port is taken, exits before it touches the database.

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

const start = (home: string, env: Record<string, string> = {}) => {
	const server = spawnServer({ home, env });
	servers.push(server);
	return server;
};

const healthOf = async (url: string) => {
	const response = await fetch(`${url}/api/health`);
	const body = (await response.json()) as { ok: boolean; bootId: string; version: string };
	return { status: response.status, ok: body.ok, bootId: body.bootId, version: body.version };
};

// Every line a failed boot printed: stderr and the error records on stdout.
const failureText = (server: SpawnedServer) =>
	[...server.stderr, ...server.records.filter((record) => record.level === "error").map((record) => record.msg)].join(
		"\n",
	);

const deadPid = async () => {
	const child = Bun.spawn(["true"]);
	await child.exited;
	return child.pid;
};

describe("the data home lock", () => {
	test("a second server on the same home exits non-zero, names the holder pid, and never opens the database", async () => {
		const home = freshHome();
		const first = start(home);
		const { url, port } = await first.listening();
		const before = await healthOf(url);
		const dbDir = join(home, "db");
		const mtime = statSync(dbDir).mtimeMs;
		const entries = readdirSync(dbDir).sort();

		const second = start(home);
		const code = await second.exited();

		expect(code).not.toBe(0);
		const text = failureText(second);
		expect(text).toContain(`pid ${first.proc.pid}`);
		expect(text).toContain(`port ${port}`);
		expect(second.records.find((record) => record.msg === "migrate")).toBeUndefined();
		expect(second.records.find((record) => record.msg === "listening")).toBeUndefined();
		expect(statSync(dbDir).mtimeMs).toBe(mtime);
		expect(readdirSync(dbDir).sort()).toEqual(entries);
		expect(await healthOf(url)).toEqual(before);
		expect(JSON.parse(readFileSync(join(home, LOCK_FILE), "utf8"))).toEqual({
			pid: first.proc.pid,
			role: "server",
			port,
		});
	});

	test("a stale lock from a dead pid is taken over", async () => {
		const home = freshHome();
		writeFileSync(join(home, LOCK_FILE), JSON.stringify({ pid: await deadPid(), role: "server", port: 4521 }));

		const server = start(home);
		const { url, port } = await server.listening();

		expect((await healthOf(url)).status).toBe(200);
		expect(JSON.parse(readFileSync(join(home, LOCK_FILE), "utf8"))).toEqual({
			pid: server.proc.pid,
			role: "server",
			port,
		});
	});

	test("the lock is free again once the holder stops", async () => {
		const home = freshHome();
		const first = start(home);
		await first.listening();
		await stopServer(first);

		const second = start(home);
		const { url } = await second.listening();

		expect((await healthOf(url)).status).toBe(200);
	});
});

describe("the port", () => {
	test("a port conflict exits 1 before the database opens", async () => {
		const blocker = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("taken") });
		const port = String(blocker.port);
		const home = freshHome();

		const server = start(home, { TRELLIS_PORT: port });
		const code = await server.exited();
		blocker.stop(true);

		expect(code).toBe(1);
		expect(failureText(server)).toContain(port);
		expect(server.records.find((record) => record.msg === "migrate")).toBeUndefined();
		expect(existsSync(join(home, "db", "PG_VERSION"))).toBe(false);
	});
});
