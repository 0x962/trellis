import { type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlowRunRow } from "./components/FlowRunRow";
import type { FlowRunRow as Row } from "./types";
import { visibleRows } from "./visibleRows";

export type FlowRunTreeState = {
	collapsed: readonly string[];
	selectedKey: string | null;
	outputKeys: readonly string[];
	scrollTop: number;
	scrollLeft: number;
};

export type FlowRunTreeProps = {
	// The accessible name of the tree, such as the flow name.
	label: string;
	// Every row of the run in display order: a parent before its descendants.
	rows: readonly Row[];
	// The current time, for the live time cells.
	now: number;
	onDecide: (key: string) => void;
	onOpenTerminal: (key: string) => void;
	state?: FlowRunTreeState;
	onStateChange?: (state: FlowRunTreeState) => void;
	restoreFocus?: boolean;
};

// The steps of one flow run as a tree. A box row collapses its descendants.
// Arrow keys move between rows, Right opens a box or enters it, Left closes
// a box or returns to its parent, and Enter or Space toggles a box. A
// skipped box starts collapsed, because its steps never ran.
export function FlowRunTree({
	label,
	rows,
	now,
	onDecide,
	onOpenTerminal,
	state,
	onStateChange,
	restoreFocus = false,
}: FlowRunTreeProps) {
	const [localState, setLocalState] = useState<FlowRunTreeState>(() => ({
		collapsed: rows.filter((row) => row.hasChildren && row.state === "skipped").map((row) => row.key),
		selectedKey: null,
		outputKeys: [],
		scrollTop: 0,
		scrollLeft: 0,
	}));
	const view = state ?? localState;
	const currentView = useRef(view);
	currentView.current = view;
	const initialView = useRef(view);
	const initialFocus = useRef(restoreFocus);
	const viewport = useRef<HTMLDivElement>(null);
	const collapsed = useMemo(() => new Set(view.collapsed), [view.collapsed]);
	const outputKeys = useMemo(() => new Set(view.outputKeys), [view.outputKeys]);
	const focusKey = view.selectedKey;
	const update = (change: Partial<FlowRunTreeState>) => {
		const next = { ...currentView.current, ...change };
		currentView.current = next;
		setLocalState(next);
		onStateChange?.(next);
	};
	const elements = useRef(new Map<string, HTMLDivElement>());
	const visible = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
	useLayoutEffect(() => {
		const element = viewport.current!;
		element.scrollTop = initialView.current.scrollTop;
		element.scrollLeft = initialView.current.scrollLeft;
		if (initialFocus.current && initialView.current.selectedKey !== null)
			elements.current.get(initialView.current.selectedKey)?.focus({ preventScroll: true });
	}, []);
	const toggle = (key: string) => {
		const next = new Set(collapsed);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		update({ collapsed: [...next] });
	};
	const focus = (key: string | undefined) => {
		if (key === undefined) return;
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
		<div
			ref={viewport}
			role="tree"
			aria-label={label}
			className="flex max-h-160 flex-col overflow-auto overscroll-contain"
			onScroll={(event) =>
				update({ scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft })
			}
		>
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
					onFocus={() => update({ selectedKey: row.key })}
					selected={row.key === focusKey}
					outputExpanded={outputKeys.has(row.key)}
					onOutputToggle={(expanded) => {
						if (expanded === outputKeys.has(row.key)) return;
						update({
							outputKeys: expanded ? [...view.outputKeys, row.key] : view.outputKeys.filter((key) => key !== row.key),
						});
					}}
					onDecide={() => onDecide(row.key)}
					onOpenTerminal={() => onOpenTerminal(row.key)}
				/>
			))}
		</div>
	);
}
