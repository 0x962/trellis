import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useApp } from "../../lib/appContext";

const none: readonly { key: string }[] = [];

const noticeOf = (key: string) => `${key} is archived. Unarchive the project to change it.`;

// The server refuses every write to a ticket or a project of an archived
// project. The UI reads this hook before it offers a write, so a person
// never starts an edit that the server refuses.
//
// The list asks for the archived projects only. `isArchived` keeps its
// identity until that list changes, so a memo that depends on it rebuilds
// only then.
export const useArchivedProjects = () => {
	const { orpc } = useApp();
	const archived = useQuery(orpc.projects.list.queryOptions({ input: { archived: true } })).data ?? none;
	const isArchived = useCallback((key: string) => archived.some((project) => key === project.key), [archived]);
	return { isArchived, notice: noticeOf };
};
