import { sql } from "drizzle-orm";
import { type PullRequestRow, pullRequestColumns } from "../db/queries/pullRequestRows.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { notFound } from "./support.ts";

export const findPullRequestRow = async (tx: Tx, id: string): Promise<PullRequestRow> => {
	const [row] = await rows<PullRequestRow>(
		tx,
		sql`SELECT ${pullRequestColumns} FROM pull_requests p WHERE p.id = ${id}`,
	);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};
