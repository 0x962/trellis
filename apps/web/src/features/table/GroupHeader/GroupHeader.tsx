import type { StatusCategory, StatusSummary } from "@trellis/api";
import {
	phoneGroupHeaderHeight,
	GroupHeader as SharedGroupHeader,
	type GroupHeaderProps as SharedProps,
	StatusIcon,
} from "@trellis/ui";
import { formatCount } from "../../../lib/format";
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
	// The rows of the group whose turn is the person. The count slot prints
	// it after the count, `0/6 · 1 for you`. Undefined on a table that does
	// not read the turn of a row, and 0 prints nothing.
	forYou?: number;
	// True when the wave progress circle is complete.
	done?: boolean;
	status?: StatusSummary;
	category?: StatusCategory;
};
export { phoneGroupHeaderHeight } from "@trellis/ui";

const progressIcon = (
	completedCount: number | undefined,
	totalCount: number | undefined,
	done: boolean | undefined,
) => {
	if (completedCount === undefined || totalCount === undefined) return undefined;
	const label = `${formatCount(completedCount)} of ${formatCount(totalCount)} done`;
	if (done === true) return <StatusIcon category="done" color="success" label={label} />;
	if (completedCount === 0) return <StatusIcon category="todo" label={label} />;
	const progress = totalCount === 0 ? 0 : completedCount / totalCount;
	return <StatusIcon category="started" color="success" progress={progress} label={label} />;
};

export function GroupHeader({
	count,
	countLabel,
	completedCount,
	totalCount,
	forYou,
	status,
	category,
	done,
	...props
}: GroupHeaderProps) {
	const parts = [countLabel ?? formatCount(count)];
	if (forYou !== undefined && forYou > 0) parts.push(`${formatCount(forYou)} for you`);
	const icon =
		progressIcon(completedCount, totalCount, done) ??
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
