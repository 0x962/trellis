import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows } from "./support.ts";

export const evidenceHoldsBlob = async (tx: Tx, sha256: string) => {
	const [row] = await rows<{ held: boolean }>(
		tx,
		sql`SELECT EXISTS (
			SELECT 1 FROM pr_evidence WHERE blob_sha256 = ${sha256}
			UNION ALL SELECT 1 FROM epic_resources WHERE blob_sha256 = ${sha256}
		) AS held`,
	);
	return row!.held;
};

export const blobShasOfPullRequest = async (tx: Tx, pullRequestId: string) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT blob_sha256 AS sha256 FROM pr_evidence
				WHERE pull_request_id = ${pullRequestId} AND blob_sha256 IS NOT NULL`,
		)
	).map((row) => row.sha256);

export const allEvidenceBlobShas = async (tx: Tx) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT sha256 FROM (
				SELECT blob_sha256 AS sha256 FROM pr_evidence WHERE blob_sha256 IS NOT NULL
				UNION ALL SELECT blob_sha256 AS sha256 FROM epic_resources WHERE blob_sha256 IS NOT NULL
			) blobs`,
		)
	).map((row) => row.sha256);
