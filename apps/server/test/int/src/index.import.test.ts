import { afterEach, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshHome } from "../../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../../helpers/server.ts";

let server: SpawnedServer | undefined;
afterEach(async () => {
	if (server) await stopServer(server);
});

test("an incomplete home import cannot open or migrate its database", async () => {
	const home = freshHome();
	writeFileSync(join(home, "import-in-progress.json"), JSON.stringify({ source: "/fixture/source" }));
	server = spawnServer({ home });
	expect(await server.exited()).toBe(1);
	expect(server.records.some((record) => record.msg.includes("home-import rollback"))).toBe(true);
	expect(server.records.some((record) => record.msg === "migrate")).toBe(false);
	expect(existsSync(join(home, "db"))).toBe(false);
});
