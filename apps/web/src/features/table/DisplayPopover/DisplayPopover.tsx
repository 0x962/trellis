import type { Sort } from "@trellis/api";
import { cx, IconButton, Popover, Segmented, Select, Switch, Tooltip } from "@trellis/ui";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, SlidersHorizontal } from "lucide-react";
import { type Density, uiActions, useUiStore } from "../../../stores/uiStore";
import type { Group, View } from "../../filters/grammar";
import { alwaysVisible, type ColumnId, columnLabels, columnOrder } from "../columns";
import { columnVisibility } from "../utils/columnVisibility";

export type DisplayPopoverProps = {
	// The pathname the column and group choices are stored under.
	routeKey: string;
	// True when the scope holds sub-projects: the project column then shows.
	showProject: boolean;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
	density: Density;
	group: Group;
	sort: Sort;
};

const densities = [
	{ value: "comfortable", label: "Comfortable" },
	{ value: "compact", label: "Compact" },
] as const;

const groups = [
	{ value: "none", label: "None" },
	{ value: "status", label: "Status" },
	{ value: "priority", label: "Priority" },
	{ value: "project", label: "Project" },
	{ value: "parent", label: "Parent" },
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

type SortField = (typeof sortFields)[number]["value"];

const overline = "text-xs font-medium tracking-[0.04em] text-fg-faint uppercase";

// The Display popover: the columns as toggle chips, the grouping, the sort
// and its direction, Show completed, and the density. Columns and density
// are preferences of this machine; group, sort, and Show completed are the
// URL, so a link carries them.
export function DisplayPopover({
	routeKey,
	showProject,
	search,
	onSearchChange,
	density,
	group,
	sort,
}: DisplayPopoverProps) {
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = columnVisibility(stored, showProject);
	const hideable = columnOrder.filter((id) => !alwaysVisible.includes(id));
	const descending = sort.startsWith("-");
	const field = sortFields.find((entry) => entry.value === sort.replace(/^-/, "")) ?? sortFields[1];

	const setDensity = (next: Density) => {
		uiActions.setDensity(next);
		onSearchChange({ ...search, density: next });
	};
	const setSort = (next: SortField, nextDescending: boolean) =>
		onSearchChange({ ...search, sort: `${nextDescending ? "-" : ""}${next}` as Sort });

	return (
		<Popover
			label="Display"
			align="end"
			className="w-75 p-3"
			trigger={<IconButton label="Display" icon={<SlidersHorizontal />} size="md" />}
		>
			<div className="flex flex-col gap-3">
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
										"h-6 rounded-sm border px-2 text-sm transition-colors duration-hover ease-out focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
										on ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted hover:text-fg",
									)}
								>
									{columnLabels[id]}
								</button>
							);
						})}
					</div>
				</section>
				<div className="flex flex-col gap-1">
					<div className="flex h-7 items-center justify-between gap-3">
						<span className="text-sm text-fg-muted">Group by</span>
						<Select
							label="Group by"
							items={groups}
							value={group}
							onValueChange={(next) => onSearchChange({ ...search, group: next })}
						/>
					</div>
					<div className="flex h-7 items-center justify-between gap-3">
						<span className="text-sm text-fg-muted">Sort by</span>
						<span className="flex items-center gap-1">
							<Select
								label="Sort by"
								items={sortFields}
								value={field.value}
								onValueChange={(next) => setSort(next, sortFields.find((entry) => entry.value === next)!.descending)}
							/>
							<Tooltip content={descending ? "Descending" : "Ascending"}>
								<IconButton
									size="sm"
									label="Sort direction"
									icon={descending ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
									onClick={() => setSort(field.value, !descending)}
								/>
							</Tooltip>
						</span>
					</div>
					{/* The closed groups show only under the status grouping, so the
					switch acts only there. */}
					<div className="flex h-7 items-center">
						<Switch
							label="Show completed"
							checked={search.closed !== "hide"}
							disabled={group !== "status"}
							onCheckedChange={(on) => onSearchChange({ ...search, closed: on ? undefined : "hide" })}
						/>
					</div>
				</div>
				<section className="flex flex-col gap-1.5">
					<h3 className={overline}>Density</h3>
					<Segmented label="Density" options={densities} value={density} onValueChange={setDensity} />
				</section>
			</div>
		</Popover>
	);
}
