import { type AgentRun, hasAssignedProcess } from "@trellis/api";
import type { LinkPress, SessionStatusProcessState } from "@trellis/ui";

export const sessionStatusProcessState = (run: AgentRun): SessionStatusProcessState => {
	if (
		run.ticketStatusCategory === "done" ||
		run.ticketStatusCategory === "canceled" ||
		run.observation?.outcome === "completed"
	)
		return "completed";
	return run.state === "starting" || hasAssignedProcess(run) ? "active" : "paused";
};

export const sessionUpdateInput = (run: Pick<AgentRun, "id">) => ({ sessionId: run.id });

export const statusLinkPress = (target: string, press: LinkPress): LinkPress =>
	target === "_blank" ? { ...press, metaKey: true } : press;
