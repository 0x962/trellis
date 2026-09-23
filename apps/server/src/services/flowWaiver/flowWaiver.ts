import {
	type PullRequestFlowWaiver,
	PullRequestFlowWaiverWriteInputSchema,
	PullRequestIdInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { findPullRequestRow } from "../findPullRequestRow.ts";
import { announcePullRequestUpdate } from "../pullRequests.ts";
import { type ServiceCtx, touchActor } from "../support.ts";

type WaiverRow = {
	pull_request_id: string;
	head_sha: string;
	reason: string;
	actor_name: string;
	actor_kind: PullRequestFlowWaiver["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

const columns = sql`
	w.pull_request_id, w.head_sha, w.reason, w.actor_name, w.actor_kind,
	${actorDisplayName(sql`w.actor_name`, sql`w.actor_kind`)} AS actor_display_name,
	${iso(sql`w.created_at`)} AS created_at, ${iso(sql`w.updated_at`)} AS updated_at
`;

const toWaiver = (row: WaiverRow): PullRequestFlowWaiver => ({
	pullRequestId: row.pull_request_id,
	headSha: row.head_sha,
	reason: row.reason,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

// The newest sentence the pull request carries, at any head. It answers the
// flow check of `trellis ready`. Two heads written in the same moment break
// the tie on the row that was created last.
export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestFlowWaiver | null> => {
	const input = PullRequestIdInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const [row] = await rows<WaiverRow>(
		tx,
		sql`SELECT ${columns} FROM pr_flow_waivers w WHERE w.pull_request_id = ${pullRequest.id}
			ORDER BY w.updated_at DESC, w.created_at DESC LIMIT 1`,
	);
	return row === undefined ? null : toWaiver(row);
};

// A second write at the same head replaces the sentence and keeps the first
// `created_at`, the way the evidence document does.
export const write = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestFlowWaiver> => {
	const input = PullRequestFlowWaiverWriteInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(
		sql`INSERT INTO pr_flow_waivers (pull_request_id, head_sha, reason, actor_name, actor_kind, created_at, updated_at)
			VALUES (${pullRequest.id}, ${input.headSha}, ${input.reason}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at})
			ON CONFLICT (pull_request_id, head_sha) DO UPDATE SET
				reason = EXCLUDED.reason, actor_name = EXCLUDED.actor_name,
				actor_kind = EXCLUDED.actor_kind, updated_at = EXCLUDED.updated_at`,
	);
	const [row] = await rows<WaiverRow>(
		tx,
		sql`SELECT ${columns} FROM pr_flow_waivers w
			WHERE w.pull_request_id = ${pullRequest.id} AND w.head_sha = ${input.headSha}`,
	);
	await announcePullRequestUpdate(ctx, tx, pullRequest);
	return toWaiver(row as WaiverRow);
};
