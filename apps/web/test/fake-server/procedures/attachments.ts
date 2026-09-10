import { fail } from "../fail";
import { os } from "../implementer";
import { requireTicket, type State } from "../state";

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
	upload: os.attachments.upload.handler(() => {
		throw new Error("The fake server does not store uploads.");
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
