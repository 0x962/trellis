import { createHash } from "node:crypto";
import { fail } from "../fail";
import { os } from "../implementer";
import { requireTicket } from "../refs";
import { isoNow, newId, type State } from "../state";

// The stored mime is the essence of the part's content type. A multipart
// body carries the charset of a text part beside the type, and the server
// stores the type alone.
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

const storedMime = (type: string) => {
	const essence = type.split(";")[0]!.trim().toLowerCase();
	return MIME_PATTERN.test(essence) ? essence : "application/octet-stream";
};

const requireAttachment = (state: State, id: string) => {
	const attachment = state.attachments.get(id);
	if (attachment === undefined) throw fail("NOT_FOUND", { kind: "attachment", ref: id });
	return attachment;
};

export const attachments = {
	list: os.attachments.list.handler(({ context, input }) => {
		const ticket = requireTicket(context.state, input.ticket);
		return [...context.state.attachments.values()].filter((attachment) => attachment.ticketId === ticket.id);
	}),
	upload: os.attachments.upload.handler(async ({ context, input }) => {
		if (input.file.size > context.maxUploadBytes) {
			throw fail("PAYLOAD_TOO_LARGE", { maxBytes: context.maxUploadBytes });
		}
		const ticket = requireTicket(context.state, input.ticket);
		const bytes = new Uint8Array(await input.file.arrayBuffer());
		// The mobile Jest suite runs this procedure under Node, which has no Bun global.
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const id = newId();
		const filename = input.name ?? input.file.name;
		const mime = storedMime(input.file.type);
		const url = `/api/attachments/${id}/file`;
		const attachment = {
			id,
			ticketId: ticket.id,
			filename,
			mime,
			size: input.file.size,
			sha256,
			actor: context.actor!,
			createdAt: isoNow(),
			url,
		};
		context.state.blobs.set(sha256, bytes);
		context.state.attachments.set(id, attachment);
		context.bus.emit(
			"attachment.created",
			{ id, ticketId: ticket.id },
			{ ticketId: ticket.id, projectId: ticket.projectId },
		);
		const markdown = mime.startsWith("image/") ? `![${filename}](${url})` : `[${filename}](${url})`;
		return { attachment, url, markdown };
	}),
	get: os.attachments.get.handler(({ context, input }) => requireAttachment(context.state, input.id)),
	delete: os.attachments.delete.handler(({ context, input }) => {
		const attachment = requireAttachment(context.state, input.id);
		context.state.attachments.delete(attachment.id);
		const ticket = context.state.tickets.get(attachment.ticketId)!;
		context.bus.emit(
			"attachment.deleted",
			{ id: attachment.id, ticketId: ticket.id },
			{ ticketId: ticket.id, projectId: ticket.projectId },
		);
		return { deleted: attachment.id };
	}),
};
