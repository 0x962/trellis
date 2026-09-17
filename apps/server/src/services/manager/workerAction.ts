import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export function workerAction(session: RuntimeProcessStatus, now: Date, { allowIdle = false } = {}) {
	if (session.status === "unknown") return "inspect";
	if (session.status === "exited" || session.agent?.error || session.agent?.outcome === "failed") return "restart";
	if (!session.controllable) return "inspect";
	if (allowIdle && session.activity?.state === "idle") return "continue";
	const lastActivityAt = Math.max(
		Date.parse(session.startedAt),
		session.agent?.lastTool ? Date.parse(session.agent.lastTool.updatedAt) : 0,
		session.agent?.lastMessage ? Date.parse(session.agent.lastMessage.at) : 0,
		session.activity?.state === "working" ? Date.parse(session.activity.updatedAt) : 0,
	);
	if (now.getTime() - lastActivityAt >= 60_000) return "restart";
	return session.activity?.state === "idle" ? "continue" : "keep";
}
