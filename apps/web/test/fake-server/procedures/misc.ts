import { fail } from "../fail";
import { os } from "../implementer";
import { isoNow, requireTicket } from "../state";
import { linkedPrs } from "../summaries";

// gh is never present on the fake server, so the settings page can show
// the missing state.
const ghStatus = () => ({
	ok: false,
	user: null,
	reason: "missing" as const,
	message: "gh is not installed. Install it with `brew install gh` and run `gh auth login`.",
	checkedAt: isoNow(),
});

export const actors = {
	list: os.actors.list.handler(({ context }) => [...context.state.actors.values()]),
	default: os.actors.default.handler(({ context }) => ({
		name: context.state.settings.defaultActorName,
		kind: "human" as const,
	})),
};

export const settings = {
	get: os.settings.get.handler(({ context }) => context.state.settings),
	set: os.settings.set.handler(({ context, input }) => {
		context.state.settings = { ...input };
		return context.state.settings;
	}),
};

export const system = {
	health: os.system.health.handler(({ context }) => ({
		ok: true,
		version: context.versions.server,
		apiVersion: context.versions.api,
		bootId: context.bus.bootId,
		rss: 64 * 1024 * 1024,
		db: { ok: true, sizeBytes: 8 * 1024 * 1024 },
		gh: ghStatus(),
	})),
	gh: os.system.gh.handler(() => ghStatus()),
	backup: os.system.backup.handler(() => ({ path: "/tmp/trellis-fake-backup.tar.gz", bytes: 1024 })),
};

const requireAttachment = (state: Parameters<typeof requireTicket>[0], id: string) => {
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

export const pullRequests = {
	list: os.pullRequests.list.handler(({ context, input }) =>
		linkedPrs(context.state, requireTicket(context.state, input.ticket).id),
	),
	link: os.pullRequests.link.handler(() => {
		throw fail("GH_UNAVAILABLE", { reason: "missing" });
	}),
	unlink: os.pullRequests.unlink.handler(({ context, input }) => {
		const ticket = requireTicket(context.state, input.ticket);
		context.state.prLinks = context.state.prLinks.filter(
			(link) => !(link.ticketId === ticket.id && link.prId === input.id),
		);
		return { deleted: input.id };
	}),
	refresh: os.pullRequests.refresh.handler(() => {
		throw fail("GH_UNAVAILABLE", { reason: "missing" });
	}),
	diff: os.pullRequests.diff.handler(() => {
		throw fail("GH_UNAVAILABLE", { reason: "missing" });
	}),
};
