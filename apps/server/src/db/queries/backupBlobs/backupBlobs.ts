import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

export const listBackupBlobs = (tx: Tx) =>
	rows<{ sha256: string }>(
		tx,
		sql`SELECT sha256 FROM attachments
		UNION SELECT blob_sha256 AS sha256 FROM pr_files
		UNION SELECT blob_sha256 AS sha256 FROM epic_resources WHERE blob_sha256 IS NOT NULL`,
	);
