import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

// A manager process that can take a message now or queue it for its next turn.
export const liveSession = (session: RuntimeProcessStatus) =>
	session.status === "running" &&
	session.controllable &&
	session.agent?.error == null &&
	session.agent?.outcome !== "failed" &&
	session.mode === "pty" &&
	session.acknowledgedMessageIds.includes(session.id);

// A live manager process between turns. Heartbeats go only to these.
export const readySession = (session: RuntimeProcessStatus) =>
	liveSession(session) && session.activity?.state === "idle";
