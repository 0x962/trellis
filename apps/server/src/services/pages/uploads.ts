import { PAGE_ASSET_MAX_BYTES, PageMimeSchema, type PageUpload, PageUploadInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
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

export const PAGE_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

type PageUploadRow = {
	id: string;
	project_id: string;
	sha256: string;
	size: number;
	mime: string;
	original_name: string;
	actor_name: string;
	actor_kind: PageUpload["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
	expires_at: string;
};

const uploadColumns = sql`
	u.id, u.project_id, u.sha256, u.size, u.mime, u.original_name,
	u.actor_name, u.actor_kind,
	${actorDisplayName(sql`u.actor_name`, sql`u.actor_kind`)} AS actor_display_name,
	${iso(sql`u.created_at`)} AS created_at, ${iso(sql`u.expires_at`)} AS expires_at
`;

const toPageUpload = (row: PageUploadRow): PageUpload => ({
	id: row.id,
	projectId: row.project_id,
	sha256: row.sha256,
	size: row.size,
	mime: row.mime,
	originalName: row.original_name,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	expiresAt: row.expires_at,
});

const findUpload = async (tx: Tx, id: string) => {
	const [row] = await rows<PageUploadRow>(tx, sql`SELECT ${uploadColumns} FROM page_uploads u WHERE u.id = ${id}`);
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
	return PageMimeSchema.safeParse(mime).success ? mime : "application/octet-stream";
};

export const prepareUpload = async (ctx: IoCtx & PrepareCtx, rawInput: unknown): Promise<PreparedUpload> => {
	const input = PageUploadInputSchema.parse(rawInput);
	if (input.file.size > PAGE_ASSET_MAX_BYTES) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: PAGE_ASSET_MAX_BYTES });
	const project = await ctx.newTx(async (tx) => {
		const resolved = await resolveProject(ctx.core, tx, input.project);
		assertProjectActive(ctx.core, resolved.id);
		return resolved;
	});
	const id = input.id ?? ulid();
	return {
		id,
		projectId: project.id,
		mime: storedPageMime(input.file.type),
		originalName: input.file.name,
		staged: await stagePageObject(ctx.home, id, input.file),
	};
};

const sameUpload = (ctx: IoCtx, row: PageUploadRow, input: PreparedUpload) =>
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
			throw invalidInput("id", "This id already identifies another Page upload.");
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
			object.release();
		}
	} finally {
		if (staged) await discardPageObject(ctx.home, input.staged);
	}
};
