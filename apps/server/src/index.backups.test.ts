import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshHome } from "../test/helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../test/helpers/server.ts";

// A backup that stops halfway, because the process died, leaves its snapshot
// copy and its partial archive under `backups/`. The next boot removes both
// before the server accepts requests, and keeps every finished archive.

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

test("boot removes the snapshot and the partial archive of an interrupted backup", async () => {
	const home = freshHome();
	const backups = join(home, "backups");
	mkdirSync(join(backups, "snapshot-2026-09-09T10-00-00-000Z", "db"), { recursive: true });
	writeFileSync(join(backups, "snapshot-2026-09-09T10-00-00-000Z", "db", "PG_VERSION"), "17");
	writeFileSync(join(backups, "trellis-2026-09-09T10-00-00-000Z.tar.gz.partial"), "half an archive");
	writeFileSync(join(backups, "trellis-2026-09-08T10-00-00-000Z.tar.gz"), "a finished archive");
	const server = spawnServer({ home });
	servers.push(server);

	await server.listening();

	expect(readdirSync(backups)).toEqual(["trellis-2026-09-08T10-00-00-000Z.tar.gz"]);
});
