import { useMutation } from "@tanstack/react-query";
import { toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export type PinTarget = { id: string; name: string };

export const useSessionPin = () => {
	const { client, orpc, queryClient } = useApp();
	return useMutation({
		mutationFn: ({ target, pinned }: { target: PinTarget; pinned: boolean }) =>
			client.agentRuns.setPinned({ id: target.id, pinned }),
		onSuccess: async (_saved, { target, pinned }) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]);
			toast(pinned ? `Pinned ${target.name}` : `Unpinned ${target.name}`);
		},
		onError: (error, { target, pinned }) =>
			toast.error(`Could not ${pinned ? "pin" : "unpin"} ${target.name}`, { description: error.message }),
	});
};
