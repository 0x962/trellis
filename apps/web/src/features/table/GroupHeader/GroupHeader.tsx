import type { StatusCategory, StatusSummary } from "@trellis/api";
import { Badge, GroupHeader as SharedGroupHeader, type GroupHeaderProps as SharedProps, StatusIcon } from "@trellis/ui";
import { formatCount } from "../../../lib/format";

export type GroupHeaderProps = Omit<SharedProps, "count" | "showCount" | "icon" | "mark" | "layout"> & {
	// The rows of the group. The Show action of a collapsed group prints it.
	count: number;
	// The text the count slot prints in place of `count`, expanded or
	// collapsed, such as the `3/11` of a milestone.
	countLabel?: string;
	// The word of the `Badge` after the label, such as Current.
	badge?: string;
	// A muted word beside the count, such as Later.
	note?: string;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { groupHeaderHeight, phoneGroupHeaderHeight } from "@trellis/ui";

export function GroupHeader({ count, countLabel, badge, note, status, category, ...props }: GroupHeaderProps) {
	const text = countLabel ?? formatCount(count);
	return (
		<SharedGroupHeader
			{...props}
			layout="grid"
			count={note === undefined ? text : `${text} · ${note}`}
			showCount={formatCount(count)}
			mark={badge === undefined ? undefined : <Badge tone="accent">{badge}</Badge>}
			icon={
				category === undefined ? undefined : <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />
			}
		/>
	);
}
