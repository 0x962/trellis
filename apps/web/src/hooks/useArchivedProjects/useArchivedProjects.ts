import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useApp } from "../../lib/appContext";
import { projectSlashPath } from "../../lib/projectPath";

const none: readonly { path: string }[] = [];

const noticeOf = (path: string) => `${projectSlashPath(path)} is archived. Unarchive the project to change it.`;

// The server refuses every write to a ticket or a project at or under an
// archived project. The UI reads this hook before it offers a write, so a
// person never starts an edit that the server refuses.
//
// The list asks for the archived projects only. A path is read-only when it
// is an archived path, or when it starts with an archived path and a dot.
// `isArchived` keeps its identity until that list changes, so a memo that
// depends on it rebuilds only then.
export const useArchivedProjects = () => {
	const { orpc } = useApp();
	const archived = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } })).data ?? none;
	const isArchived = useCallback(
		(path: string) => archived.some((project) => path === project.path || path.startsWith(`${project.path}.`)),
		[archived],
	);
	return { isArchived, notice: noticeOf };
};
