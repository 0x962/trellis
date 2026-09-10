import { call, os } from "./base.ts";

export const agents = os.agents.router({
	sessions: os.agents.sessions.handler(({ context, input }) => call(context, "agents.sessions", input)),
	inbox: os.agents.inbox.handler(({ context, input }) => call(context, "agents.inbox", input)),
	register: os.agents.register.handler(({ context, input }) => call(context, "agents.register", input)),
	startBuilder: os.agents.startBuilder.handler(({ context, input }) => call(context, "agents.startBuilder", input)),
	startReviewer: os.agents.startReviewer.handler(({ context, input }) => call(context, "agents.startReviewer", input)),
	stop: os.agents.stop.handler(({ context, input }) => call(context, "agents.stop", input)),
	retry: os.agents.retry.handler(({ context, input }) => call(context, "agents.retry", input)),
	wake: os.agents.wake.handler(({ context, input }) => call(context, "agents.wake", input)),
	settings: os.agents.settings.handler(({ context }) => call(context, "agents.settings", undefined)),
	setSettings: os.agents.setSettings.handler(({ context, input }) => call(context, "agents.setSettings", input)),
	runnerProjects: os.agents.runnerProjects.handler(({ context }) => call(context, "agents.runnerProjects", undefined)),
});
