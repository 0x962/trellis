import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { initCluster } from "./initCluster.ts";
import { migrate } from "./migrate.ts";
import { allEvidenceBlobShas } from "./queries/prEvidence.ts";

// Opens the database of a data home and brings its schema up to date.
// `applied` is the number of migrations this open ran. `liveShas` are the
// hashes that an attachment or evidence row names, which the blob sweep keeps.
export const openDatabase = async (dataDir: string) => {
	await initCluster(dataDir);
	const db = await openDb(dataDir);
	const applied = await migrate(db);
	const liveShas = async () => {
		const found = await db.execute(sql`SELECT sha256 FROM attachments`);
		const evidence = await db.transaction(allEvidenceBlobShas);
		return [...new Set([...found.rows.map((row) => row.sha256 as string), ...evidence])];
	};
	return { db, applied, liveShas, close: () => db.$client.close() };
};
