import { Copy, FunnelSimple, Link, ShareFat } from "@phosphor-icons/react";
import { useRouterState } from "@tanstack/react-router";
import type { StatusSummary } from "@trellis/api";
import { FilterBar as FilterToolbar, IconButton, Menu, toast, useHotkey } from "@trellis/ui";
import { type ReactNode, useMemo, useState } from "react";
import { useEscapeLayer } from "../../../lib/hotkeys";
import { toCli } from "../cli";
import { FilterChip } from "../FilterChip";
import { chipFields, type FilterField } from "../fields";
import { serializeSearch, stripDefaults, toListQuery, type View, viewOf } from "../grammar";
import { useScopeLabels } from "../hooks/useScopeLabels";
import { filterLabels } from "../labelValues";
import { FilterPicker, type PickerStage } from "./components/FilterPicker";

export type FilterBarProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
	// The statuses of the scope: the status values and the chip names.
	statuses: readonly StatusSummary[];
	// The filters that the route fixes, such as `epic` on an epic page.
	// `search` never holds them. The bar draws no chip for them and the
	// picker does not offer them, and "Copy as CLI" writes them, so the
	// command lists the rows of the page.
	fixed?: Partial<Pick<View, FilterField>>;
	// The query string of a view for "Copy link", with the leading `?` or "".
	// A route whose defaults differ from `viewDefaults` supplies it.
	linkSearch?: (view: View) => string;
	// The controls at the right end, between Filter and the Share menu.
	actions?: ReactNode;
	// A control drawn first in the group at the right end, such as the view
	// switch, so it sits before Filter.
	lead?: ReactNode;
};

const fields: PickerStage = { kind: "fields" };

const noFixed: Partial<Pick<View, FilterField>> = {};

const listLinkSearch = (view: View) => {
	const query = serializeSearch(view);
	return query === "" ? "" : `?${query}`;
};

// The bar under the topbar: one chip per active filter on the left, then
// Filter, the route's Display control, and Share at the right end. The three
// are icons, because their menus name what they do. `f` opens the picker;
// `g s` focuses the button.
export function FilterBar({
	project,
	search,
	onSearchChange,
	statuses,
	fixed,
	linkSearch = listLinkSearch,
	actions,
	lead,
}: FilterBarProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [open, setOpen] = useState(false);
	const [stage, setStage] = useState<PickerStage>(fields);
	const view = viewOf(search);
	const active = chipFields.filter((field) => view[field] !== undefined);
	const scopeLabels = useScopeLabels(project);
	const labels = useMemo(
		() => filterLabels(scopeLabels.labels, scopeLabels.groups),
		[scopeLabels.labels, scopeLabels.groups],
	);

	const change = (next: View) => onSearchChange(stripDefaults(next));

	const openAt = (next: PickerStage) => {
		setStage(next);
		setOpen(true);
	};

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setStage(fields);
	};

	useHotkey("f", (event) => {
		if (document.activeElement?.closest('[role="dialog"]') !== null) return;
		event.preventDefault();
		openAt(fields);
	});
	useEscapeLayer("popover", open, () => {
		setOpen(false);
	});

	const query = {
		...toListQuery({ ...view, ...fixed }, { statuses }),
		updated: view.updated,
		created: view.created,
		completed: view.completed,
	};
	for (const key of ["updated", "created", "completed"] as const) if (query[key] === undefined) delete query[key];

	const copyCli = async () => {
		await navigator.clipboard.writeText(toCli(project === undefined ? query : { project, ...query }));
		toast("Copied the CLI command");
	};

	const copyLink = async () => {
		await navigator.clipboard.writeText(`${window.location.origin}${pathname}${linkSearch(view)}`);
		toast("Copied the link");
	};

	return (
		<FilterToolbar
			filters={active.map((field: FilterField) => (
				<FilterChip
					key={field}
					field={field}
					view={view}
					statuses={statuses}
					project={project}
					labels={labels}
					onChange={change}
					onEdit={(target) => openAt({ kind: "values", field: target })}
				/>
			))}
		>
			{lead}
			<FilterPicker
				view={view}
				statuses={statuses}
				labels={labels}
				project={project}
				hiddenFields={Object.keys(fixed ?? noFixed) as FilterField[]}
				fixedEpic={fixed?.epic}
				onChange={change}
				open={open}
				onOpenChange={onOpenChange}
				stage={stage}
				onStageChange={setStage}
				trigger={<IconButton label="Filter" icon={<FunnelSimple />} variant="default" data-filter-button="" />}
			/>
			{actions}
			<Menu
				label="Share"
				trigger={<IconButton label="Share" icon={<ShareFat />} variant="default" />}
				items={[
					{ label: "Copy as CLI", icon: <Copy />, onSelect: () => void copyCli() },
					{ label: "Copy link", icon: <Link />, onSelect: () => void copyLink() },
				]}
			/>
		</FilterToolbar>
	);
}
