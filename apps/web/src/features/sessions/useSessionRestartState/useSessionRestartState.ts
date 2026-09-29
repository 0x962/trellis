import { useMutationState } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { useState } from "react";
import { type SessionRestart, type SessionRestartView, sessionRestartView } from "../sessionRestartView";
import { sessionRestartKey } from "../useSessionRestart";

export function useSessionRestartState(run: AgentRun) {
	const restarts = useMutationState<SessionRestart>({
		filters: {
			mutationKey: sessionRestartKey(run.id),
			exact: true,
			predicate: (mutation) => mutation.state.variables !== undefined,
		},
		select: (mutation) => ({
			id: mutation.mutationId,
			status: mutation.state.status,
			previousTerminalId: (mutation.state.variables as { previousTerminalId: string | null }).previousTerminalId,
			result: mutation.state.data as AgentRun | undefined,
		}),
	});
	const [previous, setPrevious] = useState<SessionRestartView>();
	const view = sessionRestartView(run, restarts.at(-1), previous);
	if (
		previous?.run !== view.run ||
		previous.restartId !== view.restartId ||
		previous.pending !== view.pending ||
		previous.busy !== view.busy
	)
		setPrevious(view);
	return view;
}
