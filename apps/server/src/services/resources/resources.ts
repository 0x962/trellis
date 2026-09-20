import { type Resource, ResourceAddInputSchema, ResourceIdInputSchema, ResourceListInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { blobPath, storedMime, storeFile } from "../../storage/blobs.ts";
import { contentDisposition, isInlineMime } from "../attachments.ts";
import { gcBlobs } from "../blobs.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { fail, type IoCtx, notFound, touchActor } from "../support.ts";

type ResourceRow = {
	id: string;
	epic_id: string;
	project_id: string;
	kind: Resource["kind"];
	name: string;
	body: string | null;
	url: string | null;
	blob_sha256: string | null;
	ticket_id: string | null;
	pull_request_number: number | null;
	actor_name: string;
	actor_kind: Resource["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

const columns = sql`
	er.id, er.epic_id, e.project_id, er.kind, er.name, er.body, er.url, er.blob_sha256, er.ticket_id,
	evidence.number AS pull_request_number,
	er.actor_name, er.actor_kind,
	${actorDisplayName(sql`er.actor_name`, sql`er.actor_kind`)} AS actor_display_name,
	${iso(sql`er.created_at`)} AS created_at, ${iso(sql`er.updated_at`)} AS updated_at
`;

const select = sql`${columns}
	FROM epic_resources er
	JOIN epics e ON e.id = er.epic_id
	LEFT JOIN LATERAL (
		SELECT pr.number FROM pr_evidence pe
		JOIN pull_requests pr ON pr.id = pe.pull_request_id
		WHERE pe.blob_sha256 = er.blob_sha256
		ORDER BY pe.created_at DESC, pe.id DESC LIMIT 1
	) evidence ON true`;

export const blobUrl = (id: string) => `/api/resources/${id}/blob`;

const toResource = async (home: string, row: ResourceRow): Promise<Resource> => ({
	id: row.id,
	epicId: row.epic_id,
	kind: row.kind,
	name: row.name,
	body: row.body,
	url: row.url,
	blob:
		row.blob_sha256 === null
			? null
			: {
					sha256: row.blob_sha256,
					url: blobUrl(row.id),
					size: Bun.file(blobPath(home, row.blob_sha256)).size,
				},
	ticketId: row.ticket_id,
	pullRequestNumber: row.pull_request_number,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const find = async (tx: Tx, id: string) => {
	const [row] = await rows<ResourceRow>(tx, sql`SELECT ${select} WHERE er.id = ${id}`);
	if (row === undefined) throw notFound("resource", id);
	return row;
};

export const add = async (ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Resource> => {
	const input = ResourceAddInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx.core, tx, input.epic);
	assertProjectActive(ctx.core, epic.project_id);
	let ticketId: string | null = null;
	if (input.ticket !== undefined) {
		const ticket = await resolveTicket(ctx.core, tx, input.ticket);
		if (ticket.epicId !== epic.id) throw invalidInput("ticket", "Select a ticket in this epic.");
		ticketId = ticket.id;
	}
	let blobSha256: string | null = null;
	if (input.kind === "image" || input.kind === "file") {
		if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
		const mime = storedMime(input.file.type);
		if (input.kind === "image" && (!mime.startsWith("image/") || !isInlineMime(mime)))
			throw invalidInput("file", "Select a PNG, JPEG, GIF, WebP, or AVIF image.");
		if (input.kind === "image" && storedMime(Bun.file(input.name).type) !== mime)
			throw invalidInput("name", "Use the image file extension in the resource name.");
		blobSha256 = (await storeFile(ctx.home, input.file)).sha256;
	}
	const id = ulid();
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`INSERT INTO epic_resources (
		id, epic_id, kind, name, body, url, blob_sha256, ticket_id,
		actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${id}, ${epic.id}, ${input.kind}, ${input.name},
		${input.kind === "doc" ? input.body : null}, ${input.kind === "link" ? input.url : null},
		${blobSha256}, ${ticketId}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at}
	)`);
	ctx.emit({ type: "epics.changed", projectId: epic.project_id, id: epic.id });
	return toResource(ctx.home, await find(tx, id));
};

export const list = async (ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Resource[]> => {
	const input = ResourceListInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx.core, tx, input.epic);
	const found = await rows<ResourceRow>(
		tx,
		sql`SELECT ${select} WHERE er.epic_id = ${epic.id}
			ORDER BY CASE er.kind WHEN 'doc' THEN 0 WHEN 'link' THEN 1 WHEN 'image' THEN 2 ELSE 3 END,
				er.created_at, er.id`,
	);
	return Promise.all(found.map((row) => toResource(ctx.home, row)));
};

export const remove = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceIdInputSchema.parse(rawInput);
	const row = await find(tx, input.id);
	assertProjectActive(ctx.core, row.project_id);
	await tx.execute(sql`DELETE FROM epic_resources WHERE id = ${row.id}`);
	ctx.emit({ type: "epics.changed", projectId: row.project_id, id: row.epic_id });
	const sha256 = row.blob_sha256;
	if (sha256 !== null)
		ctx.afterCommit(async () => {
			await gcBlobs(ctx, [sha256]);
		});
	return { deleted: row.id };
};

export const readBlob = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ResourceIdInputSchema.parse(rawInput);
	const row = await find(tx, input.id);
	if (row.blob_sha256 === null) throw notFound("resourceBlob", row.id);
	const mime = storedMime(Bun.file(row.name).type);
	return {
		sha256: row.blob_sha256,
		name: row.name,
		mime,
		size: Bun.file(blobPath(ctx.home, row.blob_sha256)).size,
		disposition: contentDisposition(row.name, mime),
	};
};
