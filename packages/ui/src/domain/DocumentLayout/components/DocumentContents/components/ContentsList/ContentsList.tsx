import { type KeyboardEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ContentsHeading, DocumentContentsProps } from "../../DocumentContents";
import { ContentsRow } from "./components/ContentsRow";
import { useContentsRows } from "./useContentsRows";

type Props = Omit<DocumentContentsProps, "headings"> & { headings: readonly ContentsHeading[] };

export function ContentsList({ headings, activeId, onSelect }: Props) {
	const viewport = useRef<HTMLDivElement>(null);
	const buttons = useRef(new Map<string, HTMLButtonElement>());
	const pendingFocus = useRef<string | null>(null);
	const [focused, setFocused] = useState(headings[0]!.id);
	const instructions = useId();
	const positions = useMemo(() => new Map(headings.map((heading, index) => [heading.id, index])), [headings]);
	const cursor = positions.get(focused) ?? 0;
	const rows = useContentsRows(viewport, headings);
	const indexes = Array.from({ length: rows.end - rows.start }, (_, index) => index + rows.start);
	if (!indexes.includes(cursor)) indexes.push(cursor);
	indexes.sort((a, b) => a - b);
	useLayoutEffect(() => {
		if (pendingFocus.current === null) return;
		buttons.current.get(pendingFocus.current)!.focus({ preventScroll: true });
		pendingFocus.current = null;
	});
	const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const page = Math.max(1, Math.floor(viewport.current!.clientHeight / rows.minimum));
		const targets: Record<string, number> = {
			ArrowDown: index + 1,
			ArrowUp: index - 1,
			Home: 0,
			End: headings.length - 1,
			PageDown: Math.min(headings.length - 1, index + page),
			PageUp: Math.max(0, index - page),
			Tab: index + (event.shiftKey ? -1 : 1),
		};
		const next = targets[event.key];
		if (next === undefined || next < 0 || next >= headings.length) return;
		event.preventDefault();
		event.stopPropagation();
		pendingFocus.current = headings[next]!.id;
		setFocused(headings[next]!.id);
		rows.scrollToIndex(next);
	};
	return (
		<>
			<p id={instructions} className="sr-only">
				Use the arrow keys to move between headings. Home and End reach the first and last heading.
			</p>
			<div
				ref={viewport}
				className="min-h-0 overflow-y-auto overscroll-contain [--contents-row-steps:8] max-md:[--contents-row-steps:11] pointer-coarse:[--contents-row-steps:11]"
			>
				<ol className="relative" style={{ height: rows.offsets.at(-1) }}>
					{indexes.map((index) => {
						const heading = headings[index]!;
						return (
							<ContentsRow
								key={heading.id}
								heading={heading}
								top={rows.offsets[index]!}
								index={index}
								count={headings.length}
								active={activeId === heading.id}
								focused={cursor === index}
								instructions={instructions}
								buttonRef={(element) => {
									if (element) buttons.current.set(heading.id, element);
									else buttons.current.delete(heading.id);
								}}
								onMeasure={rows.measure}
								onSelect={() => onSelect(heading.id)}
								onFocus={() => setFocused(heading.id)}
								onKeyDown={(event) => moveFocus(event, index)}
							/>
						);
					})}
				</ol>
			</div>
		</>
	);
}
