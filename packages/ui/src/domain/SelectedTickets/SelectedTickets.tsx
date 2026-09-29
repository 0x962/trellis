import { X } from "@phosphor-icons/react";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualRows } from "../../hooks/useVirtualRows";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { FailureState } from "../FailureState";
import { type StatusCategory, StatusIcon } from "../StatusIcon";
import { TicketId } from "../TicketId";

export type SelectedTicket = {
	identifier: string;
	title: string;
	status: StatusCategory;
};

export type SelectedTicketsProps = {
	items: readonly SelectedTicket[];
	onRemove: (ticket: SelectedTicket) => Promise<void>;
	pending: boolean;
	removing: string | null;
	loading: boolean;
	error: Error | null;
	retry: () => void;
};

const rowHeight = 44;

export const SelectedTickets = memo(function SelectedTickets({
	items,
	onRemove,
	pending,
	removing,
	loading,
	error,
	retry,
}: SelectedTicketsProps) {
	const viewport = useRef<HTMLElement>(null);
	const buttons = useRef(new Map<number, HTMLElement>());
	const focusTarget = useRef<number | null>(null);
	const instructions = useId();
	const [cursor, setCursor] = useState(0);
	const selected = Math.min(cursor, Math.max(0, items.length - 1));
	const sizes = useMemo(() => Array.from({ length: items.length }, () => rowHeight), [items.length]);
	const virtual = useVirtualRows(viewport, sizes, 2);
	const indexes = Array.from({ length: Math.max(0, virtual.end - virtual.start) }, (_, i) => virtual.start + i);
	// Keep the focused action mounted when a pointer scrolls to other rows.
	if (items.length && !indexes.includes(selected)) indexes.push(selected);
	indexes.sort((a, b) => a - b);
	useLayoutEffect(() => {
		if (focusTarget.current === null) return;
		buttons.current.get(focusTarget.current)!.focus({ preventScroll: true });
		focusTarget.current = null;
	});
	return (
		<section
			ref={viewport}
			aria-label="Current relationships"
			aria-busy={pending || loading}
			className="max-h-48 overflow-y-auto border-b border-border p-2"
		>
			<p id={instructions} className="sr-only">
				Use the arrow keys to move between relationships. Home and End reach the first and last relationship.
			</p>
			{loading && (
				<p role="status" className="text-sm text-fg-muted">
					Load relationships…
				</p>
			)}
			{error && (
				<FailureState
					title="The relationships did not load."
					detail={error.message}
					action={<Button onClick={retry}>Retry</Button>}
					variant="section"
				/>
			)}
			{!loading && !error && items.length === 0 && <EmptyState description="No relationships." />}
			<ul className="relative" style={{ height: items.length * rowHeight }}>
				{indexes.map((index) => {
					const ticket = items[index]!;
					return (
						<li
							key={ticket.identifier}
							aria-posinset={index + 1}
							aria-setsize={items.length}
							className="absolute flex w-full items-center gap-2"
							style={{ top: index * rowHeight, height: rowHeight }}
						>
							<StatusIcon category={ticket.status} />
							<div className="min-w-0 flex-1">
								<TicketId id={ticket.identifier} size="sm" />
								<p className="truncate text-sm text-fg-muted" title={ticket.title}>
									{ticket.title}
								</p>
							</div>
							<Tooltip content={`Remove ${ticket.identifier}`}>
								<IconButton
									ref={(element) => {
										if (element) buttons.current.set(index, element);
										else buttons.current.delete(index);
									}}
									label={`Remove ${ticket.identifier}`}
									aria-describedby={instructions}
									icon={<X />}
									tabIndex={selected === index ? 0 : -1}
									disabled={pending || loading || !!error}
									processing={removing === ticket.identifier}
									onFocus={() => setCursor(index)}
									onClick={() => void onRemove(ticket)}
									onKeyDown={(event) => {
										const page = Math.max(1, Math.floor(viewport.current!.clientHeight / rowHeight));
										const targets: Record<string, number> = {
											ArrowDown: index + 1,
											ArrowUp: index - 1,
											Home: 0,
											End: items.length - 1,
											PageDown: Math.min(items.length - 1, index + page),
											PageUp: Math.max(0, index - page),
											Tab: index + (event.shiftKey ? -1 : 1),
										};
										const next = targets[event.key];
										if (next === undefined || next < 0 || next >= items.length) return;
										event.preventDefault();
										event.stopPropagation();
										focusTarget.current = next;
										setCursor(next);
										virtual.scrollToIndex(next);
									}}
								/>
							</Tooltip>
						</li>
					);
				})}
			</ul>
		</section>
	);
});
