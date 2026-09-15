import { call, os } from "./base.ts";

// The routers with one or two procedures each: timeline, search, brief,
// actors, and settings.

export const timeline = os.timeline.router({
	list: os.timeline.list.handler(({ context, input }) => call(context, "timeline.list", input)),
});

export const search = os.search.router({
	query: os.search.query.handler(({ context, input }) => call(context, "search.query", input)),
});

export const brief = os.brief.router({
	get: os.brief.get.handler(({ context, input }) => call(context, "brief.get", input)),
});

export const actors = os.actors.router({
	list: os.actors.list.handler(({ context }) => call(context, "actors.list", undefined)),
	default: os.actors.default.handler(({ context }) => call(context, "actors.default", undefined)),
});

export const settings = os.settings.router({
	get: os.settings.get.handler(({ context }) => call(context, "settings.get", undefined)),
	set: os.settings.set.handler(({ context, input }) => call(context, "settings.set", input)),
});
