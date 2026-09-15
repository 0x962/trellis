import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export const readySession = (session: RuntimeProcessStatus) =>
	session.status === "running" &&
	session.controllable &&
	session.mode === "pty" &&
	(session.activity?.state === "ready" || session.activity?.state === "idle");
