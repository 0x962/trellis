import { useNavigate } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";

type ProjectRef = Pick<ProjectSummary, "path" | "name">;

// Archive, unarchive, and delete. The sidebar row menu, the project settings,
// and the archived banner share them. A write the server refuses shows a
// toast with the server message.
export const useProjectActions = () => {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();

	const setArchived = async (project: ProjectRef, archived: boolean) => {
		try {
			await client.projects.update({ project: project.path, archived });
		} catch (error) {
			toast.error(`Couldn't ${archived ? "archive" : "unarchive"} ${project.name}`, {
				description: (error as Error).message,
			});
			return;
		}
		await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
		toast(archived ? `Archived ${project.name}` : `Unarchived ${project.name}`);
	};

	// The app leaves the project page before the caches refetch, so no page
	// asks the server for the deleted project. Returns true on a delete.
	const remove = async (project: ProjectRef, force: boolean) => {
		try {
			await client.projects.delete(force ? { project: project.path, force: true } : { project: project.path });
		} catch (error) {
			toast.error(`Couldn't delete ${project.name}`, { description: (error as Error).message });
			return false;
		}
		await navigate({ to: "/all" });
		await queryClient.invalidateQueries();
		toast(`Deleted ${project.name}`);
		return true;
	};

	return { setArchived, remove };
};
