import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { FlowRunRow } from "./components/FlowRunRow";
import type { FlowRunRow as Row } from "./types";
import { visibleRows } from "./visibleRows";

export type FlowRunTreeProps = {
	// The accessible name of the tree, such as the flow name.
	label: string;
	// Every row of the run in display order: a parent before its descendants.
	rows: readonly Row[];
	// The current time, for the live time cells.
	now: number;
	onDecide: (key: string) => void;
	onOpenTerminal: (key: string) => void;
};

// The steps of one flow run as a tree. A box row collapses its descendants.
// Arrow keys move between rows, Right opens a box or enters it, Left closes
// a box or returns to its parent, and Enter or Space toggles a box. A
// skipped box starts collapsed, because its steps never ran.
export function FlowRunTree({ label, rows, now, onDecide, onOpenTerminal }: FlowRunTreeProps) {
	const [collapsed, setCollapsed] = useState(
		() => new Set(rows.filter((row) => row.hasChildren && row.state === "skipped").map((row) => row.key)),
	);
	const [focusKey, setFocusKey] = useState<string | null>(null);
	const elements = useRef(new Map<string, HTMLDivElement>());
	const visible = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
	const toggle = (key: string) =>
		setCollapsed((previous) => {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	const focus = (key: string | undefined) => {
		if (key === undefined) return;
		setFocusKey(key);
		elements.current.get(key)?.focus();
	};
	const keyDown = (event: KeyboardEvent<HTMLDivElement>, row: Row, index: number) => {
		if (event.target !== event.currentTarget) return;
		const open = row.hasChildren && !collapsed.has(row.key);
		if (event.key === "ArrowDown") focus(visible[index + 1]?.key);
		else if (event.key === "ArrowUp") focus(visible[index - 1]?.key);
		else if (event.key === "Home") focus(visible[0]?.key);
		else if (event.key === "End") focus(visible.at(-1)?.key);
		else if (event.key === "ArrowRight" && row.hasChildren) {
			if (open) focus(visible[index + 1]?.key);
			else toggle(row.key);
		} else if (event.key === "ArrowLeft") {
			if (open) toggle(row.key);
			else focus(row.parentKey ?? undefined);
		} else if ((event.key === "Enter" || event.key === " ") && row.hasChildren) toggle(row.key);
		else return;
		event.preventDefault();
	};
	const current = focusKey !== null && visible.some((row) => row.key === focusKey) ? focusKey : visible[0]?.key;
	return (
		<div role="tree" aria-label={label} className="flex flex-col">
			{visible.map((row, index) => (
				<FlowRunRow
					key={row.key}
					row={row}
					now={now}
					expanded={row.hasChildren ? !collapsed.has(row.key) : undefined}
					tabIndex={row.key === current ? 0 : -1}
					ref={(element) => {
						if (element) elements.current.set(row.key, element);
						else elements.current.delete(row.key);
					}}
					onToggle={() => toggle(row.key)}
					onKeyDown={(event) => keyDown(event, row, index)}
					onFocus={() => setFocusKey(row.key)}
					onDecide={() => onDecide(row.key)}
					onOpenTerminal={() => onOpenTerminal(row.key)}
				/>
			))}
		</div>
	);
}
