import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

export function useFlowRecovery(parentBlocked = false) {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.flowExecutionsV1.recovery.queryOptions({ input: {} }),
		refetchInterval: 2000,
	});
	return {
		blocked: parentBlocked || query.isError || query.data?.state !== "open",
		query,
	};
}
