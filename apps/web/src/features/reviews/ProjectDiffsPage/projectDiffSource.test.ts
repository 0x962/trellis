import { expect, test } from "bun:test";
import {
	defaultProjectDiffSource,
	projectDiffEmptyState,
	projectDiffQueryActivation,
	projectDiffSources,
	restoreProjectDiffSource,
	saveProjectDiffSource,
} from "./projectDiffSource";

const memoryStorage = () => {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => entries.set(key, value),
	};
};

test("puts My open PRs first and All PRs second", () => {
	expect(projectDiffSources).toEqual([
		{ value: "mine", label: "My open PRs" },
		{ value: "all", label: "All PRs" },
	]);
});

test("starts on My open PRs and loads only that query", () => {
	const source = restoreProjectDiffSource(memoryStorage(), "project-1");

	expect(source).toBe(defaultProjectDiffSource);
	expect(projectDiffQueryActivation(source)).toEqual({ mine: true, all: false });
});

test("loads All PRs after the tab changes", () => {
	expect(projectDiffQueryActivation("all")).toEqual({ mine: false, all: true });
});

test("restores the selected tab for each project", () => {
	const storage = memoryStorage();

	saveProjectDiffSource(storage, "project-1", "all");

	expect(restoreProjectDiffSource(storage, "project-1")).toBe("all");
	expect(restoreProjectDiffSource(storage, "project-2")).toBe("mine");
});

test("keeps the empty copy for each tab and for search", () => {
	expect(projectDiffEmptyState("mine", "")).toEqual({
		title: "No open PRs",
		description: "You have no open pull request in the repositories of this project.",
	});
	expect(projectDiffEmptyState("all", "")).toEqual({
		title: "No pull requests yet",
		description: "Link a pull request to a ticket of this project, or open one for review with the plus button.",
	});
	expect(projectDiffEmptyState("mine", "queue")).toEqual({
		title: "No pull requests match",
		description: "Try another title, repository, or PR number.",
	});
});
