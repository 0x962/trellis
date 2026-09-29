import { type AgentRun, hasAssignedProcess } from "@trellis/api";
import type { LinkPress, SessionStatusProcessState } from "@trellis/ui";
import type { Orpc } from "../../../../../lib/orpc";

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

export const agentStatusUpdatesQueryOptions = (orpc: Orpc, run: Pick<AgentRun, "id">) =>
	orpc.sessionUpdates.get.queryOptions({ input: sessionUpdateInput(run) });

export const agentStatusLinkPress = (_target: string, press: LinkPress): LinkPress => press;
