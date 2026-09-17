import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { initCluster } from "./initCluster.ts";
import { migrate } from "./migrate.ts";

// Opens the database of a data home and brings its schema up to date.
// `applied` is the number of migrations this open ran. `liveShas` are the
// hashes an attachment row still names, which the blob sweep keeps.
export const openDatabase = async (dataDir: string) => {
	await initCluster(dataDir);
	const db = await openDb(dataDir);
	const applied = await migrate(db);
	const liveShas = async () => {
		const found = await db.execute(sql`SELECT sha256 FROM attachments`);
		return found.rows.map((row) => row.sha256 as string);
	};
	return { db, applied, liveShas, close: () => db.$client.close() };
};
