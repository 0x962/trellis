import type { StatusCategory, StatusSummary } from "@trellis/api";
import { GroupHeader as SharedGroupHeader, type GroupHeaderProps as SharedProps, StatusIcon } from "@trellis/ui";
import { formatCount } from "../../../lib/format";

export type GroupHeaderProps = Omit<SharedProps, "count" | "icon" | "layout"> & {
	count: number;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { groupHeaderHeight, phoneGroupHeaderHeight } from "@trellis/ui";

export function GroupHeader({ count, status, category, ...props }: GroupHeaderProps) {
	return (
		<SharedGroupHeader
			{...props}
			layout="grid"
			count={formatCount(count)}
			icon={
				category === undefined ? undefined : <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />
			}
		/>
	);
}
