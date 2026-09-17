import { SlidersHorizontal, SortAscending, SortDescending } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { Select } from "../../primitives/Select";
import { Tooltip } from "../../primitives/Tooltip";

export type DisplaySortField = { value: string; label: string; descending: boolean };
export type DisplayPopoverProps = {
	fields: readonly DisplaySortField[];
	field: string;
	descending: boolean;
	onSortChange: (field: string, descending: boolean) => void;
	beforeSort?: ReactNode;
	afterSort?: ReactNode;
};

export function DisplayPopover({
	fields,
	field,
	descending,
	onSortChange,
	beforeSort,
	afterSort,
}: DisplayPopoverProps) {
	return (
		<Popover
			label="Display"
			align="end"
			className="w-75 p-3"
			triggerTooltip="Display"
			trigger={<IconButton label="Display" icon={<SlidersHorizontal />} variant="default" />}
		>
			<div className="flex flex-col gap-3">
				{beforeSort}
				<div className="flex h-7 items-center justify-between gap-3">
					<span className="text-sm text-fg-muted">Sort by</span>
					<span className="flex items-center gap-1">
						<Select
							label="Sort by"
							items={fields}
							value={field}
							onValueChange={(next) => onSortChange(next, fields.find((entry) => entry.value === next)!.descending)}
						/>
						<Tooltip content={descending ? "Descending" : "Ascending"}>
							<IconButton
								size="xs"
								label="Sort direction"
								aria-description={descending ? "Descending" : "Ascending"}
								icon={descending ? <SortDescending /> : <SortAscending />}
								onClick={() => onSortChange(field, !descending)}
							/>
						</Tooltip>
					</span>
				</div>
				{afterSort}
			</div>
		</Popover>
	);
}
