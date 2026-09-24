import type { Session } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

type SessionRef = Pick<Session, "id" | "name">;

// Archive puts a session away: the server stops its agent, and the session
// keeps its directory, its files, and its conversation. Unarchive brings it
// back to the session list, and a person starts its agent again.
//
// The sidebar row menu, the menu of the conversation bar, and the pane of an
// archived session share this. A write the server refuses shows a toast with
// the server message.
export const useSessionArchive = () => {
	const { client, orpc, queryClient } = useApp();

	const setArchived = async (session: SessionRef, archived: boolean) => {
		try {
			await client.sessions.setArchived({ id: session.id, archived });
		} catch (error) {
			toast.error(`Could not ${archived ? "archive" : "unarchive"} ${session.name}`, {
				description: (error as Error).message,
			});
			return;
		}
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
		]);
		toast(archived ? `Archived ${session.name}` : `Unarchived ${session.name}`);
	};

	return { setArchived };
};
