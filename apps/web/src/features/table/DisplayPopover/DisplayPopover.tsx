import type { Sort } from "@trellis/api";
import { cx, DisplayPopover as DisplayOptions, Select, Switch } from "@trellis/ui";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import type { Group, View } from "../../filters/grammar";
import { alwaysVisible, type ColumnId, columnLabels, columnOrder, type TableKind } from "../columns";
import { columnVisibility, kindShows } from "../utils/columnVisibility";

export type DisplayPopoverProps = {
	// The pathname the column and group choices are stored under.
	routeKey: string;
	// The kind of table the route draws. The popover offers the columns of
	// that kind alone.
	tableKind?: TableKind;
	// True when the route reads more than one project: the project column then shows.
	showProject: boolean;
	// True when the route fixes the epic, as the epic page does. Every row
	// then holds the same epic, so the popover offers no Epic group and no
	// Epic column.
	epicFixed?: boolean;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
	group: Group;
	sort: Sort;
};

const groups = [
	{ value: "none", label: "None" },
	{ value: "status", label: "Status" },
	{ value: "priority", label: "Priority" },
	{ value: "project", label: "Project" },
	{ value: "parent", label: "Parent" },
	{ value: "epic", label: "Epic" },
	{ value: "wave", label: "Wave" },
	{ value: "waiting", label: "Waiting" },
	{ value: "pr", label: "PR" },
] as const;

// One sort per field, and the direction each field reads best in. A new
// field takes that direction; the direction button flips it.
const sortFields = [
	{ value: "priority", label: "Priority", descending: true },
	{ value: "updatedAt", label: "Updated", descending: true },
	{ value: "createdAt", label: "Created", descending: true },
	{ value: "status", label: "Status", descending: false },
	{ value: "number", label: "ID", descending: true },
] as const;

const overline = "text-xs font-medium tracking-[0.04em] text-fg-faint uppercase";

// Column visibility stays on this machine. The URL carries grouping,
// sorting, and Show completed so a shared link keeps those choices.
export function DisplayPopover({
	routeKey,
	tableKind = "list",
	showProject,
	epicFixed = false,
	search,
	onSearchChange,
	group,
	sort,
}: DisplayPopoverProps) {
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = columnVisibility(stored, showProject, tableKind);
	const hideable = columnOrder.filter(
		(id) => !alwaysVisible.includes(id) && !(epicFixed && id === "epic") && kindShows(id, tableKind),
	);
	// Only the epic route loads what the Waiting grouping of a row reads, so
	// only that route offers the Waiting entry. It offers no Epic entry, because every
	// row there holds the same epic.
	const groupItems = groups.filter((entry) => (epicFixed ? entry.value !== "epic" : entry.value !== "waiting"));
	// The table shows the Done and Canceled rows under the status grouping,
	// and under the wave and Waiting groupings of one epic.
	const oneEpic = epicFixed || (search.epic !== undefined && search.epic !== "none");
	const showsClosed = group === "status" || ((group === "wave" || group === "waiting") && oneEpic);
	const descending = sort.startsWith("-");
	const fields = sortFields.filter((entry) => !epicFixed || entry.value !== "updatedAt");
	const field = sort.replace(/^-/, "");

	const setSort = (next: string, nextDescending: boolean) =>
		onSearchChange({ ...search, sort: `${nextDescending ? "-" : ""}${next}` as Sort });

	return (
		<DisplayOptions
			fields={fields}
			field={field}
			descending={descending}
			onSortChange={setSort}
			beforeSort={
				<>
					<section className="flex flex-col gap-1.5">
						<h3 className={overline}>Columns</h3>
						<div className="flex flex-wrap gap-1.5">
							{hideable.map((id: ColumnId) => {
								const on = visibility[id] !== false;
								return (
									<button
										key={id}
										type="button"
										aria-pressed={on}
										onClick={() => uiActions.setColumnVisible(routeKey, id, !on)}
										className={cx(
											"h-7 rounded-md border px-2 text-sm transition-colors duration-hover ease-out focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
											on ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted hover:text-fg",
										)}
									>
										{columnLabels[id]}
									</button>
								);
							})}
						</div>
					</section>
					<div className="flex h-7 items-center justify-between gap-3">
						<span className="text-sm text-fg-muted">Group by</span>
						<Select
							label="Group by"
							items={groupItems}
							value={group}
							onValueChange={(next) => onSearchChange({ ...search, group: next })}
						/>
					</div>
				</>
			}
			afterSort={
				<div className="flex h-7 items-center">
					<Switch
						label="Show completed"
						checked={search.closed !== "hide"}
						disabled={!showsClosed}
						onCheckedChange={(on) => onSearchChange({ ...search, closed: on ? undefined : "hide" })}
					/>
				</div>
			}
		/>
	);
}
