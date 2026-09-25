import { useCallback, useState } from "react";

export type ProjectDiffSource = "mine" | "all";

export const projectDiffSources = [
	{ value: "mine", label: "My open PRs" },
	{ value: "all", label: "All PRs" },
] as const;

export const defaultProjectDiffSource: ProjectDiffSource = "mine";

const storageKey = (projectId: string) => `trellis-project-diffs-source:${projectId}`;

export const restoreProjectDiffSource = (storage: Pick<Storage, "getItem">, projectId: string): ProjectDiffSource =>
	storage.getItem(storageKey(projectId)) === "all" ? "all" : defaultProjectDiffSource;

export const saveProjectDiffSource = (
	storage: Pick<Storage, "setItem">,
	projectId: string,
	source: ProjectDiffSource,
): ProjectDiffSource => {
	storage.setItem(storageKey(projectId), source);
	return source;
};

export const projectDiffQueryActivation = (source: ProjectDiffSource) => ({
	mine: source === "mine",
	all: source === "all",
});

export const projectDiffEmptyState = (source: ProjectDiffSource, filter: string) => {
	if (filter) return { title: "No pull requests match", description: "Try another title, repository, or PR number." };
	if (source === "all") {
		return {
			title: "No pull requests yet",
			description: "Link a pull request to a ticket of this project, or open one for review with the plus button.",
		};
	}
	return {
		title: "No open PRs",
		description: "You have no open pull request in the repositories of this project.",
	};
};

export const useProjectDiffSource = (projectId: string) => {
	const [source, setSourceState] = useState<ProjectDiffSource>(() =>
		restoreProjectDiffSource(sessionStorage, projectId),
	);
	const setSource = useCallback(
		(next: ProjectDiffSource) => setSourceState(saveProjectDiffSource(sessionStorage, projectId, next)),
		[projectId],
	);
	return [source, setSource] as const;
};
