import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { ghStub } from "../test/helpers/gh-stub.ts";
import { freshHome } from "../test/helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../test/helpers/server.ts";
import { readSse } from "../test/helpers/sse.ts";
import { boot, type StartHook } from "./index.ts";
import { listenAddresses } from "./listen.ts";

// The boot sequence: config, the data home directories, the blob sweep, the
// database and its migrations, the gh check off the boot path, then listen.
// SIGTERM stops accepting, says bye on every stream, closes the database,
// and exits 0. A second signal exits at once. A boot failure exits 1 with
// one line.

const servers: SpawnedServer[] = [];
const restores: Array<() => void> = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
	for (const restore of restores.splice(0)) restore();
});

// The child inherits process.env, so a gh stub set before `start` reaches it.
const start = (home: string) => {
	const server = spawnServer({ home });
	servers.push(server);
	return server;
};

const health = (url: string) => fetch(`${url}/api/health`);

describe("boot", () => {
	test("boot creates the data home directories", async () => {
		const home = join(freshHome(), "nested");
		const server = start(home);

		await server.listening();

		for (const dir of ["db", "attachments", join("attachments", "tmp")]) {
			expect(existsSync(join(home, dir)), dir).toBe(true);
		}
	});

	test("the blob sweep runs before the server accepts requests", async () => {
		const home = freshHome();
		const sha = "ab".repeat(32);
		mkdirSync(join(home, "attachments", "ab"), { recursive: true });
		mkdirSync(join(home, "attachments", "tmp"), { recursive: true });
		writeFileSync(join(home, "attachments", "ab", sha), "orphan");
		writeFileSync(join(home, "attachments", "tmp", "01HZZZ"), "half an upload");
		const server = start(home);

		const { url } = await server.listening();
		expect((await health(url)).status).toBe(200);

		expect(existsSync(join(home, "attachments", "ab", sha))).toBe(false);
		expect(existsSync(join(home, "attachments", "tmp", "01HZZZ"))).toBe(false);
	});

	test("boot migrates before it listens and logs both lines", async () => {
		const home = freshHome();
		const server = start(home);

		const { port } = await server.listening();

		const migrate = server.records.findIndex((record) => record.msg === "migrate");
		const listening = server.records.findIndex((record) => record.msg === "listening");
		expect(migrate).toBeGreaterThanOrEqual(0);
		expect(migrate).toBeLessThan(listening);
		expect(server.records[migrate]!.applied).toBeGreaterThanOrEqual(2);
		expect(server.records[listening]).toMatchObject({ port, home, version: expect.any(String) });
	});

	test("the gh auth check runs without blocking the listen", async () => {
		const home = freshHome();
		const stub = ghStub(mkdtempSync(join(home, "gh-")), {
			"auth status": { stdout: "Logged in to github.com account navid", stderr: "", exitCode: 0, delayMs: 3000 },
		});
		restores.push(stub.restore);
		const server = start(home);

		const { url, at } = await server.listening();
		const response = await health(url);

		expect(response.status).toBe(200);
		expect(Date.now() - at).toBeLessThan(1500);
		expect(stub.spawns().map((spawn) => spawn.args.slice(0, 2).join(" "))).toEqual(["auth status"]);
	});

	// Bun closes a connection that is silent for 10 seconds by default. The
	// first ping comes after 15 seconds, so a quiet stream must outlive that
	// window and still deliver the next event on the same connection.
	// The poller checks gh after 10 seconds. A signed-in gh stub keeps that
	// check from sending a gh.status event into the silent stream.
	test("an event stream stays open through 12 silent seconds", async () => {
		const home = freshHome();
		const stub = ghStub(mkdtempSync(join(home, "gh-")), {
			"auth status": { stdout: "Logged in to github.com account navid", stderr: "", exitCode: 0 },
		});
		restores.push(stub.restore);
		const server = start(home);
		const { url } = await server.listening();
		const stream = readSse(await fetch(`${url}/api/events`));
		expect((await stream.next()).event).toBe("ready");

		await stream.idle(12_000);
		await fetch(`${url}/api/projects`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-trellis-actor": "human:navid" },
			body: JSON.stringify({ key: "IDL", name: "Idle" }),
		});
		const event = await stream.next(2000);

		expect(event.event).toBe("project.created");
	}, 20_000);

	test("a boot failure exits 1 with one line", async () => {
		const home = freshHome();
		mkdirSync(join(home, "db"), { recursive: true });
		writeFileSync(join(home, "db", "PG_VERSION"), "17\n");
		chmodSync(join(home, "db", "PG_VERSION"), 0);
		const server = start(home);

		const code = await server.exited();

		expect(code).toBe(1);
		expect(server.records.find((record) => record.msg === "listening")).toBeUndefined();
		const lines = [...server.stderr, ...server.records.filter((record) => record.level === "error").map((r) => r.msg)];
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/PG_VERSION|db|database|PGlite/i);
	});
});

// The server binds TRELLIS_HOST, and system.health names every URL it
// answers on. `::1` proves the bind: that listener refuses 127.0.0.1 on every
// machine, and the default listener refuses `::1`.
describe("the listen host", () => {
	const healthAt = async (url: string) => (await fetch(`${url}/api/health`)).json() as Promise<{ addresses: string[] }>;

	test("the server binds 127.0.0.1 by default and health lists that one address", async () => {
		const server = start(freshHome());
		const { port } = await server.listening();

		const body = await healthAt(`http://127.0.0.1:${port}`);

		expect(body.addresses).toEqual([`http://127.0.0.1:${port}`]);
		await expect(fetch(`http://[::1]:${port}/api/health`)).rejects.toThrow();
	});

	test("TRELLIS_HOST moves the listener, and health lists its address", async () => {
		const server = spawnServer({ home: freshHome(), env: { TRELLIS_HOST: "::1" } });
		servers.push(server);
		const { port } = await server.listening();

		const body = await healthAt(`http://[::1]:${port}`);

		expect(body.addresses).toEqual([`http://[::1]:${port}`]);
		await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
		expect(server.records.find((record) => record.msg === "listening")).toMatchObject({ host: "::1", port });
	});

	// A VPN tunnel address is listed but refuses a connection from this machine,
	// so the test reaches the first listed address and the loopback one. The
	// first one is the primary network address when the machine has one.
	test("TRELLIS_HOST=0.0.0.0 lists every IPv4 address and answers on the first and on loopback", async () => {
		const server = spawnServer({ home: freshHome(), env: { TRELLIS_HOST: "0.0.0.0" } });
		servers.push(server);
		const { port } = await server.listening();

		const body = await healthAt(`http://127.0.0.1:${port}`);

		expect(body.addresses).toEqual(listenAddresses("0.0.0.0", port, networkInterfaces()));
		expect(body.addresses).toContain(`http://127.0.0.1:${port}`);
		expect((await fetch(`${body.addresses[0]}/api/health`)).status).toBe(200);
	});
});

describe("shutdown", () => {
	test("SIGTERM stops accepting, says bye, closes the database and exits 0", async () => {
		const server = start(freshHome());
		const { url } = await server.listening();
		const stream = readSse(await fetch(`${url}/api/events`));
		expect((await stream.next()).event).toBe("ready");

		server.kill("SIGTERM");
		const bye = await stream.next(5000);
		const closed = await stream.closed();
		const code = await server.exited();

		expect(bye.event).toBe("bye");
		expect(JSON.parse(bye.data!)).toEqual({ reason: "shutdown" });
		expect(closed).toBe(true);
		expect(code).toBe(0);
		expect(server.records.map((record) => record.msg)).toContain("closed");
		await expect(health(url)).rejects.toThrow();
	});

	test("a start hook runs after listen and stops on shutdown", async () => {
		const home = freshHome();
		const order: string[] = [];
		const records: Array<{ msg: string }> = [];
		const exits: number[] = [];
		const hook: StartHook = {
			name: "probe",
			start: () => {
				order.push(`start:${records.some((record) => record.msg === "listening")}`);
			},
			stop: () => {
				order.push("stop");
			},
		};
		const sink = { isTTY: false, write: (line: string) => void records.push(JSON.parse(line)) };

		await boot({
			env: { TRELLIS_HOME: home, TRELLIS_PORT: "0" },
			hooks: [hook],
			exit: (code) => void exits.push(code),
			sink,
		});
		expect(order).toEqual(["start:true"]);
		process.emit("SIGTERM");
		while (exits.length === 0) await Bun.sleep(10);

		expect(order).toEqual(["start:true", "stop"]);
		expect(exits).toEqual([0]);
	});

	test("a second signal exits immediately", async () => {
		const home = freshHome();
		const exits: number[] = [];
		const gate = Promise.withResolvers<void>();
		const hook: StartHook = { name: "slow", start: () => {}, stop: () => gate.promise };
		const sink = { isTTY: false, write: () => {} };

		await boot({
			env: { TRELLIS_HOME: home, TRELLIS_PORT: "0" },
			hooks: [hook],
			exit: (code) => void exits.push(code),
			sink,
		});
		process.emit("SIGTERM");
		await Bun.sleep(50);
		expect(exits).toEqual([]);
		process.emit("SIGTERM");
		await Bun.sleep(50);

		expect(exits).toHaveLength(1);
		gate.resolve();
	});
});
