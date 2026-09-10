import { fail } from "../fail";
import { os } from "../implementer";
import { requireTicket } from "../state";
import { linkedPrs } from "../summaries";

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
		gh: context.state.gh,
	})),
	gh: os.system.gh.handler(({ context }) => context.state.gh),
	backup: os.system.backup.handler(() => ({ path: "/tmp/trellis-fake-backup.tar.gz", bytes: 1024 })),
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
