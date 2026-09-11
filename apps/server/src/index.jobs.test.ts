import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { checkRun, graphqlReply } from "../test/fixtures/graphql.ts";
import { ghStub } from "../test/helpers/gh-stub.ts";
import { freshHome } from "../test/helpers/home.ts";
import { authReply, prListReply, rateLimitReply } from "../test/helpers/poller.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../test/helpers/server.ts";
import { readSse } from "../test/helpers/sse.ts";

// The production boot starts the pull request poller and the maintenance
// timer, so PR and CI status changes reach a ticket with no refresh call.
// TRELLIS_CLOCK_RATE=100 runs the clock of those jobs 100 times faster than
// the wall clock: the 10 s tick takes 100 ms and the 30 s pending cadence
// takes 300 ms.

const servers: SpawnedServer[] = [];
const restores: Array<() => void> = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
	for (const restore of restores.splice(0)) restore();
});

const PR_URL = "https://github.com/acme/web/pull/12";

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
	await server.waitFor("gh");
	const client = createTrellisClient(url, "human:dana");
	return { home, stub, server, url, client };
};

const eventsOf = async (url: string, types: string) => {
	const stream = readSse(await fetch(`${url}/api/events?types=${types}`));
	expect((await stream.next()).event).toBe("ready");
	return stream;
};

describe("the live poller", () => {
	test("a linked pull request whose checks go from pending to pass updates the ticket with no refresh call", async () => {
		const { stub, url, client } = await startWithStub({
			"api graphql": graphqlReply([{ number: 12, checks: [checkRun("build", null)] }]),
		});
		await client.projects.create({ key: "CDE", name: "Code" });
		await client.tickets.create({ project: "CDE", title: "First" });
		const linked = await client.pullRequests.link({ ticket: "CDE-1", url: PR_URL });
		expect(linked.ciState).toBe("pending");
		const stream = await eventsOf(url, "pr.updated");

		stub.reply("api graphql", graphqlReply([{ number: 12, checks: [checkRun("build", "SUCCESS")] }]));
		const updated = await stream.next(2000);

		expect(updated.event).toBe("pr.updated");
		expect(JSON.parse(updated.data!)).toMatchObject({ id: linked.id, ciState: "pass" });
		expect(await stream.idle(1500)).toBe(true);
		const ticket = await client.tickets.get({ ticket: "CDE-1" });
		expect(ticket.pr?.ciState).toBe("pass");
	});

	test("a branch named cde-2-foo in the open pull request list links to CDE-2 as system:trellis", async () => {
		const { url, client } = await startWithStub({
			"pr list": prListReply([{ number: 21, title: "Foo", headRefName: "cde-2-foo" }]),
			"api graphql": graphqlReply([{ number: 21, title: "Foo", headRefName: "cde-2-foo" }]),
		});
		const stream = await eventsOf(url, "pr.linked");
		await client.projects.create({ key: "CDE", name: "Code" });
		await client.tickets.create({ project: "CDE", title: "First" });
		await client.tickets.create({ project: "CDE", title: "Second" });
		await client.projects.setRepos({ project: "CDE", repos: [{ owner: "acme", repo: "web" }] });

		const event = await stream.next(3000);

		expect(event.event).toBe("pr.linked");
		const prs = await client.pullRequests.list({ ticket: "CDE-2" });
		expect(prs).toHaveLength(1);
		expect(prs[0]).toMatchObject({
			number: 21,
			source: "auto",
			linkedBy: { name: "trellis", kind: "system" },
		});
		expect(await client.pullRequests.list({ ticket: "CDE-1" })).toEqual([]);
	});
});

describe("the shutdown", () => {
	test("SIGTERM drains the poller tick in flight before the worker closes", async () => {
		const { stub, server, client } = await startWithStub({
			"api graphql": { ...graphqlReply([{ number: 12, checks: [checkRun("build", null)] }]), delayMs: 1500 },
		});
		await client.projects.create({ key: "CDE", name: "Code" });
		await client.tickets.create({ project: "CDE", title: "First" });
		await client.pullRequests.link({ ticket: "CDE-1", url: PR_URL });
		const graphqlSpawns = () => stub.spawns().filter((spawn) => spawn.args[1] === "graphql");
		while (graphqlSpawns().length < 2) await Bun.sleep(20);
		const pollerSpawnAt = graphqlSpawns()[1]!.at;

		server.kill("SIGTERM");
		const code = await server.exited();

		expect(code).toBe(0);
		const messages = server.records.map((record) => record.msg);
		const stopped = messages.indexOf("poller stopped");
		expect(stopped).toBeGreaterThanOrEqual(0);
		expect(stopped).toBeLessThan(messages.indexOf("closed"));
		const record = server.records[stopped]!;
		expect(record.drained).toBe(true);
		expect(Date.parse(record.ts as string)).toBeGreaterThanOrEqual(pollerSpawnAt + 1400);
	}, 15_000);
});
