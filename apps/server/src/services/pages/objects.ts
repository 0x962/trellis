import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { gcPageObjects as collect } from "../../storage/pageObjects.ts";
import type { ServiceCtx } from "../support.ts";

export type PageObject = { sha256: string; size: number };

export const pageObjects = (tx: Tx, projectId?: string) =>
	rows<PageObject>(
		tx,
		sql`
	SELECT u.sha256, u.size FROM page_uploads u ${projectId === undefined ? sql`` : sql`WHERE u.project_id = ${projectId}`}
	UNION SELECT v.document_sha256 AS sha256, v.document_size AS size
	FROM page_versions v JOIN pages p ON p.id = v.page_id
	${projectId === undefined ? sql`` : sql`WHERE p.project_id = ${projectId}`}
	UNION SELECT a.sha256, a.size FROM page_assets a JOIN pages p ON p.id = a.page_id
	${projectId === undefined ? sql`` : sql`WHERE p.project_id = ${projectId}`}
`,
	);

export const holdsPageObject = async (tx: Tx, sha256: string) => {
	const [row] = await rows<{ held: boolean }>(
		tx,
		sql`SELECT (
		EXISTS (SELECT 1 FROM page_uploads WHERE sha256 = ${sha256})
		OR EXISTS (SELECT 1 FROM page_versions WHERE document_sha256 = ${sha256})
		OR EXISTS (SELECT 1 FROM page_assets WHERE sha256 = ${sha256})
	) AS held`,
	);
	return row!.held;
};

export const gcPageObjects = (ctx: Pick<ServiceCtx, "home" | "newTx">, shas: string[]) =>
	collect(ctx.home, shas, (sha256) => ctx.newTx((tx) => holdsPageObject(tx, sha256)));
