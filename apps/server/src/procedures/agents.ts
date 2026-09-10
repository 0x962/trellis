import { os } from "./base.ts";

// Every handler throws until the agents services exist; the server builder
// replaces each one with a `call` into its service. The actor middleware
// runs first, so a write without x-trellis-actor still answers
// ACTOR_REQUIRED.
const pending = (name: string) => () => {
	throw new Error(`${name} has no service.`);
};

export const agents = os.agents.router({
	sessions: os.agents.sessions.handler(pending("agents.sessions")),
	inbox: os.agents.inbox.handler(pending("agents.inbox")),
	register: os.agents.register.handler(pending("agents.register")),
	startBuilder: os.agents.startBuilder.handler(pending("agents.startBuilder")),
	startReviewer: os.agents.startReviewer.handler(pending("agents.startReviewer")),
	stop: os.agents.stop.handler(pending("agents.stop")),
	wake: os.agents.wake.handler(pending("agents.wake")),
	settings: os.agents.settings.handler(pending("agents.settings")),
	setSettings: os.agents.setSettings.handler(pending("agents.setSettings")),
});
