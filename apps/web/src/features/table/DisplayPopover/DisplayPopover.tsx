import type { Sort } from "@trellis/api";
import { Button, Popover, Segmented, Switch } from "@trellis/ui";
import { SlidersHorizontal } from "lucide-react";
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

// One sort per field. The URL keeps the direction the field reads best in.
const sorts = [
	{ value: "-priority", label: "Priority" },
	{ value: "-updatedAt", label: "Updated" },
	{ value: "-createdAt", label: "Created" },
	{ value: "status", label: "Status" },
	{ value: "-number", label: "ID" },
] as const;

type SortValue = (typeof sorts)[number]["value"];

const sortValue = (sort: Sort): SortValue =>
	sorts.find((entry) => entry.value === sort)?.value ??
	sorts.find((entry) => entry.value.replace(/^-/, "") === sort.replace(/^-/, ""))!.value;

// The Display popover: the columns, the density, the grouping, and the
// sort. Columns and density are preferences of this machine; group and
// sort are the URL, so a link carries them.
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

	const setDensity = (next: Density) => {
		uiActions.setDensity(next);
		onSearchChange({ ...search, density: next });
	};

	return (
		<Popover
			label="Display"
			align="end"
			className="w-80 p-3"
			trigger={
				<Button variant="quiet" size="sm" icon={<SlidersHorizontal />} aria-label="Display">
					<span className="max-md:sr-only">Display</span>
				</Button>
			}
		>
			<div className="flex flex-col gap-3">
				<section className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium text-fg-faint">Columns</h3>
					<div className="grid grid-cols-2 gap-x-3 gap-y-1">
						{hideable.map((id: ColumnId) => (
							<Switch
								key={id}
								label={columnLabels[id]}
								checked={visibility[id] !== false}
								onCheckedChange={(checked) => uiActions.setColumnVisible(routeKey, id, checked)}
							/>
						))}
					</div>
				</section>
				<section className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium text-fg-faint">Density</h3>
					<Segmented label="Density" options={densities} value={density} onValueChange={setDensity} />
				</section>
				<section className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium text-fg-faint">Group by</h3>
					<Segmented
						label="Group by"
						options={groups}
						value={group}
						onValueChange={(next) => onSearchChange({ ...search, group: next })}
					/>
				</section>
				<section className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium text-fg-faint">Sort by</h3>
					<Segmented
						label="Sort by"
						options={sorts}
						value={sortValue(sort)}
						onValueChange={(next) => onSearchChange({ ...search, sort: next })}
					/>
				</section>
			</div>
		</Popover>
	);
}
