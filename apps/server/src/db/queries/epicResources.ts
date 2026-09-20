import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { rows, textArray } from "./support.ts";

export const resourceHoldsBlob = async (tx: Tx, sha256: string) => {
	const [row] = await rows<{ held: boolean }>(
		tx,
		sql`SELECT EXISTS (SELECT 1 FROM epic_resources WHERE blob_sha256 = ${sha256}) AS held`,
	);
	return row!.held;
};

export const allResourceBlobShas = async (tx: Tx) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT blob_sha256 AS sha256 FROM epic_resources WHERE blob_sha256 IS NOT NULL`,
		)
	).map((row) => row.sha256);

export const resourceBlobShasOfEpic = async (tx: Tx, epicId: string) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT blob_sha256 AS sha256 FROM epic_resources
				WHERE epic_id = ${epicId} AND blob_sha256 IS NOT NULL`,
		)
	).map((row) => row.sha256);

export const resourceBlobShasOfProjects = async (tx: Tx, projectIds: string[]) =>
	(
		await rows<{ sha256: string }>(
			tx,
			sql`SELECT DISTINCT er.blob_sha256 AS sha256 FROM epic_resources er
				JOIN epics e ON e.id = er.epic_id
				WHERE e.project_id = ANY(${textArray(projectIds)}) AND er.blob_sha256 IS NOT NULL`,
		)
	).map((row) => row.sha256);
