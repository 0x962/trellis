import type { LocalPrState, PullRequest } from "@trellis/api";
import { sql } from "drizzle-orm";
import { toPullRequest } from "../db/queries/pullRequestRows.ts";
import type { Tx } from "../db/tx.ts";
import { findPullRequestRow } from "./findPullRequestRow.ts";
import { announcePullRequestUpdate } from "./pullRequests.ts";
import type { ServiceCtx } from "./support.ts";

export type SetLocalStateInput = { id: string; localState: LocalPrState };

// `trellis ready` sets `ready` after its checks pass, and a person flips the
// state by hand from the pull request sheet. GitHub never sees this state,
// and a poll or a push leaves it as it is. The update event bumps the
// version of every linked ticket, so each open page reads the new glyph.
export const setLocalState = async (ctx: ServiceCtx, tx: Tx, input: SetLocalStateInput): Promise<PullRequest> => {
	const row = await findPullRequestRow(tx, input.id);
	if (row.local_state === input.localState) return toPullRequest(row);
	await tx.execute(sql`UPDATE pull_requests SET local_state = ${input.localState} WHERE id = ${row.id}`);
	const updated = await findPullRequestRow(tx, row.id);
	await announcePullRequestUpdate(ctx, tx, updated);
	return toPullRequest(updated);
};
