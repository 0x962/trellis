import { useQueries, useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

// The name of the repository whose path rules decide the evidence a contract
// owes, such as `trellis`. A project uses the repositories of its own record
// and of every project above it. The name is set only when that chain holds
// exactly one repository. `apps/server/src/services/brief/brief.ts` applies
// the same rule, so the page and the brief print the same `Evidence owed`.
// The name stays unset until every project of the chain has loaded.
export function useRepositoryName(projectPath: string | undefined): string | undefined {
	const { orpc } = useApp();
	const project = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: projectPath ?? "" } }),
		enabled: projectPath !== undefined,
	}).data;
	const ancestors = useQueries({
		queries: (project?.ancestors ?? []).map((ancestor) =>
			orpc.projects.get.queryOptions({ input: { project: ancestor.path } }),
		),
	});
	if (project === undefined || ancestors.some((query) => query.data === undefined)) return undefined;
	const repos = new Map(
		[project, ...ancestors.map((query) => query.data)]
			.flatMap((link) => link?.repos ?? [])
			.map((repo) => [`${repo.owner}/${repo.repo}`, repo.repo]),
	);
	return repos.size === 1 ? [...repos.values()][0] : undefined;
}
