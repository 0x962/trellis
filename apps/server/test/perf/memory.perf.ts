import { afterEach, describe, expect, test } from "bun:test";
import { freshHome } from "../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";

// The idle memory budget from plan.md: the server holds 350 MB or less of
// resident memory while it waits for requests. A first boot on an empty
// home creates the database cluster, so this test covers the costliest boot.

const MB = 1024 * 1024;
const IDLE_RSS_BUDGET = 350 * MB;

// The resident size is flat from about 2 seconds after listening.
const SETTLE_MS = 3000;

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

describe("memory budget", () => {
	test(
		"a first boot on an empty home idles at 350 MB rss or less",
		async () => {
			const server = spawnServer({ home: freshHome() });
			servers.push(server);
			const { url } = await server.listening();
			await Bun.sleep(SETTLE_MS);

			const health = (await (await fetch(`${url}/api/health`)).json()) as { rss: number };

			expect(health.rss).toBeLessThanOrEqual(IDLE_RSS_BUDGET);
		},
		{ timeout: 30_000 },
	);
});
