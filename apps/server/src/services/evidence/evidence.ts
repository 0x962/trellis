import { isDeepStrictEqual } from "node:util";
import { type Evidence, EvidenceIdInputSchema, EvidenceListInputSchema, EvidenceWriteInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { storedMime, storeFile } from "../attachments.ts";
import { findPullRequestRow } from "../findPullRequestRow.ts";
import { fail, notFound, type PrepareCtx, type ServiceCtx, touchActor } from "../support.ts";

type EvidenceRow = {
	id: string;
	pull_request_id: string;
	head_sha: string;
	kind: Evidence["kind"];
	record: Evidence["record"];
	blob_sha256: string | null;
	actor_name: string;
	actor_kind: Evidence["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
};

const columns = sql`
	e.id, e.pull_request_id, e.head_sha, e.kind, e.record, e.blob_sha256,
	e.actor_name, e.actor_kind,
	${actorDisplayName(sql`e.actor_name`, sql`e.actor_kind`)} AS actor_display_name,
	${iso(sql`e.created_at`)} AS created_at
`;

export const fileUrl = (id: string) => `/api/pr-evidence/${id}/file`;

const toEvidence = (row: EvidenceRow): Evidence => ({
	id: row.id,
	pullRequestId: row.pull_request_id,
	headSha: row.head_sha,
	kind: row.kind,
	record: row.record,
	blob: row.blob_sha256 === null ? null : { sha256: row.blob_sha256, url: fileUrl(row.id) },
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
});

const find = async (tx: Tx, id: string): Promise<EvidenceRow | undefined> => {
	const [row] = await rows<EvidenceRow>(tx, sql`SELECT ${columns} FROM pr_evidence e WHERE e.id = ${id}`);
	return row;
};

export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Evidence> => {
	const input = EvidenceIdInputSchema.parse(rawInput);
	const row = await find(tx, input.evidenceId);
	if (row === undefined) throw notFound("evidence", input.evidenceId);
	return toEvidence(row);
};

export const list = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Evidence[]> => {
	const input = EvidenceListInputSchema.parse(rawInput);
	await findPullRequestRow(tx, input.id);
	return (
		await rows<EvidenceRow>(
			tx,
			sql`SELECT ${columns} FROM pr_evidence e
				WHERE e.pull_request_id = ${input.id}
				ORDER BY e.created_at DESC, e.id DESC`,
		)
	).map(toEvidence);
};

type PreparedWrite = Pick<
	ReturnType<typeof EvidenceWriteInputSchema.parse>,
	"id" | "evidenceId" | "headSha" | "kind"
> & {
	record: Evidence["record"];
	blobSha256: string | null;
};

export const prepareWrite = async (ctx: PrepareCtx, rawInput: unknown): Promise<PreparedWrite> => {
	const input = EvidenceWriteInputSchema.parse(rawInput);
	const pullRequest = await ctx.newTx((tx) => findPullRequestRow(tx, input.id));
	const result = await ctx.gh("interactive", ["pr", "view", pullRequest.url, "--json", "headRefOid"]);
	if (!result.ok) throw fail("GH_UNAVAILABLE", { reason: result.reason });
	const { headRefOid } = JSON.parse(result.stdout) as { headRefOid: string };
	if (headRefOid !== input.headSha)
		throw invalidInput("headSha", "headSha does not match the current pull request head.");
	const writeInput = {
		id: input.id,
		evidenceId: input.evidenceId,
		headSha: input.headSha,
		kind: input.kind,
		record: input.record,
	};
	const file = "file" in input ? input.file : undefined;
	if (file === undefined) return { ...writeInput, blobSha256: null };
	if (file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	const stored = await storeFile(ctx.home, file);
	return {
		...writeInput,
		record: {
			...input.record,
			blob: {
				filename: file.name,
				mime: storedMime(file.type),
				size: stored.size,
			},
		},
		blobSha256: stored.sha256,
	};
};

const sameWrite = (row: EvidenceRow, ctx: ServiceCtx, input: PreparedWrite) =>
	row.pull_request_id === input.id &&
	row.head_sha === input.headSha &&
	row.kind === input.kind &&
	row.blob_sha256 === input.blobSha256 &&
	row.actor_name === ctx.actor.name &&
	row.actor_kind === ctx.actor.kind &&
	isDeepStrictEqual(row.record, input.record);

export const write = async (ctx: ServiceCtx, tx: Tx, input: PreparedWrite): Promise<Evidence> => {
	const existing = await find(tx, input.evidenceId);
	if (existing !== undefined) {
		if (!sameWrite(existing, ctx, input)) throw invalidInput("evidenceId", "This id identifies another record.");
		return toEvidence(existing);
	}
	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`UPDATE pull_requests SET head_sha = ${input.headSha} WHERE id = ${pullRequest.id}`);
	await tx.execute(sql`INSERT INTO pr_evidence (
		id, pull_request_id, head_sha, kind, record, blob_sha256, actor_name, actor_kind, created_at
	) VALUES (
		${input.evidenceId}, ${pullRequest.id}, ${input.headSha}, ${input.kind},
		${JSON.stringify(input.record)}::jsonb, ${input.blobSha256}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}
	)`);
	const links = await rows<{ ticket_id: string; project_id: string }>(
		tx,
		sql`SELECT link.ticket_id, ticket.project_id
			FROM ticket_pull_requests link JOIN tickets ticket ON ticket.id = link.ticket_id
			WHERE link.pull_request_id = ${pullRequest.id}`,
	);
	if (links.length > 0)
		await tx.execute(
			sql`UPDATE tickets SET version = version + 1 WHERE id = ANY(${textArray(links.map((link) => link.ticket_id))})`,
		);
	ctx.emit({
		type: "pr.updated",
		id: pullRequest.id,
		ticketIds: links.map((link) => link.ticket_id),
		projectIds: [...new Set(links.map((link) => link.project_id))],
		state: pullRequest.state,
		ciState: pullRequest.ci_state,
	});
	return toEvidence((await find(tx, input.evidenceId))!);
};
