import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { initCluster } from "./initCluster.ts";
import { migrate } from "./migrate.ts";
import { allResourceBlobShas } from "./queries/epicResources.ts";
import { allEvidenceBlobShas } from "./queries/prEvidence.ts";

// Opens the database of a data home and brings its schema up to date.
// `applied` is the number of migrations this open ran. `liveShas` are the
// hashes that an attachment, pull request evidence, or epic resource row names.
// The blob sweep keeps those files.
export const openDatabase = async (dataDir: string) => {
	await initCluster(dataDir);
	const db = await openDb(dataDir);
	const applied = await migrate(db);
	const liveShas = async () => {
		const found = await db.execute(sql`SELECT sha256 FROM attachments`);
		const evidence = await db.transaction(allEvidenceBlobShas);
		const resources = await db.transaction(allResourceBlobShas);
		return [...new Set([...found.rows.map((row) => row.sha256 as string), ...evidence, ...resources])];
	};
	return { db, applied, liveShas, close: () => db.$client.close() };
};
