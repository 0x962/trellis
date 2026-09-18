import { CaretDown, CaretRight, DotsThree, UserCheck } from "@phosphor-icons/react";
import type { CSSProperties, KeyboardEvent, Ref } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Menu, type MenuItem } from "../../../../primitives/Menu";
import { toast } from "../../../../primitives/Toast";
import { Tooltip } from "../../../../primitives/Tooltip";
import { cx } from "../../../../utils/cx";
import { formatClock } from "../../../../utils/formatClock";
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
	await navigator.clipboard.writeText(text);
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
};

// One step of a run: the caret of a box, the kind mark, the state mark, the
// title, a short fact, the working avatar, the time, and the actions. The
// error and the output sit under the title. `--flow-run-depth` indents the
// row by its depth in the tree.
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
}: FlowRunRowProps) {
	const KindIcon = flowKindIcons[row.kind];
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
			tabIndex={tabIndex}
			data-state={row.state}
			style={{ "--flow-run-depth": row.depth } as CSSProperties}
			className={cx(
				"group flex min-h-9 flex-col justify-center border-b border-border py-1 ps-[calc(var(--spacing)*5*var(--flow-run-depth))] transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:min-h-11",
				row.hasChildren && "cursor-pointer",
			)}
			onClick={row.hasChildren ? onToggle : undefined}
			onKeyDown={onKeyDown}
			onFocus={onFocus}
		>
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center text-fg-faint">
					{row.hasChildren && <Caret className="size-3" />}
				</span>
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 text-fg-muted *:size-full">
					<KindIcon />
				</span>
				<FlowStepMark state={row.state} />
				<span
					className={cx(
						"min-w-0 flex-1 truncate text-sm font-medium",
						dimStates.has(row.state) ? "text-fg-muted" : "text-fg",
					)}
				>
					{row.title}
				</span>
				{row.meta !== null && <span className="truncate text-xs text-fg-faint max-md:hidden">{row.meta}</span>}
				<span className="flex w-5 shrink-0 items-center justify-center max-md:hidden">{row.actor}</span>
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
			{row.error !== null && <p className="mt-1 ps-16 break-words text-xs text-danger">{row.error}</p>}
			{row.output !== null && (
				<details className="mt-1 ps-16 text-xs">
					<summary className="cursor-pointer text-fg-muted">Output</summary>
					<pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono">{row.output}</pre>
				</details>
			)}
		</div>
	);
}
