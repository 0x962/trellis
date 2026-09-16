import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type GroupHeaderProps = {
	group: string;
	label: string;
	count?: ReactNode;
	icon?: ReactNode;
	expanded: boolean;
	onToggle: () => void;
	onCreate?: () => void;
	phone?: boolean;
	top?: number;
	sticky?: boolean;
	controls?: string;
	layout?: "grid" | "section";
};

export const groupHeaderHeight = 32;
export const phoneGroupHeaderHeight = 48;

export function GroupHeader({
	group,
	label,
	count,
	icon,
	expanded,
	onToggle,
	onCreate,
	phone = false,
	top,
	sticky,
	controls,
	layout = "section",
}: GroupHeaderProps) {
	const Chevron = expanded ? CaretDown : CaretRight;
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: The virtual ticket grid exposes each row group's collapsed state.
		<div
			role={layout === "grid" ? "rowgroup" : undefined}
			data-group={group}
			aria-expanded={layout === "grid" ? expanded : undefined}
			style={{
				height: `${phone ? phoneGroupHeaderHeight : groupHeaderHeight}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"group/header flex w-full items-center gap-2 border-y border-border bg-band px-5 max-md:px-4",
				top === undefined ? (sticky ? "sticky top-0 z-10" : "relative") : "absolute top-0 left-0",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				aria-controls={controls}
				className="-ml-1 inline-flex h-7 min-w-7 items-center gap-2 rounded-md px-1 text-sm font-medium text-fg-muted transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
			>
				<Chevron aria-hidden="true" className="size-3 text-fg-faint" />
				{icon}
				{label}
			</button>
			<span data-count="" className="text-sm text-fg-faint tabular">
				{count}
			</span>
			<span className="ml-auto flex items-center gap-1">
				{!expanded && (
					<button
						type="button"
						onClick={onToggle}
						className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm text-fg-faint transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
					>
						Show {count}
						<CaretDown aria-hidden="true" className="size-3" />
					</button>
				)}
				{onCreate && (
					<Tooltip content={`New ticket in ${label}`}>
						<IconButton
							size="xs"
							variant="primary"
							label={`New ticket in ${label}`}
							icon={<Plus />}
							onClick={onCreate}
							className="opacity-0 transition-opacity duration-hover group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100"
						/>
					</Tooltip>
				)}
			</span>
		</div>
	);
}
