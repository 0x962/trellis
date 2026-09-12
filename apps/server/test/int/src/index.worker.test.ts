import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { ghStub } from "../../helpers/gh-stub.ts";
import { freshHome } from "../../helpers/home.ts";
import { authReply, prListReply, rateLimitReply } from "../../helpers/poller.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../../helpers/server.ts";

// The poller and the maintenance timer run on the database worker, beside
// every service call. A job that fails must leave the worker running, or
// the next request finds no worker and the server process stops.
// TRELLIS_CLOCK_RATE=100 runs the jobs 100 times faster than the wall
// clock: the 300 s budget read comes after 3 s and the 120 s detection
// after 1.2 s.

const servers: SpawnedServer[] = [];
const restores: Array<() => void> = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
	for (const restore of restores.splice(0)) restore();
});

// The child inherits process.env, so the stub that ghStub sets reaches it.
const startWithStub = async (replies: Parameters<typeof ghStub>[1]) => {
	const home = freshHome();
	const stub = ghStub(mkdtempSync(join(home, "gh-")), {
		"auth status": authReply,
		"api rate_limit": rateLimitReply(5000),
		"pr list": prListReply([]),
		...replies,
	});
	restores.push(stub.restore);
	const server = spawnServer({ home, env: { TRELLIS_CLOCK_RATE: "100" } });
	servers.push(server);
	const { url } = await server.listening();
	const client = createTrellisClient(url, "human:dana");
	return { stub, server, client };
};

const spawnCount = (stub: { spawns: () => Array<{ args: string[] }> }, first: string, second: string) =>
	stub.spawns().filter((spawn) => spawn.args[0] === first && spawn.args[1] === second).length;

describe("a failed job on the database worker", () => {
	test("a rate_limit reply without resources.core leaves the server serving and logs the reply once", async () => {
		const { stub, server, client } = await startWithStub({
			"api rate_limit": { stdout: JSON.stringify({ resources: {} }), stderr: "", exitCode: 0 },
		});
		while (spawnCount(stub, "api", "rate_limit") < 1) await Bun.sleep(20);
		await Bun.sleep(300);

		await client.projects.create({ key: "CDE", name: "Code" });
		const ticket = await client.tickets.create({ project: "CDE", title: "First" });

		expect(ticket.identifier).toBe("CDE-1");
		const unexpected = server.records.filter((record) => record.msg === "gh rate_limit reply has an unexpected shape");
		expect(unexpected).toHaveLength(1);
		expect(unexpected[0]!.stdout).toBe(JSON.stringify({ resources: {} }));
	}, 15_000);

	test("a poller tick that throws leaves the server serving and logs the error", async () => {
		const { stub, server, client } = await startWithStub({
			"pr list": { stdout: "not json", stderr: "", exitCode: 0 },
		});
		await client.projects.create({ key: "CDE", name: "Code" });
		await client.projects.setRepos({ project: "CDE", repos: [{ owner: "acme", repo: "web" }] });
		while (spawnCount(stub, "pr", "list") < 1) await Bun.sleep(20);
		await Bun.sleep(300);

		const ticket = await client.tickets.create({ project: "CDE", title: "First" });

		expect(ticket.identifier).toBe("CDE-1");
		const failed = server.records.find((record) => record.msg === "poller tick failed");
		expect(failed?.message).toContain("JSON");
	}, 15_000);
});
