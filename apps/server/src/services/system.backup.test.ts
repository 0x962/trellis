import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { seedComment, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx } from "../../test/helpers/ctx.ts";
import { type DiskDb, diskDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs, sha256Of } from "../../test/helpers/home.ts";
import { listArchive, restoreBackup } from "../../test/helpers/restore.ts";
import { captureStatements } from "../../test/helpers/statements.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { blobPath } from "../storage/blobs.ts";
import { backup } from "./system.ts";

// A backup checkpoints the database, then tars the data directory and the
// attachments into `<home>/backups`. The archive is a data home again, so a
// restore is an extract. The ten newest archives stay.

let home: string;
let handle: DiskDb;
let db: DiskDb["db"];
beforeAll(async () => {
	home = freshHomeWithDirs();
	handle = await diskDb(join(home, "db"));
	db = handle.db;
});
beforeEach(() => {
	rmSync(join(home, "backups"), { recursive: true, force: true });
	mkdirSync(join(home, "backups"), { recursive: true });
});
afterEach(() => db.transaction(assertStatusInvariant));
afterAll(() => handle.close());

const runBackup = () => {
	const ctx = testCtx({ db, home }).ctx;
	return db.transaction((tx) => backup(ctx, tx, {}));
};

const archives = () => readdirSync(join(home, "backups")).sort();

describe("system.backup", () => {
	test("backup runs CHECKPOINT before it spawns tar", async () => {
		const capture = captureStatements(db.$client);
		const originalSpawn = Bun.spawn;
		const patched = Bun as { spawn: typeof Bun.spawn };
		patched.spawn = ((command: string[], options?: unknown) => {
			capture.texts.push(`spawn ${command.join(" ")}`);
			return originalSpawn(command as string[], options as never);
		}) as typeof Bun.spawn;

		try {
			await runBackup();
		} finally {
			patched.spawn = originalSpawn;
			capture.restore();
		}

		const checkpointAt = capture.texts.findIndex((text) => /checkpoint/i.test(text));
		const tarAt = capture.texts.findIndex((text) => text.startsWith("spawn ") && text.includes("tar"));
		expect(checkpointAt).toBeGreaterThanOrEqual(0);
		expect(tarAt).toBeGreaterThan(checkpointAt);
	});

	test("backup writes one archive of the data directory and the attachments", async () => {
		const bytes = new TextEncoder().encode("a blob in the backup");
		await Bun.write(blobPath(home, sha256Of(bytes)), bytes);

		const result = await runBackup();

		expect(archives()).toHaveLength(1);
		expect(result.path).toBe(join(home, "backups", archives()[0]!));
		expect(result.path).toMatch(/trellis-.*\.tar\.gz$/);
		expect(result.bytes).toBe(statSync(result.path).size);
		const listing = await listArchive(result.path);
		expect(listing.some((entry) => entry.startsWith("db/"))).toBe(true);
		expect(listing.some((entry) => entry.startsWith("attachments/"))).toBe(true);
	});

	test("backup keeps the last ten archives", async () => {
		for (let index = 1; index <= 12; index++) {
			const name = `trellis-2020-01-01T00-00-${String(index).padStart(2, "0")}Z.tar.gz`;
			const path = join(home, "backups", name);
			writeFileSync(path, "old archive");
			const seconds = Date.parse("2020-01-01T00:00:00Z") / 1000 + index;
			utimesSync(path, seconds, seconds);
		}

		const result = await runBackup();

		const kept = archives();
		expect(kept).toHaveLength(10);
		expect(kept).toContain(result.path.split("/").pop()!);
		expect(kept.filter((name) => name.startsWith("trellis-2020"))).toEqual([
			"trellis-2020-01-01T00-00-04Z.tar.gz",
			"trellis-2020-01-01T00-00-05Z.tar.gz",
			"trellis-2020-01-01T00-00-06Z.tar.gz",
			"trellis-2020-01-01T00-00-07Z.tar.gz",
			"trellis-2020-01-01T00-00-08Z.tar.gz",
			"trellis-2020-01-01T00-00-09Z.tar.gz",
			"trellis-2020-01-01T00-00-10Z.tar.gz",
			"trellis-2020-01-01T00-00-11Z.tar.gz",
			"trellis-2020-01-01T00-00-12Z.tar.gz",
		]);
	});

	test("backup vacuums the busy tables once its transaction commits", async () => {
		const vacuums = async () => {
			const found = await db.execute(
				sql`SELECT vacuum_count::int AS n FROM pg_stat_user_tables WHERE relname = 'tickets'`,
			);
			return found.rows[0]!.n as number;
		};
		const before = await vacuums();
		const handle = testCtx({ db, home });

		await db.transaction((tx) => backup(handle.ctx, tx, {}));
		expect(await vacuums()).toBe(before);
		await handle.runAfterCommit();

		expect(await vacuums()).toBe(before + 1);
	});

	test("a restore of the archive reproduces the rows and the blobs", async () => {
		const { rootId, statuses } = await seedProject(db);
		const ticket = await seedTicket(db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		await seedComment(db, ticket, "a comment that must survive");
		const blobs = ["the first blob", "the second blob"].map((text) => new TextEncoder().encode(text));
		for (const bytes of blobs) await Bun.write(blobPath(home, sha256Of(bytes)), bytes);

		const result = await runBackup();
		const into = mkdtempSync(join(process.env.TRELLIS_HOME!, "restore-"));
		const restored = await restoreBackup(result.path, into);

		const tables = ["projects", "statuses", "tickets", "comments", "actors"];
		for (const table of tables) {
			const query = sql`SELECT * FROM ${sql.identifier(table)} ORDER BY 1`;
			const before = await db.execute(query);
			const after = await restored.db.execute(query);
			expect(after.rows).toEqual(before.rows);
		}
		for (const bytes of blobs) {
			expect(await Bun.file(blobPath(into, sha256Of(bytes))).bytes()).toEqual(bytes);
		}
		restored.close();
	});
});
