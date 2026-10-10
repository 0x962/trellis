import { useMutation } from "@tanstack/react-query";
import { useApp } from "../../../../../lib/appContext";

export function useWhiteboardConnections(readOnly: boolean) {
	const { client, orpc, queryClient } = useApp();
	const mutation = useMutation({
		mutationFn: ({ prerequisiteId, dependentId }: { prerequisiteId: string; dependentId: string }) =>
			client.tickets.updateDependencies({ ticket: dependentId, after: [prerequisiteId] }),
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.search.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
			]),
	});
	return {
		connect: (prerequisiteId: string, dependentId: string) => {
			if (!readOnly) mutation.mutate({ prerequisiteId, dependentId });
		},
		error: mutation.error,
		pending: mutation.isPending,
	};
}
