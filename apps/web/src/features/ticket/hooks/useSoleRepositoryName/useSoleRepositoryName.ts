import { useQuery } from "@tanstack/react-query";
import type { Repo } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

// `apps/server/src/services/brief/brief.ts` names a repository only when the
// project uses exactly one, so the page and the brief print the same
// `Evidence owed`.
const soleName = (repos: Repo[]) => (repos.length === 1 ? repos[0]?.repo : undefined);

// The name of the one repository that the project uses, such as `trellis`. A
// project uses the repositories of its own record and of every project above
// it. The hook returns undefined while the list loads, and when the project
// uses no repository or more than one.
export function useSoleRepositoryName(projectPath: string): string | undefined {
	const { orpc } = useApp();
	return useQuery({ ...orpc.projects.repos.queryOptions({ input: { project: projectPath } }), select: soleName }).data;
}
