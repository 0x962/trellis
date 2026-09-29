import { CaretDown, CaretRight, DotsThree, UserCheck } from "@phosphor-icons/react";
import type { CSSProperties, KeyboardEvent, Ref } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Menu, type MenuItem } from "../../../../primitives/Menu";
import { toast } from "../../../../primitives/Toast";
import { Tooltip } from "../../../../primitives/Tooltip";
import { cx } from "../../../../utils/cx";
import { formatClock } from "../../../../utils/formatClock";
import { writeClipboard } from "../../../../utils/writeClipboard";
import { flowKindIcons } from "../../flowKindIcons";
import type { FlowRunRow as Row } from "../../types";
import { FlowStepMark } from "../FlowStepMark";

const liveStates = new Set(["ready", "running", "waiting_human", "unknown"]);
const dimStates = new Set(["not_started", "skipped", "canceled"]);

// The time cell: how long a live row has run, how long a live box has left
// before its time limit, or how long a finished row took.
export const rowTime = (row: Row, now: number) => {
	if (row.startedAt === null) return null;
	if (liveStates.has(row.state))
		return row.deadlineAt === null ? formatClock(now - row.startedAt) : `${formatClock(row.deadlineAt - now)} left`;
	return row.endedAt === null ? null : formatClock(row.endedAt - row.startedAt);
};

const copy = async (text: string, what: string) => {
	await writeClipboard(text);
	toast.success(`${what} copied`);
};

export type FlowRunRowProps = {
	row: Row;
	now: number;
	// Set on a box: whether its children show.
	expanded: boolean | undefined;
	tabIndex: 0 | -1;
	ref: Ref<HTMLDivElement>;
	onToggle: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	onFocus: () => void;
	onDecide: () => void;
	onOpenTerminal: () => void;
	selected?: boolean;
	outputExpanded?: boolean;
	onOutputToggle?: (expanded: boolean) => void;
};

// One step of a run: the caret of a box, the kind mark, the state mark, the
// title, a short fact, the avatar of the agent, the time, and the actions. The
// error and the output sit under the title. `--flow-run-depth` indents the
// row by its depth in the tree.
//
// On an `agent` row that has `row.actor`, the avatar is the kind mark: it
// already says "agent" and it names the model. The avatar column of that row
// stays empty, so the row draws the avatar once. A gate or an exit question
// keeps its kind mark and draws the avatar in the avatar column.
export function FlowRunRow({
	row,
	now,
	expanded,
	tabIndex,
	ref,
	onToggle,
	onKeyDown,
	onFocus,
	onDecide,
	onOpenTerminal,
	selected,
	outputExpanded,
	onOutputToggle,
}: FlowRunRowProps) {
	const KindIcon = row.kind === null ? null : flowKindIcons[row.kind];
	const actorIsKindMark = row.kind === "agent" && row.actor != null;
	const Caret = expanded ? CaretDown : CaretRight;
	const time = rowTime(row, now);
	const items: MenuItem[] = [];
	if (row.terminal) items.push({ label: "Open terminal", onSelect: onOpenTerminal });
	if (row.output !== null) {
		const output = row.output;
		items.push({ label: "Copy output", onSelect: () => void copy(output, "Output") });
	}
	if (row.error !== null) {
		const error = row.error;
		items.push({ label: "Copy error", onSelect: () => void copy(error, "Error") });
	}
	return (
		<div
			ref={ref}
			role="treeitem"
			aria-level={row.depth + 1}
			aria-expanded={expanded}
			aria-selected={selected}
			tabIndex={tabIndex}
			data-state={row.state}
			style={{ "--flow-run-depth": row.depth } as CSSProperties}
			className={cx(
				"group flex min-h-9 flex-col justify-center border-b border-border py-1 ps-[min(calc(var(--spacing)*5*var(--flow-run-depth)),25%)] transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:min-h-11 max-md:ps-0",
				row.hasChildren && "cursor-pointer",
				selected && "bg-accent-soft",
			)}
			onClick={row.hasChildren ? onToggle : undefined}
			onKeyDown={onKeyDown}
			onFocus={onFocus}
		>
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center text-fg-faint">
					{row.hasChildren && <Caret className="size-3" />}
				</span>
				{actorIsKindMark ? (
					// The avatar is 18 px in the 14 px kind slot. It overflows 2 px on each
					// side, so the state mark and the title start at the same x on every row.
					<span className="inline-flex size-3.5 shrink-0 items-center justify-center">{row.actor}</span>
				) : (
					<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 text-fg-muted *:size-full">
						{KindIcon && <KindIcon />}
					</span>
				)}
				<FlowStepMark state={row.state} />
				<span
					title={row.title}
					className={cx(
						"min-w-0 flex-1 truncate text-sm font-medium",
						dimStates.has(row.state) ? "text-fg-muted" : "text-fg",
					)}
				>
					{row.title}
				</span>
				<span className="flex w-5 shrink-0 items-center justify-center max-md:hidden">
					{actorIsKindMark ? null : row.actor}
				</span>
				<span
					className="w-20 shrink-0 text-right text-xs text-fg-faint tabular"
					title={row.startedAt === null ? undefined : `Started ${new Date(row.startedAt).toLocaleString()}`}
				>
					{time}
				</span>
				<span className="flex w-16 shrink-0 items-center justify-end gap-1">
					{row.decidable && (
						<Tooltip content={`Decide ${row.title}`}>
							<IconButton
								label={`Decide ${row.title}`}
								icon={<UserCheck />}
								onClick={(event) => {
									event.stopPropagation();
									onDecide();
								}}
							/>
						</Tooltip>
					)}
					{items.length > 0 && (
						<Menu
							label={`Actions for ${row.title}`}
							triggerTooltip="Actions"
							trigger={
								<IconButton
									label={`Actions for ${row.title}`}
									icon={<DotsThree />}
									onClick={(event) => event.stopPropagation()}
									className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100 max-md:opacity-100"
								/>
							}
							items={items}
						/>
					)}
				</span>
			</div>
			{row.meta !== null && <p className="ps-8 break-words text-xs text-fg-muted">{row.meta}</p>}
			{row.error !== null && <p className="mt-1 ps-16 break-words text-xs text-danger">{row.error}</p>}
			{row.output !== null && (
				<details
					className="mt-1 ps-16 text-xs"
					open={outputExpanded}
					onToggle={(event) => onOutputToggle?.(event.currentTarget.open)}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<summary className="cursor-pointer text-fg-muted">Output</summary>
					<pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono">{row.output}</pre>
				</details>
			)}
		</div>
	);
}
