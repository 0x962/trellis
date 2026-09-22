import { type PullRequestFile, PullRequestFileIdInputSchema, PullRequestFileUploadInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { storedMime, storeFile } from "../../storage/blobs.ts";
import { findPullRequestRow } from "../findPullRequestRow.ts";
import { fail, notFound, type PrepareCtx, type ServiceCtx, touchActor } from "../support.ts";

type FileRow = {
	id: string;
	pull_request_id: string;
	blob_sha256: string;
	filename: string;
	mime: string;
	size: number;
};

// A summary written before `pr_files` existed points at this same path, so the
// path keeps its `/api/evidence/` prefix.
export const prFileUrl = (id: string) => `/api/evidence/${id}/file`;

const toFile = (row: FileRow): PullRequestFile => ({
	id: row.id,
	pullRequestId: row.pull_request_id,
	sha256: row.blob_sha256,
	url: prFileUrl(row.id),
	filename: row.filename,
	mime: row.mime,
	size: Number(row.size),
});

const find = async (tx: Tx, id: string): Promise<FileRow | undefined> => {
	const [row] = await rows<FileRow>(
		tx,
		sql`SELECT id, pull_request_id, blob_sha256, filename, mime, size FROM pr_files WHERE id = ${id}`,
	);
	return row;
};

export const read = async (_ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<PullRequestFile> => {
	const input = PullRequestFileIdInputSchema.parse(rawInput);
	const row = await find(tx, input.fileId);
	if (row === undefined) throw notFound("pull request file", input.fileId);
	return toFile(row);
};

type PreparedUpload = { id: string; fileId: string; sha256: string; filename: string; mime: string; size: number };

export const prepareUpload = async (ctx: PrepareCtx, rawInput: unknown): Promise<PreparedUpload> => {
	const input = PullRequestFileUploadInputSchema.parse(rawInput);
	await ctx.newTx((tx) => findPullRequestRow(tx, input.id));
	if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	const stored = await storeFile(ctx.home, input.file);
	return {
		id: input.id,
		fileId: input.fileId,
		sha256: stored.sha256,
		filename: input.file.name,
		mime: storedMime(input.file.type),
		size: stored.size,
	};
};

// A repeated upload with the same file id and the same bytes answers the
// stored file, so a client can retry a lost reply.
export const upload = async (ctx: ServiceCtx, tx: Tx, input: PreparedUpload): Promise<PullRequestFile> => {
	const existing = await find(tx, input.fileId);
	if (existing !== undefined) {
		if (existing.pull_request_id !== input.id || existing.blob_sha256 !== input.sha256)
			throw fail("DUPLICATE", { field: "fileId" });
		return toFile(existing);
	}
	const pullRequest = await findPullRequestRow(tx, input.id);
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`INSERT INTO pr_files (
		id, pull_request_id, blob_sha256, filename, mime, size, actor_name, actor_kind, created_at
	) VALUES (
		${input.fileId}, ${pullRequest.id}, ${input.sha256}, ${input.filename}, ${input.mime}, ${input.size},
		${ctx.actor.name}, ${ctx.actor.kind}, ${at}
	)`);
	return toFile((await find(tx, input.fileId))!);
};
