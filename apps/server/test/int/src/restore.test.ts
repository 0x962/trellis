import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { restoreHome } from "../../../src/restore.ts";
import { backup } from "../../../src/services/system.ts";
import { seedProject } from "../../fixtures";
import { testCtx } from "../../helpers/ctx.ts";
import { diskDb } from "../../helpers/db.ts";
import { freshHomeWithDirs } from "../../helpers/home.ts";

// A restore swaps the database and the attachments of the data home for the
// ones in the archive. Every other file of the home stays: the backup
// archives, the server log and its rotations, and the launchd log.

const archivesOf = (home: string) => readdirSync(join(home, "backups")).sort();

describe("restoreHome", () => {
	test("a restore keeps every backup archive and every log of the home", async () => {
		const home = freshHomeWithDirs();
		const handle = await diskDb(join(home, "db"));
		await seedProject(handle.db);
		const ctx = testCtx({ db: handle.db, home }).ctx;
		const first = await handle.db.transaction((tx) => backup(ctx, tx, {}));
		await Bun.sleep(5);
		await handle.db.transaction((tx) => backup(ctx, tx, {}));
		handle.close();
		const before = archivesOf(home);
		expect(before).toHaveLength(2);
		const logs = { "server.log": "the live log\n", "server.log.1": "a rotated log\n", "launchd.log": "launchd\n" };
		for (const [name, text] of Object.entries(logs)) writeFileSync(join(home, name), text);

		await restoreHome(home, first.path);

		expect(archivesOf(home)).toEqual(before);
		for (const [name, text] of Object.entries(logs)) expect(readFileSync(join(home, name), "utf8")).toBe(text);
		const restored = await diskDb(join(home, "db"));
		const projects = await restored.db.execute(sql`SELECT count(*)::int AS n FROM projects`);
		expect(projects.rows[0]).toEqual({ n: 1 });
		await restored.close();
		expect(readdirSync(join(home, "..")).some((name) => name.includes(".previous-"))).toBe(false);
		expect(existsSync(join(home, "attachments"))).toBe(true);
	});
});
