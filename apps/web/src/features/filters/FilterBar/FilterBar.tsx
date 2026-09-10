import { useRouterState } from "@tanstack/react-router";
import type { StatusSummary } from "@trellis/api";
import { Button, IconButton, Menu, toast, useHotkey } from "@trellis/ui";
import { Copy, Link2, ListFilter, Share2 } from "lucide-react";
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
	// The scope chip of a project route, before the filter chips.
	children?: ReactNode;
	// The controls at the right end, before the Share menu.
	actions?: ReactNode;
};

const fields: PickerStage = { kind: "fields" };

// The bar under the topbar: one chip per active filter, the Filter button
// with its picker, the route's Display button, and the Share menu with the
// copy actions. Filter and Display are the only text buttons. `f` opens
// the picker; `g s` focuses the button.
export function FilterBar({ project, search, onSearchChange, statuses, children, actions }: FilterBarProps) {
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
			className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-md:overflow-x-auto max-md:px-4 max-md:*:shrink-0"
		>
			{children}
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
			<FilterPicker
				view={view}
				statuses={statuses}
				project={project}
				onChange={change}
				open={open}
				onOpenChange={onOpenChange}
				stage={stage}
				onStageChange={setStage}
				trigger={
					<Button variant="quiet" size="sm" icon={<ListFilter />} kbd="f" aria-label="Filter" data-filter-button="">
						Filter
					</Button>
				}
			/>
			<div className="ml-auto flex items-center gap-1">
				{actions}
				<Menu
					label="Share"
					trigger={<IconButton label="Share" icon={<Share2 />} size="md" />}
					items={[
						{ label: "Copy as CLI", icon: <Copy />, onSelect: () => void copyCli() },
						{ label: "Copy link", icon: <Link2 />, onSelect: () => void copyLink() },
					]}
				/>
			</div>
		</div>
	);
}
