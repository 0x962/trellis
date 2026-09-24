import { useMutation } from "@tanstack/react-query";
import type { Session } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export type ArchiveTarget = Pick<Session, "id" | "name">;

// The write that archives a session, or brings it back. The mutation carries
// the failure of the server, so a caller reads `isPending` and `isError` and
// writes no state of its own.
export const useSessionArchive = () => {
	const { client, orpc, queryClient } = useApp();
	return useMutation({
		mutationFn: ({ session, archived }: { session: ArchiveTarget; archived: boolean }) =>
			client.sessions.setArchived({ id: session.id, archived }),
		onSuccess: async (_saved, { session, archived }) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
			]);
			toast(archived ? `Archived ${session.name}` : `Unarchived ${session.name}`);
		},
		onError: (error, { session, archived }) =>
			toast.error(`Could not ${archived ? "archive" : "unarchive"} ${session.name}`, {
				description: error.message,
			}),
	});
};
