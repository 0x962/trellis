import type { Attachment, AttachmentUploadOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../db/queries/actorDisplayName.ts";
import { iso, rows } from "../db/queries/support.ts";
import { ticketSummary } from "../db/queries/ticketGet.ts";
import type { Tx } from "../db/tx.ts";
import { invalidInput } from "../errors.ts";
import { sha256OfFile, storedMime, storeFile } from "../storage/blobs.ts";
import { gcBlobs } from "./blobs.ts";
import {
	assertProjectActive,
	fail,
	notFound,
	resolveTicket,
	type ServiceCtx,
	touchActor,
	touchTicket,
	writeActivity,
} from "./support.ts";

// An upload hashes the file while it writes `attachments/tmp`, moves the file
// to the path of its hash, and writes one attachment row. Two uploads of the
// same bytes share one file and keep one row each. A delete removes its row
// inside the transaction and removes the file after the commit, so a rolled
// back delete keeps both.

// The types a browser may render on the app origin. An SVG or an HTML file
// runs as script there, so every type outside this list downloads instead.
const INLINE_MIMES: ReadonlySet<string> = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"video/mp4",
	"video/webm",
]);

// A stored mime may carry parameters, as in `text/plain; charset=utf-8`. The
// type and the subtype decide, so the parameters are cut off first.
export const isInlineMime = (mime: string) => INLINE_MIMES.has(mime.split(";")[0]!.trim().toLowerCase());

// A header value holds Latin-1 only, and Bun refuses any other value with a
// 500. A filename of printable ASCII without `"` or `\` goes in `filename`
// as it is. Any other filename gets an ASCII fallback in `filename`, with
// `_` for each other character, and its exact UTF-8 form in `filename*`
// (RFC 6266). A browser uses `filename*` when it is present.
const PLAIN_FILENAME = /^[\x20-\x7e]*$/;
const UNSAFE_IN_FALLBACK = /[^\x20-\x7e]|["\\]/g;

// encodeURIComponent leaves `'()*` as they are, and RFC 5987 does not allow
// them unencoded in `filename*`.
const encodeRfc5987 = (value: string) =>
	encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export const contentDisposition = (filename: string, mime: string) => {
	const disposition = isInlineMime(mime) ? "inline" : "attachment";
	if (PLAIN_FILENAME.test(filename) && !/["\\]/.test(filename)) return `${disposition}; filename="${filename}"`;
	const fallback = filename.replace(UNSAFE_IN_FALLBACK, "_");
	return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
};

export const fileUrl = (id: string) => `/api/attachments/${id}/file`;

type AttachmentRow = {
	id: string;
	ticket_id: string;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_display_name: string | null;
	actor_kind: ActorKind;
	created_at: string;
};

type ActorKind = Attachment["actor"]["kind"];

const columns = sql`
	a.id, a.ticket_id, a.filename, a.mime, a.size, a.sha256, a.actor_name, a.actor_kind, ${actorDisplayName(sql`a.actor_name`, sql`a.actor_kind`)} AS actor_display_name,
	${iso(sql`a.created_at`)} AS created_at
`;

const toAttachment = (row: AttachmentRow): Attachment => ({
	id: row.id,
	ticketId: row.ticket_id,
	filename: row.filename,
	mime: row.mime,
	size: row.size,
	sha256: row.sha256,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	url: fileUrl(row.id),
});

// The line a person pastes into a description or a comment. An image shows
// itself; every other file is a link.
const markdownFor = (attachment: Attachment) =>
	`${attachment.mime.startsWith("image/") ? "!" : ""}[${attachment.filename}](${attachment.url})`;

// An upload or a delete changes the ticket's `attachmentCount`, which the
// ticket table and the board show. The ticket.updated event carries the new
// summary, so every client patches the count in place.
const emitCount = async (ctx: ServiceCtx, tx: Tx, ticketId: string) =>
	ctx.emit({
		type: "ticket.updated",
		summary: await ticketSummary(tx, ticketId),
		fields: ["attachmentCount"],
		batchId: ulid(),
	});

export type UploadInput = { id?: string; ticket: string; file: File; name?: string };

export const upload = async (ctx: ServiceCtx, tx: Tx, input: UploadInput): Promise<AttachmentUploadOutput> => {
	const ticket = await resolveTicket(tx, input.ticket);
	assertProjectActive(ticket);
	if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	const filename = input.name ?? input.file.name;
	const mime = storedMime(input.file.type);
	if (input.id !== undefined) {
		const existing = await findAttachmentIfExists(tx, input.id);
		if (existing !== undefined) {
			if (
				existing.ticket_id !== ticket.id ||
				existing.filename !== filename ||
				existing.mime !== mime ||
				existing.size !== input.file.size ||
				existing.actor_name !== ctx.actor.name ||
				existing.actor_kind !== ctx.actor.kind ||
				existing.sha256 !== (await sha256OfFile(input.file))
			)
				throw invalidInput("id", "This id already identifies another attachment.");
			const attachment = toAttachment(existing);
			return { attachment, url: attachment.url, markdown: markdownFor(attachment) };
		}
	}
	const stored = await storeFile(ctx.home, input.file);
	const at = ctx.now();
	const id = input.id ?? ulid();
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`
		INSERT INTO attachments (id, ticket_id, filename, mime, size, sha256, actor_name, actor_kind, created_at)
		VALUES (
			${id}, ${ticket.id}, ${filename}, ${mime}, ${stored.size}, ${stored.sha256},
			${ctx.actor.name}, ${ctx.actor.kind}, ${at}
		)
	`);
	await touchTicket(tx, { id: ticket.id, at, versionStep: 1 });
	await writeActivity(ctx, tx, { ticket, action: "attachment.created", meta: { filename, attachmentId: id }, at });
	ctx.emit({ type: "attachment.created", id, ticketId: ticket.id, projectId: ticket.project_id });
	await emitCount(ctx, tx, ticket.id);
	const attachment = toAttachment(await findAttachment(tx, id));
	return { attachment, url: attachment.url, markdown: markdownFor(attachment) };
};

const findAttachment = async (tx: Tx, id: string): Promise<AttachmentRow> => {
	const row = await findAttachmentIfExists(tx, id);
	if (row === undefined) throw notFound("attachment", id);
	return row;
};

const findAttachmentIfExists = async (tx: Tx, id: string): Promise<AttachmentRow | undefined> => {
	const [row] = await rows<AttachmentRow>(tx, sql`SELECT ${columns} FROM attachments a WHERE a.id = ${id}`);
	return row;
};

export type IdInput = { id: string };

export const remove = async (ctx: ServiceCtx, tx: Tx, input: IdInput) => {
	const row = await findAttachment(tx, input.id);
	const ticket = await resolveTicket(tx, row.ticket_id);
	assertProjectActive(ticket);
	const at = ctx.now();
	await tx.execute(sql`DELETE FROM attachments WHERE id = ${row.id}`);
	await touchTicket(tx, { id: ticket.id, at, versionStep: 1 });
	await writeActivity(ctx, tx, {
		ticket,
		action: "attachment.deleted",
		meta: { filename: row.filename, attachmentId: row.id },
		at,
	});
	ctx.emit({ type: "attachment.deleted", id: row.id, ticketId: ticket.id, projectId: ticket.project_id });
	await emitCount(ctx, tx, ticket.id);
	ctx.afterCommit(async () => {
		await gcBlobs(ctx, [row.sha256]);
	});
	return { deleted: row.id };
};

export type ListInput = { ticket: string };

export const list = async (ctx: ServiceCtx, tx: Tx, input: ListInput): Promise<Attachment[]> => {
	const ticket = await resolveTicket(tx, input.ticket);
	const found = await rows<AttachmentRow>(
		tx,
		sql`SELECT ${columns} FROM attachments a WHERE a.ticket_id = ${ticket.id} ORDER BY a.created_at DESC, a.id DESC`,
	);
	return found.map(toAttachment);
};

export const get = async (ctx: ServiceCtx, tx: Tx, input: IdInput): Promise<Attachment> =>
	toAttachment(await findAttachment(tx, input.id));
