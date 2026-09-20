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
	// The rows of the group whose turn is the person. The count slot prints
	// it after the count, `0/6 · 1 for you`. Undefined on a table that does
	// not read the turn of a row, and 0 prints nothing.
	forYou?: number;
	// A muted word beside the count, such as Later.
	note?: string;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { groupHeaderHeight, phoneGroupHeaderHeight } from "@trellis/ui";

export function GroupHeader({ count, countLabel, badge, forYou, note, status, category, ...props }: GroupHeaderProps) {
	const parts = [countLabel ?? formatCount(count)];
	if (forYou !== undefined && forYou > 0) parts.push(`${formatCount(forYou)} for you`);
	if (note !== undefined) parts.push(note);
	return (
		<SharedGroupHeader
			{...props}
			layout="grid"
			count={parts.join(" · ")}
			showCount={formatCount(count)}
			mark={badge === undefined ? undefined : <Badge tone="accent">{badge}</Badge>}
			icon={
				category === undefined ? undefined : <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />
			}
		/>
	);
}
