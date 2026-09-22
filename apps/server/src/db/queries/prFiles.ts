import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";

export const prFileHoldsBlob = async (tx: Tx, sha256: string) => {
	const [row] = await rows<{ held: boolean }>(
		tx,
		sql`SELECT EXISTS (SELECT 1 FROM pr_files WHERE blob_sha256 = ${sha256}) AS held`,
	);
	return row!.held;
};

export const blobShasOfPullRequest = async (tx: Tx, pullRequestId: string) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT blob_sha256 AS sha256 FROM pr_files WHERE pull_request_id = ${pullRequestId}`,
		)
	).map((row) => row.sha256);

export const allPrFileBlobShas = async (tx: Tx) =>
	(await rows<{ sha256: string }>(tx, sql`SELECT DISTINCT blob_sha256 AS sha256 FROM pr_files`)).map(
		(row) => row.sha256,
	);

// The pull request of the epic that stores each file, newest file first. An
// epic resource shows that number beside the same image.
export const pullRequestNumbersByBlob = async (tx: Tx, epicId: string, shas: string[]) => {
	const found = await rows<{ sha256: string; number: number }>(
		tx,
		sql`SELECT DISTINCT ON (pf.blob_sha256) pf.blob_sha256 AS sha256, pr.number
			FROM pr_files pf
			JOIN pull_requests pr ON pr.id = pf.pull_request_id
			JOIN ticket_pull_requests tpr ON tpr.pull_request_id = pr.id
			JOIN tickets t ON t.id = tpr.ticket_id
			WHERE pf.blob_sha256 = ANY(${textArray(shas)}) AND t.epic_id = ${epicId}
			ORDER BY pf.blob_sha256, pf.created_at DESC, pf.id DESC`,
	);
	return new Map(found.map((row) => [row.sha256, row.number]));
};
