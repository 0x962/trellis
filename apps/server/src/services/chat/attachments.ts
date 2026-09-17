import type { ChatAttachment, ChatUploadOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { actorDisplayName } from "../../db/queries/actorDisplayName.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { storedMime, storeFile } from "../attachments.ts";
import { assertProjectActive } from "../refs.ts";
import { fail, type IoCtx, notFound, touchActor } from "../support.ts";
import { resolveRoom } from "./channels.ts";

// A file for a chat message. The upload stores the blob the way a ticket
// attachment does and writes one row per upload. The message that shows the
// file carries the markdown line this call returns; the row itself names no
// message, so a file can be uploaded before its message is posted.

export const fileUrl = (id: string) => `/api/chat/attachments/${id}/file`;

type Row = {
	id: string;
	project_id: string;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_kind: ChatAttachment["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
};

const columns = sql`
	a.id, a.project_id, a.filename, a.mime, a.size, a.sha256, a.actor_name, a.actor_kind,
	${actorDisplayName(sql`a.actor_name`, sql`a.actor_kind`)} AS actor_display_name, ${iso(sql`a.created_at`)} AS created_at
`;

const toAttachment = (row: Row): ChatAttachment => ({
	id: row.id,
	projectId: row.project_id,
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

const find = async (tx: Tx, id: string): Promise<Row> => {
	const [row] = await rows<Row>(tx, sql`SELECT ${columns} FROM chat_attachments a WHERE a.id = ${id}`);
	if (row === undefined) throw notFound("chat attachment", id);
	return row;
};

// An image shows itself in the message; every other file is a link.
const markdownFor = (attachment: ChatAttachment) =>
	`${attachment.mime.startsWith("image/") ? "!" : ""}[${attachment.filename}](${attachment.url})`;

export type UploadInput = { project: string; file: File; name?: string };

export const upload = async (ctx: IoCtx, tx: Tx, input: UploadInput): Promise<ChatUploadOutput> => {
	const root = await resolveRoom(ctx.core, tx, input.project);
	assertProjectActive(ctx.core, root.id);
	if (input.file.size > ctx.maxUploadBytes) throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	const stored = await storeFile(ctx.home, input.file);
	const at = ctx.now();
	const id = ulid();
	const filename = input.name ?? input.file.name;
	await touchActor(tx, ctx.actor, at);
	await tx.execute(sql`
		INSERT INTO chat_attachments (id, project_id, filename, mime, size, sha256, actor_name, actor_kind, created_at)
		VALUES (${id}, ${root.id}, ${filename}, ${storedMime(input.file.type)}, ${stored.size}, ${stored.sha256},
			${ctx.actor.name}, ${ctx.actor.kind}, ${at})
	`);
	const attachment = toAttachment(await find(tx, id));
	return { attachment, url: attachment.url, markdown: markdownFor(attachment) };
};

export const get = async (_ctx: IoCtx, tx: Tx, input: { id: string }): Promise<ChatAttachment> =>
	toAttachment(await find(tx, input.id));
