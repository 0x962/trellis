import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../src/db/client.ts";

// A backup archive holds `db/` and `attachments/` of one data home. The
// helper extracts an archive into an empty directory, which makes that
// directory a data home again, and opens the database it holds.

export const listArchive = async (archive: string): Promise<string[]> => {
	const proc = Bun.spawn(["tar", "-tzf", archive], { stdout: "pipe", stderr: "pipe" });
	const [text] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), proc.exited]);
	return text.split("\n").filter((line) => line.length > 0);
};

export const restoreBackup = async (archive: string, into: string) => {
	mkdirSync(into, { recursive: true });
	const proc = Bun.spawn(["tar", "-xzf", archive, "-C", into], { stdout: "pipe", stderr: "pipe" });
	await proc.exited;
	const db = await openDb(join(into, "db"));
	return { db, home: into, close: () => db.$client.close() };
};
