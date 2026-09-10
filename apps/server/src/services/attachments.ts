import type { Attachment, AttachmentUploadOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { finalize, gc, markLiveTempFile, tempPath } from "../storage/blobs.ts";
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

const HASH_CHUNK_BYTES = 1024 * 1024;

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

export const contentDisposition = (filename: string, mime: string) =>
	`${isInlineMime(mime) ? "inline" : "attachment"}; filename="${filename}"`;

export const fileUrl = (id: string) => `/api/attachments/${id}/file`;

type AttachmentRow = {
	id: string;
	ticket_id: string;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_kind: ActorKind;
	created_at: string;
};

type ActorKind = Attachment["actor"]["kind"];

const columns = sql`
	a.id, a.ticket_id, a.filename, a.mime, a.size, a.sha256, a.actor_name, a.actor_kind,
	${iso(sql`a.created_at`)} AS created_at
`;

const toAttachment = (row: AttachmentRow): Attachment => ({
	id: row.id,
	ticketId: row.ticket_id,
	filename: row.filename,
	mime: row.mime,
	size: row.size,
	sha256: row.sha256,
	actor: { name: row.actor_name, kind: row.actor_kind },
	createdAt: row.created_at,
	url: fileUrl(row.id),
});

// The line a person pastes into a description or a comment. An image shows
// itself; every other file is a link.
const markdownFor = (attachment: Attachment) =>
	`${attachment.mime.startsWith("image/") ? "!" : ""}[${attachment.filename}](${attachment.url})`;

// Writes the upload to `attachments/tmp` and hashes it in the same pass, in
// parts of 1 MB, so a 50 MB upload never sits in memory. The file then moves
// to the path of its hash. The name of the temp file is marked live, so a
// boot sweep in another process leaves the upload alone.
const storeFile = async (home: string, file: File) => {
	const name = ulid();
	const release = markLiveTempFile(name);
	const hasher = new Bun.CryptoHasher("sha256");
	const sink = Bun.file(tempPath(home, name)).writer();
	let size = 0;
	for await (const chunk of file.stream()) {
		for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_BYTES) {
			const part = chunk.subarray(offset, offset + HASH_CHUNK_BYTES);
			hasher.update(part);
			sink.write(part);
			size += part.byteLength;
		}
	}
	await sink.end();
	const sha256 = hasher.digest("hex");
	await finalize(home, name, sha256);
	release();
	return { sha256, size };
};

// The mime the row keeps: the type and the subtype, without parameters, as
// in `text/plain`. The file route sets the charset itself. The multipart
// parser gives an empty type to a part whose filename has no known
// extension. Every read refuses an empty mime, so such a part is stored as
// `application/octet-stream`, which downloads.
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

const storedMime = (type: string) => {
	const essence = type.split(";")[0]!.trim().toLowerCase();
	return MIME_PATTERN.test(essence) ? essence : "application/octet-stream";
};

export type UploadInput = { ticket: string; file: File; name?: string };

export const upload = async (ctx: ServiceCtx, tx: Tx, input: UploadInput): Promise<AttachmentUploadOutput> => {
	const ticket = await resolveTicket(tx, input.ticket);
	assertProjectActive(ticket);
	if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	const stored = await storeFile(ctx.home, input.file);
	const at = ctx.now();
	const id = ulid();
	const filename = input.name ?? input.file.name;
	const mime = storedMime(input.file.type);
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
	ctx.emit({ type: "attachment.created", id, ticketId: ticket.id });
	const attachment: Attachment = {
		id,
		ticketId: ticket.id,
		filename,
		mime,
		size: stored.size,
		sha256: stored.sha256,
		actor: ctx.actor,
		createdAt: at.toISOString(),
		url: fileUrl(id),
	};
	return { attachment, url: attachment.url, markdown: markdownFor(attachment) };
};

const findAttachment = async (tx: Tx, id: string): Promise<AttachmentRow> => {
	const [row] = await rows<AttachmentRow>(tx, sql`SELECT ${columns} FROM attachments a WHERE a.id = ${id}`);
	if (row === undefined) throw notFound("attachment", id);
	return row;
};

// True while any attachment row still names this hash. The check runs under
// the file lock, so an upload of the same hash that is between its move and
// its row is counted.
const holdsSha = (ctx: ServiceCtx, sha256: string) => () =>
	ctx.newTx(async (tx) => {
		const [row] = await rows<{ n: number }>(
			tx,
			sql`SELECT count(*)::int AS n FROM attachments WHERE sha256 = ${sha256}`,
		);
		return row!.n > 0;
	});

// Removes the file of every hash whose last row went. The caller runs this
// after the commit, so a rolled back delete never loses a file.
export const gcAttachmentBlobs = async (ctx: ServiceCtx, shas: string[]) => {
	const removed: string[] = [];
	for (const sha256 of new Set(shas)) {
		if (await gc(ctx.home, sha256, holdsSha(ctx, sha256))) removed.push(sha256);
	}
	return { removed };
};

export type IdInput = { id: string };

export const remove = async (ctx: ServiceCtx, tx: Tx, input: IdInput) => {
	const row = await findAttachment(tx, input.id);
	const ticket = await resolveTicket(tx, row.ticket_id);
	const at = ctx.now();
	await tx.execute(sql`DELETE FROM attachments WHERE id = ${row.id}`);
	await touchTicket(tx, { id: ticket.id, at, versionStep: 1 });
	await writeActivity(ctx, tx, {
		ticket,
		action: "attachment.deleted",
		meta: { filename: row.filename, attachmentId: row.id },
		at,
	});
	ctx.emit({ type: "attachment.deleted", id: row.id, ticketId: ticket.id });
	ctx.afterCommit(async () => {
		await gcAttachmentBlobs(ctx, [row.sha256]);
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
