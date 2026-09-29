import { sql } from "drizzle-orm";
import { withRestoredDatabaseOpen } from "../langflowHost/restoredDatabase";
import { openDb } from "./client.ts";
import { initCluster } from "./initCluster.ts";
import { migrate } from "./migrate.ts";
import { allResourceBlobShas } from "./queries/epicResources.ts";
import { readReconciliationFacts } from "./queries/langflowExecution/reconciliationFacts";
import { allPrFileBlobShas } from "./queries/prFiles.ts";
import { prepareSearch } from "./queries/search.ts";

export type RestoredDatabaseOpenReceipt = Pick<
	Awaited<ReturnType<typeof withRestoredDatabaseOpen>>,
	"receiptId" | "sourceBytes" | "sourceDigest"
>;

// Opens the database of a data home and brings its schema up to date.
// `applied` is the number of migrations this open ran. `liveShas` are the
// hashes that an attachment, pull request file, or epic resource row names.
// The blob sweep keeps those files.
export const openDatabase = async (
	dataDir: string,
	restored?: { home: string; installReceiptId: string; bootId: string },
) => {
	if (restored === undefined) return { ...(await initializeDatabase(dataDir)), restoredOpen: null };
	const opened = await withRestoredDatabaseOpen({ ...restored, dataDir }, async (verified) => {
		const value = await initializeDatabase(dataDir);
		try {
			const sources = await value.db.transaction(readReconciliationFacts);
			return {
				value,
				receipt: { dataDir: verified.dataDir, bootId: verified.bootId, ...sources },
			};
		} catch (error) {
			await value.close();
			throw error;
		}
	});
	const { value, ...restoredOpen } = opened;
	return { ...value, restoredOpen };
};

const initializeDatabase = async (dataDir: string) => {
	await initCluster(dataDir);
	const db = await openDb(dataDir);
	try {
		const applied = await migrate(db);
		await prepareSearch(db);
		const liveShas = async () => {
			const found = await db.execute(sql`SELECT sha256 FROM attachments`);
			const prFiles = await db.transaction(allPrFileBlobShas);
			const resources = await db.transaction(allResourceBlobShas);
			return [...new Set([...found.rows.map((row) => row.sha256 as string), ...prFiles, ...resources])];
		};
		return { db, applied, liveShas, close: () => db.$client.close() };
	} catch (error) {
		await db.$client.close();
		throw error;
	}
};
