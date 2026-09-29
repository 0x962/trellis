import { type AgentRun, hasAssignedProcess, type SessionUpdatesGetInput } from "@trellis/api";
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
	orpc.sessionUpdates.get.infiniteOptions({
		input: (before: NonNullable<SessionUpdatesGetInput["history"]>["before"]) => ({
			...sessionUpdateInput(run),
			history: { before },
		}),
		initialPageParam: undefined as NonNullable<SessionUpdatesGetInput["history"]>["before"],
		getNextPageParam: (result) => result.nextCursor ?? undefined,
	});

export const agentStatusLinkPress = (_target: string, press: LinkPress): LinkPress => press;
