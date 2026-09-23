import type { StatusCategory, StatusSummary } from "@trellis/api";
import {
	phoneGroupHeaderHeight,
	GroupHeader as SharedGroupHeader,
	type GroupHeaderProps as SharedProps,
	StatusIcon,
} from "@trellis/ui";
import { formatCount } from "../../../lib/format";
import { progressIcon } from "../../progressIcon";
import { statusIconProps } from "../../statusIconProps";
import { groupHeaderHeight } from "../rowHeights";

export type GroupHeaderProps = Omit<SharedProps, "count" | "showCount" | "icon" | "layout" | "height"> & {
	// The rows of the group. The Show action of a collapsed group prints it.
	count: number;
	// The text the count slot prints in place of `count`, expanded or
	// collapsed, such as the `3/11` of a wave.
	countLabel?: string;
	// The counts that set the progress circle before a wave title.
	completedCount?: number;
	totalCount?: number;
	// The rows of the group that wait for the person. The count slot prints
	// it after the count, `0/6 · 1 for you`. Undefined on a table that does
	// not read what a row waits for, and 0 prints nothing.
	forYou?: number;
	// True when the wave progress circle is complete.
	done?: boolean;
	// True for the time the wave progress circle takes to fill to full,
	// because the last open ticket of the wave was marked done a moment
	// ago. The header keeps the circle over the done mark for that time, so
	// the disk has a share to grow from.
	filling?: boolean;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { phoneGroupHeaderHeight } from "@trellis/ui";

export function GroupHeader({
	count,
	countLabel,
	completedCount,
	totalCount,
	forYou,
	status,
	category,
	done,
	filling = false,
	...props
}: GroupHeaderProps) {
	const parts = [countLabel ?? formatCount(count)];
	if (forYou !== undefined && forYou > 0) parts.push(`${formatCount(forYou)} for you`);
	const icon =
		(completedCount !== undefined && totalCount !== undefined
			? progressIcon(completedCount, totalCount, done === true, filling)
			: undefined) ??
		(category === undefined ? undefined : (
			<StatusIcon {...(status === undefined ? { category } : statusIconProps(status))} />
		));
	return (
		<SharedGroupHeader
			{...props}
			layout="grid"
			height={props.phone ? phoneGroupHeaderHeight : groupHeaderHeight}
			count={parts.join(" · ")}
			showCount={formatCount(count)}
			icon={icon}
		/>
	);
}
