import { CaretDown, CaretRight, Play, Plus } from "@phosphor-icons/react";
import type { KeyboardEventHandler, ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type GroupHeaderProps = {
	group: string;
	label: string;
	count?: ReactNode;
	// The count the Show action of a collapsed group prints: the rows that the
	// action reveals. It defaults to `count`. A caller sets it when `count`
	// is a text such as `3/11`.
	showCount?: ReactNode;
	icon?: ReactNode;
	// A text field that takes the place of the label, such as the name field
	// of a wave while the person renames it. The collapse button then holds
	// the chevron and the icon alone.
	labelField?: ReactNode;
	expanded: boolean;
	onToggle: () => void;
	onCreate?: () => void;
	// Opens the Start wave dialog of a wave group.
	onStart?: () => void;
	// More header actions, after Start wave and before New ticket. They show
	// with the other actions, and stay while a menu of theirs is open.
	actions?: ReactNode;
	// Reads the keys of the focused collapse button.
	onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
	phone?: boolean;
	// The box height in px. It defaults to `groupHeaderHeight`, or to
	// `phoneGroupHeaderHeight` on a phone. A virtual list that reserves its
	// own header height passes the same number here.
	height?: number;
	top?: number;
	sticky?: boolean;
	controls?: string;
	layout?: "grid" | "section";
	appearance?: "band" | "sidebar";
};

export const groupHeaderHeight = 32;
export const phoneGroupHeaderHeight = 48;

// A header action shows while the pointer or the focus is on the header, and
// always on a touch screen.
const revealOnHover =
	"opacity-0 transition-opacity duration-hover group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100";

export function GroupHeader({
	group,
	label,
	count,
	showCount,
	icon,
	labelField,
	expanded,
	onToggle,
	onCreate,
	onStart,
	actions,
	onKeyDown,
	phone = false,
	height = phone ? phoneGroupHeaderHeight : groupHeaderHeight,
	top,
	sticky,
	controls,
	layout = "section",
	appearance = "band",
}: GroupHeaderProps) {
	const Chevron = expanded ? CaretDown : CaretRight;
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: The virtual ticket grid exposes each row group's collapsed state.
		<div
			role={layout === "grid" ? "rowgroup" : undefined}
			data-group={group}
			aria-expanded={layout === "grid" ? expanded : undefined}
			style={{
				height: `${height}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"group/header flex w-full items-center gap-2",
				appearance === "sidebar" ? "bg-bg px-4" : "border-y border-border bg-band px-5 max-md:px-4",
				top === undefined ? (sticky ? "sticky top-0 z-10" : "relative") : "absolute top-0 left-0",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				aria-controls={controls}
				aria-label={labelField === undefined ? undefined : label}
				onKeyDown={onKeyDown}
				className={cx(
					"-ml-1 inline-flex h-7 min-w-7 items-center gap-2 rounded-md px-1 font-medium text-fg-muted transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11",
					appearance === "sidebar" ? "text-xs" : "text-sm",
				)}
			>
				<Chevron aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
				{icon}
				{/* The box is a fixed height, and a button centers its text, so a
				    name that wraps prints centered lines that spill over the rows
				    above and below. One line with an ellipsis holds the box. */}
				{labelField === undefined && <span className="truncate">{label}</span>}
			</button>
			{labelField}
			<span
				data-count=""
				className={cx("shrink-0 text-fg-faint tabular", appearance === "sidebar" ? "text-xs" : "text-sm")}
			>
				{count}
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-1">
				{!expanded && appearance === "band" && (
					<button
						type="button"
						onClick={onToggle}
						className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-sm text-fg-faint transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
					>
						Show {showCount ?? count}
						<CaretDown aria-hidden="true" className="size-3" />
					</button>
				)}
				{onStart && (
					<Tooltip content="Start wave">
						<IconButton
							size="xs"
							variant="primary"
							label="Start wave"
							icon={<Play />}
							onClick={onStart}
							className={revealOnHover}
						/>
					</Tooltip>
				)}
				{actions !== undefined && (
					<span className={cx("flex items-center gap-1", revealOnHover, "has-[[data-popup-open]]:opacity-100")}>
						{actions}
					</span>
				)}
				{onCreate && (
					<Tooltip content={`New ticket in ${label}`}>
						<IconButton
							size="xs"
							variant="primary"
							label={`New ticket in ${label}`}
							icon={<Plus />}
							onClick={onCreate}
							className={revealOnHover}
						/>
					</Tooltip>
				)}
			</span>
		</div>
	);
}
