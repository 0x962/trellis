import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import { cx, insetRowHover, Menu, StackedBar } from "@trellis/ui";
import type { CSSProperties } from "react";
import { compactRelativeTime } from "../../../../../lib/format";
import { epicSplat } from "../../../../../lib/projectUrl";
import { desktopRowHeight, phoneRowHeight } from "../../../../table/rowHeights";
import { epicProgressLabel, epicProgressText, epicSegments } from "../../../epicBar";
import { currentWaveLabel } from "../../../epicNext";

export type EpicRowProps = {
	epic: EpicSummary;
	// True under an archived project: the server refuses every write, so
	// the menu offers none.
	readOnly: boolean;
	onEdit: () => void;
	onDelete: () => void;
};

type EpicRowStyle = CSSProperties & { "--phone-row-min-height": string };

export function EpicRow({ epic, readOnly, onEdit, onDelete }: EpicRowProps) {
	const wave = currentWaveLabel(epic);
	const style: EpicRowStyle = {
		minHeight: `${desktopRowHeight}px`,
		"--phone-row-min-height": `${phoneRowHeight}px`,
	};

	return (
		<li
			data-epic={epic.slug}
			style={style}
			className={cx(
				"group/row relative grid w-full grid-cols-[minmax(0,1fr)_140px_48px_48px_28px] items-center gap-3 border-b border-border px-5 text-base transition-colors duration-hover max-md:!min-h-[var(--phone-row-min-height)] max-md:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*11)] max-md:grid-rows-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-0 max-md:px-4",
				insetRowHover,
			)}
		>
			<Link
				to="/p/$"
				params={{ _splat: epicSplat(epic.ref) }}
				search={{}}
				data-epic-name=""
				className="flex h-full min-w-0 items-center gap-2 text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-md:min-h-9 max-md:flex-col max-md:items-start max-md:justify-end max-md:gap-0 max-md:pb-0.5 max-md:pt-1.5"
			>
				<span className="min-w-0 truncate max-md:whitespace-normal max-md:break-words">{epic.name}</span>
				{wave !== null && (
					<span className="min-w-0 truncate text-sm text-fg-muted tabular max-md:whitespace-normal max-md:break-words">
						{wave}
					</span>
				)}
			</Link>
			<StackedBar
				label={`${epic.name}: ${epicProgressText(epic.counts)}`}
				segments={epicSegments(epic.counts)}
				legend={false}
				className="w-full max-md:hidden"
			/>
			<span className="text-sm text-fg-muted tabular max-md:hidden">
				<span aria-hidden="true">{epicProgressLabel(epic.counts)}</span>
				<span className="sr-only">{epicProgressText(epic.counts)}</span>
			</span>
			<time dateTime={epic.updatedAt} className="text-sm text-fg-muted tabular max-md:hidden">
				{compactRelativeTime(epic.updatedAt)}
			</time>
			<span className="flex w-7 justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100 max-md:col-start-2 max-md:row-span-2 max-md:row-start-1 max-md:h-11 max-md:w-11 max-md:items-center">
				<Menu
					label={`Actions for ${epic.name}`}
					triggerTooltip="Epic actions"
					items={[
						{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: onEdit },
						{ label: "Delete…", icon: <Trash />, danger: true, disabled: readOnly, onSelect: onDelete },
					]}
				/>
			</span>
			<span className="hidden pb-1.5 text-sm text-fg-muted tabular max-md:col-start-1 max-md:row-start-2 max-md:block">
				{epicProgressText(epic.counts)} · <time dateTime={epic.updatedAt}>{compactRelativeTime(epic.updatedAt)}</time>
			</span>
		</li>
	);
}
