import { useRouterState } from "@tanstack/react-router";
import type { StatusSummary } from "@trellis/api";
import { FilterGlyph, IconButton, Menu, ShareGlyph, toast, useHotkey } from "@trellis/ui";
import { Copy, Link2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toCli } from "../cli";
import { FilterChip } from "../FilterChip";
import { chipFields, type FilterField } from "../fields";
import { serializeSearch, stripDefaults, toListQuery, type View, viewOf } from "../grammar";
import { FilterPicker, type PickerStage } from "./components/FilterPicker";

export type FilterBarProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
	// The statuses of the scope: the status values and the chip names.
	statuses: readonly StatusSummary[];
	// The controls at the right end, between Filter and the Share menu.
	actions?: ReactNode;
};

const fields: PickerStage = { kind: "fields" };

// The bar under the topbar: one chip per active filter on the left, then
// Filter, the route's Display control, and Share at the right end. The three
// are icons, because their menus name what they do. `f` opens the picker;
// `g s` focuses the button.
export function FilterBar({ project, search, onSearchChange, statuses, actions }: FilterBarProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [open, setOpen] = useState(false);
	const [stage, setStage] = useState<PickerStage>(fields);
	const view = viewOf(search);
	const active = chipFields.filter((field) => view[field] !== undefined);

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

	const query = {
		...toListQuery(view, { statuses }),
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
		const search = serializeSearch(view);
		await navigator.clipboard.writeText(`${window.location.origin}${pathname}${search === "" ? "" : `?${search}`}`);
		toast("Copied the link");
	};

	return (
		<div
			data-filter-bar=""
			tabIndex={-1}
			// The bar is 48 px on a coarse pointer, so the 44 px controls in it
			// stay inside it and never cover the bar above or the first row below.
			className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-12 max-md:overflow-x-auto max-md:px-4 max-md:*:shrink-0"
		>
			{/* A chip that does not fit scrolls inside the bar, never the page. */}
			{active.map((field: FilterField) => (
				<FilterChip
					key={field}
					field={field}
					view={view}
					statuses={statuses}
					onChange={change}
					onEdit={(target) => openAt({ kind: "values", field: target })}
				/>
			))}
			<div className="ml-auto flex items-center gap-1">
				<FilterPicker
					view={view}
					statuses={statuses}
					project={project}
					onChange={change}
					open={open}
					onOpenChange={onOpenChange}
					stage={stage}
					onStageChange={setStage}
					trigger={<IconButton label="Filter" icon={<FilterGlyph />} size="sm" data-filter-button="" />}
				/>
				{actions}
				<Menu
					label="Share"
					trigger={<IconButton label="Share" icon={<ShareGlyph />} size="sm" />}
					items={[
						{ label: "Copy as CLI", icon: <Copy />, onSelect: () => void copyCli() },
						{ label: "Copy link", icon: <Link2 />, onSelect: () => void copyLink() },
					]}
				/>
			</div>
		</div>
	);
}
