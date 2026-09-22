import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { Priority, Status } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";
import { projectRefOfPathname } from "../../../../lib/projectPath";
import { parseSearch, type View } from "../../../filters/grammar";
import type { ComposerOptions } from "../../composerStore";

export type ComposerDefaultsInput = {
	project: string;
	statuses: readonly Status[];
	view: View;
	// The status of the group header that opened the composer.
	groupStatus?: string;
};

export type ComposerDefaults = {
	project: string;
	// A status slug.
	status: string | undefined;
	priority: Priority;
};

// A filter that names exactly one value, and not its complement.
const single = <T>(values: readonly T[] | undefined, negated: boolean) =>
	values !== undefined && values.length === 1 && !negated ? values[0] : undefined;

// The status a new ticket in the project starts in: the status the project
// marks as default, else its first Todo status.
export const defaultStatus = (statuses: readonly Status[]): Status | undefined =>
	statuses.find((status) => status.isDefault) ??
	[...statuses].filter((status) => status.category === "todo").sort((a, b) => a.position - b.position)[0];

export const defaultWave = (epic: { currentWave: { ref: string } | null } | undefined): string | undefined =>
	epic?.currentWave?.ref;

// The chip values a new ticket starts with. Only a caller
// that names a status on purpose (a group `+` or a board column) seeds the
// status. A filter only narrows the list, so a status filter never seeds
// it, and the project default applies. A single-valued priority filter
// seeds the priority.
export const composerDefaults = ({
	project,
	statuses,
	view,
	groupStatus,
}: ComposerDefaultsInput): ComposerDefaults => ({
	project,
	status: groupStatus ?? defaultStatus(statuses)?.slug,
	priority: single(view.priority, view.not?.includes("priority") ?? false) ?? "none",
});

// The defaults of the composer on the current page: the chosen project, or
// else the viewed project, its statuses, and the URL's filters.
export const useComposerDefaults = (options: ComposerOptions, chosenProject?: string) => {
	const { orpc } = useApp();
	const location = useRouterState({ select: (state) => state.location });
	const project = chosenProject ?? options.project ?? projectRefOfPathname(location.pathname) ?? undefined;
	const detail = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const statuses = detail.data?.statuses ?? [];
	const view = parseSearch(location.search as Record<string, unknown>);
	const defaults = composerDefaults({ project: project ?? "", statuses, view, groupStatus: options.status });
	const epic = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: options.epic ?? "" } }),
		enabled: options.epic !== undefined && options.wave === undefined,
	});
	return {
		project,
		status: defaults.status,
		priority: defaults.priority,
		parent: options.parent,
		epic: options.epic,
		wave: options.wave ?? defaultWave(epic.data),
		statuses,
		template: detail.data?.ticketTemplate ?? "",
	};
};
