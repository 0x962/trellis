import { CaretDown, Check } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Input } from "../../../../primitives/Input";
import { Popover } from "../../../../primitives/Popover";
import { cx } from "../../../../utils/cx";
import type { PageTabItem } from "../../PageTabs";

type Props = { tabs: readonly PageTabItem[]; activeId: string; onSelect: (id: string) => void };
const rowHeight = 44;

export function TabPicker({ tabs, activeId, onSelect }: Props) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [cursor, setCursor] = useState(0);
	const [top, setTop] = useState(0);
	const input = useRef<HTMLInputElement>(null);
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
		const element = list.current;
		if (!element || !open) return;
		const y = selected * rowHeight;
		if (y < element.scrollTop) element.scrollTop = y;
		if (y + rowHeight > element.scrollTop + element.clientHeight)
			element.scrollTop = y + rowHeight - element.clientHeight;
		setTop(element.scrollTop);
	}, [selected, open]);
	const choose = (id: string) => {
		onSelect(id);
		setOpen(false);
	};
	return (
		<Popover
			label="All open tabs"
			align="end"
			open={open}
			initialFocus={input}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setSearch("");
					setCursor(
						Math.max(
							0,
							tabs.findIndex((tab) => tab.id === activeId),
						),
					);
					setTop(0);
				}
			}}
			triggerTooltip={`Search ${tabs.length} open tabs`}
			trigger={<IconButton label="Search open tabs" icon={<CaretDown />} className="max-sm:h-11 max-sm:min-w-11" />}
			className="w-80 max-w-[calc(100vw-16px)] p-2"
		>
			<Input
				ref={input}
				label="Search open tabs"
				hideLabel
				placeholder="Search open tabs…"
				value={search}
				role="combobox"
				aria-expanded={open}
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
		</Popover>
	);
}
