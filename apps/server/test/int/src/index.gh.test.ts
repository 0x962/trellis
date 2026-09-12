import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createTrellisClient, type Health } from "@trellis/api";
import { checkRun, graphqlReply } from "../../fixtures/graphql.ts";
import { ghStub } from "../../helpers/gh-stub.ts";
import { freshHome } from "../../helpers/home.ts";
import { authReply, prListReply, rateLimitReply, signedOutReply } from "../../helpers/poller.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../../helpers/server.ts";
import { readSse } from "../../helpers/sse.ts";

// The health route reports the gh state of the running server. The boot
// check sets it first, and each gh.status result of the poller sets it
// after that, so a sign-out shows in health with no restart.
// TRELLIS_CLOCK_RATE=100 makes the 30 s pending cadence take 300 ms.

const servers: SpawnedServer[] = [];
const restores: Array<() => void> = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
	for (const restore of restores.splice(0)) restore();
});

const healthOf = async (url: string) => (await (await fetch(`${url}/api/health`)).json()) as Health;

test("health.gh turns signed out after a poller tick reports a sign-out, with no restart", async () => {
	const home = freshHome();
	const stub = ghStub(mkdtempSync(join(home, "gh-")), {
		"auth status": authReply,
		"api rate_limit": rateLimitReply(5000),
		"pr list": prListReply([]),
		"api graphql": graphqlReply([{ number: 12, checks: [checkRun("build", null)] }]),
	});
	restores.push(stub.restore);
	const server = spawnServer({ home, env: { TRELLIS_CLOCK_RATE: "100" } });
	servers.push(server);
	const { url } = await server.listening();
	await server.waitFor("gh");
	expect((await healthOf(url)).gh).toMatchObject({ ok: true, user: "dana" });

	const client = createTrellisClient(url, "human:dana");
	await client.projects.create({ key: "CDE", name: "Code" });
	await client.tickets.create({ project: "CDE", title: "First" });
	await client.pullRequests.link({ ticket: "CDE-1", url: "https://github.com/acme/web/pull/12" });
	const stream = readSse(await fetch(`${url}/api/events?types=gh.status`));
	expect((await stream.next()).event).toBe("ready");

	stub.reply("api graphql", signedOutReply);
	const event = await stream.next(3000);

	expect(JSON.parse(event.data!)).toMatchObject({ ok: false, reason: "unauthenticated" });
	expect((await healthOf(url)).gh).toMatchObject({ ok: false, user: null, reason: "unauthenticated" });
	expect(server.records.filter((record) => record.msg === "listening")).toHaveLength(1);
}, 15_000);
