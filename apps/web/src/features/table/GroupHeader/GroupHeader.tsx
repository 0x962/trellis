import type { StatusCategory, StatusSummary } from "@trellis/api";
import { GroupHeader as SharedGroupHeader, type GroupHeaderProps as SharedProps, StatusIcon } from "@trellis/ui";
import { formatCount } from "../../../lib/format";

export type GroupHeaderProps = Omit<SharedProps, "count" | "icon" | "layout"> & {
	count: number;
	// The text the count slot of an expanded group prints in place of `count`.
	// A collapsed group prints `count`, because its Show action repeats the
	// count slot as the number of rows it reveals.
	countLabel?: string;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { groupHeaderHeight, phoneGroupHeaderHeight } from "@trellis/ui";

export function GroupHeader({ count, countLabel, status, category, ...props }: GroupHeaderProps) {
	return (
		<SharedGroupHeader
			{...props}
			layout="grid"
			count={props.expanded && countLabel !== undefined ? countLabel : formatCount(count)}
			icon={
				category === undefined ? undefined : <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />
			}
		/>
	);
}
