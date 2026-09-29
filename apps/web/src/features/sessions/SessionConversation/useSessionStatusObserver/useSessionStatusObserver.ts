import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";
import { sessionObserverInput, sessionObserverPollInterval } from "../sessionObserverState";

export function useSessionStatusObserver(run: Pick<AgentRun, "id">) {
	const { client, orpc, queryClient } = useApp();
	const input = sessionObserverInput(run);
	const options = orpc.sessionObservers.get.queryOptions({ input });
	const observer = useQuery({
		...options,
		refetchInterval: (query) => sessionObserverPollInterval(query.state.data),
	});
	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) => client.sessionObservers.setEnabled({ ...input, enabled }),
		onSuccess: (saved) => queryClient.setQueryData(options.queryKey, saved),
		onError: (error, enabled) =>
			toast.error(`Could not ${enabled ? "enable" : "disable"} the status observer`, {
				description: error.message,
			}),
	});
	return { observer, setEnabled };
}
