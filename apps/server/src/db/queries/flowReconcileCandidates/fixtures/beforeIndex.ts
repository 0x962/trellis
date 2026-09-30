import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/pglite/migrator";
import { openDb } from "../../../client";

export async function beforeIndex() {
	const source = join(import.meta.dir, "../../../../../drizzle");
	const journal = JSON.parse(await readFile(join(source, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx < 150);
	const directory = await mkdtemp(join(tmpdir(), "trellis-flow-candidates-"));
	const db = await openDb(":memory:");
	try {
		await mkdir(join(directory, "meta"));
		await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
		for (const entry of entries) await copyFile(join(source, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
		await migrate(db, { migrationsFolder: directory });
		return db;
	} catch (error) {
		await db.$client.close();
		throw error;
	} finally {
		await rm(directory, { recursive: true });
	}
}
