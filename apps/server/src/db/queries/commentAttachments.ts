import type { Attachment } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { actorDisplayName } from "./actorDisplayName.ts";
import { iso } from "./support.ts";

// The attachments linked to one comment, oldest first. The shape mirrors
// the attachment row the services map, so one mapper serves every reader.
export const commentAttachments = (id: SQL) => sql`COALESCE((SELECT jsonb_agg(jsonb_build_object(
	'id',a.id,'ticket_id',a.ticket_id,'comment_id',a.comment_id,'filename',a.filename,'mime',a.mime,'size',a.size,
	'sha256',a.sha256,'actor_name',a.actor_name,'actor_kind',a.actor_kind,
	'actor_display_name',${actorDisplayName(sql`a.actor_name`, sql`a.actor_kind`)},
	'created_at',${iso(sql`a.created_at`)}) ORDER BY a.created_at, a.id)
	FROM attachments a WHERE a.comment_id=${id}), '[]'::jsonb)`;

type AttachmentJson = {
	id: string;
	ticket_id: string;
	comment_id: string | null;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	actor_name: string;
	actor_kind: Attachment["actor"]["kind"];
	actor_display_name: string | null;
	created_at: string;
};

// The route that serves the bytes of an attachment.
const fileUrl = (id: string) => `/api/attachments/${id}/file`;

export const toCommentAttachments = (value: unknown): Attachment[] => {
	const found = value as AttachmentJson[];
	return found.map((row) => ({
		id: row.id,
		ticketId: row.ticket_id,
		commentId: row.comment_id,
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
	}));
};
