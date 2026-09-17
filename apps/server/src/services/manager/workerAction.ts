import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export function workerAction(session: RuntimeProcessStatus) {
	if (session.status === "unknown") return "inspect";
	if (session.status === "exited" || session.agent?.error || session.agent?.outcome === "failed") return "restart";
	if (!session.controllable) return "inspect";
	return session.activity?.state === "idle" ? "continue" : "keep";
}
