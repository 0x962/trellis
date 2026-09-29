import { useMutation } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { useApp } from "../../../lib/appContext";

export const sessionRestartKey = (runId: string) => ["session-restart", runId];

export function useSessionRestart(
	run: AgentRun,
	options: {
		mutationFn: () => Promise<AgentRun>;
		onSuccess?: (result: AgentRun) => void;
		onError?: (error: Error) => void;
	},
) {
	const { orpc, queryClient } = useApp();
	const mutation = useMutation({
		mutationKey: sessionRestartKey(run.id),
		mutationFn: (_input: { previousTerminalId: string | null }) => options.mutationFn(),
		onSuccess: options.onSuccess,
		onError: options.onError,
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
			]),
	});
	return {
		...mutation,
		mutate: () => mutation.mutate({ previousTerminalId: run.terminalId }),
	};
}
