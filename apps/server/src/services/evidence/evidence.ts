import { type PullRequestEvidence, PullRequestEvidenceWriteInputSchema, PullRequestIdInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { findPullRequestRow } from "../findPullRequestRow.ts";
import { parseGhJsonForService } from "../ghJson.ts";
import { announcePullRequestUpdate, setHeadSha } from "../pullRequests.ts";
import { fail, type PrepareCtx, type ServiceCtx, touchActor } from "../support.ts";

type EvidenceRow = {
	pull_request_id: string;
	head_sha: string;
	body: string;
	actor_name: string;
	actor_kind: PullRequestEvidence["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

const columns = sql`
	e.pull_request_id, e.head_sha, e.body, e.actor_name, e.actor_kind,
	${actorDisplayName(sql`e.actor_name`, sql`e.actor_kind`)} AS actor_display_name,
	${iso(sql`e.created_at`)} AS created_at, ${iso(sql`e.updated_at`)} AS updated_at
`;

const toEvidence = (row: EvidenceRow): PullRequestEvidence => ({
	pullRequestId: row.pull_request_id,
	headSha: row.head_sha,
	body: row.body,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const find = async (tx: Tx, pullRequestId: string): Promise<EvidenceRow | undefined> => {
	const [row] = await rows<EvidenceRow>(
		tx,
		sql`SELECT ${columns} FROM pr_evidence_documents e WHERE e.pull_request_id = ${pullRequestId}`,
	);
	return row;
};

export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestEvidence | null> => {
	const input = PullRequestIdInputSchema.parse(rawInput);
	const pullRequest = await findPullRequestRow(tx, input.id);
	const row = await find(tx, pullRequest.id);
	return row === undefined ? null : toEvidence(row);
};

type WriteInput = ReturnType<typeof PullRequestEvidenceWriteInputSchema.parse>;

// The document records the head it was written for, so the head must be the
// one GitHub reports now.
export const prepareWrite = async (ctx: PrepareCtx, rawInput: unknown): Promise<WriteInput> => {
	const input = PullRequestEvidenceWriteInputSchema.parse(rawInput);
	const pullRequest = await ctx.newTx((tx) => findPullRequestRow(tx, input.id));
	const args = ["pr", "view", pullRequest.url, "--json", "headRefOid"];
	const result = await ctx.gh("interactive", args);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const { headRefOid } = parseGhJsonForService<{ headRefOid: string }>(args, result);
	if (headRefOid !== input.headSha)
		throw invalidInput("headSha", "headSha does not match the current pull request head.");
	return input;
};

export const write = async (ctx: ServiceCtx, tx: Tx, input: WriteInput): Promise<PullRequestEvidence> => {
	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await setHeadSha(tx, { id: pullRequest.id, headSha: input.headSha });
	await tx.execute(sql`INSERT INTO pr_evidence_documents
		(pull_request_id, head_sha, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${pullRequest.id}, ${input.headSha}, ${input.body}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at})
		ON CONFLICT (pull_request_id) DO UPDATE SET
			head_sha = EXCLUDED.head_sha, body = EXCLUDED.body,
			actor_name = EXCLUDED.actor_name, actor_kind = EXCLUDED.actor_kind,
			updated_at = EXCLUDED.updated_at`);
	await announcePullRequestUpdate(ctx, tx, pullRequest);
	return toEvidence((await find(tx, pullRequest.id))!);
};
