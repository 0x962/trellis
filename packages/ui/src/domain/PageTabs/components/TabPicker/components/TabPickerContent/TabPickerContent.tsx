import { Check } from "@phosphor-icons/react";
import { type RefObject, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "../../../../../../primitives/Input";
import { cx } from "../../../../../../utils/cx";
import type { PageTabItem } from "../../../../PageTabs";

type Props = {
	tabs: readonly PageTabItem[];
	activeId: string;
	onSelect: (id: string) => void;
	inputRef: RefObject<HTMLInputElement | null>;
};
const rowHeight = 44;
export function TabPickerContent({ tabs, activeId, onSelect: choose, inputRef }: Props) {
	const [search, setSearch] = useState("");
	const [cursor, setCursor] = useState(() =>
		Math.max(
			0,
			tabs.findIndex((tab) => tab.id === activeId),
		),
	);
	const [top, setTop] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	const listId = useId();
	const matches = useMemo(
		() => tabs.filter((tab) => tab.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
		[tabs, search],
	);
	const selected = Math.min(cursor, Math.max(0, matches.length - 1));
	const start = Math.max(0, Math.floor(top / rowHeight) - 2);
	const end = Math.min(matches.length, start + 12);
	const indexes = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
	if (matches.length && !indexes.includes(selected)) indexes.push(selected);
	useLayoutEffect(() => {
		const element = list.current!;
		const y = selected * rowHeight;
		if (y < element.scrollTop) element.scrollTop = y;
		if (y + rowHeight > element.scrollTop + element.clientHeight)
			element.scrollTop = y + rowHeight - element.clientHeight;
		setTop(element.scrollTop);
	}, [selected]);
	return (
		<>
			<Input
				ref={inputRef}
				label="Search open tabs"
				hideLabel
				placeholder="Search open tabs…"
				value={search}
				role="combobox"
				aria-expanded={true}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={matches.length ? `${listId}-${selected}` : undefined}
				onValueChange={(value) => {
					setSearch(value);
					setCursor(0);
					setTop(0);
					if (list.current) list.current.scrollTop = 0;
				}}
				onKeyDown={(event) => {
					const positions: Record<string, number> = {
						ArrowDown: Math.min(matches.length - 1, selected + 1),
						ArrowUp: Math.max(0, selected - 1),
						PageDown: Math.min(matches.length - 1, selected + 6),
						PageUp: Math.max(0, selected - 6),
					};
					const next =
						event.ctrlKey && event.key === "End"
							? matches.length - 1
							: event.ctrlKey && event.key === "Home"
								? 0
								: positions[event.key];
					if (next !== undefined) {
						event.preventDefault();
						setCursor(Math.max(0, next));
					}
					if (event.key === "Enter" && matches[selected]) {
						event.preventDefault();
						choose(matches[selected].id);
					}
				}}
			/>
			<div className="px-2 py-2 text-xs text-fg-muted tabular" role="status">
				{matches.length} of {tabs.length} tabs
			</div>
			<div
				ref={list}
				id={listId}
				role="listbox"
				aria-label="Open tabs"
				className="max-h-66 overflow-y-auto overscroll-contain"
				onScroll={(event) => setTop(event.currentTarget.scrollTop)}
			>
				<div className="relative" style={{ height: matches.length * rowHeight }}>
					{indexes.map((index) => {
						const tab = matches[index]!;
						return (
							<div
								key={tab.id}
								role="option"
								tabIndex={-1}
								onKeyDown={(event) => {
									if (event.key === "Enter") choose(tab.id);
								}}
								id={`${listId}-${index}`}
								aria-selected={selected === index}
								aria-posinset={index + 1}
								aria-setsize={matches.length}
								className={cx(
									"absolute left-0 flex h-11 w-full cursor-default items-center gap-2 rounded-sm px-2 text-sm",
									selected === index && "bg-bg",
								)}
								style={{ top: index * rowHeight }}
								onPointerMove={() => setCursor(index)}
								onClick={() => choose(tab.id)}
								onMouseDown={(event) => event.preventDefault()}
							>
								<span className="min-w-0 flex-1 truncate" title={tab.title}>
									{tab.title}
								</span>
								{tab.id === activeId && <Check aria-label="Current tab" className="size-3.5 shrink-0 text-accent" />}
							</div>
						);
					})}
				</div>
			</div>
			{matches.length === 0 && <p className="px-2 py-4 text-sm text-fg-muted">No tabs match.</p>}
		</>
	);
}
