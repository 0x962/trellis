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

// The chip values a new ticket starts with, product.md 6.2. A group's
// status wins over the filter; a single-valued filter wins over the
// project's default.
export const composerDefaults = ({ project, statuses, view, groupStatus }: ComposerDefaultsInput): ComposerDefaults => {
	const filtered = single(view.status, view.not?.includes("status") ?? false);
	const known = statuses.find((status) => status.slug === filtered || status.id === filtered);
	const fallback = [...statuses]
		.filter((status) => status.category === "todo")
		.sort((a, b) => a.position - b.position)[0];
	return {
		project,
		status: groupStatus ?? known?.slug ?? fallback?.slug,
		priority: single(view.priority, view.not?.includes("priority") ?? false) ?? "none",
	};
};

// The defaults of the composer on the current page: the viewed project,
// its statuses, and the URL's filters.
export const useComposerDefaults = (options: ComposerOptions) => {
	const { orpc } = useApp();
	const location = useRouterState({ select: (state) => state.location });
	const project = options.project ?? projectRefOfPathname(location.pathname) ?? undefined;
	const detail = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const statuses = detail.data?.statuses ?? [];
	const view = parseSearch(location.search as Record<string, unknown>);
	const defaults = composerDefaults({ project: project ?? "", statuses, view, groupStatus: options.status });
	return {
		project,
		status: defaults.status,
		priority: defaults.priority,
		parent: options.parent,
		statuses,
		template: detail.data?.ticketTemplate ?? "",
	};
};
