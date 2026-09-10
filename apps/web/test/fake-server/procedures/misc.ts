import { os } from "../implementer";

export const actors = {
	list: os.actors.list.handler(({ context }) => [...context.state.actors.values()]),
	default: os.actors.default.handler(({ context }) => ({
		name: context.state.settings.defaultActorName,
		kind: "human" as const,
		stored: context.state.defaultActorStored,
	})),
};

export const settings = {
	get: os.settings.get.handler(({ context }) => context.state.settings),
	set: os.settings.set.handler(({ context, input }) => {
		context.state.settings = { ...input };
		context.state.defaultActorStored = true;
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
		addresses: context.state.addresses,
		db: { ok: true, sizeBytes: 8 * 1024 * 1024 },
		gh: context.state.gh,
	})),
	gh: os.system.gh.handler(({ context }) => context.state.gh),
	backup: os.system.backup.handler(() => ({ path: "/tmp/trellis-fake-backup.tar.gz", bytes: 1024 })),
};
