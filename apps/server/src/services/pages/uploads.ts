import { PAGE_ASSET_MAX_BYTES, PageMimeSchema, type PageUpload, PageUploadInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { storedMime } from "../../storage/blobs.ts";
import {
	discardPageObject,
	finalizePageObject,
	type StagedPageObject,
	stagePageObject,
} from "../../storage/pageObjects.ts";
import { assertProjectActive, resolveProject } from "../refs.ts";
import { fail, type IoCtx, type PrepareCtx, touchActor } from "../support.ts";
import { type RawUpload, toPageUpload, uploadColumns } from "./rows.ts";

export const PAGE_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const findUpload = async (tx: Tx, id: string) => {
	const [row] = await rows<RawUpload>(tx, sql`SELECT ${uploadColumns} FROM page_uploads u WHERE u.id = ${id}`);
	return row;
};

type PreparedUpload = {
	id: string;
	projectId: string;
	mime: string;
	originalName: string;
	staged: StagedPageObject;
};

const storedPageMime = (type: string) => {
	const mime = storedMime(type);
	const suppliedOctetStream = type.split(";")[0]!.trim().toLowerCase() === "application/octet-stream";
	if (
		type !== "" &&
		(!PageMimeSchema.safeParse(mime).success || (mime === "application/octet-stream" && !suppliedOctetStream))
	) {
		throw invalidInput("file", "Use a MIME type in type/subtype form with 255 characters or less.");
	}
	return mime;
};

export const prepareUpload = async (ctx: IoCtx & PrepareCtx, rawInput: unknown): Promise<PreparedUpload> => {
	const input = PageUploadInputSchema.parse(rawInput);
	const maxBytes = Math.min(ctx.maxUploadBytes, PAGE_ASSET_MAX_BYTES);
	if (input.file.size > maxBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes });
	const mime = storedPageMime(input.file.type);
	const project = await ctx.newTx(async (tx) => {
		const resolved = await resolveProject(ctx.core, tx, input.project);
		assertProjectActive(ctx.core, resolved.id);
		return resolved;
	});
	const id = input.id ?? ulid();
	const staged = await stagePageObject(ctx.home, input.file, maxBytes);
	if (staged === null) throw fail("PAYLOAD_TOO_LARGE", { maxBytes });
	return {
		id,
		projectId: project.id,
		mime,
		originalName: input.file.name,
		staged,
	};
};

const sameUpload = (ctx: IoCtx, row: RawUpload, input: PreparedUpload) =>
	row.project_id === input.projectId &&
	row.sha256 === input.staged.sha256 &&
	row.size === input.staged.size &&
	row.mime === input.mime &&
	row.original_name === input.originalName &&
	row.actor_name === ctx.actor.name &&
	row.actor_kind === ctx.actor.kind;

export const upload = async (ctx: IoCtx, tx: Tx, input: PreparedUpload): Promise<PageUpload> => {
	let staged = true;
	try {
		assertProjectActive(ctx.core, input.projectId);
		const existing = await findUpload(tx, input.id);
		if (existing !== undefined && !sameUpload(ctx, existing, input)) {
			await discardPageObject(ctx.home, input.staged);
			staged = false;
			throw fail("DUPLICATE", { field: "id" });
		}

		const object = await finalizePageObject(ctx.home, input.staged);
		staged = false;
		try {
			if (existing !== undefined) return toPageUpload(existing);

			const createdAt = ctx.now();
			const expiresAt = new Date(createdAt.getTime() + PAGE_UPLOAD_TTL_MS);
			await touchActor(tx, ctx.actor, createdAt);
			await tx.execute(sql`INSERT INTO page_uploads (
				id, project_id, sha256, size, mime, original_name,
				actor_name, actor_kind, created_at, expires_at
			) VALUES (
				${input.id}, ${input.projectId}, ${input.staged.sha256}, ${input.staged.size}, ${input.mime},
				${input.originalName}, ${ctx.actor.name}, ${ctx.actor.kind}, ${createdAt}, ${expiresAt}
			)`);
			const stored = (await findUpload(tx, input.id))!;
			return toPageUpload(stored);
		} finally {
			object.releaseHash();
		}
	} finally {
		if (staged) await discardPageObject(ctx.home, input.staged);
	}
};
