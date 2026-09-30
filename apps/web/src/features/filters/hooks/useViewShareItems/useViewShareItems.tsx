import { Copy, Link } from "@phosphor-icons/react";
import { useRouterState } from "@tanstack/react-router";
import type { StatusSummary } from "@trellis/api";
import { type MenuItem, toast, writeClipboard } from "@trellis/ui";
import { toCli } from "../../cli";
import type { FilterField } from "../../fields";
import { serializeSearch, toListQuery, type View, viewOf } from "../../grammar";

type ViewShareOptions = {
	project?: string;
	search: Partial<View>;
	statuses: readonly StatusSummary[];
	fixed?: Partial<Pick<View, FilterField>>;
	linkSearch?: (view: View) => string;
};

const listLinkSearch = (view: View) => {
	const query = serializeSearch(view);
	return query === "" ? "" : `?${query}`;
};

export function useViewShareItems({
	project,
	search,
	statuses,
	fixed,
	linkSearch = listLinkSearch,
}: ViewShareOptions): MenuItem[] {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const view = viewOf(search);
	const query = {
		...toListQuery({ ...view, ...fixed }, { statuses }),
		updated: view.updated,
		created: view.created,
		completed: view.completed,
	};
	for (const key of ["updated", "created", "completed"] as const) if (query[key] === undefined) delete query[key];

	const copyCli = async () => {
		await writeClipboard(toCli(project === undefined ? query : { project, ...query }));
		toast("Copied the CLI command");
	};

	const copyLink = async () => {
		await writeClipboard(`${window.location.origin}${pathname}${linkSearch(view)}`);
		toast("Copied the link");
	};

	return [
		{ label: "Copy as CLI", icon: <Copy />, onSelect: () => void copyCli() },
		{ label: "Copy link", icon: <Link />, onSelect: () => void copyLink() },
	];
}
