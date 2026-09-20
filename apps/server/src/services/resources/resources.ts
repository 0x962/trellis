import {
	type Resource,
	ResourceAddInputSchema,
	type ResourceBlobFile,
	ResourceIdInputSchema,
	ResourceListInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { storedMime, storeFile } from "../../storage/blobs.ts";
import { gcBlobs } from "../blobs.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { pullRequestNumbersByBlob } from "../evidence/evidence.ts";
import { assertProjectActive, resolveTicket } from "../refs.ts";
import { fail, type IoCtx, notFound, touchActor } from "../support.ts";

const IMAGE_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

type ResourceRow = {
	id: string;
	epic_id: string;
	project_id: string;
	kind: Resource["kind"];
	name: string;
	body: string | null;
	url: string | null;
	blob_sha256: string | null;
	blob_size: number | null;
	mime: string | null;
	ticket_id: string | null;
	actor_name: string;
	actor_kind: Resource["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

const columns = sql`
	er.id, er.epic_id, e.project_id, er.kind, er.name, er.body, er.url, er.blob_sha256, er.blob_size, er.mime, er.ticket_id,
	er.actor_name, er.actor_kind,
	${actorDisplayName(sql`er.actor_name`, sql`er.actor_kind`)} AS actor_display_name,
	${iso(sql`er.created_at`)} AS created_at, ${iso(sql`er.updated_at`)} AS updated_at
`;

const resourceSelect = sql`SELECT ${columns}
	FROM epic_resources er
	JOIN epics e ON e.id = er.epic_id`;

export const resourceBlobUrl = (id: string) => `/api/resources/${id}/blob`;

const toResource = (row: ResourceRow, pullRequestNumbers: Map<string, number>): Resource => ({
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
					url: resourceBlobUrl(row.id),
					size: row.blob_size!,
				},
	ticketId: row.ticket_id,
	pullRequestNumber: row.blob_sha256 === null ? null : (pullRequestNumbers.get(row.blob_sha256) ?? null),
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const toResources = async (tx: Tx, epicId: string, found: ResourceRow[]) => {
	const shas = found.flatMap((row) => (row.blob_sha256 === null ? [] : [row.blob_sha256]));
	const pullRequestNumbers = await pullRequestNumbersByBlob(tx, epicId, shas);
	return found.map((row) => toResource(row, pullRequestNumbers));
};

const find = async (tx: Tx, id: string) => {
	const [row] = await rows<ResourceRow>(tx, sql`${resourceSelect} WHERE er.id = ${id}`);
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
	let blobSize: number | null = null;
	let blobMime: string | null = null;
	if (input.kind === "image" || input.kind === "file") {
		if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
		const mime = storedMime(input.file.type);
		if (input.kind === "image" && !IMAGE_MIMES.has(mime))
			throw invalidInput("file", "Select a PNG, JPEG, GIF, WebP, or AVIF image.");
		if (input.kind === "image" && storedMime(Bun.file(input.name).type) !== mime)
			throw invalidInput("name", "Use the image file extension in the resource name.");
		const stored = await storeFile(ctx.home, input.file);
		blobSha256 = stored.sha256;
		blobSize = stored.size;
		blobMime = mime;
	}
	const id = ulid();
	const at = ctx.now();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`INSERT INTO epic_resources (
		id, epic_id, kind, name, body, url, blob_sha256, blob_size, mime, ticket_id,
		actor_name, actor_kind, created_at, updated_at
	) VALUES (
		${id}, ${epic.id}, ${input.kind}, ${input.name},
		${input.kind === "doc" ? input.body : null}, ${input.kind === "link" ? input.url : null},
		${blobSha256}, ${blobSize}, ${blobMime}, ${ticketId}, ${ctx.actor.name}, ${ctx.actor.kind}, ${at}, ${at}
	)`);
	ctx.emit({ type: "epics.changed", projectId: epic.project_id, id: epic.id });
	return (await toResources(tx, epic.id, [await find(tx, id)]))[0]!;
};

export const list = async (ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Resource[]> => {
	const input = ResourceListInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx.core, tx, input.epic);
	const found = await rows<ResourceRow>(
		tx,
		sql`${resourceSelect} WHERE er.epic_id = ${epic.id}
			ORDER BY CASE er.kind WHEN 'doc' THEN 0 WHEN 'link' THEN 1 WHEN 'image' THEN 2 ELSE 3 END,
				er.created_at, er.id`,
	);
	return toResources(tx, epic.id, found);
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

export const readBlob = async (_ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<ResourceBlobFile> => {
	const input = ResourceIdInputSchema.parse(rawInput);
	const row = await find(tx, input.id);
	if (row.blob_sha256 === null) throw notFound("resourceBlob", row.id);
	return {
		sha256: row.blob_sha256,
		name: row.name,
		mime: row.mime!,
		size: row.blob_size!,
	};
};
